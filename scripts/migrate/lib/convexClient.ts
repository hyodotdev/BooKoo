import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference, type FunctionReference} from 'convex/server';
import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';

import {loadCheckpoint, saveCheckpoint} from './checkpoint';
import {readJsonlBatches} from './jsonl';

export const LOCAL_ROOT = `${process.cwd()}/.local/migration`;

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const migrationRunId = (): string => required('RUN_ID');
export const migrationSecret = (): string => required('MIGRATION_SECRET');

export function migrationClient(): ConvexHttpClient {
  const client = new ConvexHttpClient(required('CONVEX_URL'));
  return client;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {retries?: number; baseMs?: number} = {},
): Promise<T> {
  const retries = options.retries ?? 6;
  const baseMs = options.baseMs ?? 250;
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 === retries) break;
      const ceiling = baseMs * 2 ** attempt;
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, Math.floor(Math.random() * ceiling)),
      );
    }
  }
  throw lastError;
}

export type MigrationResult = {
  inserted: number;
  skipped: number;
  failed: number;
};

export async function callMigration<
  Args extends Record<string, unknown>,
  Result,
>(
  client: ConvexHttpClient,
  reference: FunctionReference<
    'mutation',
    'public',
    Args & {secret: string},
    Result
  >,
  args: Args,
): Promise<Result> {
  const mutate = client.mutation.bind(client) as unknown as (
    target: typeof reference,
    value: Args & {secret: string},
  ) => Promise<Result>;
  return withRetry(() =>
    mutate(reference, {...args, secret: migrationSecret()}),
  );
}

export const hasFlag = (flag: string): boolean => process.argv.includes(flag);
export const writeEnabled = (): boolean =>
  hasFlag('--write') || hasFlag('--apply');

const valueAfter = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};

export interface ImportPassOptions {
  name: string;
  table: string;
  file: string;
  batchSize: number;
  functionName: string;
  prepareRow?: (row: Record<string, unknown>) => Record<string, unknown>;
}

export async function runImportPass(
  options: ImportPassOptions,
): Promise<MigrationResult> {
  const writing = writeEnabled();
  const runId = process.env.RUN_ID?.trim() || 'dry-run';
  const checkpoint = hasFlag('--resume')
    ? loadCheckpoint(options.name)
    : undefined;
  if (checkpoint !== undefined && checkpoint.runId !== runId)
    throw new Error('checkpoint belongs to another RUN_ID');
  const explicitLine = Number(valueAfter('--from-line'));
  const fromLine = Number.isSafeInteger(explicitLine)
    ? explicitLine
    : (checkpoint?.line ?? 0);
  const result: MigrationResult = {inserted: 0, skipped: 0, failed: 0};
  const client = writing ? migrationClient() : undefined;
  const reference = makeFunctionReference<
    'mutation',
    {
      secret: string;
      runId: string;
      batchIndex: number;
      rows: string[];
    },
    MigrationResult
  >(options.functionName);
  let batches = 0;
  let parsedRows = 0;
  for await (const batch of readJsonlBatches<Record<string, unknown>>(
    options.file,
    options.batchSize,
    fromLine,
  )) {
    const preparedRows = options.prepareRow
      ? batch.rows.map(options.prepareRow)
      : batch.rows;
    const rows = preparedRows.map((row) => JSON.stringify(row));
    for (const row of rows) {
      if (Buffer.byteLength(row, 'utf8') > 64 * 1024)
        throw new Error('normalized row exceeds the 64 KiB migration cap');
    }
    parsedRows += rows.length;
    batches += 1;
    if (!writing) continue;
    if (client === undefined)
      throw new Error('migration client invariant failed');
    const batchResult = await callMigration(client, reference, {
      runId,
      batchIndex: batch.index,
      rows,
    });
    result.inserted += batchResult.inserted;
    result.skipped += batchResult.skipped;
    result.failed += batchResult.failed;
    saveCheckpoint(options.name, {
      runId,
      table: options.table,
      line: batch.endLine,
      batchIndex: batch.index,
      at: Date.now(),
    });
  }
  if (!writing) {
    const reportPath = join(
      LOCAL_ROOT,
      'reports',
      `dry-run-${options.name}.json`,
    );
    mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
    writeFileSync(
      reportPath,
      `${JSON.stringify({pass: options.name, table: options.table, batches, rows: parsedRows}, null, 2)}\n`,
      {mode: 0o600},
    );
    result.skipped = parsedRows;
  }
  const outcome = writing
    ? `, ${result.inserted} inserted, ${result.skipped} skipped, ${result.failed} failed`
    : '';
  process.stdout.write(
    `${writing ? 'write' : 'dry-run'} ${options.name}: ${parsedRows} rows in ${batches} batches${outcome}\n`,
  );
  return result;
}
