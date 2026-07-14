import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartService } from '../services/cartService';
import { LocalCartService } from '../services/localCartService';

/**
 * Utility to completely clear all cart data for a user from all storage locations
 * This fixes the issue where carts were being stored in multiple places
 */
export class CartUtils {
  static async clearAllCartData(userId: string): Promise<void> {
    try {
      // Production: console.log removed
      
      // Clear from LocalCartService
      await LocalCartService.clearCart(userId);
      // Production: console.log removed
      
      // Clear from CartService cache
      await CartService.clearCartCache(userId);
      // Production: console.log removed
      
      // Clear any other potential storage keys
      const possibleKeys = [
        `local_cart_${userId}`,
        `cart_${userId}`,
        `user_cart_${userId}`,
        `cached_cart_${userId}`,
      ];
      
      for (const key of possibleKeys) {
        try {
          await AsyncStorage.removeItem(key);
          // Production: console.log removed
        } catch (error) {
          // Production: console.warn removed
        }
      }
      
      // Production: console.log removed
    } catch (error) {
      console.error('[CartUtils] Error clearing cart data:', error);
      throw error;
    }
  }
  
  /**
   * Debug function to check all cart storage locations
   */
  static async debugCartStorage(userId: string): Promise<void> {
    // Production: console.log removed
    
    const possibleKeys = [
      `local_cart_${userId}`,
      `cart_${userId}`,
      `user_cart_${userId}`,
      `cached_cart_${userId}`,
    ];
    
    for (const key of possibleKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          // Production: console.log removed
        } else {
          // Production: console.log removed
        }
      } catch (error) {
        // Production: console.log removed
      }
    }
    
    // Production: console.log removed
  }
}
