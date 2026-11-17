import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {makeFunctionReference} from 'convex/server';

import {LOCAL_ROOT, callMigration, migrationClient} from './lib/convexClient';
import {canonical, sha256} from './lib/hash';
import {readJsonl} from './lib/jsonl';
import {scaleOf} from './lib/money';
import {objectOf} from './lib/rtdb';

type Row = Record<string, unknown>;
type KeyRow = {key: string; checksum?: string; verified?: boolean};
type PageResult = {rows: KeyRow[]; cursor: string; done: boolean};
type TableName =
  | 'legacyUsers'
  | 'userProfiles'
  | 'ledgers'
  | 'ledgerMembers'
  | 'ledgerMemberState'
  | 'ledgerJoinRequests'
  | 'legacyInvites'
  | 'ledgerInvites'
  | 'ledgerCategories'
  | 'ledgerItems'
  | 'itemComments'
  | 'itemPhotos'
  | 'feedback'
  | 'migrationAnomalies'
  | 'ledgerMonthRollups';

type LedgerSums = {
  legacyLedgerKey: string;
  itemCount: number;
  directionalMinor: number;
  magnitudeMinor: number;
  residualMinor: number;
  lossyCount: number;
  legacyValueMissing: number;
};

type AnomalySummary = {
  kind: string;
  unresolved: number;
  unapproved: number;
  total: number;
};

const baseline = JSON.parse(
  readFileSync(join(LOCAL_ROOT, 'reports', 'BASELINE.json'), 'utf8'),
) as {runId?: string; counts?: Record<string, number>};
const checksums = JSON.parse(
  readFileSync(join(LOCAL_ROOT, 'reports', 'checksums.json'), 'utf8'),
) as Record<string, string>;
const failures: string[] = [];

for (const [relative, expected] of Object.entries(checksums)) {
  const path = join(LOCAL_ROOT, relative);
  if (!existsSync(path) || sha256(readFileSync(path)) !== expected)
    failures.push(`normalized checksum changed: ${relative}`);
}

const validation = JSON.parse(
  readFileSync(join(LOCAL_ROOT, 'reports', 'validation.json'), 'utf8'),
) as {valid?: boolean};
if (validation.valid !== true) failures.push('offline validation is not green');

const offline = process.argv.includes('--offline') || !process.env.CONVEX_URL;
if (offline) {
  if (failures.length > 0) throw new Error(failures.join('; '));
  process.stdout.write('offline verification gate passed\n');
  process.exit(0);
}

const sourceFiles = {
  legacyUsers: 'convex/legacyUsers.jsonl',
  placeholders: 'convex/placeholders.jsonl',
  ledgers: 'convex/ledgers.jsonl',
  ledgerMembers: 'convex/ledgerMembers.jsonl',
  joinRequests: 'convex/joinRequests.jsonl',
  legacyInvites: 'convex/legacyInvites.jsonl',
  invites: 'convex/invites.jsonl',
  categories: 'convex/categories.jsonl',
  items: 'convex/items.jsonl',
  comments: 'convex/comments.jsonl',
  photos: 'convex/photos.jsonl',
  feedback: 'normalized/feedback.jsonl',
  anomalies: 'reports/anomalies.jsonl',
} as const;
type SourceName = keyof typeof sourceFiles;
const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(sourceFiles).map(async ([name, relative]) => [
      name,
      await readJsonl<Row>(join(LOCAL_ROOT, relative)),
    ]),
  ),
) as Record<SourceName, Row[]>;

const sourceKey = (name: SourceName, row: Row): string => {
  const document = objectOf(row.document);
  if (name === 'legacyUsers' || name === 'placeholders')
    return String(row.legacyUid ?? 'missing-user');
  if (name === 'categories')
    return `${String(row.legacyLedgerKey ?? 'missing-ledger')}/${String(row.key ?? 'missing-key')}`;
  if (name === 'legacyInvites')
    return `${String(document.rawParentKey ?? '')}/${String(document.rawChildKey ?? '')}`;
  if (name === 'anomalies')
    return `${String(document.kind ?? 'UNKNOWN')}:${String(document.legacyKey ?? '')}`;
  return String(row.legacyKey ?? 'missing-key');
};
const keySetChecksum = (keys: readonly string[]): string =>
  sha256(canonical([...keys].sort()));

const client = migrationClient();
const pageRef = makeFunctionReference<
  'mutation',
  {secret: string; table: TableName; cursor: string | null},
  PageResult
>('migrate/verify:pageTable');
const spotRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyKey: string},
  Record<string, unknown> | null
>('migrate/verify:spotItem');
const rollupRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyLedgerKey: string; monthKey: number},
  {matches: boolean}
>('migrate/verify:rollupSpot');
const blobRef = makeFunctionReference<
  'mutation',
  {secret: string},
  {photos: Record<string, number>; avatars: Record<string, number>}
>('migrate/verify:blobProgress');
const sumsRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyLedgerKeys: string[]},
  LedgerSums[]
>('migrate/verify:ledgerSums');
const anomalyRef = makeFunctionReference<
  'mutation',
  {secret: string; kinds: string[]},
  AnomalySummary[]
>('migrate/verify:anomalySummary');

const pageTable = async (table: TableName): Promise<KeyRow[]> => {
  const rows: KeyRow[] = [];
  let cursor: string | null = null;
  do {
    const page: PageResult = await callMigration(client, pageRef, {
      table,
      cursor,
    });
    rows.push(...page.rows);
    cursor = page.done ? null : page.cursor;
    if (page.done) break;
  } while (cursor !== null);
  return rows;
};

const mapping: readonly (readonly [TableName, SourceName])[] = [
  ['legacyUsers', 'legacyUsers'],
  ['userProfiles', 'placeholders'],
  ['ledgers', 'ledgers'],
  ['ledgerMembers', 'ledgerMembers'],
  ['ledgerMemberState', 'ledgerMembers'],
  ['ledgerJoinRequests', 'joinRequests'],
  ['legacyInvites', 'legacyInvites'],
  ['ledgerInvites', 'invites'],
  ['ledgerCategories', 'categories'],
  ['ledgerItems', 'items'],
  ['itemComments', 'comments'],
  ['itemPhotos', 'photos'],
  ['feedback', 'feedback'],
  ['migrationAnomalies', 'anomalies'],
];
const deployedCounts: Record<string, number> = {};
const deployedKeys: Partial<Record<TableName, KeyRow[]>> = {};
let missingPlaceholderLinks = 0;
let invalidCurrencyEvidenceRows = 0;
let producedNothing = 0;
for (const [table, sourceName] of mapping) {
  const rows = await pageTable(table);
  deployedKeys[table] = rows;
  deployedCounts[table] = rows.length;
  const expected = baseline.counts?.[sourceName];
  if (expected !== undefined && rows.length !== expected)
    failures.push(`${table} count mismatch`);
  const expectedKeys = sources[sourceName].map((row) =>
    sourceKey(sourceName, row),
  );
  if (
    keySetChecksum(rows.map((row) => row.key)) !== keySetChecksum(expectedKeys)
  )
    failures.push(`${table} legacy key set mismatch`);
  if (table === 'legacyUsers')
    missingPlaceholderLinks += rows.reduce(
      (count, row) => count + (row.checksum === 'linked' ? 0 : 1),
      0,
    );
  if (table === 'ledgerItems')
    invalidCurrencyEvidenceRows += rows.reduce(
      (count, row) => count + (row.verified === false ? 1 : 0),
      0,
    );
  if (table === 'migrationAnomalies')
    producedNothing += rows.reduce(
      (count, row) => count + (row.checksum === 'not-produced' ? 1 : 0),
      0,
    );
}
if (missingPlaceholderLinks > 0)
  failures.push('legacy placeholder links are incomplete');
if (invalidCurrencyEvidenceRows > 0)
  failures.push('currency-evidence review flags are incomplete');
const expectedProducedNothing = sources.anomalies.reduce(
  (count, row) =>
    count + (objectOf(row.document).producedRow === false ? 1 : 0),
  0,
);
if (producedNothing !== expectedProducedNothing)
  failures.push('produced-nothing anomaly count mismatch');

const itemTargetRows = deployedKeys.ledgerItems ?? [];
const itemChecksums = new Map(
  itemTargetRows.map((row) => [row.key, row.checksum ?? '']),
);
const items = sources.items;
for (const row of items) {
  const key = String(row.legacyKey);
  const checksum = String(objectOf(row.document).legacyChecksum ?? '');
  if (itemChecksums.get(key) !== checksum)
    failures.push('item checksum set mismatch');
}

const monthRollups = await pageTable('ledgerMonthRollups');
deployedCounts.ledgerMonthRollups = monthRollups.length;
const targetRollupLedgers = new Set(monthRollups.map((row) => row.key)).size;
const sourceRollupLedgers = new Set(
  items.map((row) => String(row.legacyLedgerKey)),
).size;
if (targetRollupLedgers !== sourceRollupLedgers)
  failures.push('rollup ledger coverage mismatch');

const financialSource = new Map<string, LedgerSums>();
for (const row of items) {
  const legacyLedgerKey = String(row.legacyLedgerKey);
  const document = objectOf(row.document);
  const amountMinor = Number(document.amountMinor);
  const signedMinor = document.type === 'EXPENSE' ? -amountMinor : amountMinor;
  const realAmount = Number(document.legacyRealAmount);
  const residual =
    realAmount * scaleOf(String(document.baseCurrency)) - signedMinor;
  const totals = financialSource.get(legacyLedgerKey) ?? {
    legacyLedgerKey,
    itemCount: 0,
    directionalMinor: 0,
    magnitudeMinor: 0,
    residualMinor: 0,
    lossyCount: 0,
    legacyValueMissing: 0,
  };
  totals.itemCount += 1;
  totals.directionalMinor += signedMinor;
  totals.magnitudeMinor += amountMinor;
  totals.residualMinor += residual;
  if (Math.abs(residual) > 1e-9) totals.lossyCount += 1;
  if (!Number.isFinite(realAmount)) totals.legacyValueMissing += 1;
  financialSource.set(legacyLedgerKey, totals);
}
const financialTarget = new Map<string, LedgerSums>();
const financialKeys = [...financialSource.keys()].sort();
for (let index = 0; index < financialKeys.length; index += 25) {
  const sums = await callMigration(client, sumsRef, {
    legacyLedgerKeys: financialKeys.slice(index, index + 25),
  });
  for (const row of sums) financialTarget.set(row.legacyLedgerKey, row);
}
for (const [legacyLedgerKey, source] of financialSource) {
  const target = financialTarget.get(legacyLedgerKey);
  if (
    target === undefined ||
    target.itemCount !== source.itemCount ||
    target.directionalMinor !== source.directionalMinor ||
    target.magnitudeMinor !== source.magnitudeMinor ||
    target.lossyCount !== source.lossyCount ||
    target.legacyValueMissing !== 0 ||
    Math.abs(target.residualMinor - source.residualMinor) > 1e-6
  )
    failures.push('financial invariant mismatch');
  if (
    source.legacyValueMissing > 0 ||
    (source.lossyCount === 0
      ? Math.abs(source.residualMinor) > 1e-9
      : Math.abs(source.residualMinor) >= source.lossyCount)
  )
    failures.push('financial rounding residual exceeds bound');
}
writeFileSync(
  join(LOCAL_ROOT, 'reports', 'financial.json'),
  `${JSON.stringify(
    Object.fromEntries(
      financialKeys.map((key) => [
        key,
        {source: financialSource.get(key), target: financialTarget.get(key)},
      ]),
    ),
    null,
    2,
  )}\n`,
  {mode: 0o600},
);

const anomalyKinds = [
  ...new Set(
    sources.anomalies.map((row) => String(objectOf(row.document).kind)),
  ),
].sort();
const anomalySummaries: AnomalySummary[] = [];
for (let index = 0; index < anomalyKinds.length; index += 30)
  anomalySummaries.push(
    ...(await callMigration(client, anomalyRef, {
      kinds: anomalyKinds.slice(index, index + 30),
    })),
  );
for (const summary of anomalySummaries) {
  if (summary.unresolved > 0 || summary.unapproved > 0)
    failures.push(`anomaly gate is not approved: ${summary.kind}`);
}

const commentsByItem = new Map<string, number>();
for (const row of sources.comments) {
  const key = String(row.legacyItemKey);
  commentsByItem.set(key, (commentsByItem.get(key) ?? 0) + 1);
}
const photosByItem = new Map<string, number>();
for (const row of sources.photos) {
  const key = String(row.legacyItemKey);
  photosByItem.set(key, (photosByItem.get(key) ?? 0) + 1);
}
const spotCountIndex = process.argv.indexOf('--spot');
const spotCount =
  spotCountIndex < 0 ? 25 : Number(process.argv[spotCountIndex + 1] ?? 25);
if (!Number.isSafeInteger(spotCount) || spotCount < 0 || spotCount > 100)
  throw new Error('--spot must be an integer between 0 and 100');
const selected = [...items]
  .sort((left, right) =>
    sha256(`${baseline.runId}:${String(left.legacyKey)}`).localeCompare(
      sha256(`${baseline.runId}:${String(right.legacyKey)}`),
    ),
  )
  .slice(0, spotCount);
for (const source of selected) {
  const legacyKey = String(source.legacyKey);
  const target = await callMigration(client, spotRef, {legacyKey});
  if (target === null) {
    failures.push('spot item missing');
    continue;
  }
  const document = objectOf(source.document);
  const expected: Record<string, unknown> = {
    ...document,
    photoCount: photosByItem.get(legacyKey) ?? 0,
    commentCount: commentsByItem.get(legacyKey) ?? 0,
  };
  for (const field of [
    'type',
    'amountMinor',
    'baseAmountMinor',
    'currency',
    'baseCurrency',
    'occurredAt',
    'dayKey',
    'monthKey',
    'occurredOffsetMinutes',
    'categoryKey',
    'memo',
    'photoCount',
    'commentCount',
    'legacyChecksum',
  ]) {
    if (canonical(target[field]) !== canonical(expected[field]))
      failures.push(`spot item field mismatch: ${field}`);
  }
}

const rollupPairs = [
  ...new Set(
    items.map((row) => {
      const document = objectOf(row.document);
      return `${String(row.legacyLedgerKey)}|${String(document.monthKey)}`;
    }),
  ),
]
  .sort((left, right) =>
    sha256(`${baseline.runId}:${left}`).localeCompare(
      sha256(`${baseline.runId}:${right}`),
    ),
  )
  .slice(0, 5);
for (const pair of rollupPairs) {
  const separator = pair.lastIndexOf('|');
  const result = await callMigration(client, rollupRef, {
    legacyLedgerKey: pair.slice(0, separator),
    monthKey: Number(pair.slice(separator + 1)),
  });
  if (!result.matches) failures.push('rollup spot mismatch');
}

const blobProgress = await callMigration(client, blobRef, {});
if (process.argv.includes('--blobs')) {
  const pending =
    (blobProgress.photos.PENDING ?? 0) +
    (blobProgress.photos.FAILED ?? 0) +
    (blobProgress.avatars.PENDING ?? 0) +
    (blobProgress.avatars.FAILED ?? 0);
  if (pending > 0) failures.push('blob migration is incomplete');
}
const report = {
  passed: failures.length === 0,
  deployedCounts,
  keySetChecks: mapping.length,
  missingPlaceholderLinks,
  invalidCurrencyEvidenceRows,
  producedNothing,
  expectedProducedNothing,
  sourceRollupLedgers,
  targetRollupLedgers,
  financialLedgers: financialKeys.length,
  anomalySummaries,
  spotItems: selected.length,
  rollupSpots: rollupPairs.length,
  blobProgress,
  failures,
};
mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
writeFileSync(
  join(LOCAL_ROOT, 'reports', 'verification.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  {mode: 0o600},
);
if (process.argv.includes('--json'))
  process.stdout.write(`${JSON.stringify(report)}\n`);
else
  process.stdout.write(
    `verification: ${mapping.length} key sets, ${financialKeys.length} financial ledgers, ${selected.length} item spots, ${rollupPairs.length} rollup spots, ${failures.length} failures\n`,
  );
if (failures.length > 0) throw new Error('migration verification gate failed');
