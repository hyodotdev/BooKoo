let mockStage: string | undefined;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return {extra: {stage: mockStage}};
    },
  },
}));

describe('growth analytics build environment', () => {
  const originalDev = __DEV__;
  const originalId = process.env.EXPO_PUBLIC_LAYERS_APP_ID;

  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', {value: originalDev});
    mockStage = undefined;
    if (originalId === undefined) delete process.env.EXPO_PUBLIC_LAYERS_APP_ID;
    else process.env.EXPO_PUBLIC_LAYERS_APP_ID = originalId;
    jest.resetModules();
  });

  function config(stage: string | undefined, appId = '') {
    Object.defineProperty(globalThis, '__DEV__', {value: false});
    mockStage = stage;
    process.env.EXPO_PUBLIC_LAYERS_APP_ID = appId;
    return jest.requireActual<
      typeof import('../../../../src/features/growth/config')
    >('../../../../src/features/growth/config');
  }

  it('stays unconfigured without an app id, so the provider never mounts', () => {
    const growth = config('production');
    expect(growth.layersAppId()).toBeNull();
    expect(growth.isGrowthAnalyticsConfigured()).toBe(false);
  });

  it('reports the configured app id in production', () => {
    const growth = config('production', 'app_live');
    expect(growth.layersAppId()).toBe('app_live');
    expect(growth.isGrowthAnalyticsConfigured()).toBe(true);
    expect(growth.layersEnvironment()).toBe('production');
  });

  it('keeps internal QA installs out of the production numbers', () => {
    expect(config('preview', 'app_live').layersEnvironment()).toBe('staging');
    expect(config('development', 'app_live').layersEnvironment()).toBe(
      'development',
    );
  });

  it.each([undefined, 'unknown'])(
    'treats an unrecognised stage (%s) as production rather than inventing one',
    (stage) => {
      expect(config(stage, 'app_live').layersEnvironment()).toBe('production');
    },
  );
});
