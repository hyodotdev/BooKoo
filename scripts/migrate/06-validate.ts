import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {toDayKey, toMonthKey} from '../../shared/date';
import {canonical, sha256} from './lib/hash';
import {readJsonl} from './lib/jsonl';
import {objectOf} from './lib/rtdb';

type Row = Record<string, unknown>;

const FILES: Readonly<Record<string, string>> = {
  legacyUsers: 'convex/legacyUsers.jsonl',
  placeholders: 'convex/placeholders.jsonl',
  ledgers: 'convex/ledgers.jsonl',
  ledgerMembers: 'convex/ledgerMembers.jsonl',
  joinRequests: 'convex/joinRequests.jsonl',
  invites: 'convex/invites.jsonl',
  legacyInvites: 'convex/legacyInvites.jsonl',
  categories: 'convex/categories.jsonl',
  items: 'convex/items.jsonl',
  comments: 'convex/comments.jsonl',
  photos: 'convex/photos.jsonl',
  feedback: 'normalized/feedback.jsonl',
  anomalies: 'reports/anomalies.jsonl',
};

const NEVER_WAIVABLE = new Set([
  'SELECTED_DATE_LOST',
  'ZERO_AMOUNT',
  'CATEGORY_ICON_OUT_OF_RANGE',
  'CATEGORY_UNRECOVERABLE',
  'MEMBER_UID_UNKNOWN',
  'LEDGER_NOT_VISIBLE',
  'INVITE_UNCLASSIFIABLE',
  'PHOTO_URL_UNPARSEABLE',
  'ROLLUP_DRIFT',
]);

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const documentOf = (row: Row): Row => objectOf(row.document);
const stringField = (row: Row, name: string): string => {
  const value = row[name];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${name} is missing`);
  return value;
};

const unique = (rows: readonly Row[], field: string, name: string): void => {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = stringField(row, field);
    if (seen.has(key)) throw new Error(`${name} has a duplicate migration key`);
    seen.add(key);
  }
};

const waiverKinds = (path: string): Set<string> => {
  if (!existsSync(path)) return new Set();
  const text = readFileSync(path, 'utf8');
  return new Set(
    [...text.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)].map((match) => match[0]),
  );
};

async function main(): Promise<void> {
  const localRoot = resolve(
    argument('--root') ?? join(process.cwd(), '.local', 'migration'),
  );
  const data: Record<string, Row[]> = {};
  for (const [name, relative] of Object.entries(FILES)) {
    const path = join(localRoot, relative);
    if (!existsSync(path))
      throw new Error(`normalized output is missing ${relative}`);
    data[name] = await readJsonl<Row>(path);
  }
  const baseline = JSON.parse(
    readFileSync(join(localRoot, 'reports', 'BASELINE.json'), 'utf8'),
  ) as {counts?: Record<string, number>};
  for (const [name, expected] of Object.entries(baseline.counts ?? {})) {
    const actual = data[name]?.length;
    if (actual !== expected)
      throw new Error(
        `${name} count changed: expected ${expected}, found ${actual}`,
      );
  }

  unique(data.legacyUsers ?? [], 'legacyUid', 'legacyUsers');
  for (const name of [
    'ledgers',
    'ledgerMembers',
    'joinRequests',
    'invites',
    'items',
    'comments',
    'photos',
    'feedback',
  ])
    unique(data[name] ?? [], 'legacyKey', name);

  const userKeys = new Set(
    (data.legacyUsers ?? []).map((row) => stringField(row, 'legacyUid')),
  );
  const ledgerKeys = new Set(
    (data.ledgers ?? []).map((row) => stringField(row, 'legacyKey')),
  );
  const itemKeys = new Set(
    (data.items ?? []).map((row) => stringField(row, 'legacyKey')),
  );
  const anomalyKeys = new Set(
    (data.anomalies ?? []).map((row) => {
      const document = documentOf(row);
      return `${String(document.kind)}:${String(document.legacyKey)}`;
    }),
  );
  for (const row of data.ledgers ?? []) {
    if (!userKeys.has(stringField(row, 'legacyOwnerUid')))
      throw new Error('ledger owner reference is unresolved');
  }
  for (const row of data.ledgerMembers ?? []) {
    if (
      !userKeys.has(stringField(row, 'legacyUid')) ||
      !ledgerKeys.has(stringField(row, 'legacyLedgerKey'))
    )
      throw new Error('membership reference is unresolved');
  }
  for (const row of data.items ?? []) {
    if (
      !userKeys.has(stringField(row, 'legacyWriterUid')) ||
      !ledgerKeys.has(stringField(row, 'legacyLedgerKey'))
    )
      throw new Error('item reference is unresolved');
    const document = documentOf(row);
    const amount = document.amountMinor;
    if (
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      document.baseAmountMinor !== amount ||
      document.currency !== document.baseCurrency
    )
      throw new Error('item money invariant failed');
    const occurredAt = document.occurredAt;
    if (
      typeof occurredAt !== 'number' ||
      document.dayKey !== toDayKey(occurredAt, 'Asia/Seoul') ||
      document.monthKey !== toMonthKey(occurredAt, 'Asia/Seoul')
    )
      throw new Error('item date bucket invariant failed');
    const evidence = document.legacyCurrencyEvidence;
    const evidenceMismatch =
      typeof evidence === 'string' &&
      !['UNKNOWN', 'OTHER'].includes(evidence) &&
      evidence !== document.baseCurrency;
    if (
      evidenceMismatch &&
      (document.needsReview !== true ||
        !anomalyKeys.has(
          `CURRENCY_EVIDENCE_MISMATCH:${stringField(row, 'legacyKey')}`,
        ))
    )
      throw new Error('currency evidence review invariant failed');
    const raw = document.legacyRaw;
    if (typeof raw === 'string' && !raw.includes('"_truncated":true')) {
      const parsed: unknown = JSON.parse(raw);
      if (document.legacyChecksum !== sha256(canonical(parsed)))
        throw new Error('item source checksum invariant failed');
    }
  }
  for (const name of ['comments', 'photos']) {
    for (const row of data[name] ?? []) {
      if (!itemKeys.has(stringField(row, 'legacyItemKey')))
        throw new Error(`${name} parent reference is unresolved`);
    }
  }
  for (const row of data.categories ?? []) {
    if (!ledgerKeys.has(stringField(row, 'legacyLedgerKey')))
      throw new Error('category ledger reference is unresolved');
  }

  const anomalyCounts = new Map<string, number>();
  for (const row of data.anomalies ?? []) {
    const kind = String(documentOf(row).kind ?? 'UNKNOWN');
    anomalyCounts.set(kind, (anomalyCounts.get(kind) ?? 0) + 1);
  }
  const explain = argument('--explain');
  if (explain !== undefined) {
    process.stdout.write(`${explain}: ${anomalyCounts.get(explain) ?? 0}\n`);
    return;
  }
  const waivers = waiverKinds(join(localRoot, 'reports', 'WAIVERS.md'));
  const unresolved: string[] = [];
  for (const [kind, count] of [...anomalyCounts.entries()].sort()) {
    if (count === 0) continue;
    if (NEVER_WAIVABLE.has(kind) || !waivers.has(kind))
      unresolved.push(`${kind} (${count})`);
  }
  const report = {
    valid: unresolved.length === 0,
    counts: Object.fromEntries(
      Object.entries(data).map(([name, rows]) => [name, rows.length]),
    ),
    anomalies: Object.fromEntries([...anomalyCounts.entries()].sort()),
    unresolved,
  };
  mkdirSync(join(localRoot, 'reports'), {recursive: true, mode: 0o700});
  writeFileSync(
    join(localRoot, 'reports', 'validation.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    {mode: 0o600},
  );
  if (unresolved.length > 0)
    throw new Error(`validation gate failed: ${unresolved.join(', ')}`);
  process.stdout.write(
    `validated ${data.items?.length ?? 0} items and ${data.anomalies?.length ?? 0} anomaly records\n`,
  );
}

if (import.meta.main) await main();
