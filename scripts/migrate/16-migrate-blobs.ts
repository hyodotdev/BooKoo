import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, normalize, resolve, sep} from 'node:path';
import {makeFunctionReference} from 'convex/server';
import sharp from 'sharp';

import {
  LOCAL_ROOT,
  callMigration,
  migrationClient,
  writeEnabled,
} from './lib/convexClient';
import {readJsonl} from './lib/jsonl';

type Kind = 'photo' | 'avatar';
type PendingBlob = {
  kind: Kind;
  legacyKey: string;
  sourcePath?: string;
  sourceUrl?: string;
  sourceMd5?: string;
  isBase64: boolean;
  attempts: number;
};

const kindValue = (() => {
  const index = process.argv.indexOf('--kind');
  return index < 0 ? 'both' : process.argv[index + 1];
})();
if (!['photo', 'avatar', 'both'].includes(kindValue ?? ''))
  throw new Error('invalid blob kind');
const kind = kindValue as Kind | 'both';
const retryFailed = process.argv.includes('--retry-failed');
const daemon = process.argv.includes('--daemon');
const mirrorRoot = resolve(LOCAL_ROOT, 'storage', 'blobs');
const sourceBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
if (
  sourceBucket !== undefined &&
  !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(sourceBucket)
)
  throw new Error('FIREBASE_STORAGE_BUCKET is invalid');

if (!writeEnabled()) {
  const photos = await readJsonl<Record<string, unknown>>(
    join(LOCAL_ROOT, 'convex', 'photos.jsonl'),
  );
  const placeholders = await readJsonl<Record<string, unknown>>(
    join(LOCAL_ROOT, 'convex', 'placeholders.jsonl'),
  );
  const report = {
    photos: photos.filter(
      (row) =>
        (row.document as Record<string, unknown>)?.migrationState === 'PENDING',
    ).length,
    avatars: placeholders.filter(
      (row) =>
        (row.document as Record<string, unknown>)?.avatarMigrationState ===
        'PENDING',
    ).length,
  };
  mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
  writeFileSync(
    join(LOCAL_ROOT, 'reports', 'dry-run-blobs.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    {mode: 0o600},
  );
  process.stdout.write(
    `dry-run blobs: ${report.photos} photos and ${report.avatars} avatars pending\n`,
  );
  process.exit(0);
}

const safeMirrorPath = (sourcePath: string): string => {
  const candidate = resolve(mirrorRoot, normalize(sourcePath));
  if (candidate !== mirrorRoot && !candidate.startsWith(`${mirrorRoot}${sep}`))
    throw new Error('storage path escaped the mirror root');
  return candidate;
};

const sourceBytes = (blob: PendingBlob): Buffer | undefined => {
  if (blob.sourceUrl?.startsWith('data:')) {
    const match = /^data:[^;,]+;base64,\s*(.+)$/s.exec(blob.sourceUrl);
    return match?.[1] === undefined
      ? undefined
      : Buffer.from(match[1], 'base64');
  }
  if (blob.sourcePath === undefined) return undefined;
  const path = safeMirrorPath(blob.sourcePath);
  if (existsSync(path)) return readFileSync(path);
  if (sourceBucket === undefined) return undefined;
  try {
    return execFileSync(
      'gcloud',
      ['storage', 'cat', `gs://${sourceBucket}/${blob.sourcePath}`],
      {maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']},
    );
  } catch {
    return undefined;
  }
};

const client = migrationClient();
const nextRef = makeFunctionReference<
  'mutation',
  {secret: string; kind: Kind | 'both'; limit: number},
  PendingBlob[]
>('migrate/files:nextPendingBlobs');
const resetRef = makeFunctionReference<
  'mutation',
  {secret: string; kind: Kind | 'both'; limit: number},
  number
>('migrate/files:resetFailedBlobs');
const uploadUrlRef = makeFunctionReference<
  'mutation',
  {secret: string},
  string
>('migrate/files:generateUploadUrl');
type AttachPhotoArgs = {
  secret: string;
  legacyKey: string;
  storageId: string;
  thumbStorageId: string;
  width?: number;
  height?: number;
  byteSize: number;
  mimeType: string;
};
const attachPhotoRef = makeFunctionReference<
  'mutation',
  AttachPhotoArgs,
  string
>('migrate/files:attachPhotoBlob');
const attachAvatarRef = makeFunctionReference<
  'mutation',
  {secret: string; legacyUid: string; storageId: string},
  string
>('migrate/files:attachAvatarBlob');
const markRef = (state: 'Missing' | 'Failed') =>
  makeFunctionReference<
    'mutation',
    {secret: string; kind: Kind; legacyKey: string},
    null
  >(`migrate/files:markBlob${state}`);
const discardRef = makeFunctionReference<
  'mutation',
  {secret: string; storageIds: string[]},
  null
>('migrate/files:discardUploads');

const upload = async (bytes: Uint8Array, mimeType: string): Promise<string> => {
  const url = await callMigration(client, uploadUrlRef, {});
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': mimeType},
    body: new Blob(
      [
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ],
      {type: mimeType},
    ),
  });
  if (!response.ok) throw new Error('Convex storage upload failed');
  const payload = (await response.json()) as {storageId?: string};
  if (!payload.storageId)
    throw new Error('Convex storage response omitted storageId');
  return payload.storageId;
};

const mimeFor = (format: string | undefined): string => {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  if (format === 'gif') return 'image/gif';
  if (format === 'avif') return 'image/avif';
  return 'image/jpeg';
};

const migrateOne = async (
  blob: PendingBlob,
): Promise<'done' | 'missing' | 'failed'> => {
  const original = sourceBytes(blob);
  if (original === undefined || original.length === 0) {
    await callMigration(client, markRef('Missing'), {
      kind: blob.kind,
      legacyKey: blob.legacyKey,
    });
    return 'missing';
  }
  if (
    blob.sourceMd5 !== undefined &&
    createHash('md5').update(original).digest('base64') !== blob.sourceMd5
  ) {
    await callMigration(client, markRef('Failed'), {
      kind: blob.kind,
      legacyKey: blob.legacyKey,
    });
    return 'failed';
  }
  const image = sharp(original, {failOn: 'error'}).rotate();
  const metadata = await image.metadata();
  const storageIds: string[] = [];
  try {
    if (blob.kind === 'photo') {
      const thumb = await image
        .clone()
        .resize({
          width: 320,
          height: 320,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({quality: 82})
        .toBuffer();
      const thumbStorageId = await upload(thumb, 'image/webp');
      storageIds.push(thumbStorageId);
      const storageId = await upload(original, mimeFor(metadata.format));
      storageIds.push(storageId);
      await callMigration<Omit<AttachPhotoArgs, 'secret'>, string>(
        client,
        attachPhotoRef,
        {
          legacyKey: blob.legacyKey,
          storageId,
          thumbStorageId,
          ...(metadata.width === undefined ? {} : {width: metadata.width}),
          ...(metadata.height === undefined ? {} : {height: metadata.height}),
          byteSize: original.length,
          mimeType: mimeFor(metadata.format),
        },
      );
    } else {
      const avatar = await image
        .clone()
        .resize({width: 96, height: 96, fit: 'cover'})
        .webp({quality: 82})
        .toBuffer();
      const storageId = await upload(avatar, 'image/webp');
      storageIds.push(storageId);
      await callMigration(client, attachAvatarRef, {
        legacyUid: blob.legacyKey,
        storageId,
      });
    }
    return 'done';
  } catch {
    if (storageIds.length > 0)
      await callMigration(client, discardRef, {storageIds}).catch(
        () => undefined,
      );
    await callMigration(client, markRef('Failed'), {
      kind: blob.kind,
      legacyKey: blob.legacyKey,
    });
    return 'failed';
  }
};

const totals = {done: 0, missing: 0, failed: 0};
if (retryFailed) {
  let reset: number;
  do {
    reset = await callMigration(client, resetRef, {kind, limit: 50});
  } while (reset === 50);
}
do {
  const pending = await callMigration(client, nextRef, {
    kind,
    limit: 24,
  });
  if (pending.length === 0) break;
  for (let index = 0; index < pending.length; index += 6) {
    const results = await Promise.all(
      pending.slice(index, index + 6).map(migrateOne),
    );
    for (const result of results) totals[result] += 1;
  }
  if (!daemon) break;
} while (true);
mkdirSync(join(LOCAL_ROOT, 'reports'), {recursive: true, mode: 0o700});
writeFileSync(
  join(LOCAL_ROOT, 'reports', 'blob-migration.json'),
  `${JSON.stringify(totals, null, 2)}\n`,
  {mode: 0o600},
);
process.stdout.write(
  `blob pass: ${totals.done} copied, ${totals.missing} missing, ${totals.failed} failed\n`,
);
if (totals.failed > 0) process.exitCode = 1;
