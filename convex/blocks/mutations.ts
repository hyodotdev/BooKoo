import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';

export const create = mutation({
  args: {userId: v.id('users')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    if (args.userId === profile.userId)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const target = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (index) => index.eq('userId', args.userId))
      .unique();
    if (
      target === null ||
      target.deletedAt !== undefined ||
      target.isPlaceholder
    )
      throw appError('NOT_FOUND', 'error.notFound');
    const existing = await ctx.db
      .query('userBlocks')
      .withIndex('by_blockerUserId_blockedUserId', (index) =>
        index
          .eq('blockerUserId', profile.userId)
          .eq('blockedUserId', args.userId),
      )
      .unique();
    if (existing === null)
      await ctx.db.insert('userBlocks', {
        blockerUserId: profile.userId,
        blockedUserId: args.userId,
        createdAt: Date.now(),
      });
    return null;
  },
});

export const remove = mutation({
  args: {userId: v.id('users')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const existing = await ctx.db
      .query('userBlocks')
      .withIndex('by_blockerUserId_blockedUserId', (index) =>
        index
          .eq('blockerUserId', profile.userId)
          .eq('blockedUserId', args.userId),
      )
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  },
});
