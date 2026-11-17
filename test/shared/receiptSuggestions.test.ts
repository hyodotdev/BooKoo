import {receiptSuggestions} from '../../shared/receiptSuggestions';

describe('receipt draft suggestions', () => {
  it('uses the total instead of subtotal, tax, cash and change', () => {
    expect(
      receiptSuggestions(
        [
          '2026-10-09',
          'Subtotal $180.00',
          'Tax $5.00',
          'TOTAL $185.00',
          'Cash $200.00',
          'Change $15.00',
        ],
        'USD',
        'en',
      ),
    ).toEqual({amountMinor: 18500, dayKey: 20261009, currencyMismatch: false});
  });
  it.each([
    ['합계 185,000원', 'KRW', 'ko', 185000],
    ['合計 ¥18,500', 'JPY', 'ja', 18500],
    ['总计 CNY 925.00', 'CNY', 'zh', 92500],
    ['Total Rp 185.000', 'IDR', 'id', 18500000],
    ['Gesamt 1.234,50 €', 'EUR', 'de', 123450],
    ['TOTAL 1 234,50 €', 'EUR', 'fr', 123450],
  ])(
    'parses localized total %s using integer minor units',
    (line, currency, locale, amountMinor) => {
      expect(receiptSuggestions([line], currency, locale).amountMinor).toBe(
        amountMinor,
      );
    },
  );
  it('handles a total split across OCR lines', () => {
    expect(
      receiptSuggestions(['TOTAL', '$12.50'], 'USD', 'en').amountMinor,
    ).toBe(1250);
  });
  it('leaves conflicting totals and dates for manual entry', () => {
    expect(
      receiptSuggestions(
        ['Total $12.50', 'Total $15.00', '2026-10-09', '2026-10-10'],
        'USD',
        'en',
      ),
    ).toEqual({amountMinor: null, dayKey: null, currencyMismatch: false});
  });
  it('does not guess from item prices or card numbers', () => {
    expect(
      receiptSuggestions(
        ['Coffee $12.50', 'VISA 1234567890123456'],
        'USD',
        'en',
      ).amountMinor,
    ).toBeNull();
  });
  it('does not reinterpret a foreign-currency receipt or convert it', () => {
    expect(
      receiptSuggestions(['TOTAL $12.50', '2026-10-09'], 'KRW', 'ko'),
    ).toEqual({amountMinor: null, dayKey: 20261009, currencyMismatch: true});
    expect(
      receiptSuggestions(['TOTAL EUR 12,50'], 'USD', 'en').currencyMismatch,
    ).toBe(true);
  });
  it.each(['AUD', 'CAD', 'CHF', 'INR', 'KWD'])(
    'rejects a printed %s currency outside the common script hints',
    (code) => {
      expect(receiptSuggestions([`TOTAL ${code} 185.00`], 'USD', 'en')).toEqual({
        amountMinor: null,
        currencyMismatch: true,
        dayKey: null,
      });
    },
  );
  it('rejects invalid dates, negative totals and excess precision', () => {
    expect(
      receiptSuggestions(['2026-02-30', 'TOTAL -12.50'], 'USD', 'en').dayKey,
    ).toBeNull();
    expect(
      receiptSuggestions(['TOTAL -12.50'], 'USD', 'en').amountMinor,
    ).toBeNull();
    expect(
      receiptSuggestions(['TOTAL 12.3456'], 'USD', 'en').amountMinor,
    ).toBeNull();
  });
  it('parses numeric Asian dates and locale-dependent dates', () => {
    expect(receiptSuggestions(['2026年10月9日'], 'JPY', 'ja').dayKey).toBe(
      20261009,
    );
    expect(receiptSuggestions(['2026년 10월 9일'], 'KRW', 'ko').dayKey).toBe(
      20261009,
    );
    expect(receiptSuggestions(['10/09/2026'], 'USD', 'en').dayKey).toBe(
      20261009,
    );
    expect(receiptSuggestions(['09/10/2026'], 'EUR', 'fr').dayKey).toBe(
      20261009,
    );
  });
});
