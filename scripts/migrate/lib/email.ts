/**
 * Normalize an address for identity lookups without changing its mailbox
 * semantics. In particular, Gmail dots and plus tags remain significant.
 */
export function normalizeEmail(
  raw: string | null | undefined,
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  const separator = normalized.indexOf('@');
  if (
    separator <= 0 ||
    separator === normalized.length - 1 ||
    normalized.indexOf('@', separator + 1) !== -1 ||
    /\s/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}
