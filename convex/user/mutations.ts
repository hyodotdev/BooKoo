import {v} from 'convex/values';

import {
  isSupportedCurrency,
  normalizeCurrencyCode,
} from '../../shared/currency';
import {
  hasCompletedOnboardingStep,
  nextOnboardingStep,
} from '../../shared/onboarding';
import {
  PROFILE_BIO_MAX_LENGTH,
  generatedDisplayName,
  validateDisplayName,
} from '../../shared/profile';
import {isEmailOtpProvider} from '../../shared/authPolicy';
import {LOCALE_DEFAULTS} from '../../shared/locales';
import {normalizeIpCountryCode} from '../../shared/ipCountry';
import {
  handleCandidates,
  isHandleClaimAvailable,
  validateHandle,
  type HandleRejection,
} from '../../shared/username';
import {
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_DOCUMENT_SHA256,
  TERMS_DOCUMENT_SHA256,
  LEGAL_ACKNOWLEDGEMENT,
  LEGACY_LEGAL_ACKNOWLEDGEMENT,
} from '../../shared/legal';
import {mutation} from '../lib/functions';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {
  appearanceValidator,
  localeValidator,
  onboardingStepValidator,
} from '../schema/userProfiles';
import {
  HANDLE_RELEASE_COOLDOWN_MS,
  HANDLE_RENAME_COOLDOWN_MS,
  DELETION_GRACE_MS,
  LEDGER_SCAN_LIMIT,
  LINKED_ACCOUNT_SCAN_LIMIT,
  USER_EMAIL_LIMIT,
  isSocialProvider,
  socialProviderValidator,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {ownedAvatarUrl} from '../lib/userProfiles';
import {enforceRateLimit} from '../lib/rateLimits';
import {
  requireActiveProfile,
  requireOnboarded,
  requireProfile,
} from '../lib/permissions';

const DAY_MS = 24 * 60 * 60 * 1000;

function invalidHandle(reason: HandleRejection): never {
  if (reason === 'RESERVED')
    throw appError('HANDLE_RESERVED', 'error.handle.reserved');
  if (reason === 'TOO_SHORT')
    throw appError('HANDLE_INVALID', 'error.handle.TOO_SHORT');
  if (reason === 'TOO_LONG')
    throw appError('HANDLE_INVALID', 'error.handle.TOO_LONG');
  if (reason === 'BAD_CHARSET')
    throw appError('HANDLE_INVALID', 'error.handle.BAD_CHARSET');
  if (reason === 'BAD_EDGE')
    throw appError('HANDLE_INVALID', 'error.handle.BAD_EDGE');
  throw appError('HANDLE_INVALID', 'error.handle.DOUBLE_SEPARATOR');
}

async function claimAvailableHandle(
  ctx: MutationCtx,
  input: {
    readonly userId: Id<'users'>;
    readonly handle: string;
    readonly key: string;
    readonly now: number;
  },
): Promise<void> {
  const claim = await ctx.db
    .query('userHandles')
    .withIndex('by_handleKey', (index) => index.eq('handleKey', input.key))
    .unique();
  if (claim !== null) {
    if (claim.releasedAt === undefined)
      throw appError('HANDLE_TAKEN', 'error.handle.taken');
    if (
      claim.userId !== input.userId &&
      input.now - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS
    )
      throw appError('HANDLE_COOLDOWN', 'error.handle.cooldown', {
        days: Math.ceil(
          (HANDLE_RELEASE_COOLDOWN_MS - (input.now - claim.releasedAt)) /
            DAY_MS,
        ),
      });
    await ctx.db.patch(claim._id, {
      handle: input.handle,
      userId: input.userId,
      claimedAt: input.now,
      releasedAt: undefined,
    });
  } else {
    await ctx.db.insert('userHandles', {
      handleKey: input.key,
      handle: input.handle,
      userId: input.userId,
      claimedAt: input.now,
    });
  }
}

export const claimHandle = mutation({
  args: {
    handle: v.string(),
    locale: v.optional(localeValidator),
    preferredCurrency: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    if (profile.handle !== undefined)
      throw appError('FORBIDDEN', 'error.handle.alreadySet');
    await enforceRateLimit(ctx, 'handleClaim', profile.userId);
    const checked = validateHandle(args.handle);
    if (!checked.ok) invalidHandle(checked.reason);
    const now = Date.now();
    const display = args.handle.trim();
    const existingName = validateDisplayName(profile.displayName);
    const displayName =
      existingName.ok && existingName.value.length > 0
        ? existingName.value
        : generatedDisplayName(profile.userId);
    const locale = args.locale ?? profile.locale;
    const currency = normalizeCurrencyCode(
      args.preferredCurrency ?? profile.preferredCurrency,
    );
    if (!isSupportedCurrency(currency))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const defaults = LOCALE_DEFAULTS[locale];
    await claimAvailableHandle(ctx, {
      userId: profile.userId,
      handle: display,
      key: checked.key,
      now,
    });
    const onboardingStep = nextOnboardingStep({
      hasHandle: true,
      profileStepDone: true,
      ledgerStepDone: hasCompletedOnboardingStep(
        profile.onboardingStep,
        'ledger',
      ),
      legacyClaimState: profile.legacyClaimState,
    });
    await ctx.db.patch(profile._id, {
      handle: display,
      handleKey: checked.key,
      handleUpdatedAt: now,
      displayName,
      locale,
      preferredCurrency: currency,
      preferredTimeZone: defaults.timeZone,
      preferredWeekStartsOn: defaults.weekStartsOn,
      onboardingStep,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'handle_claimed',
      detail: {handleKey: checked.key},
      createdAt: now,
    });
    return null;
  },
});

export const claimGeneratedIdentity = mutation({
  args: {
    locale: v.optional(localeValidator),
    preferredCurrency: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    if (profile.handle !== undefined) return null;
    await enforceRateLimit(ctx, 'handleClaim', profile.userId);
    const now = Date.now();
    const seed = `u${profile.userId}${now}`;
    let handle: string | null = null;
    for (const candidate of handleCandidates(
      seed,
      40,
      new Date(now).getUTCFullYear(),
    )) {
      const existing = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (index) => index.eq('handleKey', candidate))
        .unique();
      if (
        isHandleClaimAvailable(
          existing,
          profile.userId,
          now,
          HANDLE_RELEASE_COOLDOWN_MS,
        )
      ) {
        handle = candidate;
        break;
      }
    }
    if (handle === null) throw appError('HANDLE_TAKEN', 'error.handle.taken');
    const checked = validateHandle(handle);
    if (!checked.ok) invalidHandle(checked.reason);
    const existingName = validateDisplayName(profile.displayName);
    const displayName =
      existingName.ok && existingName.value.length > 0
        ? existingName.value
        : generatedDisplayName(profile.userId);
    const locale = args.locale ?? profile.locale;
    const currency = normalizeCurrencyCode(
      args.preferredCurrency ?? profile.preferredCurrency,
    );
    if (!isSupportedCurrency(currency))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const defaults = LOCALE_DEFAULTS[locale];
    await claimAvailableHandle(ctx, {
      userId: profile.userId,
      handle,
      key: checked.key,
      now,
    });
    const onboardingStep = nextOnboardingStep({
      hasHandle: true,
      profileStepDone: true,
      ledgerStepDone: hasCompletedOnboardingStep(
        profile.onboardingStep,
        'ledger',
      ),
      legacyClaimState: profile.legacyClaimState,
    });
    await ctx.db.patch(profile._id, {
      handle,
      handleKey: checked.key,
      handleUpdatedAt: now,
      displayName,
      locale,
      preferredCurrency: currency,
      preferredTimeZone: defaults.timeZone,
      preferredWeekStartsOn: defaults.weekStartsOn,
      onboardingStep,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'handle_claimed',
      detail: {handleKey: checked.key, generated: true},
      createdAt: now,
    });
    return null;
  },
});

export const changeHandle = mutation({
  args: {handle: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const previousKey = profile.handleKey;
    if (previousKey === undefined)
      throw appError('FORBIDDEN', 'error.handle.notSet');
    const checked = validateHandle(args.handle);
    if (!checked.ok) invalidHandle(checked.reason);
    const now = Date.now();
    const display = args.handle.trim();
    if (checked.key === previousKey) {
      await ctx.db.patch(profile._id, {handle: display, updatedAt: now});
      const own = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (index) =>
          index.eq('handleKey', checked.key),
        )
        .unique();
      if (own?.userId === profile.userId)
        await ctx.db.patch(own._id, {handle: display});
      return null;
    }
    if (
      profile.handleUpdatedAt !== undefined &&
      now - profile.handleUpdatedAt < HANDLE_RENAME_COOLDOWN_MS
    )
      throw appError('HANDLE_COOLDOWN', 'error.handle.renameTooSoon', {
        days: Math.ceil(
          (HANDLE_RENAME_COOLDOWN_MS - (now - profile.handleUpdatedAt)) /
            DAY_MS,
        ),
      });
    await enforceRateLimit(ctx, 'handleRename', profile.userId);
    await claimAvailableHandle(ctx, {
      userId: profile.userId,
      handle: display,
      key: checked.key,
      now,
    });
    const old = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (index) => index.eq('handleKey', previousKey))
      .unique();
    if (old?.userId === profile.userId)
      await ctx.db.patch(old._id, {releasedAt: now});
    await ctx.db.patch(profile._id, {
      handle: display,
      handleKey: checked.key,
      handleUpdatedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'handle_renamed',
      detail: {from: previousKey, to: checked.key},
      createdAt: now,
    });
    return null;
  },
});

export const completeProfileStep = mutation({
  args: {
    displayName: v.string(),
    avatarStorageId: v.optional(v.id('_storage')),
    locale: localeValidator,
    preferredCurrency: v.string(),
  },
  returns: v.object({onboardingStep: onboardingStepValidator}),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    const checkedName = validateDisplayName(args.displayName);
    if (!checkedName.ok) throw appError('INVALID_INPUT', 'error.invalidInput');
    const displayName =
      checkedName.value.length === 0
        ? generatedDisplayName(profile.userId)
        : checkedName.value;
    const currency = normalizeCurrencyCode(args.preferredCurrency);
    if (!isSupportedCurrency(currency))
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const defaults = LOCALE_DEFAULTS[args.locale];
    const avatarUrl =
      args.avatarStorageId === undefined
        ? undefined
        : await ownedAvatarUrl(ctx, profile.userId, args.avatarStorageId);
    const onboardingStep = nextOnboardingStep({
      hasHandle: profile.handle !== undefined,
      profileStepDone: true,
      ledgerStepDone: hasCompletedOnboardingStep(
        profile.onboardingStep,
        'ledger',
      ),
      legacyClaimState: profile.legacyClaimState,
    });
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      displayName,
      locale: args.locale,
      preferredCurrency: currency,
      preferredTimeZone: defaults.timeZone,
      preferredWeekStartsOn: defaults.weekStartsOn,
      ...(args.avatarStorageId === undefined
        ? {}
        : {
            avatarStorageId: args.avatarStorageId,
            avatarUrl,
          }),
      onboardingStep,
      updatedAt: now,
    });
    return {onboardingStep};
  },
});

export const completeLedgerStep = mutation({
  args: {
    skipped: v.boolean(),
    termsAccepted: v.boolean(),
    privacyAcknowledged: v.boolean(),
    age14Plus: v.boolean(),
    locale: localeValidator,
    legalDocumentVersion: v.optional(v.string()),
    termsDocumentSha256: v.optional(v.string()),
    privacyDocumentSha256: v.optional(v.string()),
  },
  returns: v.object({onboardingStep: onboardingStepValidator}),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    if (!args.termsAccepted || !args.privacyAcknowledged || !args.age14Plus)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const hasDocumentMetadata =
      args.legalDocumentVersion !== undefined ||
      args.termsDocumentSha256 !== undefined ||
      args.privacyDocumentSha256 !== undefined;
    if (
      hasDocumentMetadata &&
      (args.legalDocumentVersion !== LEGAL_DOCUMENT_VERSION ||
        args.termsDocumentSha256 !== TERMS_DOCUMENT_SHA256 ||
        args.privacyDocumentSha256 !== PRIVACY_DOCUMENT_SHA256)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const documents = hasDocumentMetadata
      ? LEGAL_ACKNOWLEDGEMENT
      : LEGACY_LEGAL_ACKNOWLEDGEMENT;
    if (!args.skipped) {
      const membership = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_userId_deletedAt', (index) =>
          index.eq('userId', profile.userId).eq('deletedAt', undefined),
        )
        .first();
      if (membership === null)
        throw appError('INVALID_INPUT', 'error.invalidInput');
    }
    const onboardingStep = nextOnboardingStep({
      hasHandle: profile.handle !== undefined,
      profileStepDone: true,
      ledgerStepDone: true,
      legacyClaimState: profile.legacyClaimState,
    });
    const now = Date.now();
    const legalEvents = [
      {
        kind: 'TERMS_ACCEPTED' as const,
        documentSha256: documents.termsDocumentSha256,
      },
      {
        kind: 'PRIVACY_NOTICE_ACKNOWLEDGED' as const,
        documentSha256: documents.privacyDocumentSha256,
      },
      {
        kind: 'AGE_14_PLUS_ATTESTED' as const,
        documentSha256: documents.termsDocumentSha256,
      },
    ];
    for (const event of legalEvents) {
      const existing = await ctx.db
        .query('legalEvents')
        .withIndex('by_userId_kind_createdAt', (index) =>
          index.eq('userId', profile.userId).eq('kind', event.kind),
        )
        .order('desc')
        .first();
      if (
        existing?.documentVersion !== documents.legalDocumentVersion ||
        existing.documentSha256 !== event.documentSha256
      )
        await ctx.db.insert('legalEvents', {
          userId: profile.userId,
          kind: event.kind,
          documentVersion: documents.legalDocumentVersion,
          documentSha256: event.documentSha256,
          locale: args.locale,
          createdAt: now,
        });
    }
    await ctx.db.patch(profile._id, {
      onboardingStep,
      ...(onboardingStep === 'done'
        ? {onboardingCompletedAt: profile.onboardingCompletedAt ?? now}
        : {}),
      updatedAt: now,
    });
    return {onboardingStep};
  },
});

export const setLocale = mutation({
  args: {locale: localeValidator},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    await ctx.db.patch(profile._id, {
      locale: args.locale,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setAppearance = mutation({
  args: {appearance: appearanceValidator},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    await ctx.db.patch(profile._id, {
      appearance: args.appearance,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    bio: v.string(),
    preferredCurrency: v.string(),
    avatarStorageId: v.optional(v.id('_storage')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const currency = normalizeCurrencyCode(args.preferredCurrency);
    const checkedName = validateDisplayName(args.displayName);
    const avatarStorageId = args.avatarStorageId;
    if (
      !checkedName.ok ||
      args.bio.trim().length > PROFILE_BIO_MAX_LENGTH ||
      currency === null ||
      !isSupportedCurrency(currency)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const avatarUrl =
      avatarStorageId === undefined
        ? undefined
        : await ownedAvatarUrl(ctx, profile.userId, avatarStorageId);
    await ctx.db.patch(profile._id, {
      displayName:
        checkedName.value.length === 0
          ? generatedDisplayName(profile.userId)
          : checkedName.value,
      bio: args.bio.trim(),
      preferredCurrency: currency,
      ...(avatarStorageId === undefined
        ? {}
        : {
            avatarStorageId,
            avatarUrl: avatarUrl ?? undefined,
            avatarThumbUrl: avatarUrl ?? undefined,
          }),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateNotificationPreferences = mutation({
  args: {
    pushEnabled: v.boolean(),
    notifyLedgerActivity: v.boolean(),
    notifyComments: v.boolean(),
    notifyInvites: v.boolean(),
    quietHoursStartMinute: v.optional(v.number()),
    quietHoursEndMinute: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const bothAbsent =
      args.quietHoursStartMinute === undefined &&
      args.quietHoursEndMinute === undefined;
    const bothValid =
      args.quietHoursStartMinute !== undefined &&
      args.quietHoursEndMinute !== undefined &&
      Number.isSafeInteger(args.quietHoursStartMinute) &&
      Number.isSafeInteger(args.quietHoursEndMinute) &&
      args.quietHoursStartMinute >= 0 &&
      args.quietHoursStartMinute <= 1439 &&
      args.quietHoursEndMinute >= 0 &&
      args.quietHoursEndMinute <= 1439 &&
      args.quietHoursStartMinute !== args.quietHoursEndMinute;
    if (!bothAbsent && !bothValid)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    await ctx.db.patch(profile._id, {
      pushEnabled: args.pushEnabled,
      notifyLedgerActivity: args.notifyLedgerActivity,
      notifyComments: args.notifyComments,
      notifyInvites: args.notifyInvites,
      quietHoursStartMinute: args.quietHoursStartMinute,
      quietHoursEndMinute: args.quietHoursEndMinute,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const requestAccountDeletion = mutation({
  args: {reason: v.optional(v.string())},
  returns: v.object({purgeAfter: v.number()}),
  handler: async (ctx, args): Promise<{purgeAfter: number}> => {
    const profile = await requireOnboarded(ctx);
    await enforceRateLimit(ctx, 'deletionRequest', String(profile.userId));
    const reason = args.reason?.trim();
    if (reason !== undefined && reason.length > 200)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    const purgeAfter = now + DELETION_GRACE_MS;
    await ctx.db.patch(profile._id, {
      deletedAt: now,
      purgeAfter,
      ...(reason === undefined || reason.length === 0
        ? {}
        : {deletionReason: reason}),
      updatedAt: now,
    });
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId_disabledAt', (index) =>
        index.eq('userId', profile.userId),
      )
      .take(9);
    for (const token of tokens) await ctx.db.delete(token._id);
    if (profile.handleKey !== undefined) {
      const handleKey = profile.handleKey;
      const handle = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (index) => index.eq('handleKey', handleKey))
        .unique();
      if (handle?.userId === profile.userId)
        await ctx.db.patch(handle._id, {releasedAt: now});
    }
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'deletion_requested',
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.user.actions.revokeAppleTokens, {
      userId: profile.userId,
    });
    await ctx.scheduler.runAfter(0, internal.user.deletion.handOffLedgers, {
      userId: profile.userId,
      phase: 'OWNED',
    });
    await ctx.scheduler.runAfter(
      DELETION_GRACE_MS,
      internal.user.deletion.purgeUser,
      {
        userId: profile.userId,
        phase: 'EXPORTS',
      },
    );
    return {purgeAfter};
  },
});

export const setCountryAnalytics = mutation({
  args: {
    enabled: v.boolean(),
    documentVersion: v.optional(v.string()),
    documentSha256: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    if (
      args.enabled &&
      (args.documentVersion !== LEGAL_DOCUMENT_VERSION ||
        args.documentSha256 !== PRIVACY_DOCUMENT_SHA256)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const wasEnabled = profile.countryAnalyticsEnabled === true;
    if (args.enabled && wasEnabled) return null;
    if (args.enabled)
      await enforceRateLimit(ctx, 'countryAnalyticsGrant', profile.userId);
    if (!args.enabled) {
      const presence = await ctx.db
        .query('userPresence')
        .withIndex('by_userId', (index) => index.eq('userId', profile.userId))
        .unique();
      if (presence?.ipCountryCodeAtLastSeen !== undefined)
        await ctx.db.patch('userPresence', presence._id, {
          ipCountryCodeAtLastSeen: undefined,
        });
    }
    if (wasEnabled === args.enabled) return null;
    const now = Date.now();
    await ctx.db.patch('userProfiles', profile._id, {
      countryAnalyticsEnabled: args.enabled,
      updatedAt: now,
    });
    await ctx.db.insert('legalEvents', {
      userId: profile.userId,
      kind: args.enabled
        ? 'OPTIONAL_COUNTRY_ANALYTICS_GRANTED'
        : 'OPTIONAL_COUNTRY_ANALYTICS_WITHDRAWN',
      documentVersion: LEGAL_DOCUMENT_VERSION,
      documentSha256: PRIVACY_DOCUMENT_SHA256,
      locale: profile.locale,
      createdAt: now,
    });
    return null;
  },
});

export const touchPresence = mutation({
  args: {
    platform: v.union(v.literal('ios'), v.literal('android'), v.literal('web')),
    appVersion: v.string(),
    buildNumber: v.number(),
    locale: localeValidator,
    ipCountryCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    if (!Number.isSafeInteger(args.buildNumber) || args.buildNumber < 1)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const ipCountryCode = normalizeIpCountryCode(args.ipCountryCode);
    if (args.ipCountryCode !== undefined && ipCountryCode === undefined)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const row = await ctx.db
      .query('userPresence')
      .withIndex('by_userId', (index) => index.eq('userId', profile.userId))
      .unique();
    const now = Date.now();
    const value = {
      userId: profile.userId,
      lastSeenAt: now,
      platform: args.platform,
      appVersion: args.appVersion.slice(0, 40),
      buildNumber: args.buildNumber,
      localeAtLastSeen: args.locale,
      ipCountryCodeAtLastSeen:
        profile.countryAnalyticsEnabled === true ? ipCountryCode : undefined,
    };
    if (row === null) await ctx.db.insert('userPresence', value);
    else if (now - row.lastSeenAt >= 5 * 60 * 1000)
      await ctx.db.replace(row._id, value);
    else if (
      profile.countryAnalyticsEnabled === true &&
      ipCountryCode !== undefined &&
      row.ipCountryCodeAtLastSeen === undefined
    )
      // At most one enrichment per ordinary presence version; never move its
      // activity timestamp or turn a repeated country report into more activity.
      await ctx.db.patch('userPresence', row._id, {
        ipCountryCodeAtLastSeen: ipCountryCode,
      });
    return null;
  },
});

export const setPrimaryEmail = mutation({
  args: {userEmailId: v.id('userEmails')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const selected = await ctx.db.get('userEmails', args.userEmailId);
    if (
      selected === null ||
      selected.userId !== profile.userId ||
      selected.deletedAt !== undefined
    )
      throw appError('NOT_FOUND', 'error.notFound');
    const rows = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(USER_EMAIL_LIMIT + 1);
    if (rows.length > USER_EMAIL_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const now = Date.now();
    for (const row of rows)
      await ctx.db.patch(row._id, {
        isPrimary: row._id === selected._id,
        updatedAt: now,
      });
    await ctx.db.patch(profile.userId, {
      email: selected.emailNormalized,
      emailVerificationTime: selected.verifiedAt,
    });
    await ctx.db.patch(profile._id, {
      emailNormalized: selected.emailNormalized,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'primary_email_changed',
      detail: {email: selected.emailNormalized},
      createdAt: now,
    });
    return null;
  },
});

export const removeEmail = mutation({
  args: {userEmailId: v.id('userEmails')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const selected = await ctx.db.get('userEmails', args.userEmailId);
    if (
      selected === null ||
      selected.userId !== profile.userId ||
      selected.deletedAt !== undefined
    )
      return null;
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (index) =>
        index.eq('userId', profile.userId),
      )
      .take(LINKED_ACCOUNT_SCAN_LIMIT + 1);
    if (accounts.length > LINKED_ACCOUNT_SCAN_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const targetAccounts = accounts.filter(
      (row) =>
        (isEmailOtpProvider(row.provider) || row.provider === 'email-link') &&
        row.providerAccountId === selected.emailNormalized,
    );
    const otherUsable = accounts.filter(
      (row) =>
        !targetAccounts.some((target) => target._id === row._id) &&
        (isSocialProvider(row.provider) ||
          ((isEmailOtpProvider(row.provider) ||
            row.provider === 'email-link') &&
            row.emailVerified !== undefined)),
    );
    if (otherUsable.length === 0)
      throw appError('LINK_LAST_METHOD', 'error.link.lastMethod');
    for (const account of targetAccounts) await ctx.db.delete(account._id);
    const now = Date.now();
    await ctx.db.patch(selected._id, {
      isPrimary: false,
      deletedAt: now,
      deletedByUserId: profile.userId,
      updatedAt: now,
    });
    if (selected.isPrimary) {
      const replacement = await ctx.db
        .query('userEmails')
        .withIndex('by_userId_deletedAt', (index) =>
          index.eq('userId', profile.userId).eq('deletedAt', undefined),
        )
        .first();
      await ctx.db.patch(profile.userId, {
        email: replacement?.emailNormalized,
        emailVerificationTime: replacement?.verifiedAt,
      });
      await ctx.db.patch(profile._id, {
        emailNormalized: replacement?.emailNormalized,
        updatedAt: now,
      });
      if (replacement !== null)
        await ctx.db.patch(replacement._id, {isPrimary: true, updatedAt: now});
    }
    return null;
  },
});

export const unlinkAccount = mutation({
  args: {
    method: v.union(socialProviderValidator, v.literal('email')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const rows = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (index) =>
        index.eq('userId', profile.userId),
      )
      .take(LINKED_ACCOUNT_SCAN_LIMIT + 1);
    if (rows.length > LINKED_ACCOUNT_SCAN_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const usable = rows.filter(
      (row) =>
        isSocialProvider(row.provider) ||
        ((isEmailOtpProvider(row.provider) || row.provider === 'email-link') &&
          row.emailVerified !== undefined),
    );
    const target = usable.filter((row) =>
      args.method === 'email'
        ? isEmailOtpProvider(row.provider) || row.provider === 'email-link'
        : row.provider === args.method,
    );
    if (target.length === 0) return null;
    if (target.length === usable.length)
      throw appError('LINK_LAST_METHOD', 'error.link.lastMethod');
    for (const row of target) await ctx.db.delete(row._id);
    const now = Date.now();
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'account_unlinked',
      detail: {method: args.method},
      createdAt: now,
    });
    if (args.method === 'apple')
      await ctx.scheduler.runAfter(0, internal.user.actions.revokeAppleTokens, {
        userId: profile.userId,
      });
    return null;
  },
});

export const cancelAccountDeletion = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const profile = await requireProfile(ctx);
    if (profile.deletedAt === undefined) return null;
    if (profile.purgedAt !== undefined)
      throw appError('ACCOUNT_DELETED', 'error.account.purged');
    const now = Date.now();
    const deletedMemberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).gte('deletedAt', profile.deletedAt),
      )
      .take(LEDGER_SCAN_LIMIT + 1);
    if (deletedMemberships.length > LEDGER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    for (const membership of deletedMemberships) {
      if (membership.endReason !== 'LEFT') continue;
      const ledger = await ctx.db.get('ledgers', membership.ledgerId);
      if (ledger === null || ledger.deletedAt !== undefined) continue;
      await ctx.db.patch(membership._id, {
        deletedAt: undefined,
        endReason: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(ledger._id, {
        memberCount: ledger.memberCount + 1,
        ...(ledger.orphanedAt !== undefined && ledger.ownerId === profile.userId
          ? {orphanedAt: undefined}
          : {}),
        updatedAt: now,
      });
    }
    if (profile.handleKey !== undefined) {
      const handleKey = profile.handleKey;
      const claim = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (index) => index.eq('handleKey', handleKey))
        .unique();
      if (claim?.userId === profile.userId)
        await ctx.db.patch(claim._id, {
          releasedAt: undefined,
          claimedAt: now,
        });
    }
    await ctx.db.patch(profile._id, {
      deletedAt: undefined,
      purgeAfter: undefined,
      deletionReason: undefined,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'deletion_cancelled',
      createdAt: now,
    });
    return null;
  },
});
