import type {LevelPlayInitListener} from 'unity-levelplay-mediation';

describe('consent and LevelPlay native compatibility', () => {
  afterEach(() => {
    jest.dontMock('react-native-google-mobile-ads');
    jest.dontMock('unity-levelplay-mediation');
    jest.resetModules();
  });

  it('degrades to no ads when an older native client lacks the module', () => {
    jest.doMock('react-native-google-mobile-ads', () => {
      throw new Error('native module is unavailable');
    });

    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const {googleConsentModule} =
        require('../../../../src/features/ads/native') as typeof import('../../../../src/features/ads/native');
      /* eslint-enable @typescript-eslint/no-require-imports */

      expect(googleConsentModule()).toBeNull();
    });
  });
  it('degrades to no ads when an older native client lacks LevelPlay', () => {
    jest.doMock('unity-levelplay-mediation', () => {
      throw new Error('native module is unavailable');
    });
    jest.isolateModules(() => {
      const {levelPlayModule} = jest.requireActual<
        typeof import('../../../../src/features/ads/native')
      >('../../../../src/features/ads/native');
      expect(levelPlayModule()).toBeNull();
    });
  });
});
describe('LevelPlay initialization lifecycle', () => {
  let listener: LevelPlayInitListener | undefined;
  let appKey: string | null;
  let debug: boolean;
  const setMetaData = jest.fn(async () => undefined);
  const setAdaptersDebug = jest.fn(async () => undefined);
  const setCCPA = jest.fn(async () => undefined);
  const setCOPPA = jest.fn(async () => undefined);
  const setGDPRConsent = jest.fn(async () => undefined);
  const init = jest.fn(
    async (_request: unknown, nextListener: LevelPlayInitListener) => {
      listener = nextListener;
    },
  );

  const loadRuntime =
    (): typeof import('../../../../src/features/ads/native') =>
      jest.requireActual<typeof import('../../../../src/features/ads/native')>(
        '../../../../src/features/ads/native',
      );

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.clearAllMocks();
    listener = undefined;
    appKey = 'bookoo-owned-key';
    debug = false;
    jest.doMock('../../../../src/features/ads/config', () => ({
      adAppKey: () => appKey,
      isAdDebugEnabled: () => debug,
    }));
    jest.doMock('unity-levelplay-mediation', () => ({
      LevelPlay: {setMetaData, setAdaptersDebug, init},
      LevelPlayPrivacySettings: {setCCPA, setCOPPA, setGDPRConsent},
      LevelPlayInitRequest: {
        builder: (key: string) => ({build: () => ({appKey: key})}),
      },
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.dontMock('../../../../src/features/ads/config');
    jest.dontMock('unity-levelplay-mediation');
    jest.resetModules();
  });

  it('shares one init and applies privacy restrictions before requesting ads', async () => {
    const {initializeAdRuntime} = loadRuntime();
    const first = initializeAdRuntime();
    expect(initializeAdRuntime()).toBe(first);
    await jest.advanceTimersByTimeAsync(0);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      {appKey: 'bookoo-owned-key'},
      expect.objectContaining({onInitSuccess: expect.any(Function)}),
    );
    expect(setMetaData).toHaveBeenCalledWith('UnityAds_coppa', ['true']);
    expect(setMetaData).toHaveBeenCalledWith('is_deviceid_optout', ['true']);
    expect(setCCPA).toHaveBeenCalledWith(true);
    expect(setCOPPA).toHaveBeenCalledWith(false);
    expect(init.mock.invocationCallOrder[0]).toBeGreaterThan(
      setCOPPA.mock.invocationCallOrder[0],
    );
    expect(setGDPRConsent).not.toHaveBeenCalled();

    listener?.onInitSuccess({isAdQualityEnabled: false});
    await first;
    expect(initializeAdRuntime()).toBe(first);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the separate test-suite mode out of ordinary development requests', async () => {
    debug = true;
    const pending = loadRuntime().initializeAdRuntime();
    await jest.advanceTimersByTimeAsync(0);
    expect(setAdaptersDebug).toHaveBeenCalledWith(true);
    expect(setMetaData.mock.calls).toEqual([
      ['UnityAds_coppa', ['true']],
      ['is_deviceid_optout', ['true']],
    ]);
    listener?.onInitSuccess({isAdQualityEnabled: false});
    await pending;
  });

  it('allows a fresh attempt after a native failure', async () => {
    const {initializeAdRuntime} = loadRuntime();
    const first = initializeAdRuntime();
    const rejected = expect(first).rejects.toThrow('731');
    await jest.advanceTimersByTimeAsync(0);
    listener?.onInitFailed({errorCode: 731, errorMessage: 'offline'});
    await rejected;

    const retry = initializeAdRuntime();
    await jest.advanceTimersByTimeAsync(0);
    listener?.onInitSuccess({isAdQualityEnabled: false});
    await retry;
    expect(init).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not leave callers waiting forever if native callbacks never arrive', async () => {
    const {initializeAdRuntime} = loadRuntime();
    const pending = initializeAdRuntime();
    const rejected = expect(pending).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(30_000);
    await rejected;

    const retry = initializeAdRuntime();
    await jest.advanceTimersByTimeAsync(0);
    listener?.onInitSuccess({isAdQualityEnabled: false});
    await retry;
    expect(init).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never initializes another app when the BooKoo key is missing', async () => {
    appKey = null;
    await expect(loadRuntime().initializeAdRuntime()).rejects.toThrow(
      'unavailable',
    );
    expect(init).not.toHaveBeenCalled();
    expect(setMetaData).not.toHaveBeenCalled();
  });
});
