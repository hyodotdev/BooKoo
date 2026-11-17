import {v} from 'convex/values';

import {
  ALL_CATEGORY_ICON_NAMES,
  CATEGORY_COLOR_TOKENS,
} from '../../shared/categories';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {
  categoryIdentityPatch,
  materializeCategories,
  nextCategorySortOrder,
  validateCategoryLabel,
} from '../lib/categoryMutations';
import {CATEGORY_SCAN_LIMIT, MAX_CATEGORIES_PER_LEDGER} from '../lib/constants';
import {appError} from '../lib/errors';
import {mutation} from '../lib/functions';
import {
  assertLedgerWritable,
  requireLedgerRole,
} from '../lib/ledgerPermissions';
import {
  releaseExpiredCustomCategories,
  requireWritableCategory,
} from '../lib/categories';
import {categoryKindValidator} from '../schema/ledgerCategories';

const requireCategory = async (
  ctx: Parameters<typeof materializeCategories>[0],
  ledgerId: Id<'ledgers'>,
  key: string,
) => {
  const category = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_key', (index) =>
      index.eq('ledgerId', ledgerId).eq('key', key),
    )
    .unique();
  if (category === null)
    throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
  return category;
};

const insertCategoryAudit = async (
  ctx: Parameters<typeof materializeCategories>[0],
  args: {
    ledgerId: Id<'ledgers'>;
    userId: Id<'users'>;
    action:
      | 'CATEGORY_CREATED'
      | 'CATEGORY_RENAMED'
      | 'CATEGORY_ARCHIVED'
      | 'CATEGORY_REASSIGNED';
    key: string;
    now: number;
  },
): Promise<void> => {
  await ctx.db.insert('ledgerAuditLog', {
    ledgerId: args.ledgerId,
    action: args.action,
    retention: 'AUDIT',
    actorUserId: args.userId,
    meta: {categoryKey: args.key},
    createdAt: args.now,
  });
};

export const materialize = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    assertLedgerWritable(context);
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      Date.now(),
    );
    return null;
  },
});

export const create = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    kind: categoryKindValidator,
    label: v.string(),
    iconKey: v.string(),
    colorToken: v.string(),
  },
  returns: v.object({key: v.string()}),
  handler: async (ctx, args): Promise<{key: string}> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'MEMBER');
    assertLedgerWritable(context);
    const label = validateCategoryLabel(args.label);
    if (
      !ALL_CATEGORY_ICON_NAMES.includes(args.iconKey) ||
      !CATEGORY_COLOR_TOKENS.some((token) => token === args.colorToken)
    )
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    const now = Date.now();
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      now,
    );
    await releaseExpiredCustomCategories(ctx, args.ledgerId, now);
    const sortOrder = await nextCategorySortOrder(
      ctx,
      args.ledgerId,
      args.kind,
    );
    let key = `c_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    let existing = await ctx.db
      .query('ledgerCategories')
      .withIndex('by_ledgerId_key', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('key', key),
      )
      .unique();
    if (existing !== null) {
      key = `c_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
      existing = await ctx.db
        .query('ledgerCategories')
        .withIndex('by_ledgerId_key', (index) =>
          index.eq('ledgerId', args.ledgerId).eq('key', key),
        )
        .unique();
    }
    if (existing !== null)
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    await ctx.db.insert('ledgerCategories', {
      ledgerId: args.ledgerId,
      key,
      source: 'CUSTOM',
      kind: args.kind,
      iconKey: args.iconKey,
      colorToken: args.colorToken,
      label,
      sortOrder,
      createdByUserId: context.profile.userId,
      createdAt: now,
      updatedAt: now,
    });
    await insertCategoryAudit(ctx, {
      ledgerId: args.ledgerId,
      userId: context.profile.userId,
      action: 'CATEGORY_CREATED',
      key,
      now,
    });
    return {key};
  },
});

export const reorder = mutation({
  args: {ledgerId: v.id('ledgers'), orderedKeys: v.array(v.string())},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    assertLedgerWritable(context);
    const now = Date.now();
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      now,
    );
    const rows = await ctx.db
      .query('ledgerCategories')
      .withIndex('by_ledgerId_sortOrder', (index) =>
        index.eq('ledgerId', args.ledgerId),
      )
      .take(CATEGORY_SCAN_LIMIT);
    if (
      rows.length > MAX_CATEGORIES_PER_LEDGER ||
      args.orderedKeys.length !== rows.length ||
      new Set(args.orderedKeys).size !== rows.length
    )
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    const byKey = new Map(rows.map((row) => [row.key, row] as const));
    let expenseOrder = 10;
    let incomeOrder = 1010;
    for (const key of args.orderedKeys) {
      const row = byKey.get(key);
      if (row === undefined)
        throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
      const sortOrder = row.kind === 'EXPENSE' ? expenseOrder : incomeOrder;
      if (row.kind === 'EXPENSE') expenseOrder += 10;
      else incomeOrder += 10;
      if (row.sortOrder !== sortOrder)
        await ctx.db.patch(row._id, {sortOrder, updatedAt: now});
    }
    return null;
  },
});

export const rename = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    key: v.string(),
    label: v.optional(v.string()),
    // Additive fields retain compatibility with installed name-only clients.
    iconKey: v.optional(v.string()),
    colorToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    assertLedgerWritable(context);
    const now = Date.now();
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      now,
    );
    const category = await requireCategory(ctx, args.ledgerId, args.key);
    const patch = categoryIdentityPatch(category, args);
    await ctx.db.patch(category._id, {...patch, updatedAt: now});
    // Appearance-only edits are not renames: writing CATEGORY_RENAMED for a
    // colour tap grows the audit log with a claim that is not true.
    if (patch.label !== category.label)
      await insertCategoryAudit(ctx, {
        ledgerId: args.ledgerId,
        userId: context.profile.userId,
        action: 'CATEGORY_RENAMED',
        key: args.key,
        now,
      });
    return null;
  },
});

export const setHidden = mutation({
  args: {ledgerId: v.id('ledgers'), key: v.string(), hidden: v.boolean()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    assertLedgerWritable(context);
    const now = Date.now();
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      now,
    );
    const category = await requireCategory(ctx, args.ledgerId, args.key);
    await ctx.db.patch(category._id, {
      hiddenAt: args.hidden ? now : undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const archive = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    key: v.string(),
    reassignTo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    assertLedgerWritable(context);
    const now = Date.now();
    await materializeCategories(
      ctx,
      args.ledgerId,
      context.profile.userId,
      now,
    );
    const category = await requireCategory(ctx, args.ledgerId, args.key);
    const item = await ctx.db
      .query('ledgerItems')
      .withIndex(
        'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
        (index) =>
          index
            .eq('ledgerId', args.ledgerId)
            .eq('deletedAt', undefined)
            .eq('categoryKey', args.key),
      )
      .first();
    if (item === null) {
      // A trashed entry stays restorable for ITEM_PURGE_GRACE_MS and must keep
      // resolving its category, so a CUSTOM row is archived, never deleted
      // here; `create` releases it after that window.
      await ctx.db.patch(
        category._id,
        category.source === 'CUSTOM'
          ? {archivedAt: category.archivedAt ?? now, updatedAt: now}
          : {hiddenAt: now, updatedAt: now},
      );
      await insertCategoryAudit(ctx, {
        ledgerId: args.ledgerId,
        userId: context.profile.userId,
        action: 'CATEGORY_ARCHIVED',
        key: args.key,
        now,
      });
      return null;
    }
    if (args.reassignTo === undefined) {
      await ctx.db.patch(category._id, {hiddenAt: now, updatedAt: now});
      await insertCategoryAudit(ctx, {
        ledgerId: args.ledgerId,
        userId: context.profile.userId,
        action: 'CATEGORY_ARCHIVED',
        key: args.key,
        now,
      });
      return null;
    }
    if (args.reassignTo === args.key)
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    await requireWritableCategory(
      ctx,
      args.ledgerId,
      args.reassignTo,
      category.kind,
    );
    const jobKey = `CATEGORY_REASSIGN:${args.ledgerId}:${args.key}`;
    const previous = await ctx.db
      .query('maintenanceJobs')
      .withIndex('by_jobKey', (index) => index.eq('jobKey', jobKey))
      .unique();
    if (previous !== null && previous.state !== 'DONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const jobId =
      previous === null
        ? await ctx.db.insert('maintenanceJobs', {
            kind: 'CATEGORY_REASSIGN',
            jobKey,
            ledgerId: args.ledgerId,
            state: 'QUEUED',
            phase: 'items',
            processed: 0,
            argsJson: JSON.stringify({from: args.key, to: args.reassignTo}),
            startedAt: now,
            updatedAt: now,
            requestedByUserId: context.profile.userId,
          })
        : previous._id;
    if (previous !== null)
      await ctx.db.patch(previous._id, {
        state: 'QUEUED',
        phase: 'items',
        cursor: undefined,
        processed: 0,
        argsJson: JSON.stringify({from: args.key, to: args.reassignTo}),
        startedAt: now,
        updatedAt: now,
        finishedAt: undefined,
        lastError: undefined,
        requestedByUserId: context.profile.userId,
      });
    await ctx.db.patch(category._id, {reassignJobKey: jobKey, updatedAt: now});
    await ctx.scheduler.runAfter(
      0,
      internal.categories.internal.reassignBatch,
      {
        jobId,
      },
    );
    return null;
  },
});
