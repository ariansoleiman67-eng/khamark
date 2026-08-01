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
  // Must match CFBundleShortVersionString in ios/Asankary/Info.plist and the
  // version record in App Store Connect ("1.0"), or the processed build may not
  // attach to that version.
  version: "1.0",
  newArchEnabled: true,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    // Matches the splash artwork's own canvas. The image previously had a BLACK
    // background baked into it, so on the amber primary it rendered as a black square
    // with barely-visible navy lettering — the dark logo on every cold start. Using the
    // light monogram on its own background means the splash reads as one clean surface
    // and matches the app icon exactly.
    backgroundColor: colors.iconBackground,
    resizeMode: "contain",
  },
  assetBundlePatterns: ["**/*"],

  // Static on purpose, for now.
  //
  // The fingerprint policy is the correct end state — it derives runtime identity from
  // the real native surface, so an OTA bundle can never reach a binary it was not built
  // against, which a static string cannot guarantee. But it requires a `fingerprint`
  // asset generated into the app at build time, and a local `expo run:android` does not
  // produce one: expo-updates then throws FileNotFoundException("fingerprint") from
  // UpdatesConfiguration.getRuntimeVersion before MainApplication can start, so the app
  // crashes on launch every time.
  //
  // It also buys nothing yet — `updates.url` below is still the placeholder EAS project
  // id, so no OTA update can be published or delivered regardless of the policy.
  //
  // SWITCH TO { policy: "fingerprint" } as part of `eas init`, once updates.url is real
  // and builds go through EAS (which does generate the fingerprint asset). Do it BEFORE
  // the first build ships, because a runtime version already in the field cannot be
  // changed retroactively.
  runtimeVersion: "1.0.0",
  updates: {
    // Phase 2: set to the new EAS updates URL after `eas init` under the Asankary account.
    url: "https://u.expo.dev/REPLACE_WITH_ASANKARY_EAS_PROJECT_ID"
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.asankary.app",
    buildNumber: "3",
    associatedDomains: ["applinks:ASANKARY_DOMAIN_TBD"],
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist",
    config: {
      usesNonExemptEncryption: false,
      // Read from .env / EAS env so the key is never committed. The JS side reads the
      // same var via GOOGLE_MAPS_API_KEY in src/constants/config.ts — keep them in sync.
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
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
      // NSUserTrackingUsageDescription deliberately absent — the app does no
      // cross-app tracking and shows no ads, so it must not request ATT.
      UIBackgroundModes: ["fetch", "remote-notification"],
      // The Google reversed-client-ID scheme is injected by the
      // @react-native-google-signin/google-signin plugin from GoogleService-Info.plist.
      // Do not duplicate it here — a stale copy ships a bogus scheme and App Store
      // Connect rejects the upload (error 90158).
      CFBundleURLTypes: [
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
    versionCode: 2,
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
        // Must match REVERSED_CLIENT_ID in GoogleService-Info.plist.
        iosUrlScheme:
          "com.googleusercontent.apps.22285264318-9ipslo5beas3b4l0a2c969eq1fqnnk2j",
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
    // react-native-fbsdk-next plugin intentionally disabled: Asankary has no Meta app
    // yet, so the plugin emitted a placeholder `fb<APPID>` URL scheme that App Store
    // Connect rejects (error 90158). The Facebook auth code in
    // src/services/auth/facebookAuth.ts stays dormant (the sign-in buttons are already
    // gated off). To re-enable: create the Meta app, restore this block with the real
    // appID + clientToken, then re-run `npx expo prebuild --clean -p ios`.
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
