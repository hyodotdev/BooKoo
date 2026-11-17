import {v} from 'convex/values';

import {offsetMinutesAt, toDayKey, toMonthKey} from '../../shared/date';
import {isClientRequestId, isValidItemMoney} from '../../shared/ledgerCore';
import {MAX_AMOUNT_MINOR_ABS} from '../../shared/money';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {requireWritableCategory} from '../lib/categories';
import {CLIENT_RECEIPT_TTL_MS, ITEM_PURGE_GRACE_MS} from '../lib/constants';
import {appError} from '../lib/errors';
import {mutation} from '../lib/functions';
import {
  assertLedgerWritable,
  requireItemMember,
  requireLedgerRole,
} from '../lib/ledgerPermissions';
import {requestHash} from '../lib/requestHash';
import {placeValidator} from '../lib/serializers';

const itemTypeValidator = v.union(v.literal('EXPENSE'), v.literal('INCOME'));

const nullablePlaceValidator = v.union(placeValidator, v.null());

const validateClientRequestId = (value: string): void => {
  if (!isClientRequestId(value))
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const validateAmount = (
  amountMinor: number,
  currency: string,
  baseCurrency: string,
): void => {
  if (!Number.isSafeInteger(amountMinor))
    throw appError('AMOUNT_INVALID', 'error.amountNotInteger');
  if (amountMinor === 0) throw appError('AMOUNT_INVALID', 'error.amountZero');
  if (Math.abs(amountMinor) > MAX_AMOUNT_MINOR_ABS)
    throw appError('AMOUNT_INVALID', 'error.amountTooLarge');
  if (!isValidItemMoney(amountMinor, currency, baseCurrency))
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const validateOccurredAt = (value: number): void => {
  if (!Number.isSafeInteger(value))
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

const validatePlace = (
  place:
    | {
        label: string;
        lat: number;
        lng: number;
        address?: string;
        countryCode?: string;
      }
    | null
    | undefined,
): void => {
  if (place === null || place === undefined) return;
  if (
    place.label.trim().length === 0 ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lng) ||
    place.lat < -90 ||
    place.lat > 90 ||
    place.lng < -180 ||
    place.lng > 180
  )
    throw appError('INVALID_INPUT', 'error.invalidInput');
};

export const create = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    type: itemTypeValidator,
    amountMinor: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
    categoryKey: v.string(),
    memo: v.string(),
    place: v.optional(placeValidator),
    clientRequestId: v.string(),
  },
  returns: v.object({itemId: v.id('ledgerItems')}),
  handler: async (ctx, args): Promise<{itemId: Id<'ledgerItems'>}> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'MEMBER');
    assertLedgerWritable(context);
    validateClientRequestId(args.clientRequestId);
    validateAmount(
      args.amountMinor,
      args.currency,
      context.ledger.baseCurrency,
    );
    validateOccurredAt(args.occurredAt);
    validatePlace(args.place);
    const category = await requireWritableCategory(
      ctx,
      args.ledgerId,
      args.categoryKey,
      args.type,
    );
    const hash = requestHash('ITEM_CREATE', {
      ledgerId: args.ledgerId,
      type: args.type,
      amountMinor: args.amountMinor,
      currency: args.currency,
      occurredAt: args.occurredAt,
      categoryKey: args.categoryKey,
      memo: args.memo,
      place: args.place,
    });
    const existing = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_authorId_clientRequestId', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('authorId', context.profile.userId)
          .eq('clientRequestId', args.clientRequestId),
      )
      .unique();
    if (existing !== null) {
      if (existing.clientRequestHash !== hash)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      if (existing.deletedAt !== undefined)
        throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
      return {itemId: existing._id};
    }

    const now = Date.now();
    const itemId = await ctx.db.insert('ledgerItems', {
      ledgerId: args.ledgerId,
      type: args.type,
      amountMinor: args.amountMinor,
      currency: args.currency,
      baseCurrency: context.ledger.baseCurrency,
      baseAmountMinor: args.amountMinor,
      occurredAt: args.occurredAt,
      dayKey: toDayKey(args.occurredAt, context.ledger.timeZone),
      monthKey: toMonthKey(args.occurredAt, context.ledger.timeZone),
      occurredOffsetMinutes: offsetMinutesAt(
        args.occurredAt,
        context.ledger.timeZone,
      ),
      categoryKey: args.categoryKey,
      authorId: context.profile.userId,
      memo: args.memo,
      ...(args.place === undefined
        ? {}
        : {place: {...args.place, label: args.place.label.trim()}}),
      photoCount: 0,
      commentCount: 0,
      clientRequestId: args.clientRequestId,
      clientRequestHash: hash,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.actions.sendItemAdded,
      {
        kind: 'ITEM_ADDED',
        ledgerId: context.ledger._id,
        itemId,
        actorUserId: context.profile.userId,
        ledgerTitle: context.ledger.title.slice(0, 80),
        category:
          category.source === 'PRESET' && category.label === null
            ? {kind: 'PRESET', key: category.key}
            : {
                kind: 'CUSTOM',
                label: (category.label ?? category.key).slice(0, 80),
              },
        amountMinor: args.amountMinor,
        currency: args.currency,
        createdAt: now,
      },
    );
    return {itemId};
  },
});

const updateResultValidator = v.union(
  v.object({
    status: v.literal('UPDATED'),
    itemId: v.id('ledgerItems'),
    updatedAt: v.number(),
  }),
  v.object({status: v.literal('CONFLICT'), currentUpdatedAt: v.number()}),
);

type UpdateResult =
  | {
      readonly status: 'UPDATED';
      readonly itemId: Id<'ledgerItems'>;
      readonly updatedAt: number;
    }
  | {readonly status: 'CONFLICT'; readonly currentUpdatedAt: number};

export const update = mutation({
  args: {
    itemId: v.id('ledgerItems'),
    expectedUpdatedAt: v.number(),
    type: v.optional(itemTypeValidator),
    amountMinor: v.optional(v.number()),
    currency: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    categoryKey: v.optional(v.string()),
    memo: v.optional(v.string()),
    place: v.optional(nullablePlaceValidator),
    clientRequestId: v.string(),
  },
  returns: updateResultValidator,
  handler: async (ctx, args): Promise<UpdateResult> => {
    const context = await requireItemMember(ctx, args.itemId, {
      requireEdit: true,
    });
    assertLedgerWritable(context);
    validateClientRequestId(args.clientRequestId);
    const nextType = args.type ?? context.item.type;
    if (nextType === 'TRANSFER')
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const nextAmount = args.amountMinor ?? context.item.amountMinor;
    const nextCurrency = args.currency ?? context.item.currency;
    validateAmount(nextAmount, nextCurrency, context.ledger.baseCurrency);
    const nextOccurredAt = args.occurredAt ?? context.item.occurredAt;
    validateOccurredAt(nextOccurredAt);
    validatePlace(args.place);
    const nextCategoryKey = args.categoryKey ?? context.item.categoryKey;
    if (args.categoryKey !== undefined || args.type !== undefined)
      await requireWritableCategory(
        ctx,
        context.item.ledgerId,
        nextCategoryKey,
        nextType,
      );

    const hash = requestHash('ITEM_UPDATE', {
      itemId: args.itemId,
      expectedUpdatedAt: args.expectedUpdatedAt,
      type: args.type,
      amountMinor: args.amountMinor,
      currency: args.currency,
      occurredAt: args.occurredAt,
      categoryKey: args.categoryKey,
      memo: args.memo,
      place: args.place,
    });
    const receipt = await ctx.db
      .query('clientMutationReceipts')
      .withIndex('by_userId_clientRequestId', (index) =>
        index
          .eq('userId', context.profile.userId)
          .eq('clientRequestId', args.clientRequestId),
      )
      .unique();
    if (receipt !== null) {
      if (receipt.requestHash !== hash || receipt.itemId !== args.itemId)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      return {
        status: 'UPDATED',
        itemId: receipt.itemId,
        updatedAt: receipt.resultUpdatedAt,
      };
    }
    if (context.item.updatedAt !== args.expectedUpdatedAt)
      return {status: 'CONFLICT', currentUpdatedAt: context.item.updatedAt};

    const now = Date.now();
    const updatedAt = Math.max(now, context.item.updatedAt + 1);
    await ctx.db.patch(context.item._id, {
      type: nextType,
      amountMinor: nextAmount,
      currency: nextCurrency,
      baseCurrency: context.ledger.baseCurrency,
      baseAmountMinor: nextAmount,
      occurredAt: nextOccurredAt,
      dayKey: toDayKey(nextOccurredAt, context.ledger.timeZone),
      monthKey: toMonthKey(nextOccurredAt, context.ledger.timeZone),
      occurredOffsetMinutes: offsetMinutesAt(
        nextOccurredAt,
        context.ledger.timeZone,
      ),
      categoryKey: nextCategoryKey,
      ...(args.memo === undefined ? {} : {memo: args.memo}),
      ...(args.place === undefined
        ? {}
        : {
            place:
              args.place === null
                ? undefined
                : {...args.place, label: args.place.label.trim()},
          }),
      updatedByUserId: context.profile.userId,
      updatedAt,
    });
    await ctx.db.insert('clientMutationReceipts', {
      userId: context.profile.userId,
      ledgerId: context.item.ledgerId,
      itemId: context.item._id,
      clientRequestId: args.clientRequestId,
      requestHash: hash,
      resultUpdatedAt: updatedAt,
      createdAt: now,
      expiresAt: now + CLIENT_RECEIPT_TTL_MS,
    });
    return {status: 'UPDATED', itemId: context.item._id, updatedAt};
  },
});

export const softDelete = mutation({
  args: {itemId: v.id('ledgerItems')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireItemMember(ctx, args.itemId, {
      allowDeleted: true,
      requireEdit: true,
    });
    assertLedgerWritable(context);
    if (context.item.deletedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(context.item._id, {
      deletedAt: now,
      deletedByUserId: context.profile.userId,
      updatedByUserId: context.profile.userId,
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: context.item.ledgerId,
      action: 'ITEM_DELETED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetItemId: context.item._id,
      createdAt: now,
    });
    return null;
  },
});

export const restore = mutation({
  args: {itemId: v.id('ledgerItems')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireItemMember(ctx, args.itemId, {
      allowDeleted: true,
      requireEdit: true,
    });
    assertLedgerWritable(context);
    if (context.item.deletedAt === undefined) return null;
    const now = Date.now();
    if (now - context.item.deletedAt >= ITEM_PURGE_GRACE_MS)
      throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
    await ctx.db.patch(context.item._id, {
      deletedAt: undefined,
      deletedByUserId: undefined,
      updatedByUserId: context.profile.userId,
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: context.item.ledgerId,
      action: 'ITEM_RESTORED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetItemId: context.item._id,
      createdAt: now,
    });
    return null;
  },
});
