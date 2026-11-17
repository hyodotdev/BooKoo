import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

const encoder = new TextEncoder();

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

export const requestHash = (operation: string, args: unknown): string =>
  bytesToHex(
    sha256(
      encoder.encode(
        JSON.stringify({operation, schemaVersion: 1, args: canonicalize(args)}),
      ),
    ),
  );
