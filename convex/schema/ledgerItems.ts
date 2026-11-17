import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * money-categories-i18n.md §1.3. TRANSFER is in the union from the first commit so every rollup
 * delta and every serializer is exhaustive; the v1 MUTATION validator narrows to EXPENSE|INCOME, so
 * the public API surface stays small and no v1 row can hold it. There is no `switch (type)` with an
 * unreachable arm anywhere: the rollup delta is two ternaries that already exclude TRANSFER
 * correctly (`type === 'EXPENSE' ? sign * baseAmountMinor : 0`).
 */
export const ledgerItemTypeValidator = v.union(
  v.literal('EXPENSE'),
  v.literal('INCOME'),
  v.literal('TRANSFER'),
);
export type LedgerItemType = Infer<typeof ledgerItemTypeValidator>;

export const fxSourceValidator = v.union(
  v.literal('MANUAL'),
  v.literal('ECB'),
  v.literal('OPEN_EXCHANGE'),
  v.literal('LEGACY_ASSUMED'),
);

/** Which legacy field produced `occurredAt` (`02` §8: `selectedDate` silently vanished when edited). */
export const legacyDateSourceValidator = v.union(
  v.literal('SELECTED_DATE'),
  v.literal('CREATED'),
  v.literal('UPDATED'),
  v.literal('PUSH_ID'),
);

/**
 * The currency the legacy `amount` DISPLAY STRING was formatted in, parsed ONCE in the migration's
 * 05-normalize.ts and never again. This is the only surviving per-row evidence of what currency a
 * legacy row was actually entered in, because currency was a device-level AsyncStorage setting
 * stored nowhere in the database (`02` §6/§16) and a single shared ledger could hold rows formatted
 * three different ways. Without it, confirming a ledger as KRW silently multiplies a "$12.00" row by
 * ~1,300 AND the per-ledger sum check still passes, because both sides scale identically.
 */
export const legacyCurrencyEvidenceValidator = v.union(
  v.literal('KRW'),
  v.literal('JPY'),
  v.literal('USD'),
  v.literal('EUR'),
  v.literal('CNY'),
  v.literal('IDR'),
  v.literal('OTHER'),
  v.literal('UNKNOWN'),
);

/**
 * EVERY list index starts (ledgerId, deletedAt) so that (a) the tenant is pinned — a write to ledger
 * B never wakes a subscription on ledger A — and (b) the soft-delete discriminator is INSIDE the
 * index, so a page of 30 is 30 rows (P5).
 *
 * `.filter()` is BANNED on this table (`13` §11 rule 1). Post-index JS narrowing may only run over
 * an already-bounded page, and any such query MUST carry `maximumRowsRead` (§7.7).
 */
export const ledgerItemsTable = defineTable({
  ledgerId: v.id('ledgers'),

  // ---- money (money-categories-i18n.md §1.1/§1.3/§1.6) ----
  type: ledgerItemTypeValidator,
  /**
   * INTEGER minor units of `currency`. Direction is `type`, NEVER the sign.
   * The sign is free for its real meaning: a NEGATIVE amountMinor on an EXPENSE is a refund and on
   * an INCOME is a clawback, entered through a dedicated toggle, never by typing a minus. Zero is
   * rejected. This is the deliberate departure from proposals A/B/C ("non-negative magnitude"): a
   * EUR 20 refund on a EUR 50 grocery expense must reduce the groceries bucket to EUR 30, not
   * appear as income.
   */
  amountMinor: v.number(),
  currency: v.string(), // ISO-4217, as entered
  /** Snapshot of ledgers.baseCurrency AT WRITE TIME. Makes an item and a rollup row checkable
   *  against each other without reading the ledger, and makes a half-finished currency migration
   *  distinguishable from a consistent one. */
  baseCurrency: v.string(),
  /** Minor units of baseCurrency, rounded ONCE at write time. THE ONLY THING ROLLUPS SUM.
   *  Stored unconditionally (== amountMinor when currency === baseCurrency) so the invariant
   *  "baseAmountMinor is the number you sum" needs no branch in the trigger, the repair cron, the
   *  export or the chart. */
  baseAmountMinor: v.number(),
  /** rate * 1_000_000, base major per 1 quote major. INTEGER — a float round-trips through JSON and
   *  drifts. Absent iff currency === baseCurrency. */
  fxRateMicros: v.optional(v.number()),
  fxAt: v.optional(v.number()), // epoch ms of the RATE QUOTE, not of the write
  fxSource: v.optional(fxSourceValidator),

  // ---- time (§7.2) ----
  /** epoch ms UTC — the instant the user picked. The authority. Timezone-free. */
  occurredAt: v.number(),
  /** DERIVED SERVER-SIDE from occurredAt in ledgers.timeZone. 20260824. */
  dayKey: v.number(),
  /** DERIVED SERVER-SIDE. 202608. */
  monthKey: v.number(),
  /** The UTC offset in minutes in effect IN THE LEDGER'S TZ at occurredAt. Lets a 30-row page render
   *  the original wall clock with no IANA round-trip per row, and it is the only field that keeps a
   *  NON_KST_OFFSET audit answerable after the fact. */
  occurredOffsetMinutes: v.number(),

  // ---- classification ----
  /** The ledgerCategories `key` slug — a STRING, not an Id (§1.4). A valid item must exist in a
   *  ledger with zero category rows, and archiving+recreating a category must not orphan history.
   *  'uncategorized' is the terminal fallback and is never offered in the picker. */
  categoryKey: v.string(),

  // ---- authorship ----
  /**
   * The ORIGINAL author — legacy `writer`, set once and preserved across edits by other members
   * (`02` §3). REQUIRED, not optional: migration pass P0.5 mints a placeholder `users` row for every
   * uid seen anywhere in the dump, so this is always resolvable, and a placeholder renders as
   * "탈퇴한 사용자" through the serializer. That is the same UX as an optional field with none of the
   * `?? ` handling at 40 call sites.
   */
  authorId: v.id('users'),
  /**
   * Who actually PAID. undefined === authorId. v1 has no payer picker, but "who paid" is a
   * write-time fact: adding this field after a picker ships leaves a window of rows where
   * backfilling `authorId` is a GUESS. undefined-means-author is a TRUE statement about every v1
   * row. One optional field removes the window entirely. Anchor for the split/settle seam (§10).
   */
  paidByUserId: v.optional(v.id('users')),

  // ---- content ----
  memo: v.string(), // '' rather than optional: the search index needs a field
  /**
   * Legacy `location` was an unstructured Expo SDK-36 reverseGeocode blob plus injected lat/lng, of
   * which ONLY `street` was ever read (`02` §7.2). Normalised to five fields and kept INLINE, not a
   * table: it is immutable with the item and read only on the detail screen, so a join would buy
   * nothing and cost a document. The raw blob goes to legacyRaw.
   */
  place: v.optional(
    v.object({
      label: v.string(), // legacy `street`, or t('common.unknown'). Never empty.
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    }),
  ),

  // ---- denormalized so a list page needs ZERO joins and ZERO ctx.storage.getUrl() calls ----
  photoCount: v.number(),
  /** Safe routing id only. The client builds the authenticated D4 media endpoint; it receives no
   *  storage id or bearer storage URL. */
  coverPhotoId: v.optional(v.id('itemPhotos')),
  commentCount: v.number(),

  /** Last member to patch any field. undefined means never edited after creation. */
  updatedByUserId: v.optional(v.id('users')),

  // ---- durable client-create idempotency (offline-and-caching.md) ----
  /** Required on every new-app create; absent only on migrated rows. A UUID, never a document id. */
  clientRequestId: v.optional(v.string()),
  /** Server-computed SHA-256 over canonical versioned create args, excluding auth identity/request id. */
  clientRequestHash: v.optional(v.string()),

  // ---- migration ----
  legacyLedgerKey: v.optional(v.string()),
  legacyWriterUid: v.optional(v.string()),
  /** The signed number, verbatim. A REAL COLUMN, not buried in legacyRaw, because `14` §7.2's
   *  mandatory per-ledger financial invariant is a Convex query over it. */
  legacyRealAmount: v.optional(v.number()),
  /** "-₩12,000". STORED, NEVER PARSED at runtime — it embeds the writer's device locale and
   *  currency, which is not knowable server-side. Parsed exactly once, offline, to derive
   *  legacyCurrencyEvidence. */
  legacyAmountString: v.optional(v.string()),
  legacyCurrencyEvidence: v.optional(legacyCurrencyEvidenceValidator),
  legacyCategoryIconId: v.optional(v.number()),
  legacyCategoryTxt: v.optional(v.string()),
  legacyCategoryKind: v.optional(v.number()), // category.category, 0|1, absent on old rows
  legacySelectedDate: v.optional(v.string()), // the raw ISO string, or absent when it was lost
  legacyDateSource: v.optional(legacyDateSourceValidator),
  legacyUpdatedAt: v.optional(v.number()),
  /** sha256 of the canonicalized source node (`14` §7.2). Verification joins on this. */
  legacyChecksum: v.optional(v.string()),
  /** The importer could not resolve the date / category / currency and a human should look.
   *  Drives the in-app "확인 필요" chip; the queryable version is `migrationAnomalies`. */
  needsReview: v.optional(v.boolean()),

  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${itemKey}` — GLOBALLY unique
})
  // (1) THE WORKHORSE. `dayKey` is MONOTONE in `occurredAt` for a fixed ledger timezone, so ordering
  //     by (dayKey, occurredAt) IS ordering by occurredAt, and this ONE index serves:
  //       calendar day tap   .eq(dayKey, 20260824)                      -> paginate 30 desc
  //       month timeline     .gte(dayKey, 20260801).lte(dayKey, 20260831)
  //       salary cycle       .gte(dayKey, 20260725).lte(dayKey, 20260824)
  //       whole ledger       no key range, .order('desc')
  //     No query anywhere performs timezone arithmetic, and no list query needs to read `ledgers`.
  .index('by_ledgerId_deletedAt_dayKey_occurredAt', [
    'ledgerId',
    'deletedAt',
    'dayKey',
    'occurredAt',
  ])
  // (2) Category drill-down from the donut and the 12-month trend; also the O(1) "does this category
  //     have any entries" probe that gates archive-vs-reassign.
  .index('by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt', [
    'ledgerId',
    'deletedAt',
    'categoryKey',
    'dayKey',
    'occurredAt',
  ])
  // (3) Per-member spending ("what did 아빠 spend this month"), AND the claim re-parenting cursor:
  //     .eq(ledgerId).eq(deletedAt, undefined).eq(authorId, placeholderUserId), 200/batch. Tenant-
  //     scoped, so no cross-tenant index is needed for the migration claim.
  .index('by_ledgerId_deletedAt_authorId_dayKey_occurredAt', [
    'ledgerId',
    'deletedAt',
    'authorId',
    'dayKey',
    'occurredAt',
  ])
  // (4) Expense-only / income-only timeline (the legacy CONSUME/INCOME segmented control), with no
  //     JS post-filter and therefore no short pages.
  .index('by_ledgerId_deletedAt_type_dayKey_occurredAt', [
    'ledgerId',
    'deletedAt',
    'type',
    'dayKey',
    'occurredAt',
  ])
  // (5) Exact-amount search. Full-text filter fields cannot answer an amount-only query because a
  //     Convex search expression must always contain text. `items.searchAmount` reads one stream
  //     when `type` is selected or merges the EXPENSE and INCOME streams when it is not.
  .index('by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt', [
    'ledgerId',
    'deletedAt',
    'type',
    'amountMinor',
    'dayKey',
    'occurredAt',
  ])
  // (6) INSERTION order. The unseen-activity probe (`.order('desc').first()`) and "N new since I
  //     last looked". An explicit createdAt, never _creationTime (§1.3).
  .index('by_ledgerId_deletedAt_createdAt', [
    'ledgerId',
    'deletedAt',
    'createdAt',
  ])
  // (7) MAINTENANCE ONLY. Spans deleted rows ON PURPOSE: the rollup repair and the timezone rebucket
  //     must see soft-deleted rows so a later restore lands in the right bucket. Soft-deleted rows
  //     are skipped in JS while accumulating, over a page bounded by (ledger, month) — see §6.2.
  .index('by_ledgerId_monthKey', ['ledgerId', 'monthKey'])
  // (8) Migration idempotency: one `.unique()` probe per imported row.
  .index('by_legacyKey', ['legacyKey'])
  // (9) Durable online/offline create replay. Author scoping prevents another member from probing an id.
  .index('by_ledgerId_authorId_clientRequestId', [
    'ledgerId',
    'authorId',
    'clientRequestId',
  ])
  // Tab2 search. Replaces a whole-array `.includes()` on every keystroke with no debounce (`02` S6).
  // `amountMinor` remains a useful equality refinement when a memo term is also present. Amount-only
  // search uses index (5); a full-text search expression always requires text.
  // Only `memo` is indexed — NOT a `${memo} ${categoryLabel}` composite: a category rename or a
  // preset translation fix would silently desynchronise such a field from the rendered label across
  // a 1M-row table, and no proposal that shipped one specified a job to rewrite it.
  .searchIndex('search_memo', {
    searchField: 'memo',
    filterFields: [
      'ledgerId',
      'deletedAt',
      'type',
      'categoryKey',
      'amountMinor',
    ],
  });
