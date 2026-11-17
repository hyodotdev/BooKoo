import type {ConfigContext, ExpoConfig} from '@expo/config';
import dotenv from 'dotenv';
import {expand} from 'dotenv-expand';
import fs from 'fs';
import path from 'path';

// Expo evaluates this file from the project root. `process.cwd()` works in
// both CommonJS and ESM; `__dirname` is unavailable in EAS's Node 24 ESM
// config loader.
const projectRoot = process.cwd();

// Read JSON as data instead of importing it as an ESM module. Node 24, used by
// the EAS SDK 57 image, requires a `type: json` import attribute and otherwise
// fails before Expo can evaluate this config.
const {version} = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
) as {version: string};
// Expo's config loader does not transpile imported TypeScript modules. Read
// the same pure JSON identity that the app and Convex adapter consume.
const {applicationId: APPLICATION_ID, qaApplicationId: QA_APPLICATION_ID} =
  JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'shared/application.json'), 'utf8'),
  ) as {applicationId: string; qaApplicationId: string};

// `EXPO_NO_DOTENV=1` means "the environment is already correct, do not read
// local env files". `scripts/eas-update-production.zsh` sets it alongside
// `--environment production` so a production OTA is built from the EAS
// Environment and nothing else.
//
// Expo honours the flag for its own dotenv loading, but this config does its
// own — `.env` at import time, then `.env.<STAGE>` with `override: true` — so
// it has to honour it too. It did not, and `override: true` is the dangerous
// half: EAS injects the production values, then a local `.env.production`
// overwrites them and Metro inlines whatever the developer had. A publish
// could carry a development Convex URL or QA advertising configuration to
// the production channel while `extra.stage` still reads 'production'.
//
// No `.env.production` exists in this checkout, so no shipped build was
// affected. The flag is honoured now so that stays true by construction.
const readsLocalEnvFiles = process.env.EXPO_NO_DOTENV !== '1';

if (readsLocalEnvFiles) {
  // Replaces a bare `import 'dotenv/config'`, which ran unconditionally.
  expand(dotenv.config({quiet: true}));

  // https://github.com/expo/expo/issues/23727#issuecomment-1651609858
  if (process.env.STAGE)
    expand(
      dotenv.config({
        quiet: true,
        path: path.join(
          projectRoot,
          ['./.env', process.env.STAGE].filter(Boolean).join('.'),
        ),
        override: true,
      }),
    );
}

type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

// Explicit QA identity: never overwrite the store install or consume its OTA.
const variant = process.env.BOOKOO_APP_VARIANT;
if (variant !== undefined && variant !== 'qa' && variant !== 'production')
  throw new Error('BOOKOO_APP_VARIANT must be qa or production');
const qa = variant === 'qa';
if (
  qa &&
  ['production', 'purchase-test'].includes(process.env.EAS_BUILD_PROFILE ?? '')
)
  throw new Error('Store builds cannot use the QA app identity');

const APPLE_TEAM_ID = 'PRDQGB267K';

const ADMOB_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const admobIosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;
const admobAndroidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
// Google app IDs remain exclusively for UMP's consent UI. Ad inventory and
// initialization belong to the BooKoo-specific LevelPlay apps and units.
const buildPlatform = process.env.EAS_BUILD_PLATFORM;
if (process.env.EAS_BUILD_PROFILE === 'production') {
  const missing =
    buildPlatform === 'ios'
      ? [
          !admobIosAppId && 'EXPO_PUBLIC_ADMOB_IOS_APP_ID',
          !process.env.EXPO_PUBLIC_LEVELPLAY_IOS_APP_KEY &&
            'EXPO_PUBLIC_LEVELPLAY_IOS_APP_KEY',
          !process.env.EXPO_PUBLIC_LEVELPLAY_IOS_BANNER_ID &&
            'EXPO_PUBLIC_LEVELPLAY_IOS_BANNER_ID',
        ]
      : buildPlatform === 'android'
        ? [
            !admobAndroidAppId && 'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID',
            !process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY &&
              'EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY',
            !process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID &&
              'EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID',
            !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY &&
              'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
          ]
        : [];
  const names = missing.filter(Boolean);
  if (names.length > 0)
    throw new Error(
      `Production ${buildPlatform} build is missing: ${names.join(', ')}`,
    );
}

/** Team-owned EAS project; the env override keeps local tooling configurable. */
const EAS_PROJECT_ID =
  process.env.EAS_PROJECT_ID ?? '7eac02cb-ef02-4d4c-9999-0e0825ab4263';

/** Universal/App Links host for invite links (`https://<host>/invite/<token>`). */
const APP_DOMAIN = process.env.EXPO_PUBLIC_APP_DOMAIN ?? 'bookoo.hyo.dev';

const kakaoAppKey = process.env.EXPO_PUBLIC_KAKAO_APP_KEY;

/**
 * Reversed iOS OAuth client id (`com.googleusercontent.apps.<id>`) is required
 * by Google Sign-In as a URL scheme. Derived from the iOS client id so only one
 * env var has to be configured.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleMapsAndroidApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const googleReversedClientId = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace(
      '.apps.googleusercontent.com',
      '',
    )}`
  : undefined;

export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  name: qa ? 'BooKoo QA' : 'BooKoo',
  slug: 'bookoo',
  owner: 'crossplatformkorea',
  scheme: qa ? 'bookoo-qa' : 'bookoo',
  version,
  // Tablet is a first-class target, so no orientation lock.
  orientation: 'default',
  backgroundColor: '#FFFFFF',
  platforms: ['ios', 'android'],
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  description:
    '함께 쓰는 가계부 — 팀·모임·여행의 공동 경비를 같이 기록하는 장부.',
  locales: {
    ko: './assets/langs/meta/ko.json',
    en: './assets/langs/meta/en.json',
    ja: './assets/langs/meta/ja.json',
    zh: './assets/langs/meta/zh.json',
    id: './assets/langs/meta/id.json',
    de: './assets/langs/meta/de.json',
    es: './assets/langs/meta/es.json',
    fr: './assets/langs/meta/fr.json',
    it: './assets/langs/meta/it.json',
    nl: './assets/langs/meta/nl.json',
    pt: './assets/langs/meta/pt.json',
    vi: './assets/langs/meta/vi.json',
  },
  experiments: {
    typedRoutes: true,
  },
  plugins: [
    'expo-iap',
    'expo-router',
    'expo-asset',
    'expo-image',
    'expo-maps',
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission:
          'BooKoo 계정과 잠금 정보를 안전하게 보호하기 위해 Face ID를 사용합니다.',
      },
    ],
    'expo-web-browser',
    'expo-localization',
    'expo-sharing',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          '가계부 내역에 장소를 선택하거나 현재 위치를 지도에서 찾을 때 위치 접근 권한을 사용합니다.',
      },
    ],
    'expo-apple-authentication',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'BooKoo 잠금을 해제하기 위해 Face ID를 사용합니다.',
      },
    ],
    '@react-native-community/datetimepicker',
    './plugins/withKakaoProguard',
    './plugins/withAndroidGradleMemory',
    './plugins/withAndroidReleaseOptimizations',
    './plugins/withAndroidResizableActivities',
    // Mounted only with a real key: prebuild bakes the value into Info.plist,
    // so a placeholder silently ships and every authorize call goes out with
    // the placeholder as `client_id`. Gate the plugin on the same variable the
    // UI gates on so the two cannot drift.
    ...(kakaoAppKey
      ? ([
          ['@react-native-seoul/kakao-login', {kakaoAppKey}],
        ] satisfies ExpoPlugin[])
      : []),
    // Dedicated scheme — Naver's plugin swallows every incoming URL on its
    // scheme before expo-router sees it, so it must never be `bookoo`.
    ['@react-native-seoul/naver-login', {urlScheme: 'bookoonaver'}],
    ...(googleReversedClientId
      ? ([
          [
            '@react-native-google-signin/google-signin',
            {iosUrlScheme: googleReversedClientId},
          ],
        ] satisfies ExpoPlugin[])
      : []),
    [
      'expo-image-picker',
      {
        photosPermission:
          '내역에 사진을 첨부하기 위해 사진 보관함 접근 권한이 필요합니다.',
        cameraPermission:
          '내역에 첨부할 사진을 촬영하기 위해 카메라 접근 권한이 필요합니다.',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission:
          '내역에 첨부할 사진을 선택하려면 사진 보관함 접근 권한이 필요합니다.',
        savePhotosPermission:
          '사진을 기기에 저장하려면 사진 보관함 추가 권한이 필요합니다.',
        granularPermissions: ['photo'],
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification_icon.png',
        color: '#1DD3A8',
      },
    ],
    [
      './plugins/withGoogleMobileAds',
      {
        androidAppId: admobAndroidAppId ?? ADMOB_TEST_ANDROID_APP_ID,
        iosAppId: admobIosAppId ?? ADMOB_TEST_IOS_APP_ID,
        delayAppMeasurementInit: true,
      },
    ],
    './plugins/withLevelPlay',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#414D6B',
        image: './assets/splash-icon.png',
        imageWidth: 280,
        resizeMode: 'contain',
        android: {
          backgroundColor: '#414D6B',
          image: './assets/splash-icon.png',
          imageWidth: 280,
          resizeMode: 'contain',
          dark: {
            backgroundColor: '#414D6B',
            image: './assets/splash-icon.png',
          },
        },
        ios: {
          enableFullScreenImage_legacy: true,
          image: './assets/splash.png',
          resizeMode: 'cover',
          dark: {
            backgroundColor: '#414D6B',
            image: './assets/splash.png',
          },
        },
      },
    ],
    [
      'react-native-edge-to-edge',
      {
        android: {
          parentTheme: 'Default',
          enforceNavigationBarContrast: false,
        },
      },
    ],
    // Growth attribution. The deep-link surface is deliberately left out of the
    // options: `scheme`, `ios.associatedDomains` and `android.intentFilters`
    // above already register every URL BooKoo answers, and passing them again
    // here writes a second copy into the manifest. The SDK reads links through
    // expo-linking at runtime regardless of which plugin registered them.
    //
    // Layers-specific iOS attribution registration is switched off. LevelPlay
    // owns its separate SKAdNetwork list. `withoutLayersAtt` strips Layers'
    // unconditional ATT usage string: BooKoo requests no ATT or IDFA access.
    // Android install-referrer attribution needs neither; advertising-ID
    // permissions are explicitly blocked below. Store privacy declarations
    // still require an audit of the actual SDK configuration for each release.
    //
    // `withoutLayersAtt` sits BEFORE the plugin it corrects on purpose:
    // Info.plist mods run in reverse array order. See the plugin's own note.
    './plugins/withoutLayersAtt',
    [
      '@layers/expo',
      {
        ios: {
          includeDefaultSKAdNetworkIds: false,
          includeAdvertisingAttributionReportEndpoint: false,
        },
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '17.0',
          enableSceneSupport: true,
          useFrameworks: 'static',
        },
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          kotlinVersion: '2.1.20',
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          extraMavenRepos: [
            'https://devrepo.kakao.com/nexus/content/groups/public/',
          ],
        },
      },
    ],
  ],
  ios: {
    bundleIdentifier: qa ? QA_APPLICATION_ID : APPLICATION_ID,
    appleTeamId: APPLE_TEAM_ID,
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: qa ? [] : [`applinks:${APP_DOMAIN}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: [
        'ko',
        'en',
        'ja',
        'zh-Hans',
        'id',
        'de',
        'es',
        'fr',
        'it',
        'nl',
        'pt',
        'vi',
      ],
      UIBackgroundModes: ['remote-notification'],
      CFBundleURLTypes: [
        {CFBundleURLSchemes: [qa ? 'bookoo-qa' : 'bookoo']},
        ...(googleReversedClientId
          ? [{CFBundleURLSchemes: [googleReversedClientId]}]
          : []),
      ],
    },
  },
  android: {
    package: qa ? QA_APPLICATION_ID : APPLICATION_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-foreground.png',
      monochromeImage: './assets/adaptive-icon-foreground.png',
      backgroundColor: '#20B7A9',
    },
    blockedPermissions: [
      'com.google.android.gms.permission.AD_ID',
      // UMP-only Google wiring and contextual ads need no Privacy Sandbox
      // advertising identifiers, interest topics or attribution access.
      'android.permission.ACCESS_ADSERVICES_AD_ID',
      'android.permission.ACCESS_ADSERVICES_TOPICS',
      'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      // BooKoo attaches still photos through the system picker and never
      // records audio or draws above other apps. Block transitive native
      // manifest declarations so the store bundle requests only capabilities
      // that are reachable from the product.
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      // Attachments use Android's system photo picker. Keeping broad library
      // read access here would contradict that user-initiated flow and trigger
      // Google Play's restricted Photo and Video Permissions declaration.
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ],
    ...(googleMapsAndroidApiKey
      ? {config: {googleMaps: {apiKey: googleMapsAndroidApiKey}}}
      : {}),
    userInterfaceStyle: 'automatic',
    permissions: [
      'CAMERA',
      'NOTIFICATIONS',
      'POST_NOTIFICATIONS',
      'RECEIVE_BOOT_COMPLETED',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
      'VIBRATE',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
    ],
    intentFilters: qa
      ? []
      : [
          {
            action: 'VIEW',
            autoVerify: true,
            data: {scheme: 'https', host: APP_DOMAIN, pathPrefix: '/invite'},
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
  },
  extra: {
    eas: {projectId: EAS_PROJECT_ID},
    stage: qa ? 'preview' : (process.env.STAGE ?? 'development'),
  },
  // Vietnamese native declarations belong to the1.4.0 runtime; QA remains
  // isolated so local testing cannot receive or replace production updates.
  runtimeVersion: qa ? `qa-${version}` : '1.4.0',
  updates: {
    fallbackToCacheTimeout: 0,
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
});
