import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {
  assertCanActOn,
  assertCanGrant,
  requireLedgerRole,
} from '../lib/ledgerPermissions';
import {enforceRateLimit} from '../lib/rateLimits';
import {notifyLedgerMembers, scheduleInboxPush} from '../lib/notifications';
import {ledgerRoleValidator} from '../schema/ledgerMembers';

export const changeRole = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    userId: v.id('users'),
    role: ledgerRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    await enforceRateLimit(
      ctx,
      'ledgerMemberChurn',
      String(context.profile.userId),
    );
    if (args.role === 'OWNER')
      throw appError('CANNOT_GRANT_ROLE', 'error.ledger.cannotGrantRole');
    const target = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('userId', args.userId),
      )
      .unique();
    if (target === null || target.deletedAt !== undefined)
      throw appError('NOT_FOUND', 'error.notFound');
    assertCanActOn(context.role, target.role);
    assertCanGrant(context.role, args.role);
    if (target.role === args.role) return null;
    const now = Date.now();
    await ctx.db.patch(target._id, {role: args.role, updatedAt: now});
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'MEMBER_ROLE_CHANGED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetUserId: target.userId,
      beforeRole: target.role,
      afterRole: args.role,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert('notifications', {
      userId: target.userId,
      kind: 'ROLE_CHANGED',
      titleKey: 'notification.roleChanged.title',
      bodyKey: 'notification.roleChanged.body',
      params: {},
      fallbackTitle: 'Role changed',
      fallbackBody: 'Your ledger role changed.',
      route: `/ledger/${args.ledgerId}`,
      ledgerId: args.ledgerId,
      actorUserId: context.profile.userId,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleInboxPush(ctx, notificationId);
    return null;
  },
});

export const remove = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    userId: v.id('users'),
    blockRejoin: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    await enforceRateLimit(
      ctx,
      'ledgerMemberChurn',
      String(context.profile.userId),
    );
    const target = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('userId', args.userId),
      )
      .unique();
    if (target === null || target.deletedAt !== undefined)
      throw appError('NOT_FOUND', 'error.notFound');
    if (target.role === 'OWNER')
      throw appError('OWNER_MUST_TRANSFER', 'error.ledger.ownerMustTransfer');
    assertCanActOn(context.role, target.role);
    const now = Date.now();
    await ctx.db.patch(target._id, {
      deletedAt: now,
      endReason: 'REMOVED',
      ...(args.blockRejoin ? {blockedAt: now} : {}),
      updatedAt: now,
    });
    await ctx.db.patch(context.ledger._id, {
      memberCount: Math.max(1, context.ledger.memberCount - 1),
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'MEMBER_REMOVED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetUserId: target.userId,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert('notifications', {
      userId: target.userId,
      kind: 'MEMBER_REMOVED',
      titleKey: 'notification.memberRemoved.title',
      bodyKey: 'notification.memberRemoved.body',
      params: {},
      fallbackTitle: 'Membership ended',
      fallbackBody: 'You were removed from a ledger.',
      ledgerId: args.ledgerId,
      actorUserId: context.profile.userId,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleInboxPush(ctx, notificationId);
    await notifyLedgerMembers(ctx, {
      ledgerId: args.ledgerId,
      kind: 'MEMBER_REMOVED',
      titleKey: 'notification.memberRemoved.title',
      bodyKey: 'notification.memberRemoved.body',
      fallbackTitle: 'Membership changed',
      fallbackBody: 'A ledger membership status changed.',
      route: `/ledger/${args.ledgerId}/members`,
      actorUserId: context.profile.userId,
      roles: ['OWNER', 'ADMIN'],
      excludeUserIds: [context.profile.userId, target.userId],
      now,
    });
    return null;
  },
});

export const leave = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'VIEWER', {
      allowArchived: true,
    });
    await enforceRateLimit(
      ctx,
      'ledgerMemberChurn',
      String(context.profile.userId),
    );
    if (context.role === 'OWNER')
      throw appError('OWNER_MUST_TRANSFER', 'error.ledger.ownerMustTransfer');
    const now = Date.now();
    await ctx.db.patch(context.membership._id, {
      deletedAt: now,
      endReason: 'LEFT',
      updatedAt: now,
    });
    await ctx.db.patch(context.ledger._id, {
      memberCount: Math.max(1, context.ledger.memberCount - 1),
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'MEMBER_LEFT',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetUserId: context.profile.userId,
      createdAt: now,
    });
    await notifyLedgerMembers(ctx, {
      ledgerId: args.ledgerId,
      kind: 'MEMBER_LEFT',
      titleKey: 'notification.memberLeft.title',
      bodyKey: 'notification.memberLeft.body',
      fallbackTitle: 'Member left',
      fallbackBody: 'A member left the ledger.',
      route: `/ledger/${args.ledgerId}/members`,
      actorUserId: context.profile.userId,
      roles: ['OWNER', 'ADMIN'],
      excludeUserIds: [context.profile.userId],
      now,
    });
    return null;
  },
});

export const transferOwnership = mutation({
  args: {ledgerId: v.id('ledgers'), userId: v.id('users')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'OWNER', {
      allowArchived: true,
    });
    await enforceRateLimit(
      ctx,
      'ledgerMemberChurn',
      String(context.profile.userId),
    );
    if (args.userId === context.profile.userId) return null;
    const target = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('userId', args.userId),
      )
      .unique();
    if (target === null || target.deletedAt !== undefined)
      throw appError('NOT_FOUND', 'error.notFound');
    if (target.role === 'VIEWER')
      throw appError('CANNOT_GRANT_ROLE', 'error.ledger.cannotGrantRole');
    const now = Date.now();
    await ctx.db.patch(context.membership._id, {role: 'ADMIN', updatedAt: now});
    await ctx.db.patch(target._id, {role: 'OWNER', updatedAt: now});
    await ctx.db.patch(context.ledger._id, {
      ownerId: target.userId,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'OWNERSHIP_TRANSFERRED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      targetUserId: target.userId,
      beforeRole: target.role,
      afterRole: 'OWNER',
      createdAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: context.profile.userId,
      event: 'ledger_ownership_transferred',
      detail: {
        ledgerId: String(args.ledgerId),
        to: String(target.userId),
      },
      createdAt: now,
    });
    await notifyLedgerMembers(ctx, {
      ledgerId: args.ledgerId,
      kind: 'OWNERSHIP_TRANSFERRED',
      titleKey: 'notification.ownershipTransferred.title',
      bodyKey: 'notification.ownershipTransferred.body',
      fallbackTitle: 'Ownership transferred',
      fallbackBody: 'Ledger ownership was transferred.',
      route: `/ledger/${args.ledgerId}`,
      actorUserId: context.profile.userId,
      excludeUserIds: [context.profile.userId],
      now,
    });
    return null;
  },
});
