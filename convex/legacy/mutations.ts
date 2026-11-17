import {v} from 'convex/values';

import {internal} from '../_generated/api';
import {mutation} from '../lib/functions';
import {LEGACY_CANDIDATE_LIMIT, USER_EMAIL_LIMIT} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';
import {enforceRateLimit} from '../lib/rateLimits';

export const claimLegacyAccount = mutation({
  args: {legacyUserIds: v.array(v.id('legacyUsers'))},
  returns: v.object({scheduled: v.number()}),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    if (
      args.legacyUserIds.length === 0 ||
      args.legacyUserIds.length > LEGACY_CANDIDATE_LIMIT
    )
      throw appError('INVALID_INPUT', 'error.legacy.tooMany');
    await enforceRateLimit(ctx, 'legacyClaim', profile.userId);
    const emailRows = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (query) =>
        query.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(USER_EMAIL_LIMIT + 1);
    if (emailRows.length > USER_EMAIL_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const proven = new Set(emailRows.map((row) => row.emailNormalized));
    const uniqueIds = [...new Set(args.legacyUserIds)];
    let scheduled = 0;
    for (const legacyUserId of uniqueIds) {
      const legacy = await ctx.db.get('legacyUsers', legacyUserId);
      if (
        legacy === null ||
        legacy.emailNormalized === undefined ||
        !proven.has(legacy.emailNormalized)
      )
        throw appError('FORBIDDEN', 'error.legacy.notYours');
      if (
        legacy.claimState === 'claimed' &&
        legacy.claimedByUserId !== profile.userId
      )
        throw appError('LEGACY_ALREADY_CLAIMED', 'error.legacy.alreadyClaimed');
      if (legacy.claimedByUserId === profile.userId) continue;
      await ctx.db.patch(legacy._id, {claimState: 'claiming'});
      await ctx.scheduler.runAfter(0, internal.legacy.internal.runClaim, {
        legacyUserId: legacy._id,
        userId: profile.userId,
      });
      scheduled += 1;
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      legacyClaimState: scheduled > 0 ? 'pending' : profile.legacyClaimState,
      ...(profile.onboardingStep === 'legacy'
        ? {onboardingStep: 'ledger'}
        : {}),
      updatedAt: now,
    });
    return {scheduled};
  },
});

export const skipLegacyClaim = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      legacyClaimState: 'skipped',
      ...(profile.onboardingStep === 'legacy'
        ? {onboardingStep: 'ledger'}
        : {}),
      updatedAt: now,
    });
    return null;
  },
});
