import { ConfigContext, ExpoConfig } from "expo/config";

// Brand color palette — Amber Retail (Phase 3). Drives splash + adaptive-icon + notification bg.
const colors = {
  primary: "#F5A00A",
  primaryVariant: "#FF9F0D",
  secondary: "#2B2B2B",
  background: "#F4F4F6",
  surface: "#FFFFFF",
  // Canvas the app icon artwork was drawn on, per the brand export's
  // ic_launcher_background.xml. Deliberately not the amber primary.
  iconBackground: "#F7F1F9",
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Asankary",
  slug: "asankary",
  scheme: "asankary",
  version: "1.0.0",
  newArchEnabled: true,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    backgroundColor: colors.primary,
    resizeMode: "contain",
  },
  assetBundlePatterns: ["**/*"],

  // Fingerprint policy: runtime identity is derived from the actual native surface
  // (native deps, config plugins, native project state), so an OTA bundle can never
  // be delivered to a binary it was not built against. A static string makes every
  // build advertise the same identity and turns the compatibility check into a no-op.
  runtimeVersion: { policy: "fingerprint" },
  updates: {
    // Phase 2: set to the new EAS updates URL after `eas init` under the Asankary account.
    url: "https://u.expo.dev/REPLACE_WITH_ASANKARY_EAS_PROJECT_ID"
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.asankary.app",
    buildNumber: "1",
    associatedDomains: ["applinks:ASANKARY_DOMAIN_TBD"],
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist",
    config: {
      usesNonExemptEncryption: false,
      googleMapsApiKey: "REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY",
    },
    infoPlist: {
      NSCameraUsageDescription:
        "Asankary uses your camera to take product photos and profile pictures.",
      NSMicrophoneUsageDescription:
        "Asankary needs access to your microphone when recording product videos.",
      NSPhotoLibraryUsageDescription:
        "Asankary needs access to your photo library to select images for products and profile pictures.",
      NSLocationWhenInUseUsageDescription:
        "Asankary uses your location to provide accurate delivery.",
      NSUserTrackingUsageDescription:
        "This identifier will be used to deliver personalized ads to you.",
      UIBackgroundModes: ["fetch", "remote-notification"],
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [
            "com.googleusercontent.apps.REPLACE_WITH_ASANKARY_GOOGLE_REVERSED_CLIENT_ID"
          ]
        },
        {
          CFBundleURLSchemes: [
            "asankary"
          ]
        }
      ],
      // Allow opening WhatsApp deep links from iOS (support buttons)
      LSApplicationQueriesSchemes: ["whatsapp"],
    },
  },

  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      // The icon's own background, NOT the brand amber. The logo's gradient starts at
      // #FFC21C, so on the amber primary the top of the "A" all but disappears — and
      // this is the value the brand export itself declares
      // (android/res/values/ic_launcher_background.xml). The splash keeps the amber.
      backgroundColor: colors.iconBackground,
    },
    package: "com.asankary.app",
    versionCode: 1,
    googleServicesFile: "./google-services.json",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "ASANKARY_DOMAIN_TBD", pathPrefix: "/product" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      },
      {
        action: "VIEW",
        data: [
          { scheme: "asankary" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ],

    // ✅ IMPORTANT: fixes Samsung keyboard / fields jump & overlap
    softwareKeyboardLayoutMode: "resize",

    config: {
      googleMaps: {
        apiKey: "REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY",
      },
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.VIBRATE",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.INTERNET",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
    // expo-audio pulls in a media-playback foreground service we don't use;
    // block it to avoid Google Play "unused foreground service" rejection.
    blockedPermissions: [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ],
    allowBackup: false,
  },

  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },

  plugins: [
    "expo-apple-authentication",
    "expo-web-browser",
    "react-native-vision-camera",
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme:
          "com.googleusercontent.apps.REPLACE_WITH_ASANKARY_GOOGLE_REVERSED_CLIENT_ID",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: colors.primary,
        defaultChannel: "default",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Asankary needs access to your photo library to select images for products and profile pictures.",
        cameraPermission:
          "Asankary needs access to your camera to take product photos and profile pictures.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Asankary needs camera access to scan barcodes and take product photos.",
      },
    ],
    "expo-font",
    "expo-secure-store",
    "expo-localization",
    [
      "react-native-fbsdk-next",
      {
        appID: "REPLACE_WITH_ASANKARY_FB_APP_ID",
        clientToken: "REPLACE_WITH_ASANKARY_FB_CLIENT_TOKEN",
        displayName: "Asankary",
        scheme: "fbREPLACE_WITH_ASANKARY_FB_APP_ID",
        advertiserIDCollectionEnabled: false,
        autoLogAppEventsEnabled: false,
        isAutoInitEnabled: true,
        iosUserTrackingPermission: "This identifier will be used to deliver personalized ads to you.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Asankary uses your location to provide accurate delivery.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          buildToolsVersion: "35.0.0",
        },
        ios: {
          deploymentTarget: "15.1",
          useFrameworks: "static",
          buildReactNativeFromSource: true,
        },
      },
    ],
    "./plugins/withMapsModularHeaders.js",
    "./plugins/withFmtFix.js",
    "./plugins/withManifestMergerFix.js",
    "expo-video",
    "expo-audio",
  ],

  extra: {
    eas: {
      // Phase 2: replace after `eas init` under the Asankary account.
      projectId: "REPLACE_WITH_ASANKARY_EAS_PROJECT_ID",
    },
  },
});
