import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';
import { perfMark } from '../utils/perfTrace';

export interface TenantDocument {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  email?: string;
  createdAt: any;
  updatedAt: any;
  settings: {
    currency: string;
    timezone: string;
    language: string;
  };
}

export interface AdminDocument {
  uid: string;
  email: string;
  phone?: string;
  displayName: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: any;
  updatedAt: any;
}

interface TenantContextValue {
  tenantId: string | null;
  tenant: TenantDocument | null;
  adminProfile: AdminDocument | null;
  isLoading: boolean;
  error: string | null;
  
  createAdminAccount: (displayName: string, storeName: string, phone?: string, whatsapp?: string) => Promise<void>;
  createPartnerAccount: (displayName: string, phone?: string) => Promise<void>;
  upgradeToAdmin: (storeName: string) => Promise<void>;
  refreshTenant: () => Promise<void>;
  
  getProductsPath: () => string;
  getOrdersPath: () => string;
  getCategoriesPath: () => string;
  getCustomersPath: () => string;
  getNotificationsPath: () => string;
  getSettingsPath: () => string;
  getLocationsPath: () => string;
  getMembersPath: () => string;
  getTenantPath: (collection: string) => string;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const useTenant = (): TenantContextValue => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantDocument | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // In-flight mutexes so a double-tap (common on slow networks) can't fire the
  // SECURITY DEFINER account-creation RPCs twice. isLoading is display state, not
  // a synchronous lock, so we use refs which update immediately.
  const creatingAdminRef = useRef(false);
  const creatingPartnerRef = useRef(false);

  useEffect(() => {
    // Clear the previous tenant's state SYNCHRONOUSLY on identity change so no
    // admin screen keys a query/cache/React-key on the old tenantId during the
    // async reload (GOLDEN_RULES: clear all tenant state on tenant change).
    setTenantId(null);
    setTenant(null);
    setAdminProfile(null);

    // Guard against stale in-flight resolutions overwriting state after `user`
    // changes (logout / account switch / realtime users-row UPDATE). React does
    // not cancel the previous run's promise, so we discard its writes explicitly.
    let cancelled = false;

    setError(null);

    if (!user || !user.uid || !isAdmin) {
      setTenantId(null);
      setIsLoading(false);
      return;
    }

    // Resolve the tenant SYNCHRONOUSLY — no network on the critical path.
    //
    // This used to `select('*')` from `users` and then, serially, from `tenants`,
    // gating every admin screen behind two round-trips. Both were avoidable:
    // AuthContext already fetched this exact users row (AuthService.getCurrentUserFresh)
    // and mapped every field used here, and the tenant id is just the admin's own uid.
    setAdminProfile({
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      displayName: user.name || user.fullName || '',
      tenantId: user.uid,
      role: user.role === 'admin' ? 'admin' : 'owner',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    setTenantId(user.uid);
    setIsLoading(false);
    perfMark('admin:tenant-resolved');

    // The tenants row only backs `tenant`, which no screen currently reads — so it
    // loads in the background and is deliberately NOT allowed to gate isLoading.
    // Failure is non-fatal for the same reason: it must not block or error the
    // admin UI, which needs only tenantId.
    (async () => {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, store_name, owner_id, created_at, updated_at')
        .eq('id', user.uid)
        .single();
      if (cancelled || !tenantData) return;
      setTenant({
        id: tenantData.id,
        name: tenantData.store_name,
        ownerUid: tenantData.owner_id,
        ownerEmail: user.email,
        createdAt: tenantData.created_at,
        updatedAt: tenantData.updated_at,
        settings: { currency: 'USD', timezone: 'Asia/Baghdad', language: 'en' },
      });
    })();

    return () => {
      cancelled = true;
    };
    // Key on uid + isAdmin only: `user` is a fresh object on every foreground/token-refresh,
    // so depending on it re-ran this (spinner flicker + needless DB reads).
  }, [user?.uid, isAdmin]);

  const createAdminAccount = useCallback(async (displayName: string, storeName: string, phone?: string, whatsapp?: string) => {
    // Ignore re-entrant taps: a second concurrent RPC runs against the now-already-admin
    // row and either errors on a unique constraint or inserts a duplicate tenant.
    if (creatingAdminRef.current) return;
    creatingAdminRef.current = true;
    try {
      // Read the session DIRECTLY. During signup, registerWithPhone has just created the
      // session, but the AuthContext `user` (derived from the users row via onAuthStateChange)
      // hasn't updated this tick yet — relying on it caused a false
      // "User must be authenticated to create admin account". The session is available
      // immediately, so use its uid/email and fall back to `user` for the upgrade-in-app case.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || user?.uid;
      if (!uid) throw new Error('User must be authenticated to create admin account');
      const email = session?.user?.email || user?.email || '';
      const phoneVal = phone || user?.phone || '';

      try {
        setIsLoading(true);
        setError(null);

        // Elevate to admin + create the tenant via the create_admin_account RPC. A direct
        // client UPDATE of role/is_admin is reverted by the prevent_privilege_escalation
        // trigger (correct security), so admin creation must go through this SECURITY
        // DEFINER function. Requires the migration that defines it to be applied.
        const { error: rpcErr } = await supabase.rpc('create_admin_account', {
          p_display_name: displayName,
          p_store_name: storeName,
          p_phone: phoneVal || null,
          p_whatsapp: whatsapp || null,
        });
        if (rpcErr) throw rpcErr;

        setTenantId(uid);

        const adminData: AdminDocument = {
          uid,
          email,
          phone: phoneVal,
          displayName,
          tenantId: uid,
          role: 'owner',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setAdminProfile(adminData);

        setTenant({
          id: uid,
          name: storeName,
          ownerUid: uid,
          ownerEmail: email,
          phone: phoneVal,
          whatsapp,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          settings: { currency: 'USD', timezone: 'Asia/Baghdad', language: 'en' },
        });

      } catch (err: any) {
        console.error('Error creating admin account:', err);
        setError(err.message || 'Failed to create admin account');
        throw err;
      } finally {
        setIsLoading(false);
      }
    } finally {
      creatingAdminRef.current = false;
    }
  }, [user]);

  const upgradeToAdmin = useCallback(async (storeName: string) => {
    if (!user) throw new Error('User must be authenticated to upgrade to admin');
    return createAdminAccount(user.fullName || 'Admin', storeName);
  }, [user, createAdminAccount]);

  // Promote the signed-in user to a VIEW-ONLY partner (no store). Mirrors createAdminAccount
  // but via the create_partner_account RPC. The owner shares products to them afterward.
  const createPartnerAccount = useCallback(async (displayName: string, phone?: string) => {
    // Ignore re-entrant taps so the create_partner_account RPC can't double-insert.
    if (creatingPartnerRef.current) return;
    creatingPartnerRef.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || user?.uid;
      if (!uid) throw new Error('User must be authenticated to create partner account');
      try {
        setIsLoading(true);
        setError(null);
        const { error: rpcErr } = await supabase.rpc('create_partner_account', {
          p_display_name: displayName,
          p_phone: phone || null,
        });
        if (rpcErr) throw rpcErr;
      } catch (err: any) {
        console.error('Error creating partner account:', err);
        setError(err.message || 'Failed to create partner account');
        throw err;
      } finally {
        setIsLoading(false);
      }
    } finally {
      creatingPartnerRef.current = false;
    }
  }, [user]);

  const refreshTenant = useCallback(async () => {
    if (!tenantId) return;

    try {
      const { data: tenantData } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      if (tenantData) {
        setTenant(prev => prev ? {
          ...prev,
          name: tenantData.store_name,
          updatedAt: tenantData.updated_at,
        } : null);
      }
    } catch (err: any) {
      console.error('Error refreshing tenant:', err);
    }
  }, [tenantId]);

  const getTenantPath = useCallback((collectionName: string): string => {
    if (!tenantId) throw new Error('No tenant ID available');
    return `tenants/${tenantId}/${collectionName}`;
  }, [tenantId]);

  const getProductsPath = useCallback(() => getTenantPath('products'), [getTenantPath]);
  const getOrdersPath = useCallback(() => getTenantPath('orders'), [getTenantPath]);
  const getCategoriesPath = useCallback(() => getTenantPath('categories'), [getTenantPath]);
  const getCustomersPath = useCallback(() => getTenantPath('customers'), [getTenantPath]);
  const getNotificationsPath = useCallback(() => getTenantPath('notifications'), [getTenantPath]);
  const getSettingsPath = useCallback(() => getTenantPath('settings'), [getTenantPath]);
  const getLocationsPath = useCallback(() => getTenantPath('locations'), [getTenantPath]);
  const getMembersPath = useCallback(() => getTenantPath('members'), [getTenantPath]);

  const contextValue: TenantContextValue = useMemo(() => ({
    tenantId, tenant, adminProfile, isLoading, error,
    createAdminAccount, createPartnerAccount, upgradeToAdmin, refreshTenant,
    getProductsPath, getOrdersPath, getCategoriesPath, getCustomersPath,
    getNotificationsPath, getSettingsPath, getLocationsPath, getMembersPath, getTenantPath,
  }), [
    tenantId, tenant, adminProfile, isLoading, error,
    createAdminAccount, createPartnerAccount, upgradeToAdmin, refreshTenant,
    getProductsPath, getOrdersPath, getCategoriesPath, getCustomersPath,
    getNotificationsPath, getSettingsPath, getLocationsPath, getMembersPath, getTenantPath,
  ]);

  return <TenantContext.Provider value={contextValue}>{children}</TenantContext.Provider>;
};

export default TenantProvider;
