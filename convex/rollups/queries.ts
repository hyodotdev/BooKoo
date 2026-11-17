import {v} from 'convex/values';
import {MAX_TIMELINE_DAY_KEYS} from '../../shared/ledgerLimits';

import {
  addMonthsToMonthKey,
  dayKeyDifference,
  isValidDayKey,
  isValidMonthKey,
} from '../../shared/date';
import {
  addRollup,
  ZERO_ROLLUP,
  type RollupValue,
} from '../../shared/ledgerCore';
import {query} from '../_generated/server';
import {
  CATEGORY_ROLLUP_SCAN_LIMIT,
  DAY_ROLLUP_RANGE_LIMIT,
  DAY_ROLLUP_SCAN_LIMIT,
  MAX_CATEGORIES_PER_LEDGER,
  MONTH_ROLLUP_SCAN_LIMIT,
  ROLLUP_SHARD_COUNT,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireLedgerMember} from '../lib/ledgerPermissions';

const totalsValidator = v.object({
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  netMinor: v.number(),
  itemCount: v.number(),
});

interface Totals extends RollupValue {
  readonly netMinor: number;
}

const withNet = (value: RollupValue): Totals => ({
  ...value,
  netMinor: value.incomeMinor - value.expenseMinor,
});

const assertDayRange = (fromDayKey: number, toDayKey: number): void => {
  if (!isValidDayKey(fromDayKey) || !isValidDayKey(toDayKey))
    throw appError('INVALID_INPUT', 'error.invalidInput');
  const distance = dayKeyDifference(fromDayKey, toDayKey);
  if (distance < 0 || distance >= DAY_ROLLUP_RANGE_LIMIT)
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const dayResultValidator = v.object({
  dayKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  netMinor: v.number(),
  itemCount: v.number(),
});

/** Timeline pages can span years; never scan the intervening calendar days. */
export const daysByKeys = query({
  args: {ledgerId: v.id('ledgers'), dayKeys: v.array(v.number())},
  returns: v.array(dayResultValidator),
  handler: async (
    ctx,
    args,
  ): Promise<(Totals & {readonly dayKey: number})[]> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (
      args.dayKeys.length > MAX_TIMELINE_DAY_KEYS ||
      args.dayKeys.some((dayKey) => !isValidDayKey(dayKey))
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    // Bounded sidecar: at most 380 visible-entry days, one shard each, §11.7.
    const dayKeys = [...new Set(args.dayKeys)].sort(
      (left, right) => left - right,
    );
    return Promise.all(
      dayKeys.map(async (dayKey) => {
        const rows = await ctx.db
          .query('ledgerDayRollups')
          .withIndex('by_ledgerId_dayKey_shard', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('dayKey', dayKey),
          )
          .take(ROLLUP_SHARD_COUNT + 1);
        if (rows.length > ROLLUP_SHARD_COUNT)
          throw appError('INVALID_INPUT', 'error.invalidInput');
        return {
          dayKey,
          ...withNet(rows.reduce<RollupValue>(addRollup, ZERO_ROLLUP)),
        };
      }),
    );
  },
});

export const daysInRange = query({
  args: {
    ledgerId: v.id('ledgers'),
    fromDayKey: v.number(),
    toDayKey: v.number(),
  },
  returns: v.array(dayResultValidator),
  handler: async (
    ctx,
    args,
  ): Promise<(Totals & {readonly dayKey: number})[]> => {
    await requireLedgerMember(ctx, args.ledgerId);
    assertDayRange(args.fromDayKey, args.toDayKey);
    const rows = await ctx.db
      .query('ledgerDayRollups')
      .withIndex('by_ledgerId_dayKey_shard', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .gte('dayKey', args.fromDayKey)
          .lte('dayKey', args.toDayKey),
      )
      .take(DAY_ROLLUP_SCAN_LIMIT + 1);
    if (rows.length > DAY_ROLLUP_SCAN_LIMIT)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const totals = new Map<number, RollupValue>();
    for (const row of rows)
      totals.set(
        row.dayKey,
        addRollup(totals.get(row.dayKey) ?? ZERO_ROLLUP, row),
      );
    return [...totals.entries()]
      .filter(([, total]) => total.itemCount > 0)
      .sort(([left], [right]) => left - right)
      .map(([dayKey, total]) => ({dayKey, ...withNet(total)}));
  },
});

export const month = query({
  args: {ledgerId: v.id('ledgers'), monthKey: v.number()},
  returns: totalsValidator,
  handler: async (ctx, args): Promise<Totals> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (!isValidMonthKey(args.monthKey))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerMonthRollups')
      .withIndex('by_ledgerId_monthKey_shard', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('monthKey', args.monthKey),
      )
      .take(ROLLUP_SHARD_COUNT + 1);
    if (rows.length > ROLLUP_SHARD_COUNT)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    return withNet(rows.reduce<RollupValue>(addRollup, ZERO_ROLLUP));
  },
});

const categoryMonthValidator = v.object({
  categoryKey: v.string(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  netMinor: v.number(),
  itemCount: v.number(),
});

export const categoriesOfMonth = query({
  args: {ledgerId: v.id('ledgers'), monthKey: v.number()},
  returns: v.array(categoryMonthValidator),
  handler: async (
    ctx,
    args,
  ): Promise<(Totals & {readonly categoryKey: string})[]> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (!isValidMonthKey(args.monthKey))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerCategoryMonthRollups')
      .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('monthKey', args.monthKey),
      )
      .take(CATEGORY_ROLLUP_SCAN_LIMIT + 1);
    if (rows.length > CATEGORY_ROLLUP_SCAN_LIMIT)
      throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
    const totals = new Map<string, RollupValue>();
    for (const row of rows)
      totals.set(
        row.categoryKey,
        addRollup(totals.get(row.categoryKey) ?? ZERO_ROLLUP, row),
      );
    if (totals.size > MAX_CATEGORIES_PER_LEDGER)
      throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
    return [...totals.entries()]
      .filter(([, total]) => total.itemCount > 0)
      .map(([categoryKey, total]) => ({categoryKey, ...withNet(total)}))
      .sort(
        (left, right) =>
          Math.abs(right.netMinor) - Math.abs(left.netMinor) ||
          left.categoryKey.localeCompare(right.categoryKey),
      );
  },
});

export const balanceBefore = query({
  args: {ledgerId: v.id('ledgers'), monthKey: v.number()},
  returns: totalsValidator,
  handler: async (ctx, args): Promise<Totals> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (!isValidMonthKey(args.monthKey))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerMonthRollups')
      .withIndex('by_ledgerId_monthKey_shard', (index) =>
        index.eq('ledgerId', args.ledgerId).lt('monthKey', args.monthKey),
      )
      .take(MONTH_ROLLUP_SCAN_LIMIT + 1);
    if (rows.length > MONTH_ROLLUP_SCAN_LIMIT)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    return withNet(rows.reduce<RollupValue>(addRollup, ZERO_ROLLUP));
  },
});

const categoryTrendValidator = v.object({
  monthKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  netMinor: v.number(),
  itemCount: v.number(),
});

export const categoryTrend = query({
  args: {
    ledgerId: v.id('ledgers'),
    categoryKey: v.string(),
    fromMonth: v.number(),
    toMonth: v.number(),
  },
  returns: v.array(categoryTrendValidator),
  handler: async (
    ctx,
    args,
  ): Promise<(Totals & {readonly monthKey: number})[]> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (
      !isValidMonthKey(args.fromMonth) ||
      !isValidMonthKey(args.toMonth) ||
      args.fromMonth > args.toMonth ||
      addMonthsToMonthKey(args.fromMonth, 11) < args.toMonth
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerCategoryMonthRollups')
      .withIndex('by_ledgerId_categoryKey_monthKey_shard', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('categoryKey', args.categoryKey)
          .gte('monthKey', args.fromMonth)
          .lte('monthKey', args.toMonth),
      )
      .take(12 * ROLLUP_SHARD_COUNT + 1);
    if (rows.length > 12 * ROLLUP_SHARD_COUNT)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const totals = new Map<number, RollupValue>();
    for (const row of rows)
      totals.set(
        row.monthKey,
        addRollup(totals.get(row.monthKey) ?? ZERO_ROLLUP, row),
      );
    const output: (Totals & {readonly monthKey: number})[] = [];
    for (
      let monthKey = args.fromMonth;
      monthKey <= args.toMonth;
      monthKey = addMonthsToMonthKey(monthKey, 1)
    )
      output.push({monthKey, ...withNet(totals.get(monthKey) ?? ZERO_ROLLUP)});
    return output;
  },
});
