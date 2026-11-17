import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const claimStateValidator = v.union(
  v.literal('unclaimed'),
  v.literal('claiming'),
  v.literal('claimed'),
  v.literal('ambiguous'),
  v.literal('orphan_no_email'),
);

/**
 * `14` §3.4 verbatim, plus the two reconciliation arrays this design needs. Legacy identities land
 * HERE; the migration writes NOTHING into Convex Auth's `authAccounts`, so a placeholder can never
 * be signed into.
 *
 * PASS P0.5 (§8.2) unions EVERY uid appearing anywhere in the dump —
 * `ledgers/{ledgerKey}/owner`, `ledgers/{ledgerKey}/members/{uid}`,
 * `ledgers/{ledgerKey}/requests/{uid}`, `items/{itemKey}/writer`,
 * `reviews/{reviewKey}/writer`, and `opinions/{opinionKey}/user.uid` — into this table BEFORE P1,
 * plus one synthetic row `legacyUid: '__unknown__'`
 * for rows whose writer was absent entirely. That is what makes every downstream required FK
 * resolvable and is why no legacy row is ever dropped for a missing reference.
 */
export const legacyUsersTable = defineTable({
  legacyUid: v.string(),
  emailNormalized: v.optional(v.string()),
  emailRaw: v.optional(v.string()),
  emailVerifiedAt: v.optional(v.number()),
  displayName: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  statusMsg: v.optional(v.string()),
  tel: v.optional(v.string()),
  providers: v.array(v.string()), // ["password","google.com","facebook.com"]
  legacyCreatedAt: v.number(),
  legacyLastSignInAt: v.optional(v.number()),
  legacyDisabled: v.boolean(),
  /** True when this uid was NOT in the Auth export and was synthesized by P0.5. */
  synthesizedFromReference: v.boolean(),

  /** Verbatim `users/{uid}/ledgers` keys. Reconciliation input ONLY; `ledgers/{k}/members` is
   *  authoritative, because the mirror holds dangling keys after a legacy deleteLedger (`02` §9). */
  legacyLedgerKeys: v.array(v.string()),
  /** Ledger keys where this uid authored at least one item or review. Bounds the claim re-parenting
   *  sweep to a handful of tenant-scoped index ranges, so no cross-tenant author index is needed. */
  authoredLedgerKeys: v.array(v.string()),

  claimState: claimStateValidator,
  claimedByUserId: v.optional(v.id('users')),
  claimedAt: v.optional(v.number()),
  /** The unsignable stand-in that owns this identity's rows until the human arrives. */
  placeholderUserId: v.optional(v.id('users')),
  /** Cursor for the batched re-parent, so a claim survives an app kill mid-flow. */
  reparentCursor: v.optional(v.string()),
  reparentTable: v.optional(v.string()),
  /** Support-path breadcrumb for forceClaim. */
  claimTicketRef: v.optional(v.string()),
})
  .index('by_legacyUid', ['legacyUid'])
  // THE CLAIM, inside afterUserCreatedOrUpdated: claimState IN the index, so the probe reads only
  // unclaimed rows for one address. >1 row => mark ALL ambiguous, never guess (`14` §3.4).
  .index('by_emailNormalized_claimState', ['emailNormalized', 'claimState'])
  // Ops dashboard: how many are still unclaimed / ambiguous / orphan_no_email. Drives the
  // "can we decommission Firebase" decision.
  .index('by_claimState', ['claimState'])
  // Reverse lookup during re-parenting.
  .index('by_placeholderUserId', ['placeholderUserId']);

/** Byte-faithful archive of EVERY child of `bookoo/invites`, whatever we decided to do with it. */
export const legacyInvitesTable = defineTable({
  direction: v.union(
    v.literal('A_BY_LEDGER'),
    v.literal('B_BY_EMAIL'),
    v.literal('UNCLASSIFIED'),
  ),
  rawParentKey: v.string(),
  rawChildKey: v.string(),
  rawValue: v.string(),
  legacyLedgerKey: v.optional(v.string()),
  /** OPTIONAL: a child matching neither the push-id regex nor `%40` has no decodable address, and
   *  it must still have an archive home. */
  emailNormalized: v.optional(v.string()),
  reconciledAs: v.union(
    v.literal('CONVERTED'), // a ledgerInvites row was created
    v.literal('ALREADY_MEMBER'), // orphan from the legacy Promise.all bugs (`02` §4)
    v.literal('LEDGER_MISSING'),
    v.literal('UNCLASSIFIABLE'),
  ),
  inviteId: v.optional(v.id('ledgerInvites')),
  importedAt: v.number(),
})
  // "which ledgers was this address waiting on" — surfaced at claim time.
  .index('by_emailNormalized', ['emailNormalized'])
  .index('by_legacyLedgerKey', ['legacyLedgerKey'])
  // Verification report: count(ALREADY_MEMBER) etc.
  .index('by_reconciledAs', ['reconciledAs']);

/** One row per batch-mutation call. The import's own ledger, and rollback layer 3 (`14` §7.4). */
export const migrationRunsTable = defineTable({
  runId: v.string(), // "items-2026-08-24T09:00Z"
  table: v.string(),
  batchIndex: v.number(),
  inserted: v.number(),
  skipped: v.number(),
  failed: v.number(),
  at: v.number(),
})
  // Driver checkpointing / resume, and `migrate.rollback.deleteRun({secret, runId})`.
  .index('by_runId_table_batchIndex', ['runId', 'table', 'batchIndex']);

export const anomalyKindValidator = v.union(
  // date
  v.literal('SELECTED_DATE_LOST'),
  v.literal('NON_KST_OFFSET'),
  // money
  v.literal('ZERO_AMOUNT'),
  v.literal('AMOUNT_SIGN_CATEGORY_MISMATCH'),
  v.literal('LOSSY_AMOUNT_CONVERSION'),
  v.literal('CURRENCY_EVIDENCE_MISMATCH'),
  // category
  v.literal('CATEGORY_ICON_OUT_OF_RANGE'),
  v.literal('CATEGORY_UNRECOVERABLE'),
  v.literal('CATEGORY_KIND_CONFLICT'),
  // identity / membership
  v.literal('DANGLING_MEMBERSHIP_POINTER'),
  v.literal('MEMBER_UID_UNKNOWN'),
  v.literal('WRITER_UID_UNKNOWN'),
  v.literal('DUPLICATE_NORMALIZED_EMAIL'),
  v.literal('ORPHAN_SOLE_MEMBER_LEDGER'),
  // ledger
  v.literal('LEDGER_NOT_VISIBLE'),
  v.literal('ORPHAN_ITEM_NO_LEDGER'),
  v.literal('GHOST_ITEM_ONLY_REVIEWS'),
  // invites
  v.literal('INVITE_UNCLASSIFIABLE'),
  // photos
  v.literal('PHOTO_URL_UNPARSEABLE'),
  v.literal('PHOTO_OBJECT_MISSING'),
  // operational (written by the repair cron, not the import)
  v.literal('ROLLUP_DRIFT'),
);

/**
 * The table that turns "zero rows lost" from an assertion into a provable, auditable join — and that
 * makes rollup correctness after import MEASURABLE rather than asserted. Every one of the date,
 * money and category kinds above is a row that lands in the WRONG dayKey / monthKey / category
 * bucket, so the cutover gate is a query over `by_kind_resolvedAt`, not a spreadsheet.
 *
 * `producedRow: false` is the "this legacy node became nothing, and here is why" record. It is what
 * a support engineer needs in 2028 when a user asks where their 2019 entry went.
 */
export const migrationAnomaliesTable = defineTable({
  kind: anomalyKindValidator,
  /** RTDB path of the source node, e.g. `bookoo/ledgers/-L9x.../items/-M2a...`. */
  sourcePath: v.string(),
  /** The globally unique legacyKey the row would have had. '' when no row was attempted. */
  legacyKey: v.string(),
  table: v.string(),
  /** false => this legacy node produced NO Convex row. */
  producedRow: v.boolean(),
  detailJson: v.string(),
  /** Canonicalized source node, verbatim, for a forensic answer years later. */
  rawJson: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  resolvedNote: v.optional(v.string()),
  waivedByUserId: v.optional(v.id('users')),
  createdAt: v.number(),
})
  // THE cutover gate: `.eq(kind).eq(resolvedAt, undefined)` per kind.
  .index('by_kind_resolvedAt', ['kind', 'resolvedAt'])
  // "what happened to this exact source row".
  .index('by_legacyKey', ['legacyKey'])
  // "everything that produced no row", for the sign-off report.
  .index('by_producedRow_kind', ['producedRow', 'kind']);

export const maintenanceJobKindValidator = v.union(
  v.literal('ROLLUP_REBUILD'), // full recompute of one ledger's rollups from source
  v.literal('ROLLUP_REPAIR'), // the nightly dirty-set pass (deployment-wide, no ledgerId)
  v.literal('TIMEZONE_REBUCKET'), // ledger.timeZone changed -> re-derive dayKey/monthKey
  v.literal('CURRENCY_REBASE'), // migrated ledger.baseCurrency confirmed -> re-derive amounts
  v.literal('CATEGORY_REASSIGN'), // move every item from category A to category B
  v.literal('LEDGER_PURGE'), // hard-delete a soft-deleted ledger's contents + blobs
  v.literal('ACCOUNT_PURGE'),
  v.literal('UPLOAD_SWEEP'),
  v.literal('USER_EXPORT'),
  v.literal('LEDGER_EXPORT'),
  v.literal('LEGACY_CLAIM_REPARENT'),
  v.literal('LEGACY_IMPORT'),
);
export const maintenanceJobStateValidator = v.union(
  v.literal('QUEUED'),
  v.literal('RUNNING'),
  v.literal('DONE'),
  v.literal('FAILED'),
);

/**
 * ONE generic cursor holder for EVERY long-running batched job, replacing the four single-purpose
 * tables the proposals grew (`ledgerMaintenance`, `uploadMaintenance`, `photoMigrations`'
 * bookkeeping, `ledgers.timeZoneRebucketState`). One resume protocol, one "what is running" query.
 *
 * `jobKey` is DERIVED, never parsed: ordinary jobs use
 * `ledgerId ? `${kind}:${ledgerId}${suffix ?? ''}` : kind`; export jobs use
 * `${kind}:${dataExportId}` so successive requests cannot alias one cursor. It exists so `by_jobKey`
 * gives the self-rescheduling batch its own cursor in one point read.
 */
export const maintenanceJobsTable = defineTable({
  kind: maintenanceJobKindValidator,
  jobKey: v.string(),
  ledgerId: v.optional(v.id('ledgers')),
  state: maintenanceJobStateValidator,
  /** Job-specific stage name, e.g. 'items' | 'photos' | 'comments' | 'rollups'. */
  phase: v.string(),
  cursor: v.optional(v.string()),
  processed: v.number(),
  /** Job-specific typed-enough payload: {from, to} for CATEGORY_REASSIGN, {fromTz, toTz} for
   *  TIMEZONE_REBUCKET. Rendered in the ops UI; never parsed for control flow. */
  argsJson: v.optional(v.string()),
  startedAt: v.number(),
  updatedAt: v.number(),
  finishedAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  requestedByUserId: v.optional(v.id('users')),
})
  // Every self-rescheduling batch reads its own cursor: 1 document.
  .index('by_jobKey', ['jobKey'])
  // Ops: "what is currently running", and the stuck-job alarm.
  .index('by_state_updatedAt', ['state', 'updatedAt'])
  // "Is this ledger mid-maintenance", paired with ledgers.maintenanceLock.
  .index('by_ledgerId_kind', ['ledgerId', 'kind']);
