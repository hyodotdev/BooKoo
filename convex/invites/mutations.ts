import {v, type Infer} from 'convex/values';

import {
  encodeInviteCode,
  hashInviteCode,
  normalizeInviteCode,
} from '../../shared/inviteCode';
import {canGrantRole} from '../../shared/ledgerRoles';
import {canRedeemLedgerInvite} from '../../shared/onboarding';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {mutation} from '../lib/functions';
import {ACTIVE_INVITES_PER_LEDGER, MEMBER_SCAN_LIMIT} from '../lib/constants';
import {hasBlockRelationship, hasBlockWithLedgerMembers} from '../lib/blocks';
import {appError} from '../lib/errors';
import {
  assertLedgerWritable,
  requireLedgerRole,
} from '../lib/ledgerPermissions';
import {hasMemberCapacity, requireMemberCapacity} from '../lib/entitlements';
import {requireActiveProfile, requireOnboarded} from '../lib/permissions';
import {enforceRateLimit} from '../lib/rateLimits';
import {notifyLedgerMembers, scheduleInboxPush} from '../lib/notifications';
import {ledgerRoleValidator} from '../schema/ledgerMembers';
import {ledgerIsReachable} from '../lib/ledgerPermissions';
import {
  getAddressedInvite,
  getInviteJoinRequest,
  getInviteMembership,
  inviteIsExhausted,
  invitePredatesRemoval,
  inviteUsePatch,
  isRetiredDirectInvite,
} from './availability';

const pepper = (): string => {
  const value = process.env.INVITE_TOKEN_PEPPER?.trim();
  if (!value) throw new Error('INVITE_TOKEN_PEPPER is not configured');
  return value;
};

export const create = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    role: ledgerRoleValidator,
    requiresApproval: v.boolean(),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    note: v.optional(v.string()),
    inviteeUserId: v.optional(v.id('users')),
  },
  returns: v.object({inviteId: v.id('ledgerInvites'), code: v.string()}),
  handler: async (ctx, args) => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'MEMBER');
    assertLedgerWritable(context);
    if (
      context.ledger.invitePolicy === 'MANAGERS_ONLY' &&
      context.role !== 'OWNER' &&
      context.role !== 'ADMIN'
    )
      throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
    if (
      (args.role !== 'MEMBER' && args.role !== 'VIEWER') ||
      !canGrantRole(context.role, args.role)
    )
      throw appError('ROLE_NOT_LINKABLE', 'error.invite.roleNotLinkable');
    // The paywall belongs here, to the person expanding the ledger — not to
    // the person accepting an invitation.
    await requireMemberCapacity(
      ctx,
      context.ledger,
      context.ledger.memberCount + 1,
    );
    await enforceRateLimit(ctx, 'inviteCreate', String(context.profile.userId));
    await enforceRateLimit(
      ctx,
      'inviteCreateDaily',
      String(context.profile.userId),
    );
    const now = Date.now();
    if (
      (args.maxUses !== undefined &&
        (!Number.isSafeInteger(args.maxUses) ||
          args.maxUses < 1 ||
          args.maxUses > 100)) ||
      (args.expiresAt !== undefined &&
        (args.expiresAt <= now ||
          args.expiresAt > now + 90 * 24 * 60 * 60 * 1000))
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const note = args.note?.trim();
    if (note !== undefined && note.length > 40)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const inviteeUserId = args.inviteeUserId;
    let recipientMembership: Doc<'ledgerMembers'> | null = null;
    if (inviteeUserId !== undefined) {
      const [recipient, membership, blocked] = await Promise.all([
        ctx.db
          .query('userProfiles')
          .withIndex('by_userId', (index) => index.eq('userId', inviteeUserId))
          .unique(),
        ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('userId', inviteeUserId),
          )
          .unique(),
        hasBlockRelationship(ctx, context.profile.userId, inviteeUserId),
      ]);
      recipientMembership = membership;
      if (blocked) throw appError('NOT_FOUND', 'error.notFound');
      if (
        recipient === null ||
        recipient.deletedAt !== undefined ||
        recipient.appRole === 'SUSPENDED' ||
        recipient.isPlaceholder ||
        recipient.userId === context.profile.userId ||
        membership?.blockedAt !== undefined ||
        (membership !== null && membership.deletedAt === undefined)
      )
        throw appError('INVALID_INPUT', 'error.invalidInput');
    }
    // Count the links that are actually live. The old check took the OLDEST
    // 21 unrevoked rows — `by_ledgerId_revokedAt_createdAt` ascends, and there
    // was no `.order('desc')` — and counted the unexpired ones among them,
    // which fails in both directions.
    //
    // Every invite minted here carries an `expiresAt` (7 days by default, 90
    // at most), so on a ledger that has been sharing for a while the oldest 21
    // unrevoked rows are mostly expired: the count came out near zero and the
    // cap never bit, however many live links existed. Legacy invites are the
    // mirror image — they never expire, and they are the oldest rows on a
    // migrated ledger, so the same window filled up with them and the cap
    // jammed shut.
    //
    // Two bounded reads instead, because liveness splits on `expiresAt`:
    // the legacy rows that never expire, and the rows still in date. Convex
    // sorts `undefined` below every number, so a single `gt(now)` range would
    // silently drop the first group.
    const live = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_ledgerId_revokedAt_expiresAt', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('revokedAt', undefined)
          .eq('expiresAt', undefined),
      )
      .take(ACTIVE_INVITES_PER_LEDGER + 1);
    const unexpired =
      live.length > ACTIVE_INVITES_PER_LEDGER
        ? live
        : live.concat(
            await ctx.db
              .query('ledgerInvites')
              .withIndex('by_ledgerId_revokedAt_expiresAt', (index) =>
                index
                  .eq('ledgerId', args.ledgerId)
                  .eq('revokedAt', undefined)
                  .gt('expiresAt', now),
              )
              .take(ACTIVE_INVITES_PER_LEDGER + 1 - live.length),
          );
    if (
      inviteeUserId !== undefined &&
      unexpired.some(
        (invite) =>
          invite.inviteeUserId === inviteeUserId &&
          !inviteIsExhausted(invite) &&
          !invitePredatesRemoval(invite, recipientMembership),
      )
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    if (unexpired.length >= ACTIVE_INVITES_PER_LEDGER)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const entropy = new Uint8Array(16);
    crypto.getRandomValues(entropy);
    const code = encodeInviteCode(entropy);
    const codeHash = hashInviteCode(code, pepper());
    const duplicate = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_codeHash', (index) => index.eq('codeHash', codeHash))
      .unique();
    if (duplicate !== null)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const inviteId = await ctx.db.insert('ledgerInvites', {
      ledgerId: args.ledgerId,
      codeHash,
      role: args.role,
      source: args.inviteeUserId === undefined ? 'LINK' : 'HANDLE',
      ...(inviteeUserId !== undefined
        ? {maxUses: 1}
        : args.maxUses === undefined
          ? {}
          : {maxUses: args.maxUses}),
      useCount: 0,
      ...(args.expiresAt === undefined
        ? {expiresAt: now + 7 * 24 * 60 * 60 * 1000}
        : {expiresAt: args.expiresAt}),
      requiresApproval: args.requiresApproval,
      ...(args.inviteeUserId === undefined
        ? {}
        : {inviteeUserId: args.inviteeUserId}),
      ...(note === undefined || note.length === 0 ? {} : {note}),
      createdByUserId: context.profile.userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'INVITE_CREATED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetInviteId: inviteId,
      createdAt: now,
    });
    if (args.inviteeUserId !== undefined) {
      const notificationId = await ctx.db.insert('notifications', {
        userId: args.inviteeUserId,
        kind: 'LEDGER_INVITE',
        titleKey: 'notification.ledgerInvite.title',
        bodyKey: 'notification.ledgerInvite.body',
        params: {code, inviteId},
        fallbackTitle: 'New ledger invite',
        fallbackBody: 'You received an invitation to a shared ledger.',
        route: `/invite/${code}`,
        ledgerId: args.ledgerId,
        actorUserId: context.profile.userId,
        createdAt: now,
        updatedAt: now,
      });
      await scheduleInboxPush(ctx, notificationId);
    }
    return {inviteId, code};
  },
});

export const revoke = mutation({
  args: {inviteId: v.id('ledgerInvites')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const invite = await ctx.db.get('ledgerInvites', args.inviteId);
    if (invite === null) throw appError('NOT_FOUND', 'error.notFound');
    const context = await requireLedgerRole(ctx, invite.ledgerId, 'MEMBER', {
      allowArchived: true,
    });
    if (
      invite.createdByUserId !== profile.userId &&
      context.role !== 'OWNER' &&
      context.role !== 'ADMIN'
    )
      throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
    if (invite.revokedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(invite._id, {
      revokedAt: now,
      revokedByUserId: profile.userId,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: invite.ledgerId,
      action: 'INVITE_REVOKED',
      retention: 'AUDIT',
      actorUserId: profile.userId,
      targetInviteId: invite._id,
      createdAt: now,
    });
    return null;
  },
});

export const declineReceived = mutation({
  args: {inviteId: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const invite = await getAddressedInvite(ctx, args.inviteId, profile.userId);
    if (invite === null) throw appError('NOT_FOUND', 'error.notFound');
    if (invite.declinedAt !== undefined) return null;
    const now = Date.now();
    if (
      invite.revokedAt !== undefined ||
      (invite.expiresAt !== undefined && invite.expiresAt <= now) ||
      inviteIsExhausted(invite)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const [member, request] = await Promise.all([
      getInviteMembership(ctx, invite.ledgerId, profile.userId),
      invite.requiresApproval
        ? getInviteJoinRequest(ctx, invite.ledgerId, profile.userId)
        : null,
    ]);
    if (
      (member !== null && member.deletedAt === undefined) ||
      invitePredatesRemoval(invite, member) ||
      (request?.status === 'PENDING' && request.expiresAt > now)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    await ctx.db.patch(invite._id, {
      declinedAt: now,
      revokedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

const redeemResult = v.union(
  v.object({
    status: v.literal('JOINED'),
    ledgerId: v.id('ledgers'),
    role: ledgerRoleValidator,
  }),
  v.object({
    status: v.literal('ALREADY_MEMBER'),
    ledgerId: v.id('ledgers'),
    role: ledgerRoleValidator,
  }),
  v.object({
    status: v.literal('REQUESTED'),
    ledgerId: v.id('ledgers'),
    requestId: v.id('ledgerJoinRequests'),
  }),
  v.object({
    status: v.literal('REQUEST_PENDING'),
    ledgerId: v.id('ledgers'),
    requestId: v.id('ledgerJoinRequests'),
  }),
  v.object({
    status: v.union(
      v.literal('INVALID'),
      v.literal('EXPIRED'),
      v.literal('REVOKED'),
      v.literal('EXHAUSTED'),
      v.literal('WRONG_ACCOUNT'),
      v.literal('LEDGER_UNAVAILABLE'),
      v.literal('LEDGER_AT_CAPACITY'),
      v.literal('BLOCKED'),
    ),
  }),
);

export const redeem = mutation({
  args: {code: v.string()},
  returns: redeemResult,
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    if (
      !canRedeemLedgerInvite(
        profile.onboardingStep,
        profile.handleKey !== undefined,
      )
    )
      throw appError('ONBOARDING_REQUIRED', 'error.onboardingRequired');
    await enforceRateLimit(ctx, 'inviteRedeem', String(profile.userId));
    const code = normalizeInviteCode(args.code);
    if (code === null) return {status: 'INVALID'} as const;
    const invite = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_codeHash', (index) =>
        index.eq('codeHash', hashInviteCode(code, pepper())),
      )
      .unique();
    if (invite === null) return {status: 'INVALID'} as const;
    return redeemInvite(ctx, invite, profile.userId);
  },
});

export const redeemReceived = mutation({
  args: {inviteId: v.string()},
  returns: redeemResult,
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    await enforceRateLimit(ctx, 'inviteRedeem', String(profile.userId));
    const invite = await getAddressedInvite(ctx, args.inviteId, profile.userId);
    if (invite === null) return {status: 'INVALID'} as const;
    return redeemInvite(ctx, invite, profile.userId);
  },
});

async function redeemInvite(
  ctx: MutationCtx,
  invite: Doc<'ledgerInvites'>,
  userId: Id<'users'>,
): Promise<Infer<typeof redeemResult>> {
  const existingMember = await getInviteMembership(
    ctx,
    invite.ledgerId,
    userId,
  );
  if (existingMember !== null && existingMember.deletedAt === undefined)
    return {
      status: 'ALREADY_MEMBER',
      ledgerId: invite.ledgerId,
      role: existingMember.role,
    } as const;
  const now = Date.now();
  if (invite.revokedAt !== undefined) return {status: 'REVOKED'} as const;
  const retired = isRetiredDirectInvite(invite);
  if (!retired) {
    if (invite.expiresAt !== undefined && invite.expiresAt <= now)
      return {status: 'EXPIRED'};
    if (inviteIsExhausted(invite)) return {status: 'EXHAUSTED'};
  }
  if (invitePredatesRemoval(invite, existingMember)) return {status: 'REVOKED'};
  if (invite.inviteeUserId !== undefined && invite.inviteeUserId !== userId)
    return {status: 'WRONG_ACCOUNT'} as const;
  if (retired && !invite.requiresApproval) return {status: 'EXHAUSTED'};
  const ledger = await ctx.db.get('ledgers', invite.ledgerId);
  if (!ledgerIsReachable(ledger) || ledger.archivedAt !== undefined)
    return {status: 'LEDGER_UNAVAILABLE'} as const;
  if (
    existingMember?.blockedAt !== undefined ||
    (invite.inviteeUserId !== undefined &&
      (await hasBlockRelationship(ctx, invite.createdByUserId, userId))) ||
    (await hasBlockWithLedgerMembers(ctx, ledger._id, userId))
  )
    return {status: 'BLOCKED'} as const;
  const redemption = await ctx.db
    .query('ledgerInviteRedemptions')
    .withIndex('by_inviteId_userId', (index) =>
      index.eq('inviteId', invite._id).eq('userId', userId),
    )
    .unique();
  if (invite.requiresApproval) {
    const request = await getInviteJoinRequest(ctx, ledger._id, userId);
    if (
      request?.status === 'PENDING' &&
      (invite.inviteeUserId === undefined || request.expiresAt > now)
    )
      return {
        status: 'REQUEST_PENDING',
        ledgerId: ledger._id,
        requestId: request._id,
      } as const;
    if (retired) return {status: 'EXHAUSTED'};
    const requestValue = {
      ledgerId: ledger._id,
      userId,
      inviteId: invite._id,
      status: 'PENDING' as const,
      source: 'INVITE_LINK' as const,
      requestedAt: now,
      expiresAt: now + 14 * 24 * 60 * 60 * 1000,
      createdAt: request?.createdAt ?? now,
      updatedAt: now,
    };
    let requestId: Id<'ledgerJoinRequests'>;
    if (request === null)
      requestId = await ctx.db.insert('ledgerJoinRequests', requestValue);
    else {
      requestId = request._id;
      await ctx.db.replace(request._id, requestValue);
    }
    if (redemption === null) {
      await ctx.db.insert('ledgerInviteRedemptions', {
        inviteId: invite._id,
        ledgerId: ledger._id,
        userId,
        redeemedAt: now,
        outcome: 'REQUESTED',
      });
      await ctx.db.patch(invite._id, inviteUsePatch(invite, now));
    }
    await notifyLedgerMembers(ctx, {
      ledgerId: ledger._id,
      kind: 'JOIN_REQUESTED',
      titleKey: 'notification.joinRequested.title',
      bodyKey: 'notification.joinRequested.body',
      fallbackTitle: 'New join request',
      fallbackBody: 'A new request is waiting in your ledger.',
      route: `/ledger/${ledger._id}/requests`,
      actorUserId: userId,
      roles: ['OWNER', 'ADMIN'],
      excludeUserIds: [userId],
      now,
    });
    return {status: 'REQUESTED', ledgerId: ledger._id, requestId} as const;
  }
  if (ledger.memberCount >= MEMBER_SCAN_LIMIT)
    return {status: 'LEDGER_UNAVAILABLE'} as const;
  // The person joining is NEVER shown a paywall — docs/product/MONETIZATION.md
  // §5. A full free ledger is reported as a state of the ledger, so the client
  // can say "ask the owner" instead of asking this user to subscribe to
  // somebody else's ledger.
  if (!(await hasMemberCapacity(ctx, ledger, ledger.memberCount + 1)))
    return {status: 'LEDGER_AT_CAPACITY'} as const;
  const memberValue = {
    ledgerId: ledger._id,
    userId,
    role: invite.role,
    joinedAt: now,
    joinedVia:
      invite.source === 'EMAIL'
        ? ('INVITE_EMAIL' as const)
        : invite.source === 'HANDLE'
          ? ('INVITE_HANDLE' as const)
          : ('INVITE_LINK' as const),
    invitedByUserId: invite.createdByUserId,
    joinedViaInviteId: invite._id,
    createdAt: existingMember?.createdAt ?? now,
    updatedAt: now,
  };
  if (existingMember === null)
    await ctx.db.insert('ledgerMembers', memberValue);
  else await ctx.db.replace(existingMember._id, memberValue);
  const state = await ctx.db
    .query('ledgerMemberState')
    .withIndex('by_ledgerId_userId', (index) =>
      index.eq('ledgerId', ledger._id).eq('userId', userId),
    )
    .unique();
  const stateValue = {
    ledgerId: ledger._id,
    userId,
    lastReadAt: now,
    lastOpenedAt: now,
    muted: false,
    notifyNewItem: true,
    notifyComment: true,
    sortOrder: ledger.memberCount,
    updatedAt: now,
  };
  if (state === null) await ctx.db.insert('ledgerMemberState', stateValue);
  else await ctx.db.replace(state._id, stateValue);
  await ctx.db.patch(ledger._id, {
    memberCount: ledger.memberCount + 1,
    updatedAt: now,
  });
  if (redemption === null) {
    await ctx.db.insert('ledgerInviteRedemptions', {
      inviteId: invite._id,
      ledgerId: ledger._id,
      userId,
      redeemedAt: now,
      outcome: 'JOINED',
    });
    await ctx.db.patch(invite._id, inviteUsePatch(invite, now));
  }
  await ctx.db.insert('ledgerAuditLog', {
    ledgerId: ledger._id,
    action: 'INVITE_REDEEMED',
    retention: 'AUDIT',
    actorUserId: userId,
    targetInviteId: invite._id,
    createdAt: now,
  });
  await notifyLedgerMembers(ctx, {
    ledgerId: ledger._id,
    kind: 'MEMBER_JOINED',
    titleKey: 'notification.memberJoined.title',
    bodyKey: 'notification.memberJoined.body',
    fallbackTitle: 'New member',
    fallbackBody: 'A new member joined the ledger.',
    route: `/ledger/${ledger._id}/members`,
    actorUserId: userId,
    roles: ['OWNER', 'ADMIN'],
    excludeUserIds: [userId],
    now,
  });
  return {status: 'JOINED', ledgerId: ledger._id, role: invite.role} as const;
}
