import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * THREE tables, not one with a `periodKind` discriminator. A single table would need
 * (ledgerId, periodKind, periodKey, categoryKey, shard) as its tuple, and Convex range expressions
 * require `.eq()` on every field before the one you range over. The calendar wants "range periodKey,
 * no category"; the donut wants "eq periodKey, range category"; the trend wants "eq category, range
 * periodKey". Those three demands are unsatisfiable by one field order.
 *
 * CONTRACT (all three tables):
 *  - Maintained by a `convex-helpers/server/triggers` trigger on `ledgerItems`, so no mutation can
 *    forget: insert => +delta, delete => -delta, update => -old then +new. A throw inside the
 *    trigger aborts the whole mutation atomically (`13` §5.4).
 *  - All money is `ledgerItems.baseAmountMinor`, i.e. the ledger's baseCurrency. A rollup row is
 *    NEVER a multi-currency sum.
 *  - `expenseMinor` and `incomeMinor` are SIGNED sums into their type's bucket, so a refund
 *    (negative amountMinor on an EXPENSE) correctly reduces the expense bucket. TRANSFER contributes
 *    to neither. `itemCount` counts every non-deleted item in the bucket, TRANSFER included.
 *  - A soft delete applies the negative delta at delete time; a restore re-applies the positive one.
 *    Rows are never deleted, only zeroed — a zeroed row is reused on the next write.
 *  - `shard` is the §1.8 contention shard and is ALWAYS the last index field, so a prefix range
 *    returns every shard and readers sum in JS. `ROLLUP_SHARD_COUNT = 1` in v1, so every read below
 *    returns exactly one row per bucket.
 *  - The migration does NOT fire the trigger. Rollups are built once at the end by the SAME
 *    ROLLUP_REBUILD job that runs as the nightly repair, so the safety net is exercised on day one.
 */

/** Calendar month grid, timeline section headers, arbitrary-period totals (salary cycle). */
export const ledgerDayRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  dayKey: v.number(), // 20260824
  shard: v.number(),
  /** Redundant with dayKey, but it lets the rebuild walk a month with no integer math. */
  monthKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  // (a) Calendar's previous/current/next mounted-grid union: one bounded dayKey range -> event dots
  //     AND each day's subtotal in <=126*S documents. Legacy computed the dots with an O(n^2)
  //     moment().isSame() scan over every item in the ledger (`02` S5).
  // (b) Timeline section headers, by the EXACT dayKey extent of the loaded item page (§4.4).
  // (c) Arbitrary period totals (급여일 cycle, "last 30 days") -> <=62 documents, which is why
  //     monthKey never has to become period-relative.
  .index('by_ledgerId_dayKey_shard', ['ledgerId', 'dayKey', 'shard']);

/** Month header, running balance, the 12-month totals bar. */
export const ledgerMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(), // 202608
  shard: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
  /**
   * THE DIRTY BIT. Set by the repair job when it verified this bucket against source; CLEARED (set
   * to undefined) by every delta write. `.eq('repairedAt', undefined)` on `by_repairedAt` is
   * therefore the EXACT dirty set with no scan and no second index, and `.gte(0)` ascending is the
   * slow background re-verification queue. This is what makes §6.2's repair cron bounded and
   * auditable rather than a full sweep of every (ledger, month) pair in the deployment.
   */
  repairedAt: v.optional(v.number()),
})
  // (a) Month header tile: `.eq(ledgerId).eq(monthKey)` -> 1 document.
  // (b) BALANCE-BEFORE (the cold half, §4.5): `.eq(ledgerId).lt('monthKey', M)` -> <=120 documents,
  //     and its read set EXCLUDES the current month, so it does not re-run on today's expense.
  .index('by_ledgerId_monthKey_shard', ['ledgerId', 'monthKey', 'shard'])
  // Repair cron, deployment-wide. INTERNAL ONLY — never reachable from a user query.
  .index('by_repairedAt', ['repairedAt']);

/** Donut + category rows, and the 12-month single-category trend. */
export const ledgerCategoryMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  /** The ledgerCategories `key` slug — a string, matching ledgerItems.categoryKey (§1.4). */
  categoryKey: v.string(),
  shard: v.number(),
  /** Only one of these is ever non-zero for a given categoryKey (a category has one kind). */
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  // THE DONUT: `.eq(ledgerId).eq(monthKey)` -> <=34x shards, summed and sorted by magnitude in JS.
  // Also the writer's upsert probe (`.eq(...).eq(categoryKey).eq(shard).unique()`).
  .index('by_ledgerId_monthKey_categoryKey_shard', [
    'ledgerId',
    'monthKey',
    'categoryKey',
    'shard',
  ])
  // THE 12-MONTH TREND: `.eq(ledgerId).eq(categoryKey).gte(monthKey).lte(monthKey)` -> <=12 rows.
  // The SAME data, the OTHER field order — the index that would be impossible in one merged table.
  .index('by_ledgerId_categoryKey_monthKey_shard', [
    'ledgerId',
    'categoryKey',
    'monthKey',
    'shard',
  ]);
