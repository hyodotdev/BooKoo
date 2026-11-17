import * as SecureStore from 'expo-secure-store';

import {Storage, storage} from '~/utils/storage';

const LOCK_KEY = 'bookoo.applock.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface AppLockRecord {
  readonly version: 1;
  readonly lockOwnerUserId: string;
  readonly biometricsEnabled: boolean;
  readonly pin?: {
    readonly algo: 'scrypt';
    readonly n: number;
    readonly r: number;
    readonly p: number;
    readonly dkLen: number;
    readonly saltB64: string;
    readonly verifierB64: string;
    readonly digits: 6;
  };
  readonly autoLockAfterMs: number;
  readonly failedAttempts: number;
  readonly lockedUntil?: number;
}

const isRecord = (value: unknown): value is AppLockRecord =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  value.version === 1 &&
  'lockOwnerUserId' in value &&
  typeof value.lockOwnerUserId === 'string' &&
  'biometricsEnabled' in value &&
  typeof value.biometricsEnabled === 'boolean' &&
  'autoLockAfterMs' in value &&
  typeof value.autoLockAfterMs === 'number' &&
  'failedAttempts' in value &&
  typeof value.failedAttempts === 'number';

export async function readLockRecord(): Promise<AppLockRecord | null> {
  const encoded = await SecureStore.getItemAsync(LOCK_KEY, secureOptions);
  if (encoded === null) return null;
  try {
    const parsed: unknown = JSON.parse(encoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLockRecord(record: AppLockRecord): Promise<void> {
  await SecureStore.setItemAsync(LOCK_KEY, JSON.stringify(record), secureOptions);
  storage.set(Storage.LockEnabled, true);
}

export async function destroyLockRecord(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCK_KEY, secureOptions);
  storage.set(Storage.LockEnabled, false);
  storage.delete(Storage.LockLastActiveAt);
}

export const lockStoreConstants = {lockKey: LOCK_KEY} as const;
