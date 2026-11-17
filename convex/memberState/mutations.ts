import {v} from 'convex/values';

import {LAST_READ_THROTTLE_MS} from '../lib/constants';
import {mutation} from '../lib/functions';
import {requireLedgerMember} from '../lib/ledgerPermissions';

export const markRead = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerMember(ctx, args.ledgerId);
    const state = await ctx.db
      .query('ledgerMemberState')
      .withIndex('by_ledgerId_userId', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('userId', context.profile.userId),
      )
      .unique();
    const now = Date.now();
    if (state === null) {
      await ctx.db.insert('ledgerMemberState', {
        ledgerId: args.ledgerId,
        userId: context.profile.userId,
        lastReadAt: now,
        lastOpenedAt: now,
        muted: false,
        notifyNewItem: true,
        notifyComment: true,
        sortOrder: 0,
        updatedAt: now,
      });
    } else if (now - state.lastReadAt >= LAST_READ_THROTTLE_MS) {
      await ctx.db.patch(state._id, {
        lastReadAt: now,
        lastOpenedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});
