import {invalidateSessions} from '@convex-dev/auth/server';
import {sha256} from '@oslojs/crypto/sha2';
import {encodeHexLowerCase} from '@oslojs/encoding';
import {v} from 'convex/values';

import {hasMatchingAccountEmails} from '../../shared/authPolicy';
import {normalizeEmail} from '../../shared/email';
import {internal} from '../_generated/api';
import type {Doc, Id} from '../_generated/dataModel';
import {action, internalAction, internalQuery} from '../_generated/server';
import {internalMutation} from '../lib/functions';
import {
  APPLE_TOKEN_SCAN_LIMIT,
  EMAIL_LINK_CODE_TTL_MS,
  EMAIL_LINK_MAX_ATTEMPTS,
  LINKED_ACCOUNT_SCAN_LIMIT,
  USER_EMAIL_LIMIT,
  socialProviderValidator,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {
  appleClientSecretConfig,
  appleWebRedirectUri,
  exchangeAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from '../lib/appleTokens';
import {isAppleServiceId, verifySocialCredentials} from '../lib/idToken';
import {
  requireActionUserId,
  requireProfileOf,
  requireStoredProfileOf,
} from '../lib/permissions';
import {enforceRateLimit} from '../lib/rateLimits';
import {upsertVerifiedEmail} from '../lib/userEmails';
import {maybeStartLegacyClaim} from '../legacy/internal';
import {emailTemplates} from '../otp/emailTemplates';
import {fromAddress, sendResendEmail} from '../otp/resendClient';

function hashCode(code: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(code)));
}

function randomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => String(value % 10)).join('');
}

async function isDisposableProfile(
  ctx: Parameters<typeof requireProfileOf>[0],
  profile: Doc<'userProfiles'>,
  sharedEmail: string,
): Promise<boolean> {
  if (
    profile.onboardingStep === 'done' ||
    profile.legacyClaimState === 'claimed' ||
    profile.legacyClaimState === 'pending'
  )
    return false;
  const [membership, ownedLedger, handle, token, legacy, push, emails] =
    await Promise.all([
      ctx.db
        .query('ledgerMembers')
        .withIndex('by_userId_deletedAt', (query) =>
          query.eq('userId', profile.userId).eq('deletedAt', undefined),
        )
        .first(),
      ctx.db
        .query('ledgers')
        .withIndex('by_ownerId_deletedAt', (query) =>
          query.eq('ownerId', profile.userId).eq('deletedAt', undefined),
        )
        .first(),
      ctx.db
        .query('userHandles')
        .withIndex('by_userId_releasedAt', (query) =>
          query.eq('userId', profile.userId).eq('releasedAt', undefined),
        )
        .first(),
      ctx.db
        .query('appleRefreshTokens')
        .withIndex('by_userId_clientId', (query) =>
          query.eq('userId', profile.userId),
        )
        .first(),
      ctx.db
        .query('legacyUsers')
        .withIndex('by_placeholderUserId', (query) =>
          query.eq('placeholderUserId', profile.userId),
        )
        .first(),
      ctx.db
        .query('pushTokens')
        .withIndex('by_userId_disabledAt', (query) =>
          query.eq('userId', profile.userId),
        )
        .first(),
      ctx.db
        .query('userEmails')
        .withIndex('by_userId_deletedAt', (query) =>
          query.eq('userId', profile.userId).eq('deletedAt', undefined),
        )
        .take(USER_EMAIL_LIMIT + 1),
    ]);
  return (
    membership === null &&
    ownedLedger === null &&
    handle === null &&
    token === null &&
    legacy === null &&
    push === null &&
    emails.length <= USER_EMAIL_LIMIT &&
    emails.every((row) => row.emailNormalized === sharedEmail)
  );
}

export const linkAccount = action({
  args: {
    provider: socialProviderValidator,
    credentials: v.object({
      idToken: v.optional(v.string()),
      accessToken: v.optional(v.string()),
      nonce: v.optional(v.string()),
      authorizationCode: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  },
  returns: v.object({merged: v.boolean()}),
  handler: async (ctx, args): Promise<{merged: boolean}> => {
    const userId = await requireActionUserId(ctx);
    const verified = await verifySocialCredentials(
      args.provider,
      args.credentials,
    );
    const result: {
      merged: boolean;
      invalidatedUserId: Id<'users'> | null;
    } = await ctx.runMutation(internal.user.actions.linkVerifiedAccount, {
      userId,
      provider: args.provider,
      providerAccountId: verified.identity.subject,
      credentialEmail: verified.identity.emailVerified
        ? verified.identity.email
        : undefined,
      appleClientId:
        args.provider === 'apple' ? verified.apple?.audience : undefined,
      appleAuthorizationCode:
        args.provider === 'apple'
          ? verified.apple?.authorizationCode
          : undefined,
    });
    if (result.invalidatedUserId !== null)
      await invalidateSessions(ctx, {userId: result.invalidatedUserId});
    return {merged: result.merged};
  },
});

export const startEmailLink = action({
  args: {
    email: v.string(),
    locale: v.union(
      v.literal('ko'),
      v.literal('en'),
      v.literal('ja'),
      v.literal('zh'),
      v.literal('id'),
    ),
  },
  returns: v.object({expiresAt: v.number()}),
  handler: async (ctx, args): Promise<{expiresAt: number}> => {
    const userId = await requireActionUserId(ctx);
    const email = normalizeEmail(args.email);
    if (email === undefined)
      throw appError('INVALID_INPUT', 'error.email.invalid');
    const code = randomCode();
    const stored: {expiresAt: number} = await ctx.runMutation(
      internal.user.actions.storeEmailLinkCode,
      {userId, email, codeHash: hashCode(code)},
    );
    const template = emailTemplates[args.locale];
    try {
      await sendResendEmail(process.env.AUTH_RESEND_KEY, {
        from: `BooKoo <${fromAddress()}>`,
        to: [email],
        subject: template.linkSubject,
        text: template.linkText(code),
        html: template.linkHtml(code),
      });
    } catch (error: unknown) {
      console.error('Email-link delivery failed', error);
      throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.otp.delivery');
    }
    return stored;
  },
});

export const confirmEmailLink = action({
  args: {email: v.string(), code: v.string()},
  returns: v.object({legacyClaimStarted: v.boolean()}),
  handler: async (ctx, args): Promise<{legacyClaimStarted: boolean}> => {
    const userId = await requireActionUserId(ctx);
    const email = normalizeEmail(args.email);
    if (email === undefined)
      throw appError('INVALID_INPUT', 'error.email.invalid');
    const result: {
      legacyClaimStarted: boolean;
      invalidatedUserId: Id<'users'> | null;
    } = await ctx.runMutation(internal.user.actions.applyEmailLink, {
      userId,
      email,
      code: args.code.trim(),
    });
    if (result.invalidatedUserId !== null)
      await invalidateSessions(ctx, {userId: result.invalidatedUserId});
    return {legacyClaimStarted: result.legacyClaimStarted};
  },
});

export const linkVerifiedAccount = internalMutation({
  args: {
    userId: v.id('users'),
    provider: socialProviderValidator,
    providerAccountId: v.string(),
    credentialEmail: v.optional(v.string()),
    appleClientId: v.optional(v.string()),
    appleAuthorizationCode: v.optional(v.string()),
  },
  returns: v.object({
    merged: v.boolean(),
    invalidatedUserId: v.union(v.id('users'), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireProfileOf(ctx, args.userId);
    await enforceRateLimit(ctx, 'accountLink', args.userId);
    const matches = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (query) =>
        query
          .eq('provider', args.provider)
          .eq('providerAccountId', args.providerAccountId),
      )
      .take(3);
    if (matches.length > 1)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    if (matches[0]?.userId === args.userId)
      return {merged: false, invalidatedUserId: null};

    const currentProviderRows = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (query) =>
        query.eq('userId', args.userId).eq('provider', args.provider),
      )
      .take(2);
    if (currentProviderRows.length > 0)
      throw appError('LINK_CONFLICT', 'error.link.unlinkFirst');

    let invalidatedUserId: Id<'users'> | null = null;
    const foreign = matches[0];
    if (foreign !== undefined) {
      const otherProfile = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', (query) => query.eq('userId', foreign.userId))
        .unique();
      const currentUser = await ctx.db.get('users', args.userId);
      const otherUser = await ctx.db.get('users', foreign.userId);
      const sharedEmail = normalizeEmail(
        args.credentialEmail ?? currentUser?.email,
      );
      if (
        otherProfile === null ||
        otherProfile.deletedAt !== undefined ||
        sharedEmail === undefined ||
        !hasMatchingAccountEmails(
          currentUser?.email,
          otherUser?.email,
          args.credentialEmail,
        ) ||
        !(await isDisposableProfile(ctx, otherProfile, sharedEmail))
      )
        throw appError('LINK_CONFLICT', 'error.link.bothHaveData');

      const [currentAccounts, otherAccounts] = await Promise.all([
        ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (query) =>
            query.eq('userId', args.userId),
          )
          .take(LINKED_ACCOUNT_SCAN_LIMIT + 1),
        ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (query) =>
            query.eq('userId', foreign.userId),
          )
          .take(LINKED_ACCOUNT_SCAN_LIMIT + 1),
      ]);
      if (
        currentAccounts.length > LINKED_ACCOUNT_SCAN_LIMIT ||
        otherAccounts.length > LINKED_ACCOUNT_SCAN_LIMIT
      )
        throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
      const currentProviders = new Set(
        currentAccounts.map((account) => account.provider),
      );
      if (
        otherAccounts.some((account) => currentProviders.has(account.provider))
      )
        throw appError('LINK_CONFLICT', 'error.link.unlinkFirst');

      for (const account of otherAccounts)
        await ctx.db.patch(account._id, {userId: args.userId});
      const now = Date.now();
      const otherEmails = await ctx.db
        .query('userEmails')
        .withIndex('by_userId_deletedAt', (query) =>
          query.eq('userId', foreign.userId).eq('deletedAt', undefined),
        )
        .take(USER_EMAIL_LIMIT + 1);
      for (const email of otherEmails)
        await ctx.db.patch(email._id, {
          deletedAt: now,
          deletedByUserId: args.userId,
          updatedAt: now,
        });
      await ctx.db.patch(foreign.userId, {
        name: undefined,
        image: undefined,
        email: undefined,
        emailVerificationTime: undefined,
      });
      await ctx.db.patch(otherProfile._id, {
        deletedAt: now,
        purgedAt: now,
        displayName: '',
        emailNormalized: undefined,
        updatedAt: now,
      });
      await ctx.db.insert('authAudit', {
        userId: args.userId,
        event: 'accounts_merged',
        detail: {provider: args.provider},
        createdAt: now,
      });
      invalidatedUserId = foreign.userId;
    } else {
      await ctx.db.insert('authAccounts', {
        userId: args.userId,
        provider: args.provider,
        providerAccountId: args.providerAccountId,
        ...(args.credentialEmail === undefined
          ? {}
          : {emailVerified: args.credentialEmail}),
      });
    }

    const now = Date.now();
    if (args.credentialEmail !== undefined)
      await upsertVerifiedEmail(ctx, {
        userId: args.userId,
        email: args.credentialEmail,
        source:
          args.provider === 'google'
            ? 'GOOGLE'
            : args.provider === 'apple'
              ? 'APPLE'
              : 'KAKAO',
        now,
      });
    await ctx.db.insert('authAudit', {
      userId: args.userId,
      event: 'account_linked',
      detail: {provider: args.provider},
      createdAt: now,
    });
    if (
      args.provider === 'apple' &&
      args.appleClientId !== undefined &&
      args.appleAuthorizationCode !== undefined
    )
      await ctx.scheduler.runAfter(0, internal.user.actions.exchangeAppleCode, {
        userId: args.userId,
        clientId: args.appleClientId,
        authorizationCode: args.appleAuthorizationCode,
      });
    return {merged: invalidatedUserId !== null, invalidatedUserId};
  },
});

export const storeEmailLinkCode = internalMutation({
  args: {userId: v.id('users'), email: v.string(), codeHash: v.string()},
  returns: v.object({expiresAt: v.number()}),
  handler: async (ctx, args) => {
    await requireProfileOf(ctx, args.userId);
    await enforceRateLimit(ctx, 'emailLinkRequest', args.userId);
    await enforceRateLimit(ctx, 'emailLinkRequest', args.email);
    const prior = await ctx.db
      .query('emailLinkCodes')
      .withIndex('by_userId', (query) => query.eq('userId', args.userId))
      .take(3);
    for (const row of prior) await ctx.db.delete(row._id);
    const now = Date.now();
    const expiresAt = now + EMAIL_LINK_CODE_TTL_MS;
    await ctx.db.insert('emailLinkCodes', {
      userId: args.userId,
      emailNormalized: args.email,
      codeHash: args.codeHash,
      expiresAt,
      attemptsLeft: EMAIL_LINK_MAX_ATTEMPTS,
      createdAt: now,
    });
    return {expiresAt};
  },
});

export const applyEmailLink = internalMutation({
  args: {userId: v.id('users'), email: v.string(), code: v.string()},
  returns: v.object({
    legacyClaimStarted: v.boolean(),
    invalidatedUserId: v.union(v.id('users'), v.null()),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfileOf(ctx, args.userId);
    await enforceRateLimit(ctx, 'emailLinkConfirm', args.userId);
    const row = await ctx.db
      .query('emailLinkCodes')
      .withIndex('by_userId', (query) => query.eq('userId', args.userId))
      .order('desc')
      .first();
    const now = Date.now();
    if (
      row === null ||
      row.expiresAt <= now ||
      row.attemptsLeft <= 0 ||
      row.emailNormalized !== args.email ||
      row.codeHash !== hashCode(args.code)
    ) {
      if (row !== null && row.attemptsLeft > 0)
        await ctx.db.patch(row._id, {attemptsLeft: row.attemptsLeft - 1});
      throw appError('INVALID_INPUT', 'error.auth.otp.mismatch');
    }
    await ctx.db.delete(row._id);

    const accountRows = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (query) =>
        query.eq('provider', 'email-link').eq('providerAccountId', args.email),
      )
      .take(3);
    if (accountRows.length > 1)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
    const invalidatedUserId =
      accountRows[0] !== undefined && accountRows[0].userId !== args.userId
        ? accountRows[0].userId
        : null;
    if (accountRows[0] === undefined)
      await ctx.db.insert('authAccounts', {
        userId: args.userId,
        provider: 'email-link',
        providerAccountId: args.email,
        emailVerified: args.email,
      });
    else
      await ctx.db.patch(accountRows[0]._id, {
        userId: args.userId,
        emailVerified: args.email,
      });

    await upsertVerifiedEmail(ctx, {
      userId: args.userId,
      email: args.email,
      source: 'LINK',
      now,
    });
    const user = await ctx.db.get('users', args.userId);
    if (user?.email === undefined) {
      await ctx.db.patch(args.userId, {
        email: args.email,
        emailVerificationTime: now,
      });
      const emailRows = await ctx.db
        .query('userEmails')
        .withIndex('by_userId_deletedAt', (query) =>
          query.eq('userId', args.userId).eq('deletedAt', undefined),
        )
        .take(USER_EMAIL_LIMIT + 1);
      for (const emailRow of emailRows)
        await ctx.db.patch(emailRow._id, {
          isPrimary: emailRow.emailNormalized === args.email,
          updatedAt: now,
        });
      await ctx.db.patch(profile._id, {
        emailNormalized: args.email,
        updatedAt: now,
      });
    }
    const legacyClaimStarted = await maybeStartLegacyClaim(
      ctx,
      args.userId,
      args.email,
      now,
    );
    return {legacyClaimStarted, invalidatedUserId};
  },
});

export const refreshProviderFields = internalMutation({
  args: {
    userId: v.id('users'),
    provider: socialProviderValidator,
    email: v.optional(v.string()),
    emailVerified: v.boolean(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    nickname: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireStoredProfileOf(ctx, args.userId);
    const now = Date.now();
    if (args.emailVerified && args.email !== undefined) {
      const source =
        args.provider === 'google'
          ? 'GOOGLE'
          : args.provider === 'apple'
            ? 'APPLE'
            : args.provider === 'kakao'
              ? 'KAKAO'
              : undefined;
      if (source !== undefined) {
        await upsertVerifiedEmail(ctx, {
          userId: args.userId,
          email: args.email,
          source,
          now,
        });
        await maybeStartLegacyClaim(ctx, args.userId, args.email, now);
      }
    }
    const displayName = args.name ?? args.nickname;
    await ctx.db.patch(profile._id, {
      ...(profile.displayName === '' && displayName !== undefined
        ? {displayName}
        : {}),
      ...(profile.avatarUrl === undefined && args.picture !== undefined
        ? {avatarUrl: args.picture}
        : {}),
      updatedAt: now,
    });
    return null;
  },
});

export const exchangeAppleCode = internalAction({
  args: {
    userId: v.id('users'),
    clientId: v.string(),
    authorizationCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = appleClientSecretConfig();
    if (config === null) return null;
    try {
      const refreshToken = await exchangeAppleAuthorizationCode(
        config,
        args.clientId,
        args.authorizationCode,
        isAppleServiceId(args.clientId) ? appleWebRedirectUri() : undefined,
      );
      if (refreshToken !== undefined)
        await ctx.runMutation(internal.user.actions.saveAppleRefreshToken, {
          userId: args.userId,
          clientId: args.clientId,
          refreshToken,
        });
    } catch (error: unknown) {
      console.error('Apple authorization-code exchange failed', error);
    }
    return null;
  },
});

export const scheduleAppleCodeExchange = internalMutation({
  args: {
    userId: v.id('users'),
    clientId: v.string(),
    authorizationCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireStoredProfileOf(ctx, args.userId);
    if (appleClientSecretConfig() !== null)
      await ctx.scheduler.runAfter(
        0,
        internal.user.actions.exchangeAppleCode,
        args,
      );
    return null;
  },
});

export const saveAppleRefreshToken = internalMutation({
  args: {
    userId: v.id('users'),
    clientId: v.string(),
    refreshToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireStoredProfileOf(ctx, args.userId);
    const existing = await ctx.db
      .query('appleRefreshTokens')
      .withIndex('by_userId_clientId', (query) =>
        query.eq('userId', args.userId).eq('clientId', args.clientId),
      )
      .unique();
    const updatedAt = Date.now();
    if (existing === null)
      await ctx.db.insert('appleRefreshTokens', {...args, updatedAt});
    else
      await ctx.db.patch(existing._id, {
        refreshToken: args.refreshToken,
        updatedAt,
      });
    return null;
  },
});

export const listAppleRefreshTokens = internalQuery({
  args: {userId: v.id('users')},
  returns: v.array(
    v.object({
      _id: v.id('appleRefreshTokens'),
      clientId: v.string(),
      refreshToken: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('appleRefreshTokens')
      .withIndex('by_userId_clientId', (query) =>
        query.eq('userId', args.userId),
      )
      .take(APPLE_TOKEN_SCAN_LIMIT + 1);
    return rows.slice(0, APPLE_TOKEN_SCAN_LIMIT).map((row) => ({
      _id: row._id,
      clientId: row.clientId,
      refreshToken: row.refreshToken,
    }));
  },
});

export const dropAppleRefreshTokens = internalMutation({
  args: {ids: v.array(v.id('appleRefreshTokens'))},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    for (const id of args.ids.slice(0, APPLE_TOKEN_SCAN_LIMIT))
      await ctx.db.delete(id);
    return null;
  },
});

export const revokeAppleTokens = internalAction({
  args: {userId: v.id('users')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = appleClientSecretConfig();
    if (config === null) return null;
    const tokens = await ctx.runQuery(
      internal.user.actions.listAppleRefreshTokens,
      {userId: args.userId},
    );
    const removed: Id<'appleRefreshTokens'>[] = [];
    for (const token of tokens) {
      try {
        await revokeAppleRefreshToken(
          config,
          token.clientId,
          token.refreshToken,
        );
        removed.push(token._id);
      } catch (error: unknown) {
        console.error('Apple refresh-token revocation failed', error);
      }
    }
    if (removed.length > 0)
      await ctx.runMutation(internal.user.actions.dropAppleRefreshTokens, {
        ids: removed,
      });
    return null;
  },
});
