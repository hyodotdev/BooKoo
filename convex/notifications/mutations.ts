import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {PUSH_DEVICE_LIMIT_PER_USER} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireOnboarded} from '../lib/permissions';
import {localeValidator, platformValidator} from '../schema/userProfiles';

export const markRead = mutation({
  args: {notificationId: v.id('notifications')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const row = await ctx.db.get('notifications', args.notificationId);
    if (row === null || row.userId !== profile.userId || row.deletedAt !== undefined)
      throw appError('NOT_FOUND', 'error.notFound');
    if (row.readAt === undefined) await ctx.db.patch(row._id, {readAt: Date.now(), updatedAt: Date.now()});
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.object({updated: v.number()}),
  handler: async (ctx) => {
    const profile = await requireOnboarded(ctx);
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_userId_deletedAt_readAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined).eq('readAt', undefined),
      )
      .take(51);
    if (rows.length > 50) throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    for (const row of rows) await ctx.db.patch(row._id, {readAt: now, updatedAt: now});
    return {updated: rows.length};
  },
});

export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: platformValidator,
    deviceName: v.optional(v.string()),
    locale: localeValidator,
    appVersion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    if (!/^ExponentPushToken\[[A-Za-z0-9_-]{10,}\]$/.test(args.token))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    const existing = await ctx.db.query('pushTokens').withIndex('by_token', (index) => index.eq('token', args.token)).unique();
    const value = {
      userId: profile.userId,
      token: args.token,
      platform: args.platform,
      ...(args.deviceName === undefined ? {} : {deviceName: args.deviceName.slice(0, 80)}),
      locale: args.locale,
      ...(args.appVersion === undefined ? {} : {appVersion: args.appVersion.slice(0, 40)}),
      disabledAt: undefined,
      updatedAt: now,
    };
    if (existing === null) await ctx.db.insert('pushTokens', value);
    else await ctx.db.patch(existing._id, value);
    const live = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId_disabledAt', (index) => index.eq('userId', profile.userId).eq('disabledAt', undefined))
      .take(PUSH_DEVICE_LIMIT_PER_USER + 1);
    if (live.length > PUSH_DEVICE_LIMIT_PER_USER) {
      const oldest = live.filter((row) => row.token !== args.token).sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (oldest !== undefined) await ctx.db.patch(oldest._id, {disabledAt: now, updatedAt: now});
    }
    return null;
  },
});

export const unregisterToken = mutation({
  args: {token: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const row = await ctx.db.query('pushTokens').withIndex('by_token', (index) => index.eq('token', args.token)).unique();
    if (row !== null && row.userId === profile.userId) await ctx.db.delete(row._id);
    return null;
  },
});
