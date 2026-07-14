import AsyncStorage from '@react-native-async-storage/async-storage';
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
        // Create a local cart if DB fails
        const localCart: Cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };
        await this.setCachedCart(userId, localCart);
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
          let cityRate = cityRates.find(rate => rate.city.trim().toLowerCase() === normalizedCity);
          if (!cityRate && normalizedCity.length >= 3) {
            cityRate = cityRates.find(rate => {
              const rateCity = rate.city.trim().toLowerCase();
              return normalizedCity.includes(rateCity) || rateCity.includes(normalizedCity);
            });
          }
          if (!cityRate && normalizedCity.length >= 4) {
            const cityStart = normalizedCity.slice(0, 4);
            cityRate = cityRates.find(rate => {
              const rateCity = rate.city.trim().toLowerCase();
              return rateCity.startsWith(cityStart) || cityStart.startsWith(rateCity.slice(0, 4));
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
          let matchedRate = cityRates.find(r => r.city.trim().toLowerCase() === normalizedCity);
          if (!matchedRate) {
             matchedRate = cityRates.find(rate => {
                const rateKey = rate.city.trim().toLowerCase();
                return (normalizedCity.length >= 3) && (normalizedCity.includes(rateKey) || rateKey.includes(normalizedCity));
             });
          }
          if (matchedRate) {
            itemShipping = matchedRate.price;
          } else {
            matchedRate = cityRates.find(r => {
               const rateKey = r.city.trim().toLowerCase();
               return normalizedCountry && (rateKey === normalizedCountry || (normalizedCountry.length >= 3 && (normalizedCountry.includes(rateKey) || rateKey.includes(normalizedCountry))));
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
  }> {
    try {
      const errors: string[] = [];
      const updatedCart = { ...cart, items: [...cart.items] };
      let hasUpdates = false;

      const uniqueProductIds = Array.from(new Set(updatedCart.items.map(item => item.productId)));
      const productsMap = new Map<string, any>();
      
      await Promise.all(
        uniqueProductIds.map(async (pId) => {
          try {
            const prod = await ProductService.getProduct(pId);
            if (prod) productsMap.set(pId, prod);
          } catch (e) {}
        })
      );

      for (let i = 0; i < updatedCart.items.length; i++) {
        const item = updatedCart.items[i];
        if (!item) continue;

        const latestProduct = productsMap.get(item.productId);
        
        if (!latestProduct || !latestProduct.isActive) {
          errors.push(`Product ${item.product.name} is no longer available`);
          updatedCart.items.splice(i, 1);
          hasUpdates = true;
          i--;
          continue;
        }

        let availableStock = latestProduct.stockQty;
        
        const itemSize = item.selectedOptions?.size?.trim().toLowerCase();
        const itemColor = item.selectedOptions?.color?.trim().toLowerCase();
        
        let variationFound = false;

        if (item.variationId) {
          const sizeVar = latestProduct.variations?.find((v: any) => v.variationId === item.variationId);
          const colorVar = latestProduct.colorVariations?.find((v: any) => v.variationId === item.variationId);
          
          if (sizeVar) {
             availableStock = sizeVar.stockQuantity;
             variationFound = true;
          } else if (colorVar) {
             availableStock = colorVar.stockQuantity;
             variationFound = true;
          }
        }

        if (!variationFound && itemSize) {
          const v = latestProduct.variations?.find((v: any) => v.sizeValue?.trim().toLowerCase() === itemSize);
          if (v) {
             availableStock = v.stockQuantity;
             variationFound = true;
          }
        }

        if (!variationFound && itemColor) {
          const v = latestProduct.colorVariations?.find((v: any) => v.colorValue?.trim().toLowerCase() === itemColor);
          if (v) {
             availableStock = v.stockQuantity;
             variationFound = true;
          }
        }

        if (availableStock < item.quantity) {
          if (availableStock <= 0) {
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

        let correctPrice = latestProduct.priceUSD;
        let linkedVariation: any = null;
        
        if (item.variationId) {
           linkedVariation = latestProduct.variations?.find((v: any) => v.variationId === item.variationId) || 
                             latestProduct.colorVariations?.find((v: any) => v.variationId === item.variationId);
        }
        
        if (!linkedVariation && itemSize) {
           linkedVariation = latestProduct.variations?.find((v: any) => v.sizeValue?.trim().toLowerCase() === itemSize);
        } 
        
        if (!linkedVariation && itemColor) {
           linkedVariation = latestProduct.colorVariations?.find((v: any) => v.colorValue?.trim().toLowerCase() === itemColor);
        }
        
        if (linkedVariation && linkedVariation.priceUSD) {
           correctPrice = linkedVariation.priceUSD;
        }

        // Reject items whose (possibly updated) price is $0 / invalid — no buying for $0.
        if (!(correctPrice > 0)) {
          errors.push(`Product ${latestProduct.name} is not available for purchase`);
          updatedCart.items.splice(i, 1);
          hasUpdates = true;
          i--;
          continue;
        }

        const priceChanged = item.product.priceUSD !== correctPrice;
        const metaChanged = item.product.updatedAt !== latestProduct.updatedAt;
        
        if (priceChanged || metaChanged) {
           if (updatedCart.items[i]) {
              updatedCart.items[i].product = {
                ...latestProduct,
                priceUSD: correctPrice,
                basePriceUSD: latestProduct.priceUSD
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

        const updatedItem: CartItem = {
          ...item,
          product: latestProduct,
          quantity: Math.min(item.quantity, latestProduct.stockQty),
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
