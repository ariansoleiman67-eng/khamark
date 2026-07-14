// Samsung Accessibility Patches - must be first imports
import 'react-native-get-random-values';
// Adds crypto.subtle.digest (expo-crypto) so Supabase PKCE uses SHA-256, not plain
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

// Ignore Expo 54 file-system deprecation warnings that come from third-party packages
LogBox.ignoreLogs([
  'Method downloadAsync imported from "expo-file-system" is deprecated',
  'Method getInfoAsync imported from "expo-file-system" is deprecated',
  'Method readAsStringAsync imported from "expo-file-system" is deprecated',
]);
import * as SplashScreenExpo from 'expo-splash-screen';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import * as Location from 'expo-location';

import { ThemeProvider } from './src/components/ThemeProvider';
import { AuthProvider } from './src/contexts/AuthContext';
import { TenantProvider } from './src/contexts/TenantContext';
import { CurrencyProvider } from './src/contexts/CurrencyContext';
import { CartProvider } from './src/contexts/CartContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';
import VideoSplash from './src/components/SplashScreen';
import OnboardingScreen from './src/screens/auth/OnboardingScreen';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
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




export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null); // null = loading

  // Step 0: Keep native splash visible until custom splash poster is showing.
  // The handleSplashStart callback hides it when our poster is rendered.
  const handleSplashStart = useCallback(() => {
    SplashScreenExpo.hideAsync().catch(() => {});
  }, []);

  // Step 1: Load resources (runs in background while video splash plays)
  useEffect(() => {
    async function prepare() {
      try {
        // Request App Tracking Transparency Permission (Required for iOS with Facebook SDK)
        const { status } = await requestTrackingPermissionsAsync().catch(() => ({ status: 'undetermined' }));
        console.log('App Tracking Transparency Status:', status);

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
        });
      }
    }

    prepare();
  }, []);

  // Step 2: Backstop only — VideoSplash already self-finishes (plays to end → fades →
  // onFinish, with its own 6s internal failsafe). This timer just guarantees we never
  // hang behind the splash if onFinish never fires. It must sit ABOVE the full intro
  // length (~4.7s) + VideoSplash's 6s internal failsafe + fade, or it would cut the
  // video off early — so 8s, not 3s.
  useEffect(() => {
    if (isReady) {
      const t = setTimeout(() => {
        setShowCustomSplash(false);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [isReady]);

  const handleSplashFinish = useCallback(() => {
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
    // Failsafe: if the custom splash finished early but app still not ready
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }



  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <ThemeProvider>
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
                      {showCustomSplash && (
                        <VideoSplash onFinish={handleSplashFinish} onStart={handleSplashStart} />
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
