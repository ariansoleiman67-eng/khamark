import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildLineProduct, linePriceSignature, isSellable } from '../utils/cartLinePricing';
import { supabase, uniqueChannel } from './supabase';
import { Cart, CartItem, Product } from '../types';
import ProductService from './productService';
import { LocalCartService } from './localCartService';

export class CartService {
  /**
   * Helper function to remove undefined values from objects before saving to Postgres JSONB
   */
  private static sanitizeCartForDB(cart: any): any {
    return JSON.parse(JSON.stringify(cart, (_key, value) => {
      return value === undefined ? null : value;
    }));
  }

  /**
   * Get user's cart
   */
  static async getCart(userId: string): Promise<Cart | null> {
    try {
      const cachedCart = await this.getCachedCart(userId);
      if (cachedCart) return cachedCart;

      try {
        const { data, error } = await supabase.from('carts').select('*').eq('id', userId).single();

        if (data && !error) {
          const cart: Cart = {
            userId: data.id,
            items: data.items || [],
            subtotalUSD: data.subtotal_usd || 0,
            updatedAt: data.updated_at,
          };
          await this.setCachedCart(userId, cart);
          return cart;
        }

        // Distinguish a genuine "no rows" result (PostgREST code PGRST116),
        // which means the cart truly doesn't exist yet, from a transient
        // network/DB error. A transient failure must NOT be fabricated into an
        // empty cart and cached for 5 minutes, otherwise the user's real cart
        // appears empty until the cache expires.
        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        // Create empty cart if doesn't exist
        const newCart: Cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date().toISOString() as any,
        };

        await supabase.from('carts').insert([{
          id: userId,
          items: [],
          subtotal_usd: 0,
          updated_at: new Date().toISOString()
        }]);

        await this.setCachedCart(userId, newCart);
        return newCart;
      } catch (dbError) {
        // Transient DB/network failure: return a local empty cart but do NOT
        // cache it, so a recovered connection isn't blocked by a fabricated
        // empty cart poisoning the 5-minute cache.
        const localCart: Cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };
        return localCart;
      }
    } catch (error: any) {
      throw new Error('Unable to load cart. Please try again.');
    }
  }

  static async saveCart(cart: Cart): Promise<void> {
    await supabase.from('carts').upsert({
      id: cart.userId,
      items: this.sanitizeCartForDB(cart.items),
      subtotal_usd: cart.subtotalUSD,
      updated_at: cart.updatedAt || new Date().toISOString()
    });
  }

  /**
   * Add item to cart
   */
  static async addToCart(
    userId: string,
    productId: string,
    quantity: number = 1,
    productData?: Product
  ): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) throw new Error('Cart not found');

      let product: Product;
      if (productData) {
        product = productData;
      } else {
        const fetchedProduct = await ProductService.getProduct(productId);
        if (!fetchedProduct) throw new Error('Product not found');
        product = fetchedProduct;
      }

      if (product.stockQty < quantity) {
        throw new Error(`Only ${product.stockQty} items available in stock`);
      }

      // ALIBABA: Enforce single-tenant cart
      if (cart.items.length > 0) {
        const existingTenantId = cart.items[0].product.tenantId;
        if (existingTenantId && product.tenantId && existingTenantId !== product.tenantId) {
          throw new Error('DIFFERENT_TENANT');
        }
      }

      const existingItemIndex = cart.items.findIndex(item => item.productId === productId);

      if (existingItemIndex >= 0) {
        const existingItem = cart.items[existingItemIndex];
        const newQuantity = existingItem.quantity + quantity;

        if (newQuantity > product.stockQty) {
          throw new Error(`Cannot add more than ${product.stockQty} items`);
        }

        cart.items[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
        };
      } else {
        const newItem: CartItem = {
          productId,
          product,
          quantity,
          addedAt: new Date().toISOString() as any,
        };
        cart.items.push(newItem);
      }

      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date().toISOString() as any;

      try {
        await this.saveCart(cart);
      } catch (e) {}

      await this.setCachedCart(userId, cart);
      return cart;
    } catch (error: any) {
      throw new Error('Failed to add item to cart. Please try again.');
    }
  }

  /**
   * Update item quantity in cart
   */
  static async updateQuantity(
    userId: string,
    productId: string,
    quantity: number
  ): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) throw new Error('Cart not found');

      const itemIndex = cart.items.findIndex(item => item.productId === productId);
      if (itemIndex < 0) throw new Error('Item not found in cart');

      if (quantity <= 0) {
        return await this.removeFromCart(userId, productId);
      }

      const product = cart.items[itemIndex].product;
      if (quantity > product.stockQty) {
        throw new Error(`Only ${product.stockQty} items available in stock`);
      }

      cart.items[itemIndex].quantity = quantity;
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date().toISOString() as any;

      try {
        await this.saveCart(cart);
      } catch (e) {}

      await this.setCachedCart(userId, cart);
      return cart;
    } catch (error: any) {
      throw new Error('Failed to update cart. Please try again.');
    }
  }

  /**
   * Remove item from cart
   */
  static async removeFromCart(userId: string, productId: string): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) throw new Error('Cart not found');

      cart.items = cart.items.filter(item => item.productId !== productId);
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date().toISOString() as any;

      try {
        await this.saveCart(cart);
      } catch (e) {}

      await this.setCachedCart(userId, cart);
      return cart;
    } catch (error: any) {
      throw new Error('Failed to remove item from cart. Please try again.');
    }
  }

  /**
   * Clear entire cart
   */
  static async clearCart(userId: string): Promise<void> {
    try {
      const emptyCart: Cart = {
        userId,
        items: [],
        subtotalUSD: 0,
        updatedAt: new Date().toISOString() as any,
      };

      await this.saveCart(emptyCart);
      await this.setCachedCart(userId, emptyCart);
    } catch (error: any) {
      throw new Error('Error clearing cart');
    }
  }

  /**
   * Listen to real-time cart updates
   */
  static subscribeToCart(userId: string, callback: (cart: Cart | null) => void) {
    try {
      const channel = uniqueChannel(`public:carts:${userId}`);
      
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts', filter: `id=eq.${userId}` },
        (payload: any) => {
          if (payload.new) {
            const data = payload.new;
            const cart: Cart = {
              userId: data.id,
              items: data.items || [],
              subtotalUSD: data.subtotal_usd || 0,
              updatedAt: data.updated_at,
            };
            this.setCachedCart(userId, cart);
            callback(cart);
          } else {
            callback(null);
          }
        }
      ).subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error: any) {
      console.error('Error subscribing to cart:', error);
      return () => {};
    }
  }

  static calculateSubtotal(items: CartItem[], isVip: boolean = false): number {
    return items.reduce((total, item) => {
      const unitPrice = LocalCartService.getTieredPrice(item.product, item.quantity, isVip);
      return total + (unitPrice * item.quantity);
    }, 0);
  }

  static calculateShipping(subtotal: number, region: string = 'Erbil', cartItems?: CartItem[]): number {
    console.warn("DEPRECATED: cartService.calculateShipping called. Switch to calculateShippingAsync.");
    
    if (cartItems && cartItems.length > 0) {
      const normalizedCity = region.trim().toLowerCase();
      const uniqueProducts = new Map<string, CartItem>();
      for (const item of cartItems) {
        if (!uniqueProducts.has(item.productId)) {
          uniqueProducts.set(item.productId, item);
        }
      }
      
      return Array.from(uniqueProducts.values()).reduce((maxShipping, item) => {
        let itemShipping = 0;
        const cityRates = item.product.shippingRates;
        if (cityRates && cityRates.length > 0) {
          let cityRate = cityRates.find(rate => {
            const rateCity = (rate?.city ?? '').trim().toLowerCase();
            return !!rateCity && rateCity === normalizedCity;
          });
          if (!cityRate && normalizedCity.length >= 3) {
            cityRate = cityRates.find(rate => {
              const rateCity = (rate?.city ?? '').trim().toLowerCase();
              return !!rateCity && (normalizedCity.includes(rateCity) || rateCity.includes(normalizedCity));
            });
          }
          if (!cityRate && normalizedCity.length >= 4) {
            const cityStart = normalizedCity.slice(0, 4);
            cityRate = cityRates.find(rate => {
              const rateCity = (rate?.city ?? '').trim().toLowerCase();
              return !!rateCity && (rateCity.startsWith(cityStart) || cityStart.startsWith(rateCity.slice(0, 4)));
            });
          }
          
          if (cityRate) itemShipping = cityRate.price;
          else itemShipping = item.product.shippingCost || 0;
        } else {
          itemShipping = item.product.shippingCost || 0;
        }
        
        return Math.max(maxShipping, itemShipping);
      }, 0);
    }
    return 0;
  }

  static async calculateShippingAsync(
    subtotal: number, 
    region: string = 'Erbil', 
    cartItems?: CartItem[],
    country: string = ''
  ): Promise<number> {
    let productShippingCosts = 0;
    
    if (cartItems && cartItems.length > 0) {
      const normalizedCity = region.trim().toLowerCase();
      const normalizedCountry = country.trim().toLowerCase();
      
      const uniqueProducts = new Map<string, CartItem>();
      for (const item of cartItems) {
        if (!uniqueProducts.has(item.productId)) {
          uniqueProducts.set(item.productId, item);
        }
      }
      
      productShippingCosts = Array.from(uniqueProducts.values()).reduce((maxShipping, item) => {
        let itemShipping = 0;
        const cityRates = item.product.shippingRates;
        
        if (cityRates && cityRates.length > 0) {
          let matchedRate = cityRates.find(r => {
            const rateKey = (r?.city ?? '').trim().toLowerCase();
            return !!rateKey && rateKey === normalizedCity;
          });
          if (!matchedRate) {
             matchedRate = cityRates.find(rate => {
                const rateKey = (rate?.city ?? '').trim().toLowerCase();
                return !!rateKey && (normalizedCity.length >= 3) && (normalizedCity.includes(rateKey) || rateKey.includes(normalizedCity));
             });
          }
          if (matchedRate) {
            itemShipping = matchedRate.price;
          } else {
            matchedRate = cityRates.find(r => {
               const rateKey = (r?.city ?? '').trim().toLowerCase();
               return !!rateKey && !!normalizedCountry && (rateKey === normalizedCountry || (normalizedCountry.length >= 3 && (normalizedCountry.includes(rateKey) || rateKey.includes(normalizedCountry))));
            });
            if (matchedRate) {
              itemShipping = matchedRate.price;
            } else {
              itemShipping = item.product.shippingCost || 0;
            }
          }
        } else {
          itemShipping = item.product.shippingCost || 0;
        }
        return Math.max(maxShipping, itemShipping);
      }, 0);
    }
    return productShippingCosts;
  }

  static calculateTax(_subtotal: number): number {
    return 0;
  }

  static calculateTotal(subtotal: number, shipping: number = 0, tax: number = 0): number {
    return subtotal + shipping + tax;
  }

  static async validateCart(cart: Cart): Promise<{
    valid: boolean;
    errors: string[];
    updatedCart?: Cart;
    /**
     * True when a product's price moved on the server since the cart was built.
     * Kept separate from `errors` because a reprice must not read as a broken
     * cart — but the caller MUST NOT charge silently on it: the total on screen
     * was computed from the old prices, so placing the order without telling the
     * shopper charges them a number they were never shown.
     */
    pricesChanged?: boolean;
  }> {
    try {
      const errors: string[] = [];
      let pricesChanged = false;
      const updatedCart = { ...cart, items: [...cart.items] };
      let hasUpdates = false;

      const uniqueProductIds = Array.from(new Set(updatedCart.items.map(item => item.productId)));
      const productsMap = new Map<string, any>();
      
      // Products we could not reach at all, as distinct from products that were
      // fetched and came back absent. getProduct returns null only for a genuine
      // PGRST116 not-found and rethrows network errors, so collapsing both into
      // "missing" (which the bare catch below used to do) turns a flaky connection
      // into "this product is no longer available" — and the item is then spliced
      // out and that truncation is persisted.
      const unreachable = new Set<string>();

      await Promise.all(
        uniqueProductIds.map(async (pId) => {
          try {
            const prod = await ProductService.getProduct(pId);
            if (prod) productsMap.set(pId, prod);
          } catch (e) {
            unreachable.add(pId);
            console.warn('validateCart: product fetch failed, leaving item untouched', pId, e);
          }
        })
      );

      for (let i = 0; i < updatedCart.items.length; i++) {
        const item = updatedCart.items[i];
        if (!item) continue;

        // Could not verify this one — leave it exactly as the user had it rather
        // than deleting it on the strength of a failed request.
        if (unreachable.has(item.productId)) continue;

        const latestProduct = productsMap.get(item.productId);

        if (!latestProduct || !latestProduct.isActive) {
          errors.push(`Product ${item.product.name} is no longer available`);
          updatedCart.items.splice(i, 1);
          hasUpdates = true;
          i--;
          continue;
        }

        // variations / colorVariations are JSONB, so stockQuantity is whatever the
        // writer stored — the website can send a string, or omit the key entirely.
        // Returns null for "unknown", which must never be treated as zero.
        const toStock = (v: any): number | null => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        let availableStock = toStock(latestProduct.stockQty);

        const itemSize = item.selectedOptions?.size?.trim().toLowerCase();
        const itemColor = item.selectedOptions?.color?.trim().toLowerCase();
        
        let variationFound = false;

        if (item.variationId) {
          const sizeVar = latestProduct.variations?.find((v: any) => v.variationId === item.variationId);
          const colorVar = latestProduct.colorVariations?.find((v: any) => v.variationId === item.variationId);
          
          if (sizeVar) {
             availableStock = toStock(sizeVar.stockQuantity);
             variationFound = true;
          } else if (colorVar) {
             availableStock = toStock(colorVar.stockQuantity);
             variationFound = true;
          }
        }

        if (!variationFound && itemSize) {
          const v = latestProduct.variations?.find((v: any) => v.sizeValue?.trim().toLowerCase() === itemSize);
          if (v) {
             availableStock = toStock(v.stockQuantity);
             variationFound = true;
          }
        }

        if (!variationFound && itemColor) {
          const v = latestProduct.colorVariations?.find((v: any) => v.colorValue?.trim().toLowerCase() === itemColor);
          if (v) {
             availableStock = toStock(v.stockQuantity);
             variationFound = true;
          }
        }

        // `availableStock === null` means we could not determine the stock level, which
        // is NOT the same as zero — never remove or clamp on it.
        //
        // Before the coercion above this comparison ran on the raw JSONB value, and it
        // failed three different ways. `undefined < quantity` is false, so the whole
        // block was skipped and the order went through for more units than exist — a
        // silent oversell, the NaN-fails-every-comparison hole. `null <= 0` is true, so
        // unknown stock deleted the item as "out of stock". And a string "3" clamped
        // quantity to the string itself, after which getCartItemCount's `0 + "3"`
        // produced "03" in the checkout summary.
        if (availableStock !== null && availableStock < item.quantity) {
          if (!(availableStock > 0)) {
            errors.push(`Product ${latestProduct.name} is out of stock`);
            updatedCart.items.splice(i, 1);
            hasUpdates = true;
            i--;
          } else {
            errors.push(`Only ${availableStock} units of ${latestProduct.name} available. Quantity updated.`);
            updatedCart.items[i].quantity = availableStock;
            hasUpdates = true;
          }
        }

        // Re-price this line with the SAME function the add path uses
        // (src/utils/cartLinePricing.ts). This used to be its own copy that only
        // knew `variation.priceUSD`. Most options here are priced in dinar only,
        // so it fell back to the BASE product and rewrote the line from it — the
        // A37 12GB/256GB added at IQD 740,000 was charged the base 549,000.
        //
        // The option is resolved by id first, then by the size or colour text for
        // lines written before variationId existed, exactly as before.
        let resolvedVariationId: string | null = item.variationId || null;
        if (!resolvedVariationId && itemSize) {
          resolvedVariationId =
            latestProduct.variations?.find((v: any) => v.sizeValue?.trim().toLowerCase() === itemSize)
              ?.variationId ?? null;
        }
        if (!resolvedVariationId && itemColor) {
          resolvedVariationId =
            latestProduct.colorVariations?.find((v: any) => v.colorValue?.trim().toLowerCase() === itemColor)
              ?.variationId ?? null;
        }

        const freshLine = buildLineProduct(latestProduct, {
          variationId: resolvedVariationId,
          colorVariationId: (item as any).colorVariationId ?? null,
        });

        // Reject a line with no positive price in EITHER currency. The old check
        // looked at dollars only, so a dinar-only option could have been refused
        // as "not available for purchase" for want of a dollar figure it never
        // needed.
        if (!isSellable(freshLine)) {
          errors.push(`Product ${latestProduct.name} is not available for purchase`);
          updatedCart.items.splice(i, 1);
          hasUpdates = true;
          i--;
          continue;
        }

        // Compare what the shopper would actually be CHARGED, not the dollar
        // column. On a dinar line the dollar figure is derived and drifts, and
        // comparing it raised "prices updated" for lines whose price had not
        // moved at all.
        const priceChanged = linePriceSignature(item.product) !== linePriceSignature(freshLine);
        const metaChanged = item.product.updatedAt !== latestProduct.updatedAt;

        if (priceChanged) pricesChanged = true;

        // Refreshing on a metadata change is still right — names, photos and
        // stock move — but the refresh now carries the OPTION's price. Before,
        // it spread the base product over the line on every admin save, which
        // is how a timestamp change alone could re-price a phone.
        if (priceChanged || metaChanged) {
          if (updatedCart.items[i]) {
            updatedCart.items[i].product = {
              ...freshLine,
              basePriceUSD: latestProduct.priceUSD,
            } as any;
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        updatedCart.subtotalUSD = this.calculateSubtotal(updatedCart.items);
        updatedCart.updatedAt = new Date().toISOString() as any;
        await this.saveCart(updatedCart);
        await this.setCachedCart(cart.userId, updatedCart);
      }

      return {
        valid: errors.length === 0,
        errors,
        updatedCart: hasUpdates ? updatedCart : undefined,
        pricesChanged,
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: ['Unable to validate cart. Please try again.'],
      };
    }
  }

  static getCartItemCount(cart: Cart | null): number {
    if (!cart) return 0;
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  }

  static isProductInCart(cart: Cart | null, productId: string): boolean {
    if (!cart) return false;
    return cart.items.some(item => item.productId === productId);
  }

  static getProductQuantityInCart(cart: Cart | null, productId: string): number {
    if (!cart) return 0;
    const item = cart.items.find(item => item.productId === productId);
    return item ? item.quantity : 0;
  }

  private static async getCachedCart(userId: string): Promise<Cart | null> {
    try {
      const cached = await AsyncStorage.getItem(`cart_${userId}`);
      if (cached) {
        const cartData = JSON.parse(cached);
        if (Date.now() - cartData.timestamp < 5 * 60 * 1000) {
          return cartData.cart;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private static async setCachedCart(userId: string, cart: Cart): Promise<void> {
    try {
      const cacheData = { cart, timestamp: Date.now() };
      await AsyncStorage.setItem(`cart_${userId}`, JSON.stringify(cacheData));
    } catch (error) {}
  }

  static async clearCartCache(userId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`cart_${userId}`);
    } catch (error) {}
  }

  static async mergeLocalCart(userId: string, localItems: CartItem[]): Promise<Cart> {
    try {
      const remoteCart = await this.getCart(userId);
      if (!remoteCart) throw new Error('Remote cart not found');

      const mergedItems = [...remoteCart.items];

      for (const localItem of localItems) {
        const existingIndex = mergedItems.findIndex(item => item.productId === localItem.productId);
        if (existingIndex >= 0) {
          mergedItems[existingIndex].quantity = Math.max(mergedItems[existingIndex].quantity, localItem.quantity);
        } else {
          mergedItems.push(localItem);
        }
      }

      const updatedCart: Cart = {
        userId,
        items: mergedItems,
        subtotalUSD: this.calculateSubtotal(mergedItems),
        updatedAt: new Date().toISOString() as any,
      };

      await this.saveCart(updatedCart);
      await this.setCachedCart(userId, updatedCart);

      return updatedCart;
    } catch (error: any) {
      throw new Error('Error merging local cart');
    }
  }

  static async syncCartWithLatestData(userId: string): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) throw new Error('Cart not found');

      let hasUpdates = false;
      const updatedItems: CartItem[] = [];

      const uniqueProductIds = Array.from(new Set(cart.items.map(item => item.productId)));
      const productsMap = new Map<string, any>();
      
      await Promise.all(
        uniqueProductIds.map(async (pId) => {
          try {
            const prod = await ProductService.getProduct(pId);
            if (prod) productsMap.set(pId, prod);
          } catch (e) {}
        })
      );

      for (const item of cart.items) {
        const latestProduct = productsMap.get(item.productId);
        if (!latestProduct || !latestProduct.isActive) {
          hasUpdates = true;
          continue;
        }

        // Unknown/invalid stock (null/undefined column) must not silently
        // shrink the quantity to 0 and drop the item. Only a real number <= 0
        // should remove it.
        const latestStock = Number.isFinite(latestProduct.stockQty)
          ? latestProduct.stockQty
          : item.quantity;

        const updatedItem: CartItem = {
          ...item,
          product: latestProduct,
          quantity: Math.min(item.quantity, latestStock),
        };

        const productDataChanged = 
          item.product.priceUSD !== latestProduct.priceUSD ||
          item.product.shippingCost !== latestProduct.shippingCost ||
          JSON.stringify(item.product.shippingRates) !== JSON.stringify(latestProduct.shippingRates) ||
          item.product.updatedAt !== latestProduct.updatedAt;

        if (updatedItem.quantity !== item.quantity || productDataChanged) {
          hasUpdates = true;
        }

        if (updatedItem.quantity > 0) {
          updatedItems.push(updatedItem);
        } else {
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        const updatedCart: Cart = {
          userId,
          items: updatedItems,
          subtotalUSD: this.calculateSubtotal(updatedItems),
          updatedAt: new Date().toISOString() as any,
        };

        await this.saveCart(updatedCart);
        await this.setCachedCart(userId, updatedCart);

        return updatedCart;
      }
      return cart;
    } catch (error: any) {
      throw new Error('Error syncing cart');
    }
  }

  static getCartSummary(cart: Cart, shippingRegion: string = 'Erbil', isVip: boolean = false) {
    console.warn("DEPRECATED: cartService.getCartSummary called. Switch to getCartSummaryAsync.");
    const subtotal = LocalCartService.calculateSubtotal(cart.items, isVip);
    const shipping = this.calculateShipping(subtotal, shippingRegion, cart.items);
    const tax = this.calculateTax(subtotal);
    const total = this.calculateTotal(subtotal, shipping, tax);

    return {
      subtotal,
      shipping,
      tax,
      total,
      itemCount: this.getCartItemCount(cart),
      freeShippingThreshold: 500,
      remainingForFreeShipping: Math.max(0, 500 - subtotal),
    };
  }

  static async getCartSummaryAsync(
    cart: Cart, 
    shippingRegion: string = 'Erbil',
    shippingCountry: string = '',
    isVip: boolean = false
  ) {
    const subtotal = LocalCartService.calculateSubtotal(cart.items, isVip);
    const shipping = await this.calculateShippingAsync(subtotal, shippingRegion, cart.items, shippingCountry);
    const tax = this.calculateTax(subtotal);
    const total = this.calculateTotal(subtotal, shipping, tax);
    const freeShippingThreshold = 9999999;

    return {
      subtotal,
      shipping,
      tax,
      total,
      itemCount: this.getCartItemCount(cart),
      freeShippingThreshold,
      remainingForFreeShipping: Math.max(0, freeShippingThreshold - subtotal),
    };
  }
}

export default CartService;
