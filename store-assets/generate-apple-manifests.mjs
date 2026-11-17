import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const storeAssetsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(storeAssetsDir);
const version = '1.0.0';
const locale = 'en';
const evidenceDir = path.join(
  projectRoot,
  'docs',
  'debugs',
  'release',
  '2026-08-31',
  'ios-simulator',
);

const families = [
  {
    device: 'iPhone 17 Pro Max simulator',
    directory: 'iphone-6.9',
    dimensions: '1320x2868',
    routes: [
      '/(app)/(tabs)/(root)',
      '/(app)/(tabs)/(root)/timeline',
      '/(app)/(tabs)/(root)/stats',
      '/(app)/(tabs)#drawer',
      '/ledger/[ledgerId]/members',
      '/ledger/[ledgerId]/item/new#category',
      '/ledger/[ledgerId]/item/new',
      '/(app)/(tabs)/(root)/me',
    ],
    sheet: {columns: 4, tileHeight: 737, tileWidth: 330},
  },
  {
    device: 'iPad Pro 13-inch (M5) simulator',
    directory: 'ipad-13',
    dimensions: '2752x2064',
    routes: [
      '/(app)/(tabs)/(root)',
      '/(app)/(tabs)/(root)/timeline#selected-item',
      '/(app)/(tabs)/(root)/stats',
      '/(app)/(tabs)#drawer',
      '/ledger/[ledgerId]/members',
      '/ledger/[ledgerId]/item/new#category',
      '/ledger/[ledgerId]/item/new',
      '/(app)/(tabs)/(root)/me',
    ],
    sheet: {columns: 2, tileHeight: 536, tileWidth: 688},
  },
];

await mkdir(evidenceDir, {recursive: true});

for (const family of families) {
  const directory = path.join(
    storeAssetsDir,
    version,
    locale,
    family.directory,
  );
  const screenshots = (await readdir(directory))
    .filter((file) => /^\d{2}-.+\.png$/.test(file))
    .sort();
  if (screenshots.length !== 8)
    throw new Error(`${family.directory} requires 8 screenshots`);

  const manifest = [];
  const tiles = [];
  for (const [index, file] of screenshots.entries()) {
    const input = path.join(directory, file);
    const metadata = await sharp(input).metadata();
    const actual = `${metadata.width}x${metadata.height}`;
    if (actual !== family.dimensions)
      throw new Error(
        `${file}: expected ${family.dimensions}; received ${actual}`,
      );

    const bytes = await readFile(input);
    manifest.push({
      build: 'local iOS Release working tree',
      device: family.device,
      dimensions: family.dimensions,
      file,
      locale: 'en-US',
      route: family.routes[index],
      sha256: createHash('sha256').update(bytes).digest('hex'),
      theme: 'light',
      version,
    });

    const labelHeight = 20;
    const imageHeight = family.sheet.tileHeight - labelHeight;
    const image = await sharp(input)
      .resize(family.sheet.tileWidth, imageHeight, {
        fit: 'contain',
        background: '#e8edf5',
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${family.sheet.tileWidth}" height="${labelHeight}">
        <rect width="100%" height="100%" fill="#17233b"/>
        <text x="10" y="14" fill="#ffffff" font-family="-apple-system, sans-serif" font-size="11">${file}</text>
      </svg>`,
    );
    tiles.push(
      await sharp({
        create: {
          background: '#e8edf5',
          channels: 4,
          height: family.sheet.tileHeight,
          width: family.sheet.tileWidth,
        },
      })
        .composite([
          {input: image, left: 0, top: 0},
          {input: label, left: 0, top: imageHeight},
        ])
        .png()
        .toBuffer(),
    );
  }

  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const rows = Math.ceil(tiles.length / family.sheet.columns);
  const composites = tiles.map((input, index) => ({
    input,
    left: (index % family.sheet.columns) * family.sheet.tileWidth,
    top: Math.floor(index / family.sheet.columns) * family.sheet.tileHeight,
  }));
  await sharp({
    create: {
      background: '#e8edf5',
      channels: 4,
      height: rows * family.sheet.tileHeight,
      width: family.sheet.columns * family.sheet.tileWidth,
    },
  })
    .composite(composites)
    .jpeg({quality: 90})
    .toFile(path.join(evidenceDir, `${family.directory}-contact-sheet.jpg`));
}
