import {sha256} from '@oslojs/crypto/sha2';
import {encodeHexLowerCase} from '@oslojs/encoding';
import type {GenericActionCtxWithAuthConfig} from '@convex-dev/auth/server';
import {v} from 'convex/values';

import {internal} from '../_generated/api';
import type {DataModel} from '../_generated/dataModel';
import {internalMutation} from '../lib/functions';
import {
  FIXED_OTP_COLLISION_LIMIT,
  selectFixedOtpCode,
  selectFixedOtpCollisionIds,
} from './fixedOtpPolicy';

function hashCode(code: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(code)));
}

export const applyFixedOtp = internalMutation({
  args: {
    email: v.string(),
    providerId: v.string(),
    generatedCodeHash: v.string(),
    fixedCodeHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (query) =>
        query
          .eq('provider', args.providerId)
          .eq('providerAccountId', args.email),
      )
      .unique();
    if (account === null) return false;
    const row = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (query) => query.eq('accountId', account._id))
      .unique();
    if (
      row === null ||
      row.provider !== args.providerId ||
      row.code !== args.generatedCodeHash
    )
      return false;

    // @convex-dev/auth verifies by a globally unique code-hash index. Reusing
    // one fixed code for multiple emails would otherwise make every lookup
    // throw. This exact-hash read is capped before any delete: the mutation
    // establishes and then maintains the invariant that at most one such row
    // exists without accepting an unbounded repair workload.
    const collisions = await ctx.db
      .query('authVerificationCodes')
      .withIndex('code', (query) => query.eq('code', args.fixedCodeHash))
      .take(FIXED_OTP_COLLISION_LIMIT + 1);
    if (collisions.length > FIXED_OTP_COLLISION_LIMIT)
      throw new Error('Fixed OTP collision limit exceeded');
    for (const collisionId of selectFixedOtpCollisionIds(collisions, row._id))
      await ctx.db.delete(collisionId);
    await ctx.db.patch(row._id, {code: args.fixedCodeHash});
    return true;
  },
});

export async function tryApplyFixedOtp(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  email: string,
  generatedCode: string,
  providerId: string,
): Promise<boolean> {
  const fixedCode = selectFixedOtpCode(email, {
    appReviewCode: process.env.APP_REVIEW_FIXED_OTP_CODE,
    appReviewEmails: process.env.APP_REVIEW_FIXED_OTP_EMAILS,
    environment: process.env.ENVIRONMENT,
  });
  if (fixedCode === undefined) return false;
  try {
    return await ctx.runMutation(internal.otp.fixedOtp.applyFixedOtp, {
      email,
      providerId,
      generatedCodeHash: hashCode(generatedCode),
      fixedCodeHash: hashCode(fixedCode),
    });
  } catch (error: unknown) {
    console.error('Fixed OTP override failed; falling back to delivery', error);
    return false;
  }
}
