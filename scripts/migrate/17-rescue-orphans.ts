import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {makeFunctionReference} from 'convex/server';

import {
  LOCAL_ROOT,
  callMigration,
  migrationClient,
  writeEnabled,
} from './lib/convexClient';
import {readJsonl} from './lib/jsonl';

type PlanRow = {
  legacyLedgerKey: string;
  action: 'TRANSFER' | 'ARCHIVE';
  successorLegacyUid?: string;
};

if (writeEnabled() && !process.argv.includes('--confirm-rescue'))
  throw new Error('--apply requires --confirm-rescue');
const users = await readJsonl<Record<string, unknown>>(
  join(LOCAL_ROOT, 'convex', 'legacyUsers.jsonl'),
);
const orphanUids = users
  .filter((user) => user.claimState === 'orphan_no_email')
  .map((user) => String(user.legacyUid))
  .sort();

if (
  process.argv.includes('--offline') ||
  !process.env.CONVEX_URL ||
  !process.env.MIGRATION_SECRET
) {
  if (writeEnabled())
    throw new Error('Convex migration credentials are required');
  const authTriagePath = join(LOCAL_ROOT, 'reports', 'auth-triage.json');
  if (existsSync(authTriagePath)) {
    const triage = JSON.parse(readFileSync(authTriagePath, 'utf8')) as {
      facebookOnly?: number;
    };
    if ((triage.facebookOnly ?? 0) !== orphanUids.length)
      throw new Error('orphan owner census differs from Auth triage');
  }
  process.stdout.write(
    `offline rescue dry-run: ${orphanUids.length} unrecoverable owners require deployment planning\n`,
  );
  process.exit(0);
}

const client = migrationClient();
const planRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyUids: string[]},
  PlanRow[]
>('migrate/rescue:planOrphanLedgers');
const rescueRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyLedgerKeys: string[]; importedAt: number},
  {transferred: number; archived: number; skipped: number}
>('migrate/rescue:rescueOrphanLedgers');
const plan: PlanRow[] = [];
for (let index = 0; index < orphanUids.length; index += 50)
  plan.push(
    ...(await callMigration(client, planRef, {
      legacyUids: orphanUids.slice(index, index + 50),
    })),
  );
mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
writeFileSync(
  join(LOCAL_ROOT, 'reports', 'orphan-rescue-plan.json'),
  `${JSON.stringify(plan, null, 2)}\n`,
  {mode: 0o600},
);
if (!writeEnabled()) {
  const transfers = plan.filter((row) => row.action === 'TRANSFER').length;
  process.stdout.write(
    `rescue dry-run: ${transfers} transfers and ${plan.length - transfers} archives planned\n`,
  );
  process.exit(0);
}
const manifest = JSON.parse(
  readFileSync(join(LOCAL_ROOT, 'MANIFEST.json'), 'utf8'),
) as {frozenAt?: string};
const importedAt = Date.parse(String(manifest.frozenAt ?? ''));
if (!Number.isFinite(importedAt))
  throw new Error('migration manifest is invalid');
const totals = {transferred: 0, archived: 0, skipped: 0};
const keys = plan.map((row) => row.legacyLedgerKey);
for (let index = 0; index < keys.length; index += 50) {
  const result = await callMigration(client, rescueRef, {
    legacyLedgerKeys: keys.slice(index, index + 50),
    importedAt,
  });
  totals.transferred += result.transferred;
  totals.archived += result.archived;
  totals.skipped += result.skipped;
}
process.stdout.write(
  `rescue applied: ${totals.transferred} transferred, ${totals.archived} archived\n`,
);
