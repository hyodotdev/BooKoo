import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {FEEDBACK_HISTORY_LIMIT} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireOnboarded} from '../lib/permissions';
import {
  feedbackCategoryValidator,
  feedbackStatusValidator,
} from '../schema/feedback';

const feedbackRowValidator = v.object({
  id: v.id('feedback'),
  category: feedbackCategoryValidator,
  body: v.string(),
  status: feedbackStatusValidator,
  createdAt: v.number(),
});

/** Legacy bounded contract kept for deployed clients. */
export const mine = query({
  args: {},
  returns: v.array(feedbackRowValidator),
  handler: async (ctx) => {
    const profile = await requireOnboarded(ctx);
    const rows = await ctx.db
      .query('feedback')
      .withIndex('by_userId_createdAt', (index) =>
        index.eq('userId', profile.userId),
      )
      .order('desc')
      .take(FEEDBACK_HISTORY_LIMIT);
    return rows.map((row) => ({
      id: row._id,
      category: row.category,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt,
    }));
  },
});

export const minePaginated = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(feedbackRowValidator),
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > FEEDBACK_HISTORY_LIMIT
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('feedback')
      .withIndex('by_userId_createdAt', (index) =>
        index.eq('userId', profile.userId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...rows,
      page: rows.page.map((row) => ({
        id: row._id,
        category: row.category,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  },
});
