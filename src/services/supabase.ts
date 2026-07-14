import 'react-native-url-polyfill/auto';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { createClient, processLock } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Polyfill URL for Supabase on React Native
setupURLPolyfill();

// ── ACTIVE project (post-cutover): the new project — data migrated 2026-06-02,
//    Edge Functions (login, send-push, on-db-change) + notification triggers live here. ──
const supabaseUrl = 'https://krquvafnjuoxdcvzjjtg.supabase.co';
const supabaseAnonKey = 'sb_publishable_rZVwwpCiZNig_SzRDBJtvQ_miUFiXr6';

// ── OLD project (pre-cutover) — kept here for rollback only. Do not use. ──
// const supabaseUrl = 'https://pocdgbrpkuaqxgjcwsqk.supabase.co';
// const supabaseAnonKey = 'sb_publishable_avUzaTNDFbf1AK3ZCQ38nQ_R7usRpbQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in AsyncStorage so users stay logged in across app
    // restarts AND so the PKCE `code_verifier` survives the OAuth browser round
    // trip (without this, Google sign-in on Android silently fails).
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Serialize all auth/refresh operations. React Native has no navigator.locks, so without this
    // two concurrent requests can each try to refresh with the SAME refresh token — and with
    // Supabase's refresh-token rotation the second use is flagged as REUSE, the token is revoked,
    // and the whole session is wiped → the user is silently logged out on the next reopen. This is
    // the official Supabase React Native fix for "logged out after reopening".
    lock: processLock,
    // PKCE returns the auth code as a `?code=` query param, which Android
    // preserves on the `asankary://` redirect. The default `implicit` flow returns
    // tokens in the URL `#hash`, which Android strips from custom-scheme links.
    flowType: 'pkce',
  },
});

// Keep token auto-refresh in sync with app focus. React Native suspends JS timers while
// the app is backgrounded, so without this the access token can sit EXPIRED after the app
// has been closed for a while — and the next refresh attempt can race and fail, firing
// SIGNED_OUT and kicking the user out ("had to log in again after reopening"). On focus,
// startAutoRefresh() also forces an immediate refresh if the stored token is stale, so the
// session is restored seamlessly; stopAutoRefresh() pauses the timer in the background to
// avoid a background/foreground refresh race. (Official Supabase React Native pattern.)
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// AppState 'change' does NOT fire for the INITIAL 'active' state on a cold launch, so the line
// above wouldn't start the refresh ticker until the app is first backgrounded/foregrounded —
// leaving the restored access token to expire and the first profile read to fail (users were
// "logged out" on reopen). Kick off auto-refresh immediately if we launch active.
if (AppState.currentState === 'active') {
  supabase.auth.startAutoRefresh();
}

// Realtime channels MUST use a unique topic per subscription. supabase.channel(name)
// returns the SAME channel object when a topic is reused, and calling `.on(...)` on
// an already-subscribed channel throws ("cannot add postgres_changes callbacks after
// subscribe()"). Several components subscribe to the same entity at once (e.g. the
// always-mounted admin tab bar watches pending orders while a screen also does), so
// every subscription must get its own topic. Always create channels via this helper.
let _channelSeq = 0;
export const uniqueChannel = (base: string) => supabase.channel(`${base}_${++_channelSeq}`);
