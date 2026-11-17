import {normalizeIpCountryCode} from '../../shared/ipCountry';
it('keeps a country code separate from language, device locale or raw network data', () => {
  expect(normalizeIpCountryCode(' vn ')).toBe('VN');
  expect(normalizeIpCountryCode('KR')).toBe('KR');
  for (const value of [
    null,
    undefined,
    '',
    'ZZ',
    'AA',
    'UK',
    'XX',
    'T1',
    'en-US',
    '203.0.113.1',
    'US,KR',
    {},
    123,
  ])
    expect(normalizeIpCountryCode(value)).toBeUndefined();
});
