import { ConfigContext, ExpoConfig } from "expo/config";

// Khamark Brand color palette — Luxury Red & White. Drives splash + adaptive-icon + notification bg.
const colors = {
  primary: "#A61920",
  primaryVariant: "#831319",
  secondary: "#666870",
  background: "#FFFFFF",
  surface: "#F7F7F8",
  iconBackground: "#A61920",
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Khamark",
  slug: "khamark",
  scheme: "khamark",
  version: "1.0.0",
  newArchEnabled: true,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    backgroundColor: colors.iconBackground,
    resizeMode: "contain",
  },
  assetBundlePatterns: ["**/*"],

  runtimeVersion: "1.0.0",
  updates: {
    enabled: false,
  },

  ios: {
    supportsTablet: true,
    requireFullScreen: true,
    bundleIdentifier: "com.khamark.app",
    buildNumber: "1",
    associatedDomains: ["applinks:khamark.com", "applinks:www.khamark.com"],
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist",
    config: {
      usesNonExemptEncryption: false,
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      NSCameraUsageDescription:
        "Khamark uses your camera to take product photos and profile pictures.",
      NSMicrophoneUsageDescription:
        "Khamark uses your microphone to record voice messages you send in chat and to the shopping assistant.",
      NSPhotoLibraryUsageDescription:
        "Khamark needs access to your photo library to select images for products and profile pictures.",
      NSLocationWhenInUseUsageDescription:
        "Khamark uses your location to provide accurate delivery.",
      UIBackgroundModes: ["fetch", "remote-notification"],
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [
            "khamark"
          ]
        }
      ],
      LSApplicationQueriesSchemes: ["whatsapp"],
    },
  },

  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: colors.iconBackground,
    },
    package: "com.khamark.app",
    version: "1.0",
    versionCode: 1,
    googleServicesFile: "./google-services.json",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "khamark.com", pathPrefix: "/en/p" },
          { scheme: "https", host: "khamark.com", pathPrefix: "/ar/p" },
          { scheme: "https", host: "khamark.com", pathPrefix: "/ku/p" },
          { scheme: "https", host: "www.khamark.com", pathPrefix: "/en/p" },
          { scheme: "https", host: "www.khamark.com", pathPrefix: "/ar/p" },
          { scheme: "https", host: "www.khamark.com", pathPrefix: "/ku/p" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      },
      {
        action: "VIEW",
        data: [
          { scheme: "khamark" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ],

    softwareKeyboardLayoutMode: "resize",

    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
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
          process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
          "com.googleusercontent.apps.697952713775-placeholder",
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
          "Khamark needs access to your photo library to select images for products and profile pictures.",
        cameraPermission:
          "Khamark needs access to your camera to take product photos and profile pictures.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Khamark needs camera access to scan barcodes and take product photos.",
      },
    ],
    "expo-font",
    "expo-secure-store",
    "expo-localization",
    "expo-asset",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Khamark uses your location to provide accurate delivery.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: "36.1.0",
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
      projectId: "REPLACE_WITH_KHAMARK_EAS_PROJECT_ID",
    },
  },
});
