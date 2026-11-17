import {v} from 'convex/values';

import {internalQuery} from '../_generated/server';
import {requireOnboarded} from '../lib/permissions';
import {ledgerIsReachable} from '../lib/ledgerPermissions';

export const resolveMedia = internalQuery({
  args: {
    photoId: v.string(),
    variant: v.union(v.literal('thumb'), v.literal('original')),
  },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id('_storage'),
      mediaType: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    const photoId = ctx.db.normalizeId('itemPhotos', args.photoId);
    if (photoId === null) return null;
    const photo = await ctx.db.get('itemPhotos', photoId);
    if (
      photo === null ||
      photo.deletedAt !== undefined ||
      photo.storageId === undefined ||
      photo.thumbStorageId === undefined
    )
      return null;
    const item = await ctx.db.get('ledgerItems', photo.itemId);
    if (item === null || item.deletedAt !== undefined) return null;
    const ledger = await ctx.db.get('ledgers', photo.ledgerId);
    if (!ledgerIsReachable(ledger)) return null;
    const membership = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', photo.ledgerId).eq('userId', profile.userId),
      )
      .unique();
    if (membership === null || membership.deletedAt !== undefined) return null;
    return {
      storageId:
        args.variant === 'thumb' ? photo.thumbStorageId : photo.storageId,
      mediaType: photo.mimeType ?? 'image/jpeg',
    };
  },
});
