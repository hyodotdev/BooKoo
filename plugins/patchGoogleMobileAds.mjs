import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.join(
  process.cwd(),
  'node_modules',
  'react-native-google-mobile-ads',
);

async function replaceOnce(file, before, after) {
  const source = await readFile(file, 'utf8');
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one unpatched block in ${file}`);
  }
  await writeFile(file, source.replace(before, after));
}

async function replaceCount(file, before, after, expectedCount) {
  const source = await readFile(file, 'utf8');
  if (!source.includes(before)) {
    const patchedCount = source.split(after).length - 1;
    if (patchedCount === expectedCount) return;
    throw new Error(`Expected ${expectedCount} patched blocks in ${file}`);
  }
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} unpatched blocks in ${file}`);
  }
  await writeFile(file, source.split(before).join(after));
}

const packageFile = path.join(packageRoot, 'package.json');
const packageSource = await readFile(packageFile, 'utf8');
const packageJson = JSON.parse(packageSource);
if (packageJson.version !== '16.5.0') {
  throw new Error(
    `Unsupported react-native-google-mobile-ads version ${packageJson.version}`,
  );
}

packageJson.sdkVersions.android.googleMobileAds = '24.9.0';
packageJson.codegenConfig.ios.modulesProvider = {
  RNGoogleMobileAdsAppOpenModule: 'RNGoogleMobileAdsAppOpenModule',
  RNGoogleMobileAdsConsentModule: 'RNGoogleMobileAdsConsentModule',
  RNGoogleMobileAdsInterstitialModule: 'RNGoogleMobileAdsInterstitialModule',
  RNGoogleMobileAdsModule: 'RNGoogleMobileAdsModule',
  RNGoogleMobileAdsNativeModule: 'RNGoogleMobileAdsNativeModule',
  RNGoogleMobileAdsRewardedInterstitialModule:
    'RNGoogleMobileAdsRewardedInterstitialModule',
  RNGoogleMobileAdsRewardedModule: 'RNGoogleMobileAdsRewardedModule',
};

const nextPackageSource = `${JSON.stringify(packageJson, null, 2)}\n`;
if (packageSource !== nextPackageSource) {
  await writeFile(packageFile, nextPackageSource);
}

const kotlinFile = path.join(
  packageRoot,
  'android/src/main/java/io/invertase/googlemobileads/ReactNativeGoogleMobileAdsModule.kt',
);

await replaceOnce(
  kotlinFile,
  `import com.google.android.gms.ads.OnAdInspectorClosedListener
import com.google.android.gms.ads.AgeRestrictedTreatment

class ReactNativeGoogleMobileAdsModule(`,
  `import com.google.android.gms.ads.OnAdInspectorClosedListener

class ReactNativeGoogleMobileAdsModule(`,
);

await replaceOnce(
  kotlinFile,
  `  override fun getName() = NAME

  private fun buildRequestConfiguration(`,
  `  override fun getName() = NAME

  /**
   * Google Mobile Ads 25.3 added AgeRestrictedTreatment, but Expo SDK 57's
   * Kotlin toolchain cannot consume the Kotlin 2.3 metadata in that SDK yet.
   * Use the new API reflectively when present and keep the 24.9 fallback
   * privacy-safe until Expo's Kotlin compiler catches up.
   */
  private fun applyAgeRestrictedTreatment(
    builder: RequestConfiguration.Builder,
    treatment: String
  ): Boolean {
    return try {
      val treatmentClass = Class.forName("com.google.android.gms.ads.AgeRestrictedTreatment")
      val treatmentValue = treatmentClass.enumConstants?.firstOrNull {
        (it as Enum<*>).name == treatment
      } ?: return false
      builder.javaClass
        .getMethod("setAgeRestrictedTreatment", treatmentClass)
        .invoke(builder, treatmentValue)
      true
    } catch (_: ReflectiveOperationException) {
      false
    }
  }

  private fun buildRequestConfiguration(`,
);

await replaceOnce(
  kotlinFile,
  `    if (requestConfiguration.hasKey("ageRestrictedTreatment")) {
      val ageRestrictedTreatment = requestConfiguration.getString("ageRestrictedTreatment")

      when (ageRestrictedTreatment) {
        "CHILD" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.CHILD)
        "TEEN" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.TEEN)
        "UNSPECIFIED" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.UNSPECIFIED)
      }
    }
`,
  `    val hasAgeRestrictedTreatment = requestConfiguration.hasKey("ageRestrictedTreatment")
    if (hasAgeRestrictedTreatment) {
      val ageRestrictedTreatment = requestConfiguration.getString("ageRestrictedTreatment")

      if (ageRestrictedTreatment != null &&
        !applyAgeRestrictedTreatment(builder, ageRestrictedTreatment)
      ) {
        // 24.9 has no exact TEEN equivalent. TFUA is the conservative fallback
        // and disables personalized advertising for under-age users.
        when (ageRestrictedTreatment) {
          "CHILD" -> builder.setTagForChildDirectedTreatment(
            RequestConfiguration.TAG_FOR_CHILD_DIRECTED_TREATMENT_TRUE
          )
          "TEEN" -> builder.setTagForUnderAgeOfConsent(
            RequestConfiguration.TAG_FOR_UNDER_AGE_OF_CONSENT_TRUE
          )
        }
      }
    }
`,
);

await replaceCount(
  kotlinFile,
  `    } else {
      builder.setTagFor`,
  `    } else if (!hasAgeRestrictedTreatment) {
      builder.setTagFor`,
  2,
);

const javaFile = path.join(
  packageRoot,
  'android/src/main/java/io/invertase/googlemobileads/ReactNativeGoogleMobileAdsCommon.java',
);

await replaceOnce(
  javaFile,
  `import android.os.Bundle;`,
  `import android.content.Context;
import android.os.Bundle;`,
);

await replaceOnce(
  javaFile,
  `      if ("LARGE_ANCHORED_ADAPTIVE_BANNER".equals(preDefinedAdSize)) {
        return AdSize.getLargeAnchoredAdaptiveBannerAdSize(reactViewGroup.getContext(), adWidth);
      }`,
  `      if ("LARGE_ANCHORED_ADAPTIVE_BANNER".equals(preDefinedAdSize)) {
        try {
          return (AdSize)
              AdSize.class
                  .getMethod(
                      "getLargeAnchoredAdaptiveBannerAdSize", Context.class, int.class)
                  .invoke(null, reactViewGroup.getContext(), adWidth);
        } catch (ReflectiveOperationException ignored) {
          return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
              reactViewGroup.getContext(), adWidth);
        }
      }`,
);
