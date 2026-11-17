let mockStage: string | undefined;
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (values: {android: string}) => values.android,
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return {extra: {stage: mockStage}};
    },
  },
}));

describe('ad build environment', () => {
  const originalDev = __DEV__;
  const originalId = process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID;
  const originalKey = process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY;

  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', {value: originalDev});
    mockStage = undefined;
    if (originalId === undefined)
      delete process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID;
    else process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID = originalId;
    if (originalKey === undefined)
      delete process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY;
    else process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY = originalKey;
    jest.resetModules();
  });

  function config(stage: string | undefined, productionId = '', appKey = '') {
    Object.defineProperty(globalThis, '__DEV__', {value: false});
    mockStage = stage;
    process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID = productionId;
    process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY = appKey;
    return jest.requireActual<
      typeof import('../../../../src/features/ads/config')
    >('../../../../src/features/ads/config');
  }

  it.each(['development', 'preview'])(
    'enables QA diagnostics without substituting other apps in %s builds',
    (stage) => {
      const ads = config(stage);
      expect(ads.isAdDebugEnabled()).toBe(true);
      expect(ads.isAdRuntimeConfigured()).toBe(false);
      expect(ads.bannerUnitId()).toBeNull();
    },
  );

  it.each(['production', undefined, 'unknown'])(
    'never substitutes test inventory for missing %s production configuration',
    (stage) => {
      const ads = config(stage);
      expect(ads.isAdDebugEnabled()).toBe(false);
      expect(ads.bannerUnitId()).toBeNull();
    },
  );

  it('uses the configured production ID in production', () => {
    const ads = config(
      'production',
      'configured-production-banner',
      'configured-app',
    );
    expect(ads.bannerUnitId()).toBe('configured-production-banner');
    expect(ads.adAppKey()).toBe('configured-app');
    expect(ads.isAdRuntimeConfigured()).toBe(true);
  });
  it('fails closed when only a banner unit is configured', () => {
    expect(config('production', 'banner-only').isAdRuntimeConfigured()).toBe(
      false,
    );
  });
});
