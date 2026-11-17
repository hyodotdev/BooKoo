const {
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// RNKakaoLoginsModule resolves this by getIdentifier, not an R reference.
// Optimized resource shrinking otherwise removes the key and crashes startup.
// Only keep names this project actually defines in res/values/strings.xml; a
// keep entry for an absent resource is dead config that hides a real removal.
const resourceKeepXml = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
  tools:keep="@string/kakao_app_key" />
`;

// Switching templates does more than drop `-dontoptimize`: AGP's optimize
// template also turns on `-allowaccessmodification`, letting R8 widen private
// and package-private members for inlining and class merging. Reflection on a
// NON-PUBLIC member therefore fails in optimized release builds only. Any
// dependency that needs it must ship its own `-keep`; see docs/ai/WORKFLOWS.md.
function optimizeReleaseRules(contents) {
  const legacy = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g;
  const optimized = 'getDefaultProguardFile("proguard-android-optimize.txt")';
  if (
    !legacy.test(contents) &&
    !contents.includes('proguard-android-optimize.txt')
  ) {
    throw new Error(
      'Android release ProGuard template changed; recheck R8 optimization',
    );
  }
  return contents.replace(legacy, optimized);
}

module.exports = function withAndroidReleaseOptimizations(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Android R8 plugin expects the Expo Groovy template');
    }
    modConfig.modResults.contents = optimizeReleaseRules(
      modConfig.modResults.contents,
    );
    return modConfig;
  });

  config = withGradleProperties(config, (modConfig) => {
    // AGP 8.12 requires this flag; AGP 9 enables this pipeline by default.
    for (const key of [
      'android.enableR8.fullMode',
      'android.r8.optimizedResourceShrinking',
    ]) {
      modConfig.modResults = modConfig.modResults.filter(
        (item) => item.type !== 'property' || item.key !== key,
      );
      modConfig.modResults.push({type: 'property', key, value: 'true'});
    }
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const raw = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/res/raw',
      );
      await fs.mkdir(raw, {recursive: true});
      await fs.writeFile(
        path.join(raw, 'bookoo_resource_keep.xml'),
        resourceKeepXml,
      );
      return modConfig;
    },
  ]);
};

module.exports.optimizeReleaseRules = optimizeReleaseRules;
module.exports.resourceKeepXml = resourceKeepXml;
