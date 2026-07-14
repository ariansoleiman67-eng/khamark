import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { AppState, Alert } from 'react-native';
import i18next from 'i18next';
import { User } from '../types';
import { isOwnerUid } from '../constants/config';
import { supabase, uniqueChannel } from '../services/supabase';
import { AuthService } from '../services/authService';
import { OrderService } from '../services/OrderService';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVip: boolean;
  isOwner: boolean;
  isPartner: boolean;
  isGuest: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  signInWithFacebook: () => Promise<User>;
  signInWithApple: () => Promise<User>;
  isAppleAvailable: boolean;
  setRegistrationInProgress: (inProgress: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const registrationInProgressRef = useRef(false);

  const setRegistrationInProgress = useCallback((inProgress: boolean) => {
    registrationInProgressRef.current = inProgress;
  }, []);

  useEffect(() => {
    // Apple sign in availability check placeholder
    setIsAppleAvailable(true);
  }, []);

  // Only treat the user as logged-OUT when there is genuinely no session. A
  // transient profile-fetch failure (network blip on resume, RLS hiccup, or the
  // row not yet replicated right after signup) returns null too — clearing the
  // user in that case would kick a logged-in customer/admin out of the app.
  const clearUserIfNoSession = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) setUser(null);
    } catch {
      // Could not determine session state — keep the current user rather than
      // logging them out on a network error.
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const userData = await AuthService.getCurrentUserFresh();

      if (userData?.isBlocked) {
        setTimeout(async () => {
          Alert.alert(
            i18next.t('auth.accountBlocked', { defaultValue: 'Account Blocked' }),
            i18next.t('auth.accountBlockedMessage', { defaultValue: 'Your account has been blocked by the admin.' })
          );
          await AuthService.signOut();
          setUser(null);
        }, 100);
        return;
      }

      if (userData) {
        setUser(userData);
      } else {
        await clearUserIfNoSession();
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      await clearUserIfNoSession();
    }
  }, [clearUserIfNoSession]);

  useEffect(() => {
    let blockChannel: any = null;

    const setupBlockListener = (uid: string) => {
      if (blockChannel) supabase.removeChannel(blockChannel);
      
      blockChannel = uniqueChannel(`public:users:${uid}`);
      blockChannel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${uid}` },
        (payload: any) => {
          if (payload.new && payload.new.is_blocked) {
            Alert.alert(
              i18next.t('auth.accountBlocked', { defaultValue: 'Account Blocked' }), 
              i18next.t('auth.accountBlockedMessage', { defaultValue: 'Your account has been blocked by the admin.' })
            );
            AuthService.signOut().then(() => setUser(null));
          }
        }
      ).subscribe();
    };

    const unsubscribe = AuthService.onAuthStateChanged(async (sessionUser) => {
      if (registrationInProgressRef.current) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      
      try {
        if (sessionUser) {
          setupBlockListener(sessionUser.uid);
          await fetchUser();
        } else {
          if (blockChannel) {
            supabase.removeChannel(blockChannel);
            blockChannel = null;
          }
          setUser(null);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          try {
            await fetchUser();
          } catch (error) {
            console.error('Error reloading user on app active:', error);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      appStateSubscription.remove();
      if (blockChannel) supabase.removeChannel(blockChannel);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await OrderService.clearAllCache?.(); // Handle optional method during migration
      await AuthService.signOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      setIsLoading(false);
      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      throw new Error('No user logged in');
    }

    try {
      setIsLoading(true);
      await OrderService.clearAllCache?.();
      
      // Full deletion (auth identity + profile) runs server-side. Do NOT fall
      // back to a client `from('users').delete()` — that left the auth user
      // orphaned (credential stuck) while still cascade-deleting the data, and
      // reported a false "account deleted" success.
      const { error } = await supabase.rpc('delete_user');
      if (error) throw new Error(error.message || 'Account deletion failed. Please try again.');

      await AuthService.signOut();
      setUser(null);
    } catch (error: any) {
      setIsLoading(false);
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const updateUserProfile = useCallback(async (updates: Partial<User>) => {
    if (!user) {
      throw new Error('No user logged in');
    }
    try {
      await AuthService.updateUserProfile(user.uid, updates);
      await refreshUser();
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }, [user, refreshUser]);

  const signInWithFacebook = useCallback(async () => {
      // Mock for migration
      return {} as User;
  }, []);

  const signInWithApple = useCallback(async () => {
      return await AuthService.signInWithApple();
  }, []);

  const isAuthenticated = user !== null;
  const isAdmin = user?.isAdmin === true || user?.role === 'admin';
  const isVip = user?.role === 'vip';
  // The store owner — the only admin allowed to manage partners. Gated on UID
  // (no DB-level owner flag exists; partners are also role='admin').
  const isOwner = isAdmin && isOwnerUid(user?.uid);
  // View-only partner (is_admin stays false, so they're NOT isAdmin — routed to a read-only home).
  const isPartner = user?.isPartner === true;
  const isGuest = !isAuthenticated;

  const value: AuthContextValue = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated,
    isAdmin,
    isVip,
    isOwner,
    isPartner,
    isGuest,
    signOut,
    deleteAccount,
    refreshUser,
    updateUserProfile,
    signInWithFacebook,
    signInWithApple,
    isAppleAvailable,
    setRegistrationInProgress,
  }), [
    user, isLoading, isAuthenticated, isAdmin, isVip, isOwner, isPartner, isGuest,
    signOut, deleteAccount, refreshUser, updateUserProfile,
    signInWithFacebook, signInWithApple, isAppleAvailable, setRegistrationInProgress,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
