import {useEffect, useRef, useState} from 'react';
import * as Updates from 'expo-updates';

import {diagnostic} from '~/features/diagnostics/ring';
import {Storage, storage} from '~/utils/storage';

/**
 * The whole check-fetch-reload sequence is bounded by this budget. A cold start
 * on a flaky network must never hold the native splash open indefinitely: the
 * recovery screens live *below* the splash boundary, so a hung check would hide
 * the very UI that explains the problem.
 */
export const COLD_START_UPDATE_TIMEOUT_MS = 4000;

export type ColdStartUpdateOutcome =
  | 'DISABLED'
  | 'NONE'
  | 'APPLIED'
  | 'TIMEOUT'
  | 'FAILED';

export interface ColdStartUpdateDeps {
  readonly isEnabled: boolean;
  readonly checkForUpdate: () => Promise<{isAvailable: boolean}>;
  readonly fetchUpdate: () => Promise<unknown>;
  readonly reload: () => Promise<void>;
  readonly timeoutMs?: number;
}

const timeout = async (ms: number): Promise<'TIMEOUT'> =>
  new Promise((resolve) => {
    setTimeout(() => resolve('TIMEOUT'), ms);
  });

async function runSequence(
  deps: ColdStartUpdateDeps,
): Promise<ColdStartUpdateOutcome> {
  let result: {isAvailable: boolean};
  try {
    result = await deps.checkForUpdate();
  } catch {
    diagnostic({kind: 'UPDATE', outcome: 'CHECK_FAILED'});
    return 'FAILED';
  }
  if (!result.isAvailable) return 'NONE';
  try {
    await deps.fetchUpdate();
  } catch {
    diagnostic({kind: 'UPDATE', outcome: 'DOWNLOAD_FAILED'});
    return 'FAILED';
  }
  // `reload` restarts the app, so this promise normally never settles. The
  // caller keeps holding the splash until the process is replaced.
  await deps.reload();
  return 'APPLIED';
}

/**
 * Resolve an available update before the first paint. Returns the outcome so
 * the caller can decide whether to release the splash; `APPLIED` means a reload
 * is under way and the splash must stay up.
 */
export async function applyColdStartUpdate(
  deps: ColdStartUpdateDeps,
): Promise<ColdStartUpdateOutcome> {
  if (!deps.isEnabled) return 'DISABLED';
  const budget = deps.timeoutMs ?? COLD_START_UPDATE_TIMEOUT_MS;
  const outcome = await Promise.race([runSequence(deps), timeout(budget)]);
  return outcome;
}

export const coldStartUpdateHoldsSplash = (
  outcome: ColdStartUpdateOutcome | null,
): boolean => outcome === null || outcome === 'APPLIED';

/**
 * expo-updates checks and downloads on load by default, so the runtime can
 * stage an update on its own — and when it wins that race our explicit
 * `checkForUpdate` reports nothing available while the OLD bundle keeps
 * running. Martie covers this with an unconditional `isUpdatePending` reload.
 * BooKoo reloads only while the splash is still up: after first paint the user
 * may be mid-entry, and `SoftUpdateSheet` asks before taking their input away.
 */
export const shouldReloadForPendingUpdate = (
  isUpdatePending: boolean,
  outcome: ColdStartUpdateOutcome | null,
  elapsedSinceMountMs: number,
  budgetMs: number = COLD_START_UPDATE_TIMEOUT_MS,
): boolean => {
  if (!isUpdatePending) return false;
  // A reload is already replacing the process.
  if (outcome === 'APPLIED') return false;
  // Still holding the splash, or close enough to launch that nothing the user
  // typed can be lost. `NONE` belongs here: the explicit check reports nothing
  // available precisely because the runtime already staged the newer bundle.
  return (
    coldStartUpdateHoldsSplash(outcome) || elapsedSinceMountMs < budgetMs
  );
};

/**
 * True while the native splash must stay up. Cold start is the only moment an
 * OTA may reload without asking: nothing is on screen to interrupt. Updates
 * discovered later belong to `SoftUpdateSheet`, which asks first because the
 * user may be mid-entry.
 */
export function useColdStartUpdate(): boolean {
  const {isUpdatePending} = Updates.useUpdates();
  const [outcome, setOutcome] = useState<ColdStartUpdateOutcome | null>(null);
  // Mirrors `outcome` without re-running the effects that read it.
  const outcomeRef = useRef<ColdStartUpdateOutcome | null>(null);
  const mountedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    mountedAtRef.current = Date.now();
    const settle = (value: ColdStartUpdateOutcome): void => {
      outcomeRef.current = value;
      setOutcome(value);
    };
    void applyColdStartUpdate({
      isEnabled: Updates.isEnabled,
      checkForUpdate: () => Updates.checkForUpdateAsync(),
      fetchUpdate: () => Updates.fetchUpdateAsync(),
      reload: () => Updates.reloadAsync(),
    })
      .then((value) => {
        // `SoftUpdateSheet` checks on mount too. Recording the attempt lets its
        // 24h throttle swallow the duplicate request right after a cold start.
        if (value !== 'DISABLED')
          storage.set(Storage.LastOtaCheckAt, Date.now());
        if (active) settle(value);
      })
      .catch(() => {
        if (active) settle('FAILED');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const settle = (value: ColdStartUpdateOutcome): void => {
      outcomeRef.current = value;
      setOutcome(value);
    };
    if (
      !shouldReloadForPendingUpdate(
        isUpdatePending,
        outcomeRef.current,
        Date.now() - (mountedAtRef.current ?? Date.now()),
      )
    )
      return;
    settle('APPLIED');
    void Updates.reloadAsync().catch(() => settle('FAILED'));
  }, [isUpdatePending]);

  return coldStartUpdateHoldsSplash(outcome);
}
