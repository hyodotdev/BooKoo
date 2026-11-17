import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {BLOCK_PAGE_SIZE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';

const rowValidator = v.object({
  userId: v.id('users'),
  handle: v.union(v.string(), v.null()),
  displayName: v.string(),
  avatar: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

export const listMine = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > BLOCK_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('userBlocks')
      .withIndex('by_blockerUserId_createdAt', (index) =>
        index.eq('blockerUserId', profile.userId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (block) => {
          const target = await ctx.db
            .query('userProfiles')
            .withIndex('by_userId', (index) =>
              index.eq('userId', block.blockedUserId),
            )
            .unique();
          return {
            userId: block.blockedUserId,
            handle: target?.handle ?? null,
            displayName: target?.displayName ?? '',
            avatar: target?.avatarThumbUrl ?? target?.avatarUrl ?? null,
            createdAt: block.createdAt,
          };
        }),
      ),
    };
  },
});
