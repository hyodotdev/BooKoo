import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireOnboarded} from '../lib/permissions';
import {enforceRateLimit} from '../lib/rateLimits';
import {feedbackCategoryValidator} from '../schema/feedback';
import {localeValidator, platformValidator} from '../schema/userProfiles';

export const send = mutation({
  args: {
    category: feedbackCategoryValidator,
    body: v.string(),
    contactEmail: v.optional(v.string()),
    locale: localeValidator,
    appVersion: v.optional(v.string()),
    buildNumber: v.optional(v.number()),
    platform: platformValidator,
    osVersion: v.optional(v.string()),
    deviceModel: v.optional(v.string()),
  },
  returns: v.object({id: v.id('feedback')}),
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    await enforceRateLimit(ctx, 'feedbackSend', String(profile.userId));
    const body = args.body.trim();
    const contactEmail = args.contactEmail?.trim();
    if (
      body.length < 2 ||
      body.length > 2_000 ||
      (contactEmail !== undefined &&
        contactEmail.length > 254) ||
      (args.buildNumber !== undefined &&
        (!Number.isSafeInteger(args.buildNumber) || args.buildNumber < 1))
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const id = await ctx.db.insert('feedback', {
      userId: profile.userId,
      category: args.category,
      body,
      ...(contactEmail === undefined || contactEmail.length === 0 ? {} : {contactEmail}),
      locale: args.locale,
      ...(args.appVersion === undefined ? {} : {appVersion: args.appVersion}),
      ...(args.buildNumber === undefined ? {} : {buildNumber: args.buildNumber}),
      platform: args.platform,
      ...(args.osVersion === undefined ? {} : {osVersion: args.osVersion.slice(0, 80)}),
      ...(args.deviceModel === undefined ? {} : {deviceModel: args.deviceModel.slice(0, 120)}),
      status: 'NEW',
      createdAt: Date.now(),
    });
    return {id};
  },
});
