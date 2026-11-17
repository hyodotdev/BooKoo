import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {v} from 'convex/values';

import type {Id} from '../_generated/dataModel';
import {query} from '../_generated/server';
import {hasBlockRelationship} from '../lib/blocks';
import {COMMENT_PAGE_SIZE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireItemMember} from '../lib/ledgerPermissions';

const commentRowValidator = v.object({
  id: v.id('itemComments'),
  itemId: v.id('ledgerItems'),
  authorId: v.id('users'),
  body: v.string(),
  attachmentPhotoIds: v.array(v.id('itemPhotos')),
  editedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  blockedRelationship: v.boolean(),
  author: v.object({
    handle: v.union(v.string(), v.null()),
    displayName: v.string(),
    avatarThumbUrl: v.union(v.string(), v.null()),
    deleted: v.boolean(),
  }),
});

export interface CommentRow {
  readonly id: Id<'itemComments'>;
  readonly itemId: Id<'ledgerItems'>;
  readonly authorId: Id<'users'>;
  readonly body: string;
  readonly attachmentPhotoIds: Id<'itemPhotos'>[];
  readonly editedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly blockedRelationship: boolean;
  readonly author: {
    readonly handle: string | null;
    readonly displayName: string;
    readonly avatarThumbUrl: string | null;
    readonly deleted: boolean;
  };
}

export const list = query({
  args: {
    itemId: v.id('ledgerItems'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commentRowValidator),
  handler: async (ctx, args): Promise<PaginationResult<CommentRow>> => {
    const context = await requireItemMember(ctx, args.itemId, {
      allowDeleted: true,
    });
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > COMMENT_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('itemComments')
      .withIndex('by_itemId_deletedAt_createdAt', (index) =>
        index.eq('itemId', args.itemId).eq('deletedAt', undefined),
      )
      .order('asc')
      .paginate(args.paginationOpts);
    type Author = {
      handle: string | null;
      displayName: string;
      avatarThumbUrl: string | null;
      deleted: boolean;
      blockedRelationship: boolean;
    };
    const authorIds = [
      ...new Set(page.page.map((row) => String(row.authorId))),
    ].map((value) => value as Id<'users'>);
    // Bounded: one join per distinct author in a 20-comment page, never one
    // subscription per row. 13-convex-scale §11.3 / §4.4.
    const authorEntries = await Promise.all(
      authorIds.map(
        async (authorId): Promise<readonly [Id<'users'>, Author]> => {
          const [profile, blockedRelationship] = await Promise.all([
            ctx.db
              .query('userProfiles')
              .withIndex('by_userId', (index) => index.eq('userId', authorId))
              .unique(),
            hasBlockRelationship(ctx, context.profile.userId, authorId),
          ]);
          const deleted = profile === null || profile.purgedAt !== undefined;
          return [
            authorId,
            {
              handle:
                deleted || blockedRelationship
                  ? null
                  : (profile.handle ?? null),
              displayName:
                deleted || blockedRelationship ? '' : profile.displayName,
              avatarThumbUrl:
                deleted || blockedRelationship
                  ? null
                  : (profile.avatarThumbUrl ?? profile.avatarUrl ?? null),
              deleted,
              blockedRelationship,
            },
          ];
        },
      ),
    );
    const authors = new Map<Id<'users'>, Author>(authorEntries);
    return {
      ...page,
      page: page.page.map((row): CommentRow => {
        const author = authors.get(row.authorId);
        return {
          id: row._id,
          itemId: row.itemId,
          authorId: row.authorId,
          body: row.body,
          attachmentPhotoIds:
            author?.blockedRelationship === true
              ? []
              : (row.attachmentPhotoIds ?? []),
          editedAt: row.editedAt ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          blockedRelationship: author?.blockedRelationship ?? false,
          author: {
            handle: author?.handle ?? null,
            displayName: author?.displayName ?? '',
            avatarThumbUrl: author?.avatarThumbUrl ?? null,
            deleted: author?.deleted ?? true,
          },
        };
      }),
    };
  },
});
