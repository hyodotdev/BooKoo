import {ConvexCredentials} from '@convex-dev/auth/providers/ConvexCredentials';
import {
  convexAuth,
  createAccount,
  retrieveAccount,
} from '@convex-dev/auth/server';
import type {GenericId} from 'convex/values';

import {shouldAutoLinkViaEmail} from '../shared/authPolicy';
import {normalizeEmail} from '../shared/email';
import {internal} from './_generated/api';
import type {DataModel, Doc, Id} from './_generated/dataModel';
import type {MutationCtx} from './_generated/server';
import {appError} from './lib/errors';
import {verifySocialCredentials, type SocialCredentials} from './lib/idToken';
import type {SocialProvider} from './lib/constants';
import {newUserProfileDefaults} from './lib/userProfiles';
import {upsertVerifiedEmail} from './lib/userEmails';
import {maybeStartLegacyClaim} from './legacy/internal';
import {
  BooKooOtpDe,
  BooKooOtpEn,
  BooKooOtpEs,
  BooKooOtpFr,
  BooKooOtpId,
  BooKooOtpIt,
  BooKooOtpJa,
  BooKooOtpKo,
  BooKooOtpNl,
  BooKooOtpPt,
  BooKooOtpVi,
  BooKooOtpZh,
} from './otp/ResendOTP';

type AuthorizeCtx = Parameters<
  Parameters<typeof ConvexCredentials>[0]['authorize']
>[1];

function typedDb(ctx: {db: unknown}): MutationCtx['db'] {
  return ctx.db as MutationCtx['db'];
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function uniqueVerifiedUserByEmail(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<'users'> | null> {
  const rows = await ctx.db
    .query('users')
    .withIndex('email', (query) => query.eq('email', email))
    .take(3);
  const verified = rows.filter(
    (row) => row.emailVerificationTime !== undefined,
  );
  return verified.length === 1 ? verified[0]! : null;
}

function emailSource(providerId: string): 'OTP' | 'GOOGLE' | 'APPLE' | 'KAKAO' {
  if (providerId === 'google') return 'GOOGLE';
  if (providerId === 'apple') return 'APPLE';
  if (providerId === 'kakao') return 'KAKAO';
  return 'OTP';
}

async function ensureProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique();
  if (existing !== null) return;
  const user = await ctx.db.get('users', userId);
  await ctx.db.insert(
    'userProfiles',
    newUserProfileDefaults(userId, user, now),
  );
}

/**
 * Convex Auth's default email request path writes an unverified address into
 * `users.email`. This custom resolver is intentionally stricter: request-only
 * users are anonymous rows until the code verifies.
 */
async function createOrUpdateUser(
  genericCtx: {db: unknown},
  args: {
    existingUserId: GenericId<'users'> | null;
    type: 'oauth' | 'credentials' | 'email' | 'phone' | 'verification';
    provider: {id: string};
    profile: Record<string, unknown> & {
      email?: string;
      emailVerified?: boolean;
    };
  },
): Promise<GenericId<'users'>> {
  const ctx = {...genericCtx, db: typedDb(genericCtx)} as MutationCtx;
  const email = normalizeEmail(args.profile.email);
  if (args.type === 'email') {
    const linked =
      args.existingUserId === null && email !== undefined
        ? await uniqueVerifiedUserByEmail(ctx, email)
        : null;
    if (args.existingUserId !== null) return args.existingUserId;
    if (linked !== null) return linked._id;
    return await ctx.db.insert('users', {});
  }

  const verifiedEmail = args.profile.emailVerified === true ? email : undefined;
  let userId = args.existingUserId as Id<'users'> | null;
  if (userId === null && verifiedEmail !== undefined) {
    const linked = await uniqueVerifiedUserByEmail(ctx, verifiedEmail);
    userId = linked?._id ?? null;
  }
  const currentUser =
    userId === null ? null : await ctx.db.get('users', userId);
  const shouldSetPrimaryEmail =
    verifiedEmail !== undefined &&
    (currentUser === null || currentUser.emailVerificationTime === undefined);
  const userPatch = {
    ...(asOptionalString(args.profile.name) === undefined
      ? {}
      : {name: asOptionalString(args.profile.name)}),
    ...(asOptionalString(args.profile.image) === undefined
      ? {}
      : {image: asOptionalString(args.profile.image)}),
    ...(shouldSetPrimaryEmail && verifiedEmail !== undefined
      ? {email: verifiedEmail, emailVerificationTime: Date.now()}
      : {}),
  };
  if (userId === null) userId = await ctx.db.insert('users', userPatch);
  else await ctx.db.patch(userId, userPatch);

  const now = Date.now();
  await ensureProfile(ctx, userId, now);
  if (verifiedEmail !== undefined)
    await upsertVerifiedEmail(ctx, {
      userId,
      email: verifiedEmail,
      source: emailSource(args.provider.id),
      now,
    });
  if (verifiedEmail !== undefined)
    await maybeStartLegacyClaim(ctx, userId, verifiedEmail, now);
  return userId;
}

async function authorizeWithIdentity(
  ctx: AuthorizeCtx,
  provider: SocialProvider,
  verified: Awaited<ReturnType<typeof verifySocialCredentials>>,
  fallbackName: string | undefined,
): Promise<{userId: GenericId<'users'>}> {
  const identity = verified.identity;
  const existing = await retrieveAccount<DataModel>(ctx, {
    provider,
    account: {id: identity.subject},
  }).catch(() => null);
  let userId: Id<'users'>;
  if (existing !== null) userId = existing.user._id as Id<'users'>;
  else {
    const verifiedEmail = shouldAutoLinkViaEmail(identity)
      ? normalizeEmail(identity.email)
      : undefined;
    const displayName =
      fallbackName ??
      identity.name ??
      identity.nickname ??
      verifiedEmail?.split('@')[0];
    const created = await createAccount<DataModel>(ctx, {
      provider,
      account: {id: identity.subject},
      profile: {
        ...(verifiedEmail === undefined
          ? {}
          : {email: verifiedEmail, emailVerified: true}),
        ...(displayName === undefined ? {} : {name: displayName}),
        ...(identity.picture === undefined ? {} : {image: identity.picture}),
      },
      shouldLinkViaEmail: verifiedEmail !== undefined,
    });
    userId = created.user._id as Id<'users'>;
  }
  await ctx.runMutation(internal.user.actions.refreshProviderFields, {
    userId,
    provider,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    picture: identity.picture,
    nickname: identity.nickname,
  });
  if (provider === 'apple' && verified.apple?.authorizationCode !== undefined)
    await ctx.runMutation(internal.user.actions.scheduleAppleCodeExchange, {
      userId,
      clientId: verified.apple.audience,
      authorizationCode: verified.apple.authorizationCode,
    });
  return {userId};
}

function credentialsProvider(provider: SocialProvider) {
  return ConvexCredentials<DataModel>({
    id: provider,
    authorize: async (credentials: SocialCredentials, ctx) => {
      const verified = await verifySocialCredentials(provider, credentials);
      return authorizeWithIdentity(
        ctx,
        provider,
        verified,
        verified.fallbackName,
      );
    },
  });
}

const Apple = credentialsProvider('apple');
const Google = credentialsProvider('google');
const Kakao = credentialsProvider('kakao');
const Naver = credentialsProvider('naver');

export const {auth, signIn, signOut, store, isAuthenticated} = convexAuth({
  providers: [
    Apple,
    Google,
    Kakao,
    Naver,
    BooKooOtpEn,
    BooKooOtpKo,
    BooKooOtpJa,
    BooKooOtpZh,
    BooKooOtpId,
    BooKooOtpDe,
    BooKooOtpEs,
    BooKooOtpFr,
    BooKooOtpIt,
    BooKooOtpNl,
    BooKooOtpPt,
    BooKooOtpVi,
  ],
  signIn: {maxFailedAttempsPerHour: 5},
  callbacks: {
    createOrUpdateUser,
    async beforeSessionCreation(genericCtx, {userId}): Promise<void> {
      const ctx = {...genericCtx, db: typedDb(genericCtx)} as MutationCtx;
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', (query) =>
          query.eq('userId', userId as Id<'users'>),
        )
        .unique();
      if (profile?.purgedAt !== undefined)
        throw appError('ACCOUNT_DELETED', 'error.auth.accountPurged');
      if (profile?.appRole === 'SUSPENDED')
        throw appError('ACCOUNT_SUSPENDED', 'error.account.suspended');
    },
  },
});
