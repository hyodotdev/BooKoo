import type {ReactElement} from 'react';
import {useEffect} from 'react';
import * as SecureStore from 'expo-secure-store';
import {MMKV} from 'react-native-mmkv';

import {storage} from '~/utils/storage';

const LEGACY_SENSITIVE_KEY = 'bookoo.sensitive-key.v1';
const LEGACY_SENSITIVE_ID = 'bookoo.sensitive.v1';
const LEGACY_ACCOUNT_SCOPE = 'sensitive-account-scope';
const LEGACY_PROVISION_MARKER = 'sensitive-store-provisioned';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface LegacyCleanupDependencies {
  readonly clearEncryptedStore: (encryptionKey: string) => void;
  readonly deleteKey: () => Promise<void>;
  readonly deleteMarker: (key: string) => void;
  readonly readKey: () => Promise<string | null>;
}

const productionDependencies: LegacyCleanupDependencies = {
  clearEncryptedStore: (encryptionKey) => {
    new MMKV({id: LEGACY_SENSITIVE_ID, encryptionKey}).clearAll();
  },
  deleteKey: () =>
    SecureStore.deleteItemAsync(LEGACY_SENSITIVE_KEY, secureOptions),
  deleteMarker: (key) => storage.delete(key),
  readKey: () => SecureStore.getItemAsync(LEGACY_SENSITIVE_KEY, secureOptions),
};

/**
 * Best-effort cleanup for the retired encrypted query mirror and write queue.
 * It never gates rendering and never reaches the server. If an old key or
 * store is already unreadable, the orphan remains encrypted and inert while
 * its provisioning markers are removed.
 */
export async function cleanupLegacySensitiveStorage(
  dependencies: LegacyCleanupDependencies = productionDependencies,
): Promise<void> {
  let encryptionKey: string | null = null;
  try {
    encryptionKey = await dependencies.readKey();
  } catch {
    // Cleanup is deliberately non-blocking for migrated installations.
  }
  if (encryptionKey !== null) {
    try {
      dependencies.clearEncryptedStore(encryptionKey);
    } catch {
      // Losing the local key leaves any unreadable file encrypted and inert.
    }
  }
  try {
    await dependencies.deleteKey();
  } catch {
    // A later launch can retry without interrupting the user.
  }
  for (const key of [LEGACY_ACCOUNT_SCOPE, LEGACY_PROVISION_MARKER]) {
    try {
      dependencies.deleteMarker(key);
    } catch {
      // MMKV marker cleanup is also best effort and contains no server data.
    }
  }
}

export function LegacySensitiveStorageCleanup(): ReactElement | null {
  useEffect(() => {
    void cleanupLegacySensitiveStorage();
  }, []);
  return null;
}

export const legacySensitiveStorageConstants = {
  accountScope: LEGACY_ACCOUNT_SCOPE,
  provisionMarker: LEGACY_PROVISION_MARKER,
  secureKey: LEGACY_SENSITIVE_KEY,
  storageId: LEGACY_SENSITIVE_ID,
} as const;
