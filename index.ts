// import { enableScreens } from 'react-native-screens';
import { AppRegistry, Alert, Platform } from 'react-native';

// ==========================================
// GLOBAL FATAL ERROR CATCHER
// ==========================================
// This runs BEFORE React even mounts. It will catch any syntax errors,
// missing modules, or undefined function calls that cause the white screen hang.
const originalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
  console.error("FATAL APPREGISTRY ERROR:", error);
  
  if (isFatal) {
    Alert.alert(
      'Fatal App Error',
      `Error: ${error.message || error}\n\nPlease take a screenshot of this and send it to the developer.`,
      [{ text: 'OK' }]
    );
  }

  // Still call the original handler so Expo/Crashlytics can see it
  if (originalHandler) {
    originalHandler(error, isFatal);
  }
});
// ==========================================
import App from './App';
import NotificationService from './src/services/NotificationService';
import { NativeModules } from 'react-native';
import { locationService } from './src/services/locationService';

// PROD-FIX: Disable native screens entirely to prevent Resume Crash/White Screen
// This reverts navigation to use pure React Native Views (stable but higher memory)
// enableScreens(false); // RESTORED DEFAULT

// Initialize location service
locationService.init();

// --- BACKGROUND HANDLER (SAFE SETUP) ---
// We wrap this to ensure it doesn't crash the app entry
const setupBackgroundHandler = () => {
  try {
    if (NativeModules.RNFBAppModule) {
      const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
      const msg = getMessaging();
      setBackgroundMessageHandler(msg, async (remoteMessage: any) => {
        // console.log('Background/Quit message:', remoteMessage);
        
        // Handle data-only messages
        if (!remoteMessage.notification) {
          const { title, body } = remoteMessage.data || {};
          if (title || body) {
              await NotificationService.scheduleLocalNotification(
                  title || 'New Notification',
                  body || 'You have a new update',
                  remoteMessage.data
              );
          }
        }
        
        // Update badge
        try {
            await NotificationService.updateBadgeCount();
        } catch {}
      });
    }
  } catch (e) {
    // console.error('Background handler setup failed', e);
  }
};

setupBackgroundHandler();

// PROD-FIX: Use Expo's registerRootComponent to ensure the Expo environment
// (like Splash Screen auto-hiding root wrappers) is correctly initialized.
import { registerRootComponent } from 'expo';
registerRootComponent(App);
