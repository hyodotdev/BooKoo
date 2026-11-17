import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {localeValidator, platformValidator} from './userProfiles';
import {legacyTrailer} from './common';

export const feedbackCategoryValidator = v.union(
  v.literal('BUG'),
  v.literal('FEATURE'),
  v.literal('QUESTION'),
  v.literal('OTHER'),
);
export const feedbackStatusValidator = v.union(
  v.literal('NEW'),
  v.literal('TRIAGED'),
  v.literal('ANSWERED'),
  v.literal('CLOSED'),
);

/**
 * Replaces legacy `bookoo/opinions` (`02` §10) — a write-only inbox the developer read in the
 * Firebase console. It MUST be migrated: nothing in the app ever read it, which is exactly why it is
 * the only record of what users complained about, and turning the Firebase project off destroys it.
 *
 * Every environment field is OPTIONAL, deliberately: a legacy opinion has no appVersion, no
 * buildNumber, no platform and no osVersion, and writing ''/0/'ios' sentinels into an archive whose
 * only value is fidelity is data poisoning. `category` is required and the importer writes 'OTHER',
 * which is an honest classification rather than a fabricated fact.
 */
export const feedbackTable = defineTable({
  /** Optional so a signed-out user can report "I cannot sign in", and so a legacy uid that no longer
   *  resolves does not block the archival import. */
  userId: v.optional(v.id('users')),
  category: feedbackCategoryValidator,
  body: v.string(), // legacy `opinion`
  contactEmail: v.optional(v.string()),

  locale: v.optional(localeValidator),
  appVersion: v.optional(v.string()),
  buildNumber: v.optional(v.number()),
  platform: v.optional(platformValidator),
  osVersion: v.optional(v.string()),
  deviceModel: v.optional(v.string()),

  status: feedbackStatusValidator,
  adminNote: v.optional(v.string()),
  triagedByUserId: v.optional(v.id('users')),
  triagedAt: v.optional(v.number()),
  createdAt: v.number(),

  legacyUid: v.optional(v.string()),
  /** The legacy nested `user{}` object verbatim — {uid, displayName, email, phoneNumber, photoURL}
   *  with nulls dropped. It is the ONLY identity attached to a legacy opinion; without it, a
   *  feedback row whose userId no longer resolves identifies nobody. */
  legacyUserJson: v.optional(v.string()),
  /** The literal 'YYYY-MM-DD'. `createdAt` is set to that date at 00:00 KST; keeping BOTH is the
   *  honest thing, because the source had no time and a fabricated midnight must be visibly a
   *  derivation rather than a fact. */
  legacyCreatedAtDate: v.optional(v.string()),
  ...legacyTrailer, // legacyKey = the opinions push id
})
  // Ops inbox: `.eq('NEW')`, desc, paginated 30.
  .index('by_status_createdAt', ['status', 'createdAt'])
  // Settings -> "my previous messages". NEW: the legacy screen was fire-and-forget with no receipt.
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  .index('by_legacyKey', ['legacyKey']);
