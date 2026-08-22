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
  // version record in App Store Connect, or the processed build may not attach to
  // that version. This file WINS over app.json — bumping app.json alone does
  // nothing, because the object below spreads app.json and then overrides it.
  version: "1.9.44",
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
    // OTA is OFF until `eas init` gives us a real project id. It used to carry the
    // placeholder URL below with updates ENABLED and EXUpdatesCheckOnLaunch=ALWAYS, so
    // every cold start fired a request at a host that does not exist. Harmless only
    // because EXUpdatesLaunchWaitMs is 0 (non-blocking) — still a wasted, failing call
    // on every launch of every install.
    //
    // To turn OTA on: run `eas init`, put the real id in extra.eas.projectId below, set
    //   enabled: true, url: "https://u.expo.dev/<that id>"
    // and switch runtimeVersion to { policy: "fingerprint" } at the same time.
    enabled: false,
  },

  ios: {
    supportsTablet: true,
    // iPad ran with all four orientations and Split View enabled (UIRequiresFullScreen
    // false) despite `orientation: "portrait"` above — that key only constrains iPhone.
    // Several components capture the window width ONCE at module scope
    // (MasonryProductCard.tsx:36, GoldenCarousel.tsx:47), so any rotation or Split View
    // resize left the product grid sized for the old width and rows clipped off-screen.
    // App Review tests this app on an iPad Air M3; both prior rejections came from one.
    // Portrait-only, full-screen only, matching what the layout actually supports.
    requireFullScreen: true,
    bundleIdentifier: "com.asankary.app",
    // App Store Connect rejects a reused build number. Bump on every upload.
    //   1.0 (2) — rejected 2.1(a), crashed on launch (react-native-get-random-values 2.0.0)
    //   1.0 (4) — launched fine; rejected 2.3.10, non-iOS device imagery
    //   1.0 (5) — HaryadAutoparts fork residue removed from the binary
    //   1.9.44 (75) — reply to 2.1 Information Needed; the recorded review build
    buildNumber: "75",
    // associatedDomains removed: it carried "applinks:ASANKARY_DOMAIN_TBD", a
    // placeholder host. That ships a real com.apple.developer.associated-domains
    // entitlement pointing at a domain that cannot serve an
    // apple-app-site-association file, so universal links silently never verify.
    // Restore as ["applinks:<real domain>"] once the domain exists.
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
      // Must describe the ACTUAL use. There is no video recording anywhere in the
      // app; the microphone is used only for voice messages in chat and to the
      // shopping assistant. A purpose string describing a feature that does not
      // exist is a routine Guideline 5.1.1 rejection.
      NSMicrophoneUsageDescription:
        "Asankary uses your microphone to record voice messages you send in chat and to the shopping assistant.",
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
    // Android ships its own version name, INDEPENDENT of the root `version`. The
    // root value is 1.9.44 because that is what App Store Connect expects for the
    // iOS submission in flight; Play starts its own numbering at 1.0. Changing the
    // root field to 1.0 would drag iOS back with it.
    version: "1.0",
    versionCode: 136,
    googleServicesFile: "./google-services.json",
    intentFilters: [
      // The https/autoVerify filter for host "ASANKARY_DOMAIN_TBD" was removed — a
      // placeholder host can never serve /.well-known/assetlinks.json, so Android App
      // Links verification failed on every install. Re-add with the real domain once
      // it exists. The asankary:// scheme below is what deep links actually use.
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
    "expo-asset",
    // react-native-fbsdk-next is REMOVED from the project entirely (not just its
    // plugin). Disabling only the plugin left FBSDKCoreKit autolinked into the iOS
    // binary while stripping the FacebookAppID / FacebookClientToken keys it requires
    // in Info.plist — the Meta SDK still self-initialised at launch with no config.
    // See src/services/auth/facebookAuth.ts for how to bring it back.
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
          // Required: without it, react-native-maps fails to compile under
          // useFrameworks: "static" with
          //   "declaration of 'RCTViewManager' must be imported from module
          //    'react_native_maps.AIRMapCalloutManager' before it is required".
          // This matches the sibling project it was forked from, whose Release-iphoneos
          // build works with this exact setting.
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
