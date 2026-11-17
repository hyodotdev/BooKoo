import {v} from 'convex/values';

import type {Doc, Id} from '../_generated/dataModel';
import {MAX_ITEM_PHOTOS} from '../lib/constants';
import {appError} from '../lib/errors';
import {mutation} from '../lib/functions';
import {
  assertLedgerWritable,
  requireItemMember,
  requirePhotoMember,
} from '../lib/ledgerPermissions';

const assertClaim = (
  upload: Doc<'uploads'> | null,
  input: {
    readonly storageId: Id<'_storage'>;
    readonly userId: Id<'users'>;
    readonly itemId: Id<'ledgerItems'>;
    readonly ledgerId: Id<'ledgers'>;
  },
): Doc<'uploads'> => {
  if (
    upload === null ||
    upload.storageId !== input.storageId ||
    upload.userId !== input.userId ||
    upload.purpose !== 'ITEM_PHOTO' ||
    upload.itemId !== input.itemId ||
    upload.ledgerId !== input.ledgerId ||
    upload.referencedCheckedAt !== undefined
  )
    throw appError('UPLOAD_INVALID', 'error.upload.notOwned');
  return upload;
};

export const attach = mutation({
  args: {
    itemId: v.id('ledgerItems'),
    storageId: v.id('_storage'),
    thumbStorageId: v.id('_storage'),
    width: v.number(),
    height: v.number(),
    blurhash: v.optional(v.string()),
    capturedAt: v.optional(v.number()),
  },
  returns: v.object({photoId: v.id('itemPhotos')}),
  handler: async (ctx, args): Promise<{photoId: Id<'itemPhotos'>}> => {
    const context = await requireItemMember(ctx, args.itemId, {
      requireEdit: true,
    });
    assertLedgerWritable(context);
    if (
      args.storageId === args.thumbStorageId ||
      !Number.isSafeInteger(args.width) ||
      !Number.isSafeInteger(args.height) ||
      args.width < 1 ||
      args.height < 1
    )
      throw appError('UPLOAD_INVALID', 'error.upload.invalid');
    const photos = await ctx.db
      .query('itemPhotos')
      .withIndex('by_itemId_deletedAt_commentId_order', (index) =>
        index
          .eq('itemId', args.itemId)
          .eq('deletedAt', undefined)
          .eq('commentId', undefined),
      )
      .take(MAX_ITEM_PHOTOS + 1);
    if (photos.length >= MAX_ITEM_PHOTOS)
      throw appError('PHOTO_LIMIT_REACHED', 'error.photo.limit');
    const original = assertClaim(
      await ctx.db
        .query('uploads')
        .withIndex('by_storageId', (index) =>
          index.eq('storageId', args.storageId),
        )
        .unique(),
      {
        storageId: args.storageId,
        userId: context.profile.userId,
        itemId: args.itemId,
        ledgerId: context.item.ledgerId,
      },
    );
    const thumb = assertClaim(
      await ctx.db
        .query('uploads')
        .withIndex('by_storageId', (index) =>
          index.eq('storageId', args.thumbStorageId),
        )
        .unique(),
      {
        storageId: args.thumbStorageId,
        userId: context.profile.userId,
        itemId: args.itemId,
        ledgerId: context.item.ledgerId,
      },
    );
    const now = Date.now();
    const order = photos.length;
    const photoId = await ctx.db.insert('itemPhotos', {
      itemId: args.itemId,
      ledgerId: context.item.ledgerId,
      order,
      storageId: args.storageId,
      thumbStorageId: args.thumbStorageId,
      width: args.width,
      height: args.height,
      byteSize: original.byteSize,
      mimeType: original.contentType,
      ...(args.blurhash === undefined ? {} : {blurhash: args.blurhash}),
      ...(args.capturedAt === undefined ? {} : {capturedAt: args.capturedAt}),
      uploadedByUserId: context.profile.userId,
      migrationState: 'NATIVE',
      attempts: 0,
      legacyIsBase64: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(original._id, {referencedCheckedAt: now});
    await ctx.db.patch(thumb._id, {referencedCheckedAt: now});
    await ctx.db.patch(context.item._id, {
      photoCount: context.item.photoCount + 1,
      ...(context.item.coverPhotoId === undefined
        ? {coverPhotoId: photoId}
        : {}),
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    return {photoId};
  },
});

export const detach = mutation({
  args: {photoId: v.id('itemPhotos')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requirePhotoMember(ctx, args.photoId, {
      allowDeleted: true,
      requireEdit: true,
    });
    assertLedgerWritable(context);
    if (context.photo.deletedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(context.photo._id, {
      deletedAt: now,
      deletedByUserId: context.profile.userId,
      updatedAt: now,
    });
    const remaining = await ctx.db
      .query('itemPhotos')
      .withIndex('by_itemId_deletedAt_commentId_order', (index) =>
        index
          .eq('itemId', context.item._id)
          .eq('deletedAt', undefined)
          .eq('commentId', undefined),
      )
      .take(MAX_ITEM_PHOTOS);
    const nextCover = remaining.find(
      (photo) => photo._id !== context.photo._id,
    );
    await ctx.db.patch(context.item._id, {
      photoCount: Math.max(0, context.item.photoCount - 1),
      ...(context.item.coverPhotoId === context.photo._id
        ? {coverPhotoId: nextCover?._id}
        : {}),
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    for (const storageId of [
      context.photo.storageId,
      context.photo.thumbStorageId,
    ]) {
      if (storageId === undefined) continue;
      const upload = await ctx.db
        .query('uploads')
        .withIndex('by_storageId', (index) => index.eq('storageId', storageId))
        .unique();
      if (upload !== null) await ctx.db.delete(upload._id);
      await ctx.storage.delete(storageId);
    }
    return null;
  },
});
