import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {mergedStream, stream} from 'convex-helpers/server/stream';
import {v} from 'convex/values';

import {isValidDayKey} from '../../shared/date';
import {isValidAmountMinor, MAX_AMOUNT_MINOR_ABS} from '../../shared/money';
import schema from '../schema';
import {query} from '../_generated/server';
import {ITEM_PAGE_MORE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireItemMember, requireLedgerMember} from '../lib/ledgerPermissions';
import {requireOnboarded} from '../lib/permissions';
import {itemRowValidator, toItemRow, type ItemRow} from '../lib/serializers';
import {ledgerIsReachable} from '../lib/ledgerPermissions';

const pageValidator = paginationResultValidator(itemRowValidator);
const itemTypeFilterValidator = v.union(
  v.literal('EXPENSE'),
  v.literal('INCOME'),
);

const validatePagination = (options: {readonly numItems: number}): void => {
  if (
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > ITEM_PAGE_MORE
  )
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const validateDayBounds = (
  fromDayKey: number | undefined,
  toDayKey: number | undefined,
): void => {
  if (fromDayKey === undefined && toDayKey === undefined) return;
  if (
    fromDayKey === undefined ||
    toDayKey === undefined ||
    !isValidDayKey(fromDayKey) ||
    !isValidDayKey(toDayKey) ||
    fromDayKey > toDayKey
  )
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const validateSearchAmount = (amountMinor: number): void => {
  if (!Number.isSafeInteger(amountMinor))
    throw appError('AMOUNT_INVALID', 'error.amountNotInteger');
  if (amountMinor === 0) throw appError('AMOUNT_INVALID', 'error.amountZero');
  if (
    !isValidAmountMinor(amountMinor) ||
    Math.abs(amountMinor) > MAX_AMOUNT_MINOR_ABS
  )
    throw appError('AMOUNT_INVALID', 'error.amountTooLarge');
};

const mapPage = (
  page: PaginationResult<Parameters<typeof toItemRow>[0]>,
): PaginationResult<ItemRow> => ({...page, page: page.page.map(toItemRow)});

export const list = query({
  args: {
    ledgerId: v.id('ledgers'),
    type: v.optional(itemTypeFilterValidator),
    fromDayKey: v.optional(v.number()),
    toDayKey: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    validateDayBounds(args.fromDayKey, args.toDayKey);
    const type = args.type;
    if (type === undefined) {
      const page = await ctx.db
        .query('ledgerItems')
        .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) => {
          const range = index
            .eq('ledgerId', args.ledgerId)
            .eq('deletedAt', undefined);
          return args.fromDayKey === undefined || args.toDayKey === undefined
            ? range
            : range.gte('dayKey', args.fromDayKey).lte('dayKey', args.toDayKey);
        })
        .order('desc')
        .paginate(args.paginationOpts);
      return mapPage(page);
    }
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_deletedAt_type_dayKey_occurredAt', (index) => {
        const range = index
          .eq('ledgerId', args.ledgerId)
          .eq('deletedAt', undefined)
          .eq('type', type);
        return args.fromDayKey === undefined || args.toDayKey === undefined
          ? range
          : range.gte('dayKey', args.fromDayKey).lte('dayKey', args.toDayKey);
      })
      .order('desc')
      .paginate(args.paginationOpts);
    return mapPage(page);
  },
});

export const listDeleted = query({
  args: {
    ledgerId: v.id('ledgers'),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
        index.eq('ledgerId', args.ledgerId).gt('deletedAt', undefined),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return mapPage(page);
  },
});

export const listByDay = query({
  args: {
    ledgerId: v.id('ledgers'),
    dayKey: v.number(),
    // Paginated queries preserve their page window. The reactive day rollup
    // count is passed through as a harmless query key so another device's
    // insert/delete starts a fresh first-page subscription immediately.
    refreshItemCount: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    if (!isValidDayKey(args.dayKey))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('deletedAt', undefined)
          .eq('dayKey', args.dayKey),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return mapPage(page);
  },
});

export const listByCategory = query({
  args: {
    ledgerId: v.id('ledgers'),
    categoryKey: v.string(),
    fromDayKey: v.number(),
    toDayKey: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    if (
      !isValidDayKey(args.fromDayKey) ||
      !isValidDayKey(args.toDayKey) ||
      args.fromDayKey > args.toDayKey
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex(
        'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
        (index) =>
          index
            .eq('ledgerId', args.ledgerId)
            .eq('deletedAt', undefined)
            .eq('categoryKey', args.categoryKey)
            .gte('dayKey', args.fromDayKey)
            .lte('dayKey', args.toDayKey),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return mapPage(page);
  },
});

export const get = query({
  args: {itemId: v.id('ledgerItems')},
  returns: itemRowValidator,
  handler: async (ctx, args): Promise<ItemRow> => {
    const context = await requireItemMember(ctx, args.itemId);
    return toItemRow(context.item);
  },
});

/**
 * Legacy deep-link boundary kept for deployed clients.
 *
 * Route ids are untrusted and membership can disappear while a screen is
 * mounted. Expected invalid, missing, orphaned-ledger, and non-member outcomes
 * therefore resolve to null instead of escaping through Convex's error
 * boundary. This intentionally does not reveal whether an inaccessible item
 * exists.
 */
export const getByRoute = query({
  args: {itemId: v.string()},
  returns: v.union(v.null(), itemRowValidator),
  handler: async (ctx, args): Promise<ItemRow | null> => {
    const profile = await requireOnboarded(ctx);
    const itemId = ctx.db.normalizeId('ledgerItems', args.itemId);
    if (itemId === null) return null;
    const item = await ctx.db.get('ledgerItems', itemId);
    if (item === null) return null;
    const [ledger, membership] = await Promise.all([
      ctx.db.get('ledgers', item.ledgerId),
      ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', item.ledgerId).eq('userId', profile.userId),
        )
        .unique(),
    ]);
    if (
      !ledgerIsReachable(ledger) ||
      membership === null ||
      membership.deletedAt !== undefined
    )
      return null;
    return toItemRow(item);
  },
});

/**
 * Failure-free route boundary for UI navigation. Invalid, orphaned-ledger, or
 * non-member item ids resolve to null so the client can leave the route without
 * flashing a global error boundary. Soft-deleted items remain readable to a
 * current member because the Deleted Items surface owns restoration.
 */
export const getMineByRoute = query({
  args: {itemId: v.string()},
  returns: v.union(v.null(), itemRowValidator),
  handler: async (ctx, args): Promise<ItemRow | null> => {
    const profile = await requireOnboarded(ctx);
    const itemId = ctx.db.normalizeId('ledgerItems', args.itemId);
    if (itemId === null) return null;
    const item = await ctx.db.get('ledgerItems', itemId);
    if (item === null) return null;
    const [ledger, membership] = await Promise.all([
      ctx.db.get('ledgers', item.ledgerId),
      ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', item.ledgerId).eq('userId', profile.userId),
        )
        .unique(),
    ]);
    if (
      !ledgerIsReachable(ledger) ||
      membership === null ||
      membership.deletedAt !== undefined
    )
      return null;
    return toItemRow(item);
  },
});

export const searchMemo = query({
  args: {
    ledgerId: v.id('ledgers'),
    term: v.string(),
    type: v.optional(itemTypeFilterValidator),
    categoryKey: v.optional(v.string()),
    amountMinor: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    const term = args.term.trim();
    if (term.length < 2) throw appError('INVALID_INPUT', 'error.invalidInput');
    if (args.amountMinor !== undefined) validateSearchAmount(args.amountMinor);
    const page = await ctx.db
      .query('ledgerItems')
      .withSearchIndex('search_memo', (index) => {
        let expression = index
          .search('memo', term)
          .eq('ledgerId', args.ledgerId)
          .eq('deletedAt', undefined);
        if (args.type !== undefined)
          expression = expression.eq('type', args.type);
        if (args.categoryKey !== undefined)
          expression = expression.eq('categoryKey', args.categoryKey);
        if (args.amountMinor !== undefined)
          expression = expression.eq('amountMinor', args.amountMinor);
        return expression;
      })
      .paginate(args.paginationOpts);
    return mapPage(page);
  },
});

export const searchAmount = query({
  args: {
    ledgerId: v.id('ledgers'),
    amountMinor: v.number(),
    type: v.optional(itemTypeFilterValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: pageValidator,
  handler: async (ctx, args): Promise<PaginationResult<ItemRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    validatePagination(args.paginationOpts);
    validateSearchAmount(args.amountMinor);
    const types =
      args.type === undefined
        ? (['EXPENSE', 'INCOME'] as const)
        : ([args.type] as const);
    const streams = types.map((type) =>
      stream(ctx.db, schema)
        .query('ledgerItems')
        .withIndex(
          'by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt',
          (index) =>
            index
              .eq('ledgerId', args.ledgerId)
              .eq('deletedAt', undefined)
              .eq('type', type)
              .eq('amountMinor', args.amountMinor),
        )
        .order('desc'),
    );
    const page = await mergedStream(streams, [
      'dayKey',
      'occurredAt',
      '_creationTime',
    ]).paginate(args.paginationOpts);
    return mapPage(page);
  },
});
