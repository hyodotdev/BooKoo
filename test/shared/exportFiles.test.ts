import {
  crc32,
  toRfc4180Csv,
  zipSingleStoredFile,
} from '@shared/exportFiles';

describe('portable export files', () => {
  it('writes deterministic RFC-4180 CSV with CRLF and escaped quotes', () => {
    const csv = toRfc4180Csv(
      JSON.stringify([
        {memo: 'coffee, "large"', amountMinor: 500},
        {memo: 'line\nbreak', amountMinor: -100},
      ]),
    );
    expect(csv).toBe(
      '"amountMinor","memo"\r\n' +
        '"500","coffee, ""large"""\r\n' +
        '"-100","line\nbreak"\r\n',
    );
  });

  it('uses the standard CRC-32 value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('creates a deterministic single-file ZIP container', () => {
    const bytes = new TextEncoder().encode('receipt');
    const first = zipSingleStoredFile('photos/receipt.jpg', bytes);
    const second = zipSingleStoredFile('photos/receipt.jpg', bytes);
    const view = new DataView(first.buffer);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(first.byteLength - 22, true)).toBe(0x06054b50);
  });
});
