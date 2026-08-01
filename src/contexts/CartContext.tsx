import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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
  // In-flight guard for add operations. Uses a ref (not state) so the check is
  // synchronous and unaffected by React's async render batching — two taps in the
  // same frame both observe the up-to-date value and the second is rejected.
  const isAddingRef = useRef(false);
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);
  const { t } = useTranslation();

  // GUEST LOGIN SYSTEM: Use 'guest' as userId when not authenticated
  const cartUserId = user?.uid || 'guest';

  // Owner of the cart currently published in state.
  //
  // CartProvider sits above AppNavigator, so it never unmounts on sign-out — a
  // write path that resolves after the identity changed would otherwise publish the
  // previous account's cart into the new session. The window is not a microsecond
  // race: the Alert callbacks below are native dialogs that outlive the navigator
  // teardown and wait on a human, so an auth change (admin block, failed token
  // refresh on resume) can easily land while one is open.
  const identityRef = useRef(cartUserId);
  useEffect(() => { identityRef.current = cartUserId; }, [cartUserId]);

  // Commit a cart only if the identity it was fetched/built for is still current.
  const commitCart = useCallback((next: Cart | null, owner: string) => {
    if (identityRef.current !== owner) return;
    setCart(next);
  }, []);

  // Drop the previous owner's cart during render, before any child can read it.
  // Doing this in an effect is too late: AuthContext batches setUser(null) and
  // setIsLoading(false) into one commit, so the guest tab bar mounts and reads
  // getCartItemCount() showing the previous account's item count for a frame.
  const [loadedFor, setLoadedFor] = useState(cartUserId);
  if (loadedFor !== cartUserId) {
    setLoadedFor(cartUserId);
    setCart(null);
    setIsLoading(true);
  }

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

        // Compare selectedOptions case-insensitively, mirroring
        // LocalCartService.addToCart so a merge keys on the same dimensions the
        // rest of the cart is keyed on (color/size/storage), not productId alone.
        const optionsMatch = (
          a?: { color?: string; size?: string; storage?: string },
          b?: { color?: string; size?: string; storage?: string }
        ) => {
          if (!a && !b) return true;
          if (!a || !b) return false;
          return (
            a.color?.trim().toLowerCase() === b.color?.trim().toLowerCase() &&
            a.size?.trim().toLowerCase() === b.size?.trim().toLowerCase() &&
            a.storage?.trim().toLowerCase() === b.storage?.trim().toLowerCase()
          );
        };

        // Merge items (avoid duplicates, sum quantities). Only merge when the
        // product AND its variation/options match; otherwise keep as a distinct
        // line so a guest variation never sums into the wrong user variation.
        for (const guestItem of guestCart.items) {
          const existingIndex = userCart.items.findIndex(
            item =>
              item.productId === guestItem.productId &&
              (item.variationId || null) === (guestItem.variationId || null) &&
              optionsMatch(item.selectedOptions, guestItem.selectedOptions)
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
    // isVip is read to price the merged cart — without it in deps the callback
    // closes over the guest-time value (false), so a VIP who filled a guest cart
    // then logged in got non-VIP pricing on merge.
  }, [isVip]);

  // Load cart when user changes (handles login/logout and guest mode)
  useEffect(() => {
    // Guard against a superseded run: if the user/cartUserId changes again while
    // an earlier load is still awaiting, that stale run must not overwrite state
    // with the wrong user's cart (cross-account leak).
    let active = true;

    const loadCartForUser = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // If user just logged in (was guest before), merge carts
        if (user?.uid && previousUserId === null) {
          const mergedCart = await mergeGuestCartToUser(user.uid);
          if (!active) return;
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
        if (!active) return;
        setCart(loadedCart);
        setPreviousUserId(user?.uid || null);
      } catch (err: any) {
        console.error('Error loading cart:', err);
        if (active) setError(err.message || 'Failed to load cart');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadCartForUser();

    return () => {
      active = false;
    };
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
    if (isAddingRef.current) {
      return;
    }

    setError(null);
    isAddingRef.current = true;

    const owner = cartUserId;

    try {
      const updatedCart = await LocalCartService.addToCart(
        owner,
        productId,
        quantity,
        product,
        selectedOptions
      );
      commitCart(updatedCart, owner);

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
                // This dialog is native and waits on a human, so the signed-in
                // identity may have changed since it was raised. Re-check before
                // touching storage — otherwise this wipes and rewrites the previous
                // account's cart from inside the new session.
                if (identityRef.current !== owner) return;

                try {
                  isAddingRef.current = true; // Prevent UI flashes
                  if (user?.uid) {
                    await CartUtils.clearAllCartData(user.uid);
                  } else {
                    await LocalCartService.clearCart('guest');
                  }

                  // Deliberately NOT clearing local state here. Publishing an empty
                  // cart before the re-add means a failing add (e.g. the max-stock
                  // error) leaves storage wiped and state empty, with the item
                  // silently gone — setError is not rendered by any consumer.
                  const updatedCart = await LocalCartService.addToCart(
                    owner,
                    productId,
                    quantity,
                    product,
                    selectedOptions
                  );
                  commitCart(updatedCart, owner);

                  if (user?.uid) {
                    CartService.addToCart(user.uid, productId, quantity, product)
                      .catch(() => { /* Silent fail for Firebase sync */ });
                  }
                } catch (clearErr) {
                   console.error('Error clearing cart & adding new item:', clearErr);
                   setError((clearErr as Error).message || 'Failed to restart cart');
                   // Storage was already wiped, so reflect that truth in state and
                   // tell the user — otherwise the cart silently empties.
                   commitCart({
                     userId: owner,
                     items: [],
                     subtotalUSD: 0,
                     updatedAt: new Date() as any,
                   }, owner);
                   Alert.alert(
                     t('common.error', { defaultValue: 'Error' }),
                     (clearErr as Error).message ||
                       t('cart.restartFailed', { defaultValue: 'Your cart was cleared but the item could not be added. Please try again.' })
                   );
                } finally {
                   isAddingRef.current = false;
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
      isAddingRef.current = false;
    }
  }, [cartUserId, user?.uid, t]);

  // ALIBABA VARIATION: Batch add multiple size variations in one operation
  const addVariationsToCart = useCallback(async (
    product: Product,
    selections: Array<{ variationId: string; quantity: number; priceUSD?: number; sizeValue?: number | string; sizeUnit?: string; colorValue?: string }>
  ) => {
    // Prevent rapid consecutive additions
    if (isAddingRef.current) {
      return;
    }

    setError(null);
    isAddingRef.current = true;

    const owner = cartUserId;

    try {
      const updatedCart = await LocalCartService.addVariationsToCart(
        owner,
        product,
        selections
      );
      commitCart(updatedCart, owner);
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
                // Native dialog, human-timed: re-check identity before touching
                // storage. See the matching guard in addToCart.
                if (identityRef.current !== owner) return;

                try {
                  isAddingRef.current = true; // Prevent UI flashes
                  if (user?.uid) {
                    await CartUtils.clearAllCartData(user.uid);
                  } else {
                    await LocalCartService.clearCart('guest');
                  }

                  // No premature empty-cart publish — see addToCart.
                  const updatedCart = await LocalCartService.addVariationsToCart(
                    owner,
                    product,
                    selections
                  );
                  commitCart(updatedCart, owner);
                } catch (clearErr) {
                   console.error('Error clearing cart & adding variations:', clearErr);
                   setError((clearErr as Error).message || 'Failed to restart cart');
                   commitCart({
                     userId: owner,
                     items: [],
                     subtotalUSD: 0,
                     updatedAt: new Date() as any,
                   }, owner);
                   Alert.alert(
                     t('common.error', { defaultValue: 'Error' }),
                     (clearErr as Error).message ||
                       t('cart.restartFailed', { defaultValue: 'Your cart was cleared but the items could not be added. Please try again.' })
                   );
                } finally {
                   isAddingRef.current = false;
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
      isAddingRef.current = false;
    }
  }, [cartUserId, t]);

  // GUEST LOGIN SYSTEM: Allow guest to update cart
  const updateQuantity = useCallback(async (
    productId: string, 
    quantity: number, 
    selectedOptions?: { color?: string; size?: string; storage?: string }
  ) => {
    setError(null);

    const owner = cartUserId;

    try {
      const updatedCart = await LocalCartService.updateQuantity(owner, productId, quantity, selectedOptions);
      commitCart(updatedCart, owner);
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

    const owner = cartUserId;

    try {
      const updatedCart = await LocalCartService.removeFromCart(owner, productId, selectedOptions);
      commitCart(updatedCart, owner);

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

    const owner = cartUserId;

    try {
      if (user?.uid) {
        await CartUtils.clearAllCartData(user.uid);
      } else {
        await LocalCartService.clearCart('guest');
      }

      const emptyCart = {
        userId: owner,
        items: [],
        subtotalUSD: 0,
        updatedAt: new Date() as any,
      };

      commitCart(emptyCart, owner);
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
