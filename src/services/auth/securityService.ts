import { supabase } from '../supabase';
/**
 * Security Service (Supabase Auth)
 *
 * Centralized service for all Account & Security operations.
 * Uses Supabase Auth exclusively (supabase.auth.*).
 *
 * No screen should import auth SDKs directly for security ops.
 * All sensitive actions go through runSensitiveAction() which handles
 * re-authentication automatically via ReauthModal.
 *
 * Provider IDs are normalized to the legacy Firebase-style strings
 * ('password' | 'apple.com' | 'google.com' | 'phone') so the existing
 * lockout logic and screens keep working unchanged.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { isSyntheticEmail } from '../../utils/hashUtils';
import { Platform } from 'react-native';

// ─── Current-user cache ──────────────────────────────────
// getAuthState() is called synchronously inside render bodies, but Supabase
// only exposes the user asynchronously. We keep the last-known user in a
// module cache that reloadUser() refreshes; screens already call
// `reloadUser().then(refreshUser)` (reload → re-render) so the cache is
// populated before the derived UI matters.
let cachedUser: any = null;

const isInternalEmail = (email?: string | null): boolean =>
  !!email && (isSyntheticEmail(email) || email.includes('@asankaryapp.'));

/** Map a Supabase provider name to the legacy Firebase-style id the UI expects. */
const toLegacyProviderId = (provider: string): string => {
  switch (provider) {
    case 'email': return 'password';
    case 'apple': return 'apple.com';
    case 'google': return 'google.com';
    case 'phone': return 'phone';
    default: return provider;
  }
};

/** Read the raw Supabase provider names linked to the cached user. */
const rawProviders = (user: any): string[] => {
  if (Array.isArray(user?.identities) && user.identities.length) {
    return user.identities.map((i: any) => i.provider);
  }
  return user?.app_metadata?.providers ?? (user?.app_metadata?.provider ? [user.app_metadata.provider] : []);
};

// ─── Types ───────────────────────────────────────────────

export interface AuthState {
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  hasPassword: boolean;
  hasApple: boolean;
  hasGoogle: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  providers: string[];
  /** Total distinct sign-in methods linked */
  providerCount: number;
}

export type ReauthMethod = 'password' | 'apple' | 'signout';

// ─── State Derivation ────────────────────────────────────

/**
 * Derive all Account & Security UI state from the cached Supabase user.
 * Single source of truth — call reloadUser() before reading after a mutation.
 *
 * `firestoreEmail` (the email the app has in the users table) is used as a
 * fallback so password/email state is correct even before the cache warms.
 */
export function getAuthState(firestoreEmail?: string | null): AuthState {
  const user = cachedUser;
  const legacy = rawProviders(user).map(toLegacyProviderId);
  const providers = Array.from(new Set(legacy));

  const hasPassword =
    providers.includes('password') ||
    isInternalEmail(firestoreEmail) ||
    isInternalEmail(user?.email);

  return {
    email: user?.email ?? null,
    emailVerified: !!user?.email_confirmed_at,
    phone: user?.phone ?? null,
    hasPassword,
    hasApple: providers.includes('apple.com'),
    hasGoogle: providers.includes('google.com'),
    hasPhone: providers.includes('phone') || !!user?.phone,
    hasEmail: !!user?.email && !isInternalEmail(user?.email),
    providers,
    providerCount: providers.length,
  };
}

/**
 * Get normalized list of provider IDs from the cached user.
 */
export function getProviders(): string[] {
  return getAuthState().providers;
}

/**
 * Refresh the cached Supabase user (call after every mutation).
 */
export async function reloadUser(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    cachedUser = data?.user ?? null;
  } catch { /* keep last-known cache on transient failure */ }
}

// ─── Error Normalization ─────────────────────────────────

/**
 * Check if an error requires recent login. Supabase does not enforce
 * Firebase's requires-recent-login, but we keep the detection so any
 * leftover/edge errors still route through the reauth retry once.
 */
function isRecentLoginRequired(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    code.includes('requires-recent-login') ||
    msg.includes('requires-recent-login') ||
    msg.includes('reauthentication') ||
    msg.includes('recent authentication') ||
    msg.includes('recent login')
  );
}

/**
 * Map auth errors to user-friendly messages.
 * Handles both legacy Firebase codes and Supabase error messages.
 */
export function mapFirebaseError(error: any, context?: 'phone' | 'email' | 'password'): string {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();

  const map: Record<string, string> = {
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect password or credential.',
    'auth/email-already-in-use': 'This email is already in use by another account.',
    'auth/credential-already-in-use': context === 'phone'
      ? 'This phone number is linked to another account.'
      : 'This credential is linked to another account.',
    'auth/provider-already-linked': 'This provider is already linked to your account.',
    'auth/invalid-verification-code': 'Incorrect verification code.',
    'auth/code-expired': 'Code has expired. Please request a new one.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/requires-recent-login': 'Please verify your identity to continue.',
  };
  if (map[code]) return map[code];

  // Supabase message normalization
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) return 'Incorrect password.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'This email is already in use by another account.';
  if (msg.includes('email_exists') || msg.includes('email address is already')) return 'This email is already in use by another account.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a moment.';
  if (msg.includes('network')) return 'Network error. Check your connection.';

  return error?.message || 'An error occurred.';
}

// ─── Core: runSensitiveAction ────────────────────────────

/**
 * Execute a sensitive action with automatic reauth retry.
 *
 * Behavior:
 *   1. Tries the action
 *   2. If a reauth-required error surfaces → calls onReauthRequired → retries ONCE
 *   3. If retry fails → bubbles the error (no infinite loop)
 *   4. Non-reauth errors are NEVER swallowed — always rethrown
 *
 * Note: Supabase generally does NOT require recent login for updateUser, so in
 * practice the action usually succeeds on the first try without a reauth prompt.
 */
export async function runSensitiveAction(
  action: () => Promise<void>,
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (e: any) {
    if (isRecentLoginRequired(e)) {
      await onReauthRequired();
      await action();
      return;
    }
    throw e; // Non-reauth errors always bubble
  }
}

// ─── Reauth Methods ──────────────────────────────────────

/**
 * Determine the best reauth method for the current user.
 */
export async function getBestReauthMethod(): Promise<ReauthMethod> {
  const state = getAuthState();
  if (state.hasPassword) return 'password';
  if (state.hasApple && Platform.OS === 'ios') {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (isAvailable) return 'apple';
  }
  return 'signout';
}

/**
 * Reauthenticate with password by re-verifying credentials against Supabase.
 * A successful sign-in also refreshes the session (the "recent login").
 */
export async function reauthWithPassword(currentPassword: string): Promise<void> {
  await reloadUser();
  const email = cachedUser?.email as string | undefined;
  const phone = cachedUser?.phone as string | undefined;

  const { error } = email
    ? await supabase.auth.signInWithPassword({ email, password: currentPassword })
    : phone
      ? await supabase.auth.signInWithPassword({ phone, password: currentPassword })
      : { error: new Error('No email or phone on account') as any };

  if (error) {
    // Normalize to the code ReauthModal checks for, so it shows "Incorrect password".
    const err: any = new Error(mapFirebaseError(error, 'password'));
    err.code = 'auth/invalid-credential';
    throw err;
  }
}

/**
 * Reauthenticate with Apple Sign-In (iOS only).
 * Re-signs in with Apple, which refreshes the Supabase session.
 */
export async function reauthWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [], // No scopes needed for reauth
  });

  if (!credential.identityToken) {
    throw new Error('Apple reauth failed: no identity token');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

// ─── Lockout Protection ──────────────────────────────────

/**
 * Check if a provider can be safely unlinked.
 * Returns false if unlinking would leave 0 sign-in methods.
 */
export function canUnlink(providerId: string): boolean {
  const state = getAuthState();
  const remaining = state.providers.filter((p: string) => p !== providerId);
  return remaining.length > 0;
}

/**
 * Assert that unlinking won't lock the user out.
 * Throws a user-friendly error if it would.
 */
export function assertCanUnlink(providerId: string): void {
  if (!canUnlink(providerId)) {
    throw new Error('Add another sign-in method before disconnecting this one.');
  }
}

/**
 * Verify the user will still have at least one provider after removing `providerId`.
 * Returns the remaining provider count.
 */
export function requireAtLeastOneProviderAfter(providerId: string): number {
  const state = getAuthState();
  const remaining = state.providers.filter((p: string) => p !== providerId);
  if (remaining.length === 0) {
    throw new Error('Add another sign-in method before disconnecting this one.');
  }
  return remaining.length;
}

// ─── Email ───────────────────────────────────────────────

/**
 * Send a verification email to the current user's email via Supabase.
 * (Supabase sends the confirmation/verification mail from the project's
 * configured SMTP.)
 */
export async function sendEmailVerification(): Promise<void> {
  await reloadUser();
  const userEmail = cachedUser?.email as string | undefined;
  if (!userEmail || isInternalEmail(userEmail)) throw new Error('No email on account');

  const { error } = await supabase.auth.resend({ type: 'signup', email: userEmail });
  if (error) throw error;
}

/**
 * Request an email change. Supabase sends a confirmation link to the new
 * address (and notifies the old one); the email updates only after the user
 * confirms. UI should show "check inbox" and call reloadUser() on return.
 */
export async function requestEmailChange(
  newEmail: string,
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await runSensitiveAction(
    async () => {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
    },
    onReauthRequired,
  );
}

// ─── Password (set-vs-change) ────────────────────────────

/**
 * Change password (user already has a password provider).
 */
export async function changePassword(
  newPassword: string,
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await runSensitiveAction(
    async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await reloadUser();
    },
    onReauthRequired,
  );
}

/**
 * Set a password for an account that doesn't have one yet (e.g., Apple-only user).
 * In Supabase, setting a password also requires an email on the account so the
 * user can sign in with email+password afterwards.
 */
export async function setPassword(
  email: string,
  newPassword: string,
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  if (!email) throw new Error('An email address is required before setting a password. Please add your email first.');

  await runSensitiveAction(
    async () => {
      const updates: { email?: string; password: string } = { password: newPassword };
      // Attach the email if the account doesn't already have this (real) email.
      if (email && email !== cachedUser?.email) updates.email = email;
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      await reloadUser();
    },
    onReauthRequired,
  );
}

// ─── Provider Link / Unlink ──────────────────────────────

/**
 * Unlink a provider via Supabase identities, with lockout + reauth protection.
 */
async function unlinkProvider(
  supabaseProvider: 'apple' | 'google' | 'phone',
  legacyId: string,
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await reloadUser();
  assertCanUnlink(legacyId);

  await runSensitiveAction(
    async () => {
      const { data, error: idErr } = await supabase.auth.getUserIdentities();
      if (idErr) throw idErr;
      const identity = data?.identities?.find((i: any) => i.provider === supabaseProvider);
      if (!identity) throw new Error('This sign-in method is not linked to your account.');
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      await reloadUser();
    },
    onReauthRequired,
  );
}

/**
 * Link Apple to the current Supabase user (iOS).
 * Uses Supabase manual identity linking — this must be enabled in the
 * Supabase dashboard (Authentication → enable "Manual Linking").
 */
export async function linkApple(): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple' });
  if (error) throw error;
  await reloadUser();
}

/**
 * Unlink Apple with lockout + reauth protection.
 */
export async function unlinkApple(
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await unlinkProvider('apple', 'apple.com', onReauthRequired);
}

/**
 * Unlink Google with lockout + reauth protection.
 */
export async function unlinkGoogle(
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await unlinkProvider('google', 'google.com', onReauthRequired);
}

/**
 * Unlink phone with lockout + reauth protection.
 */
export async function unlinkPhone(
  onReauthRequired: () => Promise<void>,
): Promise<void> {
  await unlinkProvider('phone', 'phone', onReauthRequired);
}

/**
 * Check if it's safe to change phone (unlink old + link new).
 * Returns true if the user has at least one OTHER provider besides phone.
 */
export function canChangePhone(): boolean {
  return canUnlink('phone');
}
