import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {v} from 'convex/values';

import type {Id} from '../_generated/dataModel';
import {query} from '../_generated/server';
import {NOTIFICATION_PAGE_SIZE, UNREAD_COUNT_LIMIT} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireOnboarded} from '../lib/permissions';
import {notificationKindValidator} from '../schema/notifications';

const rowValidator = v.object({
  id: v.id('notifications'),
  kind: notificationKindValidator,
  titleKey: v.string(),
  bodyKey: v.string(),
  params: v.record(v.string(), v.union(v.string(), v.number())),
  fallbackTitle: v.string(),
  fallbackBody: v.string(),
  route: v.union(v.string(), v.null()),
  ledgerId: v.union(v.id('ledgers'), v.null()),
  itemId: v.union(v.id('ledgerItems'), v.null()),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

interface NotificationRow {
  readonly id: Id<'notifications'>;
  readonly kind: 'LEDGER_INVITE' | 'JOIN_REQUESTED' | 'JOIN_APPROVED' | 'JOIN_REJECTED' | 'MEMBER_JOINED' | 'MEMBER_LEFT' | 'MEMBER_REMOVED' | 'ROLE_CHANGED' | 'OWNERSHIP_TRANSFERRED' | 'LEDGER_ARCHIVED' | 'COMMENT_ADDED' | 'LEGACY_CLAIMED' | 'ANNOUNCEMENT' | 'SYSTEM';
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly params: Record<string, string | number>;
  readonly fallbackTitle: string;
  readonly fallbackBody: string;
  readonly route: string | null;
  readonly ledgerId: Id<'ledgers'> | null;
  readonly itemId: Id<'ledgerItems'> | null;
  readonly readAt: number | null;
  readonly createdAt: number;
}

export const list = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args): Promise<PaginationResult<NotificationRow>> => {
    const profile = await requireOnboarded(ctx);
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > NOTIFICATION_PAGE_SIZE)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('notifications')
      .withIndex('by_userId_deletedAt_createdAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        kind: row.kind,
        titleKey: row.titleKey,
        bodyKey: row.bodyKey,
        params: row.params,
        fallbackTitle: row.fallbackTitle,
        fallbackBody: row.fallbackBody,
        route: row.route ?? null,
        ledgerId: row.ledgerId ?? null,
        itemId: row.itemId ?? null,
        readAt: row.readAt ?? null,
        createdAt: row.createdAt,
      })),
    };
  },
});

export const unreadCount = query({
  args: {},
  returns: v.object({count: v.number(), capped: v.boolean()}),
  handler: async (ctx) => {
    const profile = await requireOnboarded(ctx);
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_userId_deletedAt_readAt', (index) =>
        index
          .eq('userId', profile.userId)
          .eq('deletedAt', undefined)
          .eq('readAt', undefined),
      )
      .take(UNREAD_COUNT_LIMIT + 1);
    return {count: Math.min(rows.length, UNREAD_COUNT_LIMIT), capped: rows.length > UNREAD_COUNT_LIMIT};
  },
});
