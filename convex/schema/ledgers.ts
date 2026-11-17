import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * Legacy `info.color` was an int 0..5 indexing six hardcoded rgb() literals (`02` §2.2).
 * A named token instead, because dark mode needs TWO hex values per colour so a raw index cannot be
 * the source of truth, and because a literal union is typo-proof. The 0..5 -> token map is total, so
 * the migration is lossless and the number need not be stored. Legacy fallback was teal; keep it.
 */
export const ledgerColorValidator = v.union(
  v.literal('PINK'), // legacy 0  rgb(255,114,141)
  v.literal('ORANGE'), // legacy 1  rgb(246,166, 35)
  v.literal('YELLOW'), // legacy 2  rgb(238,209,  0)
  v.literal('TEAL'), // legacy 3  rgb( 29,211,168)  <- legacy fallback
  v.literal('BLUE'), // legacy 4  rgb(103,158,255)  <- legacy default
  v.literal('PURPLE'), // legacy 5  rgb(182,105,249)
);

/** sharing-invites.md §1.2. The ONE permission knob; everything else is fixed by role. */
export const itemWritePolicyValidator = v.union(
  v.literal('ANY_MEMBER'), // default for ledgers created in the new app
  v.literal('AUTHOR_ONLY'), // legacy-compatible; default for EVERY migrated ledger
);
/** sharing-invites.md §1.3. */
export const invitePolicyValidator = v.union(
  v.literal('ANY_MEMBER'),
  v.literal('MANAGERS_ONLY'),
);

/**
 * A write lock, not a progress indicator. While it is anything but 'NONE', `items.*` mutations
 * reject with LEDGER_MAINTENANCE. A 2-second lockout is better than a silently wrong `dayKey`:
 * proposals A and C both let writes proceed during a re-key and relied on a job-ordering argument.
 */
export const ledgerMaintenanceLockValidator = v.union(
  v.literal('NONE'),
  v.literal('TIMEZONE'), // dayKey/monthKey rebucket in flight
  v.literal('CURRENCY'), // baseAmountMinor re-derivation in flight
  v.literal('ROLLUP'), // full rollup recompute in flight
  v.literal('DELETING'), // hard-purge cascade in flight
);

/** How the migration decided this ledger's currency (money-categories-i18n.md §1.9). */
export const legacyCurrencySourceValidator = v.union(
  v.literal('AMOUNT_VOTE'), // parsed the `amount` display strings and took the majority
  v.literal('OWNER_LOCALE'),
  v.literal('DEFAULT'), // fell back to KRW
);

/**
 * COLD BY CONSTRUCTION. Read by the ledger switcher, by every ledger header and by every item
 * mutation (for timezone + baseCurrency + maintenanceLock + itemWritePolicy). A single hot field
 * here would invalidate all of them on every expense entry, and would make concurrent entries
 * OCC-conflict on the ledger document itself. There is therefore deliberately NO lastItemAt, NO
 * itemCount, NO lifetime total and NO lastActivityAt on this document — §4.3 shows how each of
 * those is answered without one.
 */
export const ledgersTable = defineTable({
  title: v.string(),
  description: v.string(),
  colorKey: ledgerColorValidator,
  /** A 2026 affordance the legacy colour dot alone cannot carry. Single grapheme, validated. */
  emoji: v.optional(v.string()),
  /**
   * Phosphor glyph from `shared/ledgerIcons.ts`. Independent of `colorKey`.
   * Migrated ledgers omit it; the client then uses the colour piggy asset.
   */
  iconKey: v.optional(v.string()),

  /**
   * Denormalized copy of the single `ledgerMembers` row with role === 'OWNER'. Both are written in
   * the same mutation and can never drift; a nightly invariant check re-verifies (§6).
   * It exists so the switcher renders the crown without joining memberships per ledger.
   */
  ownerId: v.id('users'),
  ownershipTransferredFromUserId: v.optional(v.id('users')),
  ownershipTransferredAt: v.optional(v.number()),

  // ---- money (money-categories-i18n.md §1.6) ----
  /** ISO-4217. THE base currency: every rollup row is denominated in it. */
  baseCurrency: v.string(),
  /** True while the value is the migration's guess. Drives a one-time owner prompt, and it is the
   *  ONLY gate under which `ledgers.confirmCurrency` may run (§7.3). */
  currencyIsAssumed: v.boolean(),
  legacyCurrencySource: v.optional(legacyCurrencySourceValidator),

  // ---- calendar (money-categories-i18n.md §4.3) ----
  /** IANA, e.g. 'Asia/Seoul'. THE authority: dayKey/monthKey are derived from it, server-side. */
  timeZone: v.string(),
  timeZoneIsAssumed: v.boolean(),
  /** 0=Sunday..6=Saturday. LEDGER-wide so the calendar grid matches for every member. Legacy
   *  hardcoded weekStart={0} while moment.startOf('week') was locale-global — two disagreeing
   *  sources of truth (`03`). */
  weekStartsOn: v.number(),
  /** 1..28. Salary-cycle budgeting (급여일 기준). monthKey stays CALENDAR-aligned; period totals are
   *  assembled from <=62 ledgerDayRollups rows. This is what stops a future budgeting feature from
   *  poisoning the month dimension and every index built on it. */
  periodStartDay: v.number(),

  // ---- sharing (sharing-invites.md §1.2/§1.3) ----
  itemWritePolicy: itemWritePolicyValidator,
  invitePolicy: invitePolicyValidator,
  /** Count of ledgerMembers rows with deletedAt === undefined, every role included. Maintained by
   *  the membership mutations + a nightly repair. NEVER counted with .collect() (`13` §5.5). */
  memberCount: v.number(),

  // ---- lifecycle ----
  /** User-facing archive: hidden from the switcher, read-only, restorable. Distinct from deletion. */
  archivedAt: v.optional(v.number()),
  /** deletedAt + LEDGER_PURGE_GRACE_MS. The purge cron's index key. */
  purgeAfter: v.optional(v.number()),
  maintenanceLock: ledgerMaintenanceLockValidator,
  /** Bumped whenever the rollup SHAPE changes. Turns "did the rebuild finish everywhere" into an
   *  indexed question instead of a spreadsheet one. */
  rollupVersion: v.number(),

  // ---- migration ----
  legacyOwnerUid: v.optional(v.string()),
  /** Set when the sole member is an unrecoverable FB-no-email orphan (`14` §3.5). */
  orphanedAt: v.optional(v.number()),
  ownershipRescuedFromLegacyUid: v.optional(v.string()),

  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = the RTDB push id, e.g. "-L9xQ2fT3kZ8aB1cDe"
})
  // Settings -> "ledgers I own"; the account-deletion guard ("you still own N ledgers").
  .index('by_ownerId_deletedAt', ['ownerId', 'deletedAt'])
  // Purge cron: `.lte('purgeAfter', now).take(CASCADE_BATCH)`.
  .index('by_purgeAfter', ['purgeAfter'])
  // Ops: which ledgers are mid-maintenance / stuck.
  .index('by_maintenanceLock', ['maintenanceLock'])
  // Rollup-shape backfill: "which ledgers have not been rebuilt under the current shape".
  .index('by_rollupVersion', ['rollupVersion'])
  // Migration idempotency + pass-2 resolution.
  .index('by_legacyKey', ['legacyKey']);
