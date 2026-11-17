import type {Triggers} from 'convex-helpers/server/triggers';

import {
  addRollup,
  itemRollupIdentities,
  isSafeRollup,
  rollupTransition,
} from '../../shared/ledgerCore';
import {rollupDelta} from '../../shared/money';
import type {DataModel, Doc, Id} from '../_generated/dataModel';
import type {DatabaseWriter} from '../_generated/server';
import {ROLLUP_SHARD_COUNT} from './constants';

export const shardOf = (userId: Id<'users'>): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % ROLLUP_SHARD_COUNT;
};

const itemCountDelta = (sign: 1 | -1): number => sign;

const assertSafe = (
  expenseMinor: number,
  incomeMinor: number,
  itemCount: number,
): void => {
  if (!isSafeRollup({expenseMinor, incomeMinor, itemCount}))
    throw new Error('Unsafe rollup total');
};

async function upsertDay(
  db: DatabaseWriter,
  item: Doc<'ledgerItems'>,
  sign: 1 | -1,
  now: number,
): Promise<void> {
  const shard = shardOf(item.authorId);
  const delta = rollupDelta(item.type, item.baseAmountMinor, sign);
  const existing = await db
    .query('ledgerDayRollups')
    .withIndex('by_ledgerId_dayKey_shard', (index) =>
      index
        .eq('ledgerId', item.ledgerId)
        .eq('dayKey', item.dayKey)
        .eq('shard', shard),
    )
    .unique();
  const next = addRollup(
    existing ?? {expenseMinor: 0, incomeMinor: 0, itemCount: 0},
    {
      ...delta,
      itemCount: itemCountDelta(sign),
    },
  );
  assertSafe(next.expenseMinor, next.incomeMinor, next.itemCount);
  if (existing === null) {
    await db.insert('ledgerDayRollups', {
      ledgerId: item.ledgerId,
      dayKey: item.dayKey,
      monthKey: item.monthKey,
      shard,
      ...next,
      updatedAt: now,
    });
  } else {
    await db.patch(existing._id, {
      ...next,
      monthKey: item.monthKey,
      updatedAt: now,
    });
  }
}

async function upsertMonth(
  db: DatabaseWriter,
  item: Doc<'ledgerItems'>,
  sign: 1 | -1,
  now: number,
): Promise<void> {
  const shard = shardOf(item.authorId);
  const delta = rollupDelta(item.type, item.baseAmountMinor, sign);
  const existing = await db
    .query('ledgerMonthRollups')
    .withIndex('by_ledgerId_monthKey_shard', (index) =>
      index
        .eq('ledgerId', item.ledgerId)
        .eq('monthKey', item.monthKey)
        .eq('shard', shard),
    )
    .unique();
  const next = addRollup(
    existing ?? {expenseMinor: 0, incomeMinor: 0, itemCount: 0},
    {
      ...delta,
      itemCount: itemCountDelta(sign),
    },
  );
  assertSafe(next.expenseMinor, next.incomeMinor, next.itemCount);
  if (existing === null) {
    await db.insert('ledgerMonthRollups', {
      ledgerId: item.ledgerId,
      monthKey: item.monthKey,
      shard,
      ...next,
      updatedAt: now,
    });
  } else {
    await db.patch(existing._id, {
      ...next,
      updatedAt: now,
      repairedAt: undefined,
    });
  }
}

async function upsertCategoryMonth(
  db: DatabaseWriter,
  item: Doc<'ledgerItems'>,
  sign: 1 | -1,
  now: number,
): Promise<void> {
  const shard = shardOf(item.authorId);
  const delta = rollupDelta(item.type, item.baseAmountMinor, sign);
  const existing = await db
    .query('ledgerCategoryMonthRollups')
    .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
      index
        .eq('ledgerId', item.ledgerId)
        .eq('monthKey', item.monthKey)
        .eq('categoryKey', item.categoryKey)
        .eq('shard', shard),
    )
    .unique();
  const next = addRollup(
    existing ?? {expenseMinor: 0, incomeMinor: 0, itemCount: 0},
    {
      ...delta,
      itemCount: itemCountDelta(sign),
    },
  );
  assertSafe(next.expenseMinor, next.incomeMinor, next.itemCount);
  if (existing === null) {
    await db.insert('ledgerCategoryMonthRollups', {
      ledgerId: item.ledgerId,
      monthKey: item.monthKey,
      categoryKey: item.categoryKey,
      shard,
      ...next,
      updatedAt: now,
    });
  } else {
    await db.patch(existing._id, {...next, updatedAt: now});
  }
}

export async function applyItemDelta(
  db: DatabaseWriter,
  item: Doc<'ledgerItems'>,
  sign: 1 | -1,
  now: number,
): Promise<void> {
  await upsertDay(db, item, sign, now);
  await upsertMonth(db, item, sign, now);
  await upsertCategoryMonth(db, item, sign, now);
}

export const registerLedgerItemTriggers = (
  triggers: Triggers<DataModel>,
): void => {
  triggers.register('ledgerItems', async (ctx, change): Promise<void> => {
    const now = Date.now();
    if (change.operation === 'insert') {
      if (change.newDoc.deletedAt === undefined)
        await applyItemDelta(ctx.innerDb, change.newDoc, 1, now);
      return;
    }
    if (change.operation === 'delete') {
      if (change.oldDoc.deletedAt === undefined)
        await applyItemDelta(ctx.innerDb, change.oldDoc, -1, now);
      return;
    }

    const oldLive = change.oldDoc.deletedAt === undefined;
    const newLive = change.newDoc.deletedAt === undefined;
    if (!oldLive || !newLive) {
      for (const sign of rollupTransition(
        oldLive ? 'live' : null,
        newLive ? 'live' : null,
      ))
        await applyItemDelta(
          ctx.innerDb,
          sign === -1 ? change.oldDoc : change.newDoc,
          sign,
          now,
        );
      return;
    }

    const oldIdentities = itemRollupIdentities(change.oldDoc);
    const newIdentities = itemRollupIdentities(change.newDoc);
    for (const sign of rollupTransition(
      oldIdentities.day,
      newIdentities.day,
    ))
      await upsertDay(
        ctx.innerDb,
        sign === -1 ? change.oldDoc : change.newDoc,
        sign,
        now,
      );
    for (const sign of rollupTransition(
      oldIdentities.month,
      newIdentities.month,
    ))
      await upsertMonth(
        ctx.innerDb,
        sign === -1 ? change.oldDoc : change.newDoc,
        sign,
        now,
      );
    for (const sign of rollupTransition(
      oldIdentities.categoryMonth,
      newIdentities.categoryMonth,
    ))
      await upsertCategoryMonth(
        ctx.innerDb,
        sign === -1 ? change.oldDoc : change.newDoc,
        sign,
        now,
      );
  });
};
