const {withDangerousMod} = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

const KAKAO_MARKER = '# Kakao SDK (reflection used by models and Retrofit APIs)';
const RETROFIT_MARKER =
  '# Retrofit 2.9 full-mode compatibility required by the Kakao SDK';
const KAKAO_PROGUARD_RULES = `
${KAKAO_MARKER}
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep interface com.kakao.sdk.** { *; }
-keepattributes Signature,InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,RuntimeVisibleParameterAnnotations,RuntimeInvisibleParameterAnnotations,AnnotationDefault
-keep class * extends com.google.gson.TypeAdapter

# Optional TLS providers referenced by OkHttp.
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.*
-dontwarn org.openjsse.**
`;

const RETROFIT_PROGUARD_RULES = `
${RETROFIT_MARKER}
# Retrofit 2.9 does not include the R8 full-mode rules added in later releases.
# Keep service inheritance and generic return types used by the Kakao SDK.
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface * extends <1>
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowoptimization,allowshrinking,allowobfuscation class <3>
-keep,allowobfuscation,allowshrinking class retrofit2.Response
`;

module.exports = function withKakaoProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      const existing = await fs.readFile(proguardPath, 'utf8');
      let next = existing.trimEnd();

      if (!existing.includes(KAKAO_MARKER)) {
        next += `\n${KAKAO_PROGUARD_RULES}`;
      }
      if (!existing.includes(RETROFIT_MARKER)) {
        next += `\n${RETROFIT_PROGUARD_RULES}`;
      }
      if (next !== existing.trimEnd()) {
        await fs.writeFile(proguardPath, `${next}\n`);
      }

      return modConfig;
    },
  ]);
};
