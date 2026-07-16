import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Cart, Product } from '../types';
import { CartService } from '../services/cartService';
import { LocalCartService } from '../services/localCartService';
import { useAuth } from './AuthContext';
import { CartUtils } from '../utils/cartUtils';

interface CartContextValue {
  cart: Cart | null;
  isLoading: boolean;
  error: string | null;
  refreshCart: () => Promise<void>;
  addToCart: (productId: string, quantity?: number, product?: Product, selectedOptions?: { color?: string; size?: string; storage?: string }) => Promise<void>;
  // ALIBABA VARIATION: Batch add multiple variations in one operation
  addVariationsToCart: (product: Product, selections: Array<{ variationId: string; quantity: number; priceUSD?: number; sizeValue?: number | string; sizeUnit?: string; colorValue?: string }>) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, selectedOptions?: { color?: string; size?: string; storage?: string }) => Promise<void>;
  removeFromCart: (productId: string, selectedOptions?: { color?: string; size?: string; storage?: string }) => Promise<void>;
  clearCart: () => Promise<void>;
  getCartItemCount: () => number;
  isProductInCart: (productId: string) => boolean;
  getProductQuantity: (productId: string) => number;
  // CHECKOUT GATE: Validation methods
  isCartValidForCheckout: () => boolean;
  getInvalidCartItems: () => any[];
  debugCartStorage: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

// Safe version that returns null if no context
export const useCartSafe = (): CartContextValue | null => {
  const context = useContext(CartContext);
  return context || null;
};

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { user, isVip } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);
  const { t } = useTranslation();

  // GUEST LOGIN SYSTEM: Use 'guest' as userId when not authenticated
  const cartUserId = user?.uid || 'guest';

  // Merge guest cart into user cart when logging in
  const mergeGuestCartToUser = useCallback(async (newUserId: string) => {
    try {
      const guestCart = await LocalCartService.getCart('guest');
      if (guestCart && guestCart.items.length > 0) {
        // Get or create user cart
        let userCart = await LocalCartService.getCart(newUserId);
        if (!userCart) {
          userCart = {
            userId: newUserId,
            items: [],
            subtotalUSD: 0,
            updatedAt: new Date() as any,
          };
        }

        // Merge items (avoid duplicates, sum quantities)
        for (const guestItem of guestCart.items) {
          const existingIndex = userCart.items.findIndex(
            item => item.productId === guestItem.productId
          );
          if (existingIndex >= 0) {
            // Sum quantities, respect stock limits
            const maxQty = guestItem.product?.stockQty || 999;
            userCart.items[existingIndex].quantity = Math.min(
              userCart.items[existingIndex].quantity + guestItem.quantity,
              maxQty
            );
          } else {
            // Add new item
            userCart.items.push({ ...guestItem });
          }
        }

        // Recalculate subtotal
        userCart.subtotalUSD = LocalCartService.calculateSubtotal(userCart.items, isVip);
        userCart.updatedAt = new Date() as any;

        // Save merged cart to user
        await LocalCartService.saveCart(userCart);

        // Clear guest cart
        await LocalCartService.clearCart('guest');

        console.log('Guest cart merged to user cart:', userCart.items.length, 'items');
        return userCart;
      }
      return null;
    } catch (err) {
      console.error('Error merging guest cart:', err);
      return null;
    }
  }, []);

  // Load cart when user changes (handles login/logout and guest mode)
  useEffect(() => {
    const loadCartForUser = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // If user just logged in (was guest before), merge carts
        if (user?.uid && previousUserId === null) {
          const mergedCart = await mergeGuestCartToUser(user.uid);
          if (mergedCart) {
            setCart(mergedCart);
            setPreviousUserId(user.uid);
            setIsLoading(false);
            return;
          }
        }

        // Load cart for current user (or guest)
        if (user?.uid) {
          await CartService.clearCartCache(user.uid);
        }
        
        const loadedCart = await LocalCartService.getCart(cartUserId);
        setCart(loadedCart);
        setPreviousUserId(user?.uid || null);
      } catch (err: any) {
        console.error('Error loading cart:', err);
        setError(err.message || 'Failed to load cart');
      } finally {
        setIsLoading(false);
      }
    };

    loadCartForUser();
  }, [user?.uid, cartUserId, previousUserId, mergeGuestCartToUser]);

  const loadCart = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (user?.uid) {
        await CartService.clearCartCache(user.uid);
      }
      const userCart = await LocalCartService.getCart(cartUserId);
      setCart(userCart);
    } catch (err: any) {
      console.error('Error loading cart:', err);
      setError(err.message || 'Failed to load cart');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, cartUserId]);

  const refreshCart = useCallback(async () => {
    await loadCart();
  }, [loadCart]);

  // GUEST LOGIN SYSTEM: Allow guest to add to cart (no login error)
  // GOLDEN FIX: Added selectedOptions parameter for color/size
  const addToCart = useCallback(async (
    productId: string, 
    quantity: number = 1, 
    product?: Product,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ) => {
    if (!product) {
      setError('Product data is required');
      return;
    }

    // Hard guard: never allow a $0 / unpriced product into the cart (e.g. a
    // "coming soon" / "on the way" item, or one missing its price). Protects
    // every entry point so nothing can be ordered for free.
    const hasValidPrice =
      (product.priceUSD || 0) > 0 ||
      (product.priceTiers?.some((t) => (t.priceUSD || 0) > 0) ?? false) ||
      (product.variations?.some((v: any) => (v.priceUSD || 0) > 0) ?? false);
    if (!hasValidPrice) {
      setError('This item is not available for purchase yet.');
      return;
    }

    // Prevent rapid consecutive additions
    if (isAddingToCart) {
      return;
    }

    setError(null);
    setIsAddingToCart(true);

    try {
      const updatedCart = await LocalCartService.addToCart(
        cartUserId, 
        productId, 
        quantity, 
        product,
        selectedOptions
      );
      setCart(updatedCart);
      
        if (user?.uid) {
        CartService.addToCart(user.uid, productId, quantity, product)
          .catch(() => { /* Silent fail for Firebase sync */ });
      }
    } catch (err: any) {
      if (err.message === 'DIFFERENT_TENANT') {
        // Show clear cart alert
        Alert.alert(
          t('cart.differentStoreTitle', { defaultValue: 'Different Store' }),
          t('cart.differentStoreMessage', { defaultValue: 'You can only order from one store at a time. Do you want to clear your current cart and start a new order with this store?' }),
          [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { 
              text: t('cart.clearAndAdd', { defaultValue: 'Clear & Add' }), 
              style: 'destructive',
              onPress: async () => {
                // Wipe the cart and then add this item
                try {
                  setIsAddingToCart(true); // Prevent UI flashes
                  if (user?.uid) {
                    await CartUtils.clearAllCartData(user.uid);
                  } else {
                    await LocalCartService.clearCart('guest');
                  }
                  
                  // Clear local state first
                  setCart({
                     userId: cartUserId,
                     items: [],
                     subtotalUSD: 0,
                     updatedAt: new Date() as any,
                  });
                  
                  // Now effectively run addToCart again
                  const updatedCart = await LocalCartService.addToCart(
                    cartUserId, 
                    productId, 
                    quantity, 
                    product,
                    selectedOptions
                  );
                  setCart(updatedCart);
                  
                  if (user?.uid) {
                    CartService.addToCart(user.uid, productId, quantity, product)
                      .catch(() => { /* Silent fail for Firebase sync */ });
                  }
                } catch (clearErr) {
                   console.error('Error clearing cart & adding new item:', clearErr);
                   setError((clearErr as Error).message || 'Failed to restart cart');
                } finally {
                   setIsAddingToCart(false);
                }
              }
            }
          ]
        );
      } else {
        // Normal error
        console.error('Error adding to cart:', err);
        setError((err as Error).message || 'Failed to add item to cart');
        throw err;
      }
    } finally {
      setIsAddingToCart(false);
    }
  }, [cartUserId, user?.uid, isAddingToCart, t]);

  // ALIBABA VARIATION: Batch add multiple size variations in one operation
  const addVariationsToCart = useCallback(async (
    product: Product,
    selections: Array<{ variationId: string; quantity: number; priceUSD?: number; sizeValue?: number | string; sizeUnit?: string; colorValue?: string }>
  ) => {
    // Prevent rapid consecutive additions
    if (isAddingToCart) {
      return;
    }

    setError(null);
    setIsAddingToCart(true);

    try {
      const updatedCart = await LocalCartService.addVariationsToCart(
        cartUserId,
        product,
        selections
      );
      setCart(updatedCart);
    } catch (err: any) {
      if (err.message === 'DIFFERENT_TENANT') {
        // Show clear cart alert
        Alert.alert(
          t('cart.differentStoreTitle', { defaultValue: 'Different Store' }),
          t('cart.differentStoreMessage', { defaultValue: 'You can only order from one store at a time. Do you want to clear your current cart and start a new order with this store?' }),
          [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { 
              text: t('cart.clearAndAdd', { defaultValue: 'Clear & Add' }), 
              style: 'destructive',
              onPress: async () => {
                // Wipe the cart and then add this item
                try {
                  setIsAddingToCart(true); // Prevent UI flashes
                  if (user?.uid) {
                    await CartUtils.clearAllCartData(user.uid);
                  } else {
                    await LocalCartService.clearCart('guest');
                  }
                  
                  setCart({
                     userId: cartUserId,
                     items: [],
                     subtotalUSD: 0,
                     updatedAt: new Date() as any,
                  });
                  
                  const updatedCart = await LocalCartService.addVariationsToCart(
                    cartUserId,
                    product,
                    selections
                  );
                  setCart(updatedCart);
                } catch (clearErr) {
                   console.error('Error clearing cart & adding variations:', clearErr);
                   setError((clearErr as Error).message || 'Failed to restart cart');
                } finally {
                   setIsAddingToCart(false);
                }
              }
            }
          ]
        );
      } else {
        console.error('Error adding variations to cart:', err);
        setError((err as Error).message || 'Failed to add items to cart');
        throw err;
      }
    } finally {
      setIsAddingToCart(false);
    }
  }, [cartUserId, isAddingToCart, t]);

  // GUEST LOGIN SYSTEM: Allow guest to update cart
  const updateQuantity = useCallback(async (
    productId: string, 
    quantity: number, 
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ) => {
    setError(null);

    try {
      const updatedCart = await LocalCartService.updateQuantity(cartUserId, productId, quantity, selectedOptions);
      setCart(updatedCart);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Error updating cart quantity:', err);
      setError(err.message || 'Failed to update quantity');
      throw err;
    }
  }, [cartUserId]);

  // GUEST LOGIN SYSTEM: Allow guest to remove from cart
  const removeFromCart = useCallback(async (
    productId: string,
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ) => {
    setError(null);

    try {
      const updatedCart = await LocalCartService.removeFromCart(cartUserId, productId, selectedOptions);
      setCart(updatedCart);
      
      // Only sync to Firebase if user is authenticated
      if (user?.uid) {
        CartService.removeFromCart(user.uid, productId)
          .catch(() => { /* Silent fail for Firebase sync */ });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Error removing from cart:', err);
      setError(err.message || 'Failed to remove item from cart');
      throw err;
    }
  }, [cartUserId, user?.uid]);

  const clearCart = useCallback(async () => {
    setError(null);

    try {
      if (user?.uid) {
        await CartUtils.clearAllCartData(user.uid);
      } else {
        await LocalCartService.clearCart('guest');
      }
      
      const emptyCart = {
        userId: cartUserId,
        items: [],
        subtotalUSD: 0,
        updatedAt: new Date() as any,
      };
      
      setCart(emptyCart);
    } catch (err: any) {
      console.error('Error clearing cart:', err);
      setError(err.message || 'Failed to clear cart');
      throw err;
    }
  }, [cartUserId, user?.uid]);

  const getCartItemCount = useCallback(() => {
    if (!cart) return 0;
    return LocalCartService.getCartItemCount(cart);
  }, [cart]);

  const isProductInCart = useCallback((productId: string) => {
    if (!cart) return false;
    return LocalCartService.isProductInCart(cart, productId);
  }, [cart]);

  const getProductQuantity = useCallback((productId: string) => {
    if (!cart) return 0;
    return LocalCartService.getProductQuantityInCart(cart, productId);
  }, [cart]);

  // CHECKOUT GATE: Validation methods
  const isCartValidForCheckout = useCallback(() => {
    return LocalCartService.isCartValidForCheckout(cart);
  }, [cart]);

  const getInvalidCartItems = useCallback(() => {
    // Variant validation no longer needed - return empty array
    return [];
  }, []);

  const debugCartStorage = useCallback(async () => {
    if (!user?.uid) {
      // Production: console.log removed
      return;
    }
    await CartUtils.debugCartStorage(user.uid);
  }, [user?.uid]);

  const contextValue: CartContextValue = React.useMemo(() => ({
    cart,
    isLoading,
    error,
    refreshCart,
    addToCart,
    addVariationsToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartItemCount,
    isProductInCart,
    getProductQuantity,
    isCartValidForCheckout,
    getInvalidCartItems,
    debugCartStorage,
  }), [
    cart,
    isLoading,
    error,
    refreshCart,
    addToCart,
    addVariationsToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartItemCount,
    isProductInCart,
    getProductQuantity,
    isCartValidForCheckout,
    getInvalidCartItems,
    debugCartStorage,
  ]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export default CartProvider;
