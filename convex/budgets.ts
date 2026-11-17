import {mergedStream, stream} from 'convex-helpers/server/stream';
import {v, type Infer} from 'convex/values';

import {addDaysToDayKey, addMonthsToMonthKey} from '../shared/date';
import schema from './schema';
import type {Id} from './_generated/dataModel';
import {internalQuery} from './_generated/server';
import {
  CATEGORY_ROLLUP_SCAN_LIMIT,
  CATEGORY_SCAN_LIMIT,
  DAY_ROLLUP_SCAN_LIMIT,
  ITEM_PAGE_SIZE,
  LEDGER_PAGE_SIZE,
  MEMBER_SCAN_LIMIT,
  MONTH_ROLLUP_SCAN_LIMIT,
  ROLLUP_SHARD_COUNT,
  SEARCH_SCAN_LIMIT,
  UNSEEN_TARGET_LIMIT,
} from './lib/constants';
import {requirePerformanceFixture} from './lib/permissions';

const budgetQueryNameValidator = v.union(
  v.literal('ledgers.listMine'),
  v.literal('ledgers.unseen'),
  v.literal('rollups.daysInRange'),
  v.literal('rollups.month'),
  v.literal('items.listByDay'),
  v.literal('ledgers.roster'),
  v.literal('categories.list'),
  v.literal('items.list'),
  v.literal('items.searchMemo'),
  v.literal('items.searchAmount'),
  v.literal('rollups.categoriesOfMonth'),
  v.literal('rollups.balanceBefore'),
  v.literal('rollups.categoryTrend'),
  v.literal('items.listByCategory'),
  v.literal('items.get'),
);

export type BudgetQueryName = Infer<typeof budgetQueryNameValidator>;

interface FixtureState {
  readonly ownerUserId: Id<'users'>;
  readonly userIds: readonly Id<'users'>[];
  readonly ledgerIds: readonly Id<'ledgers'>[];
  readonly categoryRows: readonly {key: string; kind: 'EXPENSE' | 'INCOME'}[];
}

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseFixture = (value: string | undefined): FixtureState => {
  if (value === undefined) throw new Error('Performance fixture state missing');
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('ownerUserId' in parsed) ||
    !('userIds' in parsed) ||
    !('ledgerIds' in parsed) ||
    !('categoryRows' in parsed) ||
    typeof parsed.ownerUserId !== 'string' ||
    !isStringArray(parsed.userIds) ||
    !isStringArray(parsed.ledgerIds) ||
    !Array.isArray(parsed.categoryRows) ||
    !parsed.categoryRows.every(
      (category) =>
        typeof category === 'object' &&
        category !== null &&
        'key' in category &&
        'kind' in category &&
        typeof category.key === 'string' &&
        (category.kind === 'EXPENSE' || category.kind === 'INCOME'),
    )
  )
    throw new Error('Invalid performance fixture state');
  return parsed as unknown as FixtureState;
};

const metricsValidator = v.object({
  name: budgetQueryNameValidator,
  documentsRead: v.number(),
  bytesRead: v.number(),
  databaseQueries: v.number(),
  observedRows: v.number(),
});

interface MetricSnapshot {
  readonly documentsRead: {readonly used: number};
  readonly bytesRead: {readonly used: number};
  readonly databaseQueries: {readonly used: number};
}

const usedBetween = (
  before: MetricSnapshot,
  after: MetricSnapshot,
): Pick<BudgetMetric, 'documentsRead' | 'bytesRead' | 'databaseQueries'> => ({
  documentsRead: after.documentsRead.used - before.documentsRead.used,
  bytesRead: after.bytesRead.used - before.bytesRead.used,
  databaseQueries: after.databaseQueries.used - before.databaseQueries.used,
});

interface BudgetMetric {
  readonly name: BudgetQueryName;
  readonly documentsRead: number;
  readonly bytesRead: number;
  readonly databaseQueries: number;
  readonly observedRows: number;
}

export const measure = internalQuery({
  args: {
    name: budgetQueryNameValidator,
    ledgerId: v.id('ledgers'),
    itemId: v.id('ledgerItems'),
    anchorDayKey: v.number(),
    anchorMonthKey: v.number(),
    firstDayKey: v.number(),
    firstMonthKey: v.number(),
  },
  returns: metricsValidator,
  handler: async (ctx, args): Promise<BudgetMetric> => {
    const fixture = await requirePerformanceFixture(ctx, args.ledgerId);
    const state = parseFixture(fixture.job.argsJson);
    const before = await ctx.meta.getTransactionMetrics();
    let observedRows = 0;

    switch (args.name) {
      case 'ledgers.listMine': {
        const memberships = await ctx.db
          .query('ledgerMembers')
          .withIndex('by_userId_deletedAt', (index) =>
            index.eq('userId', state.ownerUserId).eq('deletedAt', undefined),
          )
          .order('desc')
          .take(LEDGER_PAGE_SIZE);
        for (const membership of memberships) {
          await ctx.db.get('ledgers', membership.ledgerId);
          await ctx.db
            .query('ledgerMemberState')
            .withIndex('by_ledgerId_userId', (index) =>
              index
                .eq('ledgerId', membership.ledgerId)
                .eq('userId', state.ownerUserId),
            )
            .unique();
        }
        observedRows = memberships.length;
        break;
      }
      case 'ledgers.unseen': {
        await ctx.db
          .query('userProfiles')
          .withIndex('by_userId', (index) =>
            index.eq('userId', state.ownerUserId),
          )
          .unique();
        for (const ledgerId of state.ledgerIds.slice(0, UNSEEN_TARGET_LIMIT)) {
          await ctx.db
            .query('ledgerMembers')
            .withIndex('by_ledgerId_userId', (index) =>
              index.eq('ledgerId', ledgerId).eq('userId', state.ownerUserId),
            )
            .unique();
          await ctx.db.get('ledgers', ledgerId);
          await ctx.db
            .query('ledgerItems')
            .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
              index.eq('ledgerId', ledgerId).eq('deletedAt', undefined),
            )
            .order('desc')
            .first();
        }
        observedRows = UNSEEN_TARGET_LIMIT;
        break;
      }
      case 'rollups.daysInRange': {
        await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('userId', state.ownerUserId),
          )
          .unique();
        const rows = await ctx.db
          .query('ledgerDayRollups')
          .withIndex('by_ledgerId_dayKey_shard', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .gte('dayKey', addDaysToDayKey(args.anchorDayKey, -125))
              .lte('dayKey', args.anchorDayKey),
          )
          .take(DAY_ROLLUP_SCAN_LIMIT + 1);
        observedRows = rows.length;
        break;
      }
      case 'rollups.month': {
        const rows = await ctx.db
          .query('ledgerMonthRollups')
          .withIndex('by_ledgerId_monthKey_shard', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .eq('monthKey', args.anchorMonthKey),
          )
          .take(ROLLUP_SHARD_COUNT + 1);
        observedRows = rows.length;
        break;
      }
      case 'items.listByDay': {
        await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('userId', state.ownerUserId),
          )
          .unique();
        const page = await ctx.db
          .query('ledgerItems')
          .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .eq('deletedAt', undefined)
              .eq('dayKey', args.anchorDayKey),
          )
          .order('desc')
          .paginate({cursor: null, numItems: ITEM_PAGE_SIZE});
        observedRows = page.page.length;
        break;
      }
      case 'ledgers.roster': {
        const memberships = await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_deletedAt_role', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
          )
          .take(MEMBER_SCAN_LIMIT + 1);
        for (const membership of memberships) {
          await ctx.db
            .query('userProfiles')
            .withIndex('by_userId', (index) =>
              index.eq('userId', membership.userId),
            )
            .unique();
          await ctx.db
            .query('userBlocks')
            .withIndex('by_blockerUserId_blockedUserId', (index) =>
              index
                .eq('blockerUserId', state.ownerUserId)
                .eq('blockedUserId', membership.userId),
            )
            .unique();
          await ctx.db
            .query('userBlocks')
            .withIndex('by_blockerUserId_blockedUserId', (index) =>
              index
                .eq('blockerUserId', membership.userId)
                .eq('blockedUserId', state.ownerUserId),
            )
            .unique();
        }
        observedRows = memberships.length;
        break;
      }
      case 'categories.list': {
        const rows = await ctx.db
          .query('ledgerCategories')
          .withIndex('by_ledgerId_sortOrder', (index) =>
            index.eq('ledgerId', args.ledgerId),
          )
          .take(CATEGORY_SCAN_LIMIT);
        observedRows = rows.length;
        break;
      }
      case 'items.list': {
        const page = await ctx.db
          .query('ledgerItems')
          .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
          )
          .order('desc')
          .paginate({cursor: null, numItems: ITEM_PAGE_SIZE});
        observedRows = page.page.length;
        break;
      }
      case 'items.searchMemo': {
        const rows = await ctx.db
          .query('ledgerItems')
          .withSearchIndex('search_memo', (index) =>
            index
              .search('memo', 'budget needle')
              .eq('ledgerId', args.ledgerId)
              .eq('deletedAt', undefined),
          )
          .take(SEARCH_SCAN_LIMIT);
        observedRows = rows.length;
        break;
      }
      case 'items.searchAmount': {
        const rows = await mergedStream(
          (['EXPENSE', 'INCOME'] as const).map((type) =>
            stream(ctx.db, schema)
              .query('ledgerItems')
              .withIndex(
                'by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt',
                (index) =>
                  index
                    .eq('ledgerId', args.ledgerId)
                    .eq('deletedAt', undefined)
                    .eq('type', type)
                    .eq('amountMinor', 12_345),
              )
              .order('desc'),
          ),
          ['dayKey', 'occurredAt', '_creationTime'],
        ).take(SEARCH_SCAN_LIMIT);
        observedRows = rows.length;
        break;
      }
      case 'rollups.categoriesOfMonth': {
        const rows = await ctx.db
          .query('ledgerCategoryMonthRollups')
          .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .eq('monthKey', args.anchorMonthKey),
          )
          .take(CATEGORY_ROLLUP_SCAN_LIMIT + 1);
        observedRows = rows.length;
        break;
      }
      case 'rollups.balanceBefore': {
        const rows = await ctx.db
          .query('ledgerMonthRollups')
          .withIndex('by_ledgerId_monthKey_shard', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .lt('monthKey', args.anchorMonthKey),
          )
          .take(MONTH_ROLLUP_SCAN_LIMIT + 1);
        observedRows = rows.length;
        break;
      }
      case 'rollups.categoryTrend': {
        const categoryKey = state.categoryRows[0].key;
        const fromMonth = addMonthsToMonthKey(args.anchorMonthKey, -11);
        const rows = await ctx.db
          .query('ledgerCategoryMonthRollups')
          .withIndex('by_ledgerId_categoryKey_monthKey_shard', (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .eq('categoryKey', categoryKey)
              .gte('monthKey', fromMonth)
              .lte('monthKey', args.anchorMonthKey),
          )
          .take(12 * ROLLUP_SHARD_COUNT + 1);
        observedRows = rows.length;
        break;
      }
      case 'items.listByCategory': {
        const page = await ctx.db
          .query('ledgerItems')
          .withIndex(
            'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
            (index) =>
              index
                .eq('ledgerId', args.ledgerId)
                .eq('deletedAt', undefined)
                .eq('categoryKey', state.categoryRows[0].key)
                .gte('dayKey', args.firstDayKey)
                .lte('dayKey', args.anchorDayKey),
          )
          .order('desc')
          .paginate({cursor: null, numItems: ITEM_PAGE_SIZE});
        observedRows = page.page.length;
        break;
      }
      case 'items.get': {
        const membership = await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('userId', state.ownerUserId),
          )
          .unique();
        if (membership === null) throw new Error('Fixture membership missing');
        const item = await ctx.db.get('ledgerItems', args.itemId);
        observedRows = item === null ? 0 : 1;
        break;
      }
    }

    const after = await ctx.meta.getTransactionMetrics();
    return {name: args.name, ...usedBetween(before, after), observedRows};
  },
});
