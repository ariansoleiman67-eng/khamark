import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

/**
 * Auth Gate Hook - Intent-Based Authentication
 * 
 * MANDATORY RULE: All auth decisions MUST go through this hook.
 * No screen may check authState or isAuthenticated directly for navigation decisions.
 * This ensures consistent behavior and prevents auth bypass bugs.
 * 
 * Usage:
 * const { requireAuth, isAuthenticated } = useAuthGate();
 * 
 * // For checkout button:
 * const handleCheckout = () => {
 *   requireAuth(() => navigation.navigate('Checkout'), 'checkout');
 * };
 */

export type AuthReason = 'checkout' | 'orders' | 'message' | 'address' | 'payment' | 'profile';

interface AuthGateResult {
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Whether user is in guest mode */
  isGuest: boolean;
  /** 
   * Require authentication before executing an action.
   * If not authenticated, navigates to LoginGate with reason.
   * If authenticated, executes the action immediately.
   */
  requireAuth: (action: () => void, reason: AuthReason) => void;
  /** 
   * Check if auth is required without navigating.
   * Returns true if user needs to authenticate.
   */
  needsAuth: () => boolean;
}

export const useAuthGate = (): AuthGateResult => {
  const { user, isAuthenticated } = useAuth();
  const navigation = useNavigation<any>();
  
  const isGuest = !user;

  const requireAuth = useCallback((
    action: () => void,
    reason: AuthReason
  ) => {
    if (isAuthenticated && user) {
      // User is authenticated, execute action immediately
      action();
    } else {
      // User is guest, navigate to LoginGate with reason
      navigation.navigate('LoginGate', { 
        reason,
        // Store the intended action info for after login
        returnAction: action.toString(), // For debugging only
      });
    }
  }, [isAuthenticated, user, navigation]);

  const needsAuth = useCallback(() => {
    return !isAuthenticated || !user;
  }, [isAuthenticated, user]);

  return {
    isAuthenticated: isAuthenticated && !!user,
    isGuest,
    requireAuth,
    needsAuth,
  };
};

export default useAuthGate;
