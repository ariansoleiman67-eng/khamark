import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, uniqueChannel } from '../services/supabase';
import { useAuth } from './AuthContext';
import { formatPrice } from '../utils/currency';
import { setCurrentExchangeRate } from '../utils/exchangeRate';

const EXCHANGE_RATE_CACHE_KEY = 'cached_exchangeRateIQD';

interface CurrencyContextType {
  currency: 'USD' | 'IQD';
  setCurrency: (currency: 'USD' | 'IQD') => Promise<void>;
  exchangeRateIQD: number;
  exchangeRateLoaded: boolean;
  formatAmount: (amountUSD: number, options?: any) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<'USD' | 'IQD'>('USD');
  const [exchangeRateIQD, setExchangeRateIQD] = useState<number>(1500);
  const [exchangeRateLoaded, setExchangeRateLoaded] = useState(false);
  const { user } = useAuth();
  // Guards the mount-time race between the cache-hydration effect and the
  // server-fetch effect: once the server rate has been applied, a late-resolving
  // cache read must NOT overwrite it with a stale value.
  const serverRateApplied = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(EXCHANGE_RATE_CACHE_KEY).then(cached => {
      if (cached) {
        const parsed = parseFloat(cached);
        // Only seed from cache if the server hasn't already applied a fresher rate.
        if (!isNaN(parsed) && parsed > 0 && !serverRateApplied.current) {
          setExchangeRateIQD(parsed);
        setCurrentExchangeRate(parsed);
        }
      }
    });
  }, []);

  useEffect(() => {
    // The IQD exchange rate is a single shop-wide value the admin saves to
    // global_settings/business_info (settingsService.updateBusinessInfo). Both
    // guests and admins must read it from there — the previous code read a
    // non-existent `settings` table / `tenants.exchange_rate_iqd` column, so the
    // configured rate never applied and everyone got the hardcoded fallback.
    const applyRate = (rate: unknown) => {
      const n = Number(rate);
      if (n > 0) {
        serverRateApplied.current = true;
        setExchangeRateIQD(n);
        // Mirror it where the pricing layer can read it. Services and reducers
        // price dinar-authored products without a React context in hand.
        setCurrentExchangeRate(n);
        AsyncStorage.setItem(EXCHANGE_RATE_CACHE_KEY, String(n)).catch(() => {});
      }
    };

    const fetchRate = async () => {
      try {
        const { data } = await supabase.from('global_settings').select('data').eq('id', 'business_info').single();
        applyRate((data?.data as any)?.exchangeRateIQD);
      } catch {
        // keep cached/fallback rate
      } finally {
        setExchangeRateLoaded(true);
      }
    };

    fetchRate();

    const channel = uniqueChannel('public:global_settings:business_info')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_settings', filter: 'id=eq.business_info' }, (payload: any) => {
        applyRate(payload.new?.data?.exchangeRateIQD);
      })
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The device-local choice is the source of truth: it always reflects what the
      // user last picked on THIS device. A stale or failed DB sync must never override
      // it — that override caused "set USD, reopen, it flips back to IQD" (the users-row
      // write can silently fail on RLS while only the auth-metadata copy updates).
      // Only seed from the signed-in user's saved currency when there's no local choice
      // yet (fresh install / new device).
      // Default is always USD. Only a device-local choice changes it — do NOT
      // seed IQD from the user's saved DB preference; USD stays until the user
      // explicitly switches on this device.
      const local = await AsyncStorage.getItem('preferredCurrency');
      if (cancelled) return;
      if (local === 'USD' || local === 'IQD') {
        setCurrencyState(local);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const setCurrency = useCallback(async (newCurrency: 'USD' | 'IQD') => {
    setCurrencyState(newCurrency);
    // AsyncStorage is the authoritative per-device record of the choice.
    await AsyncStorage.setItem('preferredCurrency', newCurrency);
    if (user) {
      // Best-effort cross-device sync; a DB/RLS failure must not break the local choice.
      try {
        await supabase.auth.updateUser({ data: { preferred_currency: newCurrency } });
        await supabase.from('users').update({ preferred_currency: newCurrency }).eq('id', user.uid);
      } catch {
        /* ignore — AsyncStorage already persisted it for this device */
      }
    }
  }, [user]);

  const formatAmount = useCallback((amountUSD: number, options?: any) => {
    return formatPrice(amountUSD, currency, exchangeRateIQD, options);
  }, [currency, exchangeRateIQD]);

  const value = useMemo(
    () => ({ currency, setCurrency, exchangeRateIQD, exchangeRateLoaded, formatAmount }),
    [currency, setCurrency, exchangeRateIQD, exchangeRateLoaded, formatAmount]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
