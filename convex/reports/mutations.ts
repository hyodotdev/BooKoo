import {v, type Infer} from 'convex/values';

import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireCommentMember, requireItemMember, requireLedgerMember} from '../lib/ledgerPermissions';
import {requireAppAdmin, requireOnboarded} from '../lib/permissions';
import {scheduleInboxPush} from '../lib/notifications';
import {enforceRateLimit} from '../lib/rateLimits';
import {reportReasonValidator, reportResolutionValidator} from '../schema/moderation';

const subjectValidator = v.union(
  v.object({kind: v.literal('USER'), userId: v.id('users')}),
  v.object({kind: v.literal('LEDGER'), ledgerId: v.id('ledgers')}),
  v.object({kind: v.literal('ITEM'), itemId: v.id('ledgerItems')}),
  v.object({kind: v.literal('COMMENT'), commentId: v.id('itemComments')}),
);
type ReportSubject = Infer<typeof subjectValidator>;

async function verifySubject(
  ctx: MutationCtx,
  reporterUserId: Id<'users'>,
  subject: ReportSubject,
  contextLedgerId: Id<'ledgers'> | undefined,
): Promise<Id<'ledgers'> | undefined> {
  if (subject.kind === 'LEDGER') {
    await requireLedgerMember(ctx, subject.ledgerId);
    return subject.ledgerId;
  }
  if (subject.kind === 'ITEM') {
    const item = await requireItemMember(ctx, subject.itemId);
    if (item.item.authorId === reporterUserId)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    return item.item.ledgerId;
  }
  if (subject.kind === 'COMMENT') {
    const comment = await requireCommentMember(ctx, subject.commentId);
    if (comment.comment.authorId === reporterUserId)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    return comment.comment.ledgerId;
  }
  if (subject.userId === reporterUserId)
    throw appError('INVALID_INPUT', 'error.invalidInput');
  const target = await ctx.db.query('userProfiles').withIndex('by_userId', (index) => index.eq('userId', subject.userId)).unique();
  if (target === null || target.isPlaceholder) throw appError('NOT_FOUND', 'error.notFound');
  if (contextLedgerId !== undefined) {
    await requireLedgerMember(ctx, contextLedgerId);
    const member = await ctx.db.query('ledgerMembers').withIndex('by_ledgerId_userId', (index) => index.eq('ledgerId', contextLedgerId).eq('userId', subject.userId)).unique();
    if (member === null || member.deletedAt !== undefined)
      throw appError('NOT_FOUND', 'error.notFound');
  }
  return contextLedgerId;
}

export const create = mutation({
  args: {
    subject: subjectValidator,
    contextLedgerId: v.optional(v.id('ledgers')),
    reason: reportReasonValidator,
    note: v.optional(v.string()),
  },
  returns: v.object({id: v.id('contentReports')}),
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    await enforceRateLimit(ctx, 'reportCreate', String(profile.userId));
    const note = args.note?.trim();
    if (note !== undefined && note.length > 500)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const contextLedgerId = await verifySubject(ctx, profile.userId, args.subject, args.contextLedgerId);
    const now = Date.now();
    const id = await ctx.db.insert('contentReports', {
      reporterUserId: profile.userId,
      subject: args.subject,
      ...(contextLedgerId === undefined ? {} : {contextLedgerId}),
      reason: args.reason,
      ...(note === undefined || note.length === 0 ? {} : {note}),
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });
    return {id};
  },
});

export const acknowledge = mutation({
  args: {reportId: v.id('contentReports')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const admin = await requireAppAdmin(ctx);
    const report = await ctx.db.get('contentReports', args.reportId);
    if (report === null) throw appError('NOT_FOUND', 'error.notFound');
    if (report.status !== 'OPEN') throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    await ctx.db.patch(report._id, {status: 'REVIEWING', acknowledgedAt: now, acknowledgedByUserId: admin.userId, updatedAt: now});
    return null;
  },
});

export const resolve = mutation({
  args: {
    reportId: v.id('contentReports'),
    resolution: reportResolutionValidator,
    ticketRef: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const admin = await requireAppAdmin(ctx);
    const report = await ctx.db.get('contentReports', args.reportId);
    if (report === null) throw appError('NOT_FOUND', 'error.notFound');
    if (report.status !== 'REVIEWING') throw appError('INVALID_INPUT', 'error.invalidInput');
    const ticketRef = args.ticketRef?.trim();
    if (ticketRef !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(ticketRef))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    if (args.resolution === 'COMMENT_REMOVED') {
      if (report.subject.kind !== 'COMMENT') throw appError('INVALID_INPUT', 'error.invalidInput');
      const comment = await ctx.db.get('itemComments', report.subject.commentId);
      if (comment !== null && comment.deletedAt === undefined) {
        const item = await ctx.db.get('ledgerItems', comment.itemId);
        await ctx.db.patch(comment._id, {deletedAt: now, deletedByUserId: admin.userId, updatedAt: now});
        if (item !== null) await ctx.db.patch(item._id, {commentCount: Math.max(0, item.commentCount - 1), updatedAt: Math.max(now, item.updatedAt + 1)});
      }
    } else if (args.resolution === 'ITEM_CONTENT_REDACTED') {
      const itemId = report.subject.kind === 'ITEM' ? report.subject.itemId : undefined;
      if (itemId === undefined) throw appError('INVALID_INPUT', 'error.invalidInput');
      const item = await ctx.db.get('ledgerItems', itemId);
      if (item === null) throw appError('NOT_FOUND', 'error.notFound');
      await ctx.db.patch(item._id, {memo: '', place: undefined, updatedAt: Math.max(now, item.updatedAt + 1), updatedByUserId: admin.userId});
    } else if (args.resolution === 'MEMBER_REMOVED') {
      if (report.subject.kind !== 'USER' || report.contextLedgerId === undefined)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      const ledgerId = report.contextLedgerId;
      const targetUserId = report.subject.userId;
      const ledger = await ctx.db.get('ledgers', ledgerId);
      const member = await ctx.db.query('ledgerMembers').withIndex('by_ledgerId_userId', (index) => index.eq('ledgerId', ledgerId).eq('userId', targetUserId)).unique();
      if (ledger === null || member === null || member.deletedAt !== undefined)
        throw appError('NOT_FOUND', 'error.notFound');
      if (member.role === 'OWNER') throw appError('OWNER_MUST_TRANSFER', 'error.ledger.ownerMustTransfer');
      await ctx.db.patch(member._id, {
        deletedAt: now,
        endReason: 'REMOVED',
        updatedAt: now,
      });
      await ctx.db.patch(ledger._id, {memberCount: Math.max(1, ledger.memberCount - 1), updatedAt: now});
      await ctx.db.insert('ledgerAuditLog', {ledgerId: ledger._id, action: 'MEMBER_REMOVED', retention: 'AUDIT', actorUserId: admin.userId, targetUserId: member.userId, createdAt: now});
      const targetNotificationId = await ctx.db.insert('notifications', {
        userId: member.userId,
        kind: 'MEMBER_REMOVED',
        titleKey: 'notification.memberRemoved.title',
        bodyKey: 'notification.memberRemoved.body',
        params: {},
        fallbackTitle: 'Membership ended',
        fallbackBody: 'You were removed from a ledger.',
        ledgerId: ledger._id,
        actorUserId: admin.userId,
        createdAt: now,
        updatedAt: now,
      });
      await scheduleInboxPush(ctx, targetNotificationId);
    } else if (args.resolution === 'ACCOUNT_SUSPENDED') {
      if (report.subject.kind !== 'USER' || report.subject.userId === admin.userId)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      const target = await ctx.db.query('userProfiles').withIndex('by_userId', (index) => index.eq('userId', report.subject.kind === 'USER' ? report.subject.userId : admin.userId)).unique();
      if (target === null) throw appError('NOT_FOUND', 'error.notFound');
      await ctx.db.patch(target._id, {appRole: 'SUSPENDED', updatedAt: now});
      await ctx.db.insert('authAudit', {userId: target.userId, event: 'account_suspended', ...(ticketRef === undefined ? {} : {ticketRef}), createdAt: now});
    }
    await ctx.db.patch(report._id, {
      status: args.resolution === 'NO_ACTION' ? 'DISMISSED' : 'ACTIONED',
      handledAt: now,
      handledByUserId: admin.userId,
      resolution: args.resolution,
      ...(ticketRef === undefined ? {} : {ticketRef}),
      updatedAt: now,
    });
    const notificationId = await ctx.db.insert('notifications', {
      userId: report.reporterUserId,
      kind: 'SYSTEM',
      titleKey: 'notification.reportReviewed.title',
      bodyKey: 'notification.reportReviewed.body',
      params: {},
      fallbackTitle: 'Report reviewed',
      fallbackBody: 'Your report has been reviewed.',
      createdAt: now,
      updatedAt: now,
    });
    await scheduleInboxPush(ctx, notificationId);
    return null;
  },
});

export const reinstateAccount = mutation({
  args: {userId: v.id('users'), ticketRef: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const admin = await requireAppAdmin(ctx);
    const ticketRef = args.ticketRef.trim();
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(ticketRef))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const target = await ctx.db.query('userProfiles').withIndex('by_userId', (index) => index.eq('userId', args.userId)).unique();
    if (target === null || target.appRole !== 'SUSPENDED')
      throw appError('NOT_FOUND', 'error.notFound');
    const now = Date.now();
    await ctx.db.patch(target._id, {appRole: 'USER', updatedAt: now});
    await ctx.db.insert('authAudit', {userId: target.userId, event: 'account_reinstated', ticketRef, detail: {admin: String(admin.userId)}, createdAt: now});
    return null;
  },
});
