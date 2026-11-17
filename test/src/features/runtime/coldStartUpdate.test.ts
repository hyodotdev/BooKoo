import * as Patch from '@codemagic/react-native-patch';

import {
  applyColdStartUpdate,
  coldStartUpdateHoldsSplash,
  patchColdStartDeps,
  COLD_START_UPDATE_TIMEOUT_MS,
  type ColdStartUpdateDeps,
} from '~/features/runtime/coldStartUpdate';

jest.mock('@codemagic/react-native-patch', () => ({
  ...jest.requireActual<object>('@codemagic/react-native-patch'),
  checkForUpdate: jest.fn(),
  downloadUpdate: jest.fn(),
  installUpdate: jest.fn(),
  restartApp: jest.fn(),
}));

const patch = jest.mocked(Patch);

const deps = (
  overrides: Partial<ColdStartUpdateDeps> = {},
): ColdStartUpdateDeps => ({
  isEnabled: true,
  checkForUpdate: jest.fn().mockResolvedValue({isAvailable: false}),
  fetchUpdate: jest.fn().mockResolvedValue(undefined),
  reload: jest.fn().mockResolvedValue(undefined),
  timeoutMs: 50,
  ...overrides,
});

describe('cold start update gate', () => {
  it('applies an available update before the first paint', async () => {
    const reload = jest.fn().mockResolvedValue(undefined);
    const fetchUpdate = jest.fn().mockResolvedValue(undefined);
    const config = deps({
      checkForUpdate: jest.fn().mockResolvedValue({isAvailable: true}),
      fetchUpdate,
      reload,
    });

    await expect(applyColdStartUpdate(config)).resolves.toBe('APPLIED');
    expect(fetchUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps holding the splash while a reload is under way', () => {
    // `reload` replaces the process, so releasing here would flash the stale
    // bundle the update is about to replace.
    expect(coldStartUpdateHoldsSplash('APPLIED')).toBe(true);
    expect(coldStartUpdateHoldsSplash(null)).toBe(true);
  });

  it.each(['NONE', 'DISABLED', 'TIMEOUT', 'FAILED'] as const)(
    'releases the splash on %s',
    (outcome) => {
      expect(coldStartUpdateHoldsSplash(outcome)).toBe(false);
    },
  );

  it('never reloads when no update is available', async () => {
    const reload = jest.fn().mockResolvedValue(undefined);
    await expect(applyColdStartUpdate(deps({reload}))).resolves.toBe('NONE');
    expect(reload).not.toHaveBeenCalled();
  });

  it('skips the network entirely when updates are disabled', async () => {
    const checkForUpdate = jest.fn();
    await expect(
      applyColdStartUpdate(deps({isEnabled: false, checkForUpdate})),
    ).resolves.toBe('DISABLED');
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('releases the splash when a slow network outruns the budget', async () => {
    // The recovery screens live below the splash boundary, so an unbounded
    // check would hide the UI that explains an offline launch.
    const config = deps({
      checkForUpdate: jest.fn(
        () => new Promise<{isAvailable: boolean}>(() => undefined),
      ),
      timeoutMs: 20,
    });
    await expect(applyColdStartUpdate(config)).resolves.toBe('TIMEOUT');
  });

  it('never restarts mid-use when a download finishes after the budget', async () => {
    // The splash is already gone, so the user may be typing. The staged update
    // must wait for the next cold start instead of reloading under them.
    let finishDownload: () => void = () => undefined;
    const fetchUpdate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        }),
    );
    const reload = jest.fn().mockResolvedValue(undefined);
    const config = deps({
      checkForUpdate: jest.fn().mockResolvedValue({isAvailable: true}),
      fetchUpdate,
      reload,
      timeoutMs: 20,
    });

    await expect(applyColdStartUpdate(config)).resolves.toBe('TIMEOUT');
    finishDownload();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    ['check', {checkForUpdate: jest.fn().mockRejectedValue(new Error('x'))}],
    [
      'download',
      {
        checkForUpdate: jest.fn().mockResolvedValue({isAvailable: true}),
        fetchUpdate: jest.fn().mockRejectedValue(new Error('x')),
      },
    ],
  ])('releases the splash when the %s fails', async (_label, overrides) => {
    const reload = jest.fn().mockResolvedValue(undefined);
    await expect(
      applyColdStartUpdate(deps({...overrides, reload})),
    ).resolves.toBe('FAILED');
    expect(reload).not.toHaveBeenCalled();
  });

  it('bounds the default budget so a launch cannot hang', () => {
    expect(COLD_START_UPDATE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(COLD_START_UPDATE_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  describe('Codemagic Patch adapter', () => {
    const remotePackage = {packageHash: 'abc'} as Patch.RemotePackage;
    const localPackage = {packageHash: 'abc'} as Patch.LocalPackage;

    beforeEach(() => {
      jest.clearAllMocks();
      patch.installUpdate.mockResolvedValue(undefined);
      patch.restartApp.mockResolvedValue(undefined);
    });

    it('downloads and stages an OTA update for the next restart', async () => {
      patch.checkForUpdate.mockResolvedValue({
        action: 'ota-update',
        remotePackage,
        isStoreUpdateAvailable: false,
        latestBinaryVersion: null,
      });
      const download = patch.downloadUpdate.mockResolvedValue(localPackage);
      const install = patch.installUpdate;
      const ota = patchColdStartDeps();

      await expect(ota.checkForUpdate()).resolves.toEqual({isAvailable: true});
      await ota.fetchUpdate();

      expect(download).toHaveBeenCalledWith(remotePackage);
      expect(install).toHaveBeenCalledWith(localPackage, {
        installMode: Patch.InstallMode.ON_NEXT_RESTART,
      });
    });

    it('stages a withdrawn update back to the store bundle', async () => {
      const revert = {
        action: 'embedded-revert',
        isStoreUpdateAvailable: false,
        latestBinaryVersion: null,
      } as const;
      patch.checkForUpdate.mockResolvedValue(revert);
      const download = patch.downloadUpdate;
      const install = patch.installUpdate;
      const ota = patchColdStartDeps();

      await expect(ota.checkForUpdate()).resolves.toEqual({isAvailable: true});
      await ota.fetchUpdate();

      expect(download).not.toHaveBeenCalled();
      expect(install).toHaveBeenCalledWith(revert, {
        installMode: Patch.InstallMode.ON_NEXT_RESTART,
      });
    });

    it('stages nothing when the bundle is current', async () => {
      patch.checkForUpdate.mockResolvedValue({
        action: 'up-to-date',
        isStoreUpdateAvailable: false,
        latestBinaryVersion: null,
      });
      const install = patch.installUpdate;
      const ota = patchColdStartDeps();

      await expect(ota.checkForUpdate()).resolves.toEqual({
        isAvailable: false,
      });
      await ota.fetchUpdate();

      expect(install).not.toHaveBeenCalled();
    });

    it('reloads through Patch so the staged bundle takes over', async () => {
      await patchColdStartDeps().reload();
      expect(patch.restartApp).toHaveBeenCalledTimes(1);
    });
  });
});
