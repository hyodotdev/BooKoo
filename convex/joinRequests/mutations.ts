import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {MEMBER_SCAN_LIMIT} from '../lib/constants';
import {hasBlockWithLedgerMembers} from '../lib/blocks';
import {appError} from '../lib/errors';
import {requireJoinRequestAdmin} from '../lib/ledgerPermissions';
import {requireMemberCapacity} from '../lib/entitlements';
import {enforceRateLimit} from '../lib/rateLimits';
import {notifyLedgerMembers, scheduleInboxPush} from '../lib/notifications';

export const decide = mutation({
  args: {requestId: v.id('ledgerJoinRequests'), approve: v.boolean()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireJoinRequestAdmin(ctx, args.requestId);
    const {request} = context;
    await enforceRateLimit(
      ctx,
      'ledgerMemberChurn',
      String(context.profile.userId),
    );
    if (request.status !== 'PENDING' || request.expiresAt <= Date.now())
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    if (!args.approve) {
      await ctx.db.patch(request._id, {
        status: 'REJECTED',
        decidedByUserId: context.profile.userId,
        decidedAt: now,
        updatedAt: now,
      });
      await ctx.db.insert('ledgerAuditLog', {
        ledgerId: request.ledgerId,
        action: 'JOIN_REJECTED',
        retention: 'AUDIT',
        actorUserId: context.profile.userId,
        targetUserId: request.userId,
        createdAt: now,
      });
      await ctx.db.insert('notifications', {
        userId: request.userId,
        kind: 'JOIN_REJECTED',
        titleKey: 'notification.joinRejected.title',
        bodyKey: 'notification.joinRejected.body',
        params: {},
        fallbackTitle: 'Request declined',
        fallbackBody: 'Your request was declined.',
        ledgerId: request.ledgerId,
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (
      await hasBlockWithLedgerMembers(ctx, request.ledgerId, request.userId)
    ) {
      await ctx.db.patch(request._id, {
        status: 'BLOCKED',
        decidedByUserId: context.profile.userId,
        decidedAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (context.ledger.memberCount >= MEMBER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    // The approver is expanding the ledger, so the paywall belongs to them.
    // The requester never sees it: their request simply stays pending.
    await requireMemberCapacity(
      ctx,
      context.ledger,
      context.ledger.memberCount + 1,
    );
    const member = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', request.ledgerId).eq('userId', request.userId),
      )
      .unique();
    if (member?.blockedAt !== undefined) {
      await ctx.db.patch(request._id, {
        status: 'BLOCKED',
        decidedByUserId: context.profile.userId,
        decidedAt: now,
        updatedAt: now,
      });
      return null;
    }
    const memberValue = {
      ledgerId: request.ledgerId,
      userId: request.userId,
      role: 'MEMBER' as const,
      joinedAt: now,
      joinedVia: 'REQUEST_APPROVED' as const,
      invitedByUserId: context.profile.userId,
      ...(request.inviteId === undefined
        ? {}
        : {joinedViaInviteId: request.inviteId}),
      createdAt: member?.createdAt ?? now,
      updatedAt: now,
    };
    if (member === null) await ctx.db.insert('ledgerMembers', memberValue);
    else await ctx.db.replace(member._id, memberValue);
    const state = await ctx.db
      .query('ledgerMemberState')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', request.ledgerId).eq('userId', request.userId),
      )
      .unique();
    const stateValue = {
      ledgerId: request.ledgerId,
      userId: request.userId,
      lastReadAt: now,
      lastOpenedAt: now,
      muted: false,
      notifyNewItem: true,
      notifyComment: true,
      sortOrder: context.ledger.memberCount,
      updatedAt: now,
    };
    if (state === null) await ctx.db.insert('ledgerMemberState', stateValue);
    else await ctx.db.replace(state._id, stateValue);
    await ctx.db.patch(context.ledger._id, {
      memberCount: context.ledger.memberCount + 1,
      updatedAt: now,
    });
    await ctx.db.patch(request._id, {
      status: 'APPROVED',
      decidedByUserId: context.profile.userId,
      decidedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: request.ledgerId,
      action: 'JOIN_APPROVED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetUserId: request.userId,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert('notifications', {
      userId: request.userId,
      kind: 'JOIN_APPROVED',
      titleKey: 'notification.joinApproved.title',
      bodyKey: 'notification.joinApproved.body',
      params: {},
      fallbackTitle: 'Request approved',
      fallbackBody: 'You joined the ledger.',
      route: `/ledger/${request.ledgerId}`,
      ledgerId: request.ledgerId,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleInboxPush(ctx, notificationId);
    await notifyLedgerMembers(ctx, {
      ledgerId: request.ledgerId,
      kind: 'MEMBER_JOINED',
      titleKey: 'notification.memberJoined.title',
      bodyKey: 'notification.memberJoined.body',
      fallbackTitle: 'New member',
      fallbackBody: 'A new member joined the ledger.',
      route: `/ledger/${request.ledgerId}/members`,
      actorUserId: request.userId,
      roles: ['OWNER', 'ADMIN'],
      excludeUserIds: [request.userId, context.profile.userId],
      now,
    });
    return null;
  },
});
