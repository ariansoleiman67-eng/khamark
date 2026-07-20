/**
 * LOCAL CART SERVICE
 * Simple cart management using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Cart, CartItem, Product } from '../types';
import { calculateTieredPrice, getEffectiveUnitPrice } from '../utils/pricingUtils';

const CART_STORAGE_KEY = 'local_cart_';

export class LocalCartService {
  /** Coerce a JSONB-sourced stock value; anything unparseable counts as 0. */
  private static toFiniteStock(n: unknown): number {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  }

  /**
   * The real stock ceiling for a cart line.
   *
   * `product.stockQty` alone is the WRONG denominator: productService documents that
   * variation products keep stock_qty = 0 because the real stock lives per-variation.
   * Using it meant every variation product in the cart had a ceiling of 0, so any
   * quantity failed `quantity > maxStock` and the stepper threw
   * "Only 0 items available in stock" — CartScreen caught it and rolled the number
   * back, leaving the +/- buttons permanently dead on those lines while the screen's
   * own ceiling (which does resolve variation stock) happily showed them as enabled.
   *
   * ProductDetailsScreen and CartScreen already compute the ceiling correctly; this
   * service — the authority the writes actually go through — did not.
   */
  private static maxStockFor(product: any, variationId?: string): number {
    if (variationId) {
      const v =
        product?.variations?.find((x: any) => x?.variationId === variationId) ??
        product?.colorVariations?.find((x: any) => x?.variationId === variationId);
      if (v) return this.toFiniteStock(v.stockQuantity);
    }
    const sizeStock = (product?.variations ?? []).reduce(
      (sum: number, v: any) => sum + this.toFiniteStock(v?.stockQuantity), 0);
    const colorStock = (product?.colorVariations ?? []).reduce(
      (sum: number, v: any) => sum + this.toFiniteStock(v?.stockQuantity), 0);
    return this.toFiniteStock(product?.stockQty) + sizeStock + colorStock;
  }

  /**
   * Per-user serialization of cart writes.
   *
   * Every mutator is a read-modify-write cycle (getCart -> mutate -> saveCart)
   * on a single AsyncStorage key. Without serialization two concurrent calls
   * both read the same base cart and the last saveCart silently clobbers the
   * other's change (lost update). We chain each user's writes so they run
   * strictly one-at-a-time, in call order.
   */
  private static writeChains: Record<string, Promise<unknown>> = {};

  private static enqueue<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.writeChains[userId] ?? Promise.resolve())
      .catch(() => {})
      .then(task);
    this.writeChains[userId] = run;
    return run;
  }

  /**
   * Get cart from local storage
   */
  static async getCart(userId: string): Promise<Cart | null> {
    try {
      const cartJson = await AsyncStorage.getItem(CART_STORAGE_KEY + userId);
      if (cartJson) {
        return JSON.parse(cartJson);
      }
      
      // Create empty cart
      const newCart: Cart = {
        userId,
        items: [],
        subtotalUSD: 0,
        updatedAt: new Date() as any,
      };
      
      await this.saveCart(newCart);
      return newCart;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error getting local cart:', error);
      return null;
    }
  }

  /**
   * Save cart to local storage
   */
  static async saveCart(cart: Cart): Promise<void> {
    try {
      const cartJson = JSON.stringify(cart);
      await AsyncStorage.setItem(CART_STORAGE_KEY + cart.userId, cartJson);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving local cart:', error);
    }
  }

  /**
   * Add item to cart
   */
  static async addToCart(
    userId: string,
    productId: string,
    quantity: number = 1,
    product: Product,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    return this.enqueue(userId, () =>
      this.addToCartImpl(userId, productId, quantity, product, selectedOptions)
    );
  }

  private static async addToCartImpl(
    userId: string,
    productId: string,
    quantity: number = 1,
    product: Product,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    try {
      let cart = await this.getCart(userId);
      if (!cart) {
        cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };
      }

      // ALIBABA: Enforce single-tenant cart
      if (cart.items.length > 0) {
        const existingTenantId = cart.items[0].product.tenantId;
        if (existingTenantId && product.tenantId && existingTenantId !== product.tenantId) {
          throw new Error('DIFFERENT_TENANT');
        }
      }

      // Find existing item by productId AND selectedOptions (same product + same options = merge).
      // Uses the shared, normalized optionsMatch so add / update / remove all key items
      // the same way (case-insensitive, whitespace-trimmed).
      const existingItemIndex = cart.items.findIndex(item =>
        item.productId === productId && this.optionsMatch(item.selectedOptions, selectedOptions)
      );

      if (existingItemIndex >= 0) {
        // Update existing item (same product + same options)
        const existingItem = cart.items[existingItemIndex];
        const newQuantity = existingItem.quantity + quantity;
        
        const maxStock = this.maxStockFor(product, (existingItem as any).variationId);
        if (newQuantity > maxStock) {
          throw new Error(`Cannot add more than ${maxStock} items`);
        }

        cart.items[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
        };
      } else {
        // Add new item (new product OR same product with different options)
        //
        // This branch had no stock check at all, and selectedOptions colour/size do
        // NOT carry their own stock pool — only variations[]/colorVariations[] do,
        // and those go through addVariationsToCart. So two lines for the same product
        // with different selectedOptions both draw on the same pool: adding 5 of a
        // 5-stock product as "Red" and 5 more as "Blue" put 10 units in the cart and
        // the oversell carried through to checkout. Count what is already committed
        // against this product across every line before allowing more.
        const maxStock = this.maxStockFor(product);
        const alreadyInCart = cart.items
          .filter((i) => i.productId === productId && !(i as any).variationId)
          .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
        if (alreadyInCart + quantity > maxStock) {
          throw new Error(`Cannot add more than ${maxStock} items`);
        }

        const newItem: CartItem = {
          productId,
          product,
          quantity,
          addedAt: new Date() as any,
          selectedOptions,
        };
        cart.items.push(newItem);
      }

      // Recalculate subtotal
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date() as any;

      await this.saveCart(cart);
      return cart;
    } catch (error: any) {
      const errMessage = error?.message || error?.toString?.() || '';
      if (!errMessage.includes('DIFFERENT_TENANT')) {
        // eslint-disable-next-line no-console
        console.error('Error adding to local cart:', error);
      }
      throw error;
    }
  }

  /**
   * ALIBABA VARIATION: Batch add multiple variations to cart in ONE atomic operation
   * Used for products with per-size or per-color stock control
   */
  static async addVariationsToCart(
    userId: string,
    product: Product,
    selections: Array<{ variationId: string; quantity: number; priceUSD?: number; sizeValue?: number | string; sizeUnit?: string; colorValue?: string }>
  ): Promise<Cart> {
    return this.enqueue(userId, () =>
      this.addVariationsToCartImpl(userId, product, selections)
    );
  }

  private static async addVariationsToCartImpl(
    userId: string,
    product: Product,
    selections: Array<{ variationId: string; quantity: number; priceUSD?: number; sizeValue?: number | string; sizeUnit?: string; colorValue?: string }>
  ): Promise<Cart> {
    try {
      // Filter out selections with quantity 0
      const validSelections = selections.filter(s => s.quantity > 0);
      
      // If no valid selections, return current cart unchanged
      if (validSelections.length === 0) {
        const cart = await this.getCart(userId);
        return cart || {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };
      }

      let cart = await this.getCart(userId);
      if (!cart) {
        cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };
      }

      // ALIBABA: Enforce single-tenant cart
      if (cart.items.length > 0) {
        const existingTenantId = cart.items[0].product.tenantId;
        if (existingTenantId && product.tenantId && existingTenantId !== product.tenantId) {
          throw new Error('DIFFERENT_TENANT');
        }
      }

      // Validate stock for each selection before adding
      for (const selection of validSelections) {
        // Check variations (size) first, then colorVariations
        let variation = product.variations?.find(v => v.variationId === selection.variationId);
        if (!variation) {
          variation = product.colorVariations?.find(v => v.variationId === selection.variationId) as any;
        }

        if (!variation) {
          throw new Error(`Variation ${selection.variationId} not found`);
        }
        
        // Check existing quantity in cart
        const existingItem = cart.items.find(
          item => item.productId === product.id && item.variationId === selection.variationId
        );
        const existingQty = existingItem?.quantity || 0;
        const totalQty = existingQty + selection.quantity;
        
        if (totalQty > variation.stockQuantity) {
          const varName = selection.colorValue || `${selection.sizeValue} ${selection.sizeUnit || ''}`.trim();
          throw new Error(`Only ${variation.stockQuantity - existingQty} more "${varName}" available`);
        }
      }

      // Add/update each selection
      for (const selection of validSelections) {
        // Check variations (size) first, then colorVariations
        let variation = product.variations?.find(v => v.variationId === selection.variationId);
        if (!variation) {
          variation = product.colorVariations?.find(v => v.variationId === selection.variationId) as any;
        }

        const variationPrice = selection.priceUSD ?? variation?.priceUSD ?? product.priceUSD;
        
        // Find existing item by productId + variationId
        const existingItemIndex = cart.items.findIndex(
          item => item.productId === product.id && item.variationId === selection.variationId
        );

        if (existingItemIndex >= 0) {
          // Update existing item quantity
          cart.items[existingItemIndex].quantity += selection.quantity;
        } else {
          // Construct selectedOptions based on what's available
          const selectedOptions: { size?: string; color?: string } = {};
          if (selection.sizeValue) {
            selectedOptions.size = `${selection.sizeValue} ${selection.sizeUnit || ''}`.trim();
          }
          if (selection.colorValue) {
            selectedOptions.color = selection.colorValue;
          }

          // Add new cart item for this variation
          const newItem: CartItem = {
            productId: product.id,
            product: {
              ...product,
              priceUSD: variationPrice, // Use variation price for calculations
            },
            quantity: selection.quantity,
            addedAt: new Date() as any,
            selectedOptions,
            variationId: selection.variationId,
          };
          cart.items.push(newItem);
        }
      }

      // Recalculate subtotal
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date() as any;

      await this.saveCart(cart);
      return cart;
    } catch (error: any) {
      const errMessage = error?.message || error?.toString?.() || '';
      if (!errMessage.includes('DIFFERENT_TENANT')) {
        // eslint-disable-next-line no-console
        console.error('Error adding variations to cart:', error);
      }
      throw error;
    }
  }

  /**
   * Helper to compare selectedOptions
   */
  private static optionsMatch(
    a?: { color?: string; size?: string; storage?: string },
    b?: { color?: string; size?: string; storage?: string }
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    // Normalize (trim + lowercase) so 'Red' and 'red ' are treated as the same
    // option, matching how addToCart merges items. Keeps add / update / remove
    // consistent — otherwise an item merged case-insensitively can never be
    // matched (and therefore updated or removed) again.
    const norm = (s?: string) => s?.trim().toLowerCase();
    return (
      norm(a.color) === norm(b.color) &&
      norm(a.size) === norm(b.size) &&
      norm(a.storage) === norm(b.storage)
    );
  }

  /**
   * Update item quantity in cart
   */
  static async updateQuantity(
    userId: string,
    productId: string,
    quantity: number,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    return this.enqueue(userId, () =>
      this.updateQuantityImpl(userId, productId, quantity, selectedOptions)
    );
  }

  private static async updateQuantityImpl(
    userId: string,
    productId: string,
    quantity: number,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) {
        throw new Error('Cart not found');
      }

      // Find item by productId and selectedOptions
      const itemIndex = cart.items.findIndex(item => 
        item.productId === productId && this.optionsMatch(item.selectedOptions, selectedOptions)
      );

      if (itemIndex < 0) {
        throw new Error('Item not found in cart');
      }

      if (quantity <= 0) {
        // Remove item if quantity is 0 or negative. Call the impl directly (not
        // the public method) so we stay inside the current serialized write and
        // don't deadlock on this user's write chain.
        return await this.removeFromCartImpl(userId, productId, selectedOptions);
      }

      // Check stock limit
      const item = cart.items[itemIndex];
      const maxStock = this.maxStockFor(item.product, (item as any).variationId);
      if (quantity > maxStock) {
        throw new Error(`Only ${maxStock} items available in stock`);
      }

      // Update quantity
      cart.items[itemIndex].quantity = quantity;

      // Recalculate subtotal
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date() as any;

      await this.saveCart(cart);
      return cart;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error updating local cart quantity:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  static async removeFromCart(
    userId: string,
    productId: string,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    return this.enqueue(userId, () =>
      this.removeFromCartImpl(userId, productId, selectedOptions)
    );
  }

  private static async removeFromCartImpl(
    userId: string,
    productId: string,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ): Promise<Cart> {
    try {
      const cart = await this.getCart(userId);
      if (!cart) {
        throw new Error('Cart not found');
      }

      // Remove by productId AND selectedOptions
      cart.items = cart.items.filter(item => 
        !(item.productId === productId && this.optionsMatch(item.selectedOptions, selectedOptions))
      );

      // Recalculate subtotal
      cart.subtotalUSD = this.calculateSubtotal(cart.items);
      cart.updatedAt = new Date() as any;

      await this.saveCart(cart);
      return cart;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error removing from local cart:', error);
      throw error;
    }
  }

  /**
   * Clear entire cart
   */
  static async clearCart(userId: string): Promise<void> {
    // Serialize with the other mutators so a clear can't race with an in-flight
    // add (e.g. the "Different Store" clear-then-add flow) and lose an update.
    return this.enqueue(userId, async () => {
      try {
        const emptyCart: Cart = {
          userId,
          items: [],
          subtotalUSD: 0,
          updatedAt: new Date() as any,
        };

        await this.saveCart(emptyCart);
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Error clearing local cart:', error);
        throw error;
      }
    });
  }

  /**
   * Get applicable tiered price for a product quantity
   */
  static getTieredPrice(product: Product, quantity: number, isVip: boolean = false): number {
    // Routes through getEffectiveUnitPrice so a flat VIP price (vipPriceUSD) is
    // honoured for VIP users, falling back to the wholesale tiered price.
    return getEffectiveUnitPrice(product, quantity, isVip);
  }

  /**
   * Calculate discount percentage for wholesale
   * Returns a value between 0 and 1 (e.g., 0.2 for 20% off)
   */
  static getDiscountPercentage(product: Product, quantity: number, isVip: boolean = false): number {
    if (!product.priceTiers || product.priceTiers.length === 0) {
      return 0;
    }

    const basePrice = product.priceUSD;
    if (basePrice <= 0) return 0;

    const tieredPrice = this.getTieredPrice(product, quantity, isVip);
    
    if (tieredPrice < basePrice) {
      return (basePrice - tieredPrice) / basePrice;
    }
    
    return 0;
  }


  /**
   * Calculate cart subtotal (uses tiered pricing)
   */
  static calculateSubtotal(items: CartItem[], isVip: boolean = false): number {
    return items.reduce((total, item) => {
      const unitPrice = this.getTieredPrice(item.product, item.quantity, isVip);
      return total + (unitPrice * item.quantity);
    }, 0);
  }

  /**
   * Get cart item count
   */
  static getCartItemCount(cart: Cart | null): number {
    if (!cart || !cart.items) return 0;
    return cart.items.reduce((count, item) => count + item.quantity, 0);
  }

  /**
   * Check if product is in cart
   */
  static isProductInCart(cart: Cart | null, productId: string): boolean {
    if (!cart || !cart.items) return false;
    return cart.items.some(item => item.productId === productId);
  }

  /**
   * Get product quantity in cart
   */
  static getProductQuantityInCart(cart: Cart | null, productId: string): number {
    if (!cart || !cart.items) return 0;
    const item = cart.items.find(item => item.productId === productId);
    return item ? item.quantity : 0;
  }

  /**
   * CHECKOUT GATE: Check if cart is valid for checkout (always true now without variants)
   */
  static isCartValidForCheckout(cart: Cart | null): boolean {
    if (!cart || !cart.items) return false;
    return cart.items.length > 0;
  }
}
