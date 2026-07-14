/**
 * Safe Firebase Cloud Functions caller.
 * 
 * On iOS with New Architecture, @react-native-firebase/functions has a native
 * memory corruption bug (SIGABRT: "freed pointer was not the last allocation")
 * when parsing Cloud Function responses via the native bridge.
 * 
 * This utility bypasses the native module on iOS by calling Cloud Functions
 * directly over HTTPS, which is functionally identical but avoids the crash.
 */
import { Platform } from 'react-native';
import { getAuth, getIdToken } from '@react-native-firebase/auth';

const PROJECT_ID = 'haryads-56e68';
const REGION = 'us-central1';

/**
 * Call a Firebase Cloud Function safely on all platforms.
 * On Android: uses the native Firebase Functions SDK (fast, reliable).
 * On iOS: uses direct HTTPS fetch (bypasses native crash).
 */
export const safeCall = async (functionName: string, data?: any): Promise<{ data: any }> => {
  if (Platform.OS === 'ios') {
    const user = getAuth().currentUser;
    const token = user ? await getIdToken(user) : '';
    
    const res = await fetch(
      `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: data ?? {} }),
      }
    );
    
    const json = await res.json().catch(() => ({}));
    
    if (!res.ok || json.error) {
      const error: any = new Error(json.error?.message || 'Cloud Function failed');
      error.code = json.error?.status || 'functions/unknown';
      throw error;
    }
    
    return { data: json.result ?? json.data ?? json };
  }
  
  // Android: use native SDK (no crash)
  const { getFunctions, httpsCallable } = require('@react-native-firebase/functions');
  return httpsCallable(getFunctions(), functionName)(data);
};
