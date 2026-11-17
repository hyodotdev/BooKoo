import {createHash} from 'node:crypto';

/** Deterministic JSON used for source checksums and replay-safe output. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`);
  return `{${entries.join(',')}}`;
}

export const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export const stableHash8 = (value: string): string => sha256(value).slice(0, 8);
