import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_PREFIX = 'BK1';
export const INVITE_CODE_BYTES = 16;
export const INVITE_CODE_CHARS = 26;
export const INVITE_CODE_RE = /^BK1[0-9A-HJKMNP-TV-Z]{26}$/;

export function encodeInviteCode(bytes: Uint8Array): string {
  if (bytes.length !== INVITE_CODE_BYTES)
    throw new Error('Invite entropy must be 16 bytes');
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return `${INVITE_CODE_PREFIX}${output.slice(0, INVITE_CODE_CHARS)}`;
}

export function normalizeInviteCode(raw: string): string | null {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return INVITE_CODE_RE.test(normalized) ? normalized : null;
}

export function hashInviteCode(code: string, pepper: string): string {
  return bytesToHex(
    sha256(new TextEncoder().encode(`${pepper}:${code}`)),
  );
}

export function formatInviteCodeForDisplay(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized === null) return code;
  const body = normalized.slice(INVITE_CODE_PREFIX.length);
  return `${INVITE_CODE_PREFIX}-${body.match(/.{1,4}/g)?.join('-') ?? body}`;
}

export function inviteUrl(code: string, host = 'bookoo.hyo.dev'): string {
  return `https://${host}/invite/${formatInviteCodeForDisplay(code)}`;
}
