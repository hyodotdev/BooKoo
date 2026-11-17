import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  renameSync,
} from 'node:fs';
import {dirname} from 'node:path';
import {createInterface} from 'node:readline';
import {once} from 'node:events';

export interface JsonlBatch<T> {
  index: number;
  startLine: number;
  endLine: number;
  rows: T[];
}

export async function* readJsonlBatches<T>(
  path: string,
  size: number,
  fromLine = 0,
): AsyncGenerator<JsonlBatch<T>> {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error('invalid batch size');
  const input = createReadStream(path, {encoding: 'utf8'});
  const lines = createInterface({input, crlfDelay: Infinity});
  let line = 0;
  let rows: T[] = [];
  let startLine = fromLine;
  for await (const raw of lines) {
    line += 1;
    if (line <= fromLine || raw.trim() === '') continue;
    if (rows.length === 0) startLine = line - 1;
    rows.push(JSON.parse(raw) as T);
    if (rows.length === size) {
      yield {
        index: Math.floor(startLine / size),
        startLine,
        endLine: line,
        rows,
      };
      rows = [];
    }
  }
  if (rows.length > 0) {
    yield {index: Math.floor(startLine / size), startLine, endLine: line, rows};
  }
}

export async function writeJsonl(
  path: string,
  rows: Iterable<unknown> | AsyncIterable<unknown>,
): Promise<{rows: number}> {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const temporary = `${path}.tmp`;
  const output = createWriteStream(temporary, {encoding: 'utf8', mode: 0o600});
  let count = 0;
  for await (const row of rows) {
    if (!output.write(`${JSON.stringify(row)}\n`)) await once(output, 'drain');
    count += 1;
  }
  output.end();
  await once(output, 'close');
  renameSync(temporary, path);
  return {rows: count};
}

export async function readJsonl<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for await (const batch of readJsonlBatches<T>(path, 500))
    rows.push(...batch.rows);
  return rows;
}
