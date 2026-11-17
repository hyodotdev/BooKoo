import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {ledgerIsReachable} from './ledgerPermissions';

export interface ItemAddedPushPayload {
  readonly kind: 'ITEM_ADDED';
  readonly ledgerId: Id<'ledgers'>;
  readonly itemId: Id<'ledgerItems'>;
  readonly actorUserId: Id<'users'>;
  readonly ledgerTitle: string;
  readonly category:
    | {readonly kind: 'PRESET'; readonly key: string}
    | {readonly kind: 'CUSTOM'; readonly label: string};
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: number;
}

export async function requireItemPushSource(
  ctx: MutationCtx,
  payload: ItemAddedPushPayload,
): Promise<{readonly item: Doc<'ledgerItems'>; readonly ledger: Doc<'ledgers'>}> {
  const item = await ctx.db.get('ledgerItems', payload.itemId);
  const ledger = await ctx.db.get('ledgers', payload.ledgerId);
  if (
    item === null ||
    !ledgerIsReachable(ledger) ||
    item.deletedAt !== undefined ||
    item.ledgerId !== ledger._id ||
    item.authorId !== payload.actorUserId ||
    item.amountMinor !== payload.amountMinor ||
    item.currency !== payload.currency ||
    item.createdAt !== payload.createdAt
  )
    throw new Error('Item push source invalid');
  return {item, ledger};
}

export async function requireInboxPushSource(
  ctx: MutationCtx,
  notificationId: Id<'notifications'>,
): Promise<{
  readonly notification: Doc<'notifications'>;
  readonly profile: Doc<'userProfiles'>;
}> {
  const notification = await ctx.db.get('notifications', notificationId);
  if (
    notification === null ||
    notification.deletedAt !== undefined ||
    notification.kind === 'JOIN_REJECTED'
  )
    throw new Error('Inbox push source invalid');
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (index) =>
      index.eq('userId', notification.userId),
    )
    .unique();
  if (
    profile === null ||
    profile.deletedAt !== undefined ||
    profile.purgedAt !== undefined ||
    profile.appRole === 'SUSPENDED'
  )
    throw new Error('Inbox push recipient invalid');
  return {notification, profile};
}
