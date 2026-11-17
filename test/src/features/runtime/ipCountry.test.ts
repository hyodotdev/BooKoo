import {readIpCountryCode} from '~/features/runtime/ipCountry';
import {IP_COUNTRY_LOOKUP_URL} from '@shared/ipCountry';
const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});
it('requests only the fixed endpoint without account data, cookies or query values', async () => {
  const fetcher = jest.fn(async () =>
    Response.json({countryCode: 'VN', ignored: 'never propagated'}),
  );
  global.fetch = fetcher;
  const controller = new AbortController();
  expect(await readIpCountryCode(controller.signal)).toBe('VN');
  expect(fetcher).toHaveBeenCalledWith(
    IP_COUNTRY_LOOKUP_URL,
    expect.objectContaining({
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {Accept: 'application/json'},
    }),
  );
});
it('uses unknown for HTTP errors, malformed payloads and request failures', async () => {
  for (const response of [
    new Response('', {status: 503}),
    Response.json({countryCode: 'ZZ'}),
    Response.json({ip: '203.0.113.1'}),
  ]) {
    global.fetch = jest.fn(async () => response);
    expect(
      await readIpCountryCode(new AbortController().signal),
    ).toBeUndefined();
  }
  global.fetch = jest.fn(async () => {
    throw Error('network');
  });
  expect(await readIpCountryCode(new AbortController().signal)).toBeUndefined();
});
it('finishes within the budget even if a broken transport ignores abort', async () => {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  const pending = readIpCountryCode(new AbortController().signal);
  await jest.advanceTimersByTimeAsync(1500);
  expect(await pending).toBeUndefined();
});
it('cancels on background/withdrawal and never starts an already-cancelled request', async () => {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  const controller = new AbortController();
  const pending = readIpCountryCode(controller.signal);
  controller.abort();
  expect(await pending).toBeUndefined();
  jest.mocked(global.fetch).mockClear();
  expect(await readIpCountryCode(controller.signal)).toBeUndefined();
  expect(global.fetch).not.toHaveBeenCalled();
});
