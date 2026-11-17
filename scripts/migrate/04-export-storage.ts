import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {writeJsonl} from './lib/jsonl';

type GcloudObject = {
  name?: string;
  size?: string | number;
  contentType?: string;
  md5Hash?: string;
  crc32c?: string;
  timeCreated?: string;
  metadata?: {firebaseStorageDownloadTokens?: string};
};

const write = process.argv.includes('--write');
if (!write) {
  process.stdout.write('dry-run: would export the Storage object manifest\n');
  process.exit(0);
}
const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
if (!bucket) throw new Error('FIREBASE_STORAGE_BUCKET is required');
const processOutput = execFileSync(
  'gcloud',
  ['storage', 'ls', '--json', `gs://${bucket}/**`],
  {encoding: 'utf8', maxBuffer: 128 * 1024 * 1024},
);
const parsed: unknown = JSON.parse(processOutput);
if (!Array.isArray(parsed))
  throw new Error('unexpected gcloud inventory response');
const objects = (parsed as GcloudObject[])
  .filter((object) => typeof object.name === 'string')
  .sort((left, right) => String(left.name).localeCompare(String(right.name)))
  .map((object) => ({
    name: object.name,
    size: Number(object.size ?? 0),
    contentType: object.contentType,
    md5Hash: object.md5Hash,
    crc32c: object.crc32c,
    timeCreated: object.timeCreated,
    downloadToken: object.metadata?.firebaseStorageDownloadTokens ?? null,
  }));
const root = join(process.cwd(), '.local', 'migration');
const storage = join(root, 'storage');
mkdirSync(storage, {recursive: true, mode: 0o700});
await writeJsonl(join(storage, 'manifest.jsonl'), objects);
const manifestPath = join(root, 'MANIFEST.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
  string,
  unknown
>;
manifest.storage = {
  objectCount: objects.length,
  totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
  ledgerObjects: objects.filter((object) => object.name?.startsWith('ledgers/'))
    .length,
  userObjects: objects.filter((object) => object.name?.startsWith('users/'))
    .length,
  namesWithSpace: objects.filter((object) => object.name?.includes(' ')).length,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
});
process.stdout.write(`storage manifest recorded ${objects.length} objects\n`);
