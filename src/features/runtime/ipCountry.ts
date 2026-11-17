import {IP_COUNTRY_LOOKUP_URL, normalizeIpCountryCode} from '@shared/ipCountry';

const TIMEOUT_MS = 1500;

/** Optional lookup must never delay or prevent the ordinary presence write. */
export async function readIpCountryCode(
  signal: AbortSignal,
): Promise<string | undefined> {
  if (signal.aborted) return undefined;
  const controller = new AbortController();
  let endBudget: (value: undefined) => void = () => undefined;
  const budget = new Promise<undefined>((resolve) => {
    endBudget = resolve;
  });
  const abort = (): void => {
    controller.abort();
    endBudget(undefined);
  };
  const timer = setTimeout(abort, TIMEOUT_MS);
  signal.addEventListener('abort', abort, {once: true});
  try {
    return await Promise.race([
      fetch(IP_COUNTRY_LOOKUP_URL, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {Accept: 'application/json'},
      })
        .then(async (response): Promise<string | undefined> => {
          if (!response.ok) return undefined;
          const body: unknown = await response.json();
          return typeof body === 'object' &&
            body !== null &&
            'countryCode' in body
            ? normalizeIpCountryCode(body.countryCode)
            : undefined;
        })
        .catch(() => undefined),
      budget,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
