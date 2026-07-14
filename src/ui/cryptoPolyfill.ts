// WebCrypto `subtle.digest` polyfill for React Native.
//
// React Native has no WebCrypto. Supabase Auth (PKCE flow) calls
// `crypto.subtle.digest('SHA-256', ...)` to build an S256 code challenge for
// OAuth (e.g. Google sign-in). Without it, gotrue-js logs
//   "WebCrypto API is not supported. Code challenge method will default to use
//    plain instead of sha256."
// and downgrades to the weaker `plain` method. We back `digest` with
// expo-crypto's native hashing so PKCE stays on S256.
//
// `react-native-get-random-values` (imported before this) already provides
// `crypto.getRandomValues`; here we only add `crypto.subtle.digest`.
import * as ExpoCrypto from 'expo-crypto';

const ALGO_MAP: Record<string, ExpoCrypto.CryptoDigestAlgorithm> = {
  'SHA-1': ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

try {
  const g = global as any;
  if (!g.crypto) g.crypto = {};
  // Only install if a real WebCrypto subtle.digest isn't already present.
  if (!g.crypto.subtle || typeof g.crypto.subtle.digest !== 'function') {
    const subtle = g.crypto.subtle || {};
    subtle.digest = (algorithm: any, data: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer> => {
      const name = (typeof algorithm === 'string' ? algorithm : algorithm?.name || '').toUpperCase();
      const algo = ALGO_MAP[name];
      if (!algo) return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
      return ExpoCrypto.digest(algo, bytes as unknown as ArrayBuffer);
    };
    g.crypto.subtle = subtle;
  }
} catch {
  // If the platform's crypto object is frozen/unavailable, leave PKCE on its
  // existing fallback rather than crashing app startup.
}
