const PUSH_CHARS =
  '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

export function pushIdToMillis(key: string): number | undefined {
  if (key.length < 8) return undefined;
  let milliseconds = 0;
  for (let index = 0; index < 8; index += 1) {
    const digit = PUSH_CHARS.indexOf(key[index] ?? '');
    if (digit < 0) return undefined;
    milliseconds = milliseconds * 64 + digit;
  }
  return milliseconds >= 946_684_800_000 && milliseconds <= 4_102_444_800_000
    ? milliseconds
    : undefined;
}

export const isPushId = (key: string): boolean =>
  /^-[A-Za-z0-9_-]{19}$/.test(key);

export const decodeLegacyKey = (key: string): string => decodeURIComponent(key);

export const encodeLegacyEmail = (email: string): string =>
  encodeURIComponent(email).replace(/\./g, '%2E');
