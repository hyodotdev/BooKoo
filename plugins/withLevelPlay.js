const {
  withAppBuildGradle,
  withPodfile,
  withInfoPlist,
} = require('expo/config-plugins');
// Snapshot 2026-10-22: https://skan.mz.unity3d.com/v3/partner/skadnetworks.plist.json
// Includes LevelPlay's own ID. Keep native builds deterministic, without fetches.
const skAdNetworkIdentifiers = require('./levelplay-skadnetworks.json');

/** Native adapter wiring; runtime consent and eligibility stay in features/ads. */
function configureLevelPlayGradle(source) {
  if (!source.includes('com.unity3d.ads-mediation:unityads-adapter:')) {
    if (!/dependencies\s*\{/.test(source))
      throw new Error('LevelPlay: Android dependencies block not found');
    source = source.replace(
      /dependencies\s*\{/,
      `dependencies {
    implementation 'com.unity3d.ads-mediation:unityads-adapter:5.15.0'
    implementation 'com.google.android.gms:play-services-appset:16.0.2'
    implementation 'androidx.work:work-runtime-ktx:2.8.0'`,
    );
  }
  // SDK 8.9+ bundles and initializes Ad Quality by default. BooKoo uses
  // mediation only; exclude the optional analytics SDK on every path.
  if (!source.includes("module: 'adquality-sdk'"))
    source += `
configurations.configureEach {
    exclude group: 'com.unity3d.ads-mediation', module: 'adquality-sdk'
}
`;
  return source;
}

module.exports = function withLevelPlay(config) {
  config = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = configureLevelPlayGradle(mod.modResults.contents);
    return mod;
  });

  config = withPodfile(config, (mod) => {
    const source = mod.modResults.contents;
    if (!source.includes("pod 'IronSourceUnityAdsAdapter'")) {
      if (!source.includes('use_expo_modules!'))
        throw new Error('LevelPlay: Expo Podfile target not found');
      mod.modResults.contents = source.replace(
        'use_expo_modules!',
        "use_expo_modules!\n  pod 'IronSourceUnityAdsAdapter', '5.13.0'",
      );
    }
    return mod;
  });

  return withInfoPlist(config, (mod) => {
    const items = mod.modResults.SKAdNetworkItems ?? [];
    for (const identifier of skAdNetworkIdentifiers) {
      if (!items.some((item) => item.SKAdNetworkIdentifier === identifier))
        items.push({SKAdNetworkIdentifier: identifier});
    }
    mod.modResults.SKAdNetworkItems = items;
    return mod;
  });
};

module.exports.configureLevelPlayGradle = configureLevelPlayGradle;
