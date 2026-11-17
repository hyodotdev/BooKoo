import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import type {Doc} from '../_generated/dataModel';
import {query} from '../_generated/server';
import {
  APP_CONTENT_PAGE_SCAN_LIMIT,
  APP_CONTENT_PAGE_SIZE,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';
import {announcementKindValidator} from '../schema/appContent';
import {localeValidator, type AppLocale} from '../schema/userProfiles';

const contentRowValidator = v.object({
  id: v.id('appAnnouncements'),
  key: v.string(),
  kind: announcementKindValidator,
  title: v.string(),
  body: v.string(),
  pinned: v.boolean(),
  publishedAt: v.number(),
});

const localize = (row: Doc<'appAnnouncements'>, locale: AppLocale) => {
  const translation =
    row.translations.find((item) => item.locale === locale) ??
    row.translations.find((item) => item.locale === 'en') ??
    row.translations.find((item) => item.locale === 'ko') ??
    row.translations[0];
  if (translation === undefined || row.publishedAt === undefined) return null;
  return {
    id: row._id,
    key: row.key,
    kind: row.kind,
    title: translation.title,
    body: translation.body,
    pinned: row.pinned,
    publishedAt: row.publishedAt,
  };
};

export const list = query({
  args: {
    kind: announcementKindValidator,
    locale: localeValidator,
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(contentRowValidator),
  handler: async (ctx, args) => {
    await requireActiveProfile(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > APP_CONTENT_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('appAnnouncements')
      .withIndex('by_kind_deletedAt_sortOrder', (index) =>
        index.eq('kind', args.kind).eq('deletedAt', undefined),
      )
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: APP_CONTENT_PAGE_SCAN_LIMIT,
      });
    return {
      ...rows,
      // Visibility narrowing is bounded by APP_CONTENT_PAGE_SCAN_LIMIT (200).
      page: rows.page
        .filter(
          (row) =>
            row.publishedAt !== undefined &&
            row.publishedAt <= args.now &&
            (row.expiresAt === undefined || row.expiresAt > args.now),
        )
        .map((row) => localize(row, args.locale))
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };
  },
});
