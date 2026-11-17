import {
  CURRENCIES,
  currencyChrome,
  currencyInfo,
  currencyNameKey,
  currencySymbolFallback,
  DEFAULT_EXPONENT,
  exponentOf,
  intlCaps,
  isKnownCurrency,
  isSupportedCurrency,
  LEGACY_CURRENCY_ALIASES,
  LEGACY_ONLY_CURRENCIES,
  normalizeCurrencyCode,
  resetCurrencyChromeCache,
  scaleOf,
  SUPPORTED_CURRENCIES,
  supportedCurrenciesByRegion,
} from '@shared/currency';

/**
 * Every currency the legacy `LedgerSettingCurrency.tsx` offered (note 04 §5).
 * A legacy ledger carrying any of these must still resolve after the import —
 * either directly or through the alias table.
 */
const LEGACY_PICKER_CODES = [
  'ARS',
  'AMD',
  'BAM',
  'BGN',
  'BRN',
  'BOB',
  'BRL',
  'BYN',
  'BZD',
  'CAD',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CZK',
  'DOP',
  'EGP',
  'EUR',
  'GRD',
  'GTQ',
  'HNL',
  'HKD',
  'HRK',
  'HUF',
  'IDR',
  'IND',
  'ISK',
  'ITL',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NPR',
  'PHP',
  'RUB',
  'RON',
  'SEK',
  'SOS',
  'SYP',
  'SVC',
  'TWD',
  'TRY',
  'UZS',
  'USD',
  'VND',
  'ZAR',
];

describe('exponentOf', () => {
  it('answers 0 for the no-minor-unit currencies', () => {
    expect(exponentOf('KRW')).toBe(0);
    expect(exponentOf('JPY')).toBe(0);
    expect(exponentOf('VND')).toBe(0);
    expect(exponentOf('CLP')).toBe(0);
    expect(exponentOf('ISK')).toBe(0);
  });

  it('answers 3 for the dinar/rial family', () => {
    expect(exponentOf('BHD')).toBe(3);
    expect(exponentOf('KWD')).toBe(3);
    expect(exponentOf('OMR')).toBe(3);
    expect(exponentOf('JOD')).toBe(3);
    expect(exponentOf('TND')).toBe(3);
  });

  it('answers 4 for the fund/index units so they cannot silently round', () => {
    expect(exponentOf('CLF')).toBe(4);
    expect(exponentOf('UYW')).toBe(4);
  });

  it('defaults to 2 and is total over every string', () => {
    expect(exponentOf('USD')).toBe(DEFAULT_EXPONENT);
    expect(exponentOf('EUR')).toBe(2);
    // MGA/MRU are nominally 1/5 units; ISO assigns 2 and so do we.
    expect(exponentOf('MGA')).toBe(2);
    expect(exponentOf('MRU')).toBe(2);
    // HUF/TWD transact in whole units but that is a DISPLAY preference.
    expect(exponentOf('HUF')).toBe(2);
    expect(exponentOf('TWD')).toBe(2);
    expect(exponentOf('')).toBe(2);
    expect(exponentOf('NOT_A_CODE')).toBe(2);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(exponentOf('krw')).toBe(0);
    expect(exponentOf('  bhd  ')).toBe(3);
  });
});

describe('scaleOf', () => {
  it('is 10 ** exponent', () => {
    expect(scaleOf('KRW')).toBe(1);
    expect(scaleOf('USD')).toBe(100);
    expect(scaleOf('BHD')).toBe(1000);
    expect(scaleOf('CLF')).toBe(10000);
  });
});

describe('normalizeCurrencyCode', () => {
  it('remaps every dead legacy code', () => {
    expect(normalizeCurrencyCode('IND')).toBe('INR');
    expect(normalizeCurrencyCode('BRN')).toBe('BND');
    expect(normalizeCurrencyCode('GRD')).toBe('EUR');
    expect(normalizeCurrencyCode('ITL')).toBe('EUR');
    expect(normalizeCurrencyCode('HRK')).toBe('EUR');
    expect(normalizeCurrencyCode('SVC')).toBe('USD');
  });

  it('every alias target is itself a known currency', () => {
    for (const target of Object.values(LEGACY_CURRENCY_ALIASES)) {
      expect(isKnownCurrency(target)).toBe(true);
    }
  });
});

describe('the currency table', () => {
  it('has no duplicate codes', () => {
    const codes = CURRENCIES.map((info) => info.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('marks exactly the SUPPORTED_CURRENCIES as supported', () => {
    const supported = CURRENCIES.filter((info) => info.supported).map(
      (info) => info.code,
    );

    expect(supported).toEqual([...SUPPORTED_CURRENCIES]);
  });

  it('carries a non-empty symbol and a namespaced i18n key for every code', () => {
    for (const info of CURRENCIES) {
      expect(info.symbol.length).toBeGreaterThan(0);
      expect(info.nameKey).toBe(`currency.${info.code}`);
      expect(currencyNameKey(info.code)).toBe(info.nameKey);
      expect(currencySymbolFallback(info.code)).toBe(info.symbol);
    }
  });

  it('agrees with exponentOf on every row', () => {
    for (const info of CURRENCIES) {
      expect(info.exponent).toBe(exponentOf(info.code));
    }
  });

  it('does not carry the legacy table s wrong symbols', () => {
    // Legacy shipped EUR -> '$' and ZAR -> the literal string 'VND'.
    expect(currencySymbolFallback('EUR')).toBe('€');
    expect(currencySymbolFallback('ZAR')).toBe('R');
    expect(currencySymbolFallback('VND')).toBe('₫');
  });

  it('covers every currency the legacy picker offered', () => {
    for (const code of LEGACY_PICKER_CODES) {
      expect(isKnownCurrency(code)).toBe(true);
    }
  });

  it('exercises the exponent-3 path through real product surface', () => {
    for (const code of ['KWD', 'BHD', 'OMR', 'JOD']) {
      expect(isSupportedCurrency(code)).toBe(true);
      expect(exponentOf(code)).toBe(3);
    }
  });

  it('offers circulating ISO codes in the picker, including former exclusions', () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(140);
    expect(LEGACY_ONLY_CURRENCIES).toEqual([]);
    for (const code of [
      'AMD',
      'BAM',
      'BGN',
      'BND',
      'BOB',
      'TND',
      'KES',
      'GHS',
      'AFN',
    ] as const) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it('answers undefined for an unknown code rather than throwing', () => {
    expect(currencyInfo('XXX')).toBeUndefined();
    expect(isKnownCurrency('XXX')).toBe(false);
    expect(isSupportedCurrency('XXX')).toBe(false);
    expect(currencyNameKey('XXX')).toBe('currency.XXX');
    expect(currencySymbolFallback('XXX')).toBe('XXX');
  });

  it('groups the picker by region without losing a row', () => {
    const grouped = supportedCurrenciesByRegion();
    const total = Array.from(grouped.values()).reduce(
      (acc, bucket) => acc + bucket.length,
      0,
    );

    expect(total).toBe(SUPPORTED_CURRENCIES.length);
  });
});

describe('intlCaps', () => {
  it('reports a usable NumberFormat and timeZone on this runtime', () => {
    const caps = intlCaps();

    expect(caps.numberFormat).toBe(true);
    expect(caps.timeZone).toBe(true);
  });

  it('is memoized', () => {
    expect(intlCaps()).toBe(intlCaps());
  });
});

describe('currencyChrome', () => {
  beforeEach(() => {
    resetCurrencyChromeCache();
  });

  it('derives ko-KR / KRW', () => {
    const chrome = currencyChrome('ko-KR', 'KRW');

    expect(chrome.symbol).toBe('₩');
    expect(chrome.symbolBefore).toBe(true);
    expect(chrome.group).toBe(',');
    expect(chrome.minusBefore).toBe(true);
  });

  it('derives en-US / USD', () => {
    const chrome = currencyChrome('en-US', 'USD');

    expect(chrome.symbol).toBe('$');
    expect(chrome.symbolBefore).toBe(true);
    expect(chrome.group).toBe(',');
    expect(chrome.decimal).toBe('.');
  });

  it('derives de-DE / EUR with the symbol AFTER the number', () => {
    const chrome = currencyChrome('de-DE', 'EUR');

    expect(chrome.symbol).toBe('€');
    expect(chrome.symbolBefore).toBe(false);
    expect(chrome.symbolSpaced).toBe(true);
    expect(chrome.group).toBe('.');
    expect(chrome.decimal).toBe(',');
  });

  it('memoizes per (locale, currency)', () => {
    const first = currencyChrome('en-US', 'USD');

    expect(currencyChrome('en-US', 'USD')).toBe(first);
    expect(currencyChrome('ko-KR', 'USD')).not.toBe(first);
  });

  it('normalizes a legacy code before asking Intl', () => {
    // 'IND' would make Intl throw a RangeError; the alias saves it.
    expect(currencyChrome('en-US', 'IND')).toEqual(
      currencyChrome('en-US', 'INR'),
    );
  });

  it('falls back to the offline symbol for an unknown code', () => {
    const chrome = currencyChrome('en-US', 'ZZZ');

    expect(chrome.symbol).toBe('ZZZ');
    expect(chrome.group).toBe(',');
    expect(chrome.decimal).toBe('.');
  });
});

/**
 * REGRESSION (adversarial review): `currencyChrome` used to read `group` and
 * `decimal` off the CURRENCY-styled formatter with a 4-digit sentinel. Two
 * whole classes of locale came out wrong, and both produced visibly corrupt
 * money on screen.
 */
describe('currencyChrome separators come from the locale, not the currency', () => {
  beforeEach(() => {
    resetCurrencyChromeCache();
  });

  /** The locale's true separators, straight from a plain number format. */
  const truthFor = (locale: string): {group?: string; decimal?: string} => {
    const parts = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(-11234.56);

    return {
      group: parts.find((part) => part.type === 'group')?.value,
      decimal: parts.find((part) => part.type === 'decimal')?.value,
    };
  };

  const LOCALES = [
    'en-US',
    'ko',
    'ja-JP',
    'zh-CN',
    'id-ID',
    'de-DE',
    'de-CH',
    'fr-FR',
    'ru-RU',
    'ar-EG',
    // `minimumGroupingDigits: 2` — these do NOT group a 4-digit number, so the
    // old sentinel produced no `group` part and fell back to ',' — which in
    // every one of them IS the decimal separator, giving '-1,234,56'.
    'es-ES',
    'it-IT',
    'pt-PT',
    'pl-PL',
    'hu-HU',
    'lv-LV',
    'et-EE',
    'bg-BG',
  ] as const;

  it('never lets the group separator equal the decimal separator', () => {
    for (const locale of LOCALES) {
      const chrome = currencyChrome(locale, 'USD');

      expect({locale, same: chrome.group === chrome.decimal}).toEqual({
        locale,
        same: false,
      });
    }
  });

  it('matches the locale plain-number separators for a 2-decimal currency', () => {
    for (const locale of LOCALES) {
      const truth = truthFor(locale);
      const chrome = currencyChrome(locale, 'USD');

      expect({locale, group: chrome.group, decimal: chrome.decimal}).toEqual({
        locale,
        group: truth.group ?? chrome.group,
        decimal: truth.decimal ?? chrome.decimal,
      });
    }
  });

  it('knows the decimal separator of a 0-decimal currency too', () => {
    // KRW/JPY never render a fraction, so the currency formatter can never
    // teach us the locale's decimal separator. `parseMoneyInput` needs it.
    for (const locale of ['de-DE', 'fr-FR', 'id-ID', 'ru-RU'] as const) {
      const truth = truthFor(locale);

      for (const currency of ['KRW', 'JPY', 'VND'] as const) {
        expect({
          locale,
          currency,
          decimal: currencyChrome(locale, currency).decimal,
        }).toEqual({locale, currency, decimal: truth.decimal});
      }
    }
  });

  it('puts the minus AFTER the symbol where the locale does', () => {
    // de-CH renders `CHF-1'234.56`, not `-CHF1'234.56`.
    expect(currencyChrome('de-CH', 'CHF').minusBefore).toBe(false);
    expect(currencyChrome('nl-NL', 'USD').minusBefore).toBe(false);
    expect(currencyChrome('en-US', 'USD').minusBefore).toBe(true);
    expect(currencyChrome('ko-KR', 'KRW').minusBefore).toBe(true);
  });
});
