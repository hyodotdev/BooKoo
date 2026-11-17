import {
  statsCenterAmount,
  statsMagnitude,
  statsShare,
  statsSignedAmount,
} from '../../../../src/features/ledger/statsPresentation';
import {formatRatio} from '../../../../src/utils/i18n';

describe('statsShare', () => {
  it('keeps a bounded, unrounded share for the label and bar', () => {
    expect(statsShare(1_234, 5_000)).toBeCloseTo(0.2468);
    expect(statsShare(5_000, 5_000)).toBe(1);
    expect(statsShare(7_000, 5_000)).toBe(1);
    expect(statsShare(-10, 5_000)).toBe(0);
    expect(statsShare(1_000, 0)).toBe(0);
  });

  it('labels a small but real share above zero', () => {
    // Rounding to whole percents first printed "0.0%" for $12,345 of $9.9M.
    expect(formatRatio(statsShare(1_234_567, 988_888_888), 1, 'en')).toBe(
      '0.1%',
    );
    expect(formatRatio(statsShare(1_234, 5_000), 1, 'en')).toBe('24.7%');
  });
});

describe('stats mode presentation', () => {
  const rollup = {expenseMinor: 1_234, incomeMinor: 5_000};

  it('uses magnitude for chart slices and signed values for labels', () => {
    expect(statsMagnitude(rollup, 'ALL')).toBe(6_234);
    expect(statsMagnitude(rollup, 'EXPENSE')).toBe(1_234);
    expect(statsMagnitude(rollup, 'INCOME')).toBe(5_000);
    expect(statsSignedAmount(rollup, 'ALL')).toBe(3_766);
    expect(statsSignedAmount(rollup, 'EXPENSE')).toBe(-1_234);
    expect(statsSignedAmount(rollup, 'INCOME')).toBe(5_000);
  });

  it('selects the signed monthly summary for each mode', () => {
    expect(statsCenterAmount({...rollup, netMinor: 3_766, mode: 'ALL'})).toBe(
      3_766,
    );
    expect(
      statsCenterAmount({...rollup, netMinor: 3_766, mode: 'EXPENSE'}),
    ).toBe(-1_234);
    expect(
      statsCenterAmount({...rollup, netMinor: 3_766, mode: 'INCOME'}),
    ).toBe(5_000);
  });
});
