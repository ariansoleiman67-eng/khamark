// Samsung Accessibility Patches - must be first imports
// Installs crypto.getRandomValues AND crypto.subtle.digest, both backed by
// expo-crypto, so Supabase PKCE uses SHA-256 rather than plain. This replaces
// react-native-get-random-values — see the note in cryptoPolyfill.ts.
import './src/ui/cryptoPolyfill';
// import './src/ui/patchText';
// import './src/ui/patchPressable'; // DISABLED: May block animations - testing
import './src/ui/patchView';
import './src/ui/patchTextInput';

import { applyAndroidGlobalFix } from './src/ui/androidGlobalFix';

// Apply global Android fixes (Text/Input clipping & scroll)
applyAndroidGlobalFix();

import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nManager, View, LogBox, InteractionManager } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Ignore Expo 54 file-system deprecation warnings that come from third-party packages
LogBox.ignoreLogs([
  'Method downloadAsync imported from "expo-file-system" is deprecated',
  'Method getInfoAsync imported from "expo-file-system" is deprecated',
  'Method readAsStringAsync imported from "expo-file-system" is deprecated',
  // Harmless: some auth screens animate a Text's opacity alongside an entering
  // animation. No visual/behavior impact; silence the dev-only noise.
  '[Reanimated] Property "opacity" of AnimatedComponent(Text) may be overwritten by a layout animation',
]);

// Turn off Reanimated's strict-mode logger — it prints the harmless "opacity …
// may be overwritten by a layout animation" WARN to the terminal (LogBox only
// hides the on-device popup). strict:false stops it at the source.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });
import * as SplashScreenExpo from 'expo-splash-screen';
import * as Location from 'expo-location';

import { ThemeProvider } from './src/components/ThemeProvider';
import { AuthProvider } from './src/contexts/AuthContext';
import { TenantProvider } from './src/contexts/TenantContext';
import { CurrencyProvider } from './src/contexts/CurrencyContext';
import { CartProvider } from './src/contexts/CartContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';
import AnimatedLogoSplash from './src/components/AnimatedLogoSplash';
import OnboardingScreen from './src/screens/auth/OnboardingScreen';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppAlertHost from './src/components/AppAlertHost';
import ForceUpdateModal from './src/components/ForceUpdateModal';
import { FlyToCartLayer } from './src/ui/FlyToCartLayer';
import { ImageEditorModal } from './src/features/image-editor';


// Initialize i18n
import './src/locales';

import { NotificationService } from './src/services/NotificationService';
import { initializePushHandlers, getNavigationTarget } from './src/hooks/usePushMessageHandler';
// import messaging from '@react-native-firebase/messaging';

// Prevent the splash screen from auto-hiding
SplashScreenExpo.preventAutoHideAsync().catch(() => {});

// ============================================
// FCM PUSH HANDLERS INITIALIZATION
// Must be called at module level for background message handling safer uppon to the top so it can handel flex pro be it .
// ============================================
initializePushHandlers((type, data) => {
  // Navigation callback for push tap handling
  // This will be wired to navigation after app is ready
  const target = getNavigationTarget(type, data);
  if (target) {
    // eslint-disable-next-line no-console
    console.log('Push tap navigation target:', target);
    // Navigation is handled by storing the target and checking on app resume
    // The actual navigation happens in AppNavigator via linking config
  }
});


// ============================================
// GLOBAL TEXT STABILITY FIXES (Android + iOS)
// ============================================

// Disable Android auto-RTL globally - text direction controlled per-component
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);




// Intro splash: an animated logo that paints on the first frame. The old video
// splash cost several seconds of startup AND kept a 1.5 MB mp4 + expo-video on
// the boot graph, so it is no longer imported here at all — src/components/
// SplashScreen.tsx still exists if it's ever wanted back.
const SHOW_LOGO_SPLASH = true;
const SPLASH_ENABLED = SHOW_LOGO_SPLASH;

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [showCustomSplash, setShowCustomSplash] = useState(SPLASH_ENABLED);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null); // null = loading

  // Step 0: Keep native splash visible until custom splash poster is showing.
  // The handleSplashStart callback hides it when our poster is rendered.
  const handleSplashStart = useCallback(() => {
    SplashScreenExpo.hideAsync().catch(() => {});
  }, []);

  // With the video splash disabled nothing else calls hideAsync on the happy path,
  // so the native splash would sit on top of a running app forever. Hide it as soon
  // as the app has loaded its resources.
  useEffect(() => {
    if (!SPLASH_ENABLED && isReady) {
      SplashScreenExpo.hideAsync().catch(() => {});
    }
  }, [isReady]);

  // Step 1: Load resources (runs in background while video splash plays)
  useEffect(() => {
    async function prepare() {
      try {
        // NOTE: App Tracking Transparency is deliberately NOT awaited here. It
        // presents a system dialog on iOS that does not resolve until the user
        // taps it, and this ran before setIsReady(true) — so the app sat on the
        // splash for as long as the user hesitated. It now fires after the first
        // interactions (below), which is also what Apple's guidance prefers.

        // Check if onboarding is complete
        const isCompleted = await AsyncStorage.getItem('onboarding_complete');
        if (isCompleted === 'true') {
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
        }
      } catch (e) {
        console.error('CRITICAL: Error during app preparation:', e);
      } finally {
        // Paint the first interactive frame immediately. Push registration is NOT
        // needed for first paint, so it no longer gates the splash (it previously
        // blocked boot by up to 4s on a slow network). Defer it until after the
        // first interactions — the push token still registers, just slightly later.
        setIsReady(true);
        InteractionManager.runAfterInteractions(() => {
          NotificationService.initialize().catch(err => console.error('Notification init failed:', err));
          // No App Tracking Transparency prompt: the app runs no ad SDK and does no
          // cross-app tracking, so asking would contradict the "no tracking" answer in
          // App Store Connect's privacy questionnaire — a guaranteed review rejection.
          // If an ad network is ever added, restore the prompt AND update App Privacy.
        });
      }
    }

    prepare();
  }, []);

  // Step 2: Backstop only — the splash self-finishes via its own animation callback.
  // This guarantees we never hang behind it if that callback never fires. The logo
  // splash runs well under a second, so a 3s guard is plenty.
  useEffect(() => {
    if (isReady && SPLASH_ENABLED) {
      const t = setTimeout(() => {
        // If onFinish never fires at all, this backstop is the only teardown path, so it
        // must also hide the native splash — otherwise it would strand it on top of a
        // fully-running app. hideAsync() is idempotent and safe to call more than once.
        SplashScreenExpo.hideAsync().catch(() => {});
        setShowCustomSplash(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [isReady]);

  const handleSplashFinish = useCallback(() => {
    // Hide the native splash on EVERY teardown path, not just the video's happy-path
    // onStart(readyToPlay). The video-error and failsafe-timeout exits call onFinish
    // without ever firing onStart, so without this the native splash would stay on top of
    // the running app forever. hideAsync() is idempotent, so double-calling is harmless.
    SplashScreenExpo.hideAsync().catch(() => {});
    setShowCustomSplash(false);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Request location right after splash and onboarding
  useEffect(() => {
    if (isReady && !showCustomSplash && showOnboarding === false) {
      const requestLocation = async () => {
        try {
          await Location.requestForegroundPermissionsAsync();
        } catch (e) {
          console.warn('Location prompt error:', e);
        }
      };
      requestLocation();
    }
  }, [isReady, showCustomSplash, showOnboarding]);

  const onLayoutRootView = React.useCallback(() => {
    // Root view laid out - app is rendering
  }, []);

  if (!isReady && !showCustomSplash) {
    // Failsafe: the splash animation can finish before resources are ready. Match
    // the splash background so this reads as a continuation, not a black flash.
    return <View style={{ flex: 1, backgroundColor: SHOW_LOGO_SPLASH ? '#FFFFFF' : '#000000' }} />;
  }



  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <ThemeProvider>
          <AppAlertHost />
          <AuthProvider>
            <TenantProvider>
              <CurrencyProvider>
                <CartProvider>
                  <FavoritesProvider>
                    <NotificationProvider>
                      <StatusBar style="auto" />
                      {isReady && (
                        <>
                          <ForceUpdateModal />
                          <AppNavigator />
                          <FlyToCartLayer />
                          <ImageEditorModal />
                        </>
                      )}
                      {/* Onboarding overlay - shows after video splash, before main app */}
                      {isReady && !showCustomSplash && showOnboarding && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998, elevation: 9998 }}>
                          <OnboardingScreen onComplete={handleOnboardingComplete} />
                        </View>
                      )}
                      {showCustomSplash && SHOW_LOGO_SPLASH && (
                        <AnimatedLogoSplash onFinish={handleSplashFinish} onStart={handleSplashStart} />
                      )}
                    </NotificationProvider>
                  </FavoritesProvider>
                </CartProvider>
              </CurrencyProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
