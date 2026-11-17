import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {normalizeInviteCode, hashInviteCode} from '../../shared/inviteCode';
import {getCurrentProfile, requireOnboarded} from '../lib/permissions';
import type {Doc, Id} from '../_generated/dataModel';
import {query, type QueryCtx} from '../_generated/server';
import {
  ACTIVE_INVITES_PER_LEDGER,
  INVITE_PAGE_SCAN_LIMIT,
  INVITE_PAGE_SIZE,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {hasBlockRelationship} from '../lib/blocks';
import {
  getAddressedInvite,
  getInviteJoinRequest,
  getInviteMembership,
  inviteIsExhausted,
  invitePredatesRemoval,
  isRetiredDirectInvite,
} from './availability';
import {ledgerIsReachable, requireLedgerRole} from '../lib/ledgerPermissions';
import {ledgerRoleValidator, type LedgerRole} from '../schema/ledgerMembers';

const previewValidator = v.union(
  v.object({status: v.literal('INVALID')}),
  v.object({status: v.literal('EXPIRED')}),
  v.object({status: v.literal('REVOKED')}),
  v.object({status: v.literal('DECLINED')}),
  v.object({status: v.literal('EXHAUSTED')}),
  v.object({status: v.literal('LEDGER_UNAVAILABLE')}),
  v.object({
    status: v.literal('OK'),
    ledger: v.object({
      title: v.string(),
      description: v.string(),
      colorKey: v.string(),
      memberCount: v.number(),
    }),
    inviter: v.object({
      displayName: v.string(),
      handle: v.union(v.string(), v.null()),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    role: ledgerRoleValidator,
    requiresApproval: v.boolean(),
    expiresAt: v.union(v.number(), v.null()),
    alreadyMember: v.boolean(),
    addressedToViewer: v.optional(v.boolean()),
    requestPending: v.optional(v.boolean()),
  }),
);

const pepper = (): string | null =>
  process.env.INVITE_TOKEN_PEPPER?.trim() || null;

const inviteRowValidator = v.object({
  id: v.id('ledgerInvites'),
  role: ledgerRoleValidator,
  note: v.union(v.string(), v.null()),
  useCount: v.number(),
  maxUses: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

const receivedInviteValidator = v.object({
  id: v.id('ledgerInvites'),
  ledgerId: v.id('ledgers'),
  title: v.string(),
  role: ledgerRoleValidator,
  expiresAt: v.union(v.number(), v.null()),
});
type ReceivedInvite = {
  id: Id<'ledgerInvites'>;
  ledgerId: Id<'ledgers'>;
  title: string;
  role: LedgerRole;
  expiresAt: number | null;
};

export const preview = query({
  args: {code: v.string(), now: v.number()},
  returns: previewValidator,
  handler: async (ctx, args) => {
    const profile = await getCurrentProfile(ctx);
    const code = normalizeInviteCode(args.code);
    const secret = pepper();
    if (code === null || secret === null) return {status: 'INVALID'} as const;
    const invite = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_codeHash', (index) =>
        index.eq('codeHash', hashInviteCode(code, secret)),
      )
      .unique();
    return describeInvite(ctx, invite, profile?.userId, args.now);
  },
});

export const previewReceived = query({
  args: {inviteId: v.string(), now: v.number()},
  returns: previewValidator,
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    const invite = await getAddressedInvite(ctx, args.inviteId, profile.userId);
    if (invite?.declinedAt !== undefined) return {status: 'DECLINED'} as const;
    return describeInvite(ctx, invite, profile.userId, args.now);
  },
});

async function hasPendingRequest(
  ctx: QueryCtx,
  ledgerId: Id<'ledgers'>,
  userId: Id<'users'>,
  now: number,
): Promise<boolean> {
  const request = await getInviteJoinRequest(ctx, ledgerId, userId);
  return request?.status === 'PENDING' && request.expiresAt > now;
}

async function describeInvite(
  ctx: QueryCtx,
  invite: Doc<'ledgerInvites'> | null,
  userId: Id<'users'> | undefined,
  now: number,
): Promise<Infer<typeof previewValidator>> {
  if (invite === null) return {status: 'INVALID'};
  if (invite.revokedAt !== undefined) return {status: 'REVOKED'};
  const addressedToViewer =
    userId !== undefined && invite.inviteeUserId === userId;
  const retired = addressedToViewer && isRetiredDirectInvite(invite);
  if (!retired && invite.expiresAt !== undefined && invite.expiresAt <= now)
    return {status: 'EXPIRED'};
  const [member, blocked, requestPending] = addressedToViewer
    ? await Promise.all([
        getInviteMembership(ctx, invite.ledgerId, userId),
        hasBlockRelationship(ctx, invite.createdByUserId, userId),
        invite.requiresApproval &&
          hasPendingRequest(ctx, invite.ledgerId, userId, now),
      ])
    : [undefined, false, false];
  if (blocked || member?.blockedAt !== undefined) return {status: 'INVALID'};
  if (invitePredatesRemoval(invite, member ?? null)) return {status: 'REVOKED'};
  const alreadyMember = member != null && member.deletedAt === undefined;
  if (!requestPending && !alreadyMember && inviteIsExhausted(invite))
    return {status: 'EXHAUSTED'};
  const ledger = await ctx.db.get('ledgers', invite.ledgerId);
  if (!ledgerIsReachable(ledger) || ledger.archivedAt !== undefined)
    return {status: 'LEDGER_UNAVAILABLE'};
  const [inviter, membership] = await Promise.all([
    ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (index) =>
        index.eq('userId', invite.createdByUserId),
      )
      .unique(),
    member !== undefined || userId === undefined
      ? (member ?? null)
      : getInviteMembership(ctx, ledger._id, userId),
  ]);
  return {
    status: 'OK',
    ledger: {
      title: ledger.title,
      description: ledger.description,
      colorKey: ledger.colorKey,
      memberCount: ledger.memberCount,
    },
    inviter: {
      displayName: inviter?.displayName ?? '',
      handle: inviter?.handle ?? null,
      avatarUrl: inviter?.avatarThumbUrl ?? inviter?.avatarUrl ?? null,
    },
    role: invite.role,
    requiresApproval: invite.requiresApproval,
    expiresAt: retired ? null : (invite.expiresAt ?? null),
    alreadyMember: membership !== null && membership.deletedAt === undefined,
    ...(addressedToViewer ? {addressedToViewer} : {}),
    ...(requestPending ? {requestPending} : {}),
  };
}

export const list = query({
  args: {ledgerId: v.id('ledgers'), now: v.number()},
  returns: v.array(inviteRowValidator),
  handler: async (ctx, args) => {
    await requireLedgerRole(ctx, args.ledgerId, 'ADMIN', {allowArchived: true});
    const rows = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_ledgerId_revokedAt_createdAt', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('revokedAt', undefined),
      )
      .order('desc')
      .take(ACTIVE_INVITES_PER_LEDGER + 1);
    return rows
      .filter((row) => row.expiresAt === undefined || row.expiresAt > args.now)
      .slice(0, ACTIVE_INVITES_PER_LEDGER)
      .map((row) => ({
        id: row._id,
        role: row.role,
        note: row.note ?? null,
        useCount: row.useCount,
        maxUses: row.maxUses ?? null,
        expiresAt: row.expiresAt ?? null,
        createdAt: row.createdAt,
      }));
  },
});

export const listPaginated = query({
  args: {
    ledgerId: v.id('ledgers'),
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(inviteRowValidator),
  handler: async (ctx, args) => {
    await requireLedgerRole(ctx, args.ledgerId, 'ADMIN', {allowArchived: true});
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > INVITE_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_ledgerId_revokedAt_createdAt', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('revokedAt', undefined),
      )
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: INVITE_PAGE_SCAN_LIMIT,
      });
    return {
      ...rows,
      // Expiry narrowing is bounded by INVITE_PAGE_SCAN_LIMIT (100).
      page: rows.page
        .filter(
          (row) => row.expiresAt === undefined || row.expiresAt > args.now,
        )
        .map((row) => ({
          id: row._id,
          role: row.role,
          note: row.note ?? null,
          useCount: row.useCount,
          maxUses: row.maxUses ?? null,
          expiresAt: row.expiresAt ?? null,
          createdAt: row.createdAt,
        })),
    };
  },
});

/** Legacy bounded contract kept for deployed clients. */
export const received = query({
  args: {now: v.number()},
  returns: v.array(receivedInviteValidator),
  handler: async (ctx, args): Promise<ReceivedInvite[]> => {
    const profile = await requireOnboarded(ctx);
    const rows = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_inviteeUserId_revokedAt', (index) =>
        index.eq('inviteeUserId', profile.userId).eq('revokedAt', undefined),
      )
      .take(ACTIVE_INVITES_PER_LEDGER + 1);
    const result: ReceivedInvite[] = [];
    for (const row of rows) {
      if (row.expiresAt !== undefined && row.expiresAt <= args.now) continue;
      const ledger = await ctx.db.get('ledgers', row.ledgerId);
      if (ledgerIsReachable(ledger) && ledger.archivedAt === undefined)
        result.push({
          id: row._id,
          ledgerId: ledger._id,
          title: ledger.title,
          role: row.role,
          expiresAt: row.expiresAt ?? null,
        });
    }
    return result;
  },
});

export const receivedPaginated = query({
  args: {now: v.number(), paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(receivedInviteValidator),
  handler: async (ctx, args): Promise<PaginationResult<ReceivedInvite>> => {
    const profile = await requireOnboarded(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > INVITE_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_inviteeUserId_revokedAt', (index) =>
        index.eq('inviteeUserId', profile.userId).eq('revokedAt', undefined),
      )
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: INVITE_PAGE_SCAN_LIMIT,
      });
    const page = await Promise.all(
      rows.page.map(async (row) => {
        if (
          inviteIsExhausted(row) ||
          (row.expiresAt !== undefined && row.expiresAt <= args.now)
        )
          return null;
        const [ledger, membership, pending, blocked] = await Promise.all([
          ctx.db.get('ledgers', row.ledgerId),
          getInviteMembership(ctx, row.ledgerId, profile.userId),
          row.requiresApproval &&
            hasPendingRequest(ctx, row.ledgerId, profile.userId, args.now),
          hasBlockRelationship(ctx, row.createdByUserId, profile.userId),
        ]);
        if (
          !ledgerIsReachable(ledger) ||
          ledger.archivedAt !== undefined ||
          (membership !== null && membership.deletedAt === undefined) ||
          membership?.blockedAt !== undefined ||
          invitePredatesRemoval(row, membership) ||
          pending ||
          blocked
        )
          return null;
        return {
          id: row._id,
          ledgerId: ledger._id,
          title: ledger.title,
          role: row.role,
          expiresAt: row.expiresAt ?? null,
        };
      }),
    );
    return {
      ...rows,
      // Indexed point reads are bounded by the invite page's 100-row scan cap.
      page: page.filter((row): row is NonNullable<typeof row> => row !== null),
    };
  },
});
