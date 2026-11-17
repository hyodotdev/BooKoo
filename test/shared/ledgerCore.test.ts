import {
  addRollup,
  itemRollupIdentities,
  isClientRequestId,
  isSafeRollup,
  isValidItemMoney,
  isValidLedgerTitle,
  isValidPeriodStartDay,
  isValidWeekStartsOn,
  normalizeNewCurrency,
  rollupTransition,
  ZERO_ROLLUP,
} from '@shared/ledgerCore';
import {rollupDelta} from '@shared/money';

describe('ledger core invariants', () => {
  it('accepts only lowercase RFC 4122 v4 request ids', () => {
    expect(isClientRequestId('d9428888-122b-4c26-8f3c-03c7a2e54a08')).toBe(
      true,
    );
    expect(isClientRequestId('D9428888-122B-4C26-8F3C-03C7A2E54A08')).toBe(
      false,
    );
    expect(isClientRequestId('d9428888-122b-1c26-8f3c-03c7a2e54a08')).toBe(
      false,
    );
  });

  it('normalizes only supported new-ledger currencies', () => {
    expect(normalizeNewCurrency(' krw ')).toBe('KRW');
    expect(normalizeNewCurrency('GRD')).toBe('EUR');
    expect(normalizeNewCurrency('ZZZ')).toBeNull();
  });

  it('keeps v1 item amounts in the ledger base currency', () => {
    expect(isValidItemMoney(12_000, 'KRW', 'KRW')).toBe(true);
    expect(isValidItemMoney(-2_000, 'KRW', 'KRW')).toBe(true);
    expect(isValidItemMoney(0, 'KRW', 'KRW')).toBe(false);
    expect(isValidItemMoney(100, 'USD', 'KRW')).toBe(false);
  });

  it('validates ledger calendar settings and title', () => {
    expect(isValidLedgerTitle(' 가족 ')).toBe(true);
    expect(isValidLedgerTitle('   ')).toBe(false);
    expect(isValidWeekStartsOn(0)).toBe(true);
    expect(isValidWeekStartsOn(6)).toBe(true);
    expect(isValidWeekStartsOn(7)).toBe(false);
    expect(isValidPeriodStartDay(1)).toBe(true);
    expect(isValidPeriodStartDay(28)).toBe(true);
    expect(isValidPeriodStartDay(29)).toBe(false);
  });

  it('adds signed rollups without losing refund direction', () => {
    const value = addRollup(ZERO_ROLLUP, {
      expenseMinor: -2_000,
      incomeMinor: 0,
      itemCount: 1,
    });
    expect(value).toEqual({
      expenseMinor: -2_000,
      incomeMinor: 0,
      itemCount: 1,
    });
    expect(isSafeRollup(value)).toBe(true);
    expect(isSafeRollup({expenseMinor: 0, incomeMinor: 0, itemCount: -1})).toBe(
      false,
    );
  });

  it('classifies every live/deleted rollup transition', () => {
    expect(rollupTransition(null, 'new')).toEqual([1]);
    expect(rollupTransition('old', null)).toEqual([-1]);
    expect(rollupTransition('same', 'same')).toEqual([]);
    expect(rollupTransition('old', 'new')).toEqual([-1, 1]);
    expect(rollupTransition(null, null)).toEqual([]);
  });

  it('invalidates only the affected rollup dimensions', () => {
    const original = itemRollupIdentities({
      ledgerId: 'ledger',
      authorId: 'author',
      type: 'EXPENSE',
      baseAmountMinor: 12_000,
      dayKey: 20260824,
      monthKey: 202608,
      categoryKey: 'meal',
    });
    const categoryEdit = itemRollupIdentities({
      ledgerId: 'ledger',
      authorId: 'author',
      type: 'EXPENSE',
      baseAmountMinor: 12_000,
      dayKey: 20260824,
      monthKey: 202608,
      categoryKey: 'transport',
    });
    const nextDay = itemRollupIdentities({
      ledgerId: 'ledger',
      authorId: 'author',
      type: 'EXPENSE',
      baseAmountMinor: 12_000,
      dayKey: 20260825,
      monthKey: 202608,
      categoryKey: 'meal',
    });

    expect(categoryEdit.day).toBe(original.day);
    expect(categoryEdit.month).toBe(original.month);
    expect(categoryEdit.categoryMonth).not.toBe(original.categoryMonth);
    expect(nextDay.day).not.toBe(original.day);
    expect(nextDay.month).toBe(original.month);
    expect(nextDay.categoryMonth).toBe(original.categoryMonth);
  });

  it('round-trips create, cross-bucket edit, delete, and restore exactly', () => {
    const created = addRollup(ZERO_ROLLUP, {
      ...rollupDelta('EXPENSE', 12_000),
      itemCount: 1,
    });
    const oldBucketAfterEdit = addRollup(created, {
      ...rollupDelta('EXPENSE', 12_000, -1),
      itemCount: -1,
    });
    const newBucketAfterEdit = addRollup(ZERO_ROLLUP, {
      ...rollupDelta('INCOME', 5_000),
      itemCount: 1,
    });
    const deleted = addRollup(newBucketAfterEdit, {
      ...rollupDelta('INCOME', 5_000, -1),
      itemCount: -1,
    });
    const restored = addRollup(deleted, {
      ...rollupDelta('INCOME', 5_000),
      itemCount: 1,
    });

    expect(oldBucketAfterEdit).toEqual(ZERO_ROLLUP);
    expect(deleted).toEqual(ZERO_ROLLUP);
    expect(restored).toEqual(newBucketAfterEdit);
  });
});
