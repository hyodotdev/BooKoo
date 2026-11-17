import countryApi from '../../scripts/public-site/country-api';
const previous = process.env.VERCEL;
afterEach(() => {
  if (previous === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previous;
});
it('returns only the edge country and prevents every shared cache', async () => {
  process.env.VERCEL = '1';
  const response = countryApi.fetch(
    new Request('https://example.invalid/api/activity-country', {
      headers: {
        'x-vercel-ip-country': 'VN',
        'x-real-ip': '203.0.113.1',
        'x-vercel-ip-city': 'SyntheticCity',
        cookie: 'synthetic-only',
      },
    }),
  );
  expect(await response.json()).toEqual({countryCode: 'VN'});
  for (const header of [
    'cache-control',
    'cdn-cache-control',
    'vercel-cdn-cache-control',
  ])
    expect(response.headers.get(header)).toContain('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
it('does not infer a country outside Vercel or from language/city/IP fallback', async () => {
  delete process.env.VERCEL;
  expect(
    await countryApi
      .fetch(
        new Request('https://example.invalid', {
          headers: {'x-vercel-ip-country': 'VN'},
        }),
      )
      .json(),
  ).toEqual({countryCode: null});
  process.env.VERCEL = '1';
  expect(
    await countryApi
      .fetch(
        new Request('https://example.invalid', {
          headers: {'Accept-Language': 'vi-VN', 'x-real-ip': '203.0.113.1'},
        }),
      )
      .json(),
  ).toEqual({countryCode: null});
});
it('rejects non-GET requests without reading or echoing their content', async () => {
  process.env.VERCEL = '1';
  const response = countryApi.fetch(
    new Request('https://example.invalid', {
      method: 'POST',
      body: 'synthetic-private-input',
    }),
  );
  expect(response.status).toBe(405);
  expect(await response.json()).toEqual({countryCode: null});
});
