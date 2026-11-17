import {v} from 'convex/values';

import {
  handleCandidates,
  isHandleClaimAvailable,
  validateHandle,
} from '../../shared/username';
import {isEmailOtpProvider} from '../../shared/authPolicy';
import {query} from '../_generated/server';
import {hasBlockRelationship} from '../lib/blocks';
import {
  appearanceValidator,
  appRoleValidator,
  legacyClaimStateValidator,
  localeValidator,
  onboardingStepValidator,
} from '../schema/userProfiles';
import {userEmailSourceValidator} from '../schema/userEmails';
import {
  HANDLE_RELEASE_COOLDOWN_MS,
  HANDLE_SUGGESTION_PROBE_LIMIT,
  HANDLE_SUGGESTION_RESULT_LIMIT,
  LINKED_ACCOUNT_SCAN_LIMIT,
  RECENT_RENAME_BADGE_MS,
  USER_EMAIL_LIMIT,
  isSocialProvider,
  socialProviderValidator,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {getCurrentProfile, requireActiveProfile} from '../lib/permissions';

const handleRejectionValidator = v.union(
  v.literal('TOO_SHORT'),
  v.literal('TOO_LONG'),
  v.literal('BAD_CHARSET'),
  v.literal('BAD_EDGE'),
  v.literal('DOUBLE_SEPARATOR'),
  v.literal('RESERVED'),
);

const handleAvailabilityValidator = v.union(
  v.object({status: v.literal('AVAILABLE')}),
  v.object({status: v.literal('INVALID'), reason: handleRejectionValidator}),
  v.object({status: v.literal('RESERVED')}),
  v.object({status: v.literal('COOLDOWN')}),
  v.object({
    status: v.literal('TAKEN'),
    suggestions: v.array(v.string()),
  }),
);

async function availableSuggestions(
  ctx: Parameters<typeof requireActiveProfile>[0],
  seed: string,
  count: number,
  now: number,
  currentUserId: Awaited<ReturnType<typeof requireActiveProfile>>['userId'],
): Promise<string[]> {
  const output: string[] = [];
  for (const candidate of handleCandidates(
    seed,
    HANDLE_SUGGESTION_PROBE_LIMIT,
    new Date(now).getUTCFullYear(),
  )) {
    const existing = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (index) => index.eq('handleKey', candidate))
      .unique();
    if (
      isHandleClaimAvailable(
        existing,
        currentUserId,
        now,
        HANDLE_RELEASE_COOLDOWN_MS,
      )
    )
      output.push(candidate);
    if (output.length >= count) break;
  }
  return output;
}

export const currentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.union(v.string(), v.null()),
      displayName: v.string(),
      avatar: v.union(v.string(), v.null()),
      locale: localeValidator,
      appearance: appearanceValidator,
      preferredCurrency: v.string(),
      bio: v.string(),
      pushEnabled: v.boolean(),
      notifyLedgerActivity: v.boolean(),
      notifyComments: v.boolean(),
      notifyInvites: v.boolean(),
      countryAnalyticsEnabled: v.optional(v.boolean()),
      quietHoursStartMinute: v.union(v.number(), v.null()),
      quietHoursEndMinute: v.union(v.number(), v.null()),
      appRole: appRoleValidator,
      onboardingStep: onboardingStepValidator,
      legacyClaimState: legacyClaimStateValidator,
      suspended: v.boolean(),
      purgeAfter: v.union(v.number(), v.null()),
      hasVerifiedEmail: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await getCurrentProfile(ctx);
    if (profile === null) return null;
    const email = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .first();
    return {
      userId: profile.userId,
      handle: profile.handle ?? null,
      displayName: profile.displayName,
      avatar:
        profile.avatarThumbUrl ??
        profile.avatarUrl ??
        profile.avatarLegacyUrl ??
        null,
      locale: profile.locale,
      appearance: profile.appearance,
      preferredCurrency: profile.preferredCurrency,
      bio: profile.bio,
      pushEnabled: profile.pushEnabled,
      notifyLedgerActivity: profile.notifyLedgerActivity,
      notifyComments: profile.notifyComments,
      notifyInvites: profile.notifyInvites,
      countryAnalyticsEnabled: profile.countryAnalyticsEnabled ?? false,
      quietHoursStartMinute: profile.quietHoursStartMinute ?? null,
      quietHoursEndMinute: profile.quietHoursEndMinute ?? null,
      appRole: profile.appRole,
      onboardingStep: profile.onboardingStep,
      legacyClaimState: profile.legacyClaimState,
      suspended: profile.appRole === 'SUSPENDED',
      purgeAfter: profile.purgeAfter ?? null,
      hasVerifiedEmail: email !== null,
    };
  },
});

export const linkedAccounts = query({
  args: {},
  returns: v.array(
    v.object({
      method: v.union(socialProviderValidator, v.literal('email')),
      label: v.optional(v.string()),
      removable: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireActiveProfile(ctx);
    const rows = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (index) =>
        index.eq('userId', profile.userId),
      )
      .take(LINKED_ACCOUNT_SCAN_LIMIT + 1);
    if (rows.length > LINKED_ACCOUNT_SCAN_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const logical = new Map<
      'apple' | 'google' | 'kakao' | 'naver' | 'email',
      string | undefined
    >();
    for (const row of rows) {
      if (isSocialProvider(row.provider)) logical.set(row.provider, undefined);
      else if (
        (isEmailOtpProvider(row.provider) || row.provider === 'email-link') &&
        row.emailVerified !== undefined
      )
        logical.set('email', row.emailVerified);
    }
    return [...logical.entries()].map(([method, label]) => ({
      method,
      ...(label === undefined ? {} : {label}),
      removable: logical.size > 1,
    }));
  },
});

export const myEmails = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('userEmails'),
      email: v.string(),
      isPrimary: v.boolean(),
      source: userEmailSourceValidator,
      verifiedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireActiveProfile(ctx);
    const rows = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(USER_EMAIL_LIMIT + 1);
    if (rows.length > USER_EMAIL_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    return rows.map((row) => ({
      id: row._id,
      email: row.emailRaw,
      isPrimary: row.isPrimary,
      source: row.source,
      verifiedAt: row.verifiedAt,
    }));
  },
});

export const checkHandleAvailability = query({
  args: {handle: v.string(), now: v.number()},
  returns: handleAvailabilityValidator,
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    const checked = validateHandle(args.handle);
    if (!checked.ok)
      return checked.reason === 'RESERVED'
        ? ({status: 'RESERVED'} as const)
        : ({status: 'INVALID', reason: checked.reason} as const);
    const claim = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (index) => index.eq('handleKey', checked.key))
      .unique();
    if (
      claim === null ||
      isHandleClaimAvailable(
        claim,
        profile.userId,
        args.now,
        HANDLE_RELEASE_COOLDOWN_MS,
      )
    )
      return {status: 'AVAILABLE'} as const;
    if (claim.releasedAt === undefined)
      return {
        status: 'TAKEN',
        suggestions: await availableSuggestions(
          ctx,
          checked.key,
          HANDLE_SUGGESTION_RESULT_LIMIT,
          args.now,
          profile.userId,
        ),
      } as const;
    if (args.now - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS)
      return {status: 'COOLDOWN'} as const;
    return {status: 'AVAILABLE'} as const;
  },
});

export const handleSuggestions = query({
  args: {seed: v.string(), count: v.optional(v.number()), now: v.number()},
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    const count = Math.max(
      1,
      Math.min(args.count ?? HANDLE_SUGGESTION_RESULT_LIMIT, 5),
    );
    return availableSuggestions(
      ctx,
      args.seed,
      count,
      args.now,
      profile.userId,
    );
  },
});

export const publicProfileByHandle = query({
  args: {handle: v.string(), now: v.number()},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.string(),
      displayName: v.string(),
      avatar: v.union(v.string(), v.null()),
      recentlyRenamed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getCurrentProfile(ctx);
    const checked = validateHandle(args.handle);
    if (!checked.ok) return null;
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_handleKey', (index) => index.eq('handleKey', checked.key))
      .unique();
    if (
      profile === null ||
      profile.deletedAt !== undefined ||
      profile.isPlaceholder ||
      profile.handle === undefined
    )
      return null;
    if (
      viewer !== null &&
      (await hasBlockRelationship(ctx, viewer.userId, profile.userId))
    )
      return null;
    return {
      userId: profile.userId,
      handle: profile.handle,
      displayName: profile.displayName,
      avatar:
        profile.avatarThumbUrl ??
        profile.avatarUrl ??
        profile.avatarLegacyUrl ??
        null,
      recentlyRenamed:
        profile.handleUpdatedAt !== undefined &&
        args.now - profile.handleUpdatedAt < RECENT_RENAME_BADGE_MS,
    };
  },
});
