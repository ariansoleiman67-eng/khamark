const { withAndroidManifest } = require("@expo/config-plugins");

// expo-notifications and @react-native-firebase/messaging both declare these FCM
// meta-data, which the manifest merger rejects. Force a single canonical entry with
// tools:replace so the app value wins. Dedupe makes it order-independent — any
// earlier duplicate (e.g. one added by expo-notifications) is stripped first.
const FIREBASE_META = [
  {
    name: "com.google.firebase.messaging.default_notification_channel_id",
    attr: "android:value",
    value: "default",
  },
  {
    name: "com.google.firebase.messaging.default_notification_color",
    attr: "android:resource",
    value: "@color/notification_icon_color",
  },
];

module.exports = function withManifestMergerFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const application = manifest.application[0];
    application["meta-data"] = application["meta-data"] || [];

    for (const meta of FIREBASE_META) {
      application["meta-data"] = application["meta-data"].filter(
        (item) => item.$["android:name"] !== meta.name
      );
      application["meta-data"].push({
        $: {
          "android:name": meta.name,
          [meta.attr]: meta.value,
          "tools:replace": meta.attr,
        },
      });
    }

    return config;
  });
};
