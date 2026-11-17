import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import sharp from 'sharp';
import {escapeXml, fitCaption, optimizeStorePng, storePngOptions} from './gallery-artwork.mjs';

const root = resolve(import.meta.dirname, '..');
const option = (name) =>
  process.argv
    .find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const config = JSON.parse(
  await readFile(join(root, 'store-assets/apple-gallery-config.json'), 'utf8'),
);
const sourceVersion = config.sourceVersion;
if (!/^\d+\.\d+\.\d+$/.test(sourceVersion ?? ''))
  throw Error('The Apple gallery requires a semantic sourceVersion.');
const output = resolve(
  root,
  option('--output') ?? `store-assets/marketing/${sourceVersion}`,
);
const sources = resolve(
  root,
  option('--sources') ?? `store-assets/marketing/${sourceVersion}/sources`,
);
const storyboard = JSON.parse(
  await readFile(join(root, 'store-assets/gallery-captions.json'), 'utf8'),
);
const selection = JSON.parse(
  await readFile(join(root, 'store-assets/current-play-gallery.json'), 'utf8'),
);
const captures = JSON.parse(
  await readFile(join(sources, 'capture-manifest.json'), 'utf8'),
);
const locales = option('--locales')?.split(',') ?? Object.keys(config.locales);
const selectedFamilies =
  option('--families')?.split(',') ??
  config.families.map(({directory}) => directory);
const families = config.families.filter(({directory}) =>
  selectedFamilies.includes(directory),
);
if (
  selectedFamilies.some(
    (value) => !families.some(({directory}) => directory === value),
  )
)
  throw Error('Unsupported Apple family');
if (locales.some((locale) => !(locale in config.locales)))
  throw Error('Unsupported Apple locale');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const planned = new Map();

// Native provenance and inspected crops are required for every requested scene.
// Validate all sources before writing the first gallery panel.
for (const locale of locales) {
  for (const family of families) {
    for (const scene of selection.scenes.filter((value) => value !== 'intro')) {
      const capture = captures.find(
        (value) =>
          value.family === family.sourceFamily &&
          value.locale === locale &&
          value.scene === scene,
      );
      if (
        !capture ||
        capture.platform !== 'ios' ||
        capture.version !== sourceVersion ||
        !capture.inspected ||
        !capture.capturedAt ||
        !capture.nativeArtifactSha256 ||
        !capture.sourceFingerprint
      )
        throw Error(
          `Missing verified iOS capture: ${locale}/${family.sourceFamily}/${scene}`,
        );
      const bytes = await readFile(join(sources, capture.file));
      if (sha(bytes) !== capture.sha256)
        throw Error(`Native source checksum differs: ${capture.file}`);
      const info = await sharp(bytes).metadata();
      const {top, bottom} = capture.crop;
      if (
        !Number.isInteger(top) ||
        !Number.isInteger(bottom) ||
        top < 0 ||
        bottom < 0 ||
        !info.width ||
        !info.height ||
        top + bottom >= info.height
      )
        throw Error(`Invalid inspected crop: ${capture.file}`);
      planned.set(`${locale}/${family.directory}/${scene}`, {
        capture,
        bytes,
        info,
      });
    }
    const cover = await readFile(
      join(
        output,
        config.locales[locale].directory,
        family.directory,
        '01-intro.png',
      ),
    );
    const info = await sharp(cover).metadata();
    if (
      info.width !== family.width ||
      info.height !== family.height ||
      info.hasAlpha
    )
      throw Error(
        `Render the native 3D cover first: ${locale}/${family.directory}`,
      );
  }
}

const manifest = {
  version: sourceVersion,
  status: 'local candidate, remote verification required',
  locales,
  families: selectedFamilies,
  complete:
    locales.length === Object.keys(config.locales).length &&
    families.length === config.families.length,
  scenes: selection.scenes,
  source:
    'Inspected native iOS synthetic captures; proportional mapping and documented system/ad crops; no UI redraw.',
  panels: [],
};
for (const locale of locales) {
  const localeConfig = config.locales[locale];
  const copy = storyboard.captions[localeConfig.copyLocale];
  for (const family of families) {
    const {width, height} = family;
    const folder = join(output, localeConfig.directory, family.directory);
    await mkdir(folder, {recursive: true});
    const thumbs = [];
    const galleryPanels = [];
    for (const [index, scene] of selection.scenes.entries()) {
      const sourceScene = scene === 'intro' ? 'calendar' : scene;
      const {capture, bytes, info} = planned.get(
        `${locale}/${family.directory}/${sourceScene}`,
      );
      const file = `${String(index + 1).padStart(2, '0')}-${scene}.png`;
      const destination = join(folder, file);
      if (scene === 'intro') {
        await writeFile(destination, await optimizeStorePng(await readFile(destination)));
      }
      if (scene !== 'intro') {
        const [headline, subhead] = copy[scene];
        const background = '#424D6B';
        const scale = width / 1080;
        const font = locale === 'ko' ? 'Apple SD Gothic Neo' : 'Helvetica Neue';
        const headlineSize = await fitCaption(headline, {
          font,
          startSize: Math.round(52 * scale),
          weight: 400,
          maxWidth: width * 0.88,
        });
        const subheadSize = await fitCaption(subhead, {
          font,
          startSize: Math.round(28 * scale),
          weight: 400,
          maxWidth: width * 0.88,
        });
        const screenTop = Math.round(height * 0.175);
        const screen = await sharp(bytes)
          .extract({
            left: 0,
            top: capture.crop.top,
            width: info.width,
            height: info.height - capture.crop.top - capture.crop.bottom,
          })
          .resize({
            width: Math.round(width * 0.82),
            height: height - screenTop - Math.round(height * 0.04),
            fit: 'inside',
          })
          .png()
          .toBuffer();
        const screenInfo = await sharp(screen).metadata();
        const framePad = Math.round(width * 0.018);
        const frameWidth = screenInfo.width + framePad * 2;
        const frameX = Math.round((width - frameWidth) / 2);
        const frameY = screenTop - Math.round(width * 0.044);
        const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${width}" height="${height}" fill="${background}"/>
          <g font-family="${font}, sans-serif" text-anchor="middle" fill="#FFFFFF">
            <text x="${width / 2}" y="${Math.round(height * 0.04)}" font-size="${Math.round(26 * scale)}" font-weight="500">BooKoo</text>
            <text x="${width / 2}" y="${Math.round(height * 0.095)}" font-size="${headlineSize}" font-weight="400">${escapeXml(headline)}</text>
            <text x="${width / 2}" y="${Math.round(height * 0.129)}" font-size="${subheadSize}" opacity=".9">${escapeXml(subhead)}</text>
          </g>
          <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${screenInfo.height + Math.round(width * 0.085)}" rx="${Math.round(width * 0.065)}" fill="#FFFFFF"/>
          <rect x="${width * 0.4}" y="${frameY + Math.round(width * 0.022)}" width="${width * 0.2}" height="${Math.round(width * 0.006)}" rx="${Math.round(width * 0.003)}" fill="#E0E4E9"/>
        </svg>`;
        await sharp(Buffer.from(svg))
          .composite([
            {
              input: screen,
              left: Math.round((width - screenInfo.width) / 2),
              top: screenTop,
            },
          ])
          .flatten({background})
          .removeAlpha()
          .png(storePngOptions)
          .toFile(destination);
      }
      const rendered = await readFile(destination);
      const metadata = await sharp(rendered).metadata();
      if (
        metadata.width !== width ||
        metadata.height !== height ||
        metadata.hasAlpha
      )
        throw Error(`Invalid Apple output: ${destination}`);
      thumbs.push({
        input: await sharp(rendered)
          .resize(270, Math.round((270 * height) / width))
          .png()
          .toBuffer(),
        left: (index % 4) * 286 + 16,
        top:
          Math.floor(index / 4) * (Math.round((270 * height) / width) + 16) +
          16,
      });
      const panel = {
        locale,
        family: family.directory,
        displayType: family.displayType,
        scene,
        file: relative(output, destination),
        width,
        height,
        sha256: sha(rendered),
        bytes: rendered.length,
        capture: {
          ...capture,
          file: relative(output, join(sources, capture.file)),
        },
      };
      manifest.panels.push(panel);
      galleryPanels.push(panel);
    }
    await sharp({
      create: {
        width: 1160,
        height: 2 * (Math.round((270 * height) / width) + 16) + 16,
        channels: 3,
        background: '#F3F5F8',
      },
    })
      .composite(thumbs)
      .png()
      .toFile(join(folder, 'overview.png'));
    await writeFile(
      join(folder, 'gallery-manifest.json'),
      `${JSON.stringify({version: manifest.version, scenes: manifest.scenes, panels: galleryPanels}, null, 2)}\n`,
    );
  }
}
await writeFile(
  join(output, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Verified ${manifest.panels.length} Apple panels with native iOS source checksums.`,
);
