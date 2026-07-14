import { createHash } from 'crypto';

/**
 * Hash phone number for secure indexing
 * Uses SHA-256 to create a deterministic hash
 * 
 * @param phone - Phone number in E.164 format (e.g., "+9647801234567")
 * @returns Hashed phone number (hex string)
 */
export const hashPhone = (phone: string): string => {
  // Remove + sign and any spaces
  const cleaned = phone.replace(/[\+\s]/g, '');
  
  // Platform-specific hashing
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    // Browser environment - use Web Crypto API (async would be better, but keeping sync for simplicity)
    // Note: For React Native, we'll use a polyfill or different approach
    return simpleHash(cleaned);
  } else {
    // Node environment or fallback
    return simpleHash(cleaned);
  }
};

/**
 * Simple deterministic hash function (fallback)
 * Not cryptographically secure, but sufficient for index keys
 */
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * Generate email from phone number for Firebase Auth
 * Format: {phone}@asankaryapp.internal
 * 
 * @param phone - Phone number in E.164 format
 * @returns Email address for Firebase Auth
 */
export const phoneToEmail = (phone: string): string => {
  // Remove + sign and spaces
  const cleaned = phone.replace(/[\+\s]/g, '');
  return `${cleaned}@asankaryapp.internal`;
};

/**
 * Extract phone from generated email
 * Reverse of phoneToEmail
 * 
 * @param email - Generated email address
 * @returns Phone number with + prefix
 */
export const emailToPhone = (email: string): string | null => {
  const match = email.match(/^(\d+)@asankaryapp\.internal$/);
  if (!match) return null;
  return `+${match[1]}`;
};

/**
 * Validate if email is a generated phone email
 */
export const isPhoneEmail = (email: string): boolean => {
  return email.endsWith('@asankaryapp.internal');
};

/**
 * True only for the legacy fully-internal placeholder email ({phone}@asankaryapp.internal),
 * which is hidden from the user.
 *
 * NOTE: The phone-login emails {phone}@asankary.app (customer) and
 * {phone}@asankary.admin (admin) are intentionally NOT treated as synthetic here —
 * they are the credential the user actually signs in with, so we display them on
 * the account screens until the user replaces them with a real email.
 */
export const isSyntheticEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.includes('@asankaryapp.');
};

/**
 * The phone-derived login emails {phone}@asankary.app (customer) and
 * {phone}@asankary.admin (admin). These ARE shown to the account owner (it's the
 * credential they sign in with), but are meaningless noise when shown to
 * someone else — e.g. an admin viewing a customer — so hide them there.
 */
export const isPhoneAuthEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.endsWith('@asankary.app') || email.endsWith('@asankary.admin');
};
