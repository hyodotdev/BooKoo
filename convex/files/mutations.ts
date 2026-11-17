import {v} from 'convex/values';

import {hasLedgerRole} from '../../shared/ledgerRoles';
import type {Id} from '../_generated/dataModel';
import {mutation} from '../lib/functions';
import {
  PHOTO_ORIGINAL_MAX_BYTES,
  PHOTO_THUMB_MAX_BYTES,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireItemMember} from '../lib/ledgerPermissions';
import {requireActiveProfile, requireOnboarded} from '../lib/permissions';
import {uploadPurposeValidator} from '../schema/uploads';

const uploadVariantValidator = v.union(
  v.literal('AVATAR'),
  v.literal('ORIGINAL'),
  v.literal('THUMB'),
);

const acceptedImageType = (contentType: string | undefined): boolean =>
  contentType === 'image/jpeg' ||
  contentType === 'image/png' ||
  contentType === 'image/webp';

export const generateUploadUrl = mutation({
  args: {
    purpose: uploadPurposeValidator,
    itemId: v.optional(v.id('ledgerItems')),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const profile =
      args.purpose === 'AVATAR'
        ? await requireActiveProfile(ctx)
        : await requireOnboarded(ctx);
    if (
      args.purpose === 'ITEM_PHOTO' ||
      args.purpose === 'COMMENT_ATTACHMENT'
    ) {
      if (args.itemId === undefined)
        throw appError('UPLOAD_INVALID', 'error.upload.invalid');
      const context = await requireItemMember(ctx, args.itemId, {
        requireEdit: args.purpose === 'ITEM_PHOTO',
      });
      if (!hasLedgerRole(context.role, 'MEMBER'))
        throw appError('ITEM_FORBIDDEN', 'error.item.forbidden');
    } else if (args.itemId !== undefined) {
      throw appError('UPLOAD_INVALID', 'error.upload.invalid');
    }
    void profile;
    return ctx.storage.generateUploadUrl();
  },
});

export const claimUpload = mutation({
  args: {
    storageId: v.id('_storage'),
    purpose: uploadPurposeValidator,
    variant: uploadVariantValidator,
    itemId: v.optional(v.id('ledgerItems')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile =
      args.purpose === 'AVATAR'
        ? await requireActiveProfile(ctx)
        : await requireOnboarded(ctx);
    let ledgerId: Id<'ledgers'> | undefined;
    if (
      args.purpose === 'ITEM_PHOTO' ||
      args.purpose === 'COMMENT_ATTACHMENT'
    ) {
      if (
        args.itemId === undefined ||
        (args.variant !== 'ORIGINAL' && args.variant !== 'THUMB')
      )
        throw appError('UPLOAD_INVALID', 'error.upload.invalid');
      const context = await requireItemMember(ctx, args.itemId, {
        requireEdit: args.purpose === 'ITEM_PHOTO',
      });
      if (!hasLedgerRole(context.role, 'MEMBER'))
        throw appError('ITEM_FORBIDDEN', 'error.item.forbidden');
      ledgerId = context.item.ledgerId;
    } else if (args.itemId !== undefined || args.variant !== 'AVATAR') {
      throw appError('UPLOAD_INVALID', 'error.upload.invalid');
    }
    const existing = await ctx.db
      .query('uploads')
      .withIndex('by_storageId', (index) =>
        index.eq('storageId', args.storageId),
      )
      .unique();
    if (existing !== null) {
      if (
        existing.userId !== profile.userId ||
        existing.purpose !== args.purpose ||
        existing.itemId !== args.itemId
      )
        throw appError('UPLOAD_INVALID', 'error.upload.notOwned');
      return null;
    }
    const metadata = await ctx.db.system.get('_storage', args.storageId);
    if (metadata === null)
      throw appError('UPLOAD_INVALID', 'error.upload.invalid');
    if (!acceptedImageType(metadata.contentType))
      throw appError('UPLOAD_INVALID', 'error.upload.unsupportedType');
    const maxBytes =
      args.variant === 'ORIGINAL'
        ? PHOTO_ORIGINAL_MAX_BYTES
        : PHOTO_THUMB_MAX_BYTES;
    if (metadata.size < 1 || metadata.size > maxBytes)
      throw appError('UPLOAD_INVALID', 'error.upload.tooLarge');
    await ctx.db.insert('uploads', {
      storageId: args.storageId,
      userId: profile.userId,
      purpose: args.purpose,
      ...(ledgerId === undefined ? {} : {ledgerId}),
      ...(args.itemId === undefined ? {} : {itemId: args.itemId}),
      byteSize: metadata.size,
      contentType: metadata.contentType,
      createdAt: Date.now(),
    });
    return null;
  },
});
