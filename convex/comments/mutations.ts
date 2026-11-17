import {v} from 'convex/values';

import {hasLedgerRole} from '../../shared/ledgerRoles';
import {isClientRequestId} from '../../shared/ledgerCore';
import type {Doc, Id} from '../_generated/dataModel';
import {hasBlockRelationship} from '../lib/blocks';
import {COMMENT_BODY_MAX_LENGTH} from '../lib/constants';
import {appError} from '../lib/errors';
import {mutation} from '../lib/functions';
import {scheduleInboxPush} from '../lib/notifications';
import {
  assertLedgerWritable,
  requireCommentMember,
  requireItemMember,
} from '../lib/ledgerPermissions';
import {requestHash} from '../lib/requestHash';

const COMMENT_ATTACHMENT_LIMIT = 4;
const attachmentValidator = v.object({
  storageId: v.id('_storage'),
  thumbStorageId: v.id('_storage'),
  width: v.number(),
  height: v.number(),
});

const assertAttachmentClaim = (
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
    upload.purpose !== 'COMMENT_ATTACHMENT' ||
    upload.itemId !== input.itemId ||
    upload.ledgerId !== input.ledgerId ||
    upload.referencedCheckedAt !== undefined
  )
    throw appError('UPLOAD_INVALID', 'error.upload.notOwned');
  return upload;
};

export const create = mutation({
  args: {
    itemId: v.id('ledgerItems'),
    body: v.string(),
    clientRequestId: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  returns: v.object({commentId: v.id('itemComments')}),
  handler: async (ctx, args): Promise<{commentId: Id<'itemComments'>}> => {
    const context = await requireItemMember(ctx, args.itemId);
    assertLedgerWritable(context);
    if (!hasLedgerRole(context.role, 'MEMBER'))
      throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
    const body = args.body.trim();
    const attachments = args.attachments ?? [];
    const storageIds = new Set<string>();
    if (
      (body.length === 0 && attachments.length === 0) ||
      body.length > COMMENT_BODY_MAX_LENGTH ||
      attachments.length > COMMENT_ATTACHMENT_LIMIT ||
      attachments.some((attachment) => {
        const invalid =
          attachment.storageId === attachment.thumbStorageId ||
          !Number.isSafeInteger(attachment.width) ||
          !Number.isSafeInteger(attachment.height) ||
          attachment.width < 1 ||
          attachment.height < 1 ||
          storageIds.has(String(attachment.storageId)) ||
          storageIds.has(String(attachment.thumbStorageId));
        storageIds.add(String(attachment.storageId));
        storageIds.add(String(attachment.thumbStorageId));
        return invalid;
      }) ||
      !isClientRequestId(args.clientRequestId)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const hash = requestHash('COMMENT_CREATE', {
      itemId: args.itemId,
      body,
      attachments,
    });
    const existing = await ctx.db
      .query('itemComments')
      .withIndex('by_itemId_authorId_clientRequestId', (index) =>
        index
          .eq('itemId', args.itemId)
          .eq('authorId', context.profile.userId)
          .eq('clientRequestId', args.clientRequestId),
      )
      .unique();
    if (existing !== null) {
      if (existing.clientRequestHash !== hash)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      return {commentId: existing._id};
    }
    const now = Date.now();
    const commentId = await ctx.db.insert('itemComments', {
      itemId: args.itemId,
      ledgerId: context.item.ledgerId,
      authorId: context.profile.userId,
      body,
      clientRequestId: args.clientRequestId,
      clientRequestHash: hash,
      createdAt: now,
      updatedAt: now,
    });
    const attachmentPhotoIds: Id<'itemPhotos'>[] = [];
    for (const [order, attachment] of attachments.entries()) {
      const original = assertAttachmentClaim(
        await ctx.db
          .query('uploads')
          .withIndex('by_storageId', (index) =>
            index.eq('storageId', attachment.storageId),
          )
          .unique(),
        {
          storageId: attachment.storageId,
          userId: context.profile.userId,
          itemId: args.itemId,
          ledgerId: context.item.ledgerId,
        },
      );
      const thumb = assertAttachmentClaim(
        await ctx.db
          .query('uploads')
          .withIndex('by_storageId', (index) =>
            index.eq('storageId', attachment.thumbStorageId),
          )
          .unique(),
        {
          storageId: attachment.thumbStorageId,
          userId: context.profile.userId,
          itemId: args.itemId,
          ledgerId: context.item.ledgerId,
        },
      );
      const photoId = await ctx.db.insert('itemPhotos', {
        itemId: args.itemId,
        ledgerId: context.item.ledgerId,
        commentId,
        order,
        storageId: attachment.storageId,
        thumbStorageId: attachment.thumbStorageId,
        width: attachment.width,
        height: attachment.height,
        byteSize: original.byteSize,
        mimeType: original.contentType,
        uploadedByUserId: context.profile.userId,
        migrationState: 'NATIVE',
        attempts: 0,
        legacyIsBase64: false,
        createdAt: now,
        updatedAt: now,
      });
      attachmentPhotoIds.push(photoId);
      await ctx.db.patch(original._id, {referencedCheckedAt: now});
      await ctx.db.patch(thumb._id, {referencedCheckedAt: now});
    }
    if (attachmentPhotoIds.length > 0)
      await ctx.db.patch(commentId, {attachmentPhotoIds});
    await ctx.db.patch(context.item._id, {
      commentCount: context.item.commentCount + 1,
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    if (
      context.item.authorId !== context.profile.userId &&
      !(await hasBlockRelationship(
        ctx,
        context.profile.userId,
        context.item.authorId,
      ))
    ) {
      const recipient = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', (index) =>
          index.eq('userId', context.item.authorId),
        )
        .unique();
      if (
        recipient !== null &&
        recipient.deletedAt === undefined &&
        recipient.appRole !== 'SUSPENDED' &&
        recipient.notifyComments
      ) {
        const notificationId = await ctx.db.insert('notifications', {
          userId: context.item.authorId,
          kind: 'COMMENT_ADDED',
          titleKey: 'notification.comment.title',
          bodyKey: 'notification.comment.body',
          params: {},
          fallbackTitle: 'New comment',
          fallbackBody: 'A new comment was added to your entry.',
          route: `/entry/${args.itemId}`,
          ledgerId: context.item.ledgerId,
          itemId: context.item._id,
          actorUserId: context.profile.userId,
          createdAt: now,
          updatedAt: now,
        });
        await scheduleInboxPush(ctx, notificationId);
      }
    }
    return {commentId};
  },
});

export const softDelete = mutation({
  args: {commentId: v.id('itemComments')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireCommentMember(ctx, args.commentId, {
      allowDeleted: true,
    });
    assertLedgerWritable(context);
    if (
      context.comment.authorId !== context.profile.userId &&
      !hasLedgerRole(context.role, 'ADMIN')
    )
      throw appError('FORBIDDEN', 'error.forbidden');
    if (context.comment.deletedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(context.comment._id, {
      deletedAt: now,
      deletedByUserId: context.profile.userId,
      updatedAt: now,
    });
    await ctx.db.patch(context.item._id, {
      commentCount: Math.max(0, context.item.commentCount - 1),
      updatedAt: Math.max(now, context.item.updatedAt + 1),
    });
    for (const photoId of context.comment.attachmentPhotoIds ?? []) {
      const photo = await ctx.db.get('itemPhotos', photoId);
      if (photo === null || photo.commentId !== context.comment._id) continue;
      await ctx.db.patch(photo._id, {
        deletedAt: now,
        deletedByUserId: context.profile.userId,
        updatedAt: now,
      });
      for (const storageId of [photo.storageId, photo.thumbStorageId]) {
        if (storageId === undefined) continue;
        const upload = await ctx.db
          .query('uploads')
          .withIndex('by_storageId', (index) =>
            index.eq('storageId', storageId),
          )
          .unique();
        if (upload !== null) await ctx.db.delete(upload._id);
        await ctx.storage.delete(storageId);
      }
    }
    return null;
  },
});
