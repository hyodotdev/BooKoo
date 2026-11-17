import type {Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';
import {MEMBER_SCAN_LIMIT} from './constants';
import {appError} from './errors';

type ReadCtx = QueryCtx | MutationCtx;

export async function hasBlockRelationship(
  ctx: ReadCtx,
  firstUserId: Id<'users'>,
  secondUserId: Id<'users'>,
): Promise<boolean> {
  if (firstUserId === secondUserId) return false;
  const firstBlockedSecond = await ctx.db
    .query('userBlocks')
    .withIndex('by_blockerUserId_blockedUserId', (index) =>
      index
        .eq('blockerUserId', firstUserId)
        .eq('blockedUserId', secondUserId),
    )
    .unique();
  if (firstBlockedSecond !== null) return true;
  const secondBlockedFirst = await ctx.db
    .query('userBlocks')
    .withIndex('by_blockerUserId_blockedUserId', (index) =>
      index
        .eq('blockerUserId', secondUserId)
        .eq('blockedUserId', firstUserId),
    )
    .unique();
  return secondBlockedFirst !== null;
}

export async function hasBlockWithLedgerMembers(
  ctx: ReadCtx,
  ledgerId: Id<'ledgers'>,
  candidateUserId: Id<'users'>,
): Promise<boolean> {
  const members = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_deletedAt_role', (index) =>
      index.eq('ledgerId', ledgerId).eq('deletedAt', undefined),
    )
    .take(MEMBER_SCAN_LIMIT + 1);
  if (members.length > MEMBER_SCAN_LIMIT)
    throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
  for (const member of members) {
    if (
      member.userId !== candidateUserId &&
      (await hasBlockRelationship(ctx, member.userId, candidateUserId))
    )
      return true;
  }
  return false;
}
