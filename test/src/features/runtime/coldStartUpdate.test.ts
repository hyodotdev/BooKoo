import {
  applyColdStartUpdate,
  coldStartUpdateHoldsSplash,
  shouldReloadForPendingUpdate,
  COLD_START_UPDATE_TIMEOUT_MS,
  type ColdStartUpdateDeps,
} from '~/features/runtime/coldStartUpdate';

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

  describe('runtime-staged update (expo-updates downloads on load)', () => {
    it('reloads while the splash is still up', () => {
      expect(shouldReloadForPendingUpdate(true, null, 0, 4000)).toBe(true);
    });

    it('reloads when the explicit check found nothing because it was already staged', () => {
      // The hole this closes: the runtime downloads on load and wins the race,
      // so `checkForUpdate` reports NONE while the OLD bundle keeps running.
      expect(shouldReloadForPendingUpdate(true, 'NONE', 10, 4000)).toBe(true);
      expect(shouldReloadForPendingUpdate(true, 'TIMEOUT', 10, 4000)).toBe(
        true,
      );
    });

    it('stops reloading once the launch window has passed', () => {
      // After that the user may be mid-entry; SoftUpdateSheet asks first.
      expect(shouldReloadForPendingUpdate(true, 'NONE', 4001, 4000)).toBe(
        false,
      );
      expect(shouldReloadForPendingUpdate(true, 'FAILED', 60_000, 4000)).toBe(
        false,
      );
    });

    it('does not stack a second reload on one already under way', () => {
      expect(shouldReloadForPendingUpdate(true, 'APPLIED', 0, 4000)).toBe(
        false,
      );
    });

    it('does nothing when no update is staged', () => {
      expect(shouldReloadForPendingUpdate(false, null, 0, 4000)).toBe(false);
      expect(shouldReloadForPendingUpdate(false, 'NONE', 0, 4000)).toBe(false);
    });
  });

  it('bounds the default budget so a launch cannot hang', () => {
    expect(COLD_START_UPDATE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(COLD_START_UPDATE_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});
