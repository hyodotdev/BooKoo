import {access, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';

import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET_ROOT = join(ROOT, 'store-assets', 'marketing', '1.0.0');
const LOCALES = [
  'en-US',
  'ko',
  'ja',
  'zh-Hans',
  'id',
  'fr-FR',
  'de-DE',
  'es-ES',
  'it-IT',
];
const TARGETS = {
  'apple-iphone-6.9': {width: 1320, height: 2868},
  'apple-iphone-6.5': {width: 1284, height: 2778},
  'apple-ipad-13': {width: 2752, height: 2064},
  'google-play-phone': {width: 1080, height: 1920},
};

const failures = [];
for (const locale of LOCALES) {
  for (const [directory, expected] of Object.entries(TARGETS)) {
    const path = join(ASSET_ROOT, locale, directory);
    const files = (await readdir(path))
      .filter((name) => /^\d{2}-.*\.png$/.test(name))
      .sort();
    if (files.length !== 8)
      failures.push(`${locale}/${directory}: ${files.length}/8 screenshots`);
    for (const file of files) {
      const metadata = await sharp(join(path, file)).metadata();
      if (
        metadata.width !== expected.width ||
        metadata.height !== expected.height
      )
        failures.push(
          `${locale}/${directory}/${file}: ${metadata.width}x${metadata.height}`,
        );
      if (metadata.hasAlpha)
        failures.push(`${locale}/${directory}/${file}: alpha channel present`);
    }
  }
  await access(join(ASSET_ROOT, locale, 'apple-iphone-contact-sheet.png'));
  await access(join(ASSET_ROOT, locale, 'google-play-contact-sheet.png'));
  for (const [file, expected] of [
    ['feature-graphic-1024x500.png', {width: 1024, height: 500}],
    ['feature-graphic-upload-2048x1000.png', {width: 2048, height: 1000}],
    ['icon-512.png', {width: 512, height: 512}],
  ]) {
    const metadata = await sharp(
      join(ASSET_ROOT, locale, 'google-play', file),
    ).metadata();
    if (
      metadata.width !== expected.width ||
      metadata.height !== expected.height
    )
      failures.push(`${locale}/google-play/${file}: invalid dimensions`);
    if (metadata.hasAlpha)
      failures.push(`${locale}/google-play/${file}: alpha channel present`);
  }
}

if (failures.length > 0)
  throw new Error(
    `marketing screenshot verification failed:\n- ${failures.join('\n- ')}`,
  );

process.stdout.write(
  `marketing screenshots: ${LOCALES.length} locales × 8 scenes × ${Object.keys(TARGETS).length} device classes verified\n`,
);
