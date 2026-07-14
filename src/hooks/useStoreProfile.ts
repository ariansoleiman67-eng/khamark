import { useState, useEffect, useCallback } from 'react';
import { storeProfileService, StoreProfile } from '../services/storeProfileService';

interface UseStoreProfileResult {
  storeProfile: StoreProfile | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage store profile data
 * Centralizes duplicate logic from HomeScreen and StoreProductsScreen
 */
export const useStoreProfile = (tenantId?: string): UseStoreProfileResult => {
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const profile = await storeProfileService.getStoreProfile(tenantId);
      setStoreProfile(profile);
    } catch (err) {
      console.error('Error in useStoreProfile:', err);
      setError(err instanceof Error ? err : new Error('Failed to load store profile'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { storeProfile, loading, error, refresh: fetchProfile };
};
