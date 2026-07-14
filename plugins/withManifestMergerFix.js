const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withManifestMergerFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];
    
    manifest.$['xmlns:tools'] = "http://schemas.android.com/tools";

    if (application['meta-data']) {
      for (const item of application['meta-data']) {
        if (
          item.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id' ||
          item.$['android:name'] === 'com.google.firebase.messaging.default_notification_color'
        ) {
          item.$['tools:replace'] = item.$['android:value'] ? 'android:value' : 'android:resource';
        }
      }
    }

    return config;
  });
};
