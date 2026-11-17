import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const source = path.join(projectRoot, 'assets', 'icon.png');
const destination = path.join(
  projectRoot,
  'assets',
  'adaptive-icon-foreground.png',
);

const {data, info} = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({resolveWithObject: true});

// The legacy artwork is a white BooKoo mark over a gradient whose red channel
// is a constant 29. Recovering alpha from that channel preserves the original
// antialiased mark without carrying the square background into Android masks.
for (let offset = 0; offset < data.length; offset += info.channels) {
  const alpha = Math.round(
    Math.max(0, Math.min(1, (data[offset] - 29) / (255 - 29))) * 255,
  );
  data[offset] = 255;
  data[offset + 1] = 255;
  data[offset + 2] = 255;
  data[offset + 3] = alpha;
}

await sharp(data, {
  raw: {width: info.width, height: info.height, channels: info.channels},
})
  .png()
  .toFile(destination);
