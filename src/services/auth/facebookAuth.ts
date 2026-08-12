/**
 * Facebook Login Authentication (Supabase) — DISABLED.
 *
 * `react-native-fbsdk-next` was removed from the project. Autolinking compiled
 * FBSDKCoreKit into the iOS binary, but its Expo config plugin was deliberately
 * off (it emitted a placeholder `fb<APPID>` URL scheme that App Store Connect
 * rejects with error 90158). That left the Meta SDK linked and self-initialising
 * at launch with no `FacebookAppID` / `FacebookClientToken` in Info.plist — a
 * configuration FBSDK 17+ does not tolerate.
 *
 * The sign-in buttons that would reach this file are already gated off behind
 * `{false && ...}` in SignInScreen and PhoneLoginScreen, so nothing user-facing
 * changes. These stubs keep the module's public shape intact for
 * src/services/auth/index.ts and AuthContext.
 *
 * To re-enable: create the Meta app, `npx expo install react-native-fbsdk-next`,
 * add its plugin block to app.config.ts with the real appID + clientToken,
 * restore this file from git history, then `npx expo prebuild --clean -p ios`.
 */

import { User } from '../../types';

const UNAVAILABLE_MESSAGE = 'Facebook Login is not available in this build.';

/**
 * Whether Facebook Sign-In can run. Always false — the native SDK is not linked.
 */
export const isFacebookSignInAvailable = (): boolean => false;

/**
 * Sign in with Facebook via Supabase. Always rejects while the SDK is unlinked.
 */
export const signInWithFacebook = async (): Promise<User> => {
  throw new Error(UNAVAILABLE_MESSAGE);
};

/**
 * Sign out from Facebook. No-op while the SDK is unlinked.
 */
export const signOutFacebook = async (): Promise<void> => {
  // Nothing to sign out of.
};
