import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';

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

  useEffect(() => {
    const fetchAdminData = async () => {
      if (!user || !user.uid) {
        setTenantId(null);
        setTenant(null);
        setAdminProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: userData, error: userError } = await supabase.from('users').select('*').eq('id', user.uid).single();
        if (userError) throw userError;

        if (userData?.is_admin) {
          const adminData: AdminDocument = {
            uid: userData.id,
            email: userData.email,
            phone: userData.phone,
            displayName: userData.name || userData.full_name || '',
            tenantId: userData.id,
            role: userData.role === 'admin' ? 'admin' : 'owner',
            createdAt: userData.created_at,
            updatedAt: userData.updated_at,
          };
          
          setAdminProfile(adminData);
          setTenantId(adminData.tenantId);

          const { data: tenantData } = await supabase.from('tenants').select('*').eq('id', adminData.tenantId).single();
          if (tenantData) {
            setTenant({
              id: tenantData.id,
              name: tenantData.store_name,
              ownerUid: tenantData.owner_id,
              ownerEmail: userData.email,
              createdAt: tenantData.created_at,
              updatedAt: tenantData.updated_at,
              settings: { currency: 'USD', timezone: 'Asia/Baghdad', language: 'en' },
            });
          }
        } else {
          setAdminProfile(null);
          setTenantId(null);
          setTenant(null);
        }
      } catch (err: any) {
        console.error('Error fetching admin data:', err);
        setError(err.message || 'Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminData();
  }, [user]);

  const createAdminAccount = useCallback(async (displayName: string, storeName: string, phone?: string, whatsapp?: string) => {
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
  }, [user]);

  const upgradeToAdmin = useCallback(async (storeName: string) => {
    if (!user) throw new Error('User must be authenticated to upgrade to admin');
    return createAdminAccount(user.fullName || 'Admin', storeName);
  }, [user, createAdminAccount]);

  // Promote the signed-in user to a VIEW-ONLY partner (no store). Mirrors createAdminAccount
  // but via the create_partner_account RPC. The owner shares products to them afterward.
  const createPartnerAccount = useCallback(async (displayName: string, phone?: string) => {
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
