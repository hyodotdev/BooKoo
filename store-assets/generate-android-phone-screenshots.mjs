import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const storeAssetsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(storeAssetsDir);
const outputDir = path.join(
  storeAssetsDir,
  '1.0.0',
  'ko',
  'android-phone',
);

const captures = [
  {
    file: '01-calendar.png',
    route: '/ledger/[ledgerId]/(tabs)/calendar',
    theme: 'dark',
    source:
      'docs/debugs/full-review-2026-08-30/current/01-android-red-ledger.png',
  },
  {
    file: '02-ledger-details.png',
    route: '/ledger/[ledgerId]/details',
    theme: 'light',
    source:
      'docs/debugs/e2e/2026-08-31-exact/pixel10/statusbar-light-ledger-details-exact.png',
  },
  {
    file: '03-new-entry.png',
    route: '/ledger/[ledgerId]/item/new',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-31-exact/pixel10/editor-stress-inline-finalverify/001-create-page.png',
  },
  {
    file: '04-categories.png',
    route: '/ledger/[ledgerId]/item/new#category',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-31-exact/pixel10/editor-stress-inline-finalverify/003-category-sheet.png',
  },
  {
    file: '05-location.png',
    route: '/ledger/[ledgerId]/item/new#location',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-31-exact/pixel10/editor-stress-inline-finalverify/005-location-map.png',
  },
  {
    file: '06-profile.png',
    route: '/profile',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-30-exact/pixel10/routes/14-profile.png',
  },
  {
    file: '07-settings.png',
    route: '/settings',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-30-exact/pixel10/routes/1-settings-home.png',
  },
  {
    file: '08-notifications.png',
    route: '/settings/notifications',
    theme: 'dark',
    source:
      'docs/debugs/e2e/2026-08-30-exact/pixel10/routes/5-notifications.png',
  },
];

await mkdir(outputDir, {recursive: true});

const manifest = [];
for (const capture of captures) {
  const sourcePath = path.join(projectRoot, capture.source);
  const outputPath = path.join(outputDir, capture.file);
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== 1080 || metadata.height !== 2424) {
    throw new Error(
      `${capture.source} must be a 1080x2424 Pixel capture; received ${metadata.width}x${metadata.height}`,
    );
  }

  await sharp(sourcePath)
    .resize(1080, 1920, {
      fit: 'contain',
      background: '#17233B',
      position: 'centre',
    })
    .png({compressionLevel: 9})
    .toFile(outputPath);

  const bytes = await readFile(outputPath);
  manifest.push({
    file: capture.file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source: capture.source,
    version: '1.0.0',
    build: 11,
    os: 'Android 16',
    device: 'Pixel 10',
    locale: 'ko-KR',
    theme: capture.theme,
    route: capture.route,
    dimensions: '1080x1920',
  });
}

await writeFile(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
