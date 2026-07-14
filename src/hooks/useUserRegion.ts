import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CountryCode } from '../utils/phoneUtils';

const FALLBACK: CountryCode = 'IQ';

/**
 * Reads the country the user picked during onboarding (`user_region`)
 * and returns its code as a valid CountryCode for phone inputs.
 */
export function useUserRegion(): CountryCode {
  const [region, setRegion] = useState<CountryCode>(FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('user_region');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.code) {
            setRegion(parsed.code as CountryCode);
          }
        }
      } catch {
        // keep fallback
      }
    })();
  }, []);

  return region;
}
