import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {v} from 'convex/values';

import type {Doc, Id} from '../_generated/dataModel';
import {query} from '../_generated/server';
import {PHOTO_GALLERY_PAGE_SIZE, ITEM_PHOTO_READ_LIMIT} from '../lib/constants';
import {appError} from '../lib/errors';
import {
  requireCommentMember,
  requireItemMember,
  requireLedgerMember,
} from '../lib/ledgerPermissions';

export const photoRowValidator = v.object({
  id: v.id('itemPhotos'),
  itemId: v.id('ledgerItems'),
  ledgerId: v.id('ledgers'),
  order: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  blurhash: v.union(v.string(), v.null()),
  capturedAt: v.union(v.number(), v.null()),
  uploadedByUserId: v.union(v.id('users'), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export interface PhotoRow {
  readonly id: Id<'itemPhotos'>;
  readonly itemId: Id<'ledgerItems'>;
  readonly ledgerId: Id<'ledgers'>;
  readonly order: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly blurhash: string | null;
  readonly capturedAt: number | null;
  readonly uploadedByUserId: Id<'users'> | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const toPhotoRow = (photo: Doc<'itemPhotos'>): PhotoRow => ({
  id: photo._id,
  itemId: photo.itemId,
  ledgerId: photo.ledgerId,
  order: photo.order,
  width: photo.width ?? null,
  height: photo.height ?? null,
  blurhash: photo.blurhash ?? null,
  capturedAt: photo.capturedAt ?? null,
  uploadedByUserId: photo.uploadedByUserId ?? null,
  createdAt: photo.createdAt,
  updatedAt: photo.updatedAt,
});

export const listByItem = query({
  args: {itemId: v.id('ledgerItems')},
  returns: v.array(photoRowValidator),
  handler: async (ctx, args): Promise<PhotoRow[]> => {
    await requireItemMember(ctx, args.itemId, {allowDeleted: true});
    const rows = await ctx.db
      .query('itemPhotos')
      .withIndex('by_itemId_deletedAt_commentId_order', (index) =>
        index
          .eq('itemId', args.itemId)
          .eq('deletedAt', undefined)
          .eq('commentId', undefined),
      )
      // Bounded historical detail: old clients could attach up to 20 photos.
      // New uploads still stop at five; reducing that cap must not hide data.
      .take(ITEM_PHOTO_READ_LIMIT + 1);
    if (rows.length > ITEM_PHOTO_READ_LIMIT)
      throw appError('PHOTO_LIMIT_REACHED', 'error.photo.limit');
    return rows.map(toPhotoRow);
  },
});

export const listByComment = query({
  args: {commentId: v.id('itemComments')},
  returns: v.array(photoRowValidator),
  handler: async (ctx, args): Promise<PhotoRow[]> => {
    const context = await requireCommentMember(ctx, args.commentId);
    const rows = await ctx.db
      .query('itemPhotos')
      .withIndex('by_itemId_deletedAt_commentId_order', (index) =>
        index
          .eq('itemId', context.item._id)
          .eq('deletedAt', undefined)
          .eq('commentId', context.comment._id),
      )
      .take(5);
    if (rows.length > 4)
      throw appError('PHOTO_LIMIT_REACHED', 'error.photo.limit');
    return rows.map(toPhotoRow);
  },
});

export const listByLedger = query({
  args: {
    ledgerId: v.id('ledgers'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(photoRowValidator),
  handler: async (ctx, args): Promise<PaginationResult<PhotoRow>> => {
    await requireLedgerMember(ctx, args.ledgerId);
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > PHOTO_GALLERY_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('itemPhotos')
      .withIndex('by_ledgerId_deletedAt_commentId_createdAt', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('deletedAt', undefined)
          .eq('commentId', undefined),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    // `items.softDelete` patches the entry alone — it does not cascade to
    // `itemPhotos` — and this gallery is the one photo surface with no entry
    // around it to explain a tile. `listByItem` passes `allowDeleted` on
    // purpose, because its detail screen still offers a restore; a ledger-wide
    // grid has no such context. The media endpoint already refuses bytes for a
    // deleted item (`photos/internal.ts`), so leaving the row in renders a
    // blurhash placeholder that can never resolve, and still reports when a
    // deleted receipt was taken and who uploaded it. One `get` per page row,
    // and the page is capped at PHOTO_GALLERY_PAGE_SIZE above.
    const rows = await Promise.all(
      page.page.map(async (photo) => {
        const item = await ctx.db.get('ledgerItems', photo.itemId);
        return item === null || item.deletedAt !== undefined
          ? []
          : [toPhotoRow(photo)];
      }),
    );
    return {...page, page: rows.flat()};
  },
});
