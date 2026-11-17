# BooKoo — FINAL Convex Schema (authoritative)

Status: **FROZEN, amended 2026-09-02.** The implementation phase builds from this document verbatim. The measured production
profile `research/15-REAL-DATA-PROFILE.md` is the only higher authority. Below it, this document wins over
every other design and research note; measured contradictions are called out inline.

The 2026-09-02 server-authority decision removes the encrypted query mirror,
recent-category persistence and client outbox. References below to durable
receipts and `clientRequestId` describe server-side idempotency for ambiguous
online retries only; they do not authorize client persistence or offline save.

Inputs consumed in full: `DECISIONS.md`; `design/schema-proposal-A-performance.md`,
`-B-fidelity.md`, `-C-product.md`; `design/auth-onboarding.md`; `design/sharing-invites.md`;
`design/money-categories-i18n.md`; `research/13-convex-scale.md` (binding), `research/09-…` (house
style), `research/02-…` (nothing may become unrepresentable), `research/03`, `research/04`,
`research/14`; `design/privacy-and-compliance.md`; `design/release-and-store.md`;
`design/offline-and-caching.md`; `design/observability.md`; `design/boot-and-providers.md`;
`design/moderation-and-safety.md`; `design/accessibility.md`;
`design/operations-and-quality.md`.

Target load used for every number in this document:

> **One account in 20 ledgers; the hottest ledger holds 100,000 items, 10 years of history
> (≈120 month buckets, ≈3,650 day buckets), 8 concurrent writing members, 120 categories,
> 5,000 photos. `ROLLUP_SHARD_COUNT = 1`.**

Convex `1.45.0`, `@convex-dev/auth 0.0.95`, `convex-helpers 0.1.123`,
`@convex-dev/rate-limiter 0.3.2`, `@convex-dev/workpool 0.4.10`.

---

## 1. Design principles and conventions

### 1.1 The seven axioms

| #      | Axiom                                                                                                                                                                                                                                                                                                                               | The legacy failure it kills                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | **No screen's document-read count is a function of ledger size.** Every number on screen is one rollup row, a calendar-bounded rollup range (≤126 mounted civil days / ≤120 months / ≤120 categories), or one 30-row page.                                                                                                          | `02` S1/S2/S5 — `getMyLedger` pulled the whole ledger; `getMyLedgers` did it per ledger on every app open.                                     |
| **P2** | **Read sets are split by write frequency, not by screen.** A query that reads a hot field may not also read a cold one. Hot fields live in their own table.                                                                                                                                                                         | `02` S3 — one `.on('value')` on the ledger-id list re-downloaded every ledger's item tree.                                                     |
| **P3** | **Lists never join.** A list query returns raw rows; identity/label sidecars (member roster, category catalog) are separate small cached subscriptions the client resolves by key.                                                                                                                                                  | `02` S8/S9/S10 — N+1 profile fetches per member and per review.                                                                                |
| **P4** | **Every derived number is a stored delta maintained inside the same ACID mutation as the write, and every one of them has a named owner and a named repair job (§6).** Never recomputed on read, never on the client.                                                                                                               | `02` S5/S15 — `Tab3.setChartData` walked all items on every render; zero precomputed totals existed.                                           |
| **P5** | **`deletedAt` is index field #2 of every list index**, immediately after the tenant key. Pages are therefore never short.                                                                                                                                                                                                           | `09` §3.1's documented "pages may come back short" compromise — avoidable, so avoided.                                                         |
| **P6** | **Calendar bucketing is a server-side function of the _ledger's_ IANA timezone.** Clients never author a bucket key.                                                                                                                                                                                                                | Legacy device-local `moment()`: two members in KST and PST disagree about which month a transaction is in, so no shared total is well-defined. |
| **P7** | **Every table that receives migrated data and lacks a natural unique key carries the applicable `legacyKey` / `legacyUid` / `legacyCreatedAt` fields on day one, plus `by_legacyKey`.** `ledgerMemberState` and `ledgerCategories` are the only exceptions: their natural unique keys are `(ledgerId,userId)` and `(ledgerId,key)`. | `DECISIONS.md` §4. Adding idempotency later means a full-table rewrite; duplicating a natural key adds fields without adding safety.           |

### 1.2 Naming

**Table names** — camelCase plural, one file per table under `convex/schema/<table>.ts`, except where
closely coupled tables are one schema unit: `userProfiles.ts`, `authSupport.ts`, `moderation.ts`,
`ledgerMembers.ts`, `ledgerInvites.ts`, `rollups.ts`, `notifications.ts`, `dataExports.ts`,
`appContent.ts`, and `migration.ts`. Domain prefix where the table is owned by a parent
(`ledgerMembers`, `ledgerItems`, `itemPhotos`, `itemComments`).

**Index names — the one grammar, no exceptions:**

```
indexName = 'by_' + fields.join('_')          // fields in exact tuple order, camelCase preserved
['ledgerId','deletedAt','dayKey','occurredAt'] -> 'by_ledgerId_deletedAt_dayKey_occurredAt'
```

This **deviates from `09` §3.1's `by_a_and_b` form**, deliberately: `_and_` renders BooKoo's five-field
item indexes at 66 characters against Convex's 64-character index-name limit (`13` §1.1 rule 4), and it is
not mechanically derivable from the tuple, so it cannot be lint-checked. The `_`-joined form is both.
`scripts/lint-schema.ts` (§7.6) enforces it. Longest name in this schema:
`by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt` — **51 chars**.

**Search indexes** are named `search_<field>`.

### 1.3 Timestamps — pick one, use it everywhere

**Every timestamp is `v.number()`, epoch milliseconds UTC. There is not one ISO string in this schema.**

- Every table that is ever ordered by creation carries an **explicit `createdAt: v.number()`**.
  `_creationTime` is **never** listed in an index and **never** used for ordering, anywhere, including
  append-only tables. Reason (`14` D7): only a JSONL/CSV/ZIP data import can set `_creationTime`, and every
  reference-carrying table (`ledgerItems`, `itemComments`, `itemPhotos`, `ledgerMembers`, `feedback`,
  `ledgerJoinRequests`, `ledgerInvites`, `ledgerMemberState`) must go through a batch mutation, which cannot.
  A 2019 comment thread must not render in import order.
  _This is the single rule that proposal C violated on `itemComments` and it is non-negotiable here._
- The only date-shaped non-timestamps are `dayKey` (`20260824`) and `monthKey` (`202608`), both
  `v.number()`, both defined in §7.2.
- `updatedAt: v.number()` is required on every manifest-classified `standardMutable` row and is written
  on every patch. Append-only, named-event-lifecycle, and derived/cursor tables follow the explicit
  lifecycle policy in §7.8 instead of inventing meaningless timestamps.

### 1.4 Identity and foreign keys

- **One canonical identity: `v.id('users')`** (the Convex Auth table). Every foreign key in the app points
  at `users`. `userProfiles` is a satellite reached through `by_userId`. Martie's
  `purchases.userId: v.id('userProfiles')` split is the footgun being avoided (`06` D13).
- Foreign keys are always `v.id('<table>')`, never a raw string — with **one deliberate exception**:
  `ledgerItems.categoryKey: v.string()` (§7.4 and §2.10 of the category model). It is a slug, not a row id,
  because a valid item must exist in a ledger that has **zero** category rows.
- Polymorphic references are a **discriminated union of objects**, never `(kind, fourOptionalIds)`
  — see `contentReports.subject`.

### 1.5 Optional vs required

- **Optional means genuinely absent.** Behaviour flags, counters and enums are **required with a default
  written at insert**, so no read path ever needs `?? 0` / `?? true`.
- **A field is optional only when the domain admits absence**: `deletedAt`, `archivedAt`, `handle` between
  signup and onboarding, `expiresAt` on a migrated never-expiring invite, every `legacy*` field on rows a
  new user creates.
- `v.any()` is **banned**. Where a payload is genuinely open it is a `v.string()` holding JSON, named
  `*Json` or `legacyRaw`, and documented as **rendered, never parsed for control flow**.
- No `any` in TypeScript, anywhere. Types come from `Doc<'x'>['field']` or `Infer<typeof validator>`,
  never hand-written.

### 1.6 Shared field spreads (so a field can never be forgotten)

```ts
// convex/schema/common.ts
import {v} from 'convex/values';

/** Every standard mutable row. `createdAt` is explicit because _creationTime is unsettable by import. */
export const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
} as const;

/** The eight manifest-listed user-visible soft-delete tables. `deletedAt` is field #2 of list indexes. */
export const softDelete = {
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),
} as const;

/** Migrated rows without a documented natural unique key. Paired invariant: `by_legacyKey`. */
export const legacyTrailer = {
  /** Globally unique legacy path — never a bare RTDB push id (`14` §6.1). Migration idempotency key. */
  legacyKey: v.optional(v.string()),
  /** epoch ms, from item.created / review.date / the push-id timestamp. */
  legacyCreatedAt: v.optional(v.number()),
  /** JSON string of every source field this schema does not model. NEVER parsed by app code. */
  legacyRaw: v.optional(v.string()),
} as const;
```

`scripts/lint-schema.ts` asserts: every table whose fields include `legacyKey` declares `by_legacyKey`;
every application index is classified exactly once as lookup/list/maintenance; and a tenant-scoped list
index on a soft-delete table has `deletedAt` at position 2. It never infers index intent from a field name.

### 1.7 Errors, validators, function style

- `args:` is always the object-literal form `{x: v.string()}`, never `args: v.object({...})`.
- `returns:` on **100 %** of public functions (`09` §13 says FightingHows reached 41 %; BooKoo does not ship
  a public function without one).
- Errors are created only by `convex/lib/errors.ts#appError` as
  `ConvexError({code, messageKey, params})`. The executable closed code/key vocabulary and wire guard live
  once in `shared/appErrors.ts`; `error-handling.md` owns result-vs-throw, client presentation, retry, and
  diagnostics. **No natural-language strings on the server** — BooKoo ships ko/en/ja/zh/id and the server
  has no locale (`09` §11.2). Ledger permission failures use the ledger-specific codes and collapse a
  non-member/missing ledger to `LEDGER_NOT_FOUND` so ids cannot be probed.
- Every ledger-scoped function's first line is `requireLedgerMember(ctx, ledgerId)` or
  `requireLedgerRole(ctx, ledgerId, 'MEMBER')` from `convex/lib/ledgerPermissions.ts`.
- All mutations go through the triggers-wrapped `customMutation`; the raw `mutation` is imported in exactly
  one file, `convex/lib/functions.ts` (`13` §11 rule 6).

### 1.8 The contention shard rule

```ts
// convex/lib/constants.ts
export const ROLLUP_SHARD_COUNT = 1; // raise ONLY per the threshold in §5.4

// convex/lib/rollups.ts
/** FNV-1a over the id string. Deterministic, pure, no stored field, no extra document read. */
export function shardOf(userId: Id<'users'>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % ROLLUP_SHARD_COUNT;
}
```

Rules, all three load-bearing:

1. **`shard: v.number()` is the LAST field of every counter index.** Readers range the prefix
   (`.eq(ledgerId).eq(monthKey)`) and sum in JS — correct for any `ROLLUP_SHARD_COUNT`.
2. **Writers compute the shard inline** from the authoring `userId`; they never read a stored value.
   _(This is the correction to proposal A's `ledgerMembers.rollupShard`, which stored the RESULT of
   `ordinal % COUNT` and therefore made raising the constant a no-op requiring a full re-assignment pass.)_
3. **No read ever `.eq()`s the shard.** Raising `ROLLUP_SHARD_COUNT` is therefore a one-constant change
   plus a `ROLLUP_REBUILD`, with no schema migration, no index change, no query change.

---

## 2. `convex/schema.ts` and `convex/convex.config.ts`

### 2.1 `convex/schema.ts`

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

// identity
import {userProfilesTable, userPresenceTable} from './schema/userProfiles';
import {userEmailsTable} from './schema/userEmails';
import {userHandlesTable} from './schema/userHandles';
import {
  appleRefreshTokensTable,
  emailLinkCodesTable,
  authAuditTable,
} from './schema/authSupport';
import {contentReportsTable, userBlocksTable} from './schema/moderation';

// tenancy + access control
import {ledgersTable} from './schema/ledgers';
import {
  ledgerMembersTable,
  ledgerMemberStateTable,
} from './schema/ledgerMembers';
import {
  ledgerInviteRedemptionsTable,
  ledgerInvitesTable,
  ledgerJoinRequestsTable,
} from './schema/ledgerInvites';
import {ledgerAuditLogTable} from './schema/ledgerAuditLog';

// ledger contents
import {ledgerCategoriesTable} from './schema/ledgerCategories';
import {ledgerItemsTable} from './schema/ledgerItems';
import {itemPhotosTable} from './schema/itemPhotos';
import {itemCommentsTable} from './schema/itemComments';
import {clientMutationReceiptsTable} from './schema/clientMutationReceipts';

// derived — never produced by scanning ledgerItems on a read path
import {
  ledgerCategoryMonthRollupsTable,
  ledgerDayRollupsTable,
  ledgerMonthRollupsTable,
} from './schema/rollups';

// platform
import {notificationsTable, pushTokensTable} from './schema/notifications';
import {uploadsTable} from './schema/uploads';
import {feedbackTable} from './schema/feedback';
import {appAnnouncementsTable, appConfigTable} from './schema/appContent';
import {legalEventsTable} from './schema/legalEvents';
import {dataExportFilesTable, dataExportsTable} from './schema/dataExports';

// migration staging — droppable after cutover; the legacy* FIELDS on live tables are permanent
import {
  legacyInvitesTable,
  legacyUsersTable,
  maintenanceJobsTable,
  migrationAnomaliesTable,
  migrationRunsTable,
} from './schema/migration';

export default defineSchema({
  ...authTables,

  // identity
  userProfiles: userProfilesTable,
  userPresence: userPresenceTable,
  userEmails: userEmailsTable,
  userHandles: userHandlesTable,
  appleRefreshTokens: appleRefreshTokensTable,
  emailLinkCodes: emailLinkCodesTable,
  authAudit: authAuditTable,
  contentReports: contentReportsTable,
  userBlocks: userBlocksTable,

  // tenancy + access control
  ledgers: ledgersTable,
  ledgerMembers: ledgerMembersTable,
  ledgerMemberState: ledgerMemberStateTable,
  ledgerInvites: ledgerInvitesTable,
  ledgerInviteRedemptions: ledgerInviteRedemptionsTable,
  ledgerJoinRequests: ledgerJoinRequestsTable,
  ledgerAuditLog: ledgerAuditLogTable,

  // ledger contents
  ledgerCategories: ledgerCategoriesTable,
  ledgerItems: ledgerItemsTable,
  itemPhotos: itemPhotosTable,
  itemComments: itemCommentsTable,
  clientMutationReceipts: clientMutationReceiptsTable,

  // derived
  ledgerDayRollups: ledgerDayRollupsTable,
  ledgerMonthRollups: ledgerMonthRollupsTable,
  ledgerCategoryMonthRollups: ledgerCategoryMonthRollupsTable,

  // platform
  pushTokens: pushTokensTable,
  notifications: notificationsTable,
  uploads: uploadsTable,
  feedback: feedbackTable,
  appConfig: appConfigTable,
  appAnnouncements: appAnnouncementsTable,
  legalEvents: legalEventsTable,
  dataExports: dataExportsTable,
  dataExportFiles: dataExportFilesTable,

  // migration staging
  legacyUsers: legacyUsersTable,
  legacyInvites: legacyInvitesTable,
  migrationRuns: migrationRunsTable,
  migrationAnomalies: migrationAnomaliesTable,
  maintenanceJobs: maintenanceJobsTable,
});
```

**38 application tables + 7 `authTables`.** Four of the 38 (`legacyUsers`, `legacyInvites`,
`migrationRuns`, `migrationAnomalies`) plus the migration rows of `maintenanceJobs` are dropped after the
cutover sign-off, leaving 34 permanent tables.

**Tables deliberately NOT in this list, and why** (each was in at least one proposal):

| Absent table                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledgerStats`                                                    | Removed, not relocated. Its money fields are a ≤120-row `ledgerMonthRollups` range; `lastItemAt` is a one-document index probe; `firstItemDayKey`/`lastItemDayKey` are one-document `.first()` probes on the workhorse index. B's and C's `firstDayKey`/`lastDayKey` are **min/max aggregates maintained by a delta**, which cannot be restored after the extreme row is soft-deleted and which neither proposal's repair cron touches. Removing the table removes a document that all 8 writers would patch on every write **and** an unrepairable drift class. |
| `ledgerActivity` (per-item feed)                                 | An append-only row per item write doubles the hot path's write count and grows a table as fast as `ledgerItems`. Governance events go to `ledgerAuditLog` (bounded, ≤ hundreds of rows per ledger per year); the "something changed" signal is the O(1) timestamp comparison of §4.3. `ledgerAuditLog.retention` is shipped so a v2 item-level feed is purgeable without a schema change.                                                                                                                                                                        |
| `tags` / `ledgerItems.tagIds`                                    | A speculative feature with a denormalized `usageCount` that had no writer and no repair path, plus an array field on the 1M-row table that its own proposal conceded is temporary. v2 seam, §10.                                                                                                                                                                                                                                                                                                                                                                 |
| `ledgerCategoryStats` (`useCount`/`lastUsedAt`)                  | Category order follows the bounded preset/custom `sortOrder`. BooKoo does not persist per-user financial activity or recency on device, and a hot counter would add drift and writes to every entry mutation.                                                                                                                                                                                                                                                                                                                                                    |
| `photoMigrations`                                                | Merged into `itemPhotos` (`migrationState`, `attempts`, `lastError`, `legacyUrl`, …). Two rows per photo pointing at each other with no stated authority is a drift source; one row has one authority.                                                                                                                                                                                                                                                                                                                                                           |
| `uploadMaintenance` / `ledgerMaintenance` / separate job cursors | One `maintenanceJobs` table, one resume protocol, one "what is running" query. The orphan sweep checks claimed rows through `uploads.by_referencedCheckedAt` and also cursor-scans Convex's `_storage` system table for POST-success/claim-crash blobs.                                                                                                                                                                                                                                                                                                          |
| `fxRates`                                                        | Every v1 row has `currency === baseCurrency`, so `fxRateMicros` is always absent and there is nothing to look up. v2 seam, §10.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `appReleases` (a table per release)                              | Folded into the `appConfig` singleton: one document, one cached read for the entire user base.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rateLimits`                                                     | `@convex-dev/rate-limiter` is a component; its sharding is already solved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 2.2 `convex/convex.config.ts`

```ts
import {defineApp} from 'convex/server';
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import workpool from '@convex-dev/workpool/convex.config.js';

const app = defineApp();

/**
 * Auth writes, invite create/redeem, join requests, membership churn, feedback, and content reports.
 * `09` §4.3: FightingHows has NO rate limiting outside the auth tables. Handle availability remains
 * an unlimited query because queries cannot update a counter; the claim/rename writes are limited.
 */
app.use(rateLimiter);

/**
 * Bounded-concurrency Firebase Storage -> Convex _storage blob copy, for BOTH item photos and
 * profile avatars. A serial self-rescheduling chain at ~500 ms/blob is ~14 h for 100k photos;
 * a workpool at maxParallelism 20 is ~45 min, and it is the documented remedy for the OCC storm a
 * naive fan-out would cause (`13` §8.3).
 */
app.use(workpool, {name: 'blobImport'});

export default app;
```

`maxParallelism` is a `Workpool` client option in `@convex-dev/workpool@0.4.10`, not an
`app.use` mount option. The migration worker constructs
`new Workpool(components.blobImport, {maxParallelism: 20})`; the component mount only assigns the
stable `blobImport` component name.

The components and all buckets are instantiated exactly once. R6 installs exact pins
`@convex-dev/rate-limiter@0.3.2` and `@convex-dev/workpool@0.4.10`; subsystem documents point here
instead of defining partial copies.

```ts
// convex/lib/rateLimits.ts
import {RateLimiter, HOUR, DAY} from '@convex-dev/rate-limiter';
import {components} from '../_generated/api';

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Unauthenticated; call sites key the first by normalized email and the second globally.
  otpRequestPerEmail: {
    kind: 'token bucket',
    rate: 5,
    period: HOUR,
    capacity: 5,
  },
  otpRequestGlobal: {
    kind: 'token bucket',
    rate: 500,
    period: HOUR,
    capacity: 500,
  },

  // Authenticated; keyed by userId unless a different key is stated.
  handleClaim: {kind: 'token bucket', rate: 5, period: DAY, capacity: 5},
  handleRename: {kind: 'token bucket', rate: 3, period: DAY, capacity: 3},
  emailLinkRequest: {kind: 'token bucket', rate: 3, period: HOUR, capacity: 3},
  emailLinkConfirm: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  accountLink: {kind: 'token bucket', rate: 10, period: HOUR, capacity: 10},
  legacyClaim: {kind: 'token bucket', rate: 5, period: DAY, capacity: 5},
  deletionRequest: {kind: 'token bucket', rate: 3, period: DAY, capacity: 3},
  inviteCreate: {kind: 'token bucket', rate: 10, period: HOUR, capacity: 10},
  inviteCreateDaily: {kind: 'fixed window', rate: 40, period: DAY},
  inviteRedeem: {kind: 'token bucket', rate: 20, period: HOUR, capacity: 20},
  joinRequestCreate: {kind: 'token bucket', rate: 5, period: HOUR, capacity: 5},
  // Keyed by ledgerId so one ledger cannot create an unbounded notification fan-out.
  ledgerMemberChurn: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 30,
  },
  feedbackSend: {kind: 'fixed window', rate: 5, period: DAY},
  reportCreate: {kind: 'fixed window', rate: 10, period: DAY},
});
```

`checkHandleAvailability` is deliberately not a bucket. It is one cached indexed query, while a durable
rate counter would turn every probe into a write. The write-side `handleClaim` and `handleRename` buckets
protect the scarce operations. `RATE_LIMITED` includes `retryAfterSeconds` so clients can show a countdown.

**Deliberately NOT adopted in v1:**

| Component                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex-dev/aggregate`       | **No.** Every v1 aggregate is a fixed bucket known at write time, which `13` §3.4 names as exactly the rollup-table case: a 1-document read set, no B-tree, no shared internal nodes, no `_creationTime` insert serialisation. **Adoption trigger, stated now:** the first arbitrary-date-range report screen (`2024-03-05 → 2025-11-20`). It is then added as `TableAggregate<{Namespace: Id<'ledgers'>; Key: [monthKey, occurredAt]}>` — **namespaced by ledger, never global** — and backfilled with `insertIfDoesNotExist`. |
| `@convex-dev/sharded-counter` | **No.** There is no global counter anywhere in this schema; that is a design property, not an oversight. Per-ledger contention is handled by §1.8's `shard` field, which is readable in one index range.                                                                                                                                                                                                                                                                                                                        |
| `@convex-dev/migrations`      | **No.** Every batched job in this design is per-ledger and user-triggered (tz rebucket, currency rebase, purge cascade, category reassign, rollup repair), which `maintenanceJobs` + a `ctx.scheduler.runAfter(0, …)` chain serves with one cursor store instead of two. Adopt it the first time a _whole-table, deploy-time_ field backfill is needed.                                                                                                                                                                         |
| `@convex-dev/crons`           | **No.** `convex/crons.ts` is static; nothing registers a cron at runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@convex-dev/action-cache`    | **No.** Its v1 use case would have been the FX quote, which does not ship.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 3. The table files — ready to paste

Every index below carries the query it serves. `common.ts` is §1.6 and is not repeated.

### 3.1 `convex/schema/userProfiles.ts`

```ts
import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, timestamps} from './common';

/**
 * App UI locales. Legacy shipped `ko en ja zh id`; `de es fr it nl pt` are
 * the developed-country expansion. Keep in lockstep with `shared/locales.ts`.
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
  /** Optional country analytics; absent means no consent. */
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
  /** Latest consenting connection country only; no IP/GPS history. */
  ipCountryCodeAtLastSeen: v.optional(v.string()),
})
  // The only read: my own presence, and the ops "who is active" query.
  .index('by_userId', ['userId']);
```

### 3.1.1 `convex/schema/userEmails.ts`

`users.email` and `userProfiles.emailNormalized` are the current primary-address mirrors. This table is
the authority for **every** address the account has proved, including an Apple private relay address and
an older address added solely to claim legacy data. An unverified provider address never enters it.

```ts
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
```

`setPrimaryEmail` and `applyEmailLink` are the only operations that may change `isPrimary`,
`users.email`, or `userProfiles.emailNormalized`; they update all three mirrors in the same mutation.
The live primary invariant is exactly zero or one row per user, and exactly one when either mirror is
present. `PRIMARY_EMAIL_MIRROR_CHECK` verifies it nightly and alerts instead of guessing which address
should win.

### 3.2 `convex/schema/userHandles.ts`

Adopted essentially verbatim from `09` §12.4 / `auth-onboarding.md` §10 — it is already the researched
answer, and it is the only structure that makes uniqueness race-safe _and_ keeps a released handle out of
an impersonator's hands.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * Authority for handle uniqueness. One row per handle EVER claimed; rows are NEVER deleted.
 *
 * Convex has no unique constraint. Uniqueness is a check-then-insert inside ONE mutation against
 * `by_handleKey`: Convex tracks index RANGES in the read set, so a competing insert into the range
 * this mutation read invalidates it, the mutation re-runs at a fresh timestamp, and the re-run sees
 * the winner's row (`09` §12.2). Three conditions are load-bearing: same mutation, `.eq()` on the
 * NORMALIZED key via withIndex (never `.filter()`), and one normalization function
 * (`shared/username.ts`) shared byte-for-byte by client and server.
 *
 * `releasedAt` is what stops a freed handle being recycled straight into an impersonation
 * (HANDLE_RELEASE_COOLDOWN_MS = 90 d; the original owner may always re-take immediately).
 */
export const userHandlesTable = defineTable({
  /** NFKC-folded, lowercased, ASCII-only. THIS is what uniqueness compares. */
  handleKey: v.string(),
  /** Exactly what the member typed, for display casing. */
  handle: v.string(),
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away or the account is deleted. undefined == currently held. */
  releasedAt: v.optional(v.number()),
})
  // THE uniqueness gate inside claimHandle/changeHandle; also checkAvailability (advisory) and the
  // <=12 probes inside suggestAvailable. Narrowest possible read set.
  .index('by_handleKey', ['handleKey'])
  // Security screen "Previously: @oldhyo until 2026-05-01". `.take(HANDLE_HISTORY_LIMIT = 50)`.
  .index('by_userId_claimedAt', ['userId', 'claimedAt'])
  // "Is this user's handle currently live?" without walking their rename history — used by
  // deleteAccount to release the live claim.
  .index('by_userId_releasedAt', ['userId', 'releasedAt']);
```

### 3.3 `convex/schema/authSupport.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/** auth-onboarding.md §12.3. SECRET — never reaches a client, never in a serializer projection. */
export const appleRefreshTokensTable = defineTable({
  userId: v.id('users'),
  /** Bundle id on iOS, Services ID on Android web — DIFFERENT values, so stored, not guessed. */
  clientId: v.string(),
  refreshToken: v.string(),
  updatedAt: v.number(),
})
  // Revoke-on-account-deletion (App Store 5.1.1(v)) and the token refresh path.
  .index('by_userId_clientId', ['userId', 'clientId']);

/** OUR OWN OTP, for ADDING an email to an already-signed-in account (auth-onboarding.md §11.4). */
export const emailLinkCodesTable = defineTable({
  userId: v.id('users'),
  emailNormalized: v.string(),
  codeHash: v.string(), // sha256 hex, lowercase. The plaintext code is never stored.
  expiresAt: v.number(),
  attemptsLeft: v.number(),
  createdAt: v.number(),
})
  // "cancel my pending email link" + the one-outstanding-code-per-user rule.
  .index('by_userId', ['userId'])
  // Verify: `.eq(emailNormalized)` then compare the hash in JS over <=1 row.
  .index('by_emailNormalized', ['emailNormalized'])
  // Expiry cron.
  .index('by_expiresAt', ['expiresAt']);

/**
 * Append-only impersonation/support paper trail. ACCOUNT-scoped; ledger governance goes to
 * ledgerAuditLog. Small, structured, never free text from a client.
 */
export const authAuditTable = defineTable({
  userId: v.optional(v.id('users')),
  event: v.union(
    v.literal('handle_claimed'),
    v.literal('handle_renamed'),
    v.literal('account_linked'),
    v.literal('account_unlinked'),
    v.literal('accounts_merged'),
    v.literal('email_verified'),
    v.literal('email_reassigned'),
    v.literal('primary_email_changed'),
    v.literal('legacy_claimed'),
    v.literal('legacy_force_claimed'),
    v.literal('legacy_ambiguous'),
    v.literal('deletion_requested'),
    v.literal('deletion_cancelled'),
    v.literal('deletion_purged'),
    v.literal('ledger_ownership_transferred'),
    v.literal('account_suspended'),
    v.literal('account_reinstated'),
  ),
  detail: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  ticketRef: v.optional(v.string()),
  createdAt: v.number(),
})
  // "everything that happened to this account", paginated desc on the support screen.
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  // Ops: "every ambiguous legacy claim this week".
  .index('by_event_createdAt', ['event', 'createdAt']);
```

### 3.4 `convex/schema/moderation.ts`

Required by App Store Guideline 1.2 the moment the app ships public `@handle`s and a public comment
thread. The legacy app had neither and shipped neither; both are now in scope.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {timestamps} from './common';

export const reportReasonValidator = v.union(
  v.literal('SPAM'),
  v.literal('HARASSMENT'),
  v.literal('IMPERSONATION'),
  v.literal('SEXUAL'),
  v.literal('FRAUD'),
  v.literal('PRIVACY'),
  v.literal('OTHER'),
);
export const reportStatusValidator = v.union(
  v.literal('OPEN'),
  v.literal('REVIEWING'),
  v.literal('ACTIONED'),
  v.literal('DISMISSED'),
);
export const reportResolutionValidator = v.union(
  v.literal('NO_ACTION'),
  v.literal('COMMENT_REMOVED'),
  v.literal('ITEM_CONTENT_REDACTED'),
  v.literal('MEMBER_REMOVED'),
  v.literal('ACCOUNT_SUSPENDED'),
);

export const contentReportsTable = defineTable({
  reporterUserId: v.id('users'),
  /**
   * A DISCRIMINATED UNION, not (targetKind: string, fourOptionalIds). The id types are checked by
   * the compiler at every construction site and an impossible combination is unrepresentable.
   */
  subject: v.union(
    v.object({kind: v.literal('USER'), userId: v.id('users')}),
    v.object({kind: v.literal('LEDGER'), ledgerId: v.id('ledgers')}),
    v.object({kind: v.literal('ITEM'), itemId: v.id('ledgerItems')}),
    v.object({kind: v.literal('COMMENT'), commentId: v.id('itemComments')}),
  ),
  /** Derived and permission-checked by reports.create. Required for ledger/content subjects and for
   *  a USER report made from a member surface; never trusted from a client-supplied id alone. */
  contextLedgerId: v.optional(v.id('ledgers')),
  reason: reportReasonValidator,
  note: v.optional(v.string()), // <=500 chars, never logged/projected to the subject
  status: reportStatusValidator,
  acknowledgedAt: v.optional(v.number()),
  acknowledgedByUserId: v.optional(v.id('users')),
  handledByUserId: v.optional(v.id('users')),
  handledAt: v.optional(v.number()),
  resolution: v.optional(reportResolutionValidator),
  ticketRef: v.optional(v.string()), // opaque support-system reference, not free-form notes
  ...timestamps,
})
  // Moderation queue: `.eq('status','OPEN')`, createdAt asc, paginate 30.
  .index('by_status_createdAt', ['status', 'createdAt'])
  // Rate-limit backstop ("this account filed 40 reports today") + the reporter's own history.
  .index('by_reporterUserId_createdAt', ['reporterUserId', 'createdAt']);

export const userBlocksTable = defineTable({
  blockerUserId: v.id('users'),
  blockedUserId: v.id('users'),
  createdAt: v.number(),
})
  // O(1) "is B blocked by A" — checked when rendering a comment author and when resolving an invite.
  .index('by_blockerUserId_blockedUserId', ['blockerUserId', 'blockedUserId'])
  // Reverse check when someone tries to invite a user who has blocked them.
  .index('by_blockedUserId', ['blockedUserId'])
  // The block-list screen.
  .index('by_blockerUserId_createdAt', ['blockerUserId', 'createdAt']);
```

`moderation-and-safety.md` owns the executable invariants: `OPEN` has no handler/resolution;
`REVIEWING` has acknowledgement time/actor; `ACTIONED` has a handler and non-`NO_ACTION` resolution; `DISMISSED`
has `NO_ACTION`. A terminal remedy and the domain/auth-audit write commit in one mutation. User blocks
are directional storage but symmetric interaction gates; invite/join paths check both directions against
every active member without hiding financial rows from an existing co-member.

### 3.5 `convex/schema/ledgers.ts`

```ts
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
```

**There is no `search_title` index and no `discoverable` field.** `sharing-invites.md` §3.2 **drops**
public search-by-title outright: legacy `searchLedgers` exposed every household ledger in the product to
every signed-in stranger by exact title (`02` §S11), and the deep-link invite replaces it entirely. This
is stronger than proposal A's/C's `discoverable: false` default and strictly stronger than proposal B's
`discoverable: true` for migrated ledgers (which would have made every 2019 household ledger
_prefix_-searchable — more exposure than legacy ever had). Join requests survive; they are produced only
by redeeming an invite link whose `requiresApproval` is true.

### 3.6 `convex/schema/ledgerMembers.ts`

```ts
import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/** sharing-invites.md §1.1. Rank order matters: OWNER > ADMIN > MEMBER > VIEWER. */
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'), // exactly one live row per ledger; == ledgers.ownerId
  v.literal('ADMIN'), // manage people + ledger settings; cannot transfer or delete
  v.literal('MEMBER'), // the legacy "member": read all, write items/comments/photos
  v.literal('VIEWER'), // read only — accountant, parent, "구경만 하는" link
);
export type LedgerRole = Infer<typeof ledgerRoleValidator>;

export const joinSourceValidator = v.union(
  v.literal('CREATED'),
  v.literal('INVITE_LINK'),
  v.literal('INVITE_EMAIL'),
  v.literal('INVITE_HANDLE'),
  v.literal('REQUEST_APPROVED'),
  v.literal('LEGACY_IMPORT'), // the legacy members map carried no provenance
);

export const membershipEndReasonValidator = v.union(
  v.literal('LEFT'),
  v.literal('REMOVED'),
  v.literal('LEDGER_DELETED'),
);

/**
 * THE AUTHORIZATION DOCUMENT. `by_ledgerId_userId` is the single most-called index in the app: the
 * first line of every ledger-scoped query and mutation is
 *   requireLedgerMember(ctx, ledgerId) -> .eq(ledgerId).eq(userId).unique()
 * — ONE document, whose read set is exactly that one index key, so another member joining or leaving
 * does not invalidate my queries.
 *
 * Because it is in the read set of every function in the app, this row must be nearly immutable. It
 * therefore carries NO lastReadAt, NO unread count, NO nickname-change churn and NO display
 * snapshot; those live in `ledgerMemberState` (hot) and `userProfiles` (resolved once per screen).
 *
 * EXACTLY ONE ROW PER (ledgerId, userId) FOREVER. Leaving sets `deletedAt`; rejoining clears it.
 * That invariant is what makes `by_ledgerId_userId` a true unique key.
 *
 * NAMING DEVIATION from sharing-invites.md §5.2, which called this field `removedAt`: the schema-wide
 * rule is that the soft-delete discriminator is named `deletedAt` and sits at position 2 of every
 * live list index. The exact guard `by_ledgerId_userId` is a manifest-classified lookup and reads the
 * row before checking its state. `endReason` carries what `removedAt` was distinguishing.
 */
export const ledgerMembersTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  role: ledgerRoleValidator,

  joinedAt: v.number(),
  joinedVia: joinSourceValidator,
  invitedByUserId: v.optional(v.id('users')),
  /** Which link they came through — powers "링크로 참여" and the leaked-link panic button. */
  joinedViaInviteId: v.optional(v.id('ledgerInvites')),

  /** Membership ended. The ROW STAYS: it is the membership audit trail and it keeps authored items
   *  resolving an author. Also set by ledgers.softDelete (endReason 'LEDGER_DELETED'), which is how
   *  a ledger delete becomes O(members) instead of O(items) — see §7.1. */
  ...softDelete,
  endReason: v.optional(membershipEndReasonValidator),
  /** Removed WITH 차단: blocks redeeming ANY future invite to this ledger. */
  blockedAt: v.optional(v.number()),

  legacyUid: v.optional(v.string()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${uid}`
})
  // THE guard. requireLedgerMember / requireLedgerRole. eq/eq -> 1 document.
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  // Ledger switcher / drawer: "my ledgers". `.eq(userId).eq(deletedAt, undefined).take(50)`.
  .index('by_userId_deletedAt', ['userId', 'deletedAt'])
  // Members screen roster; "who is the OWNER" (.eq(role,'OWNER').unique()); the last-owner guard;
  // the push fan-out recipient list. `.take(MEMBER_SCAN_LIMIT = 200)`.
  .index('by_ledgerId_deletedAt_role', ['ledgerId', 'deletedAt', 'role'])
  // The leaked-link panic button: remove everyone who joined through one invite.
  .index('by_joinedViaInviteId', ['joinedViaInviteId'])
  // Import idempotency + the claim re-parenting sweep (resolve legacyUid -> userId).
  .index('by_legacyUid', ['legacyUid'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * The HOT per-(ledger, member) row, split out of ledgerMembers precisely so that writing
 * `lastReadAt` — which happens every time anyone opens a ledger — cannot invalidate the
 * authorization read set of every query in that ledger.
 *
 * Deliberately has NO unread COUNT. Maintaining one would mean 8 document writes per item insert
 * (one per member), which is the single worst write amplification available in this schema. The
 * badge is an O(1) timestamp comparison instead (§4.3).
 */
export const ledgerMemberStateTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  /** Throttled write (LAST_READ_THROTTLE_MS = 60_000). Drives the "new activity" dot. */
  lastReadAt: v.number(),
  lastOpenedAt: v.number(),

  muted: v.boolean(),
  notifyNewItem: v.boolean(),
  notifyComment: v.boolean(),
  /** ITEM_ADDED push coalescing claim; patched at most once per recipient per 10 minutes. */
  lastItemPushAt: v.optional(v.number()),

  /** Per-ledger display name: "아빠" in the family ledger, "형" in the trip ledger. */
  nickname: v.optional(v.string()),
  /** Per-ledger tint so 8 members are distinguishable in a chart legend. */
  colorKey: v.optional(v.string()),

  /** Client-chosen switcher order. Replaces legacy AsyncStorage `selectedLedgerIndex`, which stored
   *  an ARRAY INDEX and broke whenever ledger order changed (`02` §14). */
  pinnedAt: v.optional(v.number()),
  sortOrder: v.number(),

  updatedAt: v.number(),
})
  // Switcher ordering/read watermarks: `.eq(userId)` -> <=20 rows, joined by ledgers.listMine.
  .index('by_userId_ledgerId', ['userId', 'ledgerId'])
  // Push fan-out: every member-state row of one ledger in one range read, mute filtered in JS over
  // <=200 rows. Also the per-member point read on markRead.
  .index('by_ledgerId_userId', ['ledgerId', 'userId']);
```

Migration idempotency uses the natural unique key `by_ledgerId_userId`: P3 point-reads that index and
patches or inserts exactly one row. This is P7's first documented natural-key exception; a synthetic
`legacyKey` would duplicate the same identity.

### 3.7 `convex/schema/ledgerInvites.ts`

This file replaces the **entire legacy `bookoo/invites` double index** (`02` §4) — two mirrored maps in
one colliding namespace, distinguished only by a "does this key look like a push id" heuristic, with two
`Promise.all` bugs that left orphans in production. Here index A is `by_ledgerId_revokedAt` and index B is
`by_inviteeEmailNormalized_revokedAt`, over **one row**: two views of one fact, maintained by the
database, impossible to desynchronise.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {ledgerRoleValidator} from './ledgerMembers';
import {legacyTrailer, timestamps} from './common';

export const inviteSourceValidator = v.union(
  v.literal('LINK'), // a shareable deep link, N uses, expiring
  v.literal('EMAIL'), // aimed at one address
  v.literal('HANDLE'), // aimed at one existing account found by @handle
  v.literal('LEGACY_EMAIL'), // converted from bookoo/invites; NEVER auto-joins (see below)
);

export const ledgerInvitesTable = defineTable({
  ledgerId: v.id('ledgers'),

  /**
   * sha256(INVITE_TOKEN_PEPPER + ':' + normalizedCode), hex. The plaintext code is returned exactly
   * once, by the mutation that creates the row, and is NEVER stored. A database export is therefore
   * not a set of working invite links.
   */
  codeHash: v.string(),

  /** Role granted on redeem. NEVER OWNER or ADMIN — enforced in invites.create. A bearer token must
   *  not be able to grant management rights (sharing-invites.md §1.3 rule 2). */
  role: ledgerRoleValidator,
  source: inviteSourceValidator,

  maxUses: v.optional(v.number()), // undefined = unlimited
  useCount: v.number(), // required, 0 at insert
  /** undefined = never expires. REQUIRED to be optional: legacy invites never expired, and a 2019
   *  invitee who signs in tomorrow must still land in that ledger (`02` §4). New links get 7 d. */
  expiresAt: v.optional(v.number()),
  /** true => redeeming creates a ledgerJoinRequest instead of a membership. */
  requiresApproval: v.boolean(),

  /** At most one of these two is set. Present => the invite is bound to one identity. */
  inviteeEmailNormalized: v.optional(v.string()),
  inviteeUserId: v.optional(v.id('users')),

  note: v.optional(v.string()), // <=40 chars, shown in the management list
  createdByUserId: v.id('users'),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  revokedByUserId: v.optional(v.id('users')),
  // A recipient decline also sets revokedAt to leave the active invite indexes.
  declinedAt: v.optional(v.number()),

  /** The RTDB key exactly as it appeared: "hyo%40hyo%2Edev". Kept so A/B reconciliation is auditable. */
  legacyEncodedEmail: v.optional(v.string()),
  legacyLedgerKey: v.optional(v.string()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${encodedEmail}`
})
  // THE redemption lookup. Exact eq on a 128-bit-derived digest. Also the mint-time uniqueness gate.
  .index('by_codeHash', ['codeHash'])
  // LEGACY INDEX A: the Members screen "초대중" list + the 20-active-links-per-ledger cap.
  .index('by_ledgerId_revokedAt_createdAt', [
    'ledgerId',
    'revokedAt',
    'createdAt',
  ])
  // LEGACY INDEX B: "which ledgers were waiting for this address?", run once per verified email.
  .index('by_inviteeEmailNormalized_revokedAt', [
    'inviteeEmailNormalized',
    'revokedAt',
  ])
  // "You have an invitation" badge for an already-registered target.
  .index('by_inviteeUserId_revokedAt', ['inviteeUserId', 'revokedAt'])
  // Expiry GC cron.
  .index('by_expiresAt', ['expiresAt'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * One row per (invite, user) that ever redeemed. Two jobs: `useCount` stays exact when the same
 * person taps the link twice (a re-tap must not burn a use), and the management screen can show WHO
 * used a link, not just how many times. It is also what the `useCount` repair job recounts from.
 */
export const ledgerInviteRedemptionsTable = defineTable({
  inviteId: v.id('ledgerInvites'),
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  redeemedAt: v.number(),
  outcome: v.union(v.literal('JOINED'), v.literal('REQUESTED')),
})
  // Idempotency: "has this person already redeemed this link?" — 1 document.
  .index('by_inviteId_userId', ['inviteId', 'userId'])
  // "Who used this link" + the useCount repair recount. `.take(INVITE_REDEMPTION_SCAN_LIMIT = 200)`.
  .index('by_inviteId_redeemedAt', ['inviteId', 'redeemedAt']);

export const joinRequestStatusValidator = v.union(
  v.literal('PENDING'),
  v.literal('APPROVED'),
  v.literal('REJECTED'),
  v.literal('CANCELLED'),
  v.literal('EXPIRED'),
  v.literal('BLOCKED'),
);
export const joinRequestSourceValidator = v.union(
  v.literal('INVITE_LINK'),
  v.literal('HANDLE_REQUEST'),
  v.literal('LEGACY_REQUEST'),
);

/**
 * The other half of the legacy membership state machine: `ledgers/{k}/requests/{uid}` (`02` §9 B).
 * A rejection KEEPS a row (`status: 'REJECTED'`) — legacy just dropped the node, so a stranger could
 * re-request forever and the owner had no record.
 *
 * Kept as a separate table rather than a `direction` column on ledgerInvites because the two flows
 * are inverses: an invite is the ledger granting permission and is keyed by an address that may not
 * correspond to an account; a request is a person asking, and always has a userId. Fusing them would
 * force emailNormalized / codeHash / inviteeUserId / userId all optional on one table and make every
 * read path check `direction` before trusting a field.
 */
export const ledgerJoinRequestsTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  inviteId: v.optional(v.id('ledgerInvites')),
  status: joinRequestStatusValidator,
  source: joinRequestSourceValidator,
  message: v.optional(v.string()), // <=100 chars
  requestedAt: v.number(),
  expiresAt: v.number(), // requestedAt + 14 d
  decidedByUserId: v.optional(v.id('users')),
  decidedAt: v.optional(v.number()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${uid}`
})
  // The approval inbox AND the drawer's "pending request" dot (`.eq(status,'PENDING').take(1)`).
  // Legacy did the dot with N SEQUENTIAL round-trips per app open (`02` §S4).
  .index('by_ledgerId_status_requestedAt', [
    'ledgerId',
    'status',
    'requestedAt',
  ])
  // "at most one non-terminal request per pair" + the 7-day rejection cooldown.
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  // "My outgoing requests".
  .index('by_userId_status', ['userId', 'status'])
  // Expiry cron.
  .index('by_status_expiresAt', ['status', 'expiresAt'])
  .index('by_legacyKey', ['legacyKey']);
```

**Behaviour change, stated loudly.** Legacy `inviteUsers` made an already-registered invitee a member
**instantly, without consent** (`02` §9 path A). That is not reproduced: a registered invitee gets a
`HANDLE` invite they must accept. **Migrated `LEGACY_EMAIL` invites do not auto-join either** — they
surface as a pending invitation the user accepts with one tap. Rationale: `02` §4 documents that
`deleteInvites` fire-and-forgot three of its four removals, so an invite the owner explicitly _revoked_
can still be in the export; resurrecting it as a permanent auto-join grant to a shared financial ledger is
the one place where fidelity must lose to consent.

### 3.8 `convex/schema/ledgerAuditLog.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {ledgerRoleValidator} from './ledgerMembers';

export const ledgerAuditActionValidator = v.union(
  v.literal('LEDGER_CREATED'),
  v.literal('LEDGER_UPDATED'),
  v.literal('LEDGER_ARCHIVED'),
  v.literal('LEDGER_RESTORED'),
  v.literal('LEDGER_DELETE_SCHEDULED'),
  v.literal('LEDGER_DELETE_CANCELLED'),
  v.literal('CURRENCY_CONFIRMED'),
  v.literal('TIMEZONE_CHANGED'),
  v.literal('POLICY_CHANGED'),
  v.literal('INVITE_CREATED'),
  v.literal('INVITE_REVOKED'),
  v.literal('INVITE_REDEEMED'),
  v.literal('JOIN_REQUESTED'),
  v.literal('JOIN_APPROVED'),
  v.literal('JOIN_REJECTED'),
  v.literal('MEMBER_JOINED'),
  v.literal('MEMBER_LEFT'),
  v.literal('MEMBER_REMOVED'),
  v.literal('MEMBER_ROLE_CHANGED'),
  v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('CATEGORY_CREATED'),
  v.literal('CATEGORY_RENAMED'),
  v.literal('CATEGORY_ARCHIVED'),
  v.literal('CATEGORY_REASSIGNED'),
  v.literal('ITEM_DELETED'),
  v.literal('ITEM_RESTORED'),
  v.literal('EXPORT_REQUESTED'),
  v.literal('MIGRATION_IMPORTED'),
  v.literal('MIGRATION_OWNERSHIP_RESCUED'),
  v.literal('ROLLUP_REPAIRED'),
  v.literal('ITEMS_REBUCKETED'),
);

/**
 * FEED rows are purged at 180 days; AUDIT rows are structurally unreachable by the purge.
 * v1 writes ONLY 'AUDIT'. The field ships anyway because it is the mechanism that keeps any future
 * item-level activity feed bounded, and it costs one literal today instead of a schema change and a
 * backfill tomorrow.
 */
export const auditRetentionValidator = v.union(
  v.literal('AUDIT'),
  v.literal('FEED'),
);

/**
 * GOVERNANCE events only. Deliberately NOT written for item create/update: that would double the
 * write volume of the hottest path in the app and make this the largest table in the deployment.
 * Item history is answered by ledgerItems.updatedAt/updatedByUserId plus the soft-delete window;
 * ITEM_DELETED/ITEM_RESTORED are here because "who deleted the 300,000원 entry" is the question a
 * shared money log must be able to answer.
 */
export const ledgerAuditLogTable = defineTable({
  ledgerId: v.id('ledgers'),
  action: ledgerAuditActionValidator,
  retention: auditRetentionValidator,
  actorUserId: v.optional(v.id('users')), // undefined = the system / a cron / the migration
  targetUserId: v.optional(v.id('users')),
  targetInviteId: v.optional(v.id('ledgerInvites')),
  targetItemId: v.optional(v.id('ledgerItems')),
  beforeRole: v.optional(ledgerRoleValidator),
  afterRole: v.optional(ledgerRoleValidator),
  /** Small, non-secret, structured. NEVER an invite code, never free client text. */
  meta: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  createdAt: v.number(),
})
  // Ledger settings -> Activity, paginated desc 30.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  // "Recently deleted" / restore, and the retention purge cron (`.eq(retention,'FEED')`).
  .index('by_ledgerId_retention_createdAt', [
    'ledgerId',
    'retention',
    'createdAt',
  ])
  // "Everything that happened to this member in this ledger" on the member detail sheet.
  .index('by_ledgerId_targetUserId_createdAt', [
    'ledgerId',
    'targetUserId',
    'createdAt',
  ]);
```

### 3.9 `convex/schema/ledgerCategories.ts`

**The biggest feature fix in the rewrite.** Legacy categories were never in Firebase (`02` §7.1): they
lived in a device-local `expo-sqlite` table seeded from a 34-entry constant with the **localized label
frozen at install time**, and custom categories never synced. Consequences: a reinstall lost them, member
A's custom category reached member B only as a `{iconId, txt}` snapshot glued onto the item, and changing
app language never re-translated anything.

The model is `money-categories-i18n.md` §2.2 verbatim: **presets are TypeScript, overlays are rows,
copy-on-write.** A brand-new ledger reads **zero** category documents; the instant a member reorders,
hides, renames or adds, the ledger is materialized with the complete 34-row overlay set.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {timestamps} from './common';

export const categoryKindValidator = v.union(
  v.literal('EXPENSE'),
  v.literal('INCOME'),
);
export const categorySourceValidator = v.union(
  v.literal('PRESET'),
  v.literal('CUSTOM'),
);

/**
 * COPY-ON-WRITE OVERLAY. The invariant is small enough to hold in your head:
 *   a ledger has either ZERO rows here (and uses shared/categories.ts SYSTEM_CATEGORIES verbatim),
 *   or a COMPLETE overlay set (all 34 presets) plus its customs.
 * There is no partial state.
 *
 * Why presets are code and not 34 seeded rows per ledger: 34 inserts at every ledger creation, 34 x N
 * rows of storage, a data migration every time a preset is added, and a read on the screen that
 * renders on every entry. And crucially: a preset TRANSLATION FIX (`04` §3.1 lists eight bad ones,
 * plus FURNITURE reading "home appliances" in ko/ja/zh) then ships in the app bundle and takes effect
 * everywhere at once, instead of needing a job that walks every ledger's seeded rows.
 */
export const ledgerCategoriesTable = defineTable({
  ledgerId: v.id('ledgers'),
  /** Stable identity. PRESET -> the SYSTEM_CATEGORIES slug ('meal'). CUSTOM -> `c_<8 chars>`. */
  key: v.string(),
  source: categorySourceValidator,
  kind: categoryKindValidator,
  /** A raw cpk-ui `IconName`, e.g. 'ForkKnife', semantically validated against `iconList`. NOT an
   *  asset path or array index — the legacy `CATEGORIES_ICON[iconId]` had no bounds check. */
  iconKey: v.string(),
  /** Theme colour TOKEN name, e.g. 'category.red'. Never a hex: dark mode needs two values. */
  colorToken: v.string(),
  /**
   * PRESET + undefined => render t(`category.${key}`) in the viewer's locale, re-translated on every
   * language switch. PRESET + string => the user renamed it; never re-translated.
   * CUSTOM => always a string (enforced in the mutation).
   */
  label: v.optional(v.string()),
  /** Multiples of 10 (income offset by 1000) so an insert needs no reflow. */
  sortOrder: v.number(),
  /** Hidden from the picker; still resolves on historical items. Distinct from archived. */
  hiddenAt: v.optional(v.number()),
  /** Soft-deleted. Still resolves on historical items; only the picker filters it. */
  archivedAt: v.optional(v.number()),
  /** Set while `categories.reassign` is moving this category's items; the row cannot be picked. */
  reassignJobKey: v.optional(v.string()),

  createdByUserId: v.optional(v.id('users')),
  /** Legacy CATEGORIES_ICON id 0..33. Present on PRESET rows and on customs recovered from items. */
  legacyIconId: v.optional(v.number()),
  /** The exact `category.txt` the legacy item carried, for a recovered custom. */
  legacyLabel: v.optional(v.string()),
  ...timestamps,
})
  // Picker + label map: `.eq(ledgerId).take(CATEGORY_SCAN_LIMIT /* 121 */)`, then ASSERT <=120.
  // Hidden/archived are filtered in JS only after the assertion. Zero rows => code defaults.
  .index('by_ledgerId_sortOrder', ['ledgerId', 'sortOrder'])
  // materialize() idempotence, create-custom uniqueness, and O(1) key resolution on the detail screen.
  .index('by_ledgerId_key', ['ledgerId', 'key'])
  // Migration: map a legacy `category.iconId` to this ledger's row. IDEMPOTENT re-runs.
  .index('by_ledgerId_legacyIconId', ['ledgerId', 'legacyIconId']);
```

Category recovery is idempotent because a recovered custom's `key` is
`` `c_${stableHash(legacyIconId, txt)}` `` — deterministic, so re-running the import produces the same
key and `by_ledgerId_key` dedupes it. (Proposal C's recovery had neither a deterministic key nor a
dedupe index and would have duplicated every recovered custom on a re-run.)

This `by_ledgerId_key` point read is P7's second and final natural-key exception. The measured migration
produces at most **54 customs + 34 presets = 88 rows** in one ledger, so the 120-row invariant has 32 rows
of headroom. P6 fails before writing if its offline catalog exceeds 120; the runtime query reads 121 and
throws on the 121st instead of silently truncating.

### 3.10 `convex/schema/ledgerItems.ts` — the one table that grows forever

```ts
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

  // ---- client-request idempotency for ambiguous online retries ----
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
  // (9) Ambiguous online create retry. Author scoping prevents another member from probing an id.
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
```

**9 indexes + 1 search index = 10 of the 32-per-table budget.** Every insert therefore maintains **10
index entries**; a 1M-row migrated import builds **10M** of them. The ninth ordinary index is accepted
because process-death-safe create idempotency is a launch invariant, not a speculative read path.
Two indexes that appeared in the proposals are deliberately absent: an amount-RANGE index
(`['ledgerId','deletedAt','type','baseAmountMinor']` — no named v1 screen; exact-amount search is served
by exact-value index (5); a range index is a `staged: true` addition when "biggest expenses" ships) and a
cross-ledger `by_authorId_deletedAt_occurredAt` (it spans ledgers the viewer may not be a member of, and
index (3) answers the same question per tenant).

### 3.11 `convex/schema/itemPhotos.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {blobMigrationStateValidator} from './userProfiles';
import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * Legacy `item.picture[]` was an ARRAY INSIDE THE ITEM (`02` §7.3). Four reasons it is a table:
 *  1. Every attach rewrote the whole item document — including, in the legacy code, the nested
 *     `reviews` map, silently destroying any comment added between load and save (`02` S12).
 *  2. Convex caps arrays at 8,192 elements and documents at 1 MiB.
 *  3. The migration needs a PER-PHOTO retry state machine (`14` D8/§5.3) and must be able to hold a
 *     row BEFORE the blob is copied — which is why storageId and every dimension field is optional.
 *  4. A ledger-wide receipt gallery becomes one indexed range instead of a fan-out, and receipt OCR
 *     becomes additive optional columns.
 *
 * TWO storage ids per photo: a ~320px thumb generated client-side with expo-image-manipulator before
 * upload, and the original. ~20x less timeline bandwidth, and bandwidth is billed (`13` §9). Neither
 * id nor a `ctx.storage.getUrl()` result crosses the wire. D4's authenticated HTTP action checks the
 * caller and current ledger membership on every network request.
 */
export const itemPhotosTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized tenant key: the permission gate, the ledger-wide gallery and the purge cascade all
   *  need it without loading the parent item. */
  ledgerId: v.id('ledgers'),
  /** Position in the legacy picture[] array; the display order in the grid. */
  order: v.number(),

  storageId: v.optional(v.id('_storage')),
  thumbStorageId: v.optional(v.id('_storage')),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  byteSize: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  blurhash: v.optional(v.string()),
  capturedAt: v.optional(v.number()), // EXIF DateTimeOriginal, when present

  uploadedByUserId: v.optional(v.id('users')),

  // ---- migration (`14` §5.3) ----
  migrationState: blobMigrationStateValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  /** picture[i].path — ABSENT on cloud-function-era rows, which is exactly why legacy `deletePhoto`
   *  could never clean them up and the bucket has orphans (`02` §11.2). */
  legacyPath: v.optional(v.string()),
  /** picture[i].url — migration-only source. NEVER projected or rendered; cleared after verified copy. */
  legacyUrl: v.optional(v.string()),
  /** picture[i].base64 === true — the deprecated putString path; the "blob" is a data: URI whose
   *  prefix is `data:image/png;base64, ` WITH A SPACE after the comma. */
  legacyIsBase64: v.boolean(),
  /** GCS md5Hash (base64) from the storage manifest, for byte-level verification. */
  legacySourceMd5: v.optional(v.string()),

  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${itemKey}/${order}`
})
  // Item detail: the 6-photo preview grid and the full-screen swiper. `.take(PHOTO_SCAN_LIMIT = 20)`.
  .index('by_itemId_deletedAt_order', ['itemId', 'deletedAt', 'order'])
  // Ledger-wide receipt gallery, newest first, paginated 40; also the purge cascade cursor.
  .index('by_ledgerId_deletedAt_createdAt', [
    'ledgerId',
    'deletedAt',
    'createdAt',
  ])
  // THE blob-copy worker: `.eq('PENDING').lt('attempts', 6)` — ascending attempts, so repeated
  // failures deprioritize themselves. Also the cutover gate: PENDING + FAILED must reach 0.
  .index('by_migrationState_attempts', ['migrationState', 'attempts'])
  // Orphan-blob GC cross-check against `uploads`.
  .index('by_storageId', ['storageId'])
  .index('by_legacyKey', ['legacyKey']);
```

### 3.12 `convex/schema/itemComments.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * Legacy `reviews` — the comment thread on a transaction, which is "the social in social ledger".
 * Legacy read it with `.limitToLast(100).on('value')` plus ONE `users/{writer}/info` fetch PER
 * REVIEW, sorting inside each callback: O(n^2 log n), and it refetched all 100 on any change (S10).
 *
 * FLAT — no threading in v1. Legacy had none, a ledger comment thread is short, and threading costs
 * another index whose page can come back short unless `parentId` is in the tuple. The seam is one
 * optional field plus a `staged: true` index (§10); every existing row correctly reads as a root.
 *
 * `createdAt` is EXPLICIT and is what the thread index sorts on. This is the exact rule proposal C
 * broke: `itemComments` is a reference-carrying table, so it must be imported by batch mutation,
 * which cannot set `_creationTime` — a 2019 thread would render in import order (`14` D7).
 */
export const itemCommentsTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized tenant key: the membership gate resolves without loading the parent item. */
  ledgerId: v.id('ledgers'),
  /** REQUIRED for the same reason as ledgerItems.authorId — P0.5 guarantees a placeholder. */
  authorId: v.id('users'),
  body: v.string(), // legacy `text`
  editedAt: v.optional(v.number()),

  /** Durable create replay. Both are required for new-app rows and absent only on migrated comments. */
  clientRequestId: v.optional(v.string()),
  clientRequestHash: v.optional(v.string()),

  legacyWriterUid: v.optional(v.string()),
  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${itemKey}/${reviewKey}`
})
  // The thread on the item detail screen, oldest-first, paginated 20. `deletedAt` inside the index,
  // so a page of 20 is 20.
  .index('by_itemId_deletedAt_createdAt', ['itemId', 'deletedAt', 'createdAt'])
  // "My comments in this ledger", AND the claim re-parenting cursor (.eq(authorId, placeholder)),
  // tenant-scoped so no cross-tenant index is needed.
  .index('by_ledgerId_deletedAt_authorId_createdAt', [
    'ledgerId',
    'deletedAt',
    'authorId',
    'createdAt',
  ])
  .index('by_itemId_authorId_clientRequestId', [
    'itemId',
    'authorId',
    'clientRequestId',
  ])
  .index('by_legacyKey', ['legacyKey']);
```

### 3.12.1 `convex/schema/clientMutationReceipts.ts`

Creates can use the durable target row as their receipt. Updates cannot: one item may receive many
independent edits, and storing only the latest request id would let an older ambiguous response
overwrite a newer edit. The bounded receipt table therefore exists for `items.update` only.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const clientMutationReceiptsTable = defineTable({
  userId: v.id('users'),
  ledgerId: v.id('ledgers'),
  itemId: v.id('ledgerItems'),
  clientRequestId: v.string(),
  /** Server-computed canonical update-args hash. Same id with a different hash is always an error. */
  requestHash: v.string(),
  resultUpdatedAt: v.number(),
  createdAt: v.number(),
  expiresAt: v.number(), // createdAt + CLIENT_RECEIPT_TTL_MS (30 days)
})
  .index('by_userId_clientRequestId', ['userId', 'clientRequestId'])
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  .index('by_expiresAt', ['expiresAt']);
```

`items.update` requires `expectedUpdatedAt`. It checks a same-user receipt first; matching hash returns
the stored item/revision, mismatching hash throws the existing `INVALID_INPUT/error.invalidInput`. With no
receipt, a revision mismatch returns `{status:'CONFLICT'}` and writes nothing. A successful update sets
`updatedAt = Math.max(Date.now(), old.updatedAt + 1)` and commits the item/rollup changes and receipt
atomically. The monotonic revision closes same-millisecond lost updates. The 30-day receipt TTL safely
covers delayed or ambiguous online retries without creating a client queue.

### 3.13 `convex/schema/rollups.ts` — where every dashboard number comes from

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * THREE tables, not one with a `periodKind` discriminator. A single table would need
 * (ledgerId, periodKind, periodKey, categoryKey, shard) as its tuple, and Convex range expressions
 * require `.eq()` on every field before the one you range over. The calendar wants "range periodKey,
 * no category"; the donut wants "eq periodKey, range category"; the trend wants "eq category, range
 * periodKey". Those three demands are unsatisfiable by one field order.
 *
 * CONTRACT (all three tables):
 *  - Maintained by a `convex-helpers/server/triggers` trigger on `ledgerItems`, so no mutation can
 *    forget: insert => +delta, delete => -delta, update => -old then +new. A throw inside the
 *    trigger aborts the whole mutation atomically (`13` §5.4).
 *  - All money is `ledgerItems.baseAmountMinor`, i.e. the ledger's baseCurrency. A rollup row is
 *    NEVER a multi-currency sum.
 *  - `expenseMinor` and `incomeMinor` are SIGNED sums into their type's bucket, so a refund
 *    (negative amountMinor on an EXPENSE) correctly reduces the expense bucket. TRANSFER contributes
 *    to neither. `itemCount` counts every non-deleted item in the bucket, TRANSFER included.
 *  - A soft delete applies the negative delta at delete time; a restore re-applies the positive one.
 *    Rows are never deleted, only zeroed — a zeroed row is reused on the next write.
 *  - `shard` is the §1.8 contention shard and is ALWAYS the last index field, so a prefix range
 *    returns every shard and readers sum in JS. `ROLLUP_SHARD_COUNT = 1` in v1, so every read below
 *    returns exactly one row per bucket.
 *  - The migration does NOT fire the trigger. Rollups are built once at the end by the SAME
 *    ROLLUP_REBUILD job that runs as the nightly repair, so the safety net is exercised on day one.
 */

/** Calendar month grid, timeline section headers, arbitrary-period totals (salary cycle). */
export const ledgerDayRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  dayKey: v.number(), // 20260824
  shard: v.number(),
  /** Redundant with dayKey, but it lets the rebuild walk a month with no integer math. */
  monthKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  // (a) Calendar's previous/current/next mounted-grid union: one bounded dayKey range -> event dots
  //     AND each day's subtotal in <=126*S documents. Legacy computed the dots with an O(n^2)
  //     moment().isSame() scan over every item in the ledger (`02` S5).
  // (b) Timeline section headers, by the EXACT dayKey extent of the loaded item page (§4.4).
  // (c) Arbitrary period totals (급여일 cycle, "last 30 days") -> <=62 documents, which is why
  //     monthKey never has to become period-relative.
  .index('by_ledgerId_dayKey_shard', ['ledgerId', 'dayKey', 'shard']);

/** Month header, running balance, the 12-month totals bar. */
export const ledgerMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(), // 202608
  shard: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
  /**
   * THE DIRTY BIT. Set by the repair job when it verified this bucket against source; CLEARED (set
   * to undefined) by every delta write. `.eq('repairedAt', undefined)` on `by_repairedAt` is
   * therefore the EXACT dirty set with no scan and no second index, and `.gte(0)` ascending is the
   * slow background re-verification queue. This is what makes §6.2's repair cron bounded and
   * auditable rather than a full sweep of every (ledger, month) pair in the deployment.
   */
  repairedAt: v.optional(v.number()),
})
  // (a) Month header tile: `.eq(ledgerId).eq(monthKey)` -> 1 document.
  // (b) BALANCE-BEFORE (the cold half, §4.5): `.eq(ledgerId).lt('monthKey', M)` -> <=120 documents,
  //     and its read set EXCLUDES the current month, so it does not re-run on today's expense.
  .index('by_ledgerId_monthKey_shard', ['ledgerId', 'monthKey', 'shard'])
  // Repair cron, deployment-wide. INTERNAL ONLY — never reachable from a user query.
  .index('by_repairedAt', ['repairedAt']);

/** Donut + category rows, and the 12-month single-category trend. */
export const ledgerCategoryMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  /** The ledgerCategories `key` slug — a string, matching ledgerItems.categoryKey (§1.4). */
  categoryKey: v.string(),
  shard: v.number(),
  /** Only one of these is ever non-zero for a given categoryKey (a category has one kind). */
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  // THE DONUT: `.eq(ledgerId).eq(monthKey)` -> <=34x shards, summed and sorted by magnitude in JS.
  // Also the writer's upsert probe (`.eq(...).eq(categoryKey).eq(shard).unique()`).
  .index('by_ledgerId_monthKey_categoryKey_shard', [
    'ledgerId',
    'monthKey',
    'categoryKey',
    'shard',
  ])
  // THE 12-MONTH TREND: `.eq(ledgerId).eq(categoryKey).gte(monthKey).lte(monthKey)` -> <=12 rows.
  // The SAME data, the OTHER field order — the index that would be impossible in one merged table.
  .index('by_ledgerId_categoryKey_monthKey_shard', [
    'ledgerId',
    'categoryKey',
    'monthKey',
    'shard',
  ]);
```

### 3.14 `convex/schema/notifications.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {softDelete, timestamps} from './common';
import {localeValidator, platformValidator} from './userProfiles';

/**
 * NOTE WHAT IS NOT IN THIS UNION: there is no ITEM_CREATED / ITEM_UPDATED / ITEM_DELETED row.
 *
 * The legacy app pushed on every item add/update but kept no inbox at all. Writing an inbox row per
 * member per item would be up to 7 document inserts on the hottest write path and ~700,000
 * notification rows for one 100k-item ledger — the single worst write amplification available in
 * this schema. So:
 *   - the PUSH still fires through the bounded/coalesced workflow in `notifications-push.md`;
 *   - the IN-APP signal is the O(1) timestamp comparison of §4.3, at zero extra writes.
 * Rows are written only for LOW-FREQUENCY, PERSONALLY-ADDRESSED events, all O(1) per event.
 */
export const notificationKindValidator = v.union(
  v.literal('LEDGER_INVITE'),
  v.literal('JOIN_REQUESTED'),
  v.literal('JOIN_APPROVED'),
  v.literal('JOIN_REJECTED'),
  v.literal('MEMBER_JOINED'),
  v.literal('MEMBER_LEFT'),
  v.literal('MEMBER_REMOVED'),
  v.literal('ROLE_CHANGED'),
  v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('LEDGER_ARCHIVED'),
  v.literal('COMMENT_ADDED'),
  v.literal('LEGACY_CLAIMED'),
  v.literal('ANNOUNCEMENT'),
  v.literal('SYSTEM'),
);

export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,

  /** i18n KEY + params, never a rendered sentence. The inbox must re-render when the user changes
   *  language, and the push body must be rendered in the RECIPIENT's locale, not the sender's —
   *  which is exactly what FightingHows structurally cannot do (`09` §11.2). */
  titleKey: v.string(),
  bodyKey: v.string(),
  /** `*Minor` values are integers and require a sibling `currency` ISO code. */
  params: v.record(v.string(), v.union(v.string(), v.number())),
  /** English rendering, so an unknown key on an old client still shows something. */
  fallbackTitle: v.string(),
  fallbackBody: v.string(),

  /** expo-router deep link, e.g. `/ledger/<id>/item/<id>`. Legacy taps did NOTHING. */
  route: v.optional(v.string()),
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  actorUserId: v.optional(v.id('users')),

  readAt: v.optional(v.number()),
  ...timestamps,
  ...softDelete,
})
  // Inbox list, desc, paginated 20. deletedAt inside the index, so hidden rows are skipped BY it.
  .index('by_userId_deletedAt_createdAt', ['userId', 'deletedAt', 'createdAt'])
  // Unread badge: triple-eq, `.take(UNREAD_COUNT_LIMIT = 50)`, rendered "50+". `deletedAt` sits
  // BEFORE `readAt` so an inbox full of read rows is skipped by the index rather than walked and
  // discarded by a post-filter (`09` §3.1).
  .index('by_userId_deletedAt_readAt', ['userId', 'deletedAt', 'readAt'])
  // Ledger-delete cascade.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt']);

/**
 * Upsert keyed on the TOKEN STRING, not the user: Expo rotates a device's token and a device can be
 * handed to another account, so an existing row is RE-POINTED rather than duplicated (`09` §10.2).
 * HARD delete on sign-out — a retired token must stop matching `by_token`.
 *
 * Legacy `users/{uid}/push_tokens` is NOT migrated: those tokens were minted by an Expo SDK 36
 * module that no longer exists, every install is being replaced by a new build with a new bundle id
 * (`DECISIONS.md` §7), and importing them would seed the table with dead tokens the first send would
 * have to garbage-collect. The `%2E` key encoding (`02` §5) therefore never has to be decoded.
 */
export const pushTokensTable = defineTable({
  userId: v.id('users'),
  token: v.string(), // ExponentPushToken[...]
  platform: platformValidator,
  deviceName: v.optional(v.string()),
  /** Recipient locale at registration, cached so the send action localizes without a profile read
   *  per token. Legacy localized the push in the SENDER's language. */
  locale: localeValidator,
  appVersion: v.optional(v.string()),
  /** Expo returned DeviceNotRegistered — stop sending, keep the row for diagnostics. */
  disabledAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  // Push fan-out/registration guard: `.eq(userId).eq(disabledAt, undefined).take(9)`; at most 8 live.
  .index('by_userId_disabledAt', ['userId', 'disabledAt'])
  // Register / deregister / DeviceNotRegistered receipt handling.
  .index('by_token', ['token']);
```

### 3.15 `convex/schema/uploads.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const uploadPurposeValidator = v.union(
  v.literal('AVATAR'),
  v.literal('ITEM_PHOTO'),
);

/**
 * Convex records no uploader on `_storage` metadata, so a mutation handed a storage id cannot tell a
 * member's own blob from one they guessed (`09` §7). Ownership is first-claim-wins, recorded here,
 * and every delete path checks it. A receipt photo is financial data and a Convex storage URL
 * carries no auth and no expiry, so BooKoo must DELETE blobs, not just references.
 */
export const uploadsTable = defineTable({
  storageId: v.id('_storage'),
  userId: v.id('users'),
  purpose: uploadPurposeValidator,
  /** Set once the blob is attached, so the ledger purge frees its blobs with no scan. */
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  byteSize: v.number(),
  contentType: v.optional(v.string()),
  createdAt: v.number(),
  /** Set by the GC cron once it has confirmed a referrer exists. `.eq(undefined)` is the EXACT
   *  unchecked set — better than a high-water-mark table, which restarts from zero forever. */
  referencedCheckedAt: v.optional(v.number()),
})
  // Protected media lookup, dedupe, and the itemPhotos ownership cross-check.
  .index('by_storageId', ['storageId'])
  // Account deletion: enumerate a user's blobs.
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  // Ledger purge cascade: free every blob of one ledger.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  // Nightly orphan sweep: `.eq('referencedCheckedAt', undefined).take(200)`.
  .index('by_referencedCheckedAt', ['referencedCheckedAt']);
```

### 3.16 `convex/schema/feedback.ts`

```ts
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
```

### 3.16.1 `convex/schema/legalEvents.ts` and `dataExports.ts`

These are the D4 compliance surfaces. `legalEvents` records versioned evidence without collecting IP or a
device fingerprint. `dataExports` is the request state; `dataExportFiles` is one row per protected,
expiring part because Convex HTTP actions have a 20 MiB response limit. Full behavior, redaction rules,
retention, and authenticated download headers are normative in `privacy-and-compliance.md` §§2–5.

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {localeValidator} from './userProfiles';

export const legalEventKindValidator = v.union(
  v.literal('TERMS_ACCEPTED'),
  v.literal('PRIVACY_NOTICE_ACKNOWLEDGED'),
  v.literal('AGE_14_PLUS_ATTESTED'),
  v.literal('OPTIONAL_LOCATION_GRANTED'),
  v.literal('OPTIONAL_LOCATION_WITHDRAWN'),
  v.literal('OPTIONAL_MARKETING_GRANTED'),
  v.literal('OPTIONAL_MARKETING_WITHDRAWN'),
  v.literal('OPTIONAL_COUNTRY_ANALYTICS_GRANTED'),
  v.literal('OPTIONAL_COUNTRY_ANALYTICS_WITHDRAWN'),
);

export const legalEventsTable = defineTable({
  userId: v.id('users'),
  kind: legalEventKindValidator,
  documentVersion: v.string(),
  documentSha256: v.string(),
  locale: localeValidator,
  createdAt: v.number(),
})
  .index('by_userId_kind_createdAt', ['userId', 'kind', 'createdAt'])
  .index('by_createdAt', ['createdAt']);

export const dataExportKindValidator = v.union(
  v.literal('PERSONAL'),
  v.literal('LEDGER'),
);
export const dataExportStateValidator = v.union(
  v.literal('QUEUED'),
  v.literal('RUNNING'),
  v.literal('READY'),
  v.literal('FAILED'),
  v.literal('EXPIRED'),
);

export const dataExportsTable = defineTable({
  requesterUserId: v.id('users'),
  ledgerId: v.optional(v.id('ledgers')),
  kind: dataExportKindValidator,
  state: dataExportStateValidator,
  phase: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  requestedAt: v.number(),
  readyAt: v.optional(v.number()),
  /** Undefined while QUEUED/RUNNING. Set atomically on READY/FAILED to finishedAt + 7 days. */
  expiresAt: v.optional(v.number()),
  failedCode: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_requesterUserId_requestedAt', ['requesterUserId', 'requestedAt'])
  // Exact one-active guard for PERSONAL(undefined ledger) or one specific LEDGER scope.
  .index('by_requesterUserId_kind_ledgerId_state', [
    'requesterUserId',
    'kind',
    'ledgerId',
    'state',
  ])
  .index('by_state_expiresAt', ['state', 'expiresAt'])
  .index('by_ledgerId_requestedAt', ['ledgerId', 'requestedAt']);

export const dataExportFilesTable = defineTable({
  exportId: v.id('dataExports'),
  requesterUserId: v.id('users'),
  order: v.number(),
  fileName: v.string(),
  mediaType: v.string(),
  storageId: v.id('_storage'),
  byteSize: v.number(),
  sha256: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index('by_exportId_order', ['exportId', 'order'])
  .index('by_expiresAt', ['expiresAt']);
```

### 3.17 `convex/schema/appContent.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {softDelete, timestamps} from './common';
import {localeValidator} from './userProfiles';

/**
 * SINGLETON. `singleton` is a literal, so `by_singleton` is a 1-document read that Convex's
 * per-(query, args) cache serves to the ENTIRE user base from one entry (`13` §4.3 rule 4).
 *
 * Explicit typed fields, never a `valueJson: v.string()` key/value table: a parsed string with an
 * asserted type is `v.any()` with extra steps, in a schema whose rule is that `v.any()` is banned.
 * Adding a flag is a one-line schema change.
 */
export const appConfigTable = defineTable({
  singleton: v.literal('CONFIG'),

  minSupportedIosBuild: v.number(),
  minSupportedAndroidBuild: v.number(),
  latestIosVersion: v.string(),
  latestAndroidVersion: v.string(),
  iosStoreUrl: v.string(),
  androidStoreUrl: v.string(),

  maintenanceMode: v.boolean(),
  maintenanceMessageKey: v.optional(v.string()),

  /** Kill switch for the legacy claim flow, so a bad claim can be stopped without a deploy. */
  legacyClaimEnabled: v.boolean(),
  featureInviteLinks: v.boolean(),
  featureBudgets: v.boolean(),
  featureRecurring: v.boolean(),
  featureCsvImport: v.boolean(),
  featureReceiptOcr: v.boolean(),
  featureMultiCurrencyEntry: v.boolean(),

  updatedAt: v.number(),
  updatedByUserId: v.optional(v.id('users')),
})
  // Boot-time force-update / maintenance gate + the feature-flag read. ONE document, one cache entry.
  .index('by_singleton', ['singleton']);

// `app.config` is the public boot projection and omits updatedByUserId. D6's BootGate enforces only a
// live result in this order: maintenance -> below-minimum native build -> normal app. Native values come
// from expo-application; ADMIN writes validate strict SemVer, five-locale keys and canonical HTTPS stores.

export const announcementKindValidator = v.union(
  v.literal('NOTICE'),
  v.literal('FAQ'),
);

/**
 * Legacy shipped 9 announcements and 11 FAQs as HARDCODED i18n keys inside an 87 KB STRINGS.js, so
 * publishing a notice or fixing a typo required an App Store release.
 *
 * `translations` is an ARRAY OF TYPED OBJECTS bounded at 5, not `v.record(v.string(), v.string())`:
 * a record accepts any string key, so a typo'd locale is a silent runtime miss, while the array form
 * is compiler-checked and adding a locale is still a data change.
 */
export const appAnnouncementsTable = defineTable({
  kind: announcementKindValidator,
  /** Stable slug, e.g. 'v3-launch'. Idempotent seeding + the admin editor's upsert. */
  key: v.string(),
  translations: v.array(
    v.object({
      locale: localeValidator,
      /** NOTICE: the headline. FAQ: the question. */
      title: v.string(),
      /** NOTICE: the body. FAQ: the answer. */
      body: v.string(),
    }),
  ),
  sortOrder: v.number(),
  pinned: v.boolean(),
  publishedAt: v.optional(v.number()), // undefined = draft
  expiresAt: v.optional(v.number()),
  /** Audit ownership for the ADMIN-only authoring surface. Optional only for migrated seed rows. */
  createdByUserId: v.optional(v.id('users')),
  updatedByUserId: v.optional(v.id('users')),
  /** e.g. 'ANNOUNCEMENT_TXT_6' — provenance for the STRINGS.js converter. */
  legacyStringKey: v.optional(v.string()),
  ...timestamps,
  ...softDelete,
})
  // Settings -> Announcements / FAQ accordion. `.eq(kind).eq(deletedAt, undefined).take(50)`.
  .index('by_kind_deletedAt_sortOrder', ['kind', 'deletedAt', 'sortOrder'])
  // "Is there anything new since I last looked" + the publish/unpublish admin path.
  .index('by_kind_publishedAt', ['kind', 'publishedAt'])
  .index('by_key', ['key']);
```

`APP_CONTENT_PER_KIND_LIMIT = 50` is enforced by every ADMIN insert/restore. The public reader passes a
minute-bucketed `nowMinute`, takes limit + 1 from `by_kind_deletedAt_sortOrder`, fails on an invariant
breach, and only then narrows that bounded set to published/not-expired rows. NOTICE unread chrome uses
the largest rendered `publishedAt` in device MMKV; it does not add a hot `userProfiles` field.

The D3 operations functions are public only so the authenticated in-app ADMIN route can invoke them:
`content.adminList`, `content.upsert`, `content.setPublication`, `content.softDelete`,
`content.updateConfig`, and `feedback.triage`. Their first statement is `requireAppAdmin`; SUPPORT is not
write authority. Publication requires one non-empty translation for every locale. Announcement edits
write `updatedByUserId`, inserts write both actor fields, app-config edits write its existing updater,
and feedback transitions preserve the original body. Seed rows may omit creator for migration fidelity.

### 3.18 `convex/schema/migration.ts` — staging, droppable after cutover

```ts
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
```

### 3.19 `convex/lib/constants.ts` (the named limits every scan is bounded by)

```ts
// ---- contention ----
export const ROLLUP_SHARD_COUNT = 1; // raise ONLY per the §5.4 threshold

// ---- pagination ----
export const ITEM_PAGE_SIZE = 30; // ~2 phone screens, 1 tablet screen
export const ITEM_PAGE_MORE = 50;
export const COMMENT_PAGE_SIZE = 20;
export const NOTIFICATION_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 30;
export const PHOTO_GALLERY_PAGE_SIZE = 40;
/** THE CEILING (§4.6). Beyond this the timeline switches to month-anchored navigation. */
export const MAX_LIVE_ITEM_PAGES = 8;

// ---- bounded scans (`09` §3 named-limit convention) ----
export const LEDGER_SCAN_LIMIT = 50; // ledgers one account may belong to
export const MEMBER_SCAN_LIMIT = 200;
export const PUSH_RECIPIENT_SCAN_LIMIT = MEMBER_SCAN_LIMIT;
export const PUSH_DEVICE_LIMIT_PER_USER = 8;
export const PUSH_EXPO_BATCH_SIZE = 100;
export const MAX_CATEGORIES_PER_LEDGER = 120;
/** Read one sentinel row so an invariant breach fails instead of truncating the picker. */
export const CATEGORY_SCAN_LIMIT = MAX_CATEGORIES_PER_LEDGER + 1; // 121
export const INVITE_SCAN_LIMIT = 100;
export const ACTIVE_INVITES_PER_LEDGER = 20;
export const JOIN_REQUEST_SCAN_LIMIT = 100;
export const INVITE_REDEMPTION_SCAN_LIMIT = 200;
export const PHOTO_SCAN_LIMIT = 20; // photos per item
/** Three fixed 42-cell Calendar pages; Timeline uses an even smaller <=30-day range. */
export const DAY_ROLLUP_RANGE_LIMIT = 126;
/** Exact maximum rows for a valid range. Automatically scales with the shard escape hatch. */
export const DAY_ROLLUP_SCAN_LIMIT =
  DAY_ROLLUP_RANGE_LIMIT * ROLLUP_SHARD_COUNT;
export const MONTH_ROLLUP_SCAN_LIMIT = 600; // 50 years of monthly buckets
export const CATEGORY_ROLLUP_SCAN_LIMIT = 200; // 120 categories x shards
export const UNREAD_COUNT_LIMIT = 50; // renders "50+"
export const HANDLE_HISTORY_LIMIT = 50;
export const SEARCH_TAKE = 30;
/** Read one extra row so either search mode can report a truncated newest-30 result. */
export const SEARCH_SCAN_LIMIT = SEARCH_TAKE + 1;
export const APP_CONTENT_PER_KIND_LIMIT = 50;
/** paginationOpts.maximumRowsRead for the ONE query with post-index JS narrowing (§7.7). */
export const SPARSE_FILTER_MAX_ROWS_READ = 4000;

// ---- batch sizes ----
export const CASCADE_BATCH = 200; // purge / reassign / rebucket rows per transaction
export const IMPORT_BATCH = 300; // legacy rows per batch mutation
export const ROLLUP_MONTH_SCAN_BATCH = 500; // items per transaction inside a month recompute
export const ROLLUP_REPAIR_BATCH_MONTHS = 500; // dirty (ledger, month) rows per hourly run
export const ROLLUP_VERIFY_BATCH_MONTHS = 100; // clean rows re-verified per hourly run
export const LEGACY_REPARENT_BATCH = 200;
export const PURGE_BATCH = 20;
export const PHOTO_WORKER_BATCH = 200;
export const PHOTO_MAX_ATTEMPTS = 6;
/** Every protected HTTP response must stay below Convex's 20 MiB action limit. */
export const PHOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_THUMB_MAX_BYTES = 1024 * 1024;
export const EXPORT_FILE_MAX_BYTES = 18 * 1024 * 1024;

// ---- throttles and TTLs ----
export const LAST_READ_THROTTLE_MS = 60_000;
export const LAST_SEEN_THROTTLE_MS = 5 * 60_000;
/** POST succeeded but the blob was never attached; long enough for a foreground retry. */
export const UPLOAD_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const DATA_EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MAX_MS = 90 * 24 * 60 * 60 * 1000;
export const JOIN_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const JOIN_REJECT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const ITEM_PURGE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
/** Bounded retention for ambiguous online update retries. */
export const CLIENT_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LEDGER_PURGE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const AUDIT_FEED_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDLE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDLE_RELEASE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const EMAIL_LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_LINK_MAX_ATTEMPTS = 5;

// ---- drift alarm ----
/** A repair disagreement larger than this writes a ROLLUP_DRIFT anomaly instead of silently
 *  patching, so a systematic bug cannot hide behind a self-healing cron. */
export const ROLLUP_DRIFT_ALERT_MINOR = 1;

// asserted by __tests__/constants.test.ts
export const _assertGraceShorterThanRelease: true = (DELETION_GRACE_MS <
  HANDLE_RELEASE_COOLDOWN_MS) as true;
```

### 3.20 Index budget per table

| Table                                  |   indexes | search |  of 32 | Note                                                                                  |
| -------------------------------------- | --------: | -----: | -----: | ------------------------------------------------------------------------------------- |
| `userProfiles`                         |         8 |      1 |      9 | 2 (`by_avatarMigrationState_avatarAttempts`, `by_legacyKey`) are dropped post-cutover |
| `userEmails`                           |         3 |      0 |      3 | authoritative set of proved addresses; primary is mirrored to `userProfiles`          |
| `userHandles`                          |         3 |      0 |      3 |                                                                                       |
| `authSupport` (3 tables)               | 3 / 3 / 2 |      0 |     ≤3 |                                                                                       |
| `moderation` (2 tables)                |     2 / 3 |      0 |     ≤3 |                                                                                       |
| `ledgers`                              |         5 |      0 |      5 | no `search_title` — §3.5                                                              |
| `ledgerMembers`                        |         6 |      0 |      6 |                                                                                       |
| `ledgerMemberState`                    |         2 |      0 |      2 |                                                                                       |
| `ledgerInvites`                        |         6 |      0 |      6 |                                                                                       |
| `ledgerInviteRedemptions`              |         2 |      0 |      2 |                                                                                       |
| `ledgerJoinRequests`                   |         5 |      0 |      5 |                                                                                       |
| `ledgerAuditLog`                       |         3 |      0 |      3 |                                                                                       |
| `ledgerCategories`                     |         3 |      0 |      3 |                                                                                       |
| **`ledgerItems`**                      |     **9** |  **1** | **10** | the only unbounded table; durable-create idempotency adds the ninth ordinary index    |
| `itemPhotos`                           |         5 |      0 |      5 |                                                                                       |
| `itemComments`                         |         4 |      0 |      4 | durable-create idempotency                                                            |
| `clientMutationReceipts`               |         3 |      0 |      3 | 30-day update receipts, bounded purge                                                 |
| `ledgerDayRollups`                     |         1 |      0 |      1 |                                                                                       |
| `ledgerMonthRollups`                   |         2 |      0 |      2 |                                                                                       |
| `ledgerCategoryMonthRollups`           |         2 |      0 |      2 |                                                                                       |
| `notifications`                        |         3 |      0 |      3 |                                                                                       |
| `pushTokens`                           |         2 |      0 |      2 |                                                                                       |
| `uploads`                              |         4 |      0 |      4 |                                                                                       |
| `feedback`                             |         3 |      0 |      3 |                                                                                       |
| `appConfig` / `appAnnouncements`       |     1 / 3 |      0 |  1 / 3 |                                                                                       |
| `legalEvents`                          |         2 |      0 |      2 | append-only, compliance-purged                                                        |
| `dataExports` / `dataExportFiles`      |     4 / 2 |      0 |  4 / 2 | seven-day lifecycle; exact requester/kind/ledger/state active guard                   |
| `legacyUsers`                          |         4 |      0 |      4 | droppable                                                                             |
| `legacyInvites`                        |         3 |      0 |      3 | droppable                                                                             |
| `migrationRuns` / `migrationAnomalies` |     1 / 3 |      0 |  1 / 3 | droppable                                                                             |
| `maintenanceJobs`                      |         3 |      0 |      3 |                                                                                       |

Every table is far inside the **32-indexes / 16-fields-per-index** budget (`13` §1.6 — the real limits;
proposal A misquoted them as 9 and 4, which would have wrongly blocked the six-field amount-search index
this schema needs). No index exceeds **6 fields**. Longest index name: **56** of 64 chars. No `_`-prefixed
field is indexed. No document approaches 1 MiB — the largest, a migrated `ledgerItems` row carrying
`legacyRaw`, is < 8 KB. **There is no array field anywhere in the domain schema**: the legacy
`Ledger.items[]` / `members{}` / `picture[]` / `reviews{}` nesting is fully decomposed. The three array
fields that do exist (`legacyUsers.providers`, `.legacyLedgerKeys`, `.authoredLedgerKeys`,
`appAnnouncements.translations`) are bounded and on non-hot tables.

---

## 4. READ PATH — every screen, every query, every index, documents at 100k items

`G` = the membership gate, `requireLedgerMember` → `ledgerMembers.by_ledgerId_userId` `.unique()`,
**1 document**, and it is counted once per ledger-scoped row below.

**"Re-runs / item write"** is the number that actually determines the invoice and the socket traffic
(`13` §9 rule 1: every query _re-run_ is a billed function call). It is the count of subscriptions this
query contributes **per member** when any member enters one expense; multiply by the number of members
with that screen mounted.

| #   | Screen                             | Query                                                                                                                    | Index                                                                                                                                                    | Bound                                                                                                       |                                                  Docs @100k | Grows with                                         |                                           Re-runs / item write |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------: | -------------------------------------------------- | -------------------------------------------------------------: |
| 0   | Cold start                         | `users.me`                                                                                                               | `userProfiles.by_userId`                                                                                                                                 | `.unique()`                                                                                                 |                                                       **1** | —                                                  |                                                              0 |
| 0   |                                    | `app.config`                                                                                                             | `appConfig.by_singleton`                                                                                                                                 | `.unique()`                                                                                                 |                                                       **1** | — (one cache entry for the whole user base)        |                                                              0 |
| 0   |                                    | `notifications.unreadCount`                                                                                              | `notifications.by_userId_deletedAt_readAt`                                                                                                               | `.take(50)`                                                                                                 |                                                     **≤50** | —                                                  |                                                              0 |
| 1   | Ledger switcher (cold)             | `ledgers.listMine`                                                                                                       | `ledgerMembers.by_userId_deletedAt` `.take(50)` + `ledgerMemberState.by_userId_ledgerId` `.take(50)` + `db.get('ledgers', …)`                            | ≤20 ledgers                                                                                                 |                                       20 + 20 + 20 = **60** | # ledgers                                          |                **0** — item writes touch none of this read set |
| 1   | Switcher badge (hot, separate sub) | `ledgers.unseen({targets})`, where targets are `{ledgerId,lastReadAt}[]`                                                 | profile once + `ledgerMembers.by_ledgerId_userId` + `db.get('ledgers')` + `ledgerItems.by_ledgerId_deletedAt_createdAt.order('desc').first()` per target | ≤8 pinned/recent, active ledgers                                                                            |                                            1 + 8×3 = **25** | explicit working set, never account ledger count   |                 1 only when one of those eight ledgers changes |
| 1b  | Pending-request dot                | `ledgers.pendingRequestCounts`                                                                                           | `ledgerJoinRequests.by_ledgerId_status_requestedAt` `.take(1)` per owned ledger                                                                          | ≤20                                                                                                         |                                                     **≤20** | # owned ledgers                                    |                                                              0 |
| 2   | Calendar grid                      | `rollups.daysInRange({ledgerId, fromDayKey, toDayKey})`                                                                  | `ledgerDayRollups.by_ledgerId_dayKey_shard` over the previous/current/next mounted-grid union                                                            | ≤126×S                                                                                                      |                                          **≤126** + G in v1 | mounted civil days, capped                         |                                                              1 |
| 2b  | Month header tile                  | `rollups.month({ledgerId, monthKey})`                                                                                    | `ledgerMonthRollups.by_ledgerId_monthKey_shard`                                                                                                          | `.eq()`                                                                                                     |                                                       **1** | —                                                  |                                                              1 |
| 3   | Selected-day list                  | `items.listByDay({ledgerId, dayKey, paginationOpts})`                                                                    | `ledgerItems.by_ledgerId_deletedAt_dayKey_occurredAt` `.eq(dayKey)` desc                                                                                 | 30/page                                                                                                     |                                                 **≤30** + G | entries that day                                   |                                           1 (only if that day) |
| 3   | Roster sidecar (shared, cached)    | `ledgers.roster({ledgerId})`                                                                                             | member rows + profiles + two exact block-pair reads/member                                                                                               | ≤200                                                                                                        |                       target 8: **≤32**; hard cap 200: ≤800 | # members, capped                                  |                                                              0 |
| 3   | Category sidecar (shared, cached)  | `categories.list({ledgerId})`                                                                                            | `ledgerCategories.by_ledgerId_sortOrder` `.take(121)`, reject sentinel                                                                                   | ≤120 returned                                                                                               |                                          **0 or ≤121 read** | # customs                                          |                                                              0 |
| 4   | Timeline (Tab2)                    | `items.list({ledgerId, paginationOpts})`                                                                                 | `by_ledgerId_deletedAt_dayKey_occurredAt` desc `.paginate(30)`                                                                                           | 30/page                                                                                                     |           page 0 **30**; 8 pages (the §4.6 ceiling) **380** | pages _scrolled_, never table size                 |                                                1 (page 0 only) |
| 4b | Section headers | `rollups.daysByKeys({ledgerId, dayKeys})` — one sidecar (§4.4) | `ledgerDayRollups.by_ledgerId_dayKey_shard`, exact ledger/day | ≤380 keys × S, sentinel per key | ≤30 for first sparse page; ≤380 at window cap, plus G | requested visible days | 1 |
| 5   | Memo search                        | `items.searchMemo({ledgerId, term, type?, categoryKey?, amountMinor?})`                                                  | `ledgerItems.search_memo`                                                                                                                                | `.take(31)`, return relevant 30 + `truncated`                                                               | **≤31** returned, ≤1024 search candidates (Convex hard cap) | —                                                  |                                                              1 |
| 5b  | Exact-amount search                | `items.searchAmount({ledgerId, amountMinor, type?})`                                                                     | `ledgerItems.by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt`; one stream with `type`, two-way `mergedStream` without it                        | `.take(31)`, return newest 30 + `truncated`                                                                 |                                                     **≤31** | same exact amount within the ledger, output capped |                                                              1 |
| 6   | Stats donut                        | `rollups.categoriesOfMonth({ledgerId, monthKey})`                                                                        | `ledgerCategoryMonthRollups.by_ledgerId_monthKey_categoryKey_shard` `.eq(ledgerId).eq(monthKey)`                                                         | ≤120×S                                                                                                      |                                   **≤40** typical, ≤120 cap | # categories used that month                       |                                                              1 |
| 6b  | Balance — cold half                | `rollups.balanceBefore({ledgerId, monthKey})`                                                                            | `ledgerMonthRollups.by_ledgerId_monthKey_shard` `.lt('monthKey', M)` `.take(600)`                                                                        | ≤120×S                                                                                                      |                                                    **≤120** | years of history                                   | **0** — the current month is excluded from the read set (§4.5) |
| 6c  | Balance — hot half                 | reuses `rollups.month` (row 2b)                                                                                          | —                                                                                                                                                        | —                                                                                                           |                                                 **0 extra** | —                                                  |                                                (counted in 2b) |
| 7   | 12-month category trend            | `rollups.categoryTrend({ledgerId, categoryKey, fromMonth, toMonth})`                                                     | `ledgerCategoryMonthRollups.by_ledgerId_categoryKey_monthKey_shard`                                                                                      | 12×S                                                                                                        |                                                     **≤12** | months requested                                   |                                         1 (only that category) |
| 7b  | Trend drill-down list              | `items.listByCategory({ledgerId, categoryKey, fromDayKey, toDayKey, paginationOpts})`                                    | `by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt`                                                                                                    | 30/page                                                                                                     |                                                **≤30/page** | pages scrolled                                     |                                                              1 |
| 8   | Item detail                        | `items.get({itemId})`                                                                                                    | `db.get('ledgerItems', id)`                                                                                                                              | —                                                                                                           |                                                   **1** + G | —                                                  |                                                              0 |
| 8   |                                    | `photos.listByItem({itemId})`                                                                                            | `itemPhotos.by_itemId_deletedAt_order`                                                                                                                   | `.take(20)`                                                                                                 |                                                     **≤20** | photos on the item                                 |                                                              0 |
| 8   |                                    | `comments.list({itemId, paginationOpts})`                                                                                | comments + item/membership gate + profiles/two exact block-pair reads for ≤20 distinct authors                                                           | 20/page                                                                                                     |                                                **≤82/page** | pages scrolled                                     |                                                              0 |
| 9   | Entry add / edit                   | `categories.list` (shared, row 3) + `ledgers.get`                                                                        | `ledgerCategories.by_ledgerId_sortOrder`; `db.get`                                                                                                       | —                                                                                                           |                                                    **≤121** | # customs                                          |                                                              0 |
| 10  | Members screen                     | `members.list({ledgerId})`                                                                                               | live members + profiles + two exact block-pair reads/member (same projection as row 3)                                                                   | `.take(200)`                                                                                                |                       target 8: **≤32**; hard cap 200: ≤800 | # members, capped                                  |                                                              0 |
| 10  |                                    | `invites.listPending({ledgerId})`                                                                                        | `ledgerInvites.by_ledgerId_revokedAt_createdAt` `.eq(revokedAt, undefined)`                                                                              | `.take(100)`                                                                                                |                                               **≤20** (cap) | open links                                         |                                                              0 |
| 10  |                                    | `joinRequests.listPending({ledgerId})`                                                                                   | `ledgerJoinRequests.by_ledgerId_status_requestedAt`                                                                                                      | `.take(100)`                                                                                                |                                                    **≤100** | pending requests                                   |                                                              0 |
| 10b | Ledger settings → Activity         | `audit.list({ledgerId, paginationOpts})`                                                                                 | `ledgerAuditLog.by_ledgerId_createdAt` desc `.paginate(30)`                                                                                              | 30/page                                                                                                     |                                                **≤30/page** | pages scrolled                                     |                                                              0 |
| 11  | My profile                         | `users.me` + `handles.mine`                                                                                              | `userProfiles.by_userId`, `userHandles.by_userId_claimedAt` `.take(50)`                                                                                  | —                                                                                                           |                                                     **≤11** | rename history                                     |                                                              0 |
| 11b | `/@handle`                         | `users.byHandle({handleKey})`                                                                                            | profile + two directional exact block-pair lookups                                                                                                       | —                                                                                                           |                                                      **≤3** | —                                                  |                                                              0 |
| 11c | Handle availability                | `handles.check({handle})`                                                                                                | `userHandles.by_handleKey` `.unique()` (advisory; the mutation re-checks)                                                                                | —                                                                                                           |                                                      **≤1** | —                                                  |                                                              0 |
| 12  | Notification inbox                 | `notifications.list({paginationOpts})`                                                                                   | `notifications.by_userId_deletedAt_createdAt` desc `.paginate(20)`                                                                                       | 20/page                                                                                                     |                                                **≤20/page** | pages scrolled                                     |                                                              0 |
| 13  | Ledger photo gallery               | `photos.listByLedger({ledgerId, paginationOpts})`                                                                        | `itemPhotos.by_ledgerId_deletedAt_createdAt` desc `.paginate(40)`                                                                                        | 40/page                                                                                                     |                                                **≤40/page** | pages scrolled                                     |                                                              0 |
| 14  | Notices / FAQ                      | `content.announcements({kind, nowMinute})`                                                                               | `appAnnouncements.by_kind_deletedAt_sortOrder`                                                                                                           | `.take(APP_CONTENT_PER_KIND_LIMIT + 1)`; invariant-fail above 50, then bounded publication/expiry narrowing |                                                     **≤51** | # live rows per kind, hard-capped at 50            |                                                              0 |
| 15  | My feedback                        | `feedback.mine`                                                                                                          | `feedback.by_userId_createdAt` desc                                                                                                                      | `.take(20)`                                                                                                 |                                                     **≤20** | —                                                  |                                                              0 |
| 16  | Moderation queue                   | `reports.list({status,paginationOpts})`                                                                                  | `contentReports.by_status_createdAt` asc `.paginate(30)`                                                                                                 | 30/page                                                                                                     |                                                **≤30/page** | cases reviewed                                     |                                                              0 |
| 17  | Blocked accounts                   | `blocks.listMine({paginationOpts})`                                                                                      | `userBlocks.by_blockerUserId_createdAt` desc `.paginate(30)` + profiles for those rows                                                                   | 30/page                                                                                                     |                                                **≤60/page** | pages scrolled                                     |                                                              0 |

`rollups.daysInRange` is the single public day-rollup range query. It rejects malformed, reversed, or
greater-than-`DAY_ROLLUP_RANGE_LIMIT` civil-day ranges before reading. The handler takes at most
`DAY_ROLLUP_SCAN_LIMIT + 1` rows, treats the extra row as an invariant failure, and groups every shard
server-side into exactly one `{dayKey, expenseMinor, incomeMinor, itemCount}` result per day. Callers
never receive a partial shard total. Calendar uses the mounted three-page range. Timeline uses
`rollups.daysByKeys` for exact displayed days (§4.4), not this civil-day range: even one sparse or
type-filtered entry page can span years. The discarded `daysOfMonth`/`dayMarkers` aliases are not implemented.

**Every cell in "Grows with" is bounded by something the user can see on screen. Not one is `O(items)`.**

Worst realistic screen — Stats with 10 years of history: `G` 1 + month 1 + donut 40 + balance-before 120
= **162 documents**. Legacy Tab3 read 100,000 and re-derived them on **every render** (`02` S5).

Cold start to first live shell: `users.me` (1) + `ledgers.listMine` (60) = **61 documents**. Geometry-matched
skeletons use only non-sensitive synchronous hints until those live queries arrive; private server data is
never restored from MMKV.

### 4.1 Subscription budget per mounted screen (`13` §4.2 target ≤10)

| Screen                                     | Live subscriptions                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Calendar tab                               | profile 1 + roster 1 + categories 1 + `daysInRange` 1 + `month` 1 + day list 1 = **6**             |
| Timeline tab, 1 page loaded                | profile 1 + roster 1 + categories 1 + `month` 1 + item page 1 + `daysByKeys` 1 + unseen 1 = **7** |
| Timeline tab, 8 pages loaded (the ceiling) | 5 + 8 item pages + 1 day-key sidecar = **14**; bounded by §4.6 |
| Stats tab                                  | profile 1 + categories 1 + donut 1 + `month` 1 + `balanceBefore` 1 + trend 1 = **6**               |
| Item detail                                | item 1 + photos 1 + comments 1 + roster 1 = **4**                                                  |

### 4.2 Sidecar subscriptions instead of joins (P3)

A list query returns **raw rows**. Two small, long-lived, per-screen subscriptions supply every label:

```ts
api.ledgers.roster({ledgerId}); // target 8: 8 members + 8 profiles + <=16 block-pair reads
api.categories.list({ledgerId}); // 0 rows (code defaults) or <=120, one sub
```

Both are kept warm across tab switches by `ConvexQueryCacheProvider` (`13` §7.3) and are shared by every
loaded page. A 30-row page of `ledgerItems` therefore costs **exactly 30 document reads** — no
`loadAuthorMap` inside the list, no `ctx.storage.getUrl()` per row, no category lookup.

The roster projection also carries `blockedRelationship` for the current viewer. It performs the two
directional `userBlocks.by_blockerUserId_blockedUserId` point lookups for each bounded **live** member so
item/member surfaces hide identity consistently without an N+1 screen query. At the target eight members
this is at most 16 additional document hits; at the hard 200-member cap it remains 400 exact reads and one
subscription. An item authored by a former member keeps its complete financial/memo/place record and uses
a generic former-member identity rather than an unbounded profile fallback.

The consequence worth stating: because the item list query does **not** read `userProfiles`, a co-member
renaming themselves or bumping `lastSeenAt` invalidates **nothing** on the timeline. Only the bounded
roster subscription re-runs. (Proposals B and C both call `loadAuthorMap` inside the day list and the
comment thread, which drags `userProfiles` into the hot read set of a 1M-row table's page 0.)

`loadAuthorMap` is still used where the author set is not already the live ledger roster: the comment
thread (≤20 distinct authors) and the moderation console. `comments.list` also performs the two exact
directional block-pair reads per distinct author, so a removed author's comment cannot bypass G36. Its
worst page is 20 comments + item + membership gate + 20 profiles + 40 block rows = **82 documents**.

### 4.3 The three things that look like they need a hot counter, and do not

| Need                                 | Naive design                                                                                                                                                                  | This design                                                                                                                                           |       Docs |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| `lastItemAt` per ledger              | a field on `ledgers` or `ledgerStats`, patched on every insert                                                                                                                | `ledgerItems.by_ledgerId_deletedAt_createdAt` `.order('desc').first()`                                                                                |      **1** |
| lifetime totals / `itemCount`        | fields on `ledgerStats`, patched on every insert                                                                                                                              | `sum(ledgerMonthRollups)` over `.lte(currentMonth)`                                                                                                   |   **≤120** |
| `firstItemDayKey` / `lastItemDayKey` | min/max fields maintained by a delta — **unrepairable**: a delta cannot restore a min after the minimum row is soft-deleted, and neither B's nor C's repair cron touches them | `by_ledgerId_deletedAt_dayKey_occurredAt` `.order('asc').first()` / `.order('desc').first()` — always exact, no drift, no owner needed                | **1 each** |
| unseen-activity badge                | `unreadCount++` on 8 member rows per insert (8 extra writes, 8 contended documents)                                                                                           | `ledgers.unseen` compares newest `createdAt` to an explicit `lastReadAt` for ≤8 pinned/recent active ledgers, after live membership + lifecycle gates | **25 max** |

Net effect: **`ledgers` has zero hot fields and there is no `ledgerStats` table**, so the ledger switcher —
the first screen after launch — never re-renders because somebody typed an expense.

If a numeric "N new" is ever demanded it is a bounded
`by_ledgerId_deletedAt_createdAt` `.gt('createdAt', lastReadAt).take(50)`, rendered "50+".

`ledgers.unseen` rejects duplicate targets and more than eight. The client obtains each watermark and the
pinned/recent order from `ledgers.listMine`, removes archived rows before constructing args, and loads other
visible switcher rows lazily in groups of eight. The server still re-reads the live membership and ledger for
every target, so a stale or malicious argument cannot reveal a deleted/foreign ledger. A forged watermark can
only change the caller's own dot.

### 4.4 The sectioned infinite list, done correctly under sharding

Korean 가계부 lists are day-sectioned with a per-day subtotal. Note `13` §5.2 forbids computing the
subtotal by grouping the loaded page in JS (wrong at a page boundary that splits a day). Proposals A and
C both answered with a **second paginated stream over `ledgerDayRollups`** — which is silently wrong the
moment `ROLLUP_SHARD_COUNT > 1`, because one `dayKey` then occupies several consecutive rows and a page
boundary can split them, rendering a section header with a **partial day subtotal**.

The answer here:

```ts
const items = usePaginatedQuery(
  api.items.list,
  {ledgerId},
  {initialNumItems: ITEM_PAGE_SIZE},
);

// One bounded sidecar across the loaded window, not a calendar range.
const dayKeys = timelineDayKeys(items.results); // unique, sorted, at most 380
const days = useQuery(
  api.rollups.queries.daysByKeys,
  dayKeys.length === 0 ? 'skip' : {ledgerId, dayKeys},
);
```

Why this is exact: each requested day is an equality lookup on
`by_ledgerId_dayKey_shard`, returning every shard for that day. A day split across
item pages retains its true full-day total. No intervening days or entry rows
are scanned. The former assumption that index-consecutive entries imply a
continuous civil-day interval was incorrect, especially with type filters.

The window requests 30 entries initially and seven more pages of 50, so at most
380 distinct day keys are needed. The server validates the key count and each
civil date before reading; each equality read takes `ROLLUP_SHARD_COUNT + 1`
and rejects the sentinel. One sidecar serves the entire window (30 rollups for
one maximally sparse first page; 380 for the largest requested window at S=1).
Reactive insertions can temporarily grow a page: the client keeps all entries
visible but omits totals for overflow days instead of sending an oversized
request or fabricating zero/partial amounts. Calendar's independent 126-day
range limit remains unchanged.

### 4.5 The running balance, split cold/hot

All three proposals computed "balance as of month M" as one range
`ledgerMonthRollups.lte(monthKey, M)` — ≈120 documents. When `M` is the **current** month that read set
**contains the row every item write patches**, so the balance re-reads ~120 documents on every expense
entered by any of 8 members, on every member's device. None of the three noticed.

**Normative rule: the balance is two queries.**

```ts
// COLD. Read set excludes the current month, so an expense today does not touch it.
// Cacheable per (ledgerId, monthKey) and shared across every member of the ledger.
api.rollups.balanceBefore({ledgerId, monthKey}); // .eq(ledgerId).lt('monthKey', M)  -> <=120 docs

// HOT. Already subscribed by the month header; the balance reuses it.
api.rollups.month({ledgerId, monthKey}); // .eq(ledgerId).eq(monthKey)       -> S docs

// client: balance = balanceBefore + (month.incomeMinor - month.expenseMinor)
```

A carried `closingBalanceMinor` on each month row was rejected: it is not delta-maintainable, because
editing a 2019 item would have to rewrite every subsequent month row.

### 4.6 The ceiling on loaded pages

`usePaginatedQuery` **cannot unload off-screen pages** (`13` §2.6), so unbounded `loadMore` is a
subscription leak: scrolling 3 years back at 30/page is 36 live queries, against `13` §4.2's ≤10 target.
None of the three proposals stated a ceiling.

**Normative client contract:**

1. `MAX_LIVE_ITEM_PAGES = 8` (30 + 7×50 = **380 items**, ~13 phone screens).
2. On the `loadMore` that would exceed it, the timeline does **not** load a ninth page. It surfaces a
   month-anchored jump control fed by the ≤120 `ledgerMonthRollups` rows the balance already loaded.
3. Choosing a month re-issues `api.items.list` with `{ledgerId, fromDayKey, toDayKey}` bounded to that
   month. **Changing a non-`paginationOpts` argument resets the whole pagination** (`13` §2.4 point 5),
   which is exactly the desired effect: every old page subscription is dropped in one step.
4. 380 items inside a single month is not reachable for a household ledger; if it ever is, the same reset
   applies at the month boundary.
5. The argument change truthfully renders the fixed-height timeline skeleton until the replacement
   month arrives. The account-keyed, memory-only query cache may keep an *identical* recently unmounted
   query warm, but it never retains stale rows across different month arguments or app restarts.

Deep archival browsing (export, "show me all of 2019") is a **v2 report screen** and is the stated
adoption trigger for `@convex-dev/aggregate` + `convex-helpers/server/pagination` `getPage` (§10).

### 4.7 `pageStatus` — what the client renders during a split

`13` §2.4 point 4: a page whose cursor range accumulates too many rows is split; `SplitRequired` means the
server **truncated** results until the split completes. In a shared ledger, page 0's range is exactly
where every new item lands, so page-0 growth is the normal case, not an edge case.

- `initialNumItems: 30` with ~400-byte rows keeps a page range small; the client splits automatically at
  `splitCursor` when `page.length > initialNumItems * 2`.
- At 8 members × 20 entries/day, page 0 accumulates ~160 rows/day → roughly **5 splits per day**.
- **Render contract:** during `SplitRecommended` / `SplitRequired` the list renders the rows it has plus a
  1-row skeleton strip at the bottom of page 0. It never blanks, never shows a full-screen spinner, and
  never treats a short page as `isDone` — `isDone` is the only end-of-list signal.

---

## 5. WRITE PATH — every mutation, documents written, OCC risk, mitigation

Every mutation routes through the triggers-wrapped `customMutation` (`13` §5.4 / §11 rule 6). Rollup
deltas are applied by a trigger registered on `ledgerItems`, so no mutation can forget them, and a throw
inside the trigger aborts the whole mutation atomically.

```ts
// convex/lib/rollups.ts — the single delta function, called by the ledgerItems trigger
export async function applyItemDelta(
  ctx: MutationCtx,
  doc: Doc<'ledgerItems'>,
  sign: 1 | -1,
): Promise<void> {
  const shard = shardOf(doc.authorId); // pure, no document read (§1.8)
  const expense = doc.type === 'EXPENSE' ? sign * doc.baseAmountMinor : 0;
  const income = doc.type === 'INCOME' ? sign * doc.baseAmountMinor : 0;
  await upsertDay(
    ctx,
    doc.ledgerId,
    doc.dayKey,
    doc.monthKey,
    shard,
    expense,
    income,
    sign,
  );
  await upsertMonth(
    ctx,
    doc.ledgerId,
    doc.monthKey,
    shard,
    expense,
    income,
    sign,
  );
  await upsertCategoryMonth(
    ctx,
    doc.ledgerId,
    doc.monthKey,
    doc.categoryKey,
    shard,
    expense,
    income,
    sign,
  );
}
// upsertMonth ALWAYS writes `repairedAt: undefined` — that is the dirty bit of §6.2.
```

### 5.1 The table

| Mutation                                                                    | Documents written                                                                                                                                                                                                                                                                                                                             | Contended documents                                                                                   | Frequency                                           | OCC risk / mitigation                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`items.create`**                                                          | `ledgerItems` +1 · `ledgerDayRollups` ×1 · `ledgerMonthRollups` ×1 · `ledgerCategoryMonthRollups` ×1 → **4**, then atomically schedules `notifications.sendItemAdded`                                                                                                                                                                         | day(today, shard) · month(current, shard) · categoryMonth(current, category, shard)                   | the hottest path                                    | **The only synchronous OCC surface** — §5.3. `clientRequestId`/hash live on the same item, so durability adds an index but no fifth document; a matching replay returns that row and writes/schedules nothing.                                                                                                                  |
| `items.update` (amount / type / date / category)                            | `ledgerItems` ×1 · up to 2 day rows · up to 2 month rows · up to 2 categoryMonth rows · `clientMutationReceipts` +1 → **≤8**                                                                                                                                                                                                                  | the same buckets, **old and new**                                                                     | moderate                                            | `expectedUpdatedAt` plus monotonic `updatedAt` prevents stale/same-millisecond overwrite. Item/rollup delta and the 30-day receipt commit together; a matching replay writes nothing.                                                                                                                                           |
| `items.update` (memo / place / photos only)                                 | `ledgerItems` ×1 · `clientMutationReceipts` +1 → **2**                                                                                                                                                                                                                                                                                        | none                                                                                                  | moderate                                            | The trigger short-circuits when no rollup-relevant field changed; revision/idempotency checks are unchanged.                                                                                                                                                                                                                    |
| `items.softDelete` / `items.restore`                                        | `ledgerItems` ×1 · 3 rollup rows · `ledgerAuditLog` +1 → **5**                                                                                                                                                                                                                                                                                | same                                                                                                  | low                                                 | Same. A restore also rewrites one entry in each of the 7 item indexes (§7.1).                                                                                                                                                                                                                                                   |
| `items.purge` (cron, > 30 d)                                                | `ledgerItems` −1 · `itemPhotos` −N · `_storage` −2N · `uploads` −2N, batched 200                                                                                                                                                                                                                                                              | none — the rollups were zeroed at soft-delete time                                                    | nightly                                             | none                                                                                                                                                                                                                                                                                                                            |
| `comments.create`                                                           | `itemComments` +1 · `ledgerItems.commentCount` ×1 · optional `notifications` +1 (the item's author only, if not self/muted/blocked either direction) → **≤3** (+ optional scheduled push)                                                                                                                                                     | the parent `ledgerItems` row                                                                          | low                                                 | `clientRequestId`/hash live on the comment; a matching replay changes neither counter nor notification.                                                                                                                                                                                                                         |
| `comments.softDelete`                                                       | `itemComments` ×1 · `ledgerItems.commentCount` ×1 → **2**                                                                                                                                                                                                                                                                                     | parent item                                                                                           | low                                                 | none                                                                                                                                                                                                                                                                                                                            |
| `photos.attach`                                                             | `itemPhotos` +1 · `ledgerItems.photoCount` + `coverPhotoId` ×1 · original + thumbnail `uploads` rows ×2 → **4**                                                                                                                                                                                                                               | parent item                                                                                           | low                                                 | none. It accepts only two already-claimed blobs owned by the caller, inserts the photo row, and attaches both ownership rows atomically. It never calls `getUrl()`.                                                                                                                                                             |
| `photos.detach`                                                             | `itemPhotos` ×1 · `ledgerItems` ×1 · `uploads` −2 · `_storage` −2 → **6**                                                                                                                                                                                                                                                                     | parent item                                                                                           | low                                                 | none                                                                                                                                                                                                                                                                                                                            |
| `files.generateUploadUrl`                                                   | **0 domain documents**                                                                                                                                                                                                                                                                                                                        | none                                                                                                  | low                                                 | Returns only a short-lived URL. For item photos it is gated by `requireLedgerRole(MEMBER)` so a non-member cannot burn storage quota (`09` §7). Convex allocates the storage id only after the HTTP POST.                                                                                                                       |
| `files.claimUpload`                                                         | `uploads` +1 → **1**                                                                                                                                                                                                                                                                                                                          | exact `uploads.by_storageId` key                                                                      | low                                                 | Called immediately with the POST response's `storageId`; verifies `_storage` metadata, size/type limits and first-claim-wins ownership. Original and thumbnail are claimed separately before `photos.attach`.                                                                                                                   |
| `ledgers.create`                                                            | `ledgers` +1 (`memberCount: 1`) · `ledgerMembers` +1 (`role: 'OWNER'`) · `ledgerMemberState` +1 · `ledgerAuditLog` +1 → **4**                                                                                                                                                                                                                 | none                                                                                                  | rare                                                | Asserts the single-OWNER mirror before commit. **Zero `ledgerCategories` rows** — the 34 presets are code (§3.9), so ledger creation is 4 writes, not 38.                                                                                                                                                                       |
| `ledgers.update` (title / desc / colour / policies / empty-ledger currency) | `ledgers` ×1 · audit +1 → **2**                                                                                                                                                                                                                                                                                                               | the `ledgers` document, read by every ledger screen header and every item mutation                    | rare                                                | `baseCurrency` additionally requires OWNER and the indexed zero-live-item `.first()` probe in the same transaction. Other fields require ADMIN. It never collides with `items.create` because that mutation only **reads** `ledgers`; if one appears after the emptiness read, Convex retries and the new item closes the gate. |
| `ledgers.setTimeZone`                                                       | `ledgers` ×1 (`timeZone`, `maintenanceLock: 'TIMEZONE'`) · `maintenanceJobs` +1 · audit +1 → **3**, then a batched `TIMEZONE_REBUCKET` chain re-deriving `dayKey`/`monthKey`/`occurredOffsetMinutes` at 200 rows/transaction, then `ROLLUP_REBUILD`                                                                                           | every item and every rollup row of that ledger                                                        | very rare                                           | **`maintenanceLock` rejects item writes for the duration** — a 2-second lockout is better than a silently wrong `dayKey`. This is the one place where a deterministic lock beats a job-ordering argument.                                                                                                                       |
| `ledgers.confirmCurrency`                                                   | `ledgers` ×1 (`baseCurrency`, `currencyIsAssumed: false`, `maintenanceLock: 'CURRENCY'`) · `maintenanceJobs` +1 · audit +1 → **3**, then a batched `CURRENCY_REBASE` chain **re-deriving `amountMinor` and `baseAmountMinor` from `legacyRealAmount` at the confirmed currency's exponent**, then `ROLLUP_REBUILD`                            | same                                                                                                  | once per migrated ledger                            | Permitted **only** while `currencyIsAssumed === true`; the first confirmation closes the invariant permanently. Re-deriving rather than relabelling is mandatory — see §7.3.                                                                                                                                                    |
| `ledgers.archive` / `restore`                                               | `ledgers` ×1 · audit +1 → **2**                                                                                                                                                                                                                                                                                                               | none                                                                                                  | rare                                                | none                                                                                                                                                                                                                                                                                                                            |
| `ledgers.softDelete`                                                        | `ledgers` ×1 (`deletedAt`, `purgeAfter`) · `ledgerMembers` ×≤200 (`deletedAt`, `endReason: 'LEDGER_DELETED'`) · audit +1 → **≤202, ONE transaction**                                                                                                                                                                                          | none                                                                                                  | very rare                                           | **O(members), not O(items).** Items are untouched; they are unreachable because no query can pass the gate. Restore is the exact inverse. All three proposals cascaded `deletedAt` onto every item — 100k rows × 7 index entries = 700k index writes for one delete, and the same again to undo it.                             |
| `ledgers.purge` (cron, > 30 d)                                              | `LEDGER_PURGE` job: hard-deletes `ledgerItems`, `itemPhotos` (+ blobs), `itemComments`, `clientMutationReceipts`, `ledgerCategories`, all three rollup tables, `ledgerMembers`, `ledgerMemberState`, `ledgerInvites`, `ledgerInviteRedemptions`, `ledgerJoinRequests`, `ledgerAuditLog`, `notifications` at `CASCADE_BATCH = 200`/transaction | none                                                                                                  | very rare                                           | An unbounded cascade must never be one mutation (`09` §9.5). `maintenanceLock: 'DELETING'`.                                                                                                                                                                                                                                     |
| `invites.create`                                                            | `ledgerInvites` +1 · audit +1 → **2** (+ a scheduled email action)                                                                                                                                                                                                                                                                            | the `by_codeHash` range for one 22-char random digest                                                 | low                                                 | Negligible. `role` is clamped to ≤ the creator's rank and never OWNER/ADMIN. Rate-limited.                                                                                                                                                                                                                                      |
| `invites.redeem`                                                            | `ledgerInviteRedemptions` +1 · `ledgerInvites.useCount` ×1 · `ledgerMembers` +1/×1 · `ledgerMemberState` +1 · `ledgers.memberCount` ×1 · `notifications` +1 · audit +1 → **7**                                                                                                                                                                | the invite row · the `ledgers` row                                                                    | low                                                 | Two people redeeming the same link race on `useCount`; Convex retries and the re-run enforces `maxUses` correctly. A **re-tap by the same person is a no-op**, because `by_inviteId_userId` finds the existing redemption first.                                                                                                |
| `invites.revoke`                                                            | `ledgerInvites` ×1 · audit +1 → **2**                                                                                                                                                                                                                                                                                                         | invite row                                                                                            | rare                                                | none                                                                                                                                                                                                                                                                                                                            |
| `invites.removeAllJoinedVia` (leaked-link panic button)                     | `ledgerMembers` ×N · `ledgers.memberCount` ×1 · audit +N, batched 200                                                                                                                                                                                                                                                                         | `ledgers` row                                                                                         | very rare                                           | Batched; `by_joinedViaInviteId` makes N exact.                                                                                                                                                                                                                                                                                  |
| `joinRequests.create` (toggle)                                              | `ledgerJoinRequests` +1/×1 · `notifications` +1 per manager (≤3) · audit +1 → **≤5**                                                                                                                                                                                                                                                          | none                                                                                                  | rare                                                | Duplicate guard is a check-then-insert on `by_ledgerId_userId` — a narrow range. Rate-limited.                                                                                                                                                                                                                                  |
| `joinRequests.decide`                                                       | request ×1 · (on approve: `ledgerMembers` +1 · `ledgerMemberState` +1 · `ledgers.memberCount` ×1) · notification +1 · audit +1 → **≤6**                                                                                                                                                                                                       | `ledgers.memberCount`                                                                                 | rare                                                | Membership changes are a handful per ledger **per year**; contention is theoretical.                                                                                                                                                                                                                                            |
| `members.setRole`                                                           | `ledgerMembers` ×1 · notification +1 · audit +1 → **3**                                                                                                                                                                                                                                                                                       | **that member's gate document** — invalidates **their** queries only                                  | rare                                                | The last-owner guard reads `by_ledgerId_deletedAt_role` `.eq('OWNER')` in the same transaction, so a race cannot produce two owners or zero.                                                                                                                                                                                    |
| `members.remove` / `members.leave`                                          | `ledgerMembers` ×1 · `ledgers.memberCount` ×1 · notification +1 · audit +1 → **4**                                                                                                                                                                                                                                                            | `ledgers.memberCount`                                                                                 | rare                                                | Items authored by the departing member are **not** deleted — a shared ledger's history must survive its members.                                                                                                                                                                                                                |
| `members.transferOwnership`                                                 | 2× `ledgerMembers` ×1 · `ledgers` ×1 (`ownerId`, `ownershipTransferredFrom*`) · notification +1 · audit +1 → **5**                                                                                                                                                                                                                            | `ledgers` row + 2 gate rows                                                                           | very rare                                           | "Exactly one live OWNER" is asserted in the mutation against `by_ledgerId_deletedAt_role` and re-verified nightly (§6.1).                                                                                                                                                                                                       |
| `memberState.markRead`                                                      | `ledgerMemberState` ×1 → **1**                                                                                                                                                                                                                                                                                                                | own row only                                                                                          | every ledger open, **throttled to 60 s**            | none — **this is the entire reason `ledgerMemberState` is a separate table.** On `ledgerMembers` it would invalidate the auth-gate read set of every query in that ledger, for that member, on every screen open.                                                                                                               |
| `categories.materialize`                                                    | `ledgerCategories` +34 → **34**, once per ledger, only on the first reorder/rename/hide/create                                                                                                                                                                                                                                                | none                                                                                                  | rare                                                | Idempotent (`by_ledgerId_sortOrder` `.first()` guard). Well inside the 16,000-writes limit.                                                                                                                                                                                                                                     |
| `categories.create` / `rename` / `setHidden`                                | materialize (0 or 34) · `ledgerCategories` ×1 · audit +1 → **≤36**                                                                                                                                                                                                                                                                            | the category catalog subscription of that ledger                                                      | rare                                                | Correct invalidation: the picker must update for everyone.                                                                                                                                                                                                                                                                      |
| `categories.archive(reassignTo)`                                            | `ledgerCategories` ×1 · `maintenanceJobs` +1 · audit +1, then `CATEGORY_REASSIGN` batches of 200: per batch, 200 `ledgerItems.categoryKey` patches + a **paired categoryMonth delta** (−from, +to) per distinct (monthKey, shard) touched. The **month and day rollups are untouched** — the month total does not change.                     | the categoryMonth rows of the affected months                                                         | very rare                                           | Idempotent by `(ledgerId, from, cursor)`; the source row carries `reassignJobKey` and cannot be picked while `RUNNING`.                                                                                                                                                                                                         |
| `handles.claim` / `changeHandle`                                            | `userHandles` +1 (+ ×1 release of the old) · `userProfiles` ×1 → **≤3**                                                                                                                                                                                                                                                                       | the `by_handleKey` range **for that exact key**                                                       | once per account, then rate-limited + 30 d cooldown | The intended contention: two claimers of the same handle serialise, the loser's re-run sees the winner's row and throws `HANDLE_TAKEN` (`09` §12.2). Zero contention between _different_ handles.                                                                                                                               |
| `users.updateProfile` (text / preferences)                                  | `userProfiles` ×1 → **1**                                                                                                                                                                                                                                                                                                                     | own profile row — invalidates the target-eight 32-doc roster subscription of every ledger they are in | rare                                                | Acceptable, and it is why list queries do not denormalize a name onto 1M item rows.                                                                                                                                                                                                                                             |
| `users.attachAvatar` / `removeAvatar`                                       | `userProfiles` ×1 · new claimed `uploads` ×1 · old `uploads` −1 · old `_storage` −1 → **≤4**                                                                                                                                                                                                                                                  | own profile row                                                                                       | rare                                                | An avatar is one client-generated 96 px blob, not an original/thumbnail pair: the schema owns one `avatarStorageId`, and `avatarUrl`/`avatarThumbUrl` intentionally resolve to the same URL. Attach verifies the caller's `AVATAR` claim and replaces/deletes the old ownership row and blob atomically.                        |
| `users.touchLastSeen`                                                       | `userPresence` ×1 → **1**                                                                                                                                                                                                                                                                                                                     | own row only                                                                                          | every app focus, **throttled to 5 min**             | none — the reason `userPresence` exists as a separate table.                                                                                                                                                                                                                                                                    |
| `push.registerToken` / `removeToken`                                        | upsert + optional oldest-token disable → **≤2** / delete → **1**                                                                                                                                                                                                                                                                              | exact `by_token` row + current user's `by_userId_disabledAt.take(9)`                                  | per launch / per sign-out                           | Registration preserves at most eight live tokens per user; a ninth disables the least-recently-updated row in the same transaction.                                                                                                                                                                                             |
| `notifications.markRead` / `markAllRead`                                    | ×1 / ×N (`.take(100)` batched)                                                                                                                                                                                                                                                                                                                | own rows                                                                                              | low                                                 | none                                                                                                                                                                                                                                                                                                                            |
| `feedback.send` / `reports.create`                                          | `feedback` / `contentReports` +1 → **1**                                                                                                                                                                                                                                                                                                      | none                                                                                                  | very low                                            | Rate-limited via `@convex-dev/rate-limiter`; reports derive/verify their context server-side.                                                                                                                                                                                                                                   |
| `blocks.create` / `blocks.remove`                                           | `userBlocks` +1 / −1 → **1**                                                                                                                                                                                                                                                                                                                  | exact directional pair                                                                                | very low                                            | Create is idempotent, self-block is rejected, and neither user is notified. Existing ledger rows/totals do not change.                                                                                                                                                                                                          |
| `reports.acknowledge`                                                       | `contentReports` ×1 → **1**                                                                                                                                                                                                                                                                                                                   | exact report                                                                                          | very low                                            | `requireAppAdmin`; oldest-open ops queue, no automatic decision.                                                                                                                                                                                                                                                                |
| `reports.resolve`                                                           | `contentReports` ×1 + one typed remedy: comment + parent counter ≤2, item content ×1, membership removal ≤4, or profile + auth audit ×2                                                                                                                                                                                                       | exact subject/report                                                                                  | very low                                            | Report terminal state and remedy are one transaction; sole OWNER and subject/resolution compatibility are rechecked.                                                                                                                                                                                                            |
| `exports.requestPersonal` / `requestLedger`                                 | `dataExports` +1 · `maintenanceJobs` +1 · ledger export audit +1 → **2/3**                                                                                                                                                                                                                                                                    | one active exact requester/scope range                                                                | very low                                            | Three/account/day; worker pages source with indexes and emits ≤18 MiB protected parts.                                                                                                                                                                                                                                          |
| **`migrate.import*`** (batch, ≤300 rows)                                    | inserts + 1 `migrationRuns` row. **The rollup trigger is NOT fired.**                                                                                                                                                                                                                                                                         | none                                                                                                  | migration only                                      | One million inserts each patching three rollup rows would be one million serialised self-conflicts (`14` §4.6). Rollups are built once at the end by a per-ledger `ROLLUP_REBUILD` — **the same code path as the nightly repair**, so the safety net is exercised on day one.                                                   |
| `migrate.claimLegacyAccount` (scheduled)                                    | `legacyUsers` ×1 · `userProfiles` ×1–2, then batched re-parenting of `ledgerMembers` / `ledgers.ownerId` / `ledgerItems.authorId` / `itemComments.authorId` at 200/batch                                                                                                                                                                      | none                                                                                                  | once per legacy user, ever                          | Re-entrant: guarded by `claimState !== 'unclaimed' → return`, cursor in `legacyUsers.reparentCursor`.                                                                                                                                                                                                                           |
| `cron rollups.repair` (hourly)                                              | recomputes ≤500 dirty (ledger, month) pairs **from source** and writes the computed value                                                                                                                                                                                                                                                     | none                                                                                                  | hourly                                              | Recompute-not-increment ⇒ a double run is harmless. §6.2.                                                                                                                                                                                                                                                                       |
| `cron uploads.sweepOrphans` (6-hourly)                                      | (a) checks claimed rows through `uploads.by_referencedCheckedAt`; (b) cursor-scans `_storage` by creation order and deletes blobs older than `UPLOAD_CLAIM_TTL_MS` with no `uploads.by_storageId` row                                                                                                                                         | none                                                                                                  | 4×/day                                              | The second bounded pass closes the unavoidable crash window between a successful POST and `files.claimUpload`. The job cursor lives in `maintenanceJobs`; no full bucket is read in one transaction.                                                                                                                            |

### 5.2 Documents written per item write, compared

|                         | proposal A |                proposal B | proposal C |    **this schema** |
| ----------------------- | ---------: | ------------------------: | ---------: | -----------------: |
| `items.create`          |          4 | 5 + 0–5 notification rows |          6 |              **4** |
| Hot documents contended |          3 |           4, none sharded |          4 | **3, all sharded** |

### 5.3 Where OCC contention actually arises, and the plan

Convex conflicts when one transaction writes into an index range another transaction read (`13` §2.4,
§3.6). A rollup upsert **reads** its bucket (`.unique()` on the index) then patches it, so two mutations
landing in the same bucket conflict and one is retried internally.

**The three contended documents, ranked:**

1. **`ledgerDayRollups(ledger, today, shard 0)`** — 8 members entering today's expenses hit one row.
   Highest-probability collision by far.
2. **`ledgerMonthRollups(ledger, currentMonth, shard 0)`** — identical write rate, same row.
3. **`ledgerCategoryMonthRollups(ledger, currentMonth, hotCategory, shard 0)`** — same rate, naturally
   split ~5 ways by the categories a household actually uses.

**Why this is fine at launch.** These mutations write 4 tiny documents and do no I/O; they complete in
single-digit milliseconds. Convex retries internally and surfaces a conflict error only when mutations
arrive faster than they complete. A household ledger with 8 members produces on the order of tens of
writes per _hour_.

**Deliberately NOT contended:** `ledgerItems` itself (an insert conflicts only with a transaction that
_read_ the range it lands in, and no mutation reads the item index ranges — only paginated _queries_ do,
and queries never conflict); `ledgers` (no hot field, read-only on the item path); `ledgerMembers` (read
by everything, written almost never — which is why `lastReadAt` is not on it); `userProfiles` (the
heartbeat that would have made it hot lives in `userPresence`).

**Anti-pattern explicitly avoided:** an un-namespaced `@convex-dev/aggregate` keyed on `_creationTime`.
The aggregate README's own corollary is that this "adds every new data point to the same part of the data
structure … therefore all inserts will wait for each other and no mutations can run in parallel"
(`13` §3.2). Strictly worse than rollup rows for every v1 screen.

### 5.4 The shard escape hatch — the exact trigger, committed now

- Reads never `.eq()` the shard, so raising the constant needs **no query change**.
- Writes always `.eq(shardOf(userId))`, so raising it needs **no mutation change**.
- The upgrade is: bump `ROLLUP_SHARD_COUNT` → run `ROLLUP_REBUILD` per ledger → done. **No schema
  migration, no index change, no downtime.** (This is the correction to proposal A, whose _stored_
  `ledgerMembers.rollupShard` made the same bump a no-op requiring a full re-assignment pass.)

**Threshold, stated as a commitment rather than an open question:**

| What             | Value                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard metric | Convex Health write-conflict insight for `items.create` plus Functions p95/p99 and failure rate                                                                                                                                                                                                                     |
| Trigger          | **Any sustained `items.create` write-conflict insight during a release/load window**, or a material p95/p99 regression attributable to retry. The old exact “>0.5% rolling hour” is not claimed at launch: mutation retry counts require an approved log stream/collector, which D6 deliberately does not install.  |
| Action           | `ROLLUP_SHARD_COUNT: 1 → 4`, deploy, then `ROLLUP_REBUILD` every ledger with `rollupVersion < current`                                                                                                                                                                                                              |
| Cost at 4        | Calendar scans at most 504 shard rows instead of 126 and still returns at most 126 summed days; a typical donut reads 160 instead of 40; balance reads 480 instead of 120. Still O(1) in ledger size.                                                                                                               |
| Pre-launch proof | Run the `13` §10.2 workload against a seeded 100k-item ledger with 8 writers and archive the Health/Functions window under ignored release evidence. It must show no sustained write-conflict insight and stay within the mutation latency budget; do not invent a retry percentage the launch tools do not expose. |

### 5.5 Function-call and bandwidth budget at 8 concurrent writers

`13` §9: function calls, not storage, are what bite a reactive ledger app, and every query _re-run_ is a
billed call. Using the "Re-runs / item write" column of §4:

**One expense, 8 members, timeline tab mounted on all 8 devices:**

| Subscription                           |      Re-runs | Docs re-read each |                   Total docs |
| -------------------------------------- | -----------: | ----------------: | ---------------------------: |
| `items.list` page 0                    |            8 |               ≤31 |                          248 |
| `rollups.daysByKeys` (first page only) |            8 |               ≤30 |                          240 |
| `rollups.month`                        |            8 |                 1 |                            8 |
| `ledgers.unseen`                       |            8 |                25 |                          200 |
| `rollups.balanceBefore`                |        **0** |                 — |                            0 |
| `ledgers.listMine`                     |        **0** |                 — |                            0 |
| `ledgers.roster` / `categories.list`   |        **0** |                 — |                            0 |
| **Total**                              | **32 calls** |                   | **≈696 documents ≈ 0.27 MB** |

With the calendar tab also mounted, +16 calls / +250 docs. With the stats tab, +16 / +330.

**Asynchronous item push, per scheduled action:** `claimItemPushRecipients` reads at most 200 live
members + 200 member states + 199 profiles + 398 directional actor/recipient block rows + 1,592 tokens and
patches at most 199 member states. At the realistic eight-member/eight-device ceiling it is ≤93 reads / 7
patches. `lastItemPushAt` means only the first action per `(ledger, recipient, 10 minutes)` sends; the actor,
muted/global-disabled/blocked recipients, and recipient-local quiet hours are removed before token reads.
Expo requests contain at most 100 messages.
See `notifications-push.md` for ticket/receipt retry and `DeviceNotRegistered` handling.

At 8 members × 20 entries/day = 160 writes/day → **≈5,100 function calls/day ≈ 155k/month** for the
busiest imaginable household ledger, against a 1M free / 25M Pro allowance. Bandwidth ≈ 40 MB/day.

**The shape that breaks it is N².** Each of N writing members wakes N subscriptions, so re-runs scale as
(writes/member) × N². At 8 members that is 64×; at 50 members it is 2,500× — a 39× increase.
**Committed mitigation, at > 20 active members in one ledger:** the `ledgers.unseen` badge and
`rollups.daysInRange` move behind a 5-second client-side coalescing window (`useStableQuery` + a debounced
arg), which removes 2 of the 4 hot subscriptions without changing the schema.

Deployment **usage limits must be set before the first public build** (`13` §9) so a runaway subscription
loop cannot produce a surprise invoice.

### 5.6 Index-write cost on the unbounded table

|                             |                    Per insert | 1M-row migrated import |
| --------------------------- | ----------------------------: | ---------------------: |
| `ledgerItems` index entries | **10** (9 indexes + 1 search) |                **10M** |

At `IMPORT_BATCH = 300` rows per batch mutation, 1M rows is ~3,340 batch mutations. The dominant per-batch
cost is index maintenance, not the document writes. Measured throughput target: **≥ 500 rows/second**
end-to-end, i.e. **≈ 35 minutes** for a 1M-item import — which is why the blob copy (hours) is a separate
phase and why the rollups are built once at the end rather than per row.

That table is a **future-growth stress model, not migration sizing**. The production export contains
34,799 item children, of which 34,798 become rows: about 116 P7 batches at 300 rows. It also contains
724 photo records, 1,784 review children (1,783 migrated), 2,184 memberships, 357 invite nodes, 6 join
requests, and 69 feedback rows in 27 MB. The workpool remains for bounded concurrency, retry/backoff, and
terminal per-blob state; no schedule or cutover claim may quote the 1M/100k model as observed volume.

Restoring a soft-deleted item rewrites `deletedAt`, which **moves the row in all 7 index entries
simultaneously**. That is fine for a single restore; it is why the bulk paths are batched at
`CASCADE_BATCH = 200` (200 × 8 = 1,600 index writes per transaction, inside the 16,000 limit) and why
`ledgers.softDelete` does not cascade to items at all (§5.1).

---

## 6. The denormalization register

**Rule: a derived field may not exist unless this table names its writer AND its repair job.** Nothing in
this schema is a min/max aggregate maintained by a delta — those cannot be repaired by a delta and are
what made proposals B's and C's `ledgerStats.firstDayKey` / `lastItemDayKey` permanently wrong after the
first delete of an edge row.

| #   | Derived field                                                           | Owner (the only writer)                                                                                                                                                                   | Repair job                                                                   | Cadence                    | How the repair recomputes                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ledgerDayRollups.{expenseMinor,incomeMinor,itemCount}`                 | `applyItemDelta` trigger on `ledgerItems`                                                                                                                                                 | `ROLLUP_REPAIR` / `ROLLUP_REBUILD`                                           | hourly (dirty) + on demand | Full recompute of one (ledger, month) from `ledgerItems.by_ledgerId_monthKey`; writes shard 0, zeroes other shards                                                                                           |
| 2   | `ledgerMonthRollups.{expenseMinor,incomeMinor,itemCount}`               | same trigger                                                                                                                                                                              | same                                                                         | same                       | same                                                                                                                                                                                                         |
| 3   | `ledgerCategoryMonthRollups.{expenseMinor,incomeMinor,itemCount}`       | same trigger                                                                                                                                                                              | same                                                                         | same                       | same                                                                                                                                                                                                         |
| 4   | `ledgerItems.photoCount` · `coverPhotoId`                               | `photos.attach` / `photos.detach` / `items.purge`                                                                                                                                         | `ITEM_COUNTER_REPAIR`, folded into the **same (ledger, month) sweep** as 1–3 | hourly                     | Recounts `itemPhotos.by_itemId_deletedAt_order` `.take(20)` per item in the month page; `coverPhotoId` = the order-0 live photo id                                                                           |
| 5   | `ledgerItems.commentCount`                                              | `comments.create` / `comments.softDelete` / `items.purge`                                                                                                                                 | same sweep as 4                                                              | hourly                     | Recounts `itemComments.by_itemId_deletedAt_createdAt` `.take(200)`, capped and rendered "99+" above the cap                                                                                                  |
| 6   | `ledgers.memberCount`                                                   | `ledgers.create`, `invites.redeem`, `joinRequests.decide`, `members.remove`, `members.leave`, `invites.removeAllJoinedVia`; each applies the exact live-row delta in the same transaction | `MEMBER_COUNT_REPAIR`                                                        | nightly                    | Counts `ledgerMembers.by_ledgerId_deletedAt_role` `.eq(deletedAt, undefined).take(200)`                                                                                                                      |
| 7   | `ledgers.ownerId` + the single live `OWNER` row                         | `ledgers.create`, `members.transferOwnership`, owner leave/account-deletion paths; each asserts both sides in the same transaction                                                        | `OWNER_INVARIANT_CHECK`                                                      | nightly                    | Asserts exactly one live `role: 'OWNER'` row per ledger via `by_ledgerId_deletedAt_role`; a mismatch writes an `ops` alert and does **not** self-heal (an ownership bug must be looked at, not papered over) |
| 8   | `userProfiles.handle` · `handleKey`                                     | `handles.claim` / `changeHandle` (same mutation as the `userHandles` row)                                                                                                                 | `HANDLE_MIRROR_CHECK`                                                        | nightly                    | Reconciles against `userHandles.by_userId_releasedAt` `.eq(releasedAt, undefined)`; a mismatch is an alert, not a patch                                                                                      |
| 9   | `userProfiles.emailNormalized` · `users.email` · `userEmails.isPrimary` | `setPrimaryEmail` / `applyEmailLink` (one mutation updates all three mirrors)                                                                                                             | `PRIMARY_EMAIL_MIRROR_CHECK`, folded into the nightly user-mirror repair     | nightly                    | Reads `userEmails.by_userId_deletedAt` (≤10), asserts zero-or-one live primary, and verifies both mirrors equal it; a mismatch alerts rather than choosing an address                                        |
| 10  | `ledgerInvites.useCount`                                                | `invites.redeem`                                                                                                                                                                          | `INVITE_USECOUNT_REPAIR`, folded into the invite-expiry cron                 | daily                      | Recounts `ledgerInviteRedemptions.by_inviteId_redeemedAt` `.take(200)`                                                                                                                                       |
| 11  | `userProfiles.avatarUrl` · `avatarThumbUrl`                             | the avatar mutation that attaches the blob; **cleared by the same mutation that deletes it**                                                                                              | `uploads.sweepOrphans`                                                       | 6-hourly                   | Avatar bearer URLs remain profile imagery; receipt photos deliberately have no URL field and use D4's authenticated HTTP action                                                                              |
| 12  | `ledgerItems.baseAmountMinor`                                           | `items.create` / `items.update` (rounded once, frozen)                                                                                                                                    | `CURRENCY_REBASE` — **only** on an explicit owner action                     | on demand                  | Re-derives from `amountMinor` × `fxRateMicros`, or from `legacyRealAmount` for a migrated row (§7.3)                                                                                                         |
| 13  | `ledgerItems.dayKey` · `monthKey` · `occurredOffsetMinutes`             | `items.create` / `items.update` (server-computed from `occurredAt` + `ledgers.timeZone`)                                                                                                  | `TIMEZONE_REBUCKET` — **only** on an explicit owner action                   | on demand                  | Re-derives, then `ROLLUP_REBUILD`                                                                                                                                                                            |
| 14  | `ledgers.rollupVersion`                                                 | the deploy that changes the rollup shape (sets the target); `ROLLUP_REBUILD` (sets the ledger's value)                                                                                    | `ledgers.by_rollupVersion` `.lt(current)` is the backlog query               | on demand                  | —                                                                                                                                                                                                            |

**Not in this register, on purpose:** there is no denormalized author name or avatar on `ledgerItems` or
`ledgerMembers` (a rename would fan out to 1M rows, and a display snapshot on the auth-gate row would make
a rename invalidate every query in the ledger for every member — the bounded target-eight 32-document
roster subscription is strictly cheaper), and no `searchText` composite on `ledgerItems` (§3.10).

### 6.1 The nightly / hourly job inventory (`convex/crons.ts`)

Implemented so far (2026-10-31), each inert until its deployment switch is set:

- `purge soft-deleted` and `purge ledgers`, as
  `internal.maintenance.purge.purgeSoftDeleted` / `purgeDeletedLedgers`, gated by
  `TRASH_PURGE_MODE` (`.notes/design/trash-purge.md`).
- `purge retention` (daily 22:00) as `internal.maintenance.retention.purgeRetention`,
  gated by `RETENTION_PURGE_MODE`. It takes the `purge audit feed` slot below and
  also carries the 180-day notification purge, the `clientMutationReceipts`
  expiry (so it is not folded into `purgeSoftDeleted`) and the 180-day
  `authAudit` / `legalEvents` purge (the newest consent per kind of a live
  account stays), which replaces the three-year auth/legal-evidence purge
  described below.
- `sweep orphan uploads` (6-hourly) as
  `internal.maintenance.retention.sweepOrphanUploads`, gated by `UPLOAD_SWEEP_MODE`:
  the claimed-row pass only. The `_storage` pass described in §5.1/§7.5 is withheld
  because migrated and export blobs have no `uploads` row
  (`.notes/design/retention-purge.md`).

Support records and moderation reports are not purged (owner decision,
`retention-purge.md`). The rest of this inventory is not yet built.

```ts
const crons = cronJobs();
crons.hourly(
  'repair rollups',
  {minuteUTC: 7},
  internal.maintenance.repairRollups,
);
crons.daily(
  'expire join requests',
  {hourUTC: 16},
  internal.joinRequests.expirePending,
);
crons.daily(
  'repair counters',
  {hourUTC: 17},
  internal.maintenance.repairLedgerCounters,
);
crons.daily(
  'purge soft-deleted',
  {hourUTC: 18},
  internal.maintenance.purgeSoftDeleted,
);
crons.daily(
  'purge ledgers',
  {hourUTC: 19},
  internal.maintenance.purgeDeletedLedgers,
);
crons.daily(
  'purge accounts',
  {hourUTC: 20},
  internal.maintenance.purgeDeletedAccounts,
);
crons.daily(
  'expire invites',
  {hourUTC: 21},
  internal.invites.expireAndRepairUseCount,
);
crons.daily(
  'purge audit feed',
  {hourUTC: 22},
  internal.maintenance.purgeAuditFeed,
);
crons.daily(
  'purge stale unverified',
  {hourUTC: 23},
  internal.users.purgeStaleUnverified,
);
crons.interval(
  'sweep orphan uploads',
  {hours: 6},
  internal.uploads.sweepOrphans,
);
crons.interval(
  'copy legacy blobs',
  {minutes: 15},
  internal.migration.enqueueBlobCopies,
);
export default crons;
```

This is the only registration list. `repairLedgerCounters` includes `MEMBER_COUNT_REPAIR`;
`expireAndRepairUseCount` expires/garbage-collects invites and runs `INVITE_USECOUNT_REPAIR`. The auth and
sharing documents specify the handlers but never create their own `cronJobs()` value.
`purgeSoftDeleted` also advances the bounded export-expiry stage: delete expired export blobs, delete
their `dataExportFiles`, delete the corresponding export `maintenanceJobs` row through its derived
`by_jobKey` point lookup, mark the parent `dataExports` row `EXPIRED` as a crash-safe checkpoint, then
hard-delete that parent in the final stage. `EXPIRED` is never retained as permanent history. The same
job first deletes at most `CASCADE_BATCH` expired `clientMutationReceipts.by_expiresAt` rows and carries
its cursor in `maintenanceJobs`; D6 therefore adds no twelfth cron.
`purgeDeletedAccounts` advances
the account deletion pipeline, including any remaining receipts through
`clientMutationReceipts.by_userId_clientRequestId`, then the separate three-year auth/legal-evidence purge
for already-purged profiles unless a documented hold exists. D4/D6 therefore add no twelfth cron and
preserve R4's single static eleven-job registry.

"At most one run of each cron job executes at any moment" (`13` §8.2) — a long repair simply skips the
next tick, which is why every job is cursor-resumable through `maintenanceJobs`.

### 6.2 `ROLLUP_REPAIR` — cost, coverage and drift policy, specified

All three proposals promised a nightly recompute as the thing that makes this much denormalization
defensible, and all three left it as one sentence. Here it is, completely:

**The dirty set is exact and needs no scan.** Every rollup delta writes `repairedAt: undefined` on the
month row. Therefore:

```ts
// dirty: rows written since they were last verified. EXACT, one index range, no filter.
ledgerMonthRollups
  .withIndex('by_repairedAt', (q) => q.eq('repairedAt', undefined))
  .take(ROLLUP_REPAIR_BATCH_MONTHS /* 500 */);

// clean: the slow background re-verification, oldest-verified first.
ledgerMonthRollups
  .withIndex('by_repairedAt', (q) => q.gte('repairedAt', 0))
  .order('asc')
  .take(ROLLUP_VERIFY_BATCH_MONTHS /* 100 */);
```

**Per (ledger, monthKey) recompute:**

1. Paginate `ledgerItems.by_ledgerId_monthKey` `.eq(ledgerId).eq(monthKey)` at
   `ROLLUP_MONTH_SCAN_BATCH = 500` rows per transaction. This index **deliberately omits `deletedAt`** so
   the pass sees soft-deleted rows; they are skipped in JS **while accumulating**, which is legal
   post-index narrowing because the page is bounded by `(ledger, month)`. A 100k-item ledger over 120
   months averages 833 rows/month; a heavy month is ~5,000 = 10 transactions.
2. Accumulate `{expenseMinor, incomeMinor, itemCount}` for the month, per `dayKey`, and per `categoryKey`,
   into `maintenanceJobs.argsJson`; carry the cursor in `maintenanceJobs.cursor`.
3. On the final batch, **write** (not increment) the month row, the ≤31 day rows and the ≤120
   categoryMonth rows for that month, all into shard 0, zeroing any other shard's rows. Stamp
   `repairedAt = now`. Recompute-not-increment is what makes a double run harmless (`13` §5.4).
4. Every nested `ctx.runQuery` / `ctx.runMutation` inside the chain passes
   `transactionLimits: {documentsScanned: 4000, bytesRead: 4 * MiB}` (convex 1.41) so a recompute can
   never eat the parent transaction's 32,000-document budget.

**Coverage arithmetic.** Hourly at 500 dirty months/run = **12,000 dirty (ledger, month) pairs/day**. A
deployment doing 100k item writes/day dirties at most `activeLedgers × 1–2` months per day (writes
concentrate in the current month), i.e. thousands, not hundreds of thousands. The clean-set verification
adds 2,400 pairs/day, so a deployment with 1,000 ledgers × 120 months completes a **full background sweep
every ~50 days** on top of same-hour repair of everything actually written. If the dirty backlog exceeds
`ROLLUP_REPAIR_BATCH_MONTHS` for 6 consecutive runs, an ops alert fires: the write rate has outgrown the
repair rate and the batch size must be raised.

**Drift policy.** If the recomputed value differs from the stored one by more than
`ROLLUP_DRIFT_ALERT_MINOR = 1`, the job writes a `migrationAnomalies` row with
`kind: 'ROLLUP_DRIFT'`, `sourcePath: 'rollup:<ledgerId>:<monthKey>'` and the before/after in
`detailJson`, **then** patches. A self-healing cron that heals silently is a place a systematic bug can
live forever; a self-healing cron that leaves a queryable trail is a safety net.

---

## 7. The normative rules, stated once

### 7.1 Soft delete

1. **The eight `SOFT_DELETE_TABLES` use `deletedAt: v.optional(v.number())`, and every tenant-scoped
   `list` index puts it at field #2**, immediately after the tenant key. Live rows are
   `.eq('deletedAt', undefined)`, so a page of 30 is 30 live rows and the client never over-pages.
   Manifest-classified exact lookups and maintenance indexes are explicit exceptions to index placement,
   not to the field name. `userProfiles.deletedAt` belongs to the separate account-deletion lifecycle and
   is manifest-classified accordingly. `ledgerMembers` uses `deletedAt` + `endReason`, not `removedAt`
   (deviation from `sharing-invites.md` §5.2 stated in §3.6).
2. **Rollups get the negative delta at soft-delete time**, so a soft-deleted item is invisible to both the
   list and the totals atomically, in one mutation. A restore re-applies the positive delta.
3. **Nothing in the BooKoo domain is hard-deleted by a user action.** A shared money log where a co-member
   can silently erase a row is a trust failure. `deletedAt` + `deletedByUserId` + a `ledgerAuditLog` row is
   the product behaviour, and it is also what makes rollup repair auditable.
4. **Hard delete happens only in named lifecycle paths**, all crons/system except credential/token
   revocation: (a) `items.purge` 30 days after `deletedAt`, including its receipt blobs;
   (b) `ledgers.purge` 30 days after `deletedAt`; (c) `uploads.sweepOrphans`; (d) `pushTokens` on sign-out;
   (e) D4 account purge of account-owned comments/receipt/avatar blobs and credentials after recovery; and
   (f) seven-day export expiry. No ordinary content button bypasses soft delete.
5. **`userHandles` rows are never deleted.** `releasedAt` is the anti-impersonation record.
6. **Membership is one row per (ledgerId, userId) forever.** Leaving sets `deletedAt`; rejoining clears it.
   The single-row invariant is what keeps `by_ledgerId_userId` a true unique key and the gate O(1).
7. **A ledger soft-delete does NOT cascade `deletedAt` onto items.** It writes `ledgers.deletedAt` +
   `purgeAfter` and sets `deletedAt` on the ≤200 `ledgerMembers` rows with
   `endReason: 'LEDGER_DELETED'`, in one transaction. Every ledger-scoped query fails the gate, so the
   contents are unreachable. **O(members), not O(items)** — and restore is the exact inverse, one
   transaction. Only the 30-day purge walks the items, and it walks them to delete them anyway.
8. **Restore cost is bounded on purpose.** Patching `deletedAt` back to `undefined` moves the row in **all
   7** `ledgerItems` index entries at once. Every bulk path (purge, reassign, rebucket) is therefore
   batched at `CASCADE_BATCH = 200` rows per transaction (1,600 index writes, inside the 16,000 limit).
9. **Archived ≠ deleted.** `archivedAt` hides a ledger from the switcher and makes it read-only; the data
   is intact and every query still works. The legacy `visible` flag is not modelled at all: it was written
   `true` at creation and **never set to `false` anywhere in the codebase** (`02` §2.1), so it carried
   zero information. A `visible === false` row in the export (possible — the tree was world-writable)
   maps to `archivedAt` and a `LEDGER_NOT_VISIBLE` anomaly.

### 7.2 Timezone and calendar keys

> **THE RULE: a ledger owns exactly one IANA timezone. Every calendar bucket is computed server-side in
> that timezone. Clients never author a bucket key.**

| Field                               | Type                      | Meaning                                                                                                                         |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ledgers.timeZone`                  | `v.string()` IANA         | The authority. Defaults from the creator's device at creation; `'Asia/Seoul'` + `timeZoneIsAssumed: true` for migrated ledgers. |
| `ledgerItems.occurredAt`            | `v.number()` epoch ms UTC | The instant the user picked. The only orderable truth. Timezone-free.                                                           |
| `ledgerItems.dayKey`                | `v.number()` `20260824`   | `occurredAt` rendered in `ledgers.timeZone`. **Derived server-side.**                                                           |
| `ledgerItems.monthKey`              | `v.number()` `202608`     | Same.                                                                                                                           |
| `ledgerItems.occurredOffsetMinutes` | `v.number()`              | The UTC offset in effect in the ledger's tz at `occurredAt`.                                                                    |
| `ledgers.weekStartsOn`              | `v.number()` 0..6         | Ledger-wide, so the calendar grid matches for every member.                                                                     |
| `ledgers.periodStartDay`            | `v.number()` 1..28        | Salary-cycle budgeting. `monthKey` stays **calendar-aligned**; a period total is a ≤62-row `ledgerDayRollups` range.            |

Why the _ledger's_ timezone: a shared 가계부's month total must be the same number for every member, or it
is not a number. `ledgerMonthRollups` is **keyed** on `monthKey`, so two members in KST and PST would
write into different rows that can never be reconciled — the rollup would be correct for nobody.

Why integers and not `'2026-08'` strings: index keys compare numerically, ranges
(`.gte(20260801).lte(20260831)`) are exact and total, and 8 bytes beats a string. Note `06` D9 proposed
strings; **integers win**, because they are the thing being range-scanned.

**Why `dayKey` is index field #3 rather than `occurredAt`:** `dayKey` is a **monotone** function of
`occurredAt` for a fixed timezone, so ordering by `(dayKey, occurredAt)` is _identical_ to ordering by
`occurredAt` — and it lets a single-day lookup be `.eq(dayKey, 20260824)` with **no timezone arithmetic
inside any query and no read of the `ledgers` document to derive millisecond bounds.**

`shared/date.ts` is the pure, isolate-safe implementation imported by both `convex/` and `src/`. It
uses `Intl.DateTimeFormat(..., {timeZone})` for zoned fields and date-fns only for timezone-free calendar
arithmetic; `@date-fns/tz` is not a dependency. Its canonical exports are:

```ts
export type DayKey = number; // 20260824
export type MonthKey = number; // 202608

export function toDayKey(occurredAtMs: number, timeZone: string): DayKey;
export function toMonthKey(occurredAtMs: number, timeZone: string): MonthKey;
export function offsetMinutesAt(occurredAtMs: number, timeZone: string): number;
export function monthDayKeyBounds(monthKey: MonthKey): {
  first: DayKey;
  last: DayKey;
};
export function dayKeyRangeOfPeriod(
  anchorMonthKey: MonthKey,
  periodStartDay: number,
): {from: DayKey; to: DayKey};
export function addMonthsToMonthKey(
  monthKey: MonthKey,
  amount: number,
): MonthKey;
export function wallClockToEpochMs(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour?: number,
  minute?: number,
  second?: number,
): number;

// Calendar component strings <-> database integers. Decoders throw on malformed input.
export function dayKeyToCalendarKey(k: DayKey): string;
export function calendarKeyToDayKey(s: string): DayKey;
export function monthKeyToCalendarKey(k: MonthKey): string;
export function calendarKeyToMonthKey(s: string): MonthKey;
```

**The conversion happens in exactly one place: the query/mutation argument boundary.** Convex functions
take and return **integers**; `src/features/calendar/**` speaks note `03`'s `CalendarDateKey` strings. No
component and no Convex function ever holds both forms of the same value. `test/shared/date.test.ts`
asserts codec failures and round trips, salary-cycle bounds, ordinary and half-hour offsets, month/year
boundaries, and spring/fall DST transitions including `Australia/Lord_Howe`'s 30-minute shift.

**The mutation is the authority.** The client may compute `dayKey`/`monthKey` locally for an optimistic
render — same file, same function — but `items.create` / `items.update` **recompute both** from
`occurredAt` + `ledgers.timeZone` and store the server's values. A client-authored key would write the
delta into the wrong bucket and permanently corrupt the aggregate.

**Changing `ledgers.timeZone`** is an OWNER/ADMIN action that sets `maintenanceLock: 'TIMEZONE'`, **rejects
item writes for the duration**, and schedules `TIMEZONE_REBUCKET` + `ROLLUP_REBUILD` (§5.1). During I1,
verify once in the target deployment that `Intl.DateTimeFormat` honours an arbitrary IANA `timeZone` inside
the Convex isolate: `toDayKey(Date.UTC(2026, 7, 23, 16, 0, 0), 'Asia/Seoul') === 20260824`. R6 chose the
already-tested Intl implementation and rejected a second timezone dependency.

### 7.3 Money

> **THE RULE: money is one integer of minor units plus one ISO-4217 code. Direction is `type`. There is no
> display string in the database.**

1. **`amountMinor` is an INTEGER count of `currency`'s minor units**, asserted with
   `Number.isSafeInteger` on every write. `amountMinor === 0` is rejected;
   `Math.abs(amountMinor) > 1e15` is rejected.
2. **Direction is `type: 'EXPENSE' | 'INCOME' | 'TRANSFER'`, never the sign.** The sign is free for its
   real meaning: a negative `amountMinor` on an `EXPENSE` is a **refund**, on an `INCOME` a **clawback**,
   entered through a dedicated toggle and never by typing a minus. A EUR 20 refund on a EUR 50 grocery
   expense must reduce the groceries bucket to EUR 30, not appear as income.
   _(This is the deliberate departure from all three proposals, which specified "non-negative magnitude".)_
   The legacy belt-and-braces patch — `if (category.category === 0 && realAmount > 0) realAmount = -realAmount`,
   with **no equivalent guard for income** (`02` §6) — becomes unrepresentable.
3. **`ledgers.baseCurrency` is the unit of every rollup row.** A rollup row is **never** a multi-currency
   sum; "spent ¥3,000 + ₩50,000" is meaningless and is never produced.
4. **Every item stores both what was entered and what it contributes**: `amountMinor` + `currency`, and
   `baseAmountMinor` + `baseCurrency`. `baseAmountMinor` is stored **unconditionally** (it equals
   `amountMinor` when the currencies match) so the invariant "`baseAmountMinor` is the number you sum"
   needs no branch in the trigger, the repair cron, the export or any chart. **Rollups sum
   `baseAmountMinor` only.**
5. **`fxRateMicros` is an integer** (`rate × 1_000_000`, base major per 1 quote major), captured at write
   time and **frozen**. A trip ledger's March total must not silently change when the rate moves in
   August. Re-rating is an explicit edit that emits a rollup delta and an audit row. v1 ships
   `currency === baseCurrency` for every row, so `fxRateMicros` is absent everywhere.
6. **`ledgers.baseCurrency` is immutable once the ledger has a non-deleted item.** With zero live items,
   `ledgers.update` may patch it after an indexed emptiness probe and an OWNER check. With items, the
   exactly **one** sanctioned hole is `ledgers.confirmCurrency`, permitted **only while
   `currencyIsAssumed === true`**, which closes the invariant permanently on first use.
7. **Confirming a migrated ledger's currency RE-DERIVES the amounts; it does not relabel them.** The
   `CURRENCY_REBASE` job recomputes, for every item with a `legacyRealAmount`:
   ```
   amountMinor = roundHalfAwayFromZero(Math.abs(legacyRealAmount) * scaleOf(confirmedCurrency))
   baseAmountMinor = amountMinor
   ```
   then runs `ROLLUP_REBUILD`. **Relabelling `currency` while leaving `amountMinor` unchanged is a silent
   100× money bug** whenever the true currency has a non-zero exponent (the migration writes KRW,
   exponent 0, so `amountMinor === abs(realAmount)`; the correct USD value is `realAmount × 100`).
   Rebuilding the rollups afterwards is not optional: without it `baseAmountMinor` and every rollup row
   disagree.
8. **Per-item currency evidence is preserved, and a disagreement is never silently rescaled.**
   `legacyCurrencyEvidence` is parsed **once**, offline, from the shape of the legacy `amount` display
   string (`"₩-12,000"` → KRW, `"-$12.00"` → USD, `"-12.000 Rp"` → IDR). At confirmation, any item whose
   evidence contradicts the confirmed currency is left untouched, flagged `needsReview: true`, and
   recorded as a `CURRENCY_EVIDENCE_MISMATCH` anomaly. **This is the one irreversible money defect that
   no proposal caught**: currency was a device-level `AsyncStorage` setting (`02` §6/§16), a single shared
   ledger could hold rows in three currencies, and the `14` §7.2 per-ledger sum check **still passes**
   when a `$12.00` row is multiplied by ~1,300, because both sides scale identically.
9. **No display string is ever stored.** Formatting happens at render from
   `(amountMinor, currency, viewerLocale)` via `Intl`, with the exponent taken from BooKoo's own 26-entry
   table (Hermes on iOS ignores fraction-digit options, so `Intl` cannot be trusted to supply it). The
   legacy `amount` string survives only in `legacyAmountString` and is **never parsed at runtime**.
10. **The legacy 47-row currency table is not ported.** It contains real errors (`EUR`'s symbol is `$`,
    `ZAR`'s is the literal `"VND"`, `IND` is not an ISO code, `GRD`/`ITL`/`HRK` are dead). Codes come from
    `shared/currency.ts`'s `SUPPORTED_CURRENCIES`; symbols come from `Intl`. Legacy device currencies are
    remapped before use: `IND→INR`, `BRN→BND`, `GRD|ITL|HRK→EUR`, `SVC→USD`.

### 7.4 Categories

1. **Presets are TypeScript, overlays are rows.** `SYSTEM_CATEGORIES` (34 entries) lives in
   `shared/categories.ts`. A ledger has **either zero `ledgerCategories` rows** (and uses the code
   defaults verbatim) **or a complete overlay set**. There is no partial state.
2. **`ledgerItems.categoryKey` is a slug string, not an id** — so an item written against a zero-overlay
   ledger is valid, and archiving then recreating a category does not orphan history.
3. **A preset's label is `t('category.' + key)`, resolved at RENDER time in the viewer's locale**, unless
   the ledger renamed it (`label` set). A translation fix — and `04` §3.1 lists eight bad ones, plus
   `FURNITURE` reading "home appliances" in ko/ja/zh — therefore ships in the app bundle and takes effect
   everywhere at once. The legacy app froze the localized label into the device SQLite row at install and
   never re-translated (`02` §7.1).
4. **`'uncategorized'` is the terminal fallback** and is never offered in the picker. `resolveCategory`
   returns it for any unknown key, and the icon renderer takes a typed cpk-ui `IconName`, not an array index — so
   `CATEGORIES_ICON[iconId]` with no bounds check (`Tab1.tsx:224`, which crashed the list on bad data)
   has no analogue here.
5. **Deleting a category that has entries is not offered.** The UI offers _hide_ (`hiddenAt` — removes it
   from the picker, historical rows keep their name and icon) or _reassign_ (`CATEGORY_REASSIGN`, §5.1).
   Emptiness is an O(1) probe on `by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt` `.first()`.

### 7.5 Blobs

1. **Every blob has an `uploads` row recording its owner**, written at first claim; every delete path
   checks it. Convex records no uploader on `_storage` metadata (`09` §7).
2. **Receipt media is private on every request.** No receipt path calls `ctx.storage.getUrl()`, stores a
   rendered URL, redirects to one, or returns a storage id. List rows carry only `coverPhotoId`/photo id;
   D4's authenticated HTTP action rechecks the active account and current ledger membership before
   returning `ctx.storage.get()` bytes. Avatar URLs remain the explicit profile-image exception.
3. **Two storage ids per photo**: a ~320px thumbnail generated client-side with `expo-image-manipulator`
   before upload, and the original. ~20× less timeline bandwidth, and bandwidth is billed.
4. **The POST response is the first moment a storage id exists.** `generateUploadUrl()` returns only a
   short-lived URL; the POST returns `{storageId}` (the installed Convex 1.45 `StorageWriter` contract).
   The client immediately calls `files.claimUpload`, which inserts the ownership row before any
   `photos.attach`. A crash after POST but before claim is therefore covered by the bounded `_storage`
   system-table pass of `uploads.sweepOrphans`; a claimed-but-unattached blob is covered by
   `uploads.by_referencedCheckedAt`. The impossible `inFlightStorageId-before-POST` fields are removed.
5. **No public migration fallback.** `legacyUrl` is server-only migration input and is cleared after its
   checksum-verified copy. All 724 measured legacy photos need an explicit terminal decision before public
   cutover; the client never renders the Firebase URL.
6. `files.claimUpload` enforces `PHOTO_ORIGINAL_MAX_BYTES = 15 MiB` and
   `PHOTO_THUMB_MAX_BYTES = 1 MiB`, so the authenticated HTTP response remains below Convex's 20 MiB limit.
   Originals are `private, no-store`; thumbnails are private, revalidated within five minutes.
   `PrivateImage` uses Expo Image's `cachePolicy="memory"` for both, so receipt bytes never enter its disk
   cache. Sign-out, account switch, and membership loss still clear Expo Image memory/disk caches and
   in-memory query state defensively.

### 7.6 The `Doc<>` → wire boundary (a schema deliverable, not a function-layer detail)

A schema that ships without a declared projection contract has no structural defence against a
`return page` that leaks a phone number. `convex/lib/serializers.ts` is part of the schema PR:

```ts
export interface PublicMember {
  // <- what a co-member may see
  userId: Id<'users'>;
  handle?: string;
  displayName: string;
  avatarThumbUrl: string | null;
  role: LedgerRole;
  isPlaceholder: boolean;
}
export interface ItemRow {
  /* normal list/detail fields; no legacy* fields, no legacyRaw, no legacyChecksum */
  updatedAt: number;
  /** undefined means never edited after creation. Detail resolves this id through the roster. */
  updatedByUserId?: Id<'users'>;
}
export interface CommentRow {
  /* body, createdAt, authorId — resolved via the roster */
}

export async function loadAuthorMap(
  ctx,
  userIds,
): Promise<Map<string, PublicMember>>;
export function toItemRow(doc: Doc<'ledgerItems'>): ItemRow;
export function toPublicMember(profile, member): PublicMember;
```

**Fields that must never appear in any projection returned to a client**, enforced by a unit test that
walks each projection's key set:

`userProfiles.phone` · `userProfiles.emailNormalized` · `userEmails.emailNormalized` ·
`userEmails.emailRaw` (all email fields except to the account's own owner) ·
`userProfiles.avatarLegacySourcePath` · `appleRefreshTokens.refreshToken` · `emailLinkCodes.codeHash` ·
`pushTokens.token` · `ledgerInvites.codeHash` · `feedback.legacyUserJson` ·
`itemPhotos.storageId` · `itemPhotos.thumbStorageId` · `dataExportFiles.storageId` ·
any `legacy*` field on `ledgerItems` / `itemPhotos` / `itemComments` / `ledgerMembers` ·
`migrationAnomalies.rawJson`.

`PhotoRow` exposes only photo id, order, dimensions, blurhash, timestamps, and safe ownership capabilities.
The client constructs the D4 media path from the photo id and sends its Convex Auth JWT in an Authorization
header; serializers never return a storage/bearer URL.

No notification projection may contain a rendered sentence or formatted amount. It returns i18n keys and
raw `string | number` params; a `*Minor` number is paired with `currency` and formatted by the reader.

Two companion rules, both from real legacy defects: **the invite-by-email flow must never confirm whether
an address has an account** (an enumeration oracle — legacy `inviteUsers` downloaded the _entire_
`bookoo/users` node to any client to find one email, `02` S7), and a missing profile degrades to
`isPlaceholder: true` + "탈퇴한 사용자" rather than throwing — legacy `getMembersInfo` resolved its promise
only when `membersInfo.length === members.length`, so one missing member node hung the screen forever.

### 7.7 `.filter()`, `.collect()`, and read caps

1. **`.filter()` is banned on `ledgerItems`.** Structurally, not just by convention: `deletedAt`, `type`,
   `categoryKey`, `authorId` and `dayKey` are all index components, so there is nothing left to filter.
2. **`maximumRowsRead` is mandatory wherever post-index JS narrowing happens on a paginated query.** After
   §7.1 rule 1, there is exactly **one** such query in the whole app — the multi-select category filter,
   which uses `mergedStream` from `convex-helpers/server/stream` over one index stream per selected
   category:
   ```ts
   const merged = mergedStream(streams, ['dayKey', 'occurredAt']);
   const page = await merged.paginate({
     ...paginationOpts,
     maximumRowsRead: SPARSE_FILTER_MAX_ROWS_READ /* 4000 */,
   });
   // CONTRACT: this page may return fewer than numItems rows; the client keeps paging until isDone.
   ```
3. **`.collect()` is not permitted.** The formerly bounded category call uses
   `.take(CATEGORY_SCAN_LIMIT /* 121 */)` and rejects row 121, so a corrupt overlay cannot silently
   truncate at 120. Push-token fan-out and registration likewise use
   `.take(PUSH_DEVICE_LIMIT_PER_USER + 1)`, and `rollups.daysInRange` uses
   `.take(DAY_ROLLUP_SCAN_LIMIT + 1)`. Everything is `.take(CONST)` or `.paginate()`.
4. **`transactionLimits` is mandatory on every nested `ctx.runQuery` / `ctx.runMutation`** inside a
   maintenance chain (`{documentsScanned: 4000, bytesRead: 4 * MiB}`) — the only way to stop a rollup
   recompute from eating the parent transaction's 32,000-document budget (convex 1.41).
5. **No `Date.now()` inside a query.** `monthKey` / `dayKey` / a coarse hourly `now` are arguments, which
   is also what makes a month view cacheable and shareable across a ledger's members (`13` §4.3 rule 4).

### 7.8 The invariant lint (`scripts/lint-schema.ts`, runs in CI)

Prose rules in a design document are not a maintenance strategy. The script parses application files under
`convex/schema/*.ts` with the TypeScript compiler API. Library-owned `authTables` are excluded: their index
names are not ours to rename.

The script owns a typed policy manifest. Every application table and every index must appear exactly once;
an unclassified addition is a failure, not an implicit exception:

```ts
type IndexKind = 'lookup' | 'list' | 'maintenance';
type LifecycleKind =
  'standardMutable' | 'appendOnly' | 'eventLifecycle' | 'derivedOrCursor';

export const INDEX_POLICY: Record<TableName, Record<string, IndexKind>> = {
  /* exhaustive */
};
export const TABLE_LIFECYCLE: Record<TableName, LifecycleKind> = {
  /* exhaustive */
};
export const SOFT_DELETE_TABLES = new Set<TableName>([
  'userEmails',
  'ledgers',
  'ledgerMembers',
  'ledgerItems',
  'itemPhotos',
  'itemComments',
  'notifications',
  'appAnnouncements',
]);
```

`lookup` is an exact identity/guard probe and need not contain `deletedAt` (for example
`ledgerMembers.by_ledgerId_userId` and `userProfiles.by_userId`). `maintenance` deliberately sees rows
outside a live-list discriminator (for example `ledgerItems.by_ledgerId_monthKey`, which must rebuild from
live and soft-deleted rows). Only a tenant-scoped `list` index on a manifest soft-delete table must put
`deletedAt` second. The index-name grammar from §1.2 still applies to all application index kinds.

Lifecycle checks are policy-aware: `standardMutable` requires `createdAt` and `updatedAt`; `appendOnly`
requires `createdAt` and forbids a fake `updatedAt`; `eventLifecycle` lists its required domain timestamps
(for example `userHandles.claimedAt/releasedAt`); `derivedOrCursor` may carry only `updatedAt` but must be
explicitly classified. `clientMutationReceipts` is `eventLifecycle` with required `createdAt`/`expiresAt`
and no `updatedAt`; its only mutation is bounded hard deletion after expiry. The eight
`SOFT_DELETE_TABLES` must spread the shared `softDelete` object; in particular,
`notifications` gains `deletedByUserId` so dismissal provenance is representable.

The resulting checks are:

| #   | Check                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every **application** index name equals `'by_' + fields.join('_')`; skip `authTables`                                                                               |
| 2   | Every index name ≤ 64 chars; every tuple ≤ 16 fields; ≤ 32 indexes per table                                                                                        |
| 3   | Every index is classified once; every tenant-scoped `list` index on a soft-delete table has `deletedAt` at position 2; lookup/maintenance exemptions are explicit   |
| 4   | Every table whose fields include `legacyKey` declares a `by_legacyKey` index                                                                                        |
| 5   | No index tuple lists `_creationTime`                                                                                                                                |
| 6   | No `v.any()` anywhere under `convex/`                                                                                                                               |
| 7   | Every table is lifecycle-classified once; its standard/append-only/event/derived timestamp contract holds; the eight listed user-visible tables spread `softDelete` |
| 8   | Every timestamp-shaped field name (`*At`) is `v.number()` or `v.optional(v.number())` — never `v.string()`                                                          |
| 9   | No `.filter(` in any file under `convex/` that also mentions `'ledgerItems'`                                                                                        |
| 10  | No `.collect()` call exists under `convex/`; bounded reads use a `LIMIT + 1` sentinel                                                                               |

### 7.9 Verification tiers

`convex-test` alone **cannot** prove any of §4: it enforces no size or time limits, so a `.collect()` that
would blow up in production passes (`13` §10.1).

**Tier 1 — `convex-test` unit tests.** Rollup delta correctness (create / edit across a month boundary /
soft-delete / restore round-trips to exactly zero), the handle-uniqueness race, the permission matrix, the
`ledgerCategories` copy-on-write invariant, and the pure `shared/` modules (`money`, `currency`, `period`,
`username`, `categories`).

**Tier 2 — transaction-metric assertions against an isolated local deployment.** The fixture is
an **I3 deliverable**, not a later discovery:

```ts
// convex/seeds.ts
export const seedLedger = internalMutation({
  args: {
    items: v.number(),
    years: v.number(),
    members: v.number(),
    categories: v.number(),
  },
  // deterministic distribution: items spread uniformly over `years`, 60% into the top 5 categories,
  // authored round-robin across `members`, 5% carrying photos, 3% carrying comments.
});
// npx convex run seeds:seedLedger '{"items":100000,"years":5,"members":8,"categories":40}'
```

```ts
const m = await ctx.meta.getTransactionMetrics();
expect(m.documentsRead).toBeLessThanOrEqual(BUDGET[queryName]);
```

`BUDGET` is taken **column-by-column from §4**. I3 adds the `convex-budgets` CI job: Convex anonymous-agent
mode creates an ephemeral local backend in the runner, seeds deterministic synthetic data, and runs
`test/perf/transactionBudgets.test.ts`. It requires no cloud deployment, secret, or quota, so fork and bot
PRs run the same gate. `scripts/verify-readiness.ts` makes the job, anonymous-local configuration, and both
artefacts mandatory before I3 can be marked DONE. This is the automated guard that catches the regression
class that killed the legacy app. The exact checked `main` commit is the only CI source allowed to deploy
to production, through a separately scoped production key after every required job succeeds.

**Tier 3 — the load test of §5.4**, owned by P1 and run before the first public build. It records the OCC
conflict rate at 8 concurrent writers on one synthetic 100,000-item ledger. Raw logs stay under
`.local/release-evidence/perf/`; the aggregate, secret-free decision is committed as
`docs/perf/loadtest-YYYY-MM-DD.md`. P1 cannot be marked DONE without the driver and dated report.

---

## 8. Migration field map — every legacy field in note `02`'s dictionary

**M** = migrate as-is · **T** = transform · **A** = archive only (a `legacy*` column or `legacyRaw`) ·
**D** = drop (with the justification). **Nothing is dropped without an archive**: every source-bearing
row with a legacy trailer carries its canonical source in `legacyRaw` for the time-limited forensic
window. The two natural-key sidecars are derived from parent rows and do not pretend to own a unique
source node.

`legacyKey` formats — every one is **globally unique**, which is what makes `by_legacyKey` a valid
idempotency key (`14` §6.1: an RTDB push id is unique only within its parent node, so a bare `itemKey`
would eventually make `.unique()` throw):

| Target table                   | `legacyKey`                         | Example                  |
| ------------------------------ | ----------------------------------- | ------------------------ |
| `userProfiles` / `legacyUsers` | `legacyUid`                         | `7Xk2aBcD…`              |
| `ledgers`                      | `{ledgerKey}`                       | `-L9xQ2fT3kZ8aB1cDe`     |
| `ledgerMembers`                | `{ledgerKey}/{uid}`                 | `-L9xQ…/7Xk2aBcD`        |
| `ledgerJoinRequests`           | `{ledgerKey}/{uid}`                 | `-L9xQ…/pQ9r…`           |
| `ledgerInvites`                | `{ledgerKey}/{encodedEmail}`        | `-L9xQ…/hyo%40hyo%2Edev` |
| `ledgerItems`                  | `{ledgerKey}/{itemKey}`             | `-L9xQ…/-M2ab…`          |
| `itemComments`                 | `{ledgerKey}/{itemKey}/{reviewKey}` | `-L9xQ…/-M2ab…/-M9zz…`   |
| `itemPhotos`                   | `{ledgerKey}/{itemKey}/{order}`     | `-L9xQ…/-M2ab…/0`        |
| `feedback`                     | `{opinionPushKey}`                  | `-MabC…`                 |

`ledgerMemberState` and `ledgerCategories` deliberately do not appear: P3 dedupes state by
`by_ledgerId_userId`; P6 dedupes categories by `by_ledgerId_key`. Those natural point keys are globally
unique inside their tenant and are the only P7 exceptions.

### 8.1 Firebase Auth export (`auth-users.safe.json`)

| Legacy field                    |       | Destination                                                                                                                                                                          |
| ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `localId`                       | T     | `legacyUsers.legacyUid`; `userProfiles.legacyUid` (`by_legacyUid`)                                                                                                                   |
| `email`                         | T     | `legacyUsers.emailRaw` **and** `.emailNormalized` (normalization is lossy, so both)                                                                                                  |
| `emailVerified`                 | T     | `legacyUsers.emailVerifiedAt`                                                                                                                                                        |
| `displayName`, `photoUrl`       | T     | `legacyUsers.displayName` / `.photoURL` → `userProfiles.displayName` / `.avatarLegacyUrl`                                                                                            |
| `providerUserInfo[].providerId` | M     | `legacyUsers.providers`                                                                                                                                                              |
| `createdAt`, `lastSignedInAt`   | T     | `legacyUsers.legacyCreatedAt` / `.legacyLastSignInAt`                                                                                                                                |
| `disabled`                      | M     | `legacyUsers.legacyDisabled`                                                                                                                                                         |
| `passwordHash`, `salt`          | **D** | The new app has **no password provider** (`DECISIONS.md` §3): Kakao / Naver / Google / Apple / email-OTP only. Stripped from the dump before it leaves the export machine (`14` D4). |

### 8.2 `bookoo/users/{uid}`

| Legacy path                  |                                  | Destination / justification                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `info.displayName`           | M                                | `userProfiles.displayName`                                                                                                                                                                                                                                                                                                                                                                       |
| `info.email`                 | T                                | `userProfiles.emailNormalized` (+ raw in `legacyUsers.emailRaw`)                                                                                                                                                                                                                                                                                                                                 |
| `info.photoURL`              | T                                | `userProfiles.avatarLegacyUrl`; the Storage object name is `users/{RAW_EMAIL}` (`02` §11.1 — keyed by **email, not uid**, overwritten in place with no versioning) → `avatarLegacySourcePath`, `avatarMigrationState: 'PENDING'`, copied by the same `blobImport` workpool as item photos                                                                                                        |
| `info.statusMsg`             | M                                | `userProfiles.bio`                                                                                                                                                                                                                                                                                                                                                                               |
| `info.tel`                   | M                                | `userProfiles.phone` (PRIVATE — never in a projection, §7.6)                                                                                                                                                                                                                                                                                                                                     |
| `ledgers/{k}` mirror map     | **T (archive) + D (the mirror)** | `legacyUsers.legacyLedgerKeys` — **reconciliation input only.** `ledgers/{k}/members` is authoritative; a key present in the mirror but absent from the members map is almost always a ledger `deleteLedger` removed, so it produces a `DANGLING_MEMBERSHIP_POINTER` anomaly and **no** membership. The mirror itself is replaced by `ledgerMembers.by_userId_deletedAt`, which cannot go stale. |
| `push_tokens/{encodedToken}` | **D**                            | Expo tokens are device- and install-scoped; the legacy app is SDK 36 and every install is being replaced by a new bundle id (`DECISIONS.md` §7). Migrating them would seed the table with dead tokens the first send would garbage-collect. The `%2E` key encoding therefore never has to be decoded.                                                                                            |

**Pass P0.5 (mandatory, before P1).** Union **every uid appearing anywhere** in the dump —
`ledgers/*/owner`, `ledgers/*/members/*`, `ledgers/*/requests/*`, `items/*/writer`, `reviews/*/writer`,
`opinions/*/user.uid` — into `legacyUsers`, marking synthesized rows `synthesizedFromReference: true`,
plus one synthetic `legacyUid: '__unknown__'` row for items whose `writer` is absent entirely. P1 then
mints a placeholder `users` + `userProfiles` row for **every** `legacyUsers` row. This is what makes
`ledgerMembers.userId`, `ledgerItems.authorId` and `itemComments.authorId` safely **required**, and it is
why no legacy row is ever dropped for a missing reference. The importer also mints on demand (idempotent
via `by_legacyUid`) so a uid P0.5 somehow missed still cannot fail a batch.

### 8.3 `bookoo/ledgers/{k}`

| Legacy path              |       | Destination / justification                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `info.title`             | M     | `ledgers.title`                                                                                                                                                                                                                                                                                                                                                                            |
| `info.description`       | M     | `ledgers.description`                                                                                                                                                                                                                                                                                                                                                                      |
| `info.color` (0..5)      | T     | `ledgers.colorKey` (`PINK                                                                                                                                                                                                                                                                                                                                                                  | ORANGE | YELLOW | TEAL | BLUE | PURPLE`). The map is total and lossless, so the integer is not stored; the raw value is in `legacyRaw`. A token, not an index, because dark mode needs two hex values per colour. |
| `info.people`            | **D** | Always written `1`, re-written hardcoded `1` on update, **never read** (`02` §2.2). The real count was `snapshot.child('members').numChildren()`. Zero information. `legacyRaw` only; `ledgers.memberCount` is the real thing.                                                                                                                                                             |
| `owner`                  | T     | `ledgers.ownerId` + `ledgers.legacyOwnerUid`, **and** a `ledgerMembers` row with `role: 'OWNER'`                                                                                                                                                                                                                                                                                           |
| `visible`                | T     | `true` → nothing. `false` (possible; the tree was world-writable) → `archivedAt = legacyCreatedAt` + a `LEDGER_NOT_VISIBLE` anomaly. **Not modelled as a field** (§7.1 rule 9).                                                                                                                                                                                                            |
| `members{}`              | T     | one `ledgerMembers` row each, `role: 'MEMBER'` (owner gets `OWNER`), `joinedVia: 'LEGACY_IMPORT'`                                                                                                                                                                                                                                                                                          |
| `requests{}`             | T     | one `ledgerJoinRequests` row each, `status: 'PENDING'`, `source: 'LEGACY_REQUEST'`, `expiresAt: importAt + 14 d`. Imported as a **real pass**, not dropped: a pending request is a real user expectation and dropping it silently is a data loss the user notices.                                                                                                                         |
| `items{}`                | T     | `ledgerItems` (§8.4)                                                                                                                                                                                                                                                                                                                                                                       |
| _(no `createdAt`)_       | T     | `legacyCreatedAt`, derived from the lexicographically time-ordered push id                                                                                                                                                                                                                                                                                                                 |
| _(no currency anywhere)_ | T     | `baseCurrency` by the §1.9-of-money-doc vote, `currencyIsAssumed: true`, `legacyCurrencySource` recorded                                                                                                                                                                                                                                                                                   |
| _(no timezone anywhere)_ | T     | `timeZone: 'Asia/Seoul'`, `timeZoneIsAssumed: true`. Every legacy `moment().format()` sample shows `+09:00` and Seoul has had no DST since 1988, so a `dayKey` derived from a `+09:00` instant is exactly the day the writer saw. An item whose parsed offset is not `+09:00` is still bucketed in Seoul and flagged `NON_KST_OFFSET` with the original offset in `occurredOffsetMinutes`. |
| _(no write policy)_      | T     | `itemWritePolicy: 'AUTHOR_ONLY'` for **every** migrated ledger, matching legacy `item.writer === uid \|\| ledger.owner === uid`; new ledgers default `ANY_MEMBER`                                                                                                                                                                                                                          |

**Malformed-container arm (measured, before field mapping).** Iterate ledger children by shape, not by
path name. A real ledger must have object `info`, object `members`, and string `owner`. Exactly one of the
1,785 children fails all three checks and contains two item-shaped children instead. It is not coerced
into a title-less ledger, assigned to `__unknown__`, or allowed to throw the run: no tenant relationship
exists to justify those inventions. P2 emits no ledger row; each child is archived as
`ORPHAN_ITEM_NO_LEDGER` with `producedRow: false`. Unknown fields on a valid ledger remain inside that
ledger's canonical `legacyRaw`. The one review-only ghost under a valid ledger is similarly prechecked
before money parsing and archived as one `GHOST_ITEM_ONLY_REVIEWS` item anomaly plus one child-review
anomaly, both `producedRow: false`.

### 8.4 `bookoo/ledgers/{k}/items/{i}` — all 13 fields, 0 dropped without an archive

| Legacy field                         |              | Destination / justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `amount` (string)                    | **T + A**    | `legacyAmountString = typeof amount === 'string' ? amount : undefined`, **never parsed at runtime**. Parsed exactly once offline to derive `legacyCurrencyEvidence` (§7.3 rule 8). The one apparent missing value is on the prechecked ghost and never reaches this transform.                                                                                                                                                                                                                   |
| `realAmount` (number)                | **T + A**    | → `type` + `amountMinor` + `baseAmountMinor`; verbatim in `legacyRealAmount`, a **real column** so `14` §7.2's mandatory per-ledger financial invariant is a runnable Convex query. `kind` rule: `realAmount < 0 → EXPENSE`, `> 0 → INCOME`, `=== 0 → category.category === 1 ? INCOME : EXPENSE` + a `ZERO_AMOUNT` anomaly. Sign wins over `category.category` because sign is what the legacy UI rendered; a disagreement is imported by sign **and** flagged `AMOUNT_SIGN_CATEGORY_MISMATCH`. |
| `memo`                               | M            | `ledgerItems.memo = String(item.memo ?? '')`; 784 valid rows omit it, and search still receives a required string                                                                                                                                                                                                                                                                                                                                                                                |
| `category.category` (0\|1)           | T + A        | tie-break for `type` **only when `realAmount === 0`**, plus a mismatch anomaly signal; verbatim in `legacyCategoryKind`. It exists on only 1,090 of 34,799 measured children.                                                                                                                                                                                                                                                                                                                    |
| `category.iconId` (0..33)            | T + A        | resolves `categoryKey` via `PRESET_BY_LEGACY_ICON_ID`; verbatim in `legacyCategoryIconId`. Out of range → `'uncategorized'` + `CATEGORY_ICON_OUT_OF_RANGE`.                                                                                                                                                                                                                                                                                                                                      |
| `category.txt`                       | T + A        | the ONLY surviving record of a device-local custom category. Matches any of the five locales' preset labels → the preset; otherwise → a recovered `ledgerCategories` CUSTOM row keyed `c_${stableHash(iconId, txt)}` (deterministic ⇒ re-runnable). Verbatim in `legacyCategoryTxt`. Measured worst case: 54 customs, 88 materialized rows including all presets; P6 asserts `<= 120` before writing.                                                                                            |
| `category.showDelBtn`                | **D**        | UI leakage, preserved in `legacyRaw` but never used to classify. The measured export contains both values; preset/custom recovery uses icon id plus normalized five-locale labels.                                                                                                                                                                                                                                                                                                               |
| `category.img` / `category.key`      | **D**        | Deleted before every write by the legacy client; anything that leaked is garbage. `legacyRaw` if present.                                                                                                                                                                                                                                                                                                                                                                                        |
| `selectedDate`                       | T + A        | `occurredAt` / `dayKey` / `monthKey` / `occurredOffsetMinutes`; verbatim in `legacySelectedDate`. Resolution order `selectedDate → created → updated → push-id timestamp`, recorded in `legacyDateSource`. A non-string value (the `Date`-object serialization bug, `02` §8, which made an _edited_ date vanish) is preserved in `legacyRaw` and flagged `SELECTED_DATE_LOST`. A resolved `occurredAt` of `0` **fails the run**.                                                                 |
| `created`                            | T            | `createdAt = parse(created) ?? parse(updated) ?? pushIdToMillis(itemKey)`. All 3,854 valid rows missing `created` have both fallbacks. `Date.now()` is forbidden; an unresolved result fails normalization. `legacyCreatedAt` stays absent when the source field was absent.                                                                                                                                                                                                                     |
| `updated`                            | T            | `updatedAt = parse(updated) ?? createdAt`; `legacyUpdatedAt` stays absent when the source field was absent                                                                                                                                                                                                                                                                                                                                                                                       |
| `writer`                             | T + A        | `authorId` via `legacyUsers.by_legacyUid`; verbatim in `legacyWriterUid`. Legacy set it only when falsy, so it survives edits by other members — that semantic is preserved.                                                                                                                                                                                                                                                                                                                     |
| `location`                           | T + A        | `place: {label, lat, lng, address?, countryCode?}` where `label = street ?? t('common.unknown')`; the full Expo SDK-36 geocode blob in `legacyRaw`. Only `.street` was ever read back (`02` §7.2).                                                                                                                                                                                                                                                                                               |
| `picture[]`                          | **relocate** | one `itemPhotos` row per element + `photoCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reviews{}`                          | **relocate** | one `itemComments` row per child + `commentCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `results`, `pictureDelete`           | **D**        | Transient ImagePicker state, deleted before write. `legacyRaw` if present.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LedgerItem.categories` (model only) | **D**        | Declared in `src/models/LedgerItem.ts`, never written, never read.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| _(computed)_                         | T            | `legacyChecksum` = sha256 of the canonicalized source node (`14` §7.2)                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 8.5 `reviews/{r}`, `picture[]`, `invites`, `opinions`

| Legacy                                                       |       | Destination                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reviews/{r}.text`                                           | M     | `itemComments.body`. The reader explicitly accepts 1,310 object maps and 378 arrays; array indices become string `reviewKey`s and 2 null holes are ignored. Verification records both shape counts and 1,784 non-null children before excluding the ghost's one review.                                                                                                                                                  |
| `reviews/{r}.writer`                                         | T + A | `itemComments.authorId` + `legacyWriterUid`                                                                                                                                                                                                                                                                                                                                                                              |
| `reviews/{r}.date`                                           | T     | `itemComments.createdAt` **and** `legacyCreatedAt`. An **explicit** field — a batch mutation cannot set `_creationTime`, so sorting on it would render a 2019 thread in import order.                                                                                                                                                                                                                                    |
| `reviews/{r}.key` / `.user`                                  | A     | canonicalized into `itemComments.legacyRaw`; positional `.key` is not an RTDB identity. The 399 denormalized user snapshots contain PII and never enter a projection or identity merge. Measured coverage for the 270 users without `info` is zero names and zero avatars, so no P1.5 profile backfill exists.                                                                                                           |
| `picture[i].path`                                            | M     | `itemPhotos.legacyPath`. **Absent on cloud-function-era rows**, which is exactly why legacy `deletePhoto` could never remove them and the bucket has orphans.                                                                                                                                                                                                                                                            |
| `picture[i].url`                                             | M     | `itemPhotos.legacyUrl`. Three shapes in production: `firebasestorage.googleapis.com/…?alt=media&token=`, `storage.googleapis.com/…?GoogleAccessId=` (a ~470-year signed URL), and a `data:` URI. Unparseable → `PHOTO_URL_UNPARSEABLE`.                                                                                                                                                                                  |
| `picture[i].base64`                                          | M     | `itemPhotos.legacyIsBase64`. The worker strips the `data:image/png;base64, ` prefix — **note the space after the comma** — decodes, and uploads.                                                                                                                                                                                                                                                                         |
| _(GCS manifest)_                                             | T     | `itemPhotos.legacySourceMd5`, for byte-level verification. Object names contain **spaces and `+`** (the `${moment()}` template literal renders `"Wed Jan 15 2020 14:30:00 GMT+0900"`), so the worker uses the stored `path`/`url` verbatim and never reconstructs a path.                                                                                                                                                |
| `invites/{ledgerKey}/{encEmail}` (index A)                   | T     | **UNION** with index B into one `ledgerInvites` row (union, not intersection: both legacy `Promise.all` writers were buggy, so either mirror may be missing) + a `legacyInvites` archive row. Classify by `/^-[A-Za-z0-9_-]{19}$/` vs `%40`; decode with **plain `decodeURIComponent`** (the legacy decoder's trailing `.replace('%2E', /\./g)` is a documented no-op). Neither → `INVITE_UNCLASSIFIABLE`, archive only. |
| `invites/{encEmail}/{ledgerKey}` (index B)                   | T     | same row + its own archive row                                                                                                                                                                                                                                                                                                                                                                                           |
| an invite whose email is already a member                    | T     | `legacyInvites.reconciledAs: 'ALREADY_MEMBER'`, **no** `ledgerInvites` row — the documented orphan class                                                                                                                                                                                                                                                                                                                 |
| a converted invite                                           | T     | `ledgerInvites` `{source: 'LEGACY_EMAIL', status via revokedAt/useCount, expiresAt: undefined}`. **Does not auto-join** — §3.7.                                                                                                                                                                                                                                                                                          |
| `opinions/{k}.opinion`                                       | M     | `feedback.body`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `opinions/{k}.user.uid`                                      | T + A | `feedback.userId` via `by_legacyUid` + `feedback.legacyUid`                                                                                                                                                                                                                                                                                                                                                              |
| `opinions/{k}.user.{displayName,email,phoneNumber,photoURL}` | A     | `feedback.legacyUserJson` — the only identity attached to a legacy opinion                                                                                                                                                                                                                                                                                                                                               |
| `opinions/{k}.createdAt` (`'YYYY-MM-DD'`)                    | T + A | `feedback.createdAt` = that date at 00:00 KST, **and** `legacyCreatedAtDate` verbatim, so a fabricated midnight is visibly a derivation                                                                                                                                                                                                                                                                                  |

### 8.6 Device-local state (`02` §14) — not in Firebase, all of it must still be decided

| Key                                             |                           | Destination                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite `categories` (34 stock rows)             | T                         | Re-seeded as `SYSTEM_CATEGORIES` **in code** (§3.9). Zero rows written.                                                                                                                                                                                                                                                                             |
| SQLite `categories` (user-created)              | T                         | **Recovered from item snapshots** into per-ledger `ledgerCategories` CUSTOM rows (§8.4). The only possible recovery, and it upgrades them from device-local-and-invisible to shared.                                                                                                                                                                |
| `LOCALE.lang`                                   | T                         | `userProfiles.locale` (unmigratable — defaults from the device locale at first launch)                                                                                                                                                                                                                                                              |
| `LOCALE.currency`                               | T                         | `userProfiles.preferredCurrency` (+ the per-ledger currency vote of §8.3)                                                                                                                                                                                                                                                                           |
| `LOCALE.unit` / `.currencyLang` / `.display`    | **D**                     | `Intl` derives all three. The legacy table's symbols are wrong (`EUR` → `$`, `ZAR` → `"VND"`).                                                                                                                                                                                                                                                      |
| `LOCKED`, `LOCKED_NUMBER`, `LOCKED_FINGERPRINT` | **D — never server-side** | The app lock is a _device_ control; a server-stored PIN is a liability with no benefit and it must work offline. Moves to `expo-secure-store` with a hashed PIN, lock-on-background and a failed-attempt lockout. Legacy kept the PIN in AsyncStorage in plaintext behind `ENCRYPTION_KEY = 'BOOKOO_LEGENDARY_LEDGER_5897'`, committed to the repo. |
| `switch_new` / `switch_update`                  | T                         | `ledgerMemberState.notifyNewItem` / `.notifyComment` (per ledger) + `userProfiles.pushEnabled` (account master). Server-side at last, so a reinstall keeps the preference and muting one noisy ledger is possible at all.                                                                                                                           |
| `push`                                          | **D**                     | see `push_tokens` above                                                                                                                                                                                                                                                                                                                             |
| `selectedLedgerIndex`                           | T                         | MMKV, keyed by **`Id<'ledgers'>`, not an array index** — the legacy value broke whenever ledger order changed. Server-side ordering is `ledgerMemberState.sortOrder` / `pinnedAt`.                                                                                                                                                                  |
| `email`, `pw`, `token`, `login_type`            | **D**                     | Convex Auth owns the session; `expo-secure-store` holds it.                                                                                                                                                                                                                                                                                         |
| `APP_INSTALLED`, `title`                        | **D**                     | Vestigial.                                                                                                                                                                                                                                                                                                                                          |

### 8.7 Pass order (load-bearing) and the cutover gate

| Pass     | Source                                         | Target                                                            | Mechanism                                                                                        | Batch |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| P0       | `auth-users.safe.json` + `bookoo/users/*/info` | `legacyUsers`                                                     | JSONL import (`_creationTime` settable)                                                          | file  |
| **P0.5** | **every uid referenced anywhere**              | `legacyUsers` (synthesized)                                       | batch mutation                                                                                   | 500   |
| P1       | `legacyUsers`                                  | `users` + `userProfiles` placeholders                             | batch mutation                                                                                   | 500   |
| P2       | `bookoo/ledgers/{k}` root                      | `ledgers`                                                         | batch mutation, resolves `legacyOwnerUid`                                                        | 200   |
| P3       | `ledgers/{k}/members` (**authoritative**)      | `ledgerMembers` + `ledgerMemberState`                             | batch mutation, patches `memberCount` per ledger                                                 | 500   |
| P4       | `ledgers/{k}/requests`                         | `ledgerJoinRequests`                                              | batch mutation                                                                                   | 500   |
| P5       | `bookoo/invites` (both directions)             | `ledgerInvites` + `legacyInvites`                                 | batch mutation, §8.5 algorithm                                                                   | 500   |
| P6       | all items' `category` sub-objects              | `ledgerCategories` (CUSTOM recovery + `materialize` where needed) | batch mutation                                                                                   | 300   |
| P7       | `ledgers/{k}/items/{i}`                        | `ledgerItems`                                                     | batch mutation, **rollup trigger NOT fired**                                                     | 300   |
| P8       | `items[].reviews`                              | `itemComments` + `commentCount`                                   | batch mutation                                                                                   | 500   |
| P9       | `items[].picture[]`                            | `itemPhotos` (`migrationState: 'PENDING'`) + `photoCount`         | batch mutation                                                                                   | 500   |
| P10      | `bookoo/opinions`                              | `feedback`                                                        | batch mutation, resolves optional `legacyUid` to `userId`                                        | 300   |
| P11      | _(computed)_                                   | all three rollup tables                                           | `ROLLUP_REBUILD` per ledger — **the same code path as the nightly repair**                       | 500   |
| P12      | GCS blobs (photos **and** avatars)             | `_storage` + patch `storageId`                                    | `blobImport` workpool on `by_migrationState_attempts` / `by_avatarMigrationState_avatarAttempts` | 200   |
| P13      | —                                              | ownership rescue for `orphan_no_email` sole-member ledgers        | internal mutation                                                                                | —     |

**Measured execution size.** P2 writes 1,784 ledgers; P3 writes 2,184 membership/state pairs; P4 writes
6 requests; P7 writes 34,798 items in about 116 batches; P8 writes 1,783 comments from 1,784 source
children; P9 writes 724 photo rows; and P10 writes 69 feedback rows. P6's largest materialized catalog
is 88 rows. P12 runs before public cutover: the workpool is retained for retry/backoff and terminal-state
accounting, not because the measured dataset needs 100k-photo throughput.

**Cutover gate — all must be green** (`14` §7.4, plus the two items no proposal had):

- [ ] every source-vs-destination count delta is **0**; every whole-table checksum equal
- [ ] the sign-preserving directional sum and absolute-magnitude sum in `migration-plan.md` §9.3 are
      integer-equal per ledger; every lossy-row residual is reported and bounded
- [ ] `migrationAnomalies.by_kind_resolvedAt` `.eq(resolvedAt, undefined)` is empty **or** every remaining kind is explicitly waived, with `waivedByUserId` set
- [ ] `migrationAnomalies.by_producedRow_kind` `.eq(false)` reconciles against the source count of skipped nodes
- [ ] 25/25 stratified spot checks pass
- [ ] source shape report equals **378 review arrays + 1,310 review maps + 2 null holes**; migrated
      destinations equal **1,784 ledgers, 34,798 items, 1,783 comments, 724 photos, 2,184 members**
- [ ] P6's maximum catalog is the measured **88**, never above 120; category reads reject a 121st row
- [ ] **all 724 measured `itemPhotos` have an explicit terminal result before public cutover** —
      `PENDING + FAILED` is exactly zero; every `MISSING` is individually reconciled; no client legacy-URL fallback exists
- [ ] **`userProfiles.avatarMigrationState` PENDING + FAILED is exactly zero** — same terminal gate
- [ ] the password-stripped Firebase Auth export exists and freezes the exact `orphan_no_email` count;
      RTDB's 434 missing usable emails must never be substituted for this provider-derived count
- [ ] a full rehearsal on an isolated local or explicitly approved scratch deployment

**Post-cutover minimization.** `legacyUsers`, `legacyInvites`, `migrationRuns`, `migrationAnomalies`,
migration `maintenanceJobs`, local exports/intermediates, and PII-bearing `legacyRaw`/legacy source URL/
provider snapshots are destroyed once sign-off holds for 90 days, except the smallest row under a dated
preservation hold. Minimal `legacyKey`, checksums, money/date/category evidence, and unclaimed-account
claim keys remain only as long as their documented support/claim purpose requires. D5 forbids an automatic
time-based purge of an unclaimed orphan ledger: `orphanedAt` hides it but does not set `purgeAfter`.
After 24 months the cohort enters documented quarterly purpose review; deletion requires a separate
approved retention change, attempted notice where possible, and proof that no active member or support
claim depends on it. Optional fields permit minimization without a schema rewrite; “permanent” is not a
lawful retention period, and “we could not email them” is not deletion consent.

### 8.8 Migration code home and local-data boundary

M1 implements the exact `scripts/migrate/01-*` through `19-*` inventory in `migration-plan.md`, shared
normalizers/checkpoint/hash/JSONL clients under `scripts/migrate/lib/`, and temporary secret-guarded
backend handlers under `convex/migrate/`. Every writer defaults to dry run; write mode is explicit,
bounded, idempotent and resumable. `scripts/migrate/lib/email.ts` stays byte-identical to
`shared/email.ts`, enforced by `scripts/verify-readiness.ts` as soon as the migration file exists.

The export and **every** intermediate, checkpoint, report, waiver, rollback archive and blob live only
under `.local/migration/**`, which Git and EAS both exclude. No migration command prints an email, phone
number, memo, raw source row/path, provider token or blob URL to stdout; terminal output is limited to
counts, pass ids and redacted anomaly kinds. Password hashes/salts are stripped and securely destroyed
on the export machine before data enters that directory. Local PII and PII-bearing staging fields are
destroyed after 90 days of signed post-cutover verification unless a dated preservation hold documents
the minimum retained fields, purpose, owner and expiry. `operations-and-quality.md` owns credential
rotation and evidence.

---

## 9. Rejected alternatives

| #   | Rejected                                                                                     | Why, in one line                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A `ledgerStats` hot-counter table (B, C)                                                     | Its money fields are a ≤120-row range and its `lastItemAt` is a 1-document probe, while its `firstDayKey`/`lastDayKey` are min/max aggregates a delta cannot repair — so the table adds a document all 8 writers patch **and** an unfixable drift class.                                 |
| 2   | A stored `ledgerMembers.rollupShard` (A)                                                     | It stores the _result_ of `ordinal % COUNT`, so bumping the constant changes nothing until every membership row is re-assigned — exactly the migration it claimed to avoid; `shardOf(userId)` computed inline is correct on a constant bump and costs one fewer document read per write. |
| 3   | A second paginated stream over `ledgerDayRollups` for section headers (A, C)                 | Under any `SHARD_COUNT > 1` a page boundary can split a day's shard rows and render a **partial** day subtotal; a dayKey-range query derived from the item page's own extent is exact and drops a whole pagination stream.                                                               |
| 4   | `amountMinor` as the terminal field of the donut index (B's graft)                           | It is a mutable measure, so every rollup write re-keys a second B-tree on the hot path, and the ordering it provides is silently wrong the moment `SHARD_COUNT > 1`; sorting ≤40 already-loaded rows in JS is free and shard-safe.                                                       |
| 5   | `ledgerItems.searchText = ${memo} ${categoryLabel}` (B)                                      | A category rename or a preset translation fix desynchronises it from the rendered label across 1M rows, and no proposal that shipped it specified a job to rewrite it; indexing `memo` with `categoryKey` as an equality filter field has no drift.                                      |
| 6   | Notification rows for `ITEM_CREATED` / `ITEM_UPDATED` (B)                                    | Up to 7 inserts per expense and ~700k rows for one 100k-item ledger; the push still fires and the in-app signal is an O(1) timestamp comparison.                                                                                                                                         |
| 7   | A per-item `ledgerActivity` feed (C)                                                         | It doubles the hot path's write count and grows as fast as `ledgerItems`; governance goes to the bounded `ledgerAuditLog`, whose `retention` field pre-authorizes a v2 feed without a schema change.                                                                                     |
| 8   | `tags` + `ledgerItems.tagIds` (C)                                                            | A denormalized `usageCount` with no writer and no repair path, indexed as an ordering field so every tagged write invalidates the autocomplete for the whole ledger, plus a self-admittedly temporary array on the 1M-row table.                                                         |
| 9   | `ledgerCategoryStats {useCount, lastUsedAt}` (money-doc §2.5)                                | Preset/custom `sortOrder` is bounded and deterministic; persisting per-user financial recency on device is forbidden, while a server counter would add a fifth hot-path write and drift class.                                                                                           |
| 10  | Seeding 34 `ledgerCategories` rows per ledger (C's D12)                                      | 34 writes per ledger creation and 340 rows for a 10-ledger user, and a preset translation fix would then need a job that walks every ledger; copy-on-write overlays make a new ledger cost 0 category documents and a translation fix a bundle change.                                   |
| 11  | `ledgerItems.categoryId: v.optional(v.id(...))` (B, C)                                       | Optional-for-TRANSFER forces every v1 call site to narrow an `undefined` that cannot occur, and an id breaks the moment a category is archived and recreated; a required `categoryKey` slug with `'uncategorized'` as the terminal fallback has neither problem.                         |
| 12  | One rollup table with a `periodKind` discriminator (`13` §3.3's sketch)                      | The calendar wants "range periodKey, no category", the donut "eq periodKey, range category", the trend "eq category, range periodKey" — three demands no single field order satisfies.                                                                                                   |
| 13  | `@convex-dev/aggregate` in v1                                                                | Every v1 number is a 1–120 document rollup read; a B-tree adds shared internal nodes that serialise concurrent inserts (`13` §3.2) and a corruption mode (dashboard edits bypass triggers) for zero v1 benefit.                                                                          |
| 14  | `@convex-dev/migrations` in v1                                                               | Every batched job here is per-ledger and user-triggered, which `maintenanceJobs` + a `runAfter(0)` chain serves with one cursor store instead of two.                                                                                                                                    |
| 15  | Cascading `deletedAt` onto every item on ledger delete (A, B, C)                             | 100k rows × 10 maintained index entries per delete and the same again to undo it; setting `deletedAt` on the ≤200 membership rows makes the contents unreachable through the gate in one transaction.                                                                                    |
| 16  | `discoverable` + a `search_title` index (A, B, C)                                            | `sharing-invites.md` §3.2 drops public ledger search outright; the deep-link invite replaces it, and B's `discoverable: true` for migrated ledgers would have made every 2019 household ledger _prefix_-searchable — strictly more exposure than legacy's exact-title match.             |
| 17  | Auto-joining migrated `EMAIL` invites (B)                                                    | `deleteInvites` fire-and-forgot three of its four removals, so a revoked invite can still be in the export; resurrecting it as a permanent auto-join grant to a shared financial ledger is where fidelity must lose to consent.                                                          |
| 18  | Fusing invites and join requests into one table                                              | Would force `emailNormalized`, `codeHash`, `inviteeUserId` and `userId` all optional on one row and make every read path check a `direction` field before trusting a value.                                                                                                              |
| 19  | `appConfig.valueJson: v.string()` key/value rows (B)                                         | A parsed string with an asserted type is `v.any()` with extra steps, in a schema whose rule is that `v.any()` is banned; a typed singleton is one document and one cache entry for the whole user base.                                                                                  |
| 20  | `v.record(v.string(), v.string())` for localized content (A)                                 | A record accepts any string key, so a typo'd locale is a silent runtime miss; a bounded array of `{locale, title, body}` is compiler-checked and adding a locale is still a data change.                                                                                                 |
| 21  | `(targetKind: string, fourOptionalIds)` on reports (C)                                       | The compiler cannot reject an impossible combination; a discriminated union of objects is checked at every construction site.                                                                                                                                                            |
| 22  | Optional `authorId` / `userId` with lazy resolution (A, B, `14` §4.5)                        | Pass P0.5 mints a placeholder for every uid seen anywhere, so the FK is always resolvable and the "탈퇴한 사용자" tombstone comes from `isPlaceholder` — same UX, none of the `??` handling at 40 call sites.                                                                            |
| 23  | A cross-ledger `by_authorId_deletedAt_occurredAt` index (A)                                  | It spans ledgers the viewer may not be a member of with no stated gate; the tenant-scoped author index answers the same question and doubles as the claim re-parenting cursor.                                                                                                           |
| 24  | An amount-**range** index on `ledgerItems` (A)                                               | No named v1 screen; exact-amount search is an equality filter field on the search index, and the range index is a `staged: true` addition when "biggest expenses" ships.                                                                                                                 |
| 25  | One level of comment threading (C's D21)                                                     | Legacy had none and a ledger thread is short; threading needs `parentId` **inside** the index tuple or its pages come back short — a one-field, one-`staged` index seam instead.                                                                                                         |
| 26  | `by_a_and_b` index names (`09` §3.1)                                                         | 66 characters on this schema's five-field indexes, against a 64-character limit, and not mechanically derivable from the tuple, so it cannot be lint-checked.                                                                                                                            |
| 27  | `'2026-08'` string period keys (`06` D9)                                                     | Integers compare numerically, range-scan exactly, and are the thing being range-scanned; note `03`'s string `CalendarDateKey` survives on the client, converted at the argument boundary (§7.2).                                                                                         |
| 28  | Non-negative `amountMinor` (A, B, C)                                                         | It makes a refund unrepresentable, so a EUR 20 grocery refund would pollute the income total instead of reducing the groceries bucket.                                                                                                                                                   |
| 29  | A separate `photoMigrations` staging table (A)                                               | Two rows per photo pointing at each other with no stated authority is a drift source; the state machine belongs on `itemPhotos`, which also lets the row exist before the blob is copied.                                                                                                |
| 30  | Fabricating `appVersion: ''` / `buildNumber: 0` / `platform: 'ios'` on imported feedback (A) | Poisons an archive whose only value is fidelity; every environment field is optional and `category` defaults to the honest `'OTHER'`.                                                                                                                                                    |

---

## 10. v2 seams — deliberately not modelled, and the exact change each needs

Every entry below is **additive**: an optional field, a new table, or a `staged: true` index (`13` §1.1
rule 6). None requires changing the type or meaning of a field that exists.

| #   | Deferred feature                                   | Why not now                                                                                                                        | The exact change                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Budgets / envelopes**                            | The hard part — per-(ledger, month, category) totals — **already exists** as `ledgerCategoryMonthRollups`.                         | New table `budgets {ledgerId, monthKey (0 = every month), categoryKey?, amountMinor, rolloverEnabled, alertThresholdPct}` + `by_ledgerId_monthKey_categoryKey`. Progress = one budget row joined to one rollup row. `appConfig.featureBudgets`, `userProfiles.notifyLedgerActivity` and the `SYSTEM` notification kind already exist.                                                                                                                                           |
| 2   | **Recurring transactions** (월세, 구독)            | Purely forward-looking; nothing about the past becomes unknowable.                                                                 | New table `recurrenceRules {ledgerId, templateType, templateAmountMinor, templateCategoryKey, rrule fields, nextRunDayKey, lastMaterializedDayKey, pausedAt}` + `by_nextRunDayKey`. A daily cron materialises due rules into real `ledgerItems`. Add `ledgerItems.recurrenceId: v.optional(v.id('recurrenceRules'))` (free) and `by_ledgerId_deletedAt_recurrenceId` with `staged: true` only if "show me every rent payment" is wanted. **Zero change to any existing field.** |
| 3   | **Accounts / wallets and real transfers**          | v1 has no account concept, so a transfer has no source or destination and the balance definition would become ambiguous.           | `accounts {ledgerId, name, kind: CASH\|BANK\|CARD, currency, openingBalanceMinor, archivedAt}` + optional `ledgerItems.accountId` / `counterAccountId` / `transferGroupId`. **`type: 'TRANSFER'` already exists in the validator** and every rollup delta already excludes it correctly, so no `switch` is re-audited. Adding `transferMinor` to the three rollup tables is the one non-trivial part, and it bumps `ledgers.rollupVersion` + a `ROLLUP_REBUILD`.                |
| 4   | **Split an expense + settle up**                   | Splits are additive rows: an item with no split rows means "the payer bore it all", which is exactly what every v1 row means.      | `itemSplits {itemId, ledgerId, memberUserId, shareMinor, settlementId?}` (`by_itemId`, `by_ledgerId_memberUserId_settlementId`) + `settlements {ledgerId, fromUserId, toUserId, amountMinor, settledAt}`. **`ledgerItems.paidByUserId` ships in v1 and is the anchor** — without it, historical "who owes whom" is a guess about every row entered between the picker shipping and the field existing.                                                                          |
| 5   | **Per-member spending rollups**                    | Recomputable from source at any time, because `authorId` and `paidByUserId` are already stored and already indexed.                | `ledgerMemberMonthRollups {ledgerId, userId, monthKey, shard, expenseMinor, incomeMinor, itemCount}` + `by_ledgerId_userId_monthKey_shard`, backfilled by a `ROLLUP_REBUILD` variant. Until then `by_ledgerId_deletedAt_authorId_dayKey_occurredAt` answers the same question over a bounded page.                                                                                                                                                                              |
| 6   | **Arbitrary-date-range reports / offset jumps**    | Every v1 number is a 1–120 document rollup read.                                                                                   | `@convex-dev/aggregate`, `TableAggregate<{Namespace: Id<'ledgers'>; Key: [monthKey, occurredAt]}>` — **namespaced by ledger, never global, never keyed on `_creationTime`** — plus `convex-helpers/server/pagination` `getPage` for deep archival scroll (the fallback §4.6 defers to). Backfilled with the standard `insertIfDoesNotExist` chain.                                                                                                                              |
| 7   | **Multi-currency entry**                           | v1 has `currency === baseCurrency` for every row.                                                                                  | `fxRates {base, quote, dayKey, rateMicros, source, fetchedAt}` + `by_base_quote_dayKey`, populated by a daily cron action. **`ledgerItems.currency` / `baseCurrency` / `baseAmountMinor` / `fxRateMicros` / `fxAt` / `fxSource` all ship in v1** — an FX rate at the moment of entry is _irrecoverable_ later, so this is the one deferred feature whose data fields cannot be deferred. `appConfig.featureMultiCurrencyEntry` is the switch.                                   |
| 8   | **Receipt OCR**                                    | Needs an action, a vendor, a cost model and a privacy disclosure — none of it schema work.                                         | Add to `itemPhotos`: `ocrState`, `ocrText`, `ocrVendor`, `ocrConfidence`, `ocrExtractedAmountMinor`, `ocrExtractedMerchant`, `ocrRanAt` — all optional. Because photos are already a **table**, this is purely additive; a `by_ocrState_attempts` index (`staged: true`) drives it off the same `blobImport` workpool.                                                                                                                                                          |
| 9   | **CSV / bank import**                              | Needs a per-bank parser and a mapping UI.                                                                                          | `importBatches {ledgerId, source, fileName, rowCount, importedCount, skippedCount, state}` + optional `ledgerItems.importBatchId` / `externalKey` + `by_ledgerId_deletedAt_externalKey` (`staged: true`) for dedupe. Old rows correctly have no `externalKey`, since dedupe only applies to imported rows.                                                                                                                                                                      |
| 10  | **Tags**                                           | See §9 row 8.                                                                                                                      | `tags {ledgerId, label, labelKey, colorHex, deletedAt}` + `ledgerItemTags {tagId, ledgerId, itemId, dayKey}` with `by_tagId_dayKey` — the **join table directly**, skipping the array-on-1M-rows stage entirely. `usageCount` is a `.take(200)` count of the join table, not a stored counter.                                                                                                                                                                                  |
| 11  | **Places / merchant clustering**                   | Inline `place` answers every v1 question; clustering coordinates into named places is an inference problem, not a storage one.     | `places {ledgerId?, name, lat, lng, geohash}` + optional `ledgerItems.placeId` + `by_ledgerId_deletedAt_placeId_dayKey` (`staged: true`). A batch job clusters the lat/lng already stored — **no data is lost by deferring.**                                                                                                                                                                                                                                                   |
| 12  | **Comment threading**                              | Legacy had none and a ledger thread is short.                                                                                      | Optional `itemComments.parentId: v.id('itemComments')` + `by_itemId_deletedAt_parentId_createdAt` with `staged: true`; every existing row correctly reads as a root. The `parentId` must be **in the tuple**, or root-comment pages come back short.                                                                                                                                                                                                                            |
| 13  | **Comment full-text search**                       | Search storage is Convex's smallest allowance (0.5 GB free) and memo search already consumes it.                                   | `itemComments.searchIndex('search_body', {searchField: 'body', filterFields: ['ledgerId','deletedAt']})` — one line.                                                                                                                                                                                                                                                                                                                                                            |
| 14  | **Per-item revision history**                      | Full versioning is a storage-cost, UI and inter-member-privacy decision.                                                           | `ledgerItemRevisions {itemId, ledgerId, editedByUserId, editedAt, beforeJson}` + `by_itemId_editedAt`. `ledgerAuditLog` already records _that_ an item was deleted/restored; `updatedAt` + `updatedByUserId` cover "who touched this", which legacy could not answer at all.                                                                                                                                                                                                    |
| 15  | **Saved filters / custom reports**                 | A v2 screen whose queries are all already index-served.                                                                            | `savedViews {ledgerId, userId, name, isShared, filterJson-typed fields, chartKind}` + `by_ledgerId_userId`.                                                                                                                                                                                                                                                                                                                                                                     |
| 16  | **Additional export formats / scheduled delivery** | D4 ships protected, expiring personal and ADMIN+ ledger JSON/CSV/photo-volume exports in v1.                                       | Add only a new serializer/content type or schedule row; never weaken `dataExports` ownership, part-size, expiry, or authenticated delivery.                                                                                                                                                                                                                                                                                                                                     |
| 17  | **Amount-range filter** ("biggest expenses")       | No named v1 screen.                                                                                                                | `by_ledgerId_deletedAt_type_baseAmountMinor` with `staged: true`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| 18  | **Subscriptions / IAP**                            | A business decision with no legacy analogue.                                                                                       | `subscriptions {userId, productId, platform, expiresAt, originalTransactionId}` + `by_userId`, `by_originalTransactionId`. Nothing in the ledger tables changes.                                                                                                                                                                                                                                                                                                                |
| 19  | **Geospatial "map of my spending"**                | Convex has no geo index.                                                                                                           | Add `ledgerItems.geohash: v.optional(v.string())` + `by_ledgerId_deletedAt_geohash` (`staged: true`); lat/lng are already stored, so it is a pure backfill.                                                                                                                                                                                                                                                                                                                     |
| 20  | **App lock (PIN / biometrics)**                    | It is a _device_ control, not shared-ledger data.                                                                                  | Stays entirely in `expo-secure-store`. **Never** a Convex table — a server-stored PIN is a liability with no benefit and the lock must work offline.                                                                                                                                                                                                                                                                                                                            |
| 21  | **Populated-ledger base-currency re-denomination** | v1 cannot explain one historical conversion rate across every old item, and mixing old/new rollup units is a money-corruption bug. | Add a deployment `featureCurrencyRebase` flag plus an OWNER-confirmed `{fromCurrency, toCurrency, fxRateMicros}` request. Let `ledgers.confirmCurrency` pass a second gate only when that flag is on; reuse `maintenanceLock: 'CURRENCY'`, `CURRENCY_REBASE`, and `ROLLUP_REBUILD`. No mixed-currency rollup row or history divider is introduced.                                                                                                                              |

### 10.1 Open items for the implementation phase (each has a decided default)

1. **`Intl` timezone support inside the Convex isolate** — `shared/date.ts` and its client/Jest probes are
   complete; I1 still runs one target-deployment assertion before enabling item writes. R6 deliberately
   does not install `@date-fns/tz` or maintain two timezone implementations.
2. **`convex-helpers/server/triggers`** is unproven in both reference repos (`13` §0). Decide **before the
   first rollup mutation is written**, not after. Fallback: a hand-called `applyItemDelta(ctx, doc, sign)`
   — correctness then rests on discipline rather than structure, which is strictly worse but not blocking.
3. **`ROLLUP_SHARD_COUNT`** ships at 1; §5.4 fixes the metric, the threshold and the pre-launch load test.
4. **Memo search index size** — index the full memo; the fallback if search storage becomes the binding
   cost is a truncated `memoSearch` field, not dropping the index.
5. **`AUDIT_FEED_RETENTION_MS = 180 d`** — confirm with product. v1 writes no `FEED` rows, so it is inert
   until a v2 activity feed ships.
6. **Legacy `selectedDate` recovery rate** — `02` §8 predicts a class of items whose date vanished. The
   fallback chain is decided; the **rate** must be measured against the real export, because every one of
   those items lands in the wrong `dayKey` bucket. `migrationAnomalies.by_kind_resolvedAt`
   `.eq('SELECTED_DATE_LOST')` is the query that answers it, and the cutover gate is where it is answered.
7. **Photo migration timing is closed by D4.** The measured 724 photos make P12 a pre-public-cutover gate;
   there is no `storageId ?? legacyUrl` client fallback. Every missing source receives an explicit support
   disposition before release.

## Current subscription extension (2026-10-14)

`convex/schema/subscriptions.ts` owns the implemented `subscribers` and
`subscriptionEvents` tables. The provider migration reuses their existing
indexed user/event identity and adds only optional `provider: iapkit` provenance
to subscribers, preserving historical rows. Signed effective expiry replaces
legacy fixed-grace calculation for migrated rows. No ledger table or product
limit changes. See `iapkit-entitlements.md` for the current wire contract.

## October14 billing extension

subscriptionPurchases (schema/subscriptionPurchases.ts) owns verified IAPKit
provider ids and per-purchase state. Indexed unique provider lookup, paginated
user/createdAt reconciliation/purge, and user/environment/store/status/expiry
winner probes keep reads bounded. No 2017 billing rows or receipt tokens enter
this table. subscribers is the constant-read entitlement projection, with an
optional frozen legacy bridge; subscriptionEvents adds indexed scheduled-event and store/environment revocation
markers. subscribers.purchaseRevision owns monotonic reconciliation ordering. The executable schema policy owns these new indexes.
