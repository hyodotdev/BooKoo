import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import type {UserEmailSource} from '../schema/userEmails';
import {normalizeEmail} from '../../shared/email';
import {EMAIL_OTP_PROVIDER_IDS} from '../../shared/authPolicy';
import {appError} from './errors';

export async function upsertVerifiedEmail(
  ctx: MutationCtx,
  input: {
    readonly userId: Id<'users'>;
    readonly email: string;
    readonly source: UserEmailSource;
    readonly now: number;
  },
): Promise<void> {
  const email = normalizeEmail(input.email);
  if (email === undefined)
    throw appError('INVALID_INPUT', 'error.email.invalid');

  const liveRows = await ctx.db
    .query('userEmails')
    .withIndex('by_emailNormalized_deletedAt', (query) =>
      query.eq('emailNormalized', email).eq('deletedAt', undefined),
    )
    .take(3);
  if (liveRows.length > 1)
    throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');

  const current = liveRows[0];
  const reassigned = current !== undefined && current.userId !== input.userId;
  if (current !== undefined && current.userId !== input.userId) {
    const credentialProviders = [
      ...Object.values(EMAIL_OTP_PROVIDER_IDS),
      'email-link',
    ];
    for (const provider of credentialProviders) {
      const accounts = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (query) =>
          query.eq('provider', provider).eq('providerAccountId', email),
        )
        .take(3);
      if (
        accounts.length > 1 ||
        accounts.some(
          (account) =>
            account.userId !== current.userId &&
            account.userId !== input.userId,
        )
      )
        throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');
      for (const account of accounts)
        if (account.userId === current.userId)
          await ctx.db.patch(account._id, {userId: input.userId});
    }
    await ctx.db.patch(current._id, {
      deletedAt: input.now,
      deletedByUserId: input.userId,
      updatedAt: input.now,
    });
    const previousUser = await ctx.db.get('users', current.userId);
    if (previousUser?.email === email)
      await ctx.db.patch(current.userId, {
        email: undefined,
        emailVerificationTime: undefined,
      });
    const previousProfile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (query) => query.eq('userId', current.userId))
      .unique();
    if (previousProfile?.emailNormalized === email)
      await ctx.db.patch(previousProfile._id, {
        emailNormalized: undefined,
        updatedAt: input.now,
      });
    await ctx.db.insert('authAudit', {
      userId: current.userId,
      event: 'email_reassigned',
      detail: {email},
      createdAt: input.now,
    });
  }

  const own =
    current?.userId === input.userId
      ? current
      : (
          await ctx.db
            .query('userEmails')
            .withIndex('by_userId_deletedAt', (query) =>
              query.eq('userId', input.userId).eq('deletedAt', undefined),
            )
            .take(11)
        ).find((row) => row.emailNormalized === email);
  const user = await ctx.db.get('users', input.userId);
  const isPrimary = user?.email === email;
  if (own !== undefined) {
    await ctx.db.patch(own._id, {
      emailRaw: input.email.trim(),
      source: input.source,
      isPrimary,
      updatedAt: input.now,
    });
  } else {
    await ctx.db.insert('userEmails', {
      userId: input.userId,
      emailNormalized: email,
      emailRaw: input.email.trim(),
      verifiedAt: input.now,
      source: input.source,
      isPrimary,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  if (own === undefined || reassigned)
    await ctx.db.insert('authAudit', {
      userId: input.userId,
      event: 'email_verified',
      detail: {email, source: input.source},
      createdAt: input.now,
    });
}
