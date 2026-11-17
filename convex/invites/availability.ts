import type {Doc, Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';

export function inviteIsExhausted(invite: Doc<'ledgerInvites'>): boolean {
  return invite.maxUses !== undefined && invite.useCount >= invite.maxUses;
}

export function invitePredatesRemoval(
  invite: Doc<'ledgerInvites'>,
  membership: Doc<'ledgerMembers'> | null,
): boolean {
  return (
    invite.inviteeUserId !== undefined &&
    membership?.deletedAt !== undefined &&
    invite.createdAt <= membership.deletedAt
  );
}

export function inviteUsePatch(
  invite: Pick<Doc<'ledgerInvites'>, 'inviteeUserId' | 'maxUses' | 'useCount'>,
  now: number,
): Pick<
  Doc<'ledgerInvites'>,
  'useCount' | 'lastUsedAt' | 'updatedAt' | 'expiresAt'
> {
  return {
    useCount: invite.useCount + 1,
    lastUsedAt: now,
    updatedAt: now,
    // A consumed direct invitation no longer occupies an active invite slot.
    // Reuse the expiry index so history does not add work to the cap check.
    ...(invite.inviteeUserId !== undefined && invite.maxUses === 1
      ? {expiresAt: now}
      : {}),
  };
}

export function isRetiredDirectInvite(invite: Doc<'ledgerInvites'>): boolean {
  return (
    invite.inviteeUserId !== undefined &&
    invite.maxUses === 1 &&
    inviteIsExhausted(invite) &&
    invite.lastUsedAt !== undefined &&
    invite.expiresAt === invite.lastUsedAt
  );
}

export async function getAddressedInvite(
  ctx: QueryCtx,
  inviteId: string,
  userId: Id<'users'>,
): Promise<Doc<'ledgerInvites'> | null> {
  const id = ctx.db.normalizeId('ledgerInvites', inviteId);
  if (id === null) return null;
  const invite = await ctx.db.get('ledgerInvites', id);
  return invite?.inviteeUserId === userId ? invite : null;
}

export function getInviteMembership(
  ctx: QueryCtx,
  ledgerId: Id<'ledgers'>,
  userId: Id<'users'>,
): Promise<Doc<'ledgerMembers'> | null> {
  return ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', ledgerId).eq('userId', userId),
    )
    .unique();
}

export function getInviteJoinRequest(
  ctx: QueryCtx,
  ledgerId: Id<'ledgers'>,
  userId: Id<'users'>,
): Promise<Doc<'ledgerJoinRequests'> | null> {
  return ctx.db
    .query('ledgerJoinRequests')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', ledgerId).eq('userId', userId),
    )
    .unique();
}
