import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {JOIN_REQUEST_PAGE_SIZE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireLedgerRole} from '../lib/ledgerPermissions';

const rowValidator = v.object({
  id: v.id('ledgerJoinRequests'),
  userId: v.id('users'),
  handle: v.union(v.string(), v.null()),
  displayName: v.string(),
  message: v.union(v.string(), v.null()),
  requestedAt: v.number(),
  expiresAt: v.number(),
});

export const pending = query({
  args: {
    ledgerId: v.id('ledgers'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireLedgerRole(ctx, args.ledgerId, 'ADMIN', {
      allowArchived: true,
    });
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > JOIN_REQUEST_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('ledgerJoinRequests')
      .withIndex('by_ledgerId_status_requestedAt', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('status', 'PENDING'),
      )
      .order('asc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (row) => {
          const profile = await ctx.db
            .query('userProfiles')
            .withIndex('by_userId', (index) =>
              index.eq('userId', row.userId),
            )
            .unique();
          return {
            id: row._id,
            userId: row.userId,
            handle: profile?.handle ?? null,
            displayName: profile?.displayName ?? '',
            message: row.message ?? null,
            requestedAt: row.requestedAt,
            expiresAt: row.expiresAt,
          };
        }),
      ),
    };
  },
});
