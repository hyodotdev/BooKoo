import {useEffect, useState} from 'react';
import * as Patch from '@codemagic/react-native-patch';

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
  timedOut: () => boolean,
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
  // Past the budget the splash is gone and the user may be mid-entry, so the
  // staged update waits for the next cold start instead of restarting now.
  if (timedOut()) return 'TIMEOUT';
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
  let expired = false;
  const outcome = await Promise.race([
    runSequence(deps, () => expired),
    timeout(budget).then((value) => {
      expired = true;
      return value;
    }),
  ]);
  return outcome;
}

export const coldStartUpdateHoldsSplash = (
  outcome: ColdStartUpdateOutcome | null,
): boolean => outcome === null || outcome === 'APPLIED';

/**
 * Over-the-air updates come from Codemagic Patch. Development builds load their
 * bundle from Metro, so Patch has nothing to replace there.
 */
export const otaUpdatesEnabled = !__DEV__;

/**
 * Patch dependencies for one cold start. The check result is kept between the
 * calls so `fetchUpdate` stages exactly the package `checkForUpdate` found.
 * An `embedded-revert` answer means the server withdrew every update for this
 * binary; staging it returns the app to the bundle that shipped in the store
 * build.
 */
export function patchColdStartDeps(): ColdStartUpdateDeps {
  let found: Patch.UpdateCheckResult | null = null;
  return {
    isEnabled: otaUpdatesEnabled,
    checkForUpdate: async () => {
      found = await Patch.checkForUpdate();
      return {isAvailable: found.action !== 'up-to-date'};
    },
    fetchUpdate: async () => {
      if (found === null || found.action === 'up-to-date') return;
      const target =
        found.action === 'ota-update'
          ? await Patch.downloadUpdate(found.remotePackage)
          : found;
      await Patch.installUpdate(target, {
        installMode: Patch.InstallMode.ON_NEXT_RESTART,
      });
    },
    reload: () => Patch.restartApp(),
  };
}

/**
 * True while the native splash must stay up. Cold start is the only moment an
 * OTA may reload without asking: nothing is on screen to interrupt. Updates
 * discovered later belong to `SoftUpdateSheet`, which asks first because the
 * user may be mid-entry.
 */
export function useColdStartUpdate(): boolean {
  const [outcome, setOutcome] = useState<ColdStartUpdateOutcome | null>(null);

  useEffect(() => {
    let active = true;
    // `SoftUpdateSheet` can mount while the splash is still up and checks on
    // mount too. Recording the attempt before it starts lets that sheet's 24h
    // throttle skip a second, concurrent download of the same package.
    if (otaUpdatesEnabled) storage.set(Storage.LastOtaCheckAt, Date.now());
    void applyColdStartUpdate(patchColdStartDeps())
      .then((value) => {
        if (active) setOutcome(value);
      })
      .catch(() => {
        if (active) setOutcome('FAILED');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Patch rolls a freshly installed update back on the next launch unless the
    // running bundle reports itself healthy. Reaching the first paint is that
    // proof; a reload already under way belongs to the next bundle instead.
    if (!otaUpdatesEnabled || outcome === null || outcome === 'APPLIED')
      return;
    void Patch.notifyAppReady().catch(() => undefined);
  }, [outcome]);

  return coldStartUpdateHoldsSplash(outcome);
}
