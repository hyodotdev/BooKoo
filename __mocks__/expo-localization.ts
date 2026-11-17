/**
 * Manual mock for `expo-localization`.
 *
 * `src/STRINGS.ts` resolves the device locale at *import* time
 * (`i18n.locale = getLocales()[0]?.languageTag`), so without a fixed answer
 * here every string assertion in the suite depends on the machine's system
 * settings. `test/testSetup.ts` delegates to this file so there is exactly one
 * definition of the fake device locale.
 *
 * Note the timezone matches `process.env.TZ` in `jest.config.ts` — BooKoo
 * buckets a ledger by calendar day, and a mismatch between the two would make
 * day-boundary tests fail in a way that looks like a bug in the code.
 */
export const locale = 'en-US';
export const locales = ['en-US'];
export const timezone = 'Asia/Seoul';
export const isoCurrencyCodes = ['KRW', 'USD'];
export const region = 'KR';
export const currency = 'KRW';
export const isRTL = false;
export const decimalSeparator = '.';
export const digitGroupingSeparator = ',';

export const getLocales = () => [
  {
    languageTag: 'en-US',
    languageCode: 'en',
    regionCode: 'US',
    scriptCode: 'Latn',
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    textDirection: 'ltr' as const,
    measurementSystem: 'metric' as const,
    temperatureUnit: 'celsius' as const,
    langageCurrencyCode: 'USD',
    langageCurrencySymbol: '$',
  },
];

export const getCalendars = () => [
  {
    calendar: 'gregory' as const,
    timeZone: 'Asia/Seoul',
    uses24hourClock: true,
    firstWeekday: 1,
  },
];
