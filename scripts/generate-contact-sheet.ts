import {readdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [
  inputArgument,
  outputArgument,
  columnsArgument = '4',
  startArgument = '0',
  countArgument,
] = process.argv.slice(2);

if (inputArgument === undefined || outputArgument === undefined) {
  throw new Error(
    'usage: generate-contact-sheet.ts <input-directory> <output.png> [columns] [start] [count]',
  );
}

const inputDirectory = path.resolve(inputArgument);
const outputFile = path.resolve(outputArgument);
const columns = Number(columnsArgument);
const start = Number(startArgument);
const count = countArgument === undefined ? undefined : Number(countArgument);

if (!Number.isInteger(columns) || columns < 1 || columns > 8) {
  throw new Error('columns must be an integer between 1 and 8');
}
if (!Number.isInteger(start) || start < 0) {
  throw new Error('start must be a non-negative integer');
}
if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
  throw new Error('count must be a positive integer');
}

const allFiles = (await readdir(inputDirectory, {withFileTypes: true}))
  .filter(
    (entry) => entry.isFile() && /^\d{3}-.+\.png$/u.test(entry.name),
  )
  .map((entry) => entry.name)
  .sort((left, right) =>
    left.localeCompare(right, undefined, {numeric: true, sensitivity: 'base'}),
  );
const files = allFiles.slice(
  start,
  count === undefined ? undefined : start + count,
);

if (files.length === 0) throw new Error('no PNG screenshots found');

const tileWidth = 270;
const imageHeight = 606;
const labelHeight = 42;
const gap = 10;
const margin = 14;
const rows = Math.ceil(files.length / columns);
const sheetWidth = margin * 2 + columns * tileWidth + (columns - 1) * gap;
const sheetHeight =
  margin * 2 + rows * (imageHeight + labelHeight) + (rows - 1) * gap;

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const tiles = await Promise.all(
  files.map(async (file) => {
    const screenshot = await sharp(path.join(inputDirectory, file))
      .resize({
        background: '#e7ebf3',
        fit: 'contain',
        height: imageHeight,
        width: tileWidth,
      })
      .png()
      .toBuffer();
    const caption = Buffer.from(`
      <svg width="${tileWidth}" height="${labelHeight}">
        <rect width="100%" height="100%" fill="#172138" />
        <text x="10" y="27" fill="#ffffff" font-family="Arial, sans-serif"
          font-size="15">${escapeXml(file)}</text>
      </svg>
    `);

    return sharp({
      create: {
        background: '#e7ebf3',
        channels: 4,
        height: imageHeight + labelHeight,
        width: tileWidth,
      },
    })
      .composite([
        {input: screenshot, left: 0, top: 0},
        {input: caption, left: 0, top: imageHeight},
      ])
      .png()
      .toBuffer();
  }),
);

await sharp({
  create: {
    background: '#cfd6e3',
    channels: 4,
    height: sheetHeight,
    width: sheetWidth,
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: margin + (index % columns) * (tileWidth + gap),
      top:
        margin +
        Math.floor(index / columns) * (imageHeight + labelHeight + gap),
    })),
  )
  .png()
  .toFile(outputFile);

process.stdout.write(`generated ${files.length} screenshots: ${outputFile}\n`);
