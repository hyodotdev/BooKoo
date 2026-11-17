const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const csvCell = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export function toRfc4180Csv(json: string): string {
  const parsed: unknown = JSON.parse(json);
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const rows = values.filter(isObject);
  const keys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row))),
  ).sort();
  if (keys.length === 0) return '';
  return [
    keys.map(csvCell).join(','),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(',')),
  ].join('\r\n').concat('\r\n');
}

const set16 = (view: DataView, offset: number, value: number): void =>
  view.setUint16(offset, value, true);
const set32 = (view: DataView, offset: number, value: number): void =>
  view.setUint32(offset, value, true);

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipSingleStoredFile(
  fileName: string,
  bytes: Uint8Array,
): Uint8Array {
  const name = new TextEncoder().encode(fileName);
  if (name.byteLength === 0 || name.byteLength > 0xffff)
    throw new Error('Invalid ZIP file name');
  const localSize = 30 + name.byteLength + bytes.byteLength;
  const centralSize = 46 + name.byteLength;
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  const checksum = crc32(bytes);
  const utf8Flag = 0x0800;
  const dosDate = 33;

  set32(view, 0, 0x04034b50);
  set16(view, 4, 20);
  set16(view, 6, utf8Flag);
  set16(view, 8, 0);
  set16(view, 10, 0);
  set16(view, 12, dosDate);
  set32(view, 14, checksum);
  set32(view, 18, bytes.byteLength);
  set32(view, 22, bytes.byteLength);
  set16(view, 26, name.byteLength);
  set16(view, 28, 0);
  output.set(name, 30);
  output.set(bytes, 30 + name.byteLength);

  const central = localSize;
  set32(view, central, 0x02014b50);
  set16(view, central + 4, 20);
  set16(view, central + 6, 20);
  set16(view, central + 8, utf8Flag);
  set16(view, central + 10, 0);
  set16(view, central + 12, 0);
  set16(view, central + 14, dosDate);
  set32(view, central + 16, checksum);
  set32(view, central + 20, bytes.byteLength);
  set32(view, central + 24, bytes.byteLength);
  set16(view, central + 28, name.byteLength);
  set16(view, central + 30, 0);
  set16(view, central + 32, 0);
  set16(view, central + 34, 0);
  set16(view, central + 36, 0);
  set32(view, central + 38, 0);
  set32(view, central + 42, 0);
  output.set(name, central + 46);

  const end = central + centralSize;
  set32(view, end, 0x06054b50);
  set16(view, end + 4, 0);
  set16(view, end + 6, 0);
  set16(view, end + 8, 1);
  set16(view, end + 10, 1);
  set32(view, end + 12, centralSize);
  set32(view, end + 16, central);
  set16(view, end + 20, 0);
  return output;
}
