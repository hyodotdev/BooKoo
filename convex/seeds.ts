import {makeFunctionReference} from 'convex/server';
import {v} from 'convex/values';

import {offsetMinutesAt, toDayKey, toMonthKey} from '../shared/date';
import {SYSTEM_CATEGORIES, type CategoryKind} from '../shared/categories';
import type {Id} from './_generated/dataModel';
import {internalQuery, type MutationCtx} from './_generated/server';
import {
  PERF_SEED_BATCH_SIZE,
  PERF_SEED_DEFAULT_CATEGORIES,
  PERF_SEED_DEFAULT_ITEMS,
  PERF_SEED_DEFAULT_MEMBERS,
  PERF_SEED_DEFAULT_YEARS,
  PERF_SEED_JOB_KEY,
  PERF_SEED_LEDGER_COUNT,
  PERF_SEED_LEDGER_PREFIX,
} from './lib/constants';
import {internalMutation} from './lib/functions';
import {
  requirePerformanceSeedAccess,
  requirePerformanceSeedJob,
} from './lib/permissions';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERF_ANCHOR_AT = Date.UTC(2026, 7, 24, 12);
const PERF_TIME_ZONE = 'UTC';

interface SeedCategory {
  readonly key: string;
  readonly kind: CategoryKind;
}

interface SeedState {
  readonly items: number;
  readonly years: number;
  readonly members: number;
  readonly categories: number;
  readonly ownerUserId: Id<'users'>;
  readonly userIds: readonly Id<'users'>[];
  readonly ledgerIds: readonly Id<'ledgers'>[];
  readonly categoryRows: readonly SeedCategory[];
}

const seedResultValidator = v.object({
  jobId: v.id('maintenanceJobs'),
  ledgerId: v.id('ledgers'),
  state: v.string(),
});

type SeedResult = {
  jobId: Id<'maintenanceJobs'>;
  ledgerId: Id<'ledgers'>;
  state: string;
};

const seedBatchRef = makeFunctionReference<
  'mutation',
  {jobId: Id<'maintenanceJobs'>},
  null
>('seeds:seedBatch');

const integerInRange = (
  value: number,
  minimum: number,
  maximum: number,
): boolean => Number.isInteger(value) && value >= minimum && value <= maximum;

const validateSeedConfig = (config: {
  items: number;
  years: number;
  members: number;
  categories: number;
}): void => {
  if (
    !integerInRange(config.items, 1, PERF_SEED_DEFAULT_ITEMS) ||
    !integerInRange(config.years, 1, 10) ||
    !integerInRange(config.members, 1, PERF_SEED_DEFAULT_MEMBERS) ||
    !integerInRange(config.categories, SYSTEM_CATEGORIES.length, 120)
  )
    throw new Error('Invalid performance seed configuration');
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseState = (value: string | undefined): SeedState => {
  if (value === undefined) throw new Error('Performance seed state missing');
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('items' in parsed) ||
    !('years' in parsed) ||
    !('members' in parsed) ||
    !('categories' in parsed) ||
    !('ownerUserId' in parsed) ||
    !('userIds' in parsed) ||
    !('ledgerIds' in parsed) ||
    !('categoryRows' in parsed) ||
    typeof parsed.items !== 'number' ||
    typeof parsed.years !== 'number' ||
    typeof parsed.members !== 'number' ||
    typeof parsed.categories !== 'number' ||
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
    throw new Error('Invalid performance seed state');
  const state = parsed as unknown as SeedState;
  validateSeedConfig(state);
  if (
    state.userIds.length !== state.members ||
    state.ledgerIds.length !== PERF_SEED_LEDGER_COUNT ||
    state.categoryRows.length !== state.categories ||
    state.ownerUserId !== state.userIds[0]
  )
    throw new Error('Invalid performance seed cardinality');
  return state;
};

const requestIdOf = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0').slice(-12)}`;

const requestHashOf = (value: number): string =>
  value.toString(16).padStart(64, '0').slice(-64);

const categoryFor = (
  categories: readonly SeedCategory[],
  offset: number,
): SeedCategory => {
  if (offset % 10 < 6)
    return categories[offset % Math.min(5, categories.length)];
  const tailLength = categories.length - 5;
  return categories[5 + (offset % tailLength)];
};

const occurredAtFor = (
  offset: number,
  items: number,
  years: number,
): number => {
  const span = years * 365 * DAY_MS;
  return PERF_ANCHOR_AT - span + Math.floor((offset * span) / items);
};

const insertItem = async (
  ctx: Parameters<typeof requirePerformanceSeedJob>[0],
  state: SeedState,
  offset: number,
  ledgerId: Id<'ledgers'> = state.ledgerIds[0],
): Promise<Id<'ledgerItems'>> => {
  const occurredAt = occurredAtFor(offset, state.items, state.years);
  const category = categoryFor(state.categoryRows, offset);
  const authorId = state.userIds[offset % state.userIds.length];
  const hasPhoto = offset % 20 === 0;
  const hasComment = offset % 100 < 3;
  const amountMinor = offset % 100 === 0 ? 12_345 : ((offset % 900) + 1) * 100;
  const itemId = await ctx.db.insert('ledgerItems', {
    ledgerId,
    type: category.kind,
    amountMinor,
    currency: 'KRW',
    baseCurrency: 'KRW',
    baseAmountMinor: amountMinor,
    occurredAt,
    dayKey: toDayKey(occurredAt, PERF_TIME_ZONE),
    monthKey: toMonthKey(occurredAt, PERF_TIME_ZONE),
    occurredOffsetMinutes: offsetMinutesAt(occurredAt, PERF_TIME_ZONE),
    categoryKey: category.key,
    authorId,
    memo:
      offset % 100 === 0 ? `budget needle ${offset}` : `synthetic ${offset}`,
    photoCount: hasPhoto ? 1 : 0,
    commentCount: hasComment ? 1 : 0,
    clientRequestId: requestIdOf(offset + 1),
    clientRequestHash: requestHashOf(offset + 1),
    needsReview: false,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  if (hasPhoto)
    await ctx.db.insert('itemPhotos', {
      itemId,
      ledgerId,
      order: 0,
      width: 320,
      height: 240,
      byteSize: 1024,
      mimeType: 'image/jpeg',
      uploadedByUserId: authorId,
      migrationState: 'NATIVE',
      attempts: 0,
      legacyIsBase64: false,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  if (hasComment)
    await ctx.db.insert('itemComments', {
      itemId,
      ledgerId,
      authorId,
      body: `synthetic comment ${offset}`,
      clientRequestId: requestIdOf(state.items + offset + 1),
      clientRequestHash: requestHashOf(state.items + offset + 1),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  return itemId;
};

const startSeed = async (
  ctx: MutationCtx,
  existing: Awaited<ReturnType<typeof requirePerformanceSeedAccess>>,
  config: {items: number; years: number; members: number; categories: number},
): Promise<SeedResult> => {
  validateSeedConfig(config);
  if (existing !== null) {
    const state = parseState(existing.argsJson);
    if (
      state.items !== config.items ||
      state.years !== config.years ||
      state.members !== config.members ||
      state.categories !== config.categories
    )
      throw new Error('Performance seed already exists with different args');
    return {
      jobId: existing._id,
      ledgerId: state.ledgerIds[0],
      state: existing.state,
    };
  }

  const createdAt = PERF_ANCHOR_AT;
  const userIds: Id<'users'>[] = [];
  for (let index = 0; index < config.members; index += 1) {
    const userId = await ctx.db.insert('users', {});
    userIds.push(userId);
    await ctx.db.insert('userProfiles', {
      userId,
      handle: `budget_user_${index}`,
      handleKey: `budget_user_${index}`,
      handleUpdatedAt: createdAt,
      displayName: `Synthetic member ${index + 1}`,
      bio: '',
      phone: '',
      locale: 'en',
      appearance: 'SYSTEM',
      preferredCurrency: 'KRW',
      preferredTimeZone: PERF_TIME_ZONE,
      preferredWeekStartsOn: 0,
      pushEnabled: false,
      notifyLedgerActivity: false,
      notifyComments: false,
      notifyInvites: false,
      appRole: 'USER',
      onboardingStep: 'done',
      onboardingCompletedAt: createdAt,
      legacyClaimState: 'none',
      isPlaceholder: false,
      avatarMigrationState: 'NATIVE',
      avatarAttempts: 0,
      createdAt,
      updatedAt: createdAt,
      legacyKey: `__bookoo_budget_user_${index}`,
    });
  }
  const ownerUserId = userIds[0];
  const ledgerIds: Id<'ledgers'>[] = [];
  for (let index = 0; index < PERF_SEED_LEDGER_COUNT; index += 1) {
    const ledgerId = await ctx.db.insert('ledgers', {
      title: `Synthetic budget ledger ${index + 1}`,
      description: 'Deterministic transaction-budget fixture',
      colorKey: 'TEAL',
      ownerId: ownerUserId,
      baseCurrency: 'KRW',
      currencyIsAssumed: false,
      timeZone: PERF_TIME_ZONE,
      timeZoneIsAssumed: false,
      weekStartsOn: 0,
      periodStartDay: 1,
      itemWritePolicy: 'ANY_MEMBER',
      invitePolicy: 'MANAGERS_ONLY',
      memberCount: index === 0 ? config.members : 1,
      maintenanceLock: 'NONE',
      rollupVersion: 1,
      createdAt,
      updatedAt: createdAt + index,
      legacyKey: `${PERF_SEED_LEDGER_PREFIX}${index}`,
    });
    ledgerIds.push(ledgerId);
    await ctx.db.insert('ledgerMembers', {
      ledgerId,
      userId: ownerUserId,
      role: 'OWNER',
      joinedAt: createdAt,
      joinedVia: 'CREATED',
      createdAt,
      updatedAt: createdAt,
      legacyKey: `__bookoo_budget_member_${index}_0`,
    });
    await ctx.db.insert('ledgerMemberState', {
      ledgerId,
      userId: ownerUserId,
      lastReadAt: 0,
      lastOpenedAt: 0,
      muted: false,
      notifyNewItem: false,
      notifyComment: false,
      sortOrder: index,
      updatedAt: createdAt,
    });
  }
  for (let index = 1; index < userIds.length; index += 1) {
    await ctx.db.insert('ledgerMembers', {
      ledgerId: ledgerIds[0],
      userId: userIds[index],
      role: 'MEMBER',
      joinedAt: createdAt + index,
      joinedVia: 'CREATED',
      createdAt,
      updatedAt: createdAt,
      legacyKey: `__bookoo_budget_member_0_${index}`,
    });
    await ctx.db.insert('ledgerMemberState', {
      ledgerId: ledgerIds[0],
      userId: userIds[index],
      lastReadAt: 0,
      lastOpenedAt: 0,
      muted: false,
      notifyNewItem: false,
      notifyComment: false,
      sortOrder: index,
      updatedAt: createdAt,
    });
  }
  for (const userId of userIds) {
    await ctx.db.insert('userBlocks', {
      blockerUserId: ownerUserId,
      blockedUserId: userId,
      createdAt,
    });
    if (userId !== ownerUserId)
      await ctx.db.insert('userBlocks', {
        blockerUserId: userId,
        blockedUserId: ownerUserId,
        createdAt,
      });
  }

  const categoryRows: SeedCategory[] = SYSTEM_CATEGORIES.map((category) => ({
    key: category.key,
    kind: category.kind,
  }));
  for (const category of SYSTEM_CATEGORIES)
    await ctx.db.insert('ledgerCategories', {
      ledgerId: ledgerIds[0],
      key: category.key,
      source: 'PRESET',
      kind: category.kind,
      iconKey: category.icon,
      colorToken: category.colorToken,
      sortOrder: category.sortOrder,
      createdByUserId: ownerUserId,
      legacyIconId: category.legacyIconId,
      createdAt,
      updatedAt: createdAt,
    });
  for (
    let index = SYSTEM_CATEGORIES.length;
    index < config.categories;
    index += 1
  ) {
    const key = `c_budget_${index}`;
    const kind: CategoryKind = index % 2 === 0 ? 'EXPENSE' : 'INCOME';
    categoryRows.push({key, kind});
    await ctx.db.insert('ledgerCategories', {
      ledgerId: ledgerIds[0],
      key,
      source: 'CUSTOM',
      kind,
      iconKey: 'Circle',
      colorToken: 'category.slate',
      label: `Synthetic category ${index + 1}`,
      sortOrder: 2000 + index * 10,
      createdByUserId: ownerUserId,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const state: SeedState = {
    ...config,
    ownerUserId,
    userIds,
    ledgerIds,
    categoryRows,
  };
  for (let index = 1; index < 8; index += 1)
    await insertItem(ctx, state, index, ledgerIds[index]);

  const jobId = await ctx.db.insert('maintenanceJobs', {
    kind: 'LEGACY_IMPORT',
    jobKey: PERF_SEED_JOB_KEY,
    ledgerId: ledgerIds[0],
    state: 'QUEUED',
    phase: 'items',
    processed: 0,
    argsJson: JSON.stringify(state),
    startedAt: createdAt,
    updatedAt: createdAt,
    requestedByUserId: ownerUserId,
  });
  await ctx.scheduler.runAfter(0, seedBatchRef, {jobId});
  return {jobId, ledgerId: ledgerIds[0], state: 'QUEUED'};
};

export const seedLedger = internalMutation({
  args: {
    items: v.number(),
    years: v.number(),
    members: v.number(),
    categories: v.number(),
  },
  returns: seedResultValidator,
  handler: async (ctx, args): Promise<SeedResult> => {
    const existing = await requirePerformanceSeedAccess(ctx);
    return startSeed(ctx, existing, args);
  },
});

/** No-argument entrypoint required by `convex deploy --preview-run`. */
export const beginBudgetSeed = internalMutation({
  args: {},
  returns: seedResultValidator,
  handler: async (ctx): Promise<SeedResult> => {
    const existing = await requirePerformanceSeedAccess(ctx);
    return startSeed(ctx, existing, {
      items: PERF_SEED_DEFAULT_ITEMS,
      years: PERF_SEED_DEFAULT_YEARS,
      members: PERF_SEED_DEFAULT_MEMBERS,
      categories: PERF_SEED_DEFAULT_CATEGORIES,
    });
  },
});

export const seedBatch = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {job} = await requirePerformanceSeedJob(ctx, args.jobId);
    if (job.state === 'DONE') return null;
    const state = parseState(job.argsJson);
    const end = Math.min(job.processed + PERF_SEED_BATCH_SIZE, state.items);
    for (let offset = job.processed; offset < end; offset += 1)
      await insertItem(ctx, state, offset);
    const done = end === state.items;
    const now = Date.now();
    await ctx.db.patch(job._id, {
      state: done ? 'DONE' : 'RUNNING',
      phase: done ? 'done' : 'items',
      processed: end,
      updatedAt: now,
      ...(done ? {finishedAt: now} : {}),
    });
    if (!done) await ctx.scheduler.runAfter(0, seedBatchRef, {jobId: job._id});
    return null;
  },
});

const statusValidator = v.object({
  jobId: v.id('maintenanceJobs'),
  state: v.string(),
  processed: v.number(),
  items: v.number(),
  years: v.number(),
  members: v.number(),
  categories: v.number(),
  deploymentName: v.string(),
  ownerUserId: v.id('users'),
  userIds: v.array(v.id('users')),
  ledgerIds: v.array(v.id('ledgers')),
  categoryKeys: v.array(v.string()),
  itemId: v.union(v.id('ledgerItems'), v.null()),
  anchorDayKey: v.number(),
  anchorMonthKey: v.number(),
  firstDayKey: v.number(),
  firstMonthKey: v.number(),
});

export const status = internalQuery({
  args: {},
  returns: statusValidator,
  handler: async (ctx) => {
    const job = await requirePerformanceSeedAccess(ctx);
    if (job === null) throw new Error('Performance seed has not started');
    const state = parseState(job.argsJson);
    const item = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
        index.eq('ledgerId', state.ledgerIds[0]).eq('deletedAt', undefined),
      )
      .first();
    const deployment = await ctx.meta.getDeploymentMetadata();
    const firstAt = occurredAtFor(0, state.items, state.years);
    return {
      jobId: job._id,
      state: job.state,
      processed: job.processed,
      items: state.items,
      years: state.years,
      members: state.members,
      categories: state.categories,
      deploymentName: deployment.name,
      ownerUserId: state.ownerUserId,
      userIds: [...state.userIds],
      ledgerIds: [...state.ledgerIds],
      categoryKeys: state.categoryRows.map((category) => category.key),
      itemId: item?._id ?? null,
      anchorDayKey: toDayKey(PERF_ANCHOR_AT, PERF_TIME_ZONE),
      anchorMonthKey: toMonthKey(PERF_ANCHOR_AT, PERF_TIME_ZONE),
      firstDayKey: toDayKey(firstAt, PERF_TIME_ZONE),
      firstMonthKey: toMonthKey(firstAt, PERF_TIME_ZONE),
    };
  },
});
