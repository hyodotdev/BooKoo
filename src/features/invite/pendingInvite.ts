import * as SecureStore from 'expo-secure-store';

import {normalizeInviteCode} from '@shared/inviteCode';

const KEY = 'bookoo.pending-invite.v1';
const JOINED_KEY = 'bookoo.joined-invite-continuation.v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface JoinedInviteContinuation {
  readonly code: string;
  readonly ledgerId: string | null;
  readonly pendingCode: string;
}

type StoredJoinedInvite = JoinedInviteContinuation & {
  readonly userId: string;
  readonly savedAt: number;
};

let joinedInviteInMemory: StoredJoinedInvite | null = null;

export async function savePendingInvite(code: string): Promise<void> {
  const normalized = normalizeInviteCode(code);
  if (normalized === null) return;
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({code: normalized, savedAt: Date.now()}),
    options,
  );
}

export async function readPendingInvite(): Promise<string | null> {
  const encoded = await SecureStore.getItemAsync(KEY, options);
  if (encoded === null) return null;
  try {
    const value: unknown = JSON.parse(encoded);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('code' in value) ||
      typeof value.code !== 'string' ||
      !('savedAt' in value) ||
      typeof value.savedAt !== 'number' ||
      Date.now() - value.savedAt > TTL_MS
    ) {
      await clearPendingInvite();
      return null;
    }
    const normalized = normalizeInviteCode(value.code);
    if (normalized === null) {
      await clearPendingInvite();
      return null;
    }
    return normalized;
  } catch {
    await clearPendingInvite();
    return null;
  }
}

export async function clearPendingInvite(expectedCode?: string): Promise<void> {
  if (expectedCode !== undefined) {
    const normalized = normalizeInviteCode(expectedCode);
    if (normalized === null) return;
    const pending = await readPendingInvite();
    if (pending !== normalized) return;
  }
  await SecureStore.deleteItemAsync(KEY, options);
}

export async function saveJoinedInviteContinuation(
  code: string,
  userId: string,
  ledgerId: string,
): Promise<void> {
  const normalized = normalizeInviteCode(code);
  if (normalized === null || userId.length === 0) return;
  // Signup can start from a different link than the one just accepted.
  // Keep the exact saved code that this join supersedes, even across restarts.
  const pendingCode =
    (await readPendingInvite().catch(() => null)) ?? normalized;
  const joined = {
    code: normalized,
    userId,
    ledgerId,
    pendingCode,
    savedAt: Date.now(),
  };
  joinedInviteInMemory = joined;
  // Membership is already committed. Keep the destination across the
  // onboarding remount even if the device cannot persist it for a cold start.
  await SecureStore.setItemAsync(
    JOINED_KEY,
    JSON.stringify(joined),
    options,
  ).catch(() => undefined);
}

export async function readJoinedInviteContinuation(
  userId: string,
): Promise<JoinedInviteContinuation | null> {
  if (joinedInviteInMemory !== null) {
    const joined = joinedInviteInMemory;
    if (Date.now() - joined.savedAt > TTL_MS) {
      joinedInviteInMemory = null;
    } else {
      return joined.userId === userId
        ? {
            code: joined.code,
            ledgerId: joined.ledgerId,
            pendingCode: joined.pendingCode,
          }
        : null;
    }
  }
  const encoded = await SecureStore.getItemAsync(JOINED_KEY, options);
  if (encoded === null) return null;
  try {
    const value: unknown = JSON.parse(encoded);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('code' in value) ||
      typeof value.code !== 'string' ||
      !('userId' in value) ||
      typeof value.userId !== 'string' ||
      !('savedAt' in value) ||
      typeof value.savedAt !== 'number' ||
      Date.now() - value.savedAt > TTL_MS
    ) {
      await clearJoinedInviteContinuation();
      return null;
    }
    const normalized = normalizeInviteCode(value.code);
    if (normalized === null) {
      await clearJoinedInviteContinuation();
      return null;
    }
    if (value.userId !== userId) return null;
    // The previous app version persisted only the code for cleanup.
    const ledgerId =
      'ledgerId' in value &&
      typeof value.ledgerId === 'string' &&
      value.ledgerId.length > 0
        ? value.ledgerId
        : null;
    const pendingCode =
      'pendingCode' in value && typeof value.pendingCode === 'string'
        ? normalizeInviteCode(value.pendingCode)
        : null;
    return {code: normalized, ledgerId, pendingCode: pendingCode ?? normalized};
  } catch {
    await clearJoinedInviteContinuation();
    return null;
  }
}

export async function clearJoinedInviteContinuation(): Promise<void> {
  joinedInviteInMemory = null;
  await SecureStore.deleteItemAsync(JOINED_KEY, options);
}

export const pendingInviteConstants = {
  joinedKey: JOINED_KEY,
  key: KEY,
  ttlMs: TTL_MS,
} as const;
