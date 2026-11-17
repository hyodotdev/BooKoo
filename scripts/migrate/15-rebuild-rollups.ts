import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {makeFunctionReference} from 'convex/server';

import {
  LOCAL_ROOT,
  callMigration,
  migrationClient,
  migrationRunId,
  writeEnabled,
} from './lib/convexClient';
import {readJsonl} from './lib/jsonl';

type Row = Record<string, unknown>;
type Progress = {queued: number; running: number; done: number; failed: number};

const itemRows = await readJsonl<Row>(
  join(LOCAL_ROOT, 'convex', 'items.jsonl'),
);
const requestedLedger = (() => {
  const index = process.argv.indexOf('--ledger');
  return index < 0 ? undefined : process.argv[index + 1];
})();
const ledgerKeys = [
  ...new Set(
    itemRows
      .map((row) => String(row.legacyLedgerKey ?? ''))
      .filter(
        (key) =>
          key !== '' &&
          (requestedLedger === undefined || key === requestedLedger),
      ),
  ),
].sort();
const report = {eligibleLedgers: ledgerKeys.length, itemRows: itemRows.length};
mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
writeFileSync(
  join(LOCAL_ROOT, 'reports', 'dry-run-rollups.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  {mode: 0o600},
);
if (!writeEnabled()) {
  process.stdout.write(
    `dry-run rollups: ${ledgerKeys.length} ledgers eligible\n`,
  );
  process.exit(0);
}

const client = migrationClient();
const runId = migrationRunId();
const start = makeFunctionReference<
  'mutation',
  {secret: string; runId: string; legacyLedgerKeys: string[]},
  {queued: number; skipped: number}
>('migrate/rollups:startRollupRebuild');
const progressRef = makeFunctionReference<
  'mutation',
  {secret: string; runId: string; state?: string},
  Progress
>('migrate/rollups:rollupProgress');
for (let index = 0; index < ledgerKeys.length; index += 200) {
  await callMigration(client, start, {
    runId,
    legacyLedgerKeys: ledgerKeys.slice(index, index + 200),
  });
}
let progress: Progress;
do {
  progress = await callMigration(client, progressRef, {runId});
  if (progress.failed > 0) throw new Error('rollup rebuild job failed');
  if (progress.queued + progress.running > 0)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
} while (progress.queued + progress.running > 0);
if (progress.done !== ledgerKeys.length)
  throw new Error('rollup rebuild completion count mismatch');
process.stdout.write(`rollup rebuild completed for ${progress.done} ledgers\n`);
