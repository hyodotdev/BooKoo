import sharp from 'sharp';

// Keep the store's PNG format and exact pixels; never quantize native UI.
export const storePngOptions = {
  compressionLevel: 9,
  adaptiveFiltering: true,
  palette: false,
};

export async function optimizeStorePng(bytes) {
  const optimized = await sharp(bytes).png(storePngOptions).toBuffer();
  return optimized.length < bytes.length ? optimized : bytes;
}

export const escapeXml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

export async function captionWidth(text, font, size, weight) {
  const svg = `<svg width="6000" height="300" xmlns="http://www.w3.org/2000/svg"><text x="0" y="200" font-family="${font}, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(text)}</text></svg>`;
  const {info} = await sharp(Buffer.from(svg))
    .png()
    .trim({threshold: 1})
    .toBuffer({resolveWithObject: true});
  return info.width;
}

export async function fitCaption(text, {font, startSize, weight, maxWidth}) {
  const floor = Math.round(startSize * 0.6);
  for (let size = startSize; size >= floor; size -= 2) {
    if ((await captionWidth(text, font, size, weight)) <= maxWidth) return size;
  }
  throw Error(`Caption exceeds ${maxWidth}px at ${floor}px: ${text}`);
}
