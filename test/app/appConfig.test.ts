import {readFileSync} from 'fs';
import {join} from 'path';

import type {ConfigContext} from '@expo/config';

import createConfig from '../../app.config';

const ota = JSON.parse(
  readFileSync(join(process.cwd(), 'shared/otaDeployments.json'), 'utf8'),
) as {
  apiUrl: string;
  downloadBaseUrl: string;
  deploymentKeys: Record<
    'ios' | 'android',
    {staging: string; production: string}
  >;
};

const config = createConfig({
  config: {name: 'BooKoo', slug: 'bookoo'},
} as ConfigContext);

describe('Expo app config', () => {
  it('separates QA native identities, OTA deployments and deep links from production', () => {
    const previous = process.env.BOOKOO_APP_VARIANT;
    process.env.BOOKOO_APP_VARIANT = 'qa';
    try {
      jest.isolateModules(() => {
        const qaConfig = jest
          .requireActual<typeof import('../../app.config')>('../../app.config')
          .default({config: {name: 'BooKoo', slug: 'bookoo'}} as ConfigContext);
        expect(qaConfig.name).toBe('BooKoo QA');
        expect(qaConfig.ios?.bundleIdentifier).toBe('dev.hyo.bookoo.qa');
        expect(qaConfig.android?.package).toBe('dev.hyo.bookoo.qa');
        // QA builds ask the Staging deployment, never Production.
        expect(qaConfig.plugins).toContainEqual([
          '@codemagic/react-native-patch',
          {
            ios: expect.objectContaining({
              deploymentKey: ota.deploymentKeys.ios.staging,
            }),
            android: expect.objectContaining({
              deploymentKey: ota.deploymentKeys.android.staging,
            }),
          },
        ]);
        expect(qaConfig.scheme).toBe('bookoo-qa');
        expect(qaConfig.ios?.associatedDomains).toEqual([]);
        expect(qaConfig.android?.intentFilters).toEqual([]);
        expect(qaConfig.extra?.stage).toBe('preview');
      });
    } finally {
      if (previous === undefined) delete process.env.BOOKOO_APP_VARIANT;
      else process.env.BOOKOO_APP_VARIANT = previous;
    }
  });

  it('supports Maps and the scene lifecycle required by the iOS 27 SDK', () => {
    expect(config.plugins).toContainEqual([
      'expo-build-properties',
      expect.objectContaining({
        ios: expect.objectContaining({
          deploymentTarget: '17.0',
          enableSceneSupport: true,
        }),
      }),
    ]);
  });

  it('keeps the LevelPlay native contract in the binary', () => {
    expect(config.version).toBe('1.5.0');
    expect(config.plugins).toContain('./plugins/withLevelPlay');
  });

  it('takes over-the-air updates from Codemagic Patch, not EAS Update', () => {
    expect(config.updates).toBeUndefined();
    expect(config.runtimeVersion).toBeUndefined();
    expect(config.plugins).toContainEqual([
      '@codemagic/react-native-patch',
      {
        ios: {
          apiUrl: ota.apiUrl,
          downloadBaseUrl: ota.downloadBaseUrl,
          deploymentKey: ota.deploymentKeys.ios.production,
        },
        android: {
          apiUrl: ota.apiUrl,
          downloadBaseUrl: ota.downloadBaseUrl,
          deploymentKey: ota.deploymentKeys.android.production,
        },
      },
    ]);
  });

  it('declares every supported locale to iOS', () => {
    expect(config.ios?.infoPlist?.CFBundleLocalizations).toEqual([
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
    ]);
  });

  it('lets CpkProvider own its bundled font loading', () => {
    const pluginNames = (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );

    expect(pluginNames).not.toContain('expo-font');
  });

  it('describes attachments as photos rather than receipt-only media', () => {
    expect(JSON.stringify(config.plugins)).not.toContain('영수증');
  });

  it('uses a mask-safe Android adaptive icon instead of a legacy white ring', () => {
    expect(config.android?.adaptiveIcon).toEqual({
      foregroundImage: './assets/adaptive-icon-foreground.png',
      monochromeImage: './assets/adaptive-icon-foreground.png',
      backgroundColor: '#20B7A9',
    });
  });

  it('uses a dedicated padded Android splash wordmark', () => {
    const splashPlugin = (config.plugins ?? []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(splashPlugin).toEqual([
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
    ]);
  });

  it('binds invite links to the production host on both native platforms', () => {
    expect(config.ios?.associatedDomains).toEqual(['applinks:bookoo.hyo.dev']);
    expect(config.android?.package).toBe('dev.hyo.bookoo');
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        data: {
          scheme: 'https',
          host: 'bookoo.hyo.dev',
          pathPrefix: '/invite',
        },
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ]);
  });

  it('uses the Android system picker without broad photo-library access', () => {
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      ]),
    );
    expect(config.android?.permissions).not.toEqual(
      expect.arrayContaining(['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO']),
    );
  });

  it('does not request audio recording or draw-over-apps access', () => {
    expect(config.android?.permissions).not.toEqual(
      expect.arrayContaining(['RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW']),
    );
  });

  it('blocks advertising IDs and Privacy Sandbox access for contextual ads', () => {
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'com.google.android.gms.permission.AD_ID',
        'android.permission.ACCESS_ADSERVICES_AD_ID',
        'android.permission.ACCESS_ADSERVICES_TOPICS',
        'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      ]),
    );
  });

  it('refuses an Android production build without a Maps key', () => {
    const previous = {
      profile: process.env.EAS_BUILD_PROFILE,
      platform: process.env.EAS_BUILD_PLATFORM,
      appId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
      appKey: process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY,
      bannerId: process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID,
      mapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
    };
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EAS_BUILD_PLATFORM = 'android';
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID = 'configured';
    process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY = 'configured';
    process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID = 'configured';
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

    try {
      jest.isolateModules(() => {
        expect(() => {
          const productionConfig =
            jest.requireActual<typeof import('../../app.config')>(
              '../../app.config',
            ).default;
          productionConfig({
            config: {name: 'BooKoo', slug: 'bookoo'},
          } as ConfigContext);
        }).toThrow('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY');
      });
    } finally {
      const restore = (name: string, value: string | undefined): void => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      };
      restore('EAS_BUILD_PROFILE', previous.profile);
      restore('EAS_BUILD_PLATFORM', previous.platform);
      restore('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', previous.appId);
      restore('EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY', previous.appKey);
      restore('EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID', previous.bannerId);
      restore('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY', previous.mapsKey);
    }
  });

  describe('store build number', () => {
    const withBuildNumber = (value: string | undefined): ExpoConfigShape => {
      const previous = process.env.BOOKOO_BUILD_NUMBER;
      if (value === undefined) delete process.env.BOOKOO_BUILD_NUMBER;
      else process.env.BOOKOO_BUILD_NUMBER = value;
      try {
        let loaded: ExpoConfigShape | undefined;
        jest.isolateModules(() => {
          loaded = jest
            .requireActual<typeof import('../../app.config')>('../../app.config')
            .default({config: {name: 'BooKoo', slug: 'bookoo'}} as ConfigContext);
        });
        if (loaded === undefined) throw new Error('config did not load');
        return loaded;
      } finally {
        if (previous === undefined) delete process.env.BOOKOO_BUILD_NUMBER;
        else process.env.BOOKOO_BUILD_NUMBER = previous;
      }
    };

    it('leaves EAS builds on their remote counters', () => {
      const unset = withBuildNumber(undefined);
      expect(unset.ios?.buildNumber).toBeUndefined();
      expect(unset.android?.versionCode).toBeUndefined();
    });

    it('stamps a Codemagic build number on both platforms', () => {
      const stamped = withBuildNumber('60');
      expect(stamped.ios?.buildNumber).toBe('60');
      expect(stamped.android?.versionCode).toBe(60);
    });

    it.each(['0', '-1', '1.5', 'abc'])('refuses build number %s', (value) => {
      expect(() => withBuildNumber(value)).toThrow(
        'BOOKOO_BUILD_NUMBER must be a positive integer',
      );
    });
  });
});

type ExpoConfigShape = ReturnType<typeof createConfig>;

describe('Layers growth attribution', () => {
  const pluginNames = (config.plugins ?? []).map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  );

  it('strips the ATT key AFTER the SDK writes it', () => {
    // Info.plist mods execute in the reverse of array order — `withMod` makes
    // each newly registered mod the entry point and calls the previous one
    // after itself. So the corrector must be listed FIRST to run LAST. Swap
    // these two and `NSUserTrackingUsageDescription` silently ships with the
    // SDK's "personalized ads" default, which App Store Connect's App Privacy
    // answers do not cover.
    const corrector = pluginNames.indexOf('./plugins/withoutLayersAtt');
    const sdk = pluginNames.indexOf('@layers/expo');

    expect(corrector).toBeGreaterThanOrEqual(0);
    expect(sdk).toBeGreaterThanOrEqual(0);
    expect(corrector).toBeLessThan(sdk);
  });

  it('leaves every iOS ad-attribution surface switched off', () => {
    expect(config.plugins).toContainEqual([
      '@layers/expo',
      expect.objectContaining({
        ios: expect.objectContaining({
          includeDefaultSKAdNetworkIds: false,
          includeAdvertisingAttributionReportEndpoint: false,
        }),
      }),
    ]);
  });

  it('registers no deep-link surface of its own', () => {
    // `scheme`, `ios.associatedDomains` and `android.intentFilters` already
    // declare every URL BooKoo answers. Passing them to the SDK plugin too
    // writes a second copy into the manifest.
    const layers = (config.plugins ?? []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === '@layers/expo',
    ) as [string, Record<string, Record<string, unknown>>];

    expect(layers[1].ios).not.toHaveProperty('urlSchemes');
    expect(layers[1].ios).not.toHaveProperty('associatedDomains');
    expect(layers[1]).not.toHaveProperty('android');
  });
});

describe('local env files', () => {
  // Comments are stripped: the fix's own commentary quotes the very strings
  // these assertions look for.
  const code = readFileSync(join(__dirname, '../../app.config.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('are skipped when EXPO_NO_DOTENV says the environment is already correct', () => {
    // `scripts/ota-release.zsh` sets EXPO_NO_DOTENV=1 next to
    // `eas env:exec production` so a production OTA is built from the EAS
    // Environment alone. This config does its own dotenv loading, so Expo
    // honouring the flag is not enough — it has to honour it here too.
    expect(code).toContain("process.env.EXPO_NO_DOTENV !== '1'");
  });

  it('are never loaded by a bare side-effect import that ignores the flag', () => {
    // A side-effect import runs before any statement can gate it.
    expect(code).not.toContain("import 'dotenv/config'");
  });

  it('keep the STAGE override inside the gate', () => {
    // `override: true` is the dangerous half — it overwrites what EAS already
    // injected. It stays, because local development needs it, but only when
    // local env files are being read at all.
    const gate = code.indexOf('if (readsLocalEnvFiles) {');
    expect(gate).toBeGreaterThan(-1);
    expect(code.indexOf('override: true')).toBeGreaterThan(gate);
    expect(code.indexOf('dotenv.config({quiet: true})')).toBeGreaterThan(gate);
  });
});
