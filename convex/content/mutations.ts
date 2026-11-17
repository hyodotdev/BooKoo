import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireAppAdmin} from '../lib/permissions';
import {announcementKindValidator} from '../schema/appContent';
import {localeValidator} from '../schema/userProfiles';

const translationValidator = v.object({locale: localeValidator, title: v.string(), body: v.string()});

export const upsert = mutation({
  args: {
    id: v.optional(v.id('appAnnouncements')),
    kind: announcementKindValidator,
    key: v.string(),
    translations: v.array(translationValidator),
    sortOrder: v.number(),
    pinned: v.boolean(),
    published: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.object({id: v.id('appAnnouncements')}),
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const key = args.key.trim();
    const locales = new Set(args.translations.map((item) => item.locale));
    if (
      !/^[a-z0-9][a-z0-9-]{1,63}$/.test(key) ||
      args.translations.length !== 5 ||
      locales.size !== 5 ||
      args.translations.some(
        (item) => item.title.trim().length === 0 || item.body.trim().length === 0,
      ) ||
      !Number.isSafeInteger(args.sortOrder)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    const existingByKey = await ctx.db
      .query('appAnnouncements')
      .withIndex('by_key', (index) => index.eq('key', key))
      .unique();
    if (args.id === undefined && existingByKey !== null)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    if (args.id !== undefined && existingByKey !== null && existingByKey._id !== args.id)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const value = {
      kind: args.kind,
      key,
      translations: args.translations.map((item) => ({
        locale: item.locale,
        title: item.title.trim(),
        body: item.body.trim(),
      })),
      sortOrder: args.sortOrder,
      pinned: args.pinned,
      ...(args.published ? {publishedAt: existingByKey?.publishedAt ?? now} : {}),
      ...(args.expiresAt === undefined ? {} : {expiresAt: args.expiresAt}),
      updatedByUserId: admin.userId,
      createdAt: existingByKey?.createdAt ?? now,
      updatedAt: now,
      ...(existingByKey?.createdByUserId === undefined
        ? {createdByUserId: admin.userId}
        : {createdByUserId: existingByKey.createdByUserId}),
    };
    if (args.id === undefined) {
      const id = await ctx.db.insert('appAnnouncements', value);
      return {id};
    }
    const row = await ctx.db.get('appAnnouncements', args.id);
    if (row === null) throw appError('NOT_FOUND', 'error.notFound');
    await ctx.db.replace(row._id, {...value, createdAt: row.createdAt, createdByUserId: row.createdByUserId ?? admin.userId});
    return {id: row._id};
  },
});
