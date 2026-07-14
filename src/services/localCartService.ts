/**
 * LOCAL CART SERVICE
 * Simple cart management using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Cart, CartItem, Product } from '../types';
import { calculateTieredPrice } from '../utils/pricingUtils';

const CART_STORAGE_KEY = 'local_cart_';

export class LocalCartService {
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
    selectedOptions?: { color?: string; size?: string }
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

      // Helper to compare selectedOptions (Case Insensitive)
      const optionsMatch = (a?: { color?: string; size?: string }, b?: { color?: string; size?: string }) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        
        const colorA = a.color?.trim().toLowerCase();
        const colorB = b.color?.trim().toLowerCase();
        const sizeA = a.size?.trim().toLowerCase();
        const sizeB = b.size?.trim().toLowerCase();
        
        return colorA === colorB && sizeA === sizeB;
      };

      // Find existing item by productId AND selectedOptions (same product + same options = merge)
      const existingItemIndex = cart.items.findIndex(item => 
        item.productId === productId && optionsMatch(item.selectedOptions, selectedOptions)
      );

      if (existingItemIndex >= 0) {
        // Update existing item (same product + same options)
        const existingItem = cart.items[existingItemIndex];
        const newQuantity = existingItem.quantity + quantity;
        
        const maxStock = product.stockQty;
        if (newQuantity > maxStock) {
          throw new Error(`Cannot add more than ${maxStock} items`);
        }

        cart.items[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
        };
      } else {
        // Add new item (new product OR same product with different options)
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
    a?: { color?: string; size?: string }, 
    b?: { color?: string; size?: string }
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.color === b.color && a.size === b.size;
  }

  /**
   * Update item quantity in cart
   */
  static async updateQuantity(
    userId: string,
    productId: string,
    quantity: number,
    selectedOptions?: { color?: string; size?: string }
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
        // Remove item if quantity is 0 or negative
        return await this.removeFromCart(userId, productId, selectedOptions);
      }

      // Check stock limit
      const item = cart.items[itemIndex];
      const maxStock = item.product.stockQty;
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
    selectedOptions?: { color?: string; size?: string }
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
  }

  /**
   * Get applicable tiered price for a product quantity
   */
  static getTieredPrice(product: Product, quantity: number, isVip: boolean = false): number {
    return calculateTieredPrice(quantity, product.priceUSD, product.priceTiers, isVip);
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
