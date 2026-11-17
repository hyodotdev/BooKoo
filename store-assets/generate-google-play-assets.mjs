import {Buffer} from 'node:buffer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const storeAssetsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(storeAssetsDir);
// Play shows the default locale's graphic to every listing that has none of its
// own, so a Korean feature graphic was the first thing an English visitor saw.
// Run with a locale: node store-assets/generate-google-play-assets.mjs en
const TAGLINES = {
  ko: {
    head: '함께 쓰는 돈, 함께 보는 기록',
    sub: '팀·모임·여행·가족의 공동 경비를 함께',
    font: 'Apple SD Gothic Neo, Pretendard, sans-serif',
    headSize: 38,
    subSize: 20,
  },
  en: {
    head: 'Shared money, shared record',
    sub: 'For a team, a club, a trip or a household',
    font: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    headSize: 38,
    subSize: 19,
  },
  ja: {
    head: 'みんなのお金を、みんなの記録に',
    sub: 'チーム・サークル・旅行・家族の共同経費',
    font: 'Hiragino Sans, Hiragino Kaku Gothic ProN, sans-serif',
    headSize: 34,
    subSize: 18,
  },
  zh: {
    head: '一起花的钱，一起看的记录',
    sub: '团队、社团、旅行、家人的共同开支',
    font: 'PingFang SC, Heiti SC, sans-serif',
    headSize: 36,
    subSize: 19,
  },
  id: {
    head: 'Uang bersama, catatan bersama',
    sub: 'Untuk tim, komunitas, perjalanan, dan keluarga',
    font: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    headSize: 36,
    subSize: 17,
  },
};
const locale = process.argv[2] ?? 'ko';
const copy = TAGLINES[locale];
if (copy === undefined)
  throw new Error(`Unknown locale ${locale}; expected one of ${Object.keys(TAGLINES).join(', ')}`);

const outputDir = path.join(
  storeAssetsDir,
  '1.0.0',
  locale,
  'google-play',
);

await mkdir(outputDir, {recursive: true});

const appIcon = path.join(projectRoot, 'assets', 'icon.png');
const wordmark = path.join(projectRoot, 'assets', 'brand', 'logo@3x.png');

await sharp(appIcon)
  .resize(512, 512)
  .png({compressionLevel: 9})
  .toFile(path.join(outputDir, 'icon-512.png'));

const roundedIcon = await sharp(appIcon)
  .resize(230, 230)
  .composite([
    {
      blend: 'dest-in',
      input: Buffer.from(
        '<svg width="230" height="230"><rect width="230" height="230" rx="52" fill="white"/></svg>',
      ),
    },
  ])
  .png()
  .toBuffer();

const resizedWordmark = await sharp(wordmark)
  .resize({width: 430})
  .png()
  .toBuffer();

const background = Buffer.from(`
  <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0B1733"/>
        <stop offset="1" stop-color="#24395F"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#20D8B0" stop-opacity="0.40"/>
        <stop offset="1" stop-color="#20D8B0" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#background)"/>
    <circle cx="902" cy="72" r="260" fill="url(#accent)"/>
    <circle cx="46" cy="480" r="190" fill="#20D8B0" opacity="0.10"/>
    <circle cx="294" cy="68" r="6" fill="#20D8B0" opacity="0.75"/>
    <circle cx="862" cy="416" r="9" fill="#20D8B0" opacity="0.55"/>
  </svg>
`);

// The tagline is left-anchored at x=404 on a 1024-wide canvas, so this is the
// whole width it can occupy minus a right margin. It was 520 until the
// Indonesian headline rendered 541px wide and lost its final letter — a clip
// that is invisible in the file name, the byte count and the dimensions, and
// only shows up by reading the picture. Measure the ink and refuse to write a
// graphic whose text does not fit.
const TAGLINE_WIDTH = 596;
const taglineBody = (width) => `
  <svg width="${width}" height="90" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="44" fill="#FFFFFF" font-family="${copy.font}" font-size="${copy.headSize}" font-weight="600">${copy.head}</text>
    <text x="0" y="76" fill="#C7D3E7" font-family="${copy.font}" font-size="${copy.subSize}">${copy.sub}</text>
  </svg>
`;
const {info: inkInfo} = await sharp(Buffer.from(taglineBody(TAGLINE_WIDTH * 3)))
  .png()
  .trim({threshold: 1})
  .toBuffer({resolveWithObject: true});
if (inkInfo.width > TAGLINE_WIDTH)
  throw new Error(
    `${locale} tagline renders ${inkInfo.width}px wide and would be clipped at ${TAGLINE_WIDTH}px; shorten the copy or lower headSize/subSize`,
  );
const tagline = Buffer.from(taglineBody(TAGLINE_WIDTH));

const featureGraphic = await sharp(background)
  .composite([
    {input: roundedIcon, left: 94, top: 135},
    {input: resizedWordmark, left: 402, top: 118},
    {input: tagline, left: 404, top: 260},
  ])
  .png({compressionLevel: 9})
  .toBuffer();

await sharp(featureGraphic)
  .toFile(path.join(outputDir, 'feature-graphic-1024x500.png'));

// Play Console's asset library crops from a source image and currently rejects
// an exact-size 1024×500 upload as "too small". Keep a 2× source for that
// chooser while retaining the exact final-size reference above.
await sharp(featureGraphic)
  .resize(2048, 1000)
  .png({compressionLevel: 9})
  .toFile(path.join(outputDir, 'feature-graphic-upload-2048x1000.png'));
