import {v} from 'convex/values';

import {monthDayKeyBounds} from '../../shared/date';
import {
  addRollup,
  isSafeRollup,
  ZERO_ROLLUP,
  type RollupValue,
} from '../../shared/ledgerCore';
import {rollupDelta} from '../../shared/money';
import {internal} from '../_generated/api';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {
  CATEGORY_ROLLUP_SCAN_LIMIT,
  CURRENT_ROLLUP_VERSION,
  DAY_ROLLUP_SCAN_LIMIT,
  MAX_CATEGORIES_PER_LEDGER,
  ROLLUP_MONTH_SCAN_BATCH,
  ROLLUP_SHARD_COUNT,
} from '../lib/constants';
import {internalMutation} from '../lib/functions';
import {requireRequestedOrMigrationRollupJob} from '../lib/maintenancePermissions';

interface RebuildState {
  readonly currentMonth?: number;
  readonly total: RollupValue;
  readonly days: Readonly<Record<string, RollupValue>>;
  readonly categories: Readonly<Record<string, RollupValue>>;
}

const emptyState = (currentMonth?: number): RebuildState => ({
  ...(currentMonth === undefined ? {} : {currentMonth}),
  total: ZERO_ROLLUP,
  days: {},
  categories: {},
});

const isRollupValue = (value: unknown): value is RollupValue =>
  typeof value === 'object' &&
  value !== null &&
  'expenseMinor' in value &&
  'incomeMinor' in value &&
  'itemCount' in value &&
  typeof value.expenseMinor === 'number' &&
  typeof value.incomeMinor === 'number' &&
  typeof value.itemCount === 'number' &&
  isSafeRollup({
    expenseMinor: value.expenseMinor,
    incomeMinor: value.incomeMinor,
    itemCount: value.itemCount,
  });

const isRollupRecord = (
  value: unknown,
): value is Readonly<Record<string, RollupValue>> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every(isRollupValue);

const parseState = (value: string | undefined): RebuildState => {
  if (value === undefined) return emptyState();
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('total' in parsed) ||
    !('days' in parsed) ||
    !('categories' in parsed) ||
    !isRollupValue(parsed.total) ||
    !isRollupRecord(parsed.days) ||
    !isRollupRecord(parsed.categories) ||
    ('currentMonth' in parsed &&
      parsed.currentMonth !== undefined &&
      typeof parsed.currentMonth !== 'number')
  )
    throw new Error('Invalid rollup rebuild state');
  return {
    ...('currentMonth' in parsed && typeof parsed.currentMonth === 'number'
      ? {currentMonth: parsed.currentMonth}
      : {}),
    total: parsed.total,
    days: parsed.days,
    categories: parsed.categories,
  };
};

const firstMonth = async (
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  after?: number,
): Promise<number | null> => {
  const item = await ctx.db
    .query('ledgerItems')
    .withIndex('by_ledgerId_monthKey', (index) => {
      const range = index.eq('ledgerId', ledgerId);
      return after === undefined ? range : range.gt('monthKey', after);
    })
    .first();
  return item?.monthKey ?? null;
};

const addItem = (
  state: RebuildState,
  item: Doc<'ledgerItems'>,
): RebuildState => {
  if (item.deletedAt !== undefined) return state;
  const delta = rollupDelta(item.type, item.baseAmountMinor);
  const value = {...delta, itemCount: 1};
  const dayKey = String(item.dayKey);
  const categoryKey = item.categoryKey;
  return {
    ...state,
    total: addRollup(state.total, value),
    days: {
      ...state.days,
      [dayKey]: addRollup(state.days[dayKey] ?? ZERO_ROLLUP, value),
    },
    categories: {
      ...state.categories,
      [categoryKey]: addRollup(
        state.categories[categoryKey] ?? ZERO_ROLLUP,
        value,
      ),
    },
  };
};

async function writeMonth(
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  monthKey: number,
  state: RebuildState,
  now: number,
): Promise<void> {
  if (
    Object.keys(state.categories).length > MAX_CATEGORIES_PER_LEDGER ||
    !isSafeRollup(state.total)
  )
    throw new Error('Unsafe rollup rebuild total');

  const monthRows = await ctx.db
    .query('ledgerMonthRollups')
    .withIndex('by_ledgerId_monthKey_shard', (index) =>
      index.eq('ledgerId', ledgerId).eq('monthKey', monthKey),
    )
    .take(ROLLUP_SHARD_COUNT + 1);
  if (monthRows.length > ROLLUP_SHARD_COUNT)
    throw new Error('Month rollup shard invariant failed');
  const shardZero = monthRows.find((row) => row.shard === 0);
  if (shardZero === undefined)
    await ctx.db.insert('ledgerMonthRollups', {
      ledgerId,
      monthKey,
      shard: 0,
      ...state.total,
      updatedAt: now,
      repairedAt: now,
    });
  else
    await ctx.db.patch(shardZero._id, {
      ...state.total,
      updatedAt: now,
      repairedAt: now,
    });
  for (const row of monthRows) {
    if (row.shard === 0) continue;
    await ctx.db.patch(row._id, {
      ...ZERO_ROLLUP,
      updatedAt: now,
      repairedAt: now,
    });
  }

  const bounds = monthDayKeyBounds(monthKey);
  const dayRows = await ctx.db
    .query('ledgerDayRollups')
    .withIndex('by_ledgerId_dayKey_shard', (index) =>
      index
        .eq('ledgerId', ledgerId)
        .gte('dayKey', bounds.first)
        .lte('dayKey', bounds.last),
    )
    .take(DAY_ROLLUP_SCAN_LIMIT + 1);
  if (dayRows.length > DAY_ROLLUP_SCAN_LIMIT)
    throw new Error('Day rollup shard invariant failed');
  const seenDays = new Set<string>();
  for (const row of dayRows) {
    const key = String(row.dayKey);
    const value =
      row.shard === 0 ? (state.days[key] ?? ZERO_ROLLUP) : ZERO_ROLLUP;
    if (row.shard === 0) seenDays.add(key);
    await ctx.db.patch(row._id, {...value, monthKey, updatedAt: now});
  }
  for (const [key, value] of Object.entries(state.days)) {
    if (seenDays.has(key)) continue;
    await ctx.db.insert('ledgerDayRollups', {
      ledgerId,
      dayKey: Number(key),
      monthKey,
      shard: 0,
      ...value,
      updatedAt: now,
    });
  }

  const categoryRows = await ctx.db
    .query('ledgerCategoryMonthRollups')
    .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
      index.eq('ledgerId', ledgerId).eq('monthKey', monthKey),
    )
    .take(CATEGORY_ROLLUP_SCAN_LIMIT + 1);
  if (categoryRows.length > CATEGORY_ROLLUP_SCAN_LIMIT)
    throw new Error('Category rollup shard invariant failed');
  const seenCategories = new Set<string>();
  for (const row of categoryRows) {
    const value =
      row.shard === 0
        ? (state.categories[row.categoryKey] ?? ZERO_ROLLUP)
        : ZERO_ROLLUP;
    if (row.shard === 0) seenCategories.add(row.categoryKey);
    await ctx.db.patch(row._id, {...value, updatedAt: now});
  }
  for (const [categoryKey, value] of Object.entries(state.categories)) {
    if (seenCategories.has(categoryKey)) continue;
    await ctx.db.insert('ledgerCategoryMonthRollups', {
      ledgerId,
      monthKey,
      categoryKey,
      shard: 0,
      ...value,
      updatedAt: now,
    });
  }
}

const finishJob = async (
  ctx: MutationCtx,
  job: Doc<'maintenanceJobs'>,
  ledger: Doc<'ledgers'>,
  now: number,
): Promise<void> => {
  // Release only the lock this job is actually holding. Clearing
  // unconditionally would drop a DELETING lock that a purge cascade set while
  // this job was running, and leaving it set would strand a ledger that the
  // rebuild itself locked.
  const held =
    job.kind === 'TIMEZONE_REBUCKET'
      ? 'TIMEZONE'
      : job.kind === 'CURRENCY_REBASE'
        ? 'CURRENCY'
        : 'ROLLUP';
  await ctx.db.patch(ledger._id, {
    maintenanceLock:
      ledger.maintenanceLock === held ? 'NONE' : ledger.maintenanceLock,
    rollupVersion: CURRENT_ROLLUP_VERSION,
    updatedAt: now,
  });
  await ctx.db.patch(job._id, {
    state: 'DONE',
    phase: 'done',
    cursor: undefined,
    argsJson: undefined,
    updatedAt: now,
    finishedAt: now,
  });
  await ctx.db.insert('ledgerAuditLog', {
    ledgerId: ledger._id,
    action:
      job.kind === 'TIMEZONE_REBUCKET' ? 'ITEMS_REBUCKETED' : 'ROLLUP_REPAIRED',
    retention: 'AUDIT',
    actorUserId: job.requestedByUserId,
    createdAt: now,
  });
};

export const rebuildBatch = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {job} = await requireRequestedOrMigrationRollupJob(ctx, args.jobId);
    if (job.state === 'DONE') return null;
    if (job.ledgerId === undefined)
      throw new Error('Rollup rebuild ledger missing');
    const ledger = await ctx.db.get('ledgers', job.ledgerId);
    if (ledger === null) throw new Error('Rollup rebuild ledger not found');
    const parsed = parseState(job.argsJson);
    const currentMonth =
      parsed.currentMonth ?? (await firstMonth(ctx, ledger._id));
    if (currentMonth === null) {
      await finishJob(ctx, job, ledger, Date.now());
      return null;
    }
    let state =
      parsed.currentMonth === currentMonth ? parsed : emptyState(currentMonth);
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_monthKey', (index) =>
        index.eq('ledgerId', ledger._id).eq('monthKey', currentMonth),
      )
      .paginate({
        cursor: job.cursor ?? null,
        numItems: ROLLUP_MONTH_SCAN_BATCH,
      });
    for (const item of page.page) state = addItem(state, item);
    const now = Date.now();
    if (!page.isDone) {
      await ctx.db.patch(job._id, {
        state: 'RUNNING',
        phase: 'rebuild',
        cursor: page.continueCursor,
        processed: job.processed + page.page.length,
        argsJson: JSON.stringify(state),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
        jobId: job._id,
      });
      return null;
    }
    await writeMonth(ctx, ledger._id, currentMonth, state, now);
    const nextMonth = await firstMonth(ctx, ledger._id, currentMonth);
    if (nextMonth === null) {
      await finishJob(ctx, job, ledger, now);
      return null;
    }
    await ctx.db.patch(job._id, {
      state: 'RUNNING',
      phase: 'rebuild',
      cursor: undefined,
      processed: job.processed + page.page.length,
      argsJson: JSON.stringify(emptyState(nextMonth)),
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
      jobId: job._id,
    });
    return null;
  },
});
