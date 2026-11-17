import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, unlink, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import sharp from 'sharp';
import {escapeXml, fitCaption, optimizeStorePng, storePngOptions} from './gallery-artwork.mjs';

// R63/R65/R80: authentic native UI, quiet captions and a mint brand cover.
const root = resolve(import.meta.dirname, '..');
const legacyCover = process.argv.includes('--legacy-cover');
const gallerySelection = legacyCover ? JSON.parse(await readFile(join(root, 'store-assets/current-play-gallery.json'), 'utf8')) : null;
const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const output = resolve(root, option('--output') ?? `store-assets/marketing/${legacyCover ? '2026-10-09-cover' : '2026-09-13'}`);
const sources = resolve(root, option('--sources') ?? 'store-assets/marketing/2026-09-13/sources');
const freshSources = option('--sources') !== undefined;
const cropConfig = option('--crop-config') === undefined ? null : JSON.parse(await readFile(resolve(root, option('--crop-config')), 'utf8'));
if (freshSources && (!legacyCover || cropConfig === null || option('--captured-at') === undefined)) throw Error('Fresh sources require --legacy-cover, --crop-config and --captured-at');

// These are the inspected September native captures, with localized synthetic
// fixtures. R79 makes English the default. The optional R80 candidate preserves
// that source set and the shipped gallery, introducing its own eight-panel order.
//
// Captions were realigned on 2026-09-20 to the community-ledger positioning in
// .notes/DECISIONS.md: the panels describe money several people spend together,
// not a couple's household. No caption names a group size, because a new ledger
// holds 2 members on Free and 5 on Pro (convex/lib/entitlements.ts).
const storyboard = JSON.parse(await readFile(join(root, 'store-assets/gallery-captions.json'), 'utf8'));
const scenes = Object.fromEntries(['ko-KR', 'en-US', 'ja', 'zh-CN', 'id'].map(locale => [locale, storyboard.historicalScenes]));
// The ko captures come from a physical phone, so their status bar carries the
// tester's own notification icons. Crop them off at the display cutout inset
// rather than paint over them — the same crop-don't-retouch rule that ends the
// composition above the test advertisement.
// top: the display cutout inset, which is exactly the status bar.
// bottom: everything from the first row of the AdMob test banner down, so the
// composition still ends above the advertisement now that the top crop has
// shifted the screen up inside the frame.
const sourceCrop = {
  'ko-KR': {top: 173, bottom: 234},
  // en-US is re-shot on the same emulator with the demo status bar on, so there
  // is nothing to trim at the top; the bottom crop ends above the AdMob test
  // banner exactly as it does for ko.
  'en-US': {top: 0, bottom: 234},
  ja: {top: 0, bottom: 234},
  // The source has a 53px black system status strip; crop it in the R80
  // candidate, while keeping the historical gallery's reproduction intact.
  'zh-CN': {top: legacyCover ? 53 : 0, bottom: 234},
  id: {top: 0, bottom: 234},
};
const copy = Object.fromEntries(Object.keys(scenes).map(locale => [locale, storyboard.historicalScenes.map(scene => storyboard.captions[locale][scene])]));
const xml = escapeXml;
// Panel captions are centred at x=540 on a 1080 canvas, so anything whose ink
// exceeds 1080px is cut by the frame with no other symptom — the file name,
// the dimensions and the byte count all stay correct. The widest caption today
// is the Indonesian comments headline at 1039px. Measure, then step the type
// down rather than emit a clipped panel.
const PANEL_TEXT_WIDTH = legacyCover ? 920 : 1080;
const fitSize = (text, font, startSize, weight) =>
  fitCaption(text, {font, startSize, weight, maxWidth: PANEL_TEXT_WIDTH});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = {capturedAt: option('--captured-at') ?? '2026-09', designedAt: legacyCover ? '2026-10-09' : '2026-09-20', status: legacyCover ? 'local candidate, not uploaded' : 'shipped gallery', source: legacyCover ? 'Inspected native captures with localized synthetic fixtures. Original UI pixels, proportional mapping, and documented system/ad crops. The cover uses a local Blender scene; AI is used only for composition exploration.' : 'Native Android captures, development synthetic fixtures. Unretouched UI with proportional resize and documented status/ad crops inside a device frame.', panels: []};
await mkdir(output, {recursive: true});
const locales = option('--locales')?.split(',') ?? (legacyCover ? ['en-US', 'ko-KR', 'ja', 'zh-CN', 'id'] : Object.keys(copy));
if (locales.some(locale => !(locale in copy))) throw Error('Unsupported gallery locale');
for (const locale of locales) {
  const slides = copy[locale];
  const folder = join(output, locale);
  await mkdir(folder, {recursive: true});
  const thumbs = [];
  // R81: intro, calendar, timeline, stats, entry, sharing, comments, theme.
  // Intro uses the native calendar texture but remains its own brand panel.
  const order = legacyCover
    ? gallerySelection.scenes.map(scene => {
      const sourceIndex = scenes[locale].indexOf(scene === 'intro' ? 'calendar' : scene);
      if (sourceIndex < 0) throw Error(`Missing native source scene: ${locale}/${scene}`);
      return sourceIndex;
    })
    : scenes[locale].map((_, index) => index);
  if (legacyCover) {
    await readFile(join(folder, '01-intro.png'));
    const expectedFiles = new Set(order.map((sourceIndex, index) =>
      `${String(index + 1).padStart(2, '0')}-${index === 0 ? 'intro' : scenes[locale][sourceIndex]}.png`,
    ));
    for (const file of await readdir(folder)) {
      if (/^\d{2}-(intro|calendar|timeline|stats|entry|sharing|comments|categories|theme)\.png$/.test(file) && !expectedFiles.has(file))
        await unlink(join(folder, file));
    }
  }
  for (const [index, sourceIndex] of order.entries()) {
    const [headline, subhead] = slides[sourceIndex];
    const sourceScene = scenes[locale][sourceIndex];
    const scene = legacyCover && index === 0 ? 'intro' : sourceScene;
    const source = join(sources, `${locale}-${sourceScene}.png`);
    const bytes = await readFile(source);
    const crop = cropConfig?.[locale]?.[sourceScene] ?? sourceCrop[locale] ?? {top: 0, bottom: 0};
    if (freshSources && cropConfig?.[locale]?.[sourceScene] === undefined) throw Error(`Missing inspected crop: ${locale}/${sourceScene}`);
    const file = `${String(index + 1).padStart(2, '0')}-${scene}.png`;
    const destination = join(folder, file);
    if (legacyCover && index === 0) {
      const cover = await optimizeStorePng(await readFile(destination));
      await writeFile(destination, cover);
      const info = await sharp(cover).metadata();
      if (info.width !== 1080 || info.height !== 1920 || info.hasAlpha || cover.length > 8 * 1024 * 1024) throw Error(`Invalid native 3D cover: ${locale}`);
      thumbs.push({input: await sharp(cover).resize(270, 480).png().toBuffer(), left: 16, top: 16});
      manifest.panels.push({locale, file, scene, headline: null, crop, renderer: 'Blender native screenshot texture', source: relative(output, source), sourceSha256: sha(bytes), sha256: sha(cover), bytes: cover.length});
      continue;
    }
    const {width: rawWidth, height: rawHeight} = await sharp(bytes).metadata();
    if (!rawWidth || !rawHeight || crop.top < 0 || crop.bottom < 0 || crop.top + crop.bottom >= rawHeight) throw Error(`Invalid source geometry: ${sourceScene}`);
    const screen = await sharp(bytes)
      .extract({
        left: 0,
        top: crop.top,
        width: rawWidth,
        height: rawHeight - crop.top - crop.bottom,
      })
      .resize(freshSources ? {width: 760, height: 1515, fit: 'inside'} : {width: 760})
      .png()
      .toBuffer();
    const screenWidth = (await sharp(screen).metadata()).width;
    const phoneWidth = freshSources ? screenWidth + 36 : 796;
    const phoneX = (1080 - phoneWidth) / 2;
    const screenX = Math.round((1080 - screenWidth) / 2);
    const background = index === 0 ? '#15CBA7' : '#424D6B';
    const titleColor = '#FFFFFF';
    const font = locale === 'ko-KR' ? 'Apple SD Gothic Neo' : 'Helvetica Neue';
    const headWeight = legacyCover ? 400 : 700;
    const headSize = await fitSize(headline, font, legacyCover ? 52 : locale === 'ko-KR' ? 66 : 56, headWeight);
    const subSize = await fitSize(subhead, font, legacyCover ? 28 : 32, 400);
    const body = `<svg width="1080" height="2240" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="2240" fill="${background}"/>
      <g font-family="${font}, sans-serif" text-anchor="middle" fill="${titleColor}">
        ${legacyCover ? '' : '<text x="540" y="96" font-size="32" font-weight="600" letter-spacing="1">BooKoo</text>'}
        <text x="540" y="${legacyCover ? 170 : 228}" font-size="${headSize}" font-weight="${headWeight}">${xml(headline)}</text>
        <text x="540" y="${legacyCover ? 244 : 300}" font-size="${subSize}" opacity=".86">${xml(subhead)}</text>
      </g>
      <rect x="${phoneX}" y="${legacyCover ? 351 : 417}" width="${phoneWidth}" height="1830" rx="72" fill="#283047" opacity=".18"/>
      <rect x="${phoneX}" y="${legacyCover ? 335 : 401}" width="${phoneWidth}" height="1830" rx="72" fill="#FFFFFF"/>
      <rect x="440" y="${legacyCover ? 354 : 420}" width="200" height="10" rx="5" fill="#E0E4E9"/>
    </svg>`;
    // Crop the complete composition at its edge, just like the supplied legacy
    // reference. Never paint over UI, replace labels, or stretch a screen.
    const canvas = await sharp(Buffer.from(body)).composite([{input: screen, left: screenX, top: legacyCover ? 386 : 452}]).png().toBuffer();
    await sharp(canvas).extract({left: 0, top: 0, width: 1080, height: 1920}).flatten({background}).removeAlpha().png(storePngOptions).toFile(destination);
    const rendered = await readFile(destination);
    const info = await sharp(rendered).metadata();
    if (info.width !== 1080 || info.height !== 1920 || info.hasAlpha || rendered.length > 8 * 1024 * 1024) throw Error(`Invalid Play panel: ${file}`);
    thumbs.push({input: await sharp(rendered).resize(270, 480).png().toBuffer(), left: (index % 4) * 286 + 16, top: Math.floor(index / 4) * 496 + 16});
    manifest.panels.push({locale, file, scene, headline, crop, source: relative(output, source), sourceSha256: sha(bytes), sha256: sha(rendered), bytes: rendered.length});
  }
  await sharp({create: {width: 1160, height: 1008, channels: 3, background: '#F3F5F8'}}).composite(thumbs).png().toFile(join(output, `${locale}-overview.png`));
}
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Verified ${manifest.panels.length} Play panels: 1080 × 1920, RGB, under 8 MB.`);
