const {AndroidConfig, withAndroidManifest} = require('@expo/config-plugins');

const NAVER_CUSTOM_TAB =
  'com.navercorp.nid.oauth.activity.NidOAuthCustomTabActivity';

function configureResizableActivities(androidManifest) {
  const manifest = androidManifest.manifest;
  // xml2js omits `$` entirely for an element declared without attributes, so a
  // hand-edited manifest root would throw here before any activity is fixed.
  manifest.$ ??= {};
  manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const application =
    AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.$['android:resizeableActivity'] = 'true';
  const main = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  main.$['android:resizeableActivity'] = 'true';

  // Naver contributes screenOrientation="behind" from its AAR.
  // Remove only that inherited restriction; retain its exported/launch/theme
  // declarations and the dedicated bookoonaver callback activity untouched.
  application.activity ??= [];
  let customTab = application.activity.find(
    (activity) => activity.$?.['android:name'] === NAVER_CUSTOM_TAB,
  );
  if (!customTab) {
    customTab = {$: {'android:name': NAVER_CUSTOM_TAB}};
    application.activity.push(customTab);
  }
  delete customTab.$['android:screenOrientation'];
  const removed = new Set(
    (customTab.$['tools:remove'] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  removed.add('android:screenOrientation');
  customTab.$['tools:remove'] = [...removed].join(',');
  return androidManifest;
}

module.exports = function withAndroidResizableActivities(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = configureResizableActivities(modConfig.modResults);
    return modConfig;
  });
};

module.exports.configureResizableActivities = configureResizableActivities;
