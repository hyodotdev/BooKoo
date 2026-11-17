import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';
import type {LedgerRole} from '../schema/ledgerMembers';
import {
  canActOnRole,
  canEditLedgerItem,
  canGrantRole,
  hasLedgerRole,
  LEDGER_ROLE_RANK,
} from '../../shared/ledgerRoles';
import {appError} from './errors';
import {requireOnboarded} from './permissions';

type LedgerCtx = QueryCtx | MutationCtx;

export {hasLedgerRole, LEDGER_ROLE_RANK};

export interface LedgerContext {
  readonly profile: Doc<'userProfiles'>;
  readonly ledger: Doc<'ledgers'>;
  readonly membership: Doc<'ledgerMembers'>;
  readonly role: LedgerRole;
}

export interface ItemContext extends LedgerContext {
  readonly item: Doc<'ledgerItems'>;
}

export interface CommentContext extends ItemContext {
  readonly comment: Doc<'itemComments'>;
}

export interface PhotoContext extends ItemContext {
  readonly photo: Doc<'itemPhotos'>;
}

export interface JoinRequestContext extends LedgerContext {
  readonly request: Doc<'ledgerJoinRequests'>;
}

/**
 * Whether a ledger's rows may still be reached at all.
 *
 * `orphanedAt` is set when the last person entitled to a ledger deletes their
 * account (`user/deletion.ts`), so the rows outlive everyone who may read them.
 * `deletedAt` is the ordinary soft delete.
 *
 * This is a predicate rather than a thrower because each caller reports a
 * different not-found code — an item, a comment, a photo and a ledger are
 * distinct 404s to the client. What must not differ is the condition, and it
 * did: `requireLedgerRole` gained the `orphanedAt` half while every other gate
 * kept its own inline copy of the old one. Exported so the gates outside this
 * file share the condition rather than restating it.
 */
export const ledgerIsReachable = (
  ledger: Doc<'ledgers'> | null,
): ledger is Doc<'ledgers'> =>
  ledger !== null &&
  ledger.deletedAt === undefined &&
  ledger.orphanedAt === undefined;

export async function requireLedgerRole(
  ctx: LedgerCtx,
  ledgerId: Id<'ledgers'>,
  minimum: LedgerRole,
  options: {readonly allowArchived?: boolean} = {},
): Promise<LedgerContext> {
  const profile = await requireOnboarded(ctx);
  const ledger = await ctx.db.get('ledgers', ledgerId);
  // `orphanedAt` is set when the last person entitled to a ledger deletes their
  // account (`user/deletion.ts`) — the rows outlive everyone who may read them.
  // `ledgers/queries.ts` and `items/queries.ts` already hide those, but hiding a
  // ledger from a list is not an authorization check. A membership row minted
  // from an invite that outlived its owner passes the lookup below, so without
  // this the entries stay reachable by id to whoever redeemed it.
  if (!ledgerIsReachable(ledger))
    throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');

  const membership = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', ledgerId).eq('userId', profile.userId),
    )
    .unique();
  if (membership === null || membership.deletedAt !== undefined)
    throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
  if (!hasLedgerRole(membership.role, minimum))
    throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
  if (
    ledger.archivedAt !== undefined &&
    !options.allowArchived &&
    LEDGER_ROLE_RANK[minimum] > LEDGER_ROLE_RANK.VIEWER
  )
    throw appError('LEDGER_ARCHIVED', 'error.ledger.archived');

  return {profile, ledger, membership, role: membership.role};
}

export const requireLedgerMember = (
  ctx: LedgerCtx,
  ledgerId: Id<'ledgers'>,
): Promise<LedgerContext> =>
  requireLedgerRole(ctx, ledgerId, 'VIEWER', {allowArchived: true});

export async function requireJoinRequestAdmin(
  ctx: LedgerCtx,
  requestId: Id<'ledgerJoinRequests'>,
): Promise<JoinRequestContext> {
  const profile = await requireOnboarded(ctx);
  const request = await ctx.db.get('ledgerJoinRequests', requestId);
  if (request === null) throw appError('NOT_FOUND', 'error.notFound');
  const context = await requireLedgerRole(ctx, request.ledgerId, 'ADMIN');
  return {...context, profile, request};
}

export async function requireItemMember(
  ctx: LedgerCtx,
  itemId: Id<'ledgerItems'>,
  options: {
    readonly allowDeleted?: boolean;
    readonly requireEdit?: boolean;
  } = {},
): Promise<ItemContext> {
  const profile = await requireOnboarded(ctx);
  const item = await ctx.db.get('ledgerItems', itemId);
  if (item === null || (item.deletedAt !== undefined && !options.allowDeleted))
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const ledger = await ctx.db.get('ledgers', item.ledgerId);
  if (!ledgerIsReachable(ledger))
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const membership = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', item.ledgerId).eq('userId', profile.userId),
    )
    .unique();
  if (membership === null || membership.deletedAt !== undefined)
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');

  const ledgerContext: LedgerContext = {
    profile,
    ledger,
    membership,
    role: membership.role,
  };
  if (options.requireEdit && !canEditItem(ledgerContext, item))
    throw appError('ITEM_FORBIDDEN', 'error.item.forbidden');
  return {...ledgerContext, item};
}

export async function requireCommentMember(
  ctx: LedgerCtx,
  commentId: Id<'itemComments'>,
  options: {readonly allowDeleted?: boolean} = {},
): Promise<CommentContext> {
  const profile = await requireOnboarded(ctx);
  const comment = await ctx.db.get('itemComments', commentId);
  if (
    comment === null ||
    (comment.deletedAt !== undefined && !options.allowDeleted)
  )
    throw appError('NOT_FOUND', 'error.notFound');
  const item = await ctx.db.get('ledgerItems', comment.itemId);
  if (item === null || item.deletedAt !== undefined)
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const ledger = await ctx.db.get('ledgers', comment.ledgerId);
  if (!ledgerIsReachable(ledger))
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const membership = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', comment.ledgerId).eq('userId', profile.userId),
    )
    .unique();
  if (membership === null || membership.deletedAt !== undefined)
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  return {
    profile,
    ledger,
    membership,
    role: membership.role,
    item,
    comment,
  };
}

export async function requirePhotoMember(
  ctx: LedgerCtx,
  photoId: Id<'itemPhotos'>,
  options: {
    readonly allowDeleted?: boolean;
    readonly requireEdit?: boolean;
  } = {},
): Promise<PhotoContext> {
  const profile = await requireOnboarded(ctx);
  const photo = await ctx.db.get('itemPhotos', photoId);
  if (
    photo === null ||
    (photo.deletedAt !== undefined && !options.allowDeleted)
  )
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const item = await ctx.db.get('ledgerItems', photo.itemId);
  if (item === null || item.deletedAt !== undefined)
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const ledger = await ctx.db.get('ledgers', photo.ledgerId);
  if (!ledgerIsReachable(ledger))
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const membership = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', photo.ledgerId).eq('userId', profile.userId),
    )
    .unique();
  if (membership === null || membership.deletedAt !== undefined)
    throw appError('ITEM_NOT_FOUND', 'error.item.notFound');
  const ledgerContext: LedgerContext = {
    profile,
    ledger,
    membership,
    role: membership.role,
  };
  if (options.requireEdit && !canEditItem(ledgerContext, item))
    throw appError('ITEM_FORBIDDEN', 'error.item.forbidden');
  return {...ledgerContext, item, photo};
}

export const canEditItem = (
  context: {
    readonly profile: Pick<Doc<'userProfiles'>, 'userId'>;
    readonly role: LedgerRole;
  },
  item: Pick<Doc<'ledgerItems'>, 'authorId'>,
): boolean => {
  return canEditLedgerItem(context.role, item.authorId, context.profile.userId);
};

export const assertLedgerWritable = (context: LedgerContext): void => {
  if (context.ledger.archivedAt !== undefined)
    throw appError('LEDGER_ARCHIVED', 'error.ledger.archived');
  if (context.ledger.maintenanceLock !== 'NONE')
    throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
};

export const assertCanActOn = (actor: LedgerRole, target: LedgerRole): void => {
  if (!canActOnRole(actor, target))
    throw appError('CANNOT_ACT_ON_PEER', 'error.ledger.cannotActOnPeer');
};

export const assertCanGrant = (
  actor: LedgerRole,
  granted: LedgerRole,
): void => {
  if (!canGrantRole(actor, granted))
    throw appError('CANNOT_GRANT_ROLE', 'error.ledger.cannotGrantRole');
};

export async function requireDeletedLedgerOwner(
  ctx: LedgerCtx,
  ledgerId: Id<'ledgers'>,
): Promise<{profile: Doc<'userProfiles'>; ledger: Doc<'ledgers'>}> {
  const profile = await requireOnboarded(ctx);
  const ledger = await ctx.db.get('ledgers', ledgerId);
  if (
    ledger === null ||
    ledger.ownerId !== profile.userId ||
    ledger.deletedAt === undefined
  )
    throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
  return {profile, ledger};
}
