import type {PropsWithChildren, ReactElement} from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

import {Storage, storage} from '~/utils/storage';
import {useCurrentUser} from '~/features/auth/currentUser';
import {useSessionSignOut} from '~/features/auth/signOut';
import {derivePinVerifier, SCRYPT_PARAMS, timingSafeEqual} from './kdf';
import {
  destroyLockRecord,
  readLockRecord,
  writeLockRecord,
  type AppLockRecord,
} from './lockStore';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (bytes: Uint8Array): string => {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    result += ALPHABET[(triple >>> 18) & 63];
    result += ALPHABET[(triple >>> 12) & 63];
    result += index + 1 < bytes.length ? ALPHABET[(triple >>> 6) & 63] : '=';
    result += index + 2 < bytes.length ? ALPHABET[triple & 63] : '=';
  }
  return result;
};
const fromBase64 = (value: string): Uint8Array => {
  const clean = value.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid base64');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
};

interface AppLockContext {
  readonly autoLockAfterMs: number;
  readonly biometricsEnabled: boolean;
  readonly enabled: boolean;
  readonly hasPin: boolean;
  readonly locked: boolean;
  readonly ready: boolean;
  readonly lockedUntil: number | null;
  readonly configure: (input: {
    readonly pin?: string;
    readonly biometricsEnabled: boolean;
    readonly autoLockAfterMs: number;
  }) => Promise<void>;
  readonly disable: () => Promise<void>;
  readonly forget: () => Promise<void>;
  readonly lockNow: () => void;
  readonly unlockWithBiometrics: () => Promise<boolean>;
  readonly unlockWithPin: (pin: string) => Promise<boolean>;
}

const Context = createContext<AppLockContext>({
  autoLockAfterMs: 60_000,
  biometricsEnabled: false,
  enabled: false,
  hasPin: false,
  locked: false,
  ready: false,
  lockedUntil: null,
  configure: async () => undefined,
  disable: async () => undefined,
  forget: async () => undefined,
  lockNow: () => undefined,
  unlockWithBiometrics: async () => false,
  unlockWithPin: async () => false,
});

export function AppLockProvider({children}: PropsWithChildren): ReactElement {
  const {signOut} = useSessionSignOut();
  const user = useCurrentUser();
  const [record, setRecord] = useState<AppLockRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(
    storage.getBoolean(Storage.LockEnabled) ?? false,
  );
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    let active = true;
    void readLockRecord().then(async (stored) => {
      if (!active) return;
      if (
        stored !== null &&
        user !== undefined &&
        user !== null &&
        stored.lockOwnerUserId !== String(user.userId)
      ) {
        await destroyLockRecord();
        if (active) {
          setRecord(null);
          setLocked(false);
          setReady(true);
        }
        return;
      }
      setRecord(stored);
      setLocked(
        stored !== null && (storage.getBoolean(Storage.LockEnabled) ?? true),
      );
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const lockNow = useCallback((): void => {
    if (record === null) return;
    storage.set(Storage.LockEnabled, true);
    setLocked(true);
  }, [record]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'inactive') setCovered(true);
      if (next === 'background') {
        storage.set(Storage.LockLastActiveAt, Date.now());
        if (record?.autoLockAfterMs === 0) lockNow();
      }
      if (next === 'active') {
        setCovered(false);
        const last = storage.getNumber(Storage.LockLastActiveAt) ?? 0;
        if (record !== null && Date.now() - last >= record.autoLockAfterMs)
          lockNow();
      }
    });
    return () => subscription.remove();
  }, [lockNow, record]);

  const configure = useCallback<AppLockContext['configure']>(
    async ({pin, biometricsEnabled, autoLockAfterMs}) => {
      if (user === undefined || user === null)
        throw new Error('No active account');
      if (
        !Number.isSafeInteger(autoLockAfterMs) ||
        autoLockAfterMs < 0 ||
        autoLockAfterMs > 60 * 60 * 1000 ||
        (pin !== undefined && !/^\d{6}$/.test(pin))
      )
        throw new Error('Invalid lock settings');
      const nextPin =
        pin === undefined
          ? record?.pin
          : await (async () => {
              const salt = await Crypto.getRandomBytesAsync(16);
              const verifier = await derivePinVerifier(pin, salt);
              return {
                algo: 'scrypt' as const,
                n: SCRYPT_PARAMS.N,
                r: SCRYPT_PARAMS.r,
                p: SCRYPT_PARAMS.p,
                dkLen: SCRYPT_PARAMS.dkLen,
                saltB64: toBase64(salt),
                verifierB64: toBase64(verifier),
                digits: 6 as const,
              };
            })();
      const next: AppLockRecord = {
        version: 1,
        lockOwnerUserId: String(user.userId),
        biometricsEnabled,
        ...(nextPin === undefined ? {} : {pin: nextPin}),
        autoLockAfterMs,
        failedAttempts: 0,
      };
      await writeLockRecord(next);
      setRecord(next);
      setLocked(false);
    },
    [record?.pin, user],
  );

  const unlockSuccess = useCallback(async (): Promise<void> => {
    if (record === null) return;
    const next = {...record, failedAttempts: 0, lockedUntil: undefined};
    await writeLockRecord(next);
    setRecord(next);
    setLocked(false);
    storage.set(Storage.LockLastActiveAt, Date.now());
  }, [record]);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (record === null || !record.biometricsEnabled) return false;
    // The PIN path refuses while `lockedUntil` is in the future; this one did
    // not, so the lockout that five, ten or fifteen wrong PINs earns was one
    // tap away from being skipped.
    if (record.lockedUntil !== undefined && record.lockedUntil > Date.now())
      return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'BooKoo',
      // The app lock exists to stand between the ledger and someone who can
      // already open the phone — a partner, a flatmate, anyone who watched the
      // passcode being typed. Allowing the device passcode as a fallback hands
      // them exactly the key the lock was added to withhold. Biometrics that
      // fail fall back to the PIN field, which is already on screen.
      disableDeviceFallback: true,
      requireConfirmation: false,
    });
    if (!result.success) return false;
    await unlockSuccess();
    return true;
  }, [record, unlockSuccess]);

  /** Drop the lock while staying signed in. The settings toggle's half. */
  const clearLock = useCallback(async (): Promise<void> => {
    await destroyLockRecord();
    setRecord(null);
    setLocked(false);
  }, []);

  /**
   * Give up the lock and the session together, session first.
   *
   * The old order unlocked before signing out, and `signOut` is not quick: it
   * awaits an image disk-cache clear, a push-token read, and three network
   * round trips. The ledger sat open and signed in for that whole window, so
   * "Forgot PIN" — and the fifteenth wrong PIN — showed the entries to whoever
   * was holding the phone.
   *
   * Worse offline, though not the way it first looks. `convexSignOut` catches
   * its own failure and the websocket client queues calls across a reconnect,
   * so offline the sign-out HANGS rather than throwing. Either way the old
   * order had already destroyed the lock record by then, leaving the account
   * signed in with no lock at all. Putting `signOut` first means a hang or a
   * failure leaves the lock exactly where it was.
   */
  const forgetInFlight = useRef<Promise<void> | null>(null);
  const forget = useCallback((): Promise<void> => {
    // A second caller JOINS the first attempt; it must not return early.
    //
    // `useSessionSignOut` guards itself with a ref that resolves a concurrent
    // call immediately as a no-op, so awaiting `signOut()` twice would let the
    // second `forget` clear the lock while the first was still running. An
    // early return closes that, but opens something worse: offline,
    // `convexSignOut` does not reject — its socket calls pend until reconnect,
    // so the first attempt HANGS. With an early return the fifteenth-wrong-PIN
    // tripwire then no-ops on every later guess, writing no lockout at all and
    // leaving the PIN open to unlimited attempts. Joining keeps both callers
    // bound to the one real attempt.
    forgetInFlight.current ??= (async (): Promise<void> => {
      try {
        await signOut();
        await clearLock();
      } finally {
        forgetInFlight.current = null;
      }
    })();

    return forgetInFlight.current;
  }, [clearLock, signOut]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (record?.pin === undefined || !/^\d{6}$/.test(pin)) return false;
      if (record.lockedUntil !== undefined && record.lockedUntil > Date.now())
        return false;
      const candidate = await derivePinVerifier(
        pin,
        fromBase64(record.pin.saltB64),
      );
      if (timingSafeEqual(candidate, fromBase64(record.pin.verifierB64))) {
        await unlockSuccess();
        return true;
      }
      const failedAttempts = record.failedAttempts + 1;
      if (failedAttempts >= 15) {
        // Persist the lockout BEFORE attempting the sign-out. `forget` can
        // hang — offline it does, since the socket calls pend until reconnect
        // — or reject, and without this the record stays at fourteen with an
        // expired `lockedUntil`, so the next guess recomputes fifteen and tries
        // again straight away. That is unlimited attempts at scrypt speed, or
        // one per restart while the socket is down. A sign-out that does land
        // destroys the record moments later, so writing it costs nothing.
        const trip = {
          ...record,
          failedAttempts,
          lockedUntil: Date.now() + 15 * 60 * 1000,
        };
        await writeLockRecord(trip);
        setRecord(trip);
        await forget();
        return false;
      }
      const lockedUntil =
        failedAttempts >= 10
          ? Date.now() + 15 * 60 * 1000
          : failedAttempts >= 5
            ? Date.now() + 60 * 1000
            : undefined;
      const next = {...record, failedAttempts, lockedUntil};
      await writeLockRecord(next);
      setRecord(next);
      return false;
    },
    [forget, record, unlockSuccess],
  );

  const disable = useCallback(async (): Promise<void> => {
    if (locked) throw new Error('Unlock before disabling');
    await clearLock();
  }, [clearLock, locked]);

  const value = useMemo<AppLockContext>(() => {
    // While SecureStore is still loading, honor the MMKV lock flag so cold start
    // can enter `stage === 'locked'` immediately instead of flashing the app shell.
    const lockPending = !ready && locked;
    return {
      autoLockAfterMs: record?.autoLockAfterMs ?? 60_000,
      biometricsEnabled: record?.biometricsEnabled ?? false,
      enabled: record !== null || lockPending,
      hasPin: record?.pin !== undefined,
      locked: record !== null ? locked : lockPending,
      ready,
      lockedUntil: record?.lockedUntil ?? null,
      configure,
      disable,
      forget,
      lockNow,
      unlockWithBiometrics,
      unlockWithPin,
    };
  },
    [
      configure,
      disable,
      forget,
      lockNow,
      locked,
      ready,
      record,
      unlockWithBiometrics,
      unlockWithPin,
    ],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {covered ? <View pointerEvents="none" style={styles.cover} /> : null}
    </Context.Provider>
  );
}

export const useAppLock = (): AppLockContext => useContext(Context);

export const lockEncoding = {fromBase64, toBase64} as const;

const styles = StyleSheet.create({
  cover: {...StyleSheet.absoluteFill, backgroundColor: '#111827', zIndex: 9999},
});
