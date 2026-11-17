import 'react-native';

import type {PropsWithChildren, ReactElement} from 'react';
import {act, renderHook, waitFor} from '@testing-library/react-native';

import {
  AppLockProvider,
  useAppLock,
} from '../../../../src/features/lock/provider';

/**
 * Two ways into a locked ledger, both closed here.
 *
 * 1. `forget()` unlocked before signing out. `signOut` awaits an image
 *    disk-cache clear, a push-token read and three network round trips, so the
 *    entries were on screen and signed in for that whole window. Offline it is
 *    worse: `convexSignOut` catches its own failure and the websocket client
 *    queues across a reconnect, so the sign-out HANGS — and the record had
 *    already been destroyed, leaving the account signed in with no lock.
 * 2. `unlockWithBiometrics` ignored `lockedUntil`, so the lockout five, ten or
 *    fifteen wrong PINs earns was one tap away from being skipped — and
 *    `disableDeviceFallback: false` accepted the phone's own passcode, which is
 *    the key the app lock exists to withhold.
 */

const mockSignOut = jest.fn();
jest.mock('../../../../src/features/auth/signOut', () => ({
  useSessionSignOut: () => ({leaving: false, signOut: mockSignOut}),
}));
// Stable identity: the provider's record-loading effect depends on `user`, and
// a fresh object each render re-runs it and re-applies the stored lock flag.
const mockUser = {userId: 'u1'};
jest.mock('../../../../src/features/auth/currentUser', () => ({
  useCurrentUser: () => mockUser,
}));

const mockAuthenticate = jest.fn();
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: (...args: unknown[]) => mockAuthenticate(...args),
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  supportedAuthenticationTypesAsync: async () => [],
}));

let mockRecord: Record<string, unknown> | null = null;
const mockDestroy = jest.fn();
jest.mock('../../../../src/features/lock/lockStore', () => ({
  readLockRecord: async () => mockRecord,
  writeLockRecord: async (next: Record<string, unknown>) => {
    mockRecord = next;
  },
  destroyLockRecord: async () => {
    mockDestroy();
    mockRecord = null;
  },
}));

const wrapper = ({children}: PropsWithChildren): ReactElement => (
  <AppLockProvider>{children}</AppLockProvider>
);

/** `result.current` always reflects the latest render, so no stale closure. */
const mountLock = () => renderHook(() => useAppLock(), {wrapper});

/**
 * `enabled` alone is true while the record is still loading (`lockPending`),
 * so waiting on it would let a test pass with `record === null` — which is how
 * two of these passed for the wrong reason before.
 */
const waitForRecord = async (
  result: {current: ReturnType<typeof useAppLock>},
): Promise<void> => {
  await waitFor(() => {
    expect(result.current.ready).toBe(true);
    expect(result.current.hasPin).toBe(true);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockAuthenticate.mockResolvedValue({success: true});
  mockRecord = {
    // The provider destroys a record whose owner is not the signed-in user.
    lockOwnerUserId: 'u1',
    biometricsEnabled: true,
    failedAttempts: 0,
    pin: {verifierB64: 'AAAA', saltB64: 'AAAA'},
  };
});

/** Resolve/reject a sign-out on demand, so the window can be inspected. */
const deferred = (): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

describe('forgetting the PIN', () => {
  it('stays locked for the whole sign-out, not just until the store call', async () => {
    // The assertion that matters is the state the user sees. Asserting the
    // order of store calls alone would pass even if the screen unlocked first.
    const gate = deferred();
    mockSignOut.mockReturnValue(gate.promise);

    const {result} = mountLock();
    // `enabled` alone is true while the record is still loading (lockPending),
    // so waiting on it would let a test pass with `record === null`.
    await waitForRecord(result);
    expect(result.current.locked).toBe(true);

    let done: Promise<void>;
    await act(async () => {
      done = result.current.forget();
    });

    // Sign-out is still in flight: the ledger must not be on screen.
    expect(result.current.locked).toBe(true);
    expect(result.current.enabled).toBe(true);
    expect(mockDestroy).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve();
      await done;
    });

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result.current.locked).toBe(false);
  });

  it('keeps the lock when sign-out fails, instead of dropping it forever', async () => {
    mockSignOut.mockRejectedValue(new Error('offline'));

    const {result} = mountLock();
    // `enabled` alone is true while the record is still loading (lockPending),
    // so waiting on it would let a test pass with `record === null`.
    await waitForRecord(result);
    await act(async () => {
      await result.current.forget().catch(() => undefined);
    });

    expect(mockDestroy).not.toHaveBeenCalled();
    expect(mockRecord).not.toBeNull();
    // Store state is not enough: the screen must still be showing the lock.
    expect(result.current.locked).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it('joins a second forget to the first instead of skipping past it', async () => {
    // Early-returning here would disarm the fifteenth-attempt tripwire for as
    // long as the first attempt is hung — and offline it hangs rather than
    // failing — leaving the PIN open to unlimited guesses.
    const gate = deferred();
    mockSignOut.mockReturnValueOnce(gate.promise).mockResolvedValue(undefined);

    const {result} = mountLock();
    await waitForRecord(result);

    let first: Promise<void>;
    let second: Promise<void>;
    await act(async () => {
      first = result.current.forget();
      second = result.current.forget();
    });

    // Still one real attempt, still locked.
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.locked).toBe(true);
    expect(mockDestroy).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve();
      await Promise.all([first, second]);
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result.current.locked).toBe(false);
  });

  it('hangs rather than failing when offline, and never clears the lock', async () => {
    // The installed stack pends socket calls until reconnect; it does not
    // reject. A hung sign-out must leave the lock exactly where it was.
    mockSignOut.mockReturnValue(new Promise<void>(() => undefined));

    const {result} = mountLock();
    await waitForRecord(result);
    await act(async () => {
      void result.current.forget();
    });

    expect(result.current.locked).toBe(true);
    expect(result.current.enabled).toBe(true);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

});

describe('the fifteenth wrong PIN', () => {
  it('persists the lockout before it tries to sign out', async () => {
    // Without the write-first order the record stays at fourteen with an
    // expired lockout, so a failed or hung sign-out leaves the next guess free
    // to recompute fifteen and try again — unlimited attempts at scrypt speed.
    mockRecord = {...mockRecord, failedAttempts: 14};
    mockSignOut.mockReturnValue(new Promise<void>(() => undefined));

    const {result} = mountLock();
    await waitForRecord(result);

    await act(async () => {
      void result.current.unlockWithPin('000000');
    });

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockRecord?.failedAttempts).toBe(15);
    expect(mockRecord?.lockedUntil).toEqual(expect.any(Number));
    expect(mockRecord?.lockedUntil as number).toBeGreaterThan(Date.now());
    // The sign-out is still hanging, so the ledger must still be shut.
    expect(result.current.locked).toBe(true);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('keeps the lockout when the sign-out rejects', async () => {
    mockRecord = {...mockRecord, failedAttempts: 14};
    mockSignOut.mockRejectedValue(new Error('offline'));

    const {result} = mountLock();
    await waitForRecord(result);

    await act(async () => {
      await result.current.unlockWithPin('000000').catch(() => undefined);
    });

    expect(mockRecord?.failedAttempts).toBe(15);
    expect(mockRecord?.lockedUntil as number).toBeGreaterThan(Date.now());
    expect(result.current.locked).toBe(true);
  });
});

describe('turning the lock off from settings', () => {
  it('drops the lock without ending the session', async () => {
    const {result} = mountLock();
    // `enabled` alone is true while the record is still loading (lockPending),
    // so waiting on it would let a test pass with `record === null`.
    await waitForRecord(result);
    await act(async () => {
      await result.current.unlockWithBiometrics();
    });
    await waitFor(() => expect(result.current.locked).toBe(false));
    await act(async () => {
      await result.current.disable();
    });

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('biometric unlock', () => {
  it('refuses while the PIN lockout is still running', async () => {
    mockRecord = {...mockRecord, lockedUntil: Date.now() + 60_000};

    const {result} = mountLock();
    // `enabled` alone is true while the record is still loading (lockPending),
    // so waiting on it would let a test pass with `record === null`.
    await waitForRecord(result);

    let ok = true;
    await act(async () => {
      ok = await result.current.unlockWithBiometrics();
    });

    expect(ok).toBe(false);
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
  });

  it('does not accept the device passcode in place of the app PIN', async () => {
    const {result} = mountLock();
    // `enabled` alone is true while the record is still loading (lockPending),
    // so waiting on it would let a test pass with `record === null`.
    await waitForRecord(result);
    await act(async () => {
      await result.current.unlockWithBiometrics();
    });

    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({disableDeviceFallback: true}),
    );
  });
});
