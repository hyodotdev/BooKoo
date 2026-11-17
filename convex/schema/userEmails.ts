import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

export const userEmailSourceValidator = v.union(
  v.literal('OTP'),
  v.literal('GOOGLE'),
  v.literal('APPLE'),
  v.literal('KAKAO'),
  v.literal('LINK'),
);
export type UserEmailSource = Infer<typeof userEmailSourceValidator>;

export const userEmailsTable = defineTable({
  userId: v.id('users'),
  emailNormalized: v.string(),
  /** Original verified spelling/casing for display and support; never used as a lookup key. */
  emailRaw: v.string(),
  verifiedAt: v.number(),
  source: userEmailSourceValidator,
  isPrimary: v.boolean(),

  ...timestamps,
  ...softDelete,
  ...legacyTrailer,
})
  // Global live-address exclusivity. Verification and reassignment check this range in one mutation.
  .index('by_emailNormalized_deletedAt', ['emailNormalized', 'deletedAt'])
  // Settings, legacy claim, account purge. Bounded by USER_EMAIL_LIMIT = 10.
  .index('by_userId_deletedAt', ['userId', 'deletedAt'])
  .index('by_legacyKey', ['legacyKey']);
