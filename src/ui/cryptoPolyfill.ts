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
// This file also provides `crypto.getRandomValues`, which used to come from
// `react-native-get-random-values`. That package was removed: it is an extra
// native module on the launch path, Expo SDK 54 pins it at ~1.11.0 while the
// project had 2.0.0 (a codegen TurboModule), and the sibling forked-from
// project — whose iOS Release build runs — does not include it at all. Its only
// job was to bridge to a native RNG, and expo-crypto (already a dependency)
// exposes the same thing natively via CryptoModule.swift's getRandomValues.
import * as ExpoCrypto from 'expo-crypto';

// Install `crypto.getRandomValues` first — Supabase's PKCE flow and uuid both
// reach for it, and the digest polyfill below shares the same `crypto` object.
try {
  const g = global as any;
  if (!g.crypto) g.crypto = {};
  if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      // expo-crypto fills the array in place and returns it.
      return ExpoCrypto.getRandomValues(array as never) as unknown as T;
    };
  }
} catch {
  // Leave whatever the platform provides rather than crashing app startup.
}

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
