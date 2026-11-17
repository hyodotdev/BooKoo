import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, timestamps} from './common';

/**
 * App UI locales. Legacy shipped `ko en ja zh id`; `de es fr it nl pt` are
 * the European expansion; `vi` adds Vietnamese. Keep in lockstep with `shared/locales.ts`.
 */
export const localeValidator = v.union(
  v.literal('ko'),
  v.literal('en'),
  v.literal('ja'),
  v.literal('zh'),
  v.literal('id'),
  v.literal('de'),
  v.literal('es'),
  v.literal('fr'),
  v.literal('it'),
  v.literal('nl'),
  v.literal('pt'),
  v.literal('vi'),
);
export type AppLocale = Infer<typeof localeValidator>;

export const appearanceValidator = v.union(
  v.literal('SYSTEM'),
  v.literal('LIGHT'),
  v.literal('DARK'),
);

export const platformValidator = v.union(
  v.literal('ios'),
  v.literal('android'),
  v.literal('web'),
);

/** Global account role. Per-LEDGER authority is ledgerMembers.role; this is support tooling only. */
export const appRoleValidator = v.union(
  v.literal('USER'),
  v.literal('SUPPORT'),
  v.literal('ADMIN'),
  v.literal('SUSPENDED'),
);

/** auth-onboarding.md §9.1. `handle` is the only blocking step. */
export const onboardingStepValidator = v.union(
  v.literal('handle'),
  v.literal('profile'),
  v.literal('ledger'),
  v.literal('legacy'),
  v.literal('done'),
);

export const legacyClaimStateValidator = v.union(
  v.literal('none'),
  v.literal('pending'),
  v.literal('claimed'),
  v.literal('ambiguous'),
  v.literal('skipped'),
);

/** Blob-copy state machine, shared shape with itemPhotos.migrationState. */
export const blobMigrationStateValidator = v.union(
  v.literal('NATIVE'), // uploaded through the new app; nothing to copy
  v.literal('PENDING'), // legacy URL known, blob not copied yet — client renders the legacy URL
  v.literal('DONE'),
  v.literal('MISSING'), // the object is not in the bucket
  v.literal('FAILED'),
);

/**
 * The COLD half of a user. Read by the member-roster query of every ledger screen and by the root
 * session subscription, so nothing that changes more than a few times a month may live here.
 * `lastSeenAt` in particular lives in `userPresence`: a 5-minute heartbeat here would re-run the
 * roster query — and therefore re-render the member strip — for all 8 co-members every time any one
 * of them opened the app (`13` §4.3 rule 2).
 *
 * A PLACEHOLDER profile (`isPlaceholder: true`) is minted by migration pass P0.5 for EVERY legacy uid
 * seen anywhere in the dump. Its `users` row deliberately has no `authAccounts` row, so it can never
 * be signed into. That guarantee is what lets `ledgerItems.authorId` and `ledgerMembers.userId` be
 * REQUIRED rather than optional (§8.2).
 */
export const userProfilesTable = defineTable({
  userId: v.id('users'),

  /**
   * lowercase(trim(email)). Denormalized mirror of the primary live `userEmails` row. Never
   * gmail-dot-folded (`14` §3.4). `userEmails` is the authority for every address the account has
   * proved; this field exists so the primary merge/legacy-claim probe stays one indexed hop.
   * OPTIONAL: a Facebook-only legacy orphan, an Apple private-relay account before the relay address
   * is known, and a placeholder minted for a uid that appears only inside a `members` map all have
   * no email. Making it required would force `''` into the indexed merge key, where every such row
   * would collide.
   */
  emailNormalized: v.optional(v.string()),

  // ---- Instagram-style handle (auth-onboarding.md §10; `09` §12) ----
  /** Exactly what the member typed, for display casing. Absent between signup and onboarding. */
  handle: v.optional(v.string()),
  /** NFKC-folded, lowercased, ASCII `[a-z0-9._]`. Denormalized from userHandles so `/@hyo` is ONE
   *  indexed read with no join. Written in the same mutation as the userHandles row. */
  handleKey: v.optional(v.string()),
  handleUpdatedAt: v.optional(v.number()),

  /** Free Unicode, NOT unique. Korean/Japanese names welcome. '' allowed, as in legacy. */
  displayName: v.string(),
  /** Legacy `info.statusMsg`. Required with a '' default so no read path needs `?? ''`. */
  bio: v.string(),
  /** Legacy `info.tel`. PRIVATE — never included in the PublicMember projection (§7.6). */
  phone: v.string(),

  avatarStorageId: v.optional(v.id('_storage')),
  /** Denormalized `ctx.storage.getUrl()` result. NEVER call getUrl per row in a list query
   *  (`13` §6.3). Cleared by the same mutation that deletes the blob. */
  avatarUrl: v.optional(v.string()),
  avatarThumbUrl: v.optional(v.string()),

  locale: localeValidator,
  appearance: appearanceValidator,
  /** ISO-4217. Pre-fills the currency picker when this user creates a ledger. Never authoritative. */
  preferredCurrency: v.string(),
  /** IANA. Pre-fills a new ledger's timezone. Never authoritative for any bucket. */
  preferredTimeZone: v.string(),
  /** 0=Sunday..6=Saturday. Pre-fills a new ledger's weekStartsOn. */
  preferredWeekStartsOn: v.number(),

  // required booleans with insert-time defaults — no `?? true` on any read path (`09` §3)
  pushEnabled: v.boolean(),
  notifyLedgerActivity: v.boolean(),
  notifyComments: v.boolean(),
  notifyInvites: v.boolean(),
  /** Optional country analytics; missing means no consent, including old clients. */
  countryAnalyticsEnabled: v.optional(v.boolean()),
  /** All-or-none recipient-local quiet-hours range in preferredTimeZone; integer minutes 0..1439. */
  quietHoursStartMinute: v.optional(v.number()),
  quietHoursEndMinute: v.optional(v.number()),

  appRole: appRoleValidator,

  // ---- onboarding (auth-onboarding.md §9) ----
  onboardingStep: onboardingStepValidator,
  onboardingCompletedAt: v.optional(v.number()),

  // ---- account lifecycle (auth-onboarding.md §12.4) ----
  /** Soft delete. Session still allowed during grace; every app gate is keyed on this. */
  deletedAt: v.optional(v.number()),
  /** deletedAt + DELETION_GRACE_MS. The purge cron's index key. */
  purgeAfter: v.optional(v.number()),
  /** Set by the purge. From here on, sign-in is refused outright. */
  purgedAt: v.optional(v.number()),
  deletionReason: v.optional(v.string()),

  // ---- migration ----
  legacyUid: v.optional(v.string()), // Firebase Auth localId
  legacyClaimState: legacyClaimStateValidator,
  legacyClaimedAt: v.optional(v.number()),
  /** True while this row stands in for an unclaimed legacy identity (pass P0.5/P1). */
  isPlaceholder: v.boolean(),
  /** Legacy `info.photoURL`. Rendered until avatarStorageId lands: `avatarUrl ?? avatarLegacyUrl`. */
  avatarLegacyUrl: v.optional(v.string()),
  /** GCS object name, `users/{RAW_EMAIL}` (`02` §11.1) — keyed by email, NOT uid, and overwritten
   *  in place with no versioning, so its `?token=` dies on overwrite. */
  avatarLegacySourcePath: v.optional(v.string()),
  avatarMigrationState: blobMigrationStateValidator,
  avatarAttempts: v.number(),
  avatarLastError: v.optional(v.string()),
  ...timestamps,
  ...legacyTrailer,
})
  // requireProfile() — the first line of every authed function. One point read.
  .index('by_userId', ['userId'])
  // Account merge at sign-in + the legacy claim probe.
  .index('by_emailNormalized', ['emailNormalized'])
  // `/@hyo` deep link and mention resolution, one indexed read, no join.
  .index('by_handleKey', ['handleKey'])
  // Admin console user list; the "is there still another ADMIN" last-admin guard.
  .index('by_appRole', ['appRole'])
  // Migration pass 1/2 uid resolution and claim-on-first-sign-in.
  .index('by_legacyUid', ['legacyUid'])
  // Account-deletion purge cron: `.lte('purgeAfter', now).take(PURGE_BATCH)`.
  .index('by_purgeAfter', ['purgeAfter'])
  // Avatar blob-copy worker: `.eq('avatarMigrationState','PENDING').lt('avatarAttempts', 6)`.
  .index('by_avatarMigrationState_avatarAttempts', [
    'avatarMigrationState',
    'avatarAttempts',
  ])
  // Migration idempotency (legacyKey === legacyUid for this table).
  .index('by_legacyKey', ['legacyKey'])
  // Invite-a-member typeahead. isPlaceholder filters out unclaimed legacy stand-ins.
  .searchIndex('search_handle', {
    searchField: 'handle',
    filterFields: ['isPlaceholder', 'deletedAt'],
  });

/**
 * The HOT half of a user (`13` §4.3 rule 2). One row per user, written by the 5-minute-throttled
 * `touchLastSeen` heartbeat. NOTHING that renders another member's row reads this table.
 */
export const userPresenceTable = defineTable({
  userId: v.id('users'),
  lastSeenAt: v.number(),
  platform: platformValidator,
  appVersion: v.string(),
  buildNumber: v.number(),
  localeAtLastSeen: localeValidator,
  /** Latest consenting connection's edge-estimated country; never raw IP/GPS. */
  ipCountryCodeAtLastSeen: v.optional(v.string()),
})
  // The only read: my own presence, and the ops "who is active" query.
  .index('by_userId', ['userId']);
