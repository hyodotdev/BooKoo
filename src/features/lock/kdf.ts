import {scrypt} from '@noble/hashes/scrypt.js';

export const SCRYPT_PARAMS = {N: 8192, r: 8, p: 1, dkLen: 32} as const;

export async function derivePinVerifier(
  pin: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must contain six digits');
  return scrypt(new TextEncoder().encode(pin), salt, SCRYPT_PARAMS);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
