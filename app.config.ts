import { ConfigContext, ExpoConfig } from "expo/config";

// Volvo-inspired color palette
const colors = {
  primary: "#1a365d", // Volvo blue
  primaryVariant: "#2c5282",
  secondary: "#3182ce",
  background: "#ffffff",
  surface: "#f7fafc",
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Haryad Autoparts",
  slug: "haryad-auto-part",
  scheme: "haryad",
  version: "1.9.43",
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

  runtimeVersion: "1.0.0",
  updates: {
    url: "https://u.expo.dev/9b207ec5-bad2-40c7-bd5c-4107571dfc55"
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.haryad.autopart",
    buildNumber: "73",
    associatedDomains: ["applinks:haryadautoparts.com", "applinks:www.haryadautoparts.com"],
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist",
    config: {
      usesNonExemptEncryption: false,
      googleMapsApiKey: "REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY",
    },
    infoPlist: {
      NSCameraUsageDescription:
        "Haryad Auto Part uses your camera to take photos of auto parts and for profile pictures.",
      NSMicrophoneUsageDescription:
        "Haryad Auto Part needs access to your microphone when recording video for products.",
      NSPhotoLibraryUsageDescription:
        "Haryad Auto Part needs access to your photo library to select images for parts and profile pictures.",
      NSLocationWhenInUseUsageDescription:
        "Haryad Auto Part uses your location to provide accurate delivery and find nearby service centers.",
      NSUserTrackingUsageDescription:
        "This identifier will be used to deliver personalized ads to you.",
      UIBackgroundModes: ["fetch", "remote-notification"],
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [
            "com.googleusercontent.apps.677342244115-l2rbot0d1pfd27sl3tphrmn6k1f6gksu"
          ]
        },
        {
          CFBundleURLSchemes: [
            "haryad"
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
      backgroundColor: colors.primary,
    },
    package: "com.haryad.autopart",
    versionCode: 134,
    googleServicesFile: "./google-services.json",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "haryadautoparts.com", pathPrefix: "/product" },
          { scheme: "https", host: "www.haryadautoparts.com", pathPrefix: "/product" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      },
      {
        action: "VIEW",
        data: [
          { scheme: "haryad" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ],

    // ✅ IMPORTANT: fixes Samsung keyboard / fields jump & overlap
    softwareKeyboardLayoutMode: "resize",

    config: {
      googleMaps: {
        apiKey: "REPLACE_WITH_ASANKARY_FIREBASE_API_KEY",
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
          "com.googleusercontent.apps.677342244115-l2rbot0d1pfd27sl3tphrmn6k1f6gksu",
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
          "Haryad Auto Part needs access to your photo library to select images for auto parts and profile pictures.",
        cameraPermission:
          "Haryad Auto Part needs access to your camera to take photos of auto parts and for profile pictures.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Haryad Auto Part needs camera access to scan part numbers and take photos of auto parts.",
      },
    ],
    "expo-font",
    "expo-secure-store",
    "expo-localization",
    [
      "react-native-fbsdk-next",
      {
        appID: "1097414742525033",
        clientToken: "e101dd542f0e6d640dc3c30a7b07bd4f",
        displayName: "Haryad Autoparts",
        scheme: "fb1097414742525033",
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
          "Haryad Auto Part uses your location to provide accurate delivery and find nearby service centers.",
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
      projectId: "9b207ec5-bad2-40c7-bd5c-4107571dfc55",
    },
  },
});
