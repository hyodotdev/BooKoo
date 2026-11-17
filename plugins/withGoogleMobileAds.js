const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
} = require('@expo/config-plugins');

function setAndroidMetaData(manifest, name, value) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);
  const application =
    AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application['meta-data'] = application['meta-data'] ?? [];

  const existing = application['meta-data'].find(
    (item) => item.$['android:name'] === name,
  );
  if (existing) {
    existing.$['android:value'] = value;
    existing.$['tools:replace'] = 'android:value';
    return;
  }

  application['meta-data'].push({
    $: {
      'android:name': name,
      'android:value': value,
      'tools:replace': 'android:value',
    },
  });
}

/**
 * Keep the native configuration from react-native-google-mobile-ads 16.5.0
 * local so EAS does not depend on resolving that package's app.plugin.js.
 */
module.exports = function withGoogleMobileAds(
  config,
  {androidAppId, iosAppId, delayAppMeasurementInit = false} = {},
) {
  let next = withAndroidManifest(config, (modConfig) => {
    if (androidAppId) {
      setAndroidMetaData(
        modConfig.modResults,
        'com.google.android.gms.ads.APPLICATION_ID',
        androidAppId,
      );
    }
    setAndroidMetaData(
      modConfig.modResults,
      'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT',
      delayAppMeasurementInit.toString(),
    );
    setAndroidMetaData(
      modConfig.modResults,
      'com.google.android.gms.ads.flag.OPTIMIZE_INITIALIZATION',
      'true',
    );
    setAndroidMetaData(
      modConfig.modResults,
      'com.google.android.gms.ads.flag.OPTIMIZE_AD_LOADING',
      'true',
    );
    return modConfig;
  });

  next = withInfoPlist(next, (modConfig) => {
    if (iosAppId) modConfig.modResults.GADApplicationIdentifier = iosAppId;
    modConfig.modResults.GADDelayAppMeasurementInit = delayAppMeasurementInit;
    return modConfig;
  });

  return next;
};
