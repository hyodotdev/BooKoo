export const APPLE_APP_CALLBACK = 'bookoo://apple-callback';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Apple supplies this JSON only on the first web authorization. */
export function parseAppleWebName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    const root = asRecord(JSON.parse(raw));
    const name = asRecord(root?.name);
    const joined = [
      optionalString(name?.lastName),
      optionalString(name?.firstName),
    ].filter((part): part is string => part !== undefined);
    return joined.length === 0 ? undefined : joined.join('');
  } catch {
    return undefined;
  }
}

export function appleAppRedirectLocation(posted: URLSearchParams): string {
  const forwarded = new URLSearchParams();
  for (const key of ['id_token', 'code', 'state', 'user', 'error']) {
    const value = posted.get(key);
    if (value !== null && value.length > 0) forwarded.set(key, value);
  }
  const payload = forwarded.toString();
  return `${APPLE_APP_CALLBACK}?${payload}#${payload}`;
}

export function isAppleCallbackUrl(url: string): boolean {
  return (
    url.startsWith(APPLE_APP_CALLBACK) ||
    /(?:^|[/:])apple-callback(?:[/?#]|$)/.test(url)
  );
}

export function parseAppleCallbackParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    const hashed = new URLSearchParams(url.slice(hashIndex + 1));
    if (
      hashed.get('id_token') !== null ||
      hashed.get('code') !== null ||
      hashed.get('error') !== null ||
      hashed.get('state') !== null
    )
      return hashed;
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return new URLSearchParams();
  return new URLSearchParams(
    url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined),
  );
}
