import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import {join} from 'node:path';

export interface Checkpoint {
  runId: string;
  table: string;
  line: number;
  batchIndex: number;
  at: number;
}

const ROOT = join(process.cwd(), '.local', 'migration', 'checkpoints');
const safeName = (name: string): string => {
  if (!/^[a-z0-9-]+$/i.test(name)) throw new Error('invalid checkpoint name');
  return name;
};

export function loadCheckpoint(name: string): Checkpoint | undefined {
  const path = join(ROOT, `${safeName(name)}.json`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function saveCheckpoint(name: string, checkpoint: Checkpoint): void {
  mkdirSync(ROOT, {recursive: true, mode: 0o700});
  const path = join(ROOT, `${safeName(name)}.json`);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    mode: 0o600,
  });
  const descriptor = openSync(temporary, 'r');
  fsyncSync(descriptor);
  closeSync(descriptor);
  renameSync(temporary, path);
  const directory = openSync(ROOT, 'r');
  fsyncSync(directory);
  closeSync(directory);
}
