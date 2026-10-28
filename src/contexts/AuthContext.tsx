import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { User } from '../types';
import { isOwnerUid } from '../constants/config';
import { supabase, uniqueChannel } from '../services/supabase';
import { AuthService } from '../services/authService';
import { OrderService } from '../services/OrderService';
import { USE_MOCK_DATA } from '../services/mockData';

const DEMO_VIP_KEY = '@khamark_demo_vip';

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
  // Demo-only (USE_MOCK_DATA): preview the app as a VIP user without logging in.
  demoVip: boolean;
  setDemoVip: (on: boolean) => void;
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
  // Demo-only VIP preview (persisted). Lets a guest see VIP pricing offline.
  const [demoVip, setDemoVipState] = useState(false);
  useEffect(() => {
    if (!USE_MOCK_DATA) return;
    AsyncStorage.getItem(DEMO_VIP_KEY).then((v) => { if (v === '1') setDemoVipState(true); }).catch(() => {});
  }, []);
  const setDemoVip = useCallback((on: boolean) => {
    setDemoVipState(on);
    AsyncStorage.setItem(DEMO_VIP_KEY, on ? '1' : '0').catch(() => {});
  }, []);
  const registrationInProgressRef = useRef(false);
  // First-resolution gate: keep the full-screen splash for the initial load only,
  // so later auth events (TOKEN_REFRESHED on resume/auto-refresh) don't tear down
  // the navigator. Latest-wins sequence for concurrent fetchUser() calls, and a
  // handle to the "account blocked" sign-out timer so we can clear it on unmount.
  const initialLoadDone = useRef(false);
  const fetchSeq = useRef(0);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Latest-wins guard: fetchUser runs concurrently from the auth-state listener
    // and the AppState 'active' handler on resume. A slower call that falls back
    // to a cached profile must not overwrite a fresher result, so drop any
    // response that has been superseded by a newer fetch.
    const seq = ++fetchSeq.current;
    try {
      const userData = await AuthService.getCurrentUserFresh();
      if (seq !== fetchSeq.current) return;

      if (userData?.isBlocked) {
        if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
        blockTimerRef.current = setTimeout(() => {
          Alert.alert(
            i18next.t('auth.accountBlocked', { defaultValue: 'Account Blocked' }),
            i18next.t('auth.accountBlockedMessage', { defaultValue: 'Your account has been blocked by the admin.' })
          );
          // Always drop the in-memory user, even if the network sign-out rejects,
          // so a blocked account can't keep browsing on a cached session.
          AuthService.signOut().catch(() => {}).finally(() => setUser(null));
        }, 100);
        return;
      }

      if (userData) {
        // Re-check the session before committing. The seq guard above only makes
        // fetchUser latest-wins against ANOTHER fetchUser — it does not know that the
        // identity being fetched for has since been signed out. Without this, a slow
        // profile read that resolves after logout puts the user straight back into the
        // authenticated stack with no Supabase session behind it (every later request
        // 401s), and re-persists their profile to device storage.
        const { data: sessionCheck } = await supabase.auth.getSession();
        if (seq !== fetchSeq.current) return;
        if (!sessionCheck.session) return;
        setUser(userData);
      } else {
        await clearUserIfNoSession();
      }
    } catch (error) {
      if (seq !== fetchSeq.current) return;
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
            AuthService.signOut().catch(() => {}).finally(() => setUser(null));
          }
        }
      ).subscribe();
    };

    const unsubscribe = AuthService.onAuthStateChanged(async (sessionUser) => {
      if (registrationInProgressRef.current) {
        setIsLoading(false);
        return;
      }

      // Only gate the app behind the splash on the very first resolution.
      // Supabase fires TOKEN_REFRESHED on auto-refresh/resume; flipping isLoading
      // on every event would unmount the navigator and remount it at the initial
      // route, wiping any in-progress form. Refresh the user silently instead.
      if (!initialLoadDone.current) setIsLoading(true);

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
        initialLoadDone.current = true;
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
      if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      // Supersede any fetchUser already in flight, then again after the awaits to
      // catch one that started during them. Otherwise its response lands after
      // setUser(null) and resurrects the account that just signed out.
      fetchSeq.current++;
      await OrderService.clearAllCache?.(); // Handle optional method during migration
      await AuthService.signOut();
      fetchSeq.current++;
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
      // Same reasoning as signOut — and worse here, since the restored user has no
      // row left at all.
      fetchSeq.current++;
      await OrderService.clearAllCache?.();

      // Full deletion (auth identity + profile) runs server-side. Do NOT fall
      // back to a client `from('users').delete()` — that left the auth user
      // orphaned (credential stuck) while still cascade-deleting the data, and
      // reported a false "account deleted" success.
      const { error } = await supabase.rpc('delete_user');
      if (error) throw new Error(error.message || 'Account deletion failed. Please try again.');

      await AuthService.signOut();
      fetchSeq.current++;
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

  const signInWithFacebook = useCallback(async (): Promise<User> => {
      // Facebook provider is not wired up yet. Fail loudly so the caller's catch
      // surfaces a message instead of running its post-login flow on a fake
      // success (which would leave an unauthenticated guest in a logged-in state).
      throw new Error(i18next.t('auth.facebookUnavailable', { defaultValue: 'Facebook sign-in is not available yet' }));
  }, []);

  const signInWithApple = useCallback(async () => {
      return await AuthService.signInWithApple();
  }, []);

  const isAuthenticated = user !== null;
  const isAdmin = user?.isAdmin === true || user?.role === 'admin';
  const isVip = user?.role === 'vip' || (USE_MOCK_DATA && demoVip);
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
    demoVip,
    setDemoVip,
  }), [
    user, isLoading, isAuthenticated, isAdmin, isVip, isOwner, isPartner, isGuest,
    signOut, deleteAccount, refreshUser, updateUserProfile,
    signInWithFacebook, signInWithApple, isAppleAvailable, setRegistrationInProgress,
    demoVip, setDemoVip,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
