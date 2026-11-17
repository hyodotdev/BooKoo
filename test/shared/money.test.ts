import {SUPPORTED_CURRENCIES} from '@shared/currency';
import {
  absMoney,
  addMoney,
  applyKeypadOp,
  assertValidAmount,
  convertMinor,
  convertMinorSafe,
  convertMoney,
  entryCashFlowMinor,
  formatInteger,
  formatMoney,
  formatPercent,
  fromMajorUnits,
  isValidAmountMinor,
  keypadBackspace,
  keypadClear,
  keypadDigit,
  keypadDoubleZero,
  MAX_AMOUNT_MINOR_ABS,
  MoneyError,
  negateMoney,
  parseMoneyInput,
  rollupDelta,
  roundHalfAwayFromZero,
  subtractMoney,
  sumMoney,
  toMajorUnits,
  type Money,
} from '@shared/money';

/** Whitespace kind (NBSP vs NNBSP vs space) is Intl's business, not ours. */
const flat = (value: string): string => value.replace(/\s/g, ' ');

describe('entryCashFlowMinor', () => {
  it.each([
    ['EXPENSE', 4200, -4200],
    ['EXPENSE', -4200, 4200],
    ['INCOME', 4200, 4200],
    ['INCOME', -4200, -4200],
    ['TRANSFER', 4200, 4200],
  ] as const)('%s %i displays %i', (type, amountMinor, expected) => {
    expect(entryCashFlowMinor(type, amountMinor)).toBe(expected);
  });
});

describe('roundHalfAwayFromZero', () => {
  it('does not bias negatives the way Math.round does', () => {
    expect(Math.round(-0.5)).toBe(-0); // the bug being fixed
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3); // banker's would give -2
    expect(roundHalfAwayFromZero(2.5)).toBe(3); // banker's would give 2
  });

  it('leaves integers and zero alone', () => {
    expect(roundHalfAwayFromZero(0)).toBe(0);
    expect(roundHalfAwayFromZero(-7)).toBe(-7);
  });
});

describe('validation', () => {
  it('rejects a zero amount', () => {
    expect(isValidAmountMinor(0)).toBe(false);
    expect(() => assertValidAmount({amountMinor: 0, currency: 'KRW'})).toThrow(
      'error.amountZero',
    );
  });

  it('rejects a non-integer amount', () => {
    expect(isValidAmountMinor(12.5)).toBe(false);
    expect(() =>
      assertValidAmount({amountMinor: 12.5, currency: 'KRW'}),
    ).toThrow('error.amountNotInteger');
  });

  it('rejects an amount past the ceiling', () => {
    expect(isValidAmountMinor(MAX_AMOUNT_MINOR_ABS + 1)).toBe(false);
    expect(() =>
      assertValidAmount({
        amountMinor: MAX_AMOUNT_MINOR_ABS + 1,
        currency: 'KRW',
      }),
    ).toThrow('error.amountTooLarge');
  });

  it('accepts a negative amount — a refund is legal, a zero is not', () => {
    expect(isValidAmountMinor(-2000)).toBe(true);
    expect(() =>
      assertValidAmount({amountMinor: -2000, currency: 'EUR'}),
    ).not.toThrow();
  });

  it('throws a typed MoneyError', () => {
    try {
      assertValidAmount({amountMinor: 0, currency: 'KRW'});
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MoneyError);
      expect((error as MoneyError).code).toBe('error.amountZero');
    }
  });
});

describe('arithmetic', () => {
  const krw = (amountMinor: number): Money => ({amountMinor, currency: 'KRW'});

  it('adds and subtracts exactly', () => {
    expect(addMoney(krw(12000), krw(3500))).toEqual(krw(15500));
    expect(subtractMoney(krw(12000), krw(15500))).toEqual(krw(-3500));
  });

  it('refuses to sum two currencies', () => {
    expect(() => addMoney(krw(1), {amountMinor: 1, currency: 'USD'})).toThrow(
      'error.currencyMismatch',
    );
  });

  it('sums a list, answering zero for an empty one', () => {
    expect(sumMoney([], 'KRW')).toEqual(krw(0));
    expect(sumMoney([krw(1), krw(2), krw(-3)], 'KRW')).toEqual(krw(0));
  });

  it('negates and absolutes', () => {
    expect(negateMoney(krw(-500))).toEqual(krw(500));
    expect(absMoney(krw(-500))).toEqual(krw(500));
    expect(absMoney(krw(500))).toEqual(krw(500));
  });

  it('is exact where floating-point major units would not be', () => {
    const cents = {amountMinor: 10, currency: 'USD'};
    let total = {amountMinor: 0, currency: 'USD'};

    for (let index = 0; index < 3; index++) total = addMoney(total, cents);

    expect(total.amountMinor).toBe(30);
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3); // the representation being avoided
  });
});

describe('rollupDelta — the sign convention', () => {
  it('buckets by type, never by sign', () => {
    expect(rollupDelta('EXPENSE', 12000)).toEqual({
      expenseMinor: 12000,
      incomeMinor: 0,
    });
    expect(rollupDelta('INCOME', 12000)).toEqual({
      expenseMinor: 0,
      incomeMinor: 12000,
    });
  });

  it('excludes TRANSFER from both buckets — a sign cannot express "neither"', () => {
    expect(rollupDelta('TRANSFER', 12000)).toEqual({
      expenseMinor: 0,
      incomeMinor: 0,
    });
  });

  it('keeps a refund inside the expense bucket instead of polluting income', () => {
    // A EUR 20 refund on a EUR 50 grocery expense.
    const spent = rollupDelta('EXPENSE', 5000);
    const refund = rollupDelta('EXPENSE', -2000);

    expect(spent.expenseMinor + refund.expenseMinor).toBe(3000);
    expect(spent.incomeMinor + refund.incomeMinor).toBe(0);
  });

  it('emits a subtract/add pair for an edit', () => {
    expect(rollupDelta('INCOME', 12000, -1)).toEqual({
      expenseMinor: 0,
      incomeMinor: -12000,
    });
  });
});

describe('major <-> minor', () => {
  it('respects the exponent in both directions', () => {
    expect(toMajorUnits({amountMinor: 12000, currency: 'KRW'})).toBe(12000);
    expect(toMajorUnits({amountMinor: 1234, currency: 'USD'})).toBe(12.34);
    expect(toMajorUnits({amountMinor: 1234, currency: 'BHD'})).toBe(1.234);

    expect(fromMajorUnits(12000, 'KRW')).toBe(12000);
    expect(fromMajorUnits(12.34, 'USD')).toBe(1234);
    expect(fromMajorUnits(1.234, 'BHD')).toBe(1234);
  });

  it('rounds a legacy fractional amount on an exponent-0 currency and stays integral', () => {
    // Legacy parsed with parseFloat, so realAmount 12000.5 exists in the export.
    expect(fromMajorUnits(12000.5, 'KRW')).toBe(12001);
    expect(fromMajorUnits(-12000.5, 'KRW')).toBe(-12001);
  });

  it('refuses to guess rather than producing a non-integer', () => {
    expect(fromMajorUnits(Number.NaN, 'USD')).toBeUndefined();
    expect(fromMajorUnits(Number.POSITIVE_INFINITY, 'USD')).toBeUndefined();
    expect(fromMajorUnits(1e18, 'USD')).toBeUndefined();
  });
});

describe('FX conversion', () => {
  it('converts between two exponent-0 currencies', () => {
    // KRW per 1 JPY = 9.38
    expect(convertMinor(1000, 'JPY', 'KRW', 9_380_000)).toBe(9380);
  });

  it('converts 2 -> 0 (USD -> KRW)', () => {
    // 1234 minor USD = $12.34, at 1356.20 KRW/USD
    expect(convertMinor(1234, 'USD', 'KRW', 1_356_200_000)).toBe(16736);
  });

  it('converts 0 -> 2 (KRW -> USD)', () => {
    // 10000 KRW at 0.000737 USD/KRW
    expect(convertMinor(10000, 'KRW', 'USD', 737)).toBe(737);
  });

  it('converts 0 -> 3 (JPY -> BHD)', () => {
    // 1000 JPY at 0.0025 BHD/JPY = 2.5 BHD = 2500 fils
    expect(convertMinor(1000, 'JPY', 'BHD', 2_500)).toBe(2500);
  });

  it('converts 3 -> 0 (BHD -> KRW)', () => {
    // 1000 fils = 1 BHD, at 3600 KRW/BHD
    expect(convertMinor(1000, 'BHD', 'KRW', 3_600_000_000)).toBe(3600);
  });

  it('takes the divide-first branch when the product would exceed 2^53', () => {
    const amountMinor = 1e9;
    const rateMicros = 19_000_000; // VND per 1 KRW

    expect(amountMinor * rateMicros).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(convertMinorSafe(amountMinor, 'KRW', 'VND', rateMicros)).toBe(
      19_000_000_000,
    );
  });

  it('agrees with the direct branch below the threshold', () => {
    for (const rate of [1_000_000, 9_380_000, 1_356_200_000]) {
      for (const amount of [1, 999, 123_456, 9_999_999]) {
        expect(convertMinorSafe(amount, 'JPY', 'KRW', rate)).toBe(
          convertMinor(amount, 'JPY', 'KRW', rate),
        );
      }
    }
  });

  it('carries the target currency on the Money wrapper', () => {
    expect(
      convertMoney({amountMinor: 1000, currency: 'JPY'}, 'KRW', 9_380_000),
    ).toEqual({amountMinor: 9380, currency: 'KRW'});
  });

  it('rounds a negative conversion away from zero', () => {
    expect(convertMinor(-1000, 'JPY', 'KRW', 9_380_000)).toBe(-9380);
    expect(convertMinor(-1, 'JPY', 'KRW', 1_500_000)).toBe(-2);
    expect(convertMinor(1, 'JPY', 'KRW', 1_500_000)).toBe(2);
  });
});

describe('formatMoney', () => {
  it('formats a 0-decimal currency with no fraction at all', () => {
    expect(formatMoney({amountMinor: 12000, currency: 'KRW'}, 'ko-KR')).toBe(
      '₩12,000',
    );
    expect(formatMoney({amountMinor: 1234567, currency: 'KRW'}, 'ko-KR')).toBe(
      '₩1,234,567',
    );
  });

  it('formats a 2-decimal currency', () => {
    expect(formatMoney({amountMinor: 1234, currency: 'USD'}, 'en-US')).toBe(
      '$12.34',
    );
    expect(formatMoney({amountMinor: 5, currency: 'USD'}, 'en-US')).toBe(
      '$0.05',
    );
    expect(formatMoney({amountMinor: 100, currency: 'USD'}, 'en-US')).toBe(
      '$1.00',
    );
  });

  it('formats a 3-decimal currency', () => {
    expect(
      flat(formatMoney({amountMinor: 1234, currency: 'BHD'}, 'en-US')),
    ).toBe('BHD 1.234');
    expect(flat(formatMoney({amountMinor: 5, currency: 'BHD'}, 'en-US'))).toBe(
      'BHD 0.005',
    );
  });

  it('formats zero for every exponent', () => {
    expect(formatMoney({amountMinor: 0, currency: 'KRW'}, 'ko-KR')).toBe('₩0');
    expect(formatMoney({amountMinor: 0, currency: 'USD'}, 'en-US')).toBe(
      '$0.00',
    );
    expect(flat(formatMoney({amountMinor: 0, currency: 'BHD'}, 'en-US'))).toBe(
      'BHD 0.000',
    );
  });

  it('puts the minus in front of the symbol when the locale does', () => {
    expect(formatMoney({amountMinor: -12000, currency: 'KRW'}, 'ko-KR')).toBe(
      '-₩12,000',
    );
    expect(formatMoney({amountMinor: -1234, currency: 'USD'}, 'en-US')).toBe(
      '-$12.34',
    );
  });

  it('puts the symbol AFTER the number where the locale does', () => {
    expect(
      flat(formatMoney({amountMinor: 123456, currency: 'EUR'}, 'de-DE')),
    ).toBe('1.234,56 €');
    expect(
      flat(formatMoney({amountMinor: -123456, currency: 'EUR'}, 'de-DE')),
    ).toBe('-1.234,56 €');
  });

  it('produces ASCII digits even where Intl would emit Arabic-Indic ones', () => {
    const formatted = formatMoney(
      {amountMinor: 1234, currency: 'BHD'},
      'ar-BH',
    );

    expect(formatted).toMatch(/[0-9]/);
    expect(formatted).not.toMatch(/[٠-٩]/);
  });

  it('omitFraction truncates toward zero rather than lying', () => {
    // $10.99 shown as "$10" is honest; "$11" disagrees with the stored 1099.
    expect(
      formatMoney({amountMinor: 1099, currency: 'USD'}, 'en-US', {
        omitFraction: true,
      }),
    ).toBe('$10');
    expect(
      formatMoney({amountMinor: -1099, currency: 'USD'}, 'en-US', {
        omitFraction: true,
      }),
    ).toBe('-$10');
  });

  it('omitSymbol drops the symbol and keeps the digits', () => {
    expect(
      formatMoney({amountMinor: 1234, currency: 'USD'}, 'en-US', {
        omitSymbol: true,
      }),
    ).toBe('12.34');
  });

  it('absolute renders the magnitude so the caller can colour the sign', () => {
    expect(
      formatMoney({amountMinor: -12000, currency: 'KRW'}, 'ko-KR', {
        absolute: true,
      }),
    ).toBe('₩12,000');
  });

  it('alwaysSign marks positives only', () => {
    expect(
      formatMoney({amountMinor: 12000, currency: 'KRW'}, 'ko-KR', {
        alwaysSign: true,
      }),
    ).toBe('+₩12,000');
    expect(
      formatMoney({amountMinor: -12000, currency: 'KRW'}, 'ko-KR', {
        alwaysSign: true,
      }),
    ).toBe('-₩12,000');
    expect(
      formatMoney({amountMinor: 0, currency: 'KRW'}, 'ko-KR', {
        alwaysSign: true,
      }),
    ).toBe('₩0');
  });
});

describe('formatInteger / formatPercent', () => {
  it('groups a non-money integer with the locale separator', () => {
    expect(formatInteger(1234567, 'en-US')).toBe('1,234,567');
    expect(formatInteger(-1234567, 'en-US')).toBe('-1,234,567');
    expect(formatInteger(0, 'en-US')).toBe('0');
  });

  it('formats a percentage', () => {
    expect(formatPercent(0.1234, 'en-US')).toBe('12.3%');
    expect(formatPercent(0.1234, 'en-US', 0)).toBe('12%');
    expect(formatPercent(1, 'en-US', 0)).toBe('100%');
    expect(formatPercent(-0.055, 'en-US')).toBe('-5.5%');
  });
});

describe('parseMoneyInput', () => {
  it('resolves the ambiguous 3-digit tail with the locale group separator', () => {
    expect(parseMoneyInput('1,234', 'USD', 'en-US').minor).toBe(123400);
    expect(parseMoneyInput('1.234', 'EUR', 'de-DE').minor).toBe(123400);
    expect(parseMoneyInput('12,000', 'KRW', 'ko-KR').minor).toBe(12000);
  });

  it('parses both separators present', () => {
    expect(parseMoneyInput('1,234.56', 'USD', 'en-US').minor).toBe(123456);
    expect(parseMoneyInput('1.234,56', 'EUR', 'de-DE').minor).toBe(123456);
  });

  it('ignores symbols and spaces', () => {
    expect(parseMoneyInput('$12.34', 'USD', 'en-US').minor).toBe(1234);
    expect(parseMoneyInput('  ₩ 12,000 ', 'KRW', 'ko-KR').minor).toBe(12000);
  });

  it('carries the sign', () => {
    expect(parseMoneyInput('-$1,234.56', 'USD', 'en-US').minor).toBe(-123456);
    expect(parseMoneyInput('−1234', 'KRW', 'ko-KR').minor).toBe(-1234);
  });

  it('normalizes Arabic-Indic digits', () => {
    expect(parseMoneyInput('١٢.٣٤', 'USD', 'en-US').minor).toBe(1234);
  });

  it('rounds extra fraction digits half away from zero and flags it', () => {
    const bhd = parseMoneyInput('1.2345', 'BHD', 'en-US');

    expect(bhd.minor).toBe(1235);
    expect(bhd.rounded).toBe(true);

    const krw = parseMoneyInput('0.5', 'KRW', 'ko-KR');

    expect(krw.minor).toBe(1);
    expect(krw.rounded).toBe(true);

    const usd = parseMoneyInput('12.344', 'USD', 'en-US');

    expect(usd.minor).toBe(1234);
    expect(usd.rounded).toBe(true);
  });

  it('does not flag an exact input', () => {
    expect(parseMoneyInput('12.34', 'USD', 'en-US').rounded).toBe(false);
  });

  it('parses zero and rejects empty / non-numeric input', () => {
    expect(parseMoneyInput('0', 'USD', 'en-US')).toEqual({
      ok: true,
      minor: 0,
      rounded: false,
    });
    expect(parseMoneyInput('', 'USD', 'en-US').ok).toBe(false);
    expect(parseMoneyInput('abc', 'USD', 'en-US').ok).toBe(false);
    expect(parseMoneyInput('   ', 'USD', 'en-US').ok).toBe(false);
  });

  it('rejects an input past the ceiling instead of returning a lossy float', () => {
    expect(parseMoneyInput('99999999999999999999', 'KRW', 'ko-KR').ok).toBe(
      false,
    );
  });
});

describe('format -> parse round trip', () => {
  const cases: readonly {
    currency: string;
    locale: string;
    amounts: readonly number[];
  }[] = [
    {currency: 'KRW', locale: 'ko-KR', amounts: [0, 1, 12000, -12000, 1234567]},
    {currency: 'JPY', locale: 'ja-JP', amounts: [0, 5, 123456, -98765]},
    {currency: 'USD', locale: 'en-US', amounts: [0, 5, 1234, -1234, 100000000]},
    {currency: 'EUR', locale: 'de-DE', amounts: [0, 5, 123456, -123456]},
    {currency: 'EUR', locale: 'fr-FR', amounts: [0, 5, 123456, -123456]},
    {currency: 'BHD', locale: 'en-US', amounts: [0, 5, 1234, -1234, 1000000]},
    {currency: 'IDR', locale: 'id-ID', amounts: [0, 12000, -12000]},
    {currency: 'RUB', locale: 'ru-RU', amounts: [0, 123456, -123456]},
  ];

  for (const {currency, locale, amounts} of cases) {
    for (const amountMinor of amounts) {
      it(`${currency} @ ${locale}: ${amountMinor}`, () => {
        const formatted = formatMoney({amountMinor, currency}, locale);
        const parsed = parseMoneyInput(formatted, currency, locale);

        expect(parsed.ok).toBe(true);
        expect(parsed.rounded).toBe(false);
        expect(parsed.minor).toBe(amountMinor);
      });
    }
  }

  it('round-trips a mid-size amount in every supported currency', () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const amountMinor = 1234567;
      const formatted = formatMoney({amountMinor, currency}, 'en-US');
      const parsed = parseMoneyInput(formatted, currency, 'en-US');

      expect({currency, minor: parsed.minor}).toEqual({
        currency,
        minor: amountMinor,
      });
    }
  });
});

describe('keypad accumulator', () => {
  it('fills the implied decimal right to left', () => {
    let state = {minor: 0, currency: 'USD'};

    for (const digit of [1, 2, 3, 4]) state = keypadDigit(state, digit);

    expect(state.minor).toBe(1234);
    expect(
      formatMoney({amountMinor: state.minor, currency: 'USD'}, 'en-US'),
    ).toBe('$12.34');
  });

  it('backspaces exactly, with no re-parse of a display string', () => {
    expect(keypadBackspace({minor: 1234, currency: 'USD'}).minor).toBe(123);
    expect(keypadBackspace({minor: 1, currency: 'USD'}).minor).toBe(0);
    expect(keypadBackspace({minor: 0, currency: 'USD'}).minor).toBe(0);
  });

  it('clears and double-zeros', () => {
    expect(keypadClear({minor: 999, currency: 'KRW'}).minor).toBe(0);
    expect(keypadDoubleZero({minor: 12, currency: 'KRW'}).minor).toBe(1200);
  });

  it('clamps instead of overflowing', () => {
    const state = {minor: 999_999_999_999_999, currency: 'KRW'};

    expect(keypadDigit(state, 9)).toBe(state);
  });

  it('splits a bill the way a person expects', () => {
    // 1000 / 3 -> 333, 333, 334. Banker's rounding would surprise people.
    expect(applyKeypadOp(1000, 3, '/')).toBe(333);
    expect(applyKeypadOp(1000, 0, '/')).toBe(1000); // divide-by-zero is a no-op
    expect(applyKeypadOp(1500, 2, '/')).toBe(750);
    expect(applyKeypadOp(500, 3, '*')).toBe(1500);
    expect(applyKeypadOp(500, 300, '+')).toBe(800);
    expect(applyKeypadOp(500, 300, '-')).toBe(200);
  });
});

/**
 * REGRESSION (adversarial review). Three defects, all of them silent and all of
 * them money-wrong:
 *
 * 1. `parseMoneyInput` stripped the Arabic separators U+066C / U+066B, so
 *    `'12٬345٫67'` — which is what `formatMoney` itself emits for `ar-*` —
 *    parsed as `1234567` MAJOR units: exactly 100x too much.
 * 2. Several CLDR currency symbols contain ASCII dots (`د.إ.`, `ر.س.`,
 *    `د.ب.`). They survived the filter and the trailing one was read as the
 *    decimal separator.
 * 3. A 3-digit tail on a 0-decimal currency was read as a fraction whenever the
 *    locale's group separator was not the character used, losing a factor of
 *    1000.
 */
describe('parseMoneyInput survives non-ASCII separators', () => {
  it('reads the Arabic thousands and decimal separators', () => {
    expect(parseMoneyInput('12٬345٫67', 'USD', 'ar-EG').minor).toBe(1234567);
    expect(parseMoneyInput('١٢٬٣٤٥٫٦٧', 'USD', 'ar-EG').minor).toBe(1234567);
    expect(parseMoneyInput('-1٬234٫56', 'USD', 'ar-EG').minor).toBe(-123456);
  });

  it('reads the Swiss apostrophe group separator in both forms', () => {
    expect(parseMoneyInput('1’234.56', 'CHF', 'de-CH').minor).toBe(123456);
    expect(parseMoneyInput("1'234.56", 'CHF', 'de-CH').minor).toBe(123456);
  });

  it('ignores dots that belong to the currency symbol', () => {
    expect(parseMoneyInput('12٫34 د.إ.', 'AED', 'ar-EG').minor).toBe(1234);
    expect(parseMoneyInput('1٫234 د.ب.', 'BHD', 'ar-EG').minor).toBe(1234);
  });

  it('treats a 3-digit tail on a 0-decimal currency as grouping', () => {
    for (const locale of ['ko', 'ja-JP', 'en-US', 'de-DE', 'fr-FR'] as const) {
      expect({
        locale,
        minor: parseMoneyInput('12.345', 'KRW', locale).minor,
      }).toEqual({locale, minor: 12345});
      expect({
        locale,
        minor: parseMoneyInput('12,345', 'KRW', locale).minor,
      }).toEqual({locale, minor: 12345});
    }
  });

  it('still reads a leading bare decimal point', () => {
    expect(parseMoneyInput('.5', 'USD', 'en-US').minor).toBe(50);
  });
});

describe('format -> parse round trips across every currency and a locale matrix', () => {
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
    'fa-IR',
    'es-ES',
    'pl-PL',
    'pt-PT',
  ] as const;

  const AMOUNTS = [1, 5, 99, 1000, 1234, 123456, 12345678901, -123456] as const;

  it('never loses or gains a minor unit', () => {
    const failures: string[] = [];

    for (const currency of SUPPORTED_CURRENCIES) {
      for (const locale of LOCALES) {
        for (const amountMinor of AMOUNTS) {
          const text = formatMoney({amountMinor, currency}, locale);
          const back = parseMoneyInput(text, currency, locale);

          if (!back.ok || back.minor !== amountMinor) {
            failures.push(
              `${currency}@${locale} ${amountMinor} -> "${text}" -> ${back.minor}`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('formatPercent never renders NaN', () => {
  it('clamps the requested digit count into the supported range', () => {
    expect(formatPercent(0.123456, 'en-US', 5)).not.toContain('NaN');
    expect(formatPercent(0.123456, 'en-US', 4)).toBe('12.3456%');
    expect(formatPercent(0.1234, 'en-US', -1)).toBe('12%');
    expect(formatPercent(0.1234, 'en-US', Number.NaN)).toBe('12.3%');
  });
});

describe('formatMoney is not corrupt in a minimumGroupingDigits locale', () => {
  it('never uses the same character for grouping and the decimal point', () => {
    for (const locale of [
      'es-ES',
      'it-IT',
      'pt-PT',
      'pl-PL',
      'hu-HU',
    ] as const) {
      const text = formatMoney({amountMinor: 123456, currency: 'EUR'}, locale);
      const digitsOnly = text.replace(/[^\d.,   ]/g, '').trim();
      const separators = digitsOnly.replace(/\d/g, '');

      // Two separators, and they must differ: '1.234,56', never '1,234,56'.
      expect({locale, separators}).toEqual({
        locale,
        separators: separators[0] + separators[1],
      });
      expect({locale, same: separators[0] === separators[1]}).toEqual({
        locale,
        same: false,
      });
    }
  });
});
