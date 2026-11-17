# Schema Proposal C — PRODUCT / FUTURE-PROOF

**Scope:** the complete `convex/schema/*.ts` design for BooKoo.
**Angle:** design the schema BooKoo should have in **3 years**, not the one that reproduces 2020.
The test applied to every table and every field is: *can this schema absorb the feature without a
rewrite, and is the field cheap now / expensive later?*

Inputs: `.notes/DECISIONS.md`, research notes `01`, `02`, `03`, `04`, `06`, `09`, `13`, `14`.
Where this document contradicts a note, the contradiction is called out and argued.

---

## 0. TL;DR — the 24 decisions

| # | Decision | One-line why |
|---|---|---|
| D1 | **Money = `amountMinor: v.number()` (integer minor units) + `currency: v.string()` (ISO-4217).** The legacy `amount` display string is dropped entirely. | Floats drift; a display string is not data. (`02` §6, `14` §4.7) |
| D2 | **Amount is a positive magnitude; direction comes from `type: EXPENSE \| INCOME \| TRANSFER`.** | Kills the entire legacy "sometimes `realAmount` isn't negative" bug class (`02` §6) and makes `type` an indexable dimension. |
| D3 | **Every item carries `baseAmountMinor` + `fxRate` + `fxRateAt` + `baseCurrency`, captured at write time.** | An FX rate at the moment of entry is **irrecoverable** later. 4 fields now vs a permanently wrong multi-currency ledger. |
| D4 | **The ledger owns an IANA `timezone`. `dayKey`/`monthKey` are integers derived server-side from `occurredAt` in *the ledger's* timezone.** | A shared ledger spanning KST/JST/PST must agree on what "August" means. The legacy app used device-local `moment()` and could not. |
| D5 | **Primary hot index is `by_ledgerId_deletedAt_dayKey_occurredAt`.** Day, month, and arbitrary-range queries are all `dayKey` ranges — no timezone arithmetic in any query. | `dayKey` is monotonic in `occurredAt`, so ordering is identical and one index serves calendar, day list, timeline, and period reports. |
| D6 | **Soft delete everywhere (`deletedAt`), and `deletedAt` is the *second* field of every list index** (right after the tenant key). | Pages are never short; the client never pages past invisible rows. (`09` §3.1) |
| D7 | **Index naming grammar = `by_` + exact field identifiers joined by a single `_`.** Deviates from FightingHows' `_and_`. | `by_ledgerId_and_deletedAt_and_categoryId_and_dayKey_and_occurredAt` is 66 chars — over Convex's 64-char index-name limit. BooKoo needs 5-field indexes; FightingHows never did. |
| D8 | **Every counter/rollup table carries `shard: v.number()`, always `0` in v1.** Writers pick `shard = hash(userId) % SHARD_COUNT`; readers sum the index prefix. | Raising `SHARD_COUNT` becomes a constant change, not a migration. Zero cost now, and OCC relief is one line away. |
| D9 | **Three rollup tables** (`ledgerDailyRollups`, `ledgerMonthlyRollups`, `ledgerCategoryMonthlyRollups`) + `ledgerStats`. No `@convex-dev/aggregate` in v1. | Every dashboard number is a 1–34 document read. Aggregate B-trees are added only when the arbitrary-date-range report screen ships (`13` §3.4). |
| D10 | **Daily rollups exist so that *arbitrary* period totals (salary-cycle budgets, "last 30 days") cost ≤62 documents.** This is why `monthKey` can stay calendar-aligned while `ledgers.periodStartDay` supports 급여일 budgeting. | Solves a real Korean 가계부 requirement without contaminating the month dimension. |
| D11 | **Hot-write fields live in `ledgerStats`, never on the `ledgers` document.** | Every item mutation *reads* `ledgers` (for `timezone`/`baseCurrency`). If it also *wrote* `ledgers`, concurrent entries would OCC-conflict on the ledger doc. (`13` rule 9) |
| D12 | **Categories are per-ledger rows, seeded from the 34 presets at ledger creation.** `presetKey` drives i18n; `label` is only set for renames/custom. | Closes the legacy device-local-SQLite gap (`02` §7.1, `04` §3). One indexed read serves the picker; `ledgerItems.categoryId` is always a real FK. |
| D13 | **Photos are a table (`itemPhotos`), not an array on the item**, with `photoCount` + `coverThumbUrl` denormalized onto the item. | The migration needs a per-photo state machine (`14` §5.3) anyway; a table also gives a ledger-wide gallery and OCR/receipt columns for free. Array→table is an expensive retrofit. |
| D14 | **`ledgerActivity` (per-ledger append-only audit/feed) ships in v1. No per-user fan-out.** | History you never wrote is unrecoverable. Fan-out would cost O(members) writes per expense; `ledgerMembers.lastSeenActivityAt` + one indexed range gives the badge for free. |
| D15 | **Invites are one table (`ledgerInvites`) with a `by_token` index and a `by_inviteeEmailNormalized_status` index.** This replaces the legacy bidirectional `bookoo/invites` double index *and* the mailto flow. | RTDB needed two mirrored maps because it had no secondary index. Convex has one. |
| D16 | **Join requests survive as `ledgerJoinRequests`.** | Production data has pending `requests` maps, and the owner's "pending dot" is preserved UX (`01` §5.16). Two indexes, ~20 lines. |
| D17 | **Roles are a 4-rung per-ledger ladder: `OWNER > ADMIN > EDITOR > VIEWER`.** `ledgers.ownerId` is a denormalized copy of the single `OWNER` row. | Adding a role field later is free; auditing 60 call sites that assumed "owner or member" is not. |
| D18 | **`ledgers.visible` becomes two orthogonal fields: `archivedAt` (user-facing) and `deletedAt` (soft delete).** | The legacy flag was write-once `true` and meant nothing (`02` §2.1). Archive and delete are genuinely different products. |
| D19 | **`isDiscoverable: boolean` defaults to `false`; ledger title search is opt-in.** | Legacy `searchLedgers` exposed every ledger in the product to every user. Migration sets `false` for all. |
| D20 | **`tags` table + `ledgerItems.tagIds` array ship in v1; the `ledgerItemTags` join table is the deferred seam.** | Without tags, users create one-off categories — and every junk category permanently pollutes `ledgerCategoryMonthlyRollups`, which is expensive to clean up. |
| D21 | **Item comments (`itemComments`) get one level of threading (`parentId`) and a denormalized `commentCount`.** | Legacy `reviews` were flat and rewritten wholesale on every item save, destroying concurrent comments (`02` S12). |
| D22 | **All identity app-data lives on the `userProfiles` satellite keyed by `userId: v.id('users')`.** Every FK in the app points at `v.id('users')`. `legacyUid` lives on `userProfiles`. | `@convex-dev/auth`'s `authTables.users` shape is library-owned; extending it is fragile across versions. Deviates from `14` §6.1, which put `legacyUid` on `users`. |
| D23 | **`legacyKey` / `legacyUid` / `legacyCreatedAt` + a `by_legacyKey` index on every migrated table, from day one.** `legacyKey` for items is `` `${ledgerKey}/${itemKey}` `` (globally unique). | `14` §6.1. Retrofitting these onto live production data is the exact pain DECISIONS.md §4 forbids. |
| D24 | **Server errors are `ConvexError({code, messageKey, params})`.** No natural-language strings on the server; notifications store `titleKey`/`bodyKey`/`params`. | BooKoo is 5-locale; FightingHows' hardcoded-Korean approach cannot localize per recipient (`09` §11.2). |

---

## 1. Conventions

These are non-negotiable and belong verbatim in `convex/AGENTS.md`.

### 1.1 Files

```
convex/
  schema.ts                       # defineSchema only — assembles schema/*
  schema/
    userProfiles.ts  userHandles.ts
    ledgers.ts                    # ledgersTable + ledgerStatsTable
    ledgerMembers.ts
    ledgerInvites.ts              # ledgerInvitesTable + ledgerJoinRequestsTable
    categories.ts                 # categoriesTable + tagsTable
    ledgerItems.ts
    itemPhotos.ts                 # itemPhotosTable + uploadsTable
    itemComments.ts
    rollups.ts                    # 3 rollup tables
    ledgerActivity.ts
    notifications.ts              # notificationsTable + pushTokensTable
    moderation.ts                 # contentReportsTable + userBlocksTable
    feedback.ts
    appContent.ts                 # appConfigTable + appAnnouncementsTable + appFaqsTable
    migration.ts                  # legacyUsersTable + legacyInvitesTable + maintenanceJobsTable
  lib/  permissions.ts errors.ts serializers.ts constants.ts upload.ts money.ts period.ts
shared/                           # pure, isolate-safe, unit-tested, imported by convex/ AND src/
  username.ts money.ts period.ts category.ts errors.ts authPolicy.ts locale.ts
```

A schema file may export **more than one table when they are a unit** (`09` §2, FightingHows' style).
Enum validators are **exported from the schema file** and re-imported by `args:` — TS types come from
`Doc<'x'>['field']` or `Infer<typeof v>`, never hand-written.

### 1.2 Naming (D7)

`by_` + the index's field identifiers joined by a single `_`, in tuple order, camelCase preserved.
`['ledgerId','deletedAt','dayKey','occurredAt']` → `by_ledgerId_deletedAt_dayKey_occurredAt`.
Zero judgement calls, greppable, lintable, and it fits inside the 64-character limit that `_and_`
does not.

### 1.3 Timestamps

**Uniformly `v.number()` epoch milliseconds.** No ISO strings anywhere. The only date-shaped
non-timestamps are `dayKey` (`20260824`) and `monthKey` (`202608`), both `v.number()`, both defined
in §3.

`_creationTime` is used for ordering **only** on append-only tables where creation order *is* the
domain order (`itemComments`, `ledgerActivity`, `notifications`). It is never used to order
`ledgerItems` — those sort by `occurredAt`, a completely different field (`14` §4.3).

### 1.4 Validators

- `args: {x: v.string()}` object-literal form, never `args: v.object({...})`.
- `returns:` on **100 %** of public functions (`09` §13).
- `v.any()` is banned. Where a payload is genuinely open (activity details, feature flags), use
  explicit optional fields plus one documented `detailsJson: v.optional(v.string())` that is
  **rendered, never parsed for logic**.
- Foreign keys are always `v.id('<table>')`, never a raw string.

### 1.5 The shard rule (D8)

Every table that accumulates a counter carries:

```ts
/**
 * Contention shard. v1 writes 0 for everything (`SHARD_COUNT = 1`).
 * Writers: `shard = hashUserId(userId) % SHARD_COUNT`.
 * Readers: range the index prefix and sum — correct for any SHARD_COUNT.
 * Raising SHARD_COUNT therefore needs no migration: new shards materialize lazily
 * and old rows keep contributing.
 */
shard: v.number(),
```

`shard` is always the **last** field of the index so a prefix range returns every shard.

### 1.6 Errors

```ts
// shared/errors.ts
export type AppErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'RATE_LIMITED'
  | 'HANDLE_TAKEN' | 'HANDLE_RESERVED' | 'HANDLE_INVALID' | 'HANDLE_COOLDOWN'
  | 'LEDGER_ARCHIVED' | 'LEDGER_CURRENCY_LOCKED' | 'NOT_LEDGER_MEMBER'
  | 'ROLE_TOO_LOW' | 'LAST_OWNER' | 'INVITE_EXPIRED' | 'INVITE_CONSUMED'
  | 'ALREADY_MEMBER' | 'DUPLICATE_REQUEST' | 'TRANSFER_NOT_SUPPORTED';

export interface AppErrorPayload {
  code: AppErrorCode;
  messageKey: string;                              // 'error.ledger.notMember'
  params?: Record<string, string | number>;
  fallbackText?: string;                           // English, for unknown-key clients
}
```

---

## 2. Money representation

```ts
// shared/money.ts
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI',
  'VND','VUV','XAF','XOF','XPF',
]);
export const THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BHD','IQD','JOD','KWD','LYD','OMR','TND',
]);

export function minorUnitExponent(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return 2;
}

/** Convert a user-typed major-unit amount to the stored integer. Throws on lossy input. */
export function toMinor(major: number, currency: string): number { /* Math.round + epsilon guard */ }
export function toMajor(minor: number, currency: string): number { /* minor / 10 ** exp */ }
```

**Rules:**

1. `amountMinor` is a **non-negative integer**. Direction is `type`. (D2)
2. Zero is rejected at the mutation boundary (`INVALID_INPUT`), matching legacy validation.
3. `Number.MAX_SAFE_INTEGER` is 9.007e15 — that is ₩9 quadrillion. Non-issue.
4. Rollups sum `baseAmountMinor` only, never `amountMinor`, so a rollup row is always in exactly one
   currency (the ledger's `baseCurrency`).
5. The legacy `amount` display string is **not migrated**. Anything unmodeled goes into
   `ledgerItems.legacyRaw` as JSON, which is never parsed by app logic.

### Multi-currency (D3)

| Field on `ledgerItems` | Meaning |
|---|---|
| `currency` | ISO-4217 of what the user actually spent (`THB` on a Bangkok trip) |
| `amountMinor` | magnitude in `currency`'s minor units |
| `baseCurrency` | snapshot of `ledgers.baseCurrency` at write time |
| `baseAmountMinor` | magnitude converted to `baseCurrency`, **rounded once, at write time** |
| `fxRate` | `baseAmountMinor / amountMinor` adjusted for differing exponents; `1` when `currency === baseCurrency` |
| `fxRateAt` | epoch ms the rate was sourced for |
| `fxRateSource` | `'IDENTITY' \| 'MANUAL' \| 'FEED'` |

**Invariant:** `ledgers.baseCurrency` is **immutable once the ledger has one non-deleted item.**
Changing it requires a batched re-conversion job that rewrites every `baseAmountMinor` and rebuilds
every rollup. The mutation throws `LEDGER_CURRENCY_LOCKED`. Migration sets
`currencyIsAssumed: true` (legacy RTDB stored no currency at all — `02` §16) so the app prompts the
first member to open the ledger exactly once, and that prompt is the only sanctioned change.

**v1 behaviour:** `currency === baseCurrency`, `fxRate = 1`, `fxRateSource = 'IDENTITY'`.
The four fields exist so v1.1's "spent in a foreign currency" feature is a UI change, not a data
migration. **This is the single most expensive-to-retrofit decision in the document.**

---

## 3. Date, time, and the timezone rule (D4, D5)

The legacy app wrote `moment().format()` — an ISO string with the *writer's device* offset — and every
list/graph filtered on it with device-local `moment()` comparisons (`02` §8). Two members in Seoul and
Tokyo saw different "August" totals for the same ledger. That is a correctness bug, not a UX one.

### 3.1 The rule

```
ledgers.timezone : IANA identifier, e.g. "Asia/Seoul". Set at creation from the creator's device,
                   editable by OWNER/ADMIN only, and changing it schedules a backfill (§3.4).

ledgerItems.occurredAt : v.number(), epoch ms. The absolute instant. Timezone-free.
ledgerItems.dayKey     : v.number(), YYYYMMDD as an integer, computed from occurredAt
                         IN THE LEDGER'S TIMEZONE. e.g. 20260824
ledgerItems.monthKey   : v.number(), YYYYMM as an integer, same rule. e.g. 202608
```

**Every calendar-shaped number in BooKoo is the ledger's calendar, never the device's.** The device
timezone is used for exactly one thing: pre-filling the date picker.

### 3.2 Why integers, not `'2026-08'` strings

- Index keys are smaller and compare numerically (no collation questions).
- Range expressions read naturally: `.gte('dayKey', 20260801).lte('dayKey', 20260831)`.
- `shared/period.ts` provides all arithmetic (`addMonths(202612, 1) === 202701`), so string
  legibility buys nothing that a helper does not.

This follows note `13` §1.1 rather than note `06` D9's `'YYYY-MM'` strings. The client-facing
calendar API from note `03` keeps its `'yyyy-MM'` `CalendarDateKey` strings; `shared/period.ts`
converts at the boundary.

### 3.3 Who computes the keys

```ts
// shared/period.ts — pure, isolate-safe, unit-tested
export function dayKeyOf(occurredAtMs: number, timeZone: string): number;
export function monthKeyOf(occurredAtMs: number, timeZone: string): number;
export function dayKeyRangeOfMonth(monthKey: number): {from: number; to: number};
export function dayKeyRangeOfPeriod(                    // salary-cycle periods (D10)
  anchorMonthKey: number, periodStartDay: number,
): {from: number; to: number};
```

**The mutation is the authority.** The client may send `dayKey`/`monthKey` for optimistic rendering,
but `createLedgerItem` / `updateLedgerItem` recompute both from `occurredAt` + `ledgers.timezone` and
store the server's values. Client values are never trusted, because a wrong `dayKey` silently
corrupts a rollup row.

> **Implementation risk to verify on day one:** `dayKeyOf` uses
> `Intl.DateTimeFormat('en-CA', {timeZone, year, month, day}).formatToParts()`. The Convex isolate is
> V8 with web-standard APIs, but the availability of the **full IANA tz database** must be asserted by
> a `convex-test` case (`dayKeyOf(Date.UTC(2026,7,23,16,0,0), 'Asia/Seoul') === 20260824`).
> **Fallback if it is not available:** bundle `@date-fns/tz` (pure JS, ships offsets, no `node:`
> builtins) into `shared/period.ts`. Either way the *schema* is unaffected — this is a helper-level
> risk, deliberately isolated to one file.

### 3.4 Changing a ledger's timezone

`updateLedgerTimezone` patches `ledgers.timezone`, sets `ledgers.timezoneBackfillState = 'PENDING'`,
and schedules `internal.maintenance.rebuildLedgerKeys`. That job walks
`by_ledgerId_deletedAt_dayKey_occurredAt` in 500-row batches, recomputes `dayKey`/`monthKey`, and
then rebuilds the three rollup tables for the affected months from source. Until it completes the
client shows a "recalculating" banner. This is the price of getting timezones right and it is paid
approximately never.

### 3.5 The `dayKey`-first index (D5)

`dayKey` is a **monotonic** function of `occurredAt` for a fixed timezone. Therefore ordering by
`(dayKey, occurredAt)` is identical to ordering by `occurredAt`, and the single index
`by_ledgerId_deletedAt_dayKey_occurredAt` serves:

| Query | Range expression |
|---|---|
| one day (calendar tap) | `.eq(dayKey, 20260824)` |
| one month (list tab) | `.gte(dayKey, 20260801).lte(dayKey, 20260831)` |
| salary cycle 25th→24th | `.gte(dayKey, 20260725).lte(dayKey, 20260824)` |
| "last 90 days" | `.gte(dayKey, from).lte(dayKey, to)` |
| whole ledger, newest first | no range, `.order('desc')` |

**No query anywhere performs timezone arithmetic.** That was the goal.

---

## 4. Soft delete (D6)

| Table | Policy |
|---|---|
| `ledgerItems`, `itemComments`, `itemPhotos`, `categories`, `tags`, `ledgers`, `ledgerMembers`, `notifications`, `userProfiles` | **Soft** — `deletedAt: v.optional(v.number())`, and `deletedAt` is index field #2 |
| `pushTokens` | **Hard** — a retired token must stop matching `by_token`, or the device keeps receiving pushes after sign-out (`09` §10.2) |
| `uploads`, orphan `_storage` blobs | **Hard** — a receipt photo is financial data and storage URLs carry no auth or expiry (`09` §7) |
| `userHandles` | **Never deleted.** `releasedAt` is the anti-impersonation record (`09` §12.7) |
| `ledgerInvites`, `ledgerJoinRequests` | **Status transition**, not deletion — the audit trail matters |
| rollups | Rows are decremented, not deleted; a zeroed row is left in place (it will be reused) |

**Rollup interaction:** a soft delete applies the *negative* delta to every rollup at delete time, and
an undelete re-applies the positive delta. Deleted rows are therefore invisible to both lists and
totals, atomically, in one mutation.

**Purge:** a nightly cron hard-deletes rows whose `deletedAt` is older than **90 days** (and their
blobs). By then the rollups have long since excluded them, so a purge is pure cleanup and can never
change a number on screen.

---

## 5. The schema

### 5.0 `convex/schema.ts`

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

import {userProfilesTable} from './schema/userProfiles';
import {userHandlesTable} from './schema/userHandles';

import {ledgerStatsTable, ledgersTable} from './schema/ledgers';
import {ledgerMembersTable} from './schema/ledgerMembers';
import {ledgerInvitesTable, ledgerJoinRequestsTable} from './schema/ledgerInvites';

import {categoriesTable, tagsTable} from './schema/categories';
import {ledgerItemsTable} from './schema/ledgerItems';
import {itemPhotosTable, uploadsTable} from './schema/itemPhotos';
import {itemCommentsTable} from './schema/itemComments';

import {
  ledgerCategoryMonthlyRollupsTable,
  ledgerDailyRollupsTable,
  ledgerMonthlyRollupsTable,
} from './schema/rollups';
import {ledgerActivityTable} from './schema/ledgerActivity';

import {notificationsTable, pushTokensTable} from './schema/notifications';
import {contentReportsTable, userBlocksTable} from './schema/moderation';
import {feedbackTable} from './schema/feedback';
import {appAnnouncementsTable, appConfigTable, appFaqsTable} from './schema/appContent';
import {
  legacyInvitesTable,
  legacyUsersTable,
  maintenanceJobsTable,
} from './schema/migration';

export default defineSchema({
  ...authTables,

  // identity
  userProfiles: userProfilesTable,
  userHandles: userHandlesTable,

  // ledger + access control
  ledgers: ledgersTable,
  ledgerStats: ledgerStatsTable,
  ledgerMembers: ledgerMembersTable,
  ledgerInvites: ledgerInvitesTable,
  ledgerJoinRequests: ledgerJoinRequestsTable,

  // ledger content
  categories: categoriesTable,
  tags: tagsTable,
  ledgerItems: ledgerItemsTable,
  itemPhotos: itemPhotosTable,
  itemComments: itemCommentsTable,

  // derived
  ledgerDailyRollups: ledgerDailyRollupsTable,
  ledgerMonthlyRollups: ledgerMonthlyRollupsTable,
  ledgerCategoryMonthlyRollups: ledgerCategoryMonthlyRollupsTable,
  ledgerActivity: ledgerActivityTable,

  // platform
  pushTokens: pushTokensTable,
  notifications: notificationsTable,
  uploads: uploadsTable,
  contentReports: contentReportsTable,
  userBlocks: userBlocksTable,
  feedback: feedbackTable,
  appConfig: appConfigTable,
  appAnnouncements: appAnnouncementsTable,
  appFaqs: appFaqsTable,

  // migration (droppable after cutover, except legacy* fields on live tables)
  legacyUsers: legacyUsersTable,
  legacyInvites: legacyInvitesTable,
  maintenanceJobs: maintenanceJobsTable,
});
```

**28 app tables + 7 auth tables** (`users`, `authAccounts`, `authSessions`, `authRefreshTokens`,
`authVerificationCodes`, `authVerifiers`, `authRateLimits`). Of the 28, three (`legacyUsers`,
`legacyInvites`, and the migration half of `maintenanceJobs`) are droppable after cutover — the
`legacy*` **fields** on live tables are permanent, the staging **tables** are not.
Grouped by bounded context with blank lines, per `09` §2.

`localeValidator` (from `schema/userProfiles.ts`) and `ledgerColorValidator` /
`ledgerRoleValidator` (from `schema/ledgers.ts`, `schema/ledgerMembers.ts`) are imported by the
schema files that reuse them — validators are always defined once, in the file that owns the concept.

---

### 5.1 `schema/userProfiles.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/** UI languages. Legacy shipped en/ko/ja/zh/id (`04` §4); all five are kept. */
export const localeValidator = v.union(
  v.literal('ko'), v.literal('en'), v.literal('ja'), v.literal('zh'), v.literal('id'),
);

/** Global account role. Per-ledger authority is in `ledgerMembers.role`, not here. */
export const appRoleValidator = v.union(
  v.literal('USER'),
  v.literal('SUPPORT'),   // read-only ops tooling
  v.literal('ADMIN'),     // moderation + app content
  v.literal('SUSPENDED'),
);

/**
 * App-side identity. One row per `users` row.
 *
 * Why a satellite instead of extending `authTables.users`: the shape of `users` is owned by
 * `@convex-dev/auth` and has changed across 0.0.x releases. Every foreign key in BooKoo points at
 * `v.id('users')` (one canonical identity, `06` D13); the profile is looked up by `by_userId`.
 */
export const userProfilesTable = defineTable({
  userId: v.id('users'),

  /** Normalized (lowercase, trimmed) — the merge key for social account linking. */
  email: v.string(),

  /** Unique @handle. Absent only between account creation and the onboarding screen. */
  handle: v.optional(v.string()),
  /** Denormalized copy of `userHandles.handleKey` so `/@hyo` needs no join. */
  handleKey: v.optional(v.string()),
  handleUpdatedAt: v.optional(v.number()),

  /** Free-form Unicode, NOT unique. Korean/Japanese names live here. */
  displayName: v.string(),
  bio: v.optional(v.string()),                  // legacy `info.statusMsg`
  phone: v.optional(v.string()),                // legacy `info.tel`

  avatarStorageId: v.optional(v.id('_storage')),
  /**
   * Denormalized `ctx.storage.getUrl()` result. Never call getUrl per row in a list query
   * (`13` §6.3); it is refreshed by the same mutation that changes the blob.
   */
  avatarUrl: v.optional(v.string()),

  locale: localeValidator,
  /** Default currency offered when this user creates a ledger. Not a formatting locale. */
  preferredCurrency: v.string(),

  appRole: appRoleValidator,

  // notification preferences — REQUIRED with defaults written at insert, so no read path needs `?? true`
  pushEnabled: v.boolean(),
  notifyLedgerActivity: v.boolean(),
  notifyComments: v.boolean(),
  notifyInvites: v.boolean(),
  notifyBudgets: v.boolean(),

  lastSeenAt: v.optional(v.number()),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),

  // ── migration (D23) ──
  legacyUid: v.optional(v.string()),            // Firebase Auth localId
  legacyPhotoUrl: v.optional(v.string()),       // pre-Convex Storage URL, kept for one release
  legacyCreatedAt: v.optional(v.number()),
})
  .index('by_userId', ['userId'])
  .index('by_email', ['email'])
  .index('by_handleKey', ['handleKey'])
  .index('by_appRole', ['appRole'])
  .index('by_legacyUid', ['legacyUid'])
  .searchIndex('search_handle', {
    searchField: 'handle',
    filterFields: ['deletedAt'],
  });
```

| Index | Exact query it serves |
|---|---|
| `by_userId` | `requireProfile` — the first line of every one of the ~90 functions. Most-called index after `ledgerMembers.by_ledgerId_userId`. |
| `by_email` | Account merge at sign-in (`shouldAutoLinkViaEmail`), and the legacy claim flow matching `legacyUsers.emailNormalized`. |
| `by_handleKey` | `/@hyo` deep-link profile route; mention resolution. One indexed read, no join. |
| `by_appRole` | Admin console user list; the "is there still another ADMIN" last-admin guard. |
| `by_legacyUid` | Migration pass 2 (`legacyUid` → `Id<'users'>`) and the claim-on-first-sign-in flow. |
| `search_handle` | Invite-a-member typeahead and mention autocomplete (`09` §12.9). Prefix-matches the final term — exactly typeahead. |

### 5.2 `schema/userHandles.ts`

Adopted essentially verbatim from `09` §12.4 — it is already the right design.

```ts
/**
 * Authority for handle uniqueness. One row per handle ever claimed; NEVER deleted.
 *
 * Convex has no unique constraint. Uniqueness is enforced by check-then-insert inside one
 * mutation against `by_handleKey`: Convex tracks index *ranges* in a transaction's read set, so a
 * competing insert into the range this mutation read invalidates it, the mutation is re-run at a
 * fresh timestamp, and the re-run sees the winner's row. The narrow `.eq()` range is what keeps the
 * conflict set to "someone claiming this exact handle" rather than "any handle write at all".
 */
export const userHandlesTable = defineTable({
  handleKey: v.string(),        // NFKC-folded, lowercased, ASCII-only — see shared/username.ts
  handle: v.string(),           // exactly what the member typed, for display casing
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away. `undefined` == currently held. */
  releasedAt: v.optional(v.number()),
})
  .index('by_handleKey', ['handleKey'])
  .index('by_userId', ['userId'])
  .index('by_userId_releasedAt', ['userId', 'releasedAt']);
```

| Index | Exact query |
|---|---|
| `by_handleKey` | THE uniqueness check in `claimHandle` / `changeHandle`; the advisory `checkHandleAvailability` query; the ≤12 probes inside `suggestAvailable`. |
| `by_userId` | Security screen "Previously: @oldhyo until 2026-05-01", capped `.take(HANDLE_HISTORY_LIMIT = 50)`. |
| `by_userId_releasedAt` | "Is this user's handle currently live?" without walking their rename history — used by `deleteAccount` to release the live claim. |

Policy (unchanged from `09` §12.7): rename cooldown 30 days, released-handle cooldown 90 days before
anyone *else* may take it, original owner may always re-take immediately, account deletion releases
rather than deletes, "recently renamed" badge for 14 days off `handleUpdatedAt`.

### 5.3 `schema/ledgers.ts`

```ts
/** Legacy `info.color` 0..5 becomes a token so dark mode can theme it (`02` §2.2, `01` §5.12). */
export const ledgerColorValidator = v.union(
  v.literal('pink'),    // legacy 0  rgb(255,114,141)
  v.literal('orange'),  // legacy 1  rgb(246,166,35)
  v.literal('yellow'),  // legacy 2  rgb(238,209,0)
  v.literal('teal'),    // legacy 3  rgb(29,211,168)   — legacy fallback
  v.literal('blue'),    // legacy 4  rgb(103,158,255)  — legacy default
  v.literal('purple'),  // legacy 5  rgb(182,105,249)
);

export const ledgerJoinPolicyValidator = v.union(
  v.literal('INVITE_ONLY'),   // default: only a link or a direct invite gets you in
  v.literal('REQUEST'),       // discoverable + owner approves (the legacy behaviour)
  v.literal('OPEN'),          // link holder joins instantly, no approval
);

export const timezoneBackfillStateValidator = v.union(
  v.literal('IDLE'), v.literal('PENDING'), v.literal('RUNNING'),
);

export const ledgersTable = defineTable({
  title: v.string(),
  description: v.string(),
  colorKey: ledgerColorValidator,
  /** Optional emoji badge — a 2026 affordance the legacy colour dot alone can't carry. */
  emoji: v.optional(v.string()),

  /** Denormalized copy of the single `ledgerMembers` row with role OWNER. Kept in sync in one mutation. */
  ownerId: v.id('users'),
  ownershipTransferredFromUserId: v.optional(v.id('users')),
  ownershipTransferredAt: v.optional(v.number()),

  /** ISO-4217. IMMUTABLE once the ledger has a non-deleted item (§2). */
  baseCurrency: v.string(),
  /** true when migration guessed the currency; drives the one-time confirmation prompt (`14` §4.7). */
  currencyIsAssumed: v.boolean(),

  /** IANA identifier. THE authority for every dayKey/monthKey in this ledger (§3). */
  timezone: v.string(),
  timezoneBackfillState: timezoneBackfillStateValidator,
  /** 0=Sunday..6=Saturday. Calendar grid start (`03`). Legacy hardcoded 0. */
  weekStartsOn: v.number(),
  /**
   * 1..28. Salary-cycle budgeting (급여일 기준). monthKey stays calendar-aligned; period totals are
   * assembled from <=62 `ledgerDailyRollups` rows (D10).
   */
  periodStartDay: v.number(),

  /** Denormalized. Maintained by join/leave/remove mutations only — a few writes per ledger per year. */
  memberCount: v.number(),

  /** Opt-in to title search. Defaults FALSE — the legacy app exposed every ledger to everyone (D19). */
  isDiscoverable: v.boolean(),
  joinPolicy: ledgerJoinPolicyValidator,

  /** User-facing "archive": hidden from the switcher, read-only, restorable. */
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  updatedAt: v.number(),

  // ── migration ──
  legacyKey: v.optional(v.string()),          // RTDB push id
  legacyOwnerUid: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),    // from the push id timestamp
})
  .index('by_ownerId_deletedAt', ['ownerId', 'deletedAt'])
  .index('by_legacyKey', ['legacyKey'])
  .searchIndex('search_title', {
    searchField: 'title',
    filterFields: ['isDiscoverable', 'deletedAt'],
  });
```

| Index | Exact query |
|---|---|
| `by_ownerId_deletedAt` | Owner dashboard ("ledgers I own"), and the account-deletion guard "you still own N ledgers — transfer or delete them first". |
| `by_legacyKey` | Migration pass 2 dedupe/resolution (`14` §6.1). |
| `search_title` | The modern replacement for `searchLedgers`. Legacy did `orderByChild('info/title').equalTo(exact)` — **exact full title only** (`02` §11). This gives prefix + fuzzy, filtered to `isDiscoverable: true, deletedAt: undefined`. |

**Note there is no `by_id`-style index and no "list all ledgers".** A member reaches a ledger only
through `ledgerMembers`, and the search index is the only public surface.

### 5.4 `schema/ledgers.ts` (continued) — `ledgerStats` (D11)

```ts
/**
 * Every field here changes on essentially every write. It is deliberately NOT on `ledgers`:
 *
 *  - Every list query and the item-create mutation READ `ledgers` (for timezone + baseCurrency).
 *    If those hot counters lived on the ledger document, two members adding an expense at the same
 *    moment would OCC-conflict on the ledger row, and every query that read the ledger would re-run
 *    on every expense.
 *  - Sharded per the D8 rule so the conflict set shrinks with one constant change.
 */
export const ledgerStatsTable = defineTable({
  ledgerId: v.id('ledgers'),
  shard: v.number(),

  itemCount: v.number(),
  photoCount: v.number(),
  commentCount: v.number(),

  lastItemAt: v.optional(v.number()),       // max across shards
  lastActivityAt: v.optional(v.number()),
  firstItemDayKey: v.optional(v.number()),  // min across shards — bounds the "all time" report
  lastItemDayKey: v.optional(v.number()),

  updatedAt: v.number(),
})
  .index('by_ledgerId_shard', ['ledgerId', 'shard']);
```

| Index | Exact query |
|---|---|
| `by_ledgerId_shard` | Ledger switcher row ("12,431 entries · last activity 2h ago"); the empty-state decision on the calendar tab; the report screen's date bounds. Reads `SHARD_COUNT` documents (1 in v1). |

Lifetime money totals are deliberately **not** here — they are a `ledgerMonthlyRollups` range sum
(≤120 docs for 10 years), which stays correct across soft-deletes and edits without a second
increment path.

### 5.5 `schema/ledgerMembers.ts`

```ts
/** Per-ledger authority ladder. Rank order matters: OWNER > ADMIN > EDITOR > VIEWER. */
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'),    // exactly one per ledger; can delete the ledger and transfer ownership
  v.literal('ADMIN'),    // manage members, categories, settings; cannot delete the ledger
  v.literal('EDITOR'),   // create/edit/delete own items, comment  (the legacy "member")
  v.literal('VIEWER'),   // read + comment only  (accountant, parent, partner-who-only-looks)
);

export const ledgerMembersTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  role: ledgerRoleValidator,

  /** Per-ledger display name. "Dad" in the family ledger, "형" in the trip ledger. */
  nickname: v.optional(v.string()),
  /** Per-ledger avatar tint so 6 members are distinguishable in a chart legend. */
  colorKey: v.optional(ledgerColorValidator),

  joinedAt: v.number(),
  invitedByUserId: v.optional(v.id('users')),
  joinedViaInviteId: v.optional(v.id('ledgerInvites')),

  /** Drives the unseen-activity badge without any per-user fan-out (D14). */
  lastSeenActivityAt: v.optional(v.number()),

  // per-ledger notification switches; global master switch is userProfiles.pushEnabled
  notifyNewItem: v.boolean(),
  notifyComment: v.boolean(),
  notifyBudget: v.boolean(),

  /** Set on leave or removal. The row stays: it is the membership audit trail. */
  deletedAt: v.optional(v.number()),
  removedByUserId: v.optional(v.id('users')),

  updatedAt: v.number(),

  // ── migration ──
  legacyKey: v.optional(v.string()),   // `${ledgerKey}/${uid}`
  legacyUid: v.optional(v.string()),
})
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  .index('by_userId_deletedAt', ['userId', 'deletedAt'])
  .index('by_ledgerId_deletedAt_role', ['ledgerId', 'deletedAt', 'role'])
  .index('by_legacyKey', ['legacyKey']);
```

| Index | Exact query |
|---|---|
| `by_ledgerId_userId` | **`requireLedgerMember(ctx, ledgerId)` — the single most-called index in the app.** Exactly one document read, on the first line of every ledger-scoped query and mutation. The legacy equivalent was `ledgers/{k}/members.hasChild(uid)` on a map downloaded with the whole ledger. |
| `by_userId_deletedAt` | The ledger switcher / drawer: "my ledgers", `.eq(userId).eq(deletedAt, undefined)`. Bounded by how many ledgers a person is in (~1–20). Replaces the legacy `users/{uid}/ledgers` mirror map entirely. |
| `by_ledgerId_deletedAt_role` | Members screen (`.take(MEMBER_SCAN_LIMIT = 200)`); "who is the OWNER" (`.eq(role,'OWNER').unique()`); the **last-owner guard** on `changeRole`/`leaveLedger`; the push fan-out recipient list. |
| `by_legacyKey` | Migration dedupe. |

**Two truths, one transaction.** `ledgers.ownerId` and the `ledgerMembers` row with `role: 'OWNER'`
are written in the same mutation and can never drift. `ownerId` exists so the switcher can render the
crown badge without a second query per ledger.

**Transfer ownership** (legacy `changeOwner`, which only set `ledgers/{k}/owner` and left the old
owner as a plain member) becomes: patch old member `role: 'ADMIN'`, patch new member `role: 'OWNER'`,
patch `ledgers.ownerId` + `ownershipTransferredFromUserId` + `ownershipTransferredAt`, insert
`ledgerActivity` kind `OWNER_TRANSFERRED`. Four documents, one transaction, fully audited.

### 5.6 `schema/ledgerInvites.ts`

```ts
export const inviteStatusValidator = v.union(
  v.literal('PENDING'), v.literal('ACCEPTED'), v.literal('REVOKED'), v.literal('EXPIRED'),
);

/**
 * Replaces BOTH legacy invite mechanisms:
 *   - `bookoo/invites/{ledgerKey}/{encodedEmail}`   (index A: by ledger)
 *   - `bookoo/invites/{encodedEmail}/{ledgerKey}`   (index B: by email)
 * RTDB needed two hand-mirrored maps in one colliding namespace because it had no secondary
 * indexes; two Convex indexes over one table do the same job with no consistency hazard and none
 * of the orphaned-node bugs the legacy `Promise.all` mistakes produced (`02` §4).
 */
export const ledgerInvitesTable = defineTable({
  ledgerId: v.id('ledgers'),

  /** URL-safe random, 22 chars from crypto.getRandomValues. The deep link is bookoo://join/<token>. */
  token: v.string(),
  /** Role the invitee lands in. Lets you invite an accountant as VIEWER. */
  role: ledgerRoleValidator,

  createdByUserId: v.id('users'),
  /** Set for a targeted email invite; absent for a shareable link. Normalized lowercase. */
  inviteeEmailNormalized: v.optional(v.string()),
  /** Set when the invite was aimed at a known account (from handle search). */
  inviteeUserId: v.optional(v.id('users')),
  messageKey: v.optional(v.string()),

  status: inviteStatusValidator,
  maxUses: v.number(),          // 1 for a targeted invite, N for a shareable family link
  useCount: v.number(),
  expiresAt: v.number(),

  acceptedAt: v.optional(v.number()),
  acceptedByUserId: v.optional(v.id('users')),
  revokedAt: v.optional(v.number()),
  revokedByUserId: v.optional(v.id('users')),

  // ── migration ──
  legacyKey: v.optional(v.string()),            // `${ledgerKey}/${encodedEmail}`
  legacyEncodedEmail: v.optional(v.string()),
})
  .index('by_token', ['token'])
  .index('by_ledgerId_status', ['ledgerId', 'status'])
  .index('by_inviteeEmailNormalized_status', ['inviteeEmailNormalized', 'status'])
  .index('by_legacyKey', ['legacyKey']);

export const joinRequestStatusValidator = v.union(
  v.literal('PENDING'), v.literal('APPROVED'), v.literal('REJECTED'), v.literal('CANCELLED'),
);

/** The legacy `ledgers/{k}/requests` map, as a first-class table (D16). */
export const ledgerJoinRequestsTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  messageKey: v.optional(v.string()),
  status: joinRequestStatusValidator,
  decidedByUserId: v.optional(v.id('users')),
  decidedAt: v.optional(v.number()),
  legacyKey: v.optional(v.string()),            // `${ledgerKey}/${uid}`
})
  .index('by_ledgerId_status', ['ledgerId', 'status'])
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  .index('by_userId_status', ['userId', 'status']);
```

| Index | Exact query |
|---|---|
| `ledgerInvites.by_token` | Deep-link landing: `bookoo://join/<token>` → one indexed read, O(1). Also the check-then-insert uniqueness guard when minting a token. |
| `ledgerInvites.by_ledgerId_status` | Members screen "pending invitations" list — the modern form of the legacy `{unregistered: true, email}` pseudo-member rows. `.eq(status,'PENDING')`, `.take(100)`, ordered by `_creationTime`. |
| `ledgerInvites.by_inviteeEmailNormalized_status` | **First sign-in drain.** After a new user verifies an email, `.eq(email).eq(status,'PENDING')` returns every ledger waiting for them. This is legacy index B, correctly. |
| `ledgerJoinRequests.by_ledgerId_status` | Owner's approval inbox on the Members screen, and the **blue "pending" dot** on the drawer row: `.eq(ledgerId).eq(status,'PENDING').take(1)`. Legacy did this with N sequential round-trips per app open (`02` S4). |
| `ledgerJoinRequests.by_ledgerId_userId` | The uniqueness check ("you already have a pending request"), and the button state on the ledger-search result row. |
| `ledgerJoinRequests.by_userId_status` | "My outgoing requests" screen. |

### 5.7 `schema/categories.ts` (D12)

```ts
export const categoryKindValidator = v.union(v.literal('EXPENSE'), v.literal('INCOME'));

/**
 * PER-LEDGER category rows, seeded from the 34 presets when a ledger is created.
 *
 * The legacy app kept categories in a device-local expo-sqlite table seeded from
 * `INITIAL_CATEGORIES` and never synced them (`02` §7.1). Consequence: member A's custom category
 * showed up on member B's device only as a denormalized `{iconId, txt}` snapshot glued onto the
 * item, and every category vanished on reinstall. This is the single biggest feature gap the
 * rewrite closes.
 *
 * Why per-ledger copies rather than global presets + per-ledger overrides:
 *   - `ledgerItems.categoryId` is then always a real FK to a real row (never a nullable preset id).
 *   - The picker is ONE indexed read of <=40 rows, not a merge of two sources.
 *   - Renaming "식사" to "밥값" in the family ledger cannot leak into the trip ledger.
 *   - 34 inserts at ledger creation is trivially inside the 16,000-writes-per-mutation limit.
 *
 * i18n: when `label` is undefined the client renders t(`category.${presetKey}`). A preset therefore
 * re-translates when the user switches language — the legacy app baked the translation in at
 * install time and never re-translated (`04` §3).
 */
export const categoriesTable = defineTable({
  ledgerId: v.id('ledgers'),

  /** Stable slug from `shared/category.ts` DEFAULT_CATEGORIES (`04` §3.2). Absent for user-created. */
  presetKey: v.optional(v.string()),
  /** Set only for a rename or a custom category. Undefined => resolve presetKey through i18n. */
  label: v.optional(v.string()),

  /** Icon slug, decoupled from presetKey so a custom category can borrow any of the 34 icons. */
  iconKey: v.string(),
  /** Optional per-category chart colour; falls back to a deterministic palette index. */
  colorHex: v.optional(v.string()),

  kind: categoryKindValidator,
  order: v.number(),

  /** Hidden from the picker but still referenced by history. Not the same as deletedAt. */
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  updatedAt: v.number(),

  // ── migration ──
  legacyIconId: v.optional(v.number()),   // 0..33, the only surviving key for custom legacy categories
})
  .index('by_ledgerId_deletedAt_order', ['ledgerId', 'deletedAt', 'order'])
  .index('by_ledgerId_presetKey', ['ledgerId', 'presetKey']);

/**
 * Free-form labels, orthogonal to categories (D20).
 *
 * Without them users invent one-off categories ("제주여행", "엄마생신"), and every junk category
 * permanently creates a `ledgerCategoryMonthlyRollups` row per month it appears in — dimensional
 * pollution that is genuinely expensive to unwind. A tag costs one row and zero rollup dimensions.
 */
export const tagsTable = defineTable({
  ledgerId: v.id('ledgers'),
  label: v.string(),
  /** lowercase(NFKC(label)) — the dedupe key for check-then-insert. */
  labelKey: v.string(),
  colorHex: v.optional(v.string()),
  usageCount: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index('by_ledgerId_labelKey', ['ledgerId', 'labelKey'])
  .index('by_ledgerId_deletedAt_usageCount', ['ledgerId', 'deletedAt', 'usageCount']);
```

| Index | Exact query |
|---|---|
| `categories.by_ledgerId_deletedAt_order` | The category picker in the add/edit sheet, and the label map for every list row. `.take(CATEGORY_SCAN_LIMIT = 200)`; kind is filtered in JS over ≤40 rows. Also the donut chart legend. |
| `categories.by_ledgerId_presetKey` | Ledger-creation seeding idempotence; migration mapping legacy `iconId` → the seeded preset row. |
| `tags.by_ledgerId_labelKey` | Check-then-insert dedupe when the user types an existing tag. |
| `tags.by_ledgerId_deletedAt_usageCount` | Tag autocomplete, most-used first, `.take(20)`. |

### 5.8 `schema/ledgerItems.ts` — the unbounded table

```ts
export const ledgerItemTypeValidator = v.union(
  v.literal('EXPENSE'),
  v.literal('INCOME'),
  /**
   * Reserved from day one. v1 mutations accept only EXPENSE|INCOME via a NARROWER validator at the
   * function boundary; the literal exists in the schema so every rollup, serializer and switch is
   * exhaustive from the first commit. Adding it later means auditing every
   * `type === 'EXPENSE' ? ... : ...` in the codebase — that is the expensive part, not the field.
   */
  v.literal('TRANSFER'),
);

export const fxRateSourceValidator = v.union(
  v.literal('IDENTITY'), v.literal('MANUAL'), v.literal('FEED'),
);

export const ledgerItemsTable = defineTable({
  // ── tenancy ──
  ledgerId: v.id('ledgers'),

  // ── money (§2) ──
  type: ledgerItemTypeValidator,
  /** NON-NEGATIVE magnitude in minor units. Direction is `type`, never a sign (D2). */
  amountMinor: v.number(),
  currency: v.string(),
  /** Snapshot of ledgers.baseCurrency at write time; makes the immutability invariant checkable. */
  baseCurrency: v.string(),
  /** amountMinor converted to baseCurrency, rounded ONCE, at write time. Rollups sum only this. */
  baseAmountMinor: v.number(),
  fxRate: v.number(),
  fxRateAt: v.number(),
  fxRateSource: fxRateSourceValidator,

  // ── time (§3) ──
  /** Absolute instant, user-chosen. The legacy `selectedDate`. */
  occurredAt: v.number(),
  /** YYYYMMDD in ledgers.timezone. Server-computed. */
  dayKey: v.number(),
  /** YYYYMM in ledgers.timezone. Server-computed. */
  monthKey: v.number(),

  // ── classification ──
  /** Required for EXPENSE/INCOME (enforced in the mutation); absent for TRANSFER. */
  categoryId: v.optional(v.id('categories')),
  /** <=10 enforced in the mutation. The `ledgerItemTags` join table is the deferred seam (§12). */
  tagIds: v.optional(v.array(v.id('tags'))),

  // ── authorship ──
  /** Original author; preserved across edits by other members (legacy `writer` semantics). */
  authorId: v.id('users'),
  lastEditedByUserId: v.optional(v.id('users')),
  /**
   * Who actually paid. Undefined == authorId. v1 has no payer picker, but "who paid" is a
   * write-time fact and this is the anchor the split/settle feature attaches to (§12).
   */
  paidByUserId: v.optional(v.id('users')),

  // ── content ──
  memo: v.string(),                     // '' rather than optional: search index needs a real field
  location: v.optional(v.object({
    label: v.string(),                  // legacy `location.street`, or t('common.unknown')
    lat: v.number(),
    lng: v.number(),
    address: v.optional(v.string()),
    countryCode: v.optional(v.string()),
  })),

  // ── denormalized so the timeline page never joins (`13` §6.3) ──
  photoCount: v.number(),
  coverThumbUrl: v.optional(v.string()),
  commentCount: v.number(),

  // ── seam anchors ──
  /** Links the two legs of a transfer. Unused in v1; see §12. */
  transferGroupId: v.optional(v.string()),

  // ── lifecycle ──
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),
  updatedAt: v.number(),

  // ── migration (D23) ──
  legacyKey: v.optional(v.string()),          // `${ledgerKey}/${itemKey}` — GLOBALLY unique
  legacyLedgerKey: v.optional(v.string()),
  legacyWriterUid: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),
  /** JSON of anything unmodeled (the raw expo-location blob, the legacy `amount` string). NEVER parsed. */
  legacyRaw: v.optional(v.string()),
})
  .index('by_ledgerId_deletedAt_dayKey_occurredAt',
    ['ledgerId', 'deletedAt', 'dayKey', 'occurredAt'])
  .index('by_ledgerId_deletedAt_categoryId_dayKey_occurredAt',
    ['ledgerId', 'deletedAt', 'categoryId', 'dayKey', 'occurredAt'])
  .index('by_ledgerId_deletedAt_authorId_dayKey_occurredAt',
    ['ledgerId', 'deletedAt', 'authorId', 'dayKey', 'occurredAt'])
  .index('by_ledgerId_deletedAt_type_dayKey_occurredAt',
    ['ledgerId', 'deletedAt', 'type', 'dayKey', 'occurredAt'])
  .index('by_legacyKey', ['legacyKey'])
  .searchIndex('search_memo', {
    searchField: 'memo',
    filterFields: ['ledgerId', 'deletedAt', 'type', 'categoryId'],
  });
```

Six indexes on a 32-index budget — deliberate headroom for `by_ledgerId_deletedAt_externalKey`
(CSV import dedupe) and `by_ledgerId_recurrenceId`, both addable later with `staged: true`.

| Index | Exact query it serves (screen) |
|---|---|
| `by_ledgerId_deletedAt_dayKey_occurredAt` | **The workhorse.** (a) *Calendar day tap* → `.eq(ledgerId).eq(deletedAt, undefined).eq(dayKey, 20260824)`, `.order('desc')`, paginate 30. (b) *Timeline tab* → same, `.gte(dayKey, monthStart).lte(dayKey, monthEnd)`, paginate 30. (c) *Whole-ledger infinite scroll* → no key range, `.order('desc')`, paginate 30. (d) *Salary-cycle report* → `.gte/.lte` over an arbitrary dayKey window. (e) *Rollup repair job* → one month at a time, 500/batch. |
| `by_ledgerId_deletedAt_categoryId_dayKey_occurredAt` | *Category drill-down* from the donut chart and from the 12-month trend screen: `.eq(ledgerId).eq(deletedAt, undefined).eq(categoryId, id).gte(dayKey, …).lte(dayKey, …)`, paginate 30. Also the multi-select category filter via `mergedStream` over one stream per selected category (`13` §2.6). |
| `by_ledgerId_deletedAt_authorId_dayKey_occurredAt` | *Per-member spending view* ("what did 아빠 spend this month"). Included now because adding an index to a 100k table later requires a `staged: true` backfill window, and this is a v1.1 certainty. |
| `by_ledgerId_deletedAt_type_dayKey_occurredAt` | *Expense-only / income-only timeline* (the legacy CONSUME/INCOME segmented control on Tab3's list), without a JS post-filter that would produce short pages. |
| `by_legacyKey` | Migration pass-2 dedupe (`14` §6.1). Also the only way to answer "which Convex row is this RTDB item". |
| `search_memo` | *Tab2's in-list search.* Legacy filtered the whole in-memory item array on every keystroke with no debounce (`02` S6). `.withSearchIndex(q => q.search('memo', term).eq('ledgerId', id).eq('deletedAt', undefined)).take(20)`. **Cost note:** search storage is the smallest Convex allowance (0.5 GB free, `13` §9). Index a memo truncated to 200 chars if it becomes a cost problem. |

**Why `deletedAt` is field #2 everywhere:** if it were filtered in JS after pagination, a page would
come back short whenever the range contained deleted rows, and the client would have to keep calling
`loadMore` until `isDone` (the documented FightingHows compromise, `09` §3.1). Putting it in the
index means every page is exactly `numItems` long.

**Why not `_creationTime` ordering:** items sort by `occurredAt`, the *user-chosen* transaction time.
A receipt entered on Sunday for Friday's dinner belongs on Friday.

### 5.9 `schema/itemPhotos.ts` (D13)

```ts
export const photoMigrationStateValidator = v.union(
  v.literal('NATIVE'),    // uploaded through the app; nothing to migrate
  v.literal('PENDING'), v.literal('DONE'), v.literal('MISSING'), v.literal('FAILED'),
);

/**
 * The legacy `item.picture[]` array (`02` §7.3) becomes a table.
 *
 * A table, not an array, because:
 *  - the migration needs a per-photo retry state machine anyway (`14` §5.3);
 *  - a ledger-wide photo gallery becomes one indexed range instead of a fan-out;
 *  - receipt OCR, dimensions, byte size and thumbnails are per-photo columns that would otherwise
 *    force a nested-object array and a 1 MiB document ceiling;
 *  - array -> table is one of the few genuinely expensive retrofits (every read path changes).
 *
 * `ledgerItems.photoCount` and `coverThumbUrl` are denormalized so the timeline page reads ZERO
 * photo documents.
 */
export const itemPhotosTable = defineTable({
  itemId: v.id('ledgerItems'),
  ledgerId: v.id('ledgers'),              // denormalized: authz + gallery + shard-by-ledger workers
  order: v.number(),

  storageId: v.optional(v.id('_storage')),
  thumbStorageId: v.optional(v.id('_storage')),
  /** Denormalized getUrl results — never call ctx.storage.getUrl per row in a list query. */
  url: v.optional(v.string()),
  thumbUrl: v.optional(v.string()),

  width: v.optional(v.number()),
  height: v.optional(v.number()),
  byteSize: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  capturedAt: v.optional(v.number()),

  uploadedByUserId: v.optional(v.id('users')),
  deletedAt: v.optional(v.number()),

  // ── migration (`14` §5.3) ──
  migrationState: photoMigrationStateValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  legacyKey: v.optional(v.string()),        // `${ledgerKey}/${itemKey}/${order}`
  legacyPath: v.optional(v.string()),       // picture[i].path — absent on cloud-function-era rows
  legacyUrl: v.optional(v.string()),        // one of three URL shapes
  legacyIsBase64: v.optional(v.boolean()),
  sourceMd5: v.optional(v.string()),
})
  .index('by_itemId_deletedAt_order', ['itemId', 'deletedAt', 'order'])
  .index('by_ledgerId_deletedAt', ['ledgerId', 'deletedAt'])
  .index('by_migrationState_attempts', ['migrationState', 'attempts'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * Blob ownership. Convex records no uploader on `_storage`, so a mutation handed a storage id
 * cannot tell a member's own file from one they guessed (`09` §7). First-claim-wins.
 */
export const uploadsTable = defineTable({
  storageId: v.id('_storage'),
  userId: v.id('users'),
  byteSize: v.number(),
}).index('by_storageId', ['storageId']);
```

| Index | Exact query |
|---|---|
| `by_itemId_deletedAt_order` | Item detail: the 6-photo preview grid and the full-screen swiper. `.take(PHOTO_SCAN_LIMIT = 20)`. |
| `by_ledgerId_deletedAt` | **New feature the table buys for free:** a ledger-wide receipt gallery, paginated newest-upload-first. The legacy `SeeAllPicture` screen only ever showed one item's photos. |
| `by_migrationState_attempts` | The photo-migration worker's `nextPendingPhotos` (`.eq('PENDING')`, ascending `attempts` so repeated failures deprioritize themselves). Also the cutover gate: `count(PENDING) + count(FAILED) === 0`. |
| `by_legacyKey` | Idempotent re-runs of the import. |
| `uploads.by_storageId` | `claimUpload` ownership check; the nightly orphan sweep. |

### 5.10 `schema/itemComments.ts` (D21)

```ts
/**
 * Legacy `items/{i}/reviews/{reviewKey}` (`02` §3.1). Two legacy defects are fixed structurally:
 *  1. Every item save rewrote the whole item INCLUDING its reviews, so a comment added between
 *     load and save was silently destroyed (`02` S12). Separate documents cannot collide.
 *  2. The detail screen did a `users/{writer}/info` read PER review (N+1) and re-sorted inside each
 *     callback (`02` S10). `loadAuthorMap` (`09` §6) turns that into one read per distinct author.
 */
export const itemCommentsTable = defineTable({
  itemId: v.id('ledgerItems'),
  ledgerId: v.id('ledgers'),            // denormalized for the membership gate without a join
  authorId: v.id('users'),
  body: v.string(),
  /** One level of threading. Legacy was flat; replies are the cheapest possible upgrade. */
  parentId: v.optional(v.id('itemComments')),
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),

  legacyKey: v.optional(v.string()),    // `${ledgerKey}/${itemKey}/${reviewKey}`
  legacyWriterUid: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),
})
  .index('by_itemId_deletedAt', ['itemId', 'deletedAt'])
  .index('by_parentId_deletedAt', ['parentId', 'deletedAt'])
  .index('by_authorId', ['authorId'])
  .index('by_legacyKey', ['legacyKey']);
```

| Index | Exact query |
|---|---|
| `by_itemId_deletedAt` | Item detail comment thread. `_creationTime` auto-appends, so this index already orders by post time — no explicit sort field needed. `.eq(parentId, undefined)` is filtered in JS over the bounded page; root comments paginate 20. |
| `by_parentId_deletedAt` | Replies under one root comment, `.take(REPLY_SCAN_LIMIT = 100)`. |
| `by_authorId` | Account deletion ("anonymize my comments") and moderation ("show everything this user wrote"). |
| `by_legacyKey` | Migration dedupe. |

### 5.11 `schema/rollups.ts` (D9, D10)

```ts
/**
 * ROLLUP CONTRACT (applies to all three tables)
 *
 *  - Maintained by `convex-helpers/server/triggers` registered on `ledgerItems`, so no mutation can
 *    forget. insert => +delta, delete => -delta, update => -old +new. A throw inside the trigger
 *    aborts the whole mutation atomically (`13` §5.4).
 *  - All money is in the ledger's baseCurrency, summed from `ledgerItems.baseAmountMinor`.
 *  - TRANSFER contributes to `transferMinor` only, never to income or expense.
 *  - Soft deletes apply the negative delta; undelete re-applies the positive one.
 *  - Rows are never deleted, only zeroed — a zeroed row is reused on the next write.
 *  - `shard` is the D8 contention shard, always last in the index so a prefix range sums all shards.
 *  - A nightly cron recomputes the most recently touched (ledger, month) triples FROM SOURCE and
 *    patches any disagreement. That safety net is what makes denormalization shippable.
 */

export const ledgerDailyRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  dayKey: v.number(),
  shard: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  transferMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledgerId_dayKey_shard', ['ledgerId', 'dayKey', 'shard']);

export const ledgerMonthlyRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  shard: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  transferMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledgerId_monthKey_shard', ['ledgerId', 'monthKey', 'shard']);

export const ledgerCategoryMonthlyRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  categoryId: v.id('categories'),
  shard: v.number(),
  /** Only one of these is ever non-zero for a given categoryId (a category has one kind). */
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  .index('by_ledgerId_monthKey_categoryId_shard',
    ['ledgerId', 'monthKey', 'categoryId', 'shard'])
  .index('by_ledgerId_categoryId_monthKey_shard',
    ['ledgerId', 'categoryId', 'monthKey', 'shard']);
```

| Index | Exact query |
|---|---|
| `ledgerDailyRollups.by_ledgerId_dayKey_shard` | (a) **Calendar month grid** — `.gte(dayKey, 20260801).lte(dayKey, 20260831)` gives the event dots *and* each day's income/expense subtotal in ≤31 documents. Legacy computed the dots with an O(n²) `moment().isSame()` scan over every item in the ledger (`02` S5). (b) **Timeline section headers** — the per-day subtotal row above each group, paginated alongside the item list. (c) **Arbitrary period totals** (salary cycle, "last 30 days") — ≤62 documents, which is why `monthKey` never has to become period-relative (D10). |
| `ledgerMonthlyRollups.by_ledgerId_monthKey_shard` | (a) **Month header tile** — one document. (b) **Running balance / "잔액"** — `.gte(monthKey, firstMonth).lte(monthKey, currentMonth)` = ≤120 documents for a decade; the legacy version summed every item in the ledger on every render (`02` S5, Tab3). (c) **12-month bar of totals** on the stats tab. |
| `ledgerCategoryMonthlyRollups.by_ledgerId_monthKey_categoryId_shard` | **The donut chart.** One month, all categories: ≤34 documents. Legacy walked all 100k items per render. |
| `ledgerCategoryMonthlyRollups.by_ledgerId_categoryId_monthKey_shard` | **`LedgerLineGraph` — the 12-month trend for one category.** `.eq(categoryId).gte(monthKey, y*100+1).lte(monthKey, y*100+12)` = 12 documents. Legacy iterated every item in the ledger and matched on the *translated category label string* (`01` §5.19). |

**Why two tables and not one with `categoryId: v.optional(...)`** (note `13` §3.3 suggested the
optional form): the two access patterns want different index orders (`monthKey`-major for the donut,
`categoryId`-major for the trend), the category table needs `categoryId` to be a real non-optional
FK, and a whole-month read never touches a category row. Two tables cost one extra file and remove
every `undefined`-as-sentinel subtlety.

**Why no `@convex-dev/aggregate` in v1:** every number on every v1 screen is answered by a
1–120 document read from a table whose read set is a single narrow index range. The aggregate
component's B-tree costs a shared internal-node structure that makes concurrent inserts contend
(`13` §3.2) and re-runs subscriptions across the whole tree. It is the right tool for
*arbitrary-date-range* reports and offset jumps — which is the v2 report screen — and it is added
then, namespaced by `ledgerId`, never globally.

### 5.12 `schema/ledgerActivity.ts` (D14)

```ts
export const activityKindValidator = v.union(
  v.literal('ITEM_CREATED'), v.literal('ITEM_UPDATED'), v.literal('ITEM_DELETED'),
  v.literal('ITEM_RESTORED'),
  v.literal('COMMENT_ADDED'), v.literal('COMMENT_DELETED'),
  v.literal('PHOTO_ADDED'), v.literal('PHOTO_DELETED'),
  v.literal('MEMBER_JOINED'), v.literal('MEMBER_LEFT'), v.literal('MEMBER_REMOVED'),
  v.literal('ROLE_CHANGED'), v.literal('OWNER_TRANSFERRED'),
  v.literal('INVITE_CREATED'), v.literal('INVITE_REVOKED'),
  v.literal('JOIN_REQUESTED'), v.literal('JOIN_APPROVED'), v.literal('JOIN_REJECTED'),
  v.literal('LEDGER_UPDATED'), v.literal('LEDGER_ARCHIVED'), v.literal('LEDGER_RESTORED'),
  v.literal('CATEGORY_CREATED'), v.literal('CATEGORY_UPDATED'), v.literal('CATEGORY_DELETED'),
  v.literal('CURRENCY_CONFIRMED'), v.literal('TIMEZONE_CHANGED'),
);

export const activityRetentionValidator = v.union(
  v.literal('FEED'),    // purged after 180 days by cron
  v.literal('AUDIT'),   // kept forever: membership, roles, ownership, settings, currency, timezone
);

/**
 * Per-ledger, append-only. THE trust feature of a shared ledger: "who changed what, when".
 *
 * Deliberately NOT fanned out to a per-user notification row: a 6-member ledger would pay 6 extra
 * document writes per expense. The unseen badge comes from
 *   .eq(ledgerId).gt(_creationTime, member.lastSeenActivityAt).take(50)
 * which is O(unseen), not O(members).
 *
 * Ordering is `_creationTime` — here, and only on append-only tables like this, creation order IS
 * the domain order.
 */
export const ledgerActivityTable = defineTable({
  ledgerId: v.id('ledgers'),
  actorUserId: v.optional(v.id('users')),   // undefined for system/cron actions
  kind: activityKindValidator,
  retention: activityRetentionValidator,

  // targets — at most one is set
  itemId: v.optional(v.id('ledgerItems')),
  commentId: v.optional(v.id('itemComments')),
  targetUserId: v.optional(v.id('users')),
  categoryId: v.optional(v.id('categories')),
  inviteId: v.optional(v.id('ledgerInvites')),

  // render snapshot — so the feed renders correctly even after the target is deleted
  amountMinor: v.optional(v.number()),
  currency: v.optional(v.string()),
  categoryLabelSnapshot: v.optional(v.string()),
  memoSnapshot: v.optional(v.string()),
  roleBefore: v.optional(ledgerRoleValidator),
  roleAfter: v.optional(ledgerRoleValidator),

  /** Rendered as a diff hint. NEVER parsed for logic — that is the whole reason it is a string. */
  detailsJson: v.optional(v.string()),
})
  .index('by_ledgerId_retention', ['ledgerId', 'retention'])
  .index('by_ledgerId_actorUserId', ['ledgerId', 'actorUserId'])
  .index('by_ledgerId_itemId', ['ledgerId', 'itemId']);
```

| Index | Exact query |
|---|---|
| `by_ledgerId_retention` | (a) **The activity feed screen** — two subscriptions merged, or `.eq(retention,'FEED')` for the casual feed. `_creationTime` desc, paginate 30. (b) **The unseen badge** — `.gt('_creationTime', lastSeenActivityAt).take(50)`, rendered as "50+". (c) **The purge cron** — `.eq(retention,'FEED')` with an old `_creationTime` upper bound, 200/batch. AUDIT rows are structurally unreachable by the purge, which is the point of the field. |
| `by_ledgerId_actorUserId` | "Everything 아빠 did in this ledger" — the per-member accountability view. |
| `by_ledgerId_itemId` | The edit history strip on the item detail screen ("edited by 엄마 2 days ago"), `.take(20)`. |

### 5.13 `schema/notifications.ts`

```ts
export const notificationKindValidator = v.union(
  v.literal('LEDGER_INVITE'),
  v.literal('JOIN_REQUEST'),
  v.literal('JOIN_DECISION'),
  v.literal('MENTION'),
  v.literal('COMMENT'),
  v.literal('BUDGET_ALERT'),
  v.literal('SETTLEMENT'),
  v.literal('SYSTEM'),
);

/**
 * CROSS-LEDGER, PER-USER inbox. Deliberately narrow: routine "someone added an expense" traffic
 * lives in `ledgerActivity` (no fan-out). A row is written here only when the event needs per-user
 * read/unread state or arrives when the user is not looking at that ledger.
 *
 * Text is stored as i18n KEYS, not sentences, so `sendExpoPush` can localize per recipient from
 * `userProfiles.locale` — the thing FightingHows structurally cannot do (`09` §11.2).
 */
export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,
  titleKey: v.string(),
  bodyKey: v.string(),
  params: v.optional(v.record(v.string(), v.string())),
  /** English, so an unknown key on an old client still renders something. */
  fallbackText: v.optional(v.string()),
  route: v.optional(v.string()),          // expo-router deep link, e.g. /ledger/<id>/item/<id>
  ledgerId: v.optional(v.id('ledgers')),
  readAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  .index('by_userId_deletedAt', ['userId', 'deletedAt'])
  .index('by_userId_deletedAt_readAt', ['userId', 'deletedAt', 'readAt']);

export const pushTokensTable = defineTable({
  userId: v.id('users'),
  token: v.string(),                       // ExponentPushToken[...]
  platform: v.union(v.literal('ios'), v.literal('android')),
  deviceName: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_userId', ['userId'])
  .index('by_token', ['token']);
```

| Index | Exact query |
|---|---|
| `notifications.by_userId_deletedAt` | The inbox list, `.order('desc')`, paginate 30. |
| `notifications.by_userId_deletedAt_readAt` | The tab-bar unread badge. `deletedAt` sits in the middle deliberately so an inbox full of read rows is skipped **by the index** rather than walked and discarded by a post-filter (`09` §3.1). `.eq(readAt, undefined).take(100).length`, rendered as "99+". |
| `pushTokens.by_userId` | Push fan-out: collect a recipient's device tokens. The only sanctioned `.collect()` in the codebase — bounded by devices-a-person-owns. |
| `pushTokens.by_token` | Upsert keyed on the **token string, not the user** — Expo rotates tokens and a device can be handed to another account, so an existing row is re-pointed rather than duplicated (`09` §10.2). Also the `DeviceNotRegistered` self-healing GC. |

### 5.14 `schema/moderation.ts`

Required by App Store guideline 1.2 the moment BooKoo ships public `@handle`s, ledger search and
comments — all three of which it does (`09` §11.1).

```ts
export const reportTargetKindValidator = v.union(
  v.literal('USER'), v.literal('LEDGER'), v.literal('ITEM'), v.literal('COMMENT'),
);
export const reportReasonValidator = v.union(
  v.literal('SPAM'), v.literal('HARASSMENT'), v.literal('IMPERSONATION'),
  v.literal('SEXUAL'), v.literal('FRAUD'), v.literal('OTHER'),
);
export const reportStatusValidator = v.union(
  v.literal('OPEN'), v.literal('REVIEWING'), v.literal('ACTIONED'), v.literal('DISMISSED'),
);

export const contentReportsTable = defineTable({
  reporterUserId: v.id('users'),
  targetKind: reportTargetKindValidator,
  targetUserId: v.optional(v.id('users')),
  targetLedgerId: v.optional(v.id('ledgers')),
  targetItemId: v.optional(v.id('ledgerItems')),
  targetCommentId: v.optional(v.id('itemComments')),
  reason: reportReasonValidator,
  note: v.optional(v.string()),
  status: reportStatusValidator,
  handledByUserId: v.optional(v.id('users')),
  handledAt: v.optional(v.number()),
})
  .index('by_status', ['status'])
  .index('by_reporterUserId', ['reporterUserId'])
  .index('by_targetUserId_status', ['targetUserId', 'status']);

export const userBlocksTable = defineTable({
  blockerUserId: v.id('users'),
  blockedUserId: v.id('users'),
})
  .index('by_blockerUserId_blockedUserId', ['blockerUserId', 'blockedUserId'])
  .index('by_blockedUserId', ['blockedUserId']);
```

| Index | Exact query |
|---|---|
| `contentReports.by_status` | Moderation queue, `.eq('OPEN')`, `_creationTime` asc, paginate 30. |
| `contentReports.by_reporterUserId` | Rate-limit "this user filed 40 reports today"; the reporter's own history. |
| `contentReports.by_targetUserId_status` | "Has this account been reported before" on the moderation detail screen. |
| `userBlocks.by_blockerUserId_blockedUserId` | O(1) "is B blocked by A" — checked when rendering a comment author and when resolving an invite. |
| `userBlocks.by_blockedUserId` | Reverse check when someone tries to invite a user who has blocked them. |

### 5.15 `schema/feedback.ts`

```ts
export const feedbackCategoryValidator = v.union(
  v.literal('BUG'), v.literal('FEATURE'), v.literal('QUESTION'), v.literal('OTHER'),
);
export const feedbackStatusValidator = v.union(
  v.literal('NEW'), v.literal('TRIAGED'), v.literal('RESOLVED'),
);

/**
 * The legacy `bookoo/opinions` node (`02` §10): write-only, never read by the app, and it stored a
 * denormalized copy of the Firebase Auth user object with `createdAt` as a bare 'YYYY-MM-DD'.
 * Here it is a real support inbox with device context attached, so a bug report is actionable.
 */
export const feedbackTable = defineTable({
  userId: v.optional(v.id('users')),      // absent if sent from a signed-out state
  contactEmail: v.optional(v.string()),
  category: feedbackCategoryValidator,
  body: v.string(),
  locale: v.optional(localeValidator),
  appVersion: v.optional(v.string()),
  buildNumber: v.optional(v.number()),
  platform: v.optional(v.union(v.literal('ios'), v.literal('android'))),
  osVersion: v.optional(v.string()),
  deviceModel: v.optional(v.string()),
  status: feedbackStatusValidator,
  adminNote: v.optional(v.string()),

  legacyKey: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),
})
  .index('by_status', ['status'])
  .index('by_userId', ['userId'])
  .index('by_legacyKey', ['legacyKey']);
```

| Index | Exact query |
|---|---|
| `by_status` | Support inbox, `.eq('NEW')`, paginate 30. |
| `by_userId` | "Your previous messages" thread on the feedback screen — the legacy screen was fire-and-forget with no receipt. |
| `by_legacyKey` | Archival import dedupe. |

### 5.16 `schema/appContent.ts`

```ts
/** Singleton. `singleton` is a literal so `by_singleton` is a 1-document read. */
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
  /** Explicit booleans, never v.any(): adding a flag is a one-line schema change. */
  featureRecurring: v.boolean(),
  featureBudgets: v.boolean(),
  featureSplitting: v.boolean(),
  featureCsvImport: v.boolean(),
  featureReceiptOcr: v.boolean(),
  featureMultiCurrencyEntry: v.boolean(),
  updatedAt: v.number(),
}).index('by_singleton', ['singleton']);

/** One row per announcement, all locales inline (bounded at 5) so one read serves any language. */
export const appAnnouncementsTable = defineTable({
  key: v.string(),                          // legacy ANNOUNCEMENT_n
  order: v.number(),
  isPinned: v.boolean(),
  publishedAt: v.optional(v.number()),      // undefined = draft
  expiresAt: v.optional(v.number()),
  translations: v.array(v.object({
    locale: localeValidator,
    title: v.string(),
    body: v.string(),
  })),
})
  .index('by_publishedAt', ['publishedAt'])
  .index('by_key', ['key']);

export const appFaqsTable = defineTable({
  key: v.string(),                          // legacy FAQ_n
  order: v.number(),
  publishedAt: v.optional(v.number()),
  translations: v.array(v.object({
    locale: localeValidator,
    question: v.string(),
    answer: v.string(),
  })),
})
  .index('by_publishedAt', ['publishedAt'])
  .index('by_key', ['key']);
```

| Index | Exact query |
|---|---|
| `appConfig.by_singleton` | Boot-time force-update / maintenance gate and the feature-flag read. One document, cached across every user (same args ⇒ same cache entry). |
| `appAnnouncements.by_publishedAt` | The announcements accordion, `.gt(publishedAt, 0).order('desc').take(50)`. |
| `appFaqs.by_publishedAt` | The FAQ accordion, `.take(50)`. |
| `*.by_key` | Idempotent seeding from `shared/` content and the admin editor's upsert. |

Legacy `ANNOUNCEMENT_*` / `FAQ_*` lived in `STRINGS.js` (22 + 18 keys, `04` §2) and shipping a
correction required an App Store release. Moving them to Convex is a pure win with two tiny tables.

### 5.17 `schema/migration.ts`

```ts
export const claimStateValidator = v.union(
  v.literal('unclaimed'), v.literal('claimed'),
  v.literal('ambiguous'), v.literal('orphan_no_email'),
);

/** Staging for Firebase Auth identities. Adopted from `14` §3.4 unchanged. */
export const legacyUsersTable = defineTable({
  legacyUid: v.string(),
  emailNormalized: v.optional(v.string()),
  emailRaw: v.optional(v.string()),
  emailVerifiedAt: v.optional(v.number()),
  displayName: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  statusMsg: v.optional(v.string()),
  tel: v.optional(v.string()),
  providers: v.array(v.string()),
  legacyCreatedAt: v.number(),
  legacyLastSignInAt: v.optional(v.number()),
  claimState: claimStateValidator,
  claimedByUserId: v.optional(v.id('users')),
  claimedAt: v.optional(v.number()),
  placeholderUserId: v.optional(v.id('users')),
})
  .index('by_legacyUid', ['legacyUid'])
  .index('by_emailNormalized', ['emailNormalized'])
  .index('by_claimState', ['claimState']);

/** Archive of `bookoo/invites` so a pending invite can be re-issued as a modern link. */
export const legacyInvitesTable = defineTable({
  legacyKey: v.string(),                      // `${ledgerKey}/${encodedEmail}`
  legacyLedgerKey: v.string(),
  emailNormalized: v.string(),
  reissuedInviteId: v.optional(v.id('ledgerInvites')),
  resolution: v.union(
    v.literal('PENDING'), v.literal('REISSUED'),
    v.literal('ALREADY_MEMBER'),              // orphan from the legacy Promise.all bugs (`02` §4)
    v.literal('DROPPED'),
  ),
}).index('by_legacyKey', ['legacyKey']).index('by_resolution', ['resolution']);

/**
 * Generic cursor holder for every long-running internal job: the migration passes, the ledger purge
 * cascade, the timezone backfill, the rollup repair, and the orphan-blob sweep. One table instead of
 * five one-row tables.
 */
export const maintenanceJobsTable = defineTable({
  jobKey: v.string(),                         // 'purge:ledger:<id>' | 'rollupRepair' | 'tzBackfill:<id>'
  phase: v.string(),
  cursor: v.optional(v.string()),
  startedAt: v.number(),
  updatedAt: v.number(),
  finishedAt: v.optional(v.number()),
  processed: v.number(),
  lastError: v.optional(v.string()),
  requestedByUserId: v.optional(v.id('users')),
}).index('by_jobKey', ['jobKey']).index('by_finishedAt', ['finishedAt']);
```

| Index | Exact query |
|---|---|
| `legacyUsers.by_legacyUid` | Import pass 1/2 resolution; the ops "who is this uid" lookup. |
| `legacyUsers.by_emailNormalized` | **Claim-on-first-sign-in.** A verified email arrives → find the legacy identity → link it. |
| `legacyUsers.by_claimState` | Ops dashboard: how many accounts are still unclaimed / ambiguous / orphaned. Drives the "should we keep the Firebase project alive" decision. |
| `legacyInvites.by_resolution` | The reconciliation pass that drops invites whose email already resolves to a member. |
| `maintenanceJobs.by_jobKey` | Every self-rescheduling batch mutation reads its own cursor. |
| `maintenanceJobs.by_finishedAt` | Ops: what is currently running. |

---

## 6. Read path — every main screen, at 100,000 items

Assumptions: one ledger with **100,000 items**, 6 members, 40 categories, 10 years (≈120 months,
≈3,650 days), 5,000 photos. `SHARD_COUNT = 1`. Every count below is **independent of the 100,000**
unless stated.

| # | Screen | Query | Index | Docs read (page 0) | Grows with items? |
|---|---|---|---|---|---|
| 1 | **Ledger switcher / drawer** | `ledgers.listMine` | `ledgerMembers.by_userId_deletedAt` → ≤20; `ctx.db.get('ledgers')` ×20; `ledgerStats.by_ledgerId_shard` ×20 | **≈60** | No |
| 1b | pending-request dot | `ledgerJoinRequests.by_ledgerId_status` `.take(1)` per owned ledger | ≤20 | **≤20** | No |
| 2 | **Calendar tab (month grid)** | `rollups.daysOfMonth` | `ledgerDailyRollups.by_ledgerId_dayKey_shard` range | **≤31** | No |
| 2b | month header tile | `rollups.month` | `ledgerMonthlyRollups.by_ledgerId_monthKey_shard` | **1** | No |
| 3 | **Selected-day list** | `items.listByDay` paginate 30 | `ledgerItems.by_ledgerId_deletedAt_dayKey_occurredAt` `.eq(dayKey)` | **≤30** + members ≤6 + categories ≤40 (separate cached query) = **≈76** | No |
| 4 | **Timeline tab** | `items.list` paginate 30 **+** `rollups.daysPage` paginate 30 (section headers, merged client-side by `dayKey` — `13` §5.2) | same primary index; `by_ledgerId_dayKey_shard` | **≤60** + members ≤6 = **≈66** | No (each `loadMore` is +30) |
| 5 | **Timeline search** | `items.search` `.take(20)` | `search_memo` | **≤20** (search scans ≤1,024) | No |
| 6 | **Stats tab (donut)** | `rollups.categoriesOfMonth` | `ledgerCategoryMonthlyRollups.by_ledgerId_monthKey_categoryId_shard` range | **≤40** | No |
| 6b | running balance in the donut centre | `rollups.balanceThrough` | `ledgerMonthlyRollups.by_ledgerId_monthKey_shard` range over all months | **≤120** | No (grows with *years*) |
| 7 | **Category 12-month trend** | `rollups.categoryTrend` | `ledgerCategoryMonthlyRollups.by_ledgerId_categoryId_monthKey_shard` range | **12** | No |
| 7b | trend month drill-down | `items.listByCategory` paginate 30 | `by_ledgerId_deletedAt_categoryId_dayKey_occurredAt` | **≤30** | No |
| 8 | **Item detail** | `items.get` + `photos.listByItem` + `comments.listRoots` paginate 20 | `ctx.db.get`; `itemPhotos.by_itemId_deletedAt_order`; `itemComments.by_itemId_deletedAt` | 1 + ≤10 + ≤20 + authors ≤6 + category 1 = **≈38** | No |
| 8b | edit-history strip | `activity.listForItem` `.take(20)` | `ledgerActivity.by_ledgerId_itemId` | **≤20** | No |
| 9 | **Item add / edit sheet** | `categories.list` `.take(200)` + `tags.suggest` `.take(20)` + `ledgers.get` | `categories.by_ledgerId_deletedAt_order`; `tags.by_ledgerId_deletedAt_usageCount` | ≤40 + ≤20 + 1 + membership 1 = **≈62** | No |
| 10 | **Members screen** | `members.list` `.take(200)` + profiles + `invites.listPending` `.take(100)` + `requests.listPending` `.take(100)` | `ledgerMembers.by_ledgerId_deletedAt_role`; `userProfiles.by_userId`; `ledgerInvites.by_ledgerId_status`; `ledgerJoinRequests.by_ledgerId_status` | ≤6 + ≤6 + ≤20 + ≤20 = **≈52** | No |
| 11 | **Ledger settings (owner)** | `ledgers.get` + membership + `stats` | `ctx.db.get`; `by_ledgerId_userId`; `by_ledgerId_shard` | **3** | No |
| 12 | **Activity feed** | `activity.list` paginate 30 | `ledgerActivity.by_ledgerId_retention` | ≤30 + actors ≤6 = **≈36** | No |
| 12b | unseen badge | `activity.unseenCount` `.take(50)` | same index, `.gt('_creationTime', lastSeenActivityAt)` | **≤50** | No |
| 13 | **Notification inbox** | `notifications.list` paginate 30 | `notifications.by_userId_deletedAt` | **≤30** | No |
| 13b | tab-bar badge | `notifications.unreadCount` `.take(100)` | `by_userId_deletedAt_readAt` | **≤100** | No |
| 14 | **Public profile `/@handle`** | `users.byHandle` | `userProfiles.by_handleKey` | **1** | No |
| 15 | **Ledger photo gallery** | `photos.listByLedger` paginate 40 | `itemPhotos.by_ledgerId_deletedAt` | **≤40** | No |
| 16 | **Onboarding: claim handle** | `checkHandleAvailability` + `suggestAvailable` | `userHandles.by_handleKey` ×(1 + ≤12) | **≤13** | No |
| 17 | **Ledger discovery search** | `ledgers.search` `.take(20)` | `ledgers.search_title` | ≤20 + owner profiles ≤20 = **≤40** | No |
| 18 | **Settings / announcements / FAQ** | `appConfig.get` + `announcements.list` `.take(50)` | `by_singleton`; `by_publishedAt` | **≤51** | No |

**The headline: no screen reads more than ~120 documents, at any ledger size.** The two numbers that
grow at all grow with *years of history* (the ≤120 monthly rollup rows) or with *page count*, never
with item count. Compare the legacy app, where opening the drawer downloaded every item, every
review and every photo record of every ledger the user belonged to (`02` S1–S3).

**Subscription budget per screen** (`13` §4.2, target ≤10): the timeline tab is the worst case —
1 membership + 1 ledger + 1 categories + 1 month rollup + 2 paginated lists (each loaded page is its
own subscription, but with disjoint cursor ranges) + 1 activity badge = **7 live queries**, and
inserting a new item at the head invalidates exactly page 0 of the two lists plus the two rollup
reads. Not the whole ledger.

**Cold start**: `api.ledgers.listMine`, `api.rollups.month`, and page 0 of `api.items.list` are the
three screen-defining queries written through to MMKV (`13` §7.4).

---

## 7. Write path — every mutation, documents written, OCC surface

`R` = documents read, `W` = documents written. Assumes the triggers-wrapped `customMutation`
(`13` §5.4), so rollup maintenance cannot be forgotten.

| Mutation | Documents written | OCC contention |
|---|---|---|
| **`items.create`** | `ledgerItems` +1 · `ledgerDailyRollups` upsert 1 · `ledgerMonthlyRollups` upsert 1 · `ledgerCategoryMonthlyRollups` upsert 1 · `ledgerStats` patch 1 · `ledgerActivity` +1 → **W=6** (+1 `itemPhotos` and +1 `uploads` per photo). Push fan-out is `ctx.scheduler.runAfter(0, …)` — 0 documents. | **The three rollup rows + `ledgerStats`.** Two members entering an expense in the same category on the same day in the same second conflict on all four. At household scale (2–6 writers) Convex's automatic retries absorb it entirely. `shard` (D8) converts this into a one-constant fix if a ledger ever has 50 writers. `ledgers` is **read but never written**, which is the whole point of D11 — otherwise every concurrent entry would also conflict on the ledger document, and every query that read the ledger would re-run. |
| **`items.update`** (amount/date/category changed) | `ledgerItems` patch 1 · rollups: **-old delta then +new delta**, so up to 6 rollup rows if the day/month/category all changed · `ledgerStats` 1 · `ledgerActivity` +1 → **W≤9** | Same rows as create, doubled when the item moves between buckets. Editing an item's date from March to April touches both months' rollups. |
| **`items.softDelete`** / `restore` | `ledgerItems` patch 1 · 3 rollup rows · `ledgerStats` 1 · `ledgerActivity` +1 → **W=6** | Same. |
| **`items.attachPhoto`** | `itemPhotos` +1 · `uploads` +1 (first-claim-wins) · `ledgerItems` patch (`photoCount`, `coverThumbUrl`) 1 · `ledgerStats` 1 · `ledgerActivity` +1 → **W=5** | `ledgerItems` row (only the item's own author is realistically touching it) and `ledgerStats`. The `getUrl` result is denormalized **here**, once, never per list read (`13` §6.3). |
| **`comments.create`** | `itemComments` +1 · `ledgerItems.commentCount` patch 1 · `ledgerStats` 1 · `ledgerActivity` +1 · `notifications` +1 (item author only, if they want it) → **W=5** | `ledgerItems` row: two people commenting on the *same* item at the same moment. Rare; retries absorb it. Note the legacy design rewrote the entire item **including every review** on every save (`02` S12) — a comment added between load and save was silently destroyed. Separate documents make that impossible. |
| **`ledgers.create`** | `ledgers` +1 · `ledgerMembers` +1 · `ledgerStats` +1 · **`categories` +34** · `ledgerActivity` +1 → **W=38** | None (all new documents). Well inside the 16,000-writes limit. |
| **`ledgers.update`** | `ledgers` patch 1 · `ledgerActivity` +1 → **W=2** | `ledgers` document — but only settings writers touch it, and item writes never do. |
| **`ledgers.transferOwnership`** | `ledgerMembers` ×2 patch · `ledgers` patch 1 · `ledgerActivity` +1 → **W=4** | Two concurrent transfers conflict on `ledgers`; the last-owner guard reads `by_ledgerId_deletedAt_role` `.eq('OWNER')` in the same transaction, so a race cannot produce two owners. |
| **`ledgers.updateTimezone`** | `ledgers` patch 1 · `maintenanceJobs` +1 · `ledgerActivity` +1 → **W=3**, then a batched job rewriting ≤500 `ledgerItems` per transaction plus a rollup rebuild | The backfill job is the only place that mass-writes `ledgerItems`. It runs at `runAfter(0)` chain granularity so each batch is a fresh transaction. |
| **`ledgers.archive` / `restore`** | `ledgers` patch 1 · `ledgerActivity` +1 → **W=2** | None. |
| **`ledgers.delete`** | `ledgers` patch (`deletedAt`) 1 · `maintenanceJobs` +1 → **W=2**, then a **self-rescheduling cascade** (`09` §9.5) purging `ledgerItems`, `itemPhotos` (+ blobs), `itemComments`, `categories`, `tags`, 3 rollup tables, `ledgerMembers`, `ledgerInvites`, `ledgerJoinRequests`, `ledgerActivity`, `ledgerStats` at 200 rows/batch | None — an unbounded cascade must never be one mutation. Legacy `deleteLedger` removed the ledger node and left **every other member's `users/{uid}/ledgers` pointer dangling**, which then threw and wiped the whole ledger list (`02` §9). |
| **`invites.create`** | `ledgerInvites` +1 · `ledgerActivity` +1 → **W=2** (+ an email action, scheduled) | Token uniqueness is a check-then-insert on `by_token`; with 22 crypto-random chars the conflict set is empty in practice. |
| **`invites.accept`** | `ledgerInvites` patch 1 · `ledgerMembers` +1 · `ledgers.memberCount` patch 1 · `ledgerActivity` +1 · `notifications` +1 (owner) → **W=5** | `ledgerInvites` row (two people redeeming the same single-use link — the `useCount < maxUses` check and the increment are in one transaction, so exactly one wins) and `ledgers.memberCount`. Joins are rare. |
| **`invites.revoke`** | `ledgerInvites` patch 1 · `ledgerActivity` +1 → **W=2** | None. |
| **`joinRequests.create`** | `ledgerJoinRequests` +1 · `ledgerActivity` +1 · `notifications` +1 → **W=3** | Duplicate-request guard is a check-then-insert on `by_ledgerId_userId` — narrow range, safe. |
| **`joinRequests.decide`** | `ledgerJoinRequests` patch 1 · (`ledgerMembers` +1 · `ledgers.memberCount` 1 if approved) · `ledgerActivity` +1 · `notifications` +1 → **W≤5** | `ledgers.memberCount`. |
| **`members.changeRole`** | `ledgerMembers` patch 1 · `ledgerActivity` +1 → **W=2** | The last-owner guard reads `by_ledgerId_deletedAt_role` — a narrow range, so it conflicts only with other role writes in the same ledger. |
| **`members.remove` / `leaveLedger`** | `ledgerMembers` patch 1 · `ledgers.memberCount` patch 1 · `ledgerActivity` +1 → **W=3** | `ledgers.memberCount`. **Items authored by the departing member are NOT deleted** — a shared ledger's history must survive its members; `authorId` still resolves to a soft-deleted profile which `toPublicMember` renders as "탈퇴한 사용자". |
| **`categories.create` / `update` / `archive`** | `categories` 1 · `ledgerActivity` +1 → **W=2** | None. Reorder writes ≤40 rows in one transaction. |
| **`markActivitySeen`** | `ledgerMembers` patch 1 → **W=1**, throttled to once per 60 s per member (the `touchLastSeen` pattern, `09` §4.3) | Own row only. Throttled because every write invalidates queries that read the membership row — which is *every* query, since `requireLedgerMember` reads it. **This throttle is load-bearing.** |
| **`users.claimHandle` / `changeHandle`** | `userHandles` 1 · `userProfiles` patch 1 → **W=2** | The narrow `.eq('handleKey', key)` range is the entire conflict set: only someone claiming the *same* handle can conflict, and the loser's re-run correctly sees `HANDLE_TAKEN` (`09` §12.2). |
| **`users.updateProfile`** | `userProfiles` patch 1 → **W=1** | Own row. Note this invalidates every list query that joined this profile — acceptable, and the reason `loadAuthorMap` reads profiles rather than embedding them. |
| **`push.registerToken`** | `pushTokens` upsert 1 → **W=1** | Keyed on the token string; a device handed to a second account re-points the row instead of duplicating. |
| **`feedback.send`** | `feedback` +1 → **W=1** | None. |
| **`reports.create`** | `contentReports` +1 → **W=1** | Rate-limited via `@convex-dev/rate-limiter`. |
| **Nightly `repairRollups` cron** | recomputes the N most recently touched `(ledgerId, monthKey)` pairs from `by_ledgerId_deletedAt_dayKey_occurredAt`, patching only on disagreement | Recompute-from-source, keyed by `(ledgerId, monthKey)` — **idempotent**, so a double run is harmless. This is the safety net that makes denormalization shippable (`13` §5.4). |
| **Nightly `purgeSoftDeleted` cron** | hard-deletes rows `deletedAt < now - 90d` + their blobs, 200/batch | Rollups already excluded them, so a purge can never change a number on screen. |
| **Nightly `purgeActivityFeed` cron** | deletes `ledgerActivity` where `retention === 'FEED'` and `_creationTime < now - 180d` | AUDIT rows are structurally unreachable. |
| **Nightly `sweepOrphanUploads` cron** | deletes `_storage` blobs with no `uploads` row, older than 24 h | Greenfield, so `backfillCompletedAt` is stamped at deploy and the whole FightingHows backfill interlock is dropped (`09` §7). |

### The three OCC hotspots, ranked

1. **`ledgerStats` (every item write).** Sharded by D8. Mitigated further by the fact that it holds
   no money — lifetime totals are a rollup range sum, so `ledgerStats` never needs to be read inside
   a money mutation.
2. **`ledgerMonthlyRollups` for the current month.** Every entry in a month hits one row. This is the
   real contention point and it is exactly what `shard` exists for.
3. **`ledgerMembers` (the membership row) if `markActivitySeen` were unthrottled.** Every query reads
   it; every write to it re-runs every query. Throttled to 60 s.

Everything else is either a new document or a per-user row.

---

## 8. Legacy behaviour → new design (the explicit list)

| Legacy | New design | Why |
|---|---|---|
| `info.color` number `0..5` | `ledgers.colorKey: v.union('pink'\|'orange'\|'yellow'\|'teal'\|'blue'\|'purple')` + a theme token per mode | The legacy colours were hardcoded `rgb()` literals in six screens with no dark variant. A token maps to `{light, dark}` in the cpk-ui theme. Migration is a 6-entry lookup; `legacyColorIndex` is not kept because the mapping is total and lossless. |
| `visible: true` (write-once, never set false) | **Deleted.** Split into `ledgers.archivedAt` (user-facing archive: hidden from the switcher, read-only, restorable) and `ledgers.deletedAt` (soft delete → 90-day purge) | The flag meant nothing in the legacy app (`02` §2.1); the security rules treated it as a soft-delete the client never used. Archive and delete are different products and both are wanted. Migration: every ledger imports with both `undefined`. |
| `owner` (a uid string) + `changeOwner` (patches one field, old owner stays a plain member) | `ledgers.ownerId` denormalized + the authoritative `ledgerMembers` row with `role: 'OWNER'`; transfer demotes the old owner to `ADMIN`, patches both rows, records `ownershipTransferredFromUserId`/`At`, and writes an `OWNER_TRANSFERRED` audit row | Two documents in one transaction cannot drift. `ownerId` lets the switcher render the crown with no extra query. The demote-to-ADMIN is a product improvement: the legacy behaviour silently stripped the founder of all rights. |
| `ledgers/{k}/requests/{uid}` map, discovered by an N-sequential-round-trip scan on every app open | `ledgerJoinRequests` table, `by_ledgerId_status` `.take(1)` for the dot and `.take(100)` for the inbox | The legacy code did `for (let ledger of ledgers) { await getRequestedUsers(...) }` — **serial** awaits, N round trips, on every refresh (`02` S4). Now it is one indexed probe per owned ledger, all issued concurrently. |
| `bookoo/invites` **bidirectional index** (`{ledgerKey}/{encEmail}` and `{encEmail}/{ledgerKey}` in one colliding namespace, with two `Promise.all` bugs producing orphans) | One `ledgerInvites` table with `by_ledgerId_status` (index A's job) and `by_inviteeEmailNormalized_status` (index B's job), plus `by_token` for the deep link | RTDB needed hand-mirrored maps because it has no secondary indexes. Convex has three. Migration classifies each child of `bookoo/invites` by the push-id-vs-`%40` heuristic, decodes with plain `decodeURIComponent`, drops invites whose email already resolves to a member, and archives the rest in `legacyInvites` for re-issue as modern links. |
| `item.picture[]` array of `{path, url}` (+ a `base64: true` variant) | `itemPhotos` table + `ledgerItems.photoCount` / `coverThumbUrl` denormalized | D13. Also gives a ledger-wide gallery, per-photo dimensions and thumbnails, the migration retry state machine, and an OCR seam — none of which fit in an inline array under a 1 MiB document ceiling. |
| `item.location` = a raw expo-location `reverseGeocodeAsync` result with `latitude`/`longitude` injected, of which only `street` was ever read | `ledgerItems.location: v.optional(v.object({label, lat, lng, address?, countryCode?}))`, with the raw blob preserved in `legacyRaw` | The legacy shape varied by platform and locale — genuinely unstructured (`02` §7.2). `label` is `street ?? t('common.unknown')`. Kept **inline** rather than as a `places` table because it is always read with the item and never queried independently in v1; the `places` seam is §12. |
| `item.reviews` map, rewritten wholesale by every item save | `itemComments` table with `parentId` threading and `ledgerItems.commentCount` denormalized | Fixes the lost-update race (`02` S12) and the N+1 author fetch (`02` S10) structurally, and adds replies for the cost of one optional field and one index. |
| **Device-local expo-sqlite `categories` table**, seeded from `INITIAL_CATEGORIES` at install, never synced, lost on reinstall; items carried a denormalized `{iconId, txt, category, showDelBtn}` snapshot | `categories` table, per-ledger, seeded from the 34 presets at ledger creation; `ledgerItems.categoryId` is a real FK; `presetKey` drives i18n so a language switch re-translates | D12. This is the largest single feature gap in the legacy app: member A's custom category was invisible to member B, and a bad `iconId` crashed the list (`Tab1.tsx:224` had no bounds check). Migration uniques `(category, iconId, txt)` across a ledger's items and creates a `categories` row per distinct triple, mapping `iconId 0..33` to `presetKey` via `shared/category.ts`. |
| `amount` (locale-formatted **string**, embedding the *creator's* device currency) + `realAmount` (signed number) | `amountMinor` (non-negative integer minor units) + `currency` + `type` discriminator; `amount` is **not migrated** (kept in `legacyRaw` only) | D1/D2. The legacy pair was a rounding hazard, a sorting hazard, and a lie: a single shared ledger could contain rows formatted in three different currencies because currency was a *device* setting stored nowhere in the database (`02` §6, §16). The belt-and-braces `if (category.category === 0 && realAmount > 0) realAmount = -realAmount` guard disappears entirely, because direction is no longer encoded in the number. |
| `bookoo/opinions/{pushKey}` — write-only, never read, storing a denormalized Auth user object and a bare `'YYYY-MM-DD'` | `feedback` table with `status`, device/app context, an optional `contactEmail`, and `by_userId` so the sender can see their own history | The legacy screen was fire-and-forget with no receipt and no way to reply. Two indexes turn it into a support inbox. Legacy rows import archivally with `legacyKey` + `legacyCreatedAt`. |

Additional legacy elements **folded elsewhere** rather than modeled:

| Legacy | Where it went |
|---|---|
| `users/{uid}/ledgers` mirror map | Deleted. `ledgerMembers.by_userId_deletedAt` replaces it, and cannot go stale the way the legacy map did after `deleteLedger`. |
| `info.people` (always `1`, never read) | Deleted. Real member count is `ledgers.memberCount`, maintained by join/leave. |
| `category.showDelBtn` / `category.img` / `category.key` / `results` / `pictureDelete` | Deleted — UI state that leaked into the persisted model. |
| `LedgerItem.categories` (declared, never written) | Deleted. |
| `push_tokens` map keyed by percent-encoded token | `pushTokens` table keyed by the raw token string with `by_token`. |
| AsyncStorage `LOCKED` / `LOCKED_NUMBER` / `LOCKED_FINGERPRINT` (app-lock PIN in plaintext) | **Not in Convex.** Device-local by design, moved to `expo-secure-store`. A PIN is not shared-ledger data. |
| AsyncStorage `LOCALE` | `userProfiles.locale` + `preferredCurrency` (server-side, so push text is localized per recipient) **and** an MMKV mirror for instant boot. |
| AsyncStorage `selectedLedgerIndex` (an *array index*, which broke whenever ledger order changed) | MMKV, keyed by `Id<'ledgers'>`. Not server data. |
| AsyncStorage `switch_new` / `switch_update` (device-local notification prefs) | `ledgerMembers.notifyNewItem` / `notifyComment` / `notifyBudget` + `userProfiles.pushEnabled`. Per-ledger, per-account, server-side — so muting one noisy ledger is possible at all. |
| `ANNOUNCEMENT_*` / `FAQ_*` in `STRINGS.js` | `appAnnouncements` / `appFaqs`. |

---

## 9. Migration fields — placement summary (D23)

| Table | `legacyUid` | `legacyKey` (value) | `legacyCreatedAt` | Index |
|---|---|---|---|---|
| `userProfiles` | ✅ Firebase Auth `localId` | — | ✅ | `by_legacyUid` |
| `legacyUsers` | ✅ (the join key) | — | ✅ | `by_legacyUid`, `by_emailNormalized`, `by_claimState` |
| `ledgers` | `legacyOwnerUid` | RTDB push id | ✅ (from the push-id timestamp) | `by_legacyKey` |
| `ledgerMembers` | ✅ | `` `${ledgerKey}/${uid}` `` | — | `by_legacyKey` |
| `ledgerItems` | `legacyWriterUid` (+ `legacyLedgerKey`) | `` `${ledgerKey}/${itemKey}` `` | ✅ | `by_legacyKey` |
| `itemComments` | `legacyWriterUid` | `` `${ledgerKey}/${itemKey}/${reviewKey}` `` | ✅ | `by_legacyKey` |
| `itemPhotos` | — | `` `${ledgerKey}/${itemKey}/${order}` `` | — | `by_legacyKey`, `by_migrationState_attempts` |
| `categories` | — | `legacyIconId: v.number()` (0..33) | — | `by_ledgerId_presetKey` |
| `feedback` | — | RTDB push id | ✅ | `by_legacyKey` |
| `legacyInvites` | — | `` `${ledgerKey}/${encodedEmail}` `` | — | `by_legacyKey`, `by_resolution` |

Rules that make these work:

1. **Item keys must be `ledgerKey/itemKey`, never a bare `itemKey`.** RTDB push ids are only unique
   within their parent node; `by_legacyKey(...).unique()` would eventually throw (`14` §6.1).
2. **Never sort on `_creationTime` for migrated data.** Only a JSONL/CSV/ZIP import can set it, and
   the reference-carrying tables go through batch mutations which cannot (`14` §4.3). `ledgerItems`
   sorts on `occurredAt`/`dayKey`, which is the right field anyway.
3. **`occurredAt` resolution order**: `selectedDate` (if a valid ISO string) → `created` → `updated` →
   the push-id timestamp. The legacy `selectedDate` silently vanished whenever the user touched the
   date picker (a raw `Date` object was handed to the Firebase SDK, which serializes own enumerable
   keys — of which `Date` has none), so a fallback chain is mandatory (`02` §8).
4. **`legacyOwnerUid` / `legacyUid` / `legacyWriterUid` are kept permanently**, not dropped after
   pass 2 — they make a re-run of the reference resolution possible after a late account claim.
5. **`legacyRaw`** on `ledgerItems` holds a JSON string of everything unmodeled (the raw geocode blob,
   the `amount` display string, any stray legacy keys). It is **rendered never, parsed never** — it
   exists so a forensic question in 2028 has an answer.

---

## 10. Permission matrix

`convex/lib/permissions.ts` exports, mirroring `09` §4 with a per-ledger ladder added:

```ts
const LEDGER_ROLE_RANK: Record<LedgerRole, number> = {VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3};

getCurrentProfile(ctx)                        // nullable — screens that render signed-out
requireProfile(ctx)                           // session only — onboarding, settings
requireActionUserId(ctx)                      // all an action can prove
requireLedgerMember(ctx, ledgerId)            // ONE indexed read: by_ledgerId_userId
requireLedgerRole(ctx, ledgerId, 'EDITOR')    // ladder check
requireAppAdmin(ctx)                          // moderation + app content
assertCanMutateItem(member, item)             // author, or ADMIN+, or OWNER
```

| Action | VIEWER | EDITOR | ADMIN | OWNER |
|---|---|---|---|---|
| Read items / rollups / comments / photos | ✅ | ✅ | ✅ | ✅ |
| Write a comment | ✅ | ✅ | ✅ | ✅ |
| Create / edit / delete **own** item | ❌ | ✅ | ✅ | ✅ |
| Edit / delete **another member's** item | ❌ | ❌ | ✅ | ✅ |
| Manage categories & tags | ❌ | ❌ | ✅ | ✅ |
| Invite / remove members, decide join requests | ❌ | ❌ | ✅ | ✅ |
| Change roles (up to ADMIN) | ❌ | ❌ | ✅ | ✅ |
| Edit ledger title / colour / discoverability / timezone | ❌ | ❌ | ✅ | ✅ |
| Confirm the assumed currency (once) | ❌ | ❌ | ✅ | ✅ |
| Transfer ownership | ❌ | ❌ | ❌ | ✅ |
| Archive / delete the ledger | ❌ | ❌ | ❌ | ✅ |

The legacy app had **exactly two** rungs (owner and member) and, because
`database.rules.json` compared against the nonexistent `auth.id`, effectively **no authorization at
all** — the whole `/bookoo` tree was world-readable and world-writable to any signed-in user
(`02` §12). Every rule above is enforced in the function layer, which is the entire point of moving.

---

## 11. Modeled NOW — the retrofit-cost argument

The rule applied: an **optional scalar field** is nearly free to add later, and Convex's
`staged: true` makes adding an index to a large table safe. Therefore the only things that earn a
place in v1 are those whose absence is **irrecoverable**, **contaminates every call site**, or
**changes the meaning of existing rows**.

| Included | Category of retrofit cost | Argument |
|---|---|---|
| `fxRate` / `fxRateAt` / `baseAmountMinor` / `baseCurrency` | **Irrecoverable** | You cannot look up September 2026's THB/KRW rate for a row entered in 2026 once the year is over — not accurately, not per-transaction. Four fields now; a permanently wrong ledger otherwise. |
| `ledgers.timezone` + server-computed `dayKey`/`monthKey` | **Irrecoverable + meaning-changing** | Without a stored ledger timezone you cannot recompute what "August" meant to that household. Retrofitting means guessing, then rebuilding every rollup. |
| Positive `amountMinor` + `type` | **Meaning-changing** | Flipping the sign convention later means rewriting 100k rows *and* every rollup *and* every chart, with no way to distinguish an already-migrated row from a not-yet one. |
| `deletedAt` as index field #2 | **Call-site-contaminating** | Adding it later means a new index per list index *and* changing every query *and* removing every "pages may come back short" workaround the client grew around it. |
| `shard` on all four counter tables | **Call-site-contaminating** | Adding a shard dimension later changes every read from `.unique()` to a summed range — in ~10 places. Adding the field now with `SHARD_COUNT = 1` makes the read code already correct. |
| `ledgerMembers.role` (4 rungs) | **Call-site-contaminating** | The field is free; auditing 60 `isOwner ? … : …` branches is not. |
| `ledgerActivity` | **Irrecoverable** | History you never wrote is gone. Also the trust feature of a *shared* ledger. |
| `itemPhotos` as a table | **Structure-changing** | Array → table means every read path, every serializer and a data backfill. It is also required by the migration regardless. |
| `paidByUserId` | **Semantically irrecoverable** | Undefined means "the author paid", which is a *true* statement about v1 rows. Adding the field later and backfilling `authorId` would be a *guess* about rows entered after a payer picker shipped but before the field existed. One optional field removes that window entirely. |
| `TRANSFER` literal + `transferGroupId` | **Exhaustiveness** | Every `switch (type)` and every rollup delta is written once, correctly, instead of being audited later. v1's mutation validator narrows to `EXPENSE \| INCOME`, so the API surface stays small. |
| `tags` + `tagIds` | **Downstream contamination** | Not having tags pushes users into creating one-off categories, and every junk category permanently creates a `ledgerCategoryMonthlyRollups` row for every month it appears in. Cleaning up a polluted category dimension is far more expensive than one small table. |
| `legacy*` fields + `by_legacyKey` everywhere | **Stated requirement** | DECISIONS.md §4: "나중에 붙이면 아픔". |
| `ledgers.periodStartDay` + daily rollups | **Dimension-changing** | The alternative — making `monthKey` period-relative — would poison every index and every chart. Daily rollups keep `monthKey` calendar-clean while making arbitrary periods a ≤62-document read. |
| `contentReports` / `userBlocks` | **Ship-blocking** | App Store 1.2 requires reporting and blocking for user-generated content, and BooKoo has public handles, discoverable ledgers and comments. Discovering this at submission time costs a release cycle. |
| `appConfig` force-update fields | **Ship-blocking** | Without a server-side minimum-build gate you can never turn off a broken client. |

---

## 12. Deliberately NOT modeled — and the exact seam

Each of these is a real product intention. None of them needs a change to a v1 table beyond adding
optional fields or a `staged: true` index.

| Deferred | Why not now | The seam |
|---|---|---|
| **Recurring transactions** (월세, 구독료) | Purely forward-looking: no historical row needs a recurrence field, and nothing about the past becomes unknowable. | New table `recurrenceRules {ledgerId, templateJson-ish typed fields, rrule fields, nextRunDayKey, lastMaterializedDayKey, pausedAt}` + `.index('by_nextRunDayKey')`. A daily cron materializes due rules into real `ledgerItems`. Add `ledgerItems.recurrenceId: v.optional(v.id('recurrenceRules'))` (free) and, if "show me every rent payment" is wanted, `by_ledgerId_recurrenceId` with `staged: true`. **Zero change to any existing field.** |
| **Budgets / envelopes per category per month** | The hard part — the per-(ledger, month, category) totals a budget compares against — **already exists** as `ledgerCategoryMonthlyRollups`. Shipping budgets is then a table plus a screen. | New table `budgets {ledgerId, monthKey \| 0 for "every month", categoryId?, amountMinor, rolloverEnabled, alertThresholdPct}` with `.index('by_ledgerId_monthKey_categoryId')`. Progress = one budget row joined to one rollup row. The `BUDGET_ALERT` notification kind and `ledgerMembers.notifyBudget` are already in the schema. |
| **Splitting an expense between members + settle up** | Retrofits cleanly because splits are additive rows: an item with no split rows means "the payer bore it all", which is exactly what v1 rows mean. | New tables `itemSplits {itemId, ledgerId, memberUserId, shareMinor, settlementId?}` (`by_itemId`, `by_ledgerId_memberUserId_settlementId`) and `settlements {ledgerId, fromUserId, toUserId, amountMinor, settledAt}`. **`ledgerItems.paidByUserId` is the anchor and it ships in v1** — without it, historical "who owes whom" is a guess. Balance-per-member becomes a new `ledgerMemberMonthlyRollups` table, recomputable from source in one batched job. |
| **Accounts / wallets and transfers between them** | v1 has no account concept, so a transfer has nowhere to go. | `accounts {ledgerId, name, kind: CASH\|BANK\|CARD, currency, openingBalanceMinor, archivedAt}`; add `ledgerItems.accountId` and `counterAccountId` as optional fields (free). `type: 'TRANSFER'` and `transferGroupId` **already exist**, and all rollup code already excludes transfers from income/expense. This is the payoff of D2's exhaustiveness decision. |
| **Transfers between *ledgers*** | Genuinely rare, and it raises a currency question (two ledgers, two base currencies) that deserves its own design. | Two linked items sharing a `transferGroupId` across ledgers; the field is already a plain string precisely so it can span ledgers. |
| **Receipt OCR** | Needs an action, a vendor, a cost model, and a privacy disclosure — none of which is schema work. | Add to `itemPhotos`: `ocrState`, `ocrText`, `ocrVendor`, `ocrConfidence`, `ocrExtractedAmountMinor`, `ocrExtractedMerchant`, `ocrRanAt` — all optional. Because photos are already a **table** (D13), this is a pure additive change. A `@convex-dev/workpool` queue drives it off `by_migrationState_attempts`'s sibling `by_ocrState_attempts` (`staged: true`). |
| **`ledgerItemTags` join table** | The `tagIds` array serves display and bounded-page filtering. The join table is only needed for "every item tagged #제주여행 across 100k rows". | `ledgerItemTags {tagId, ledgerId, itemId, dayKey}` with `by_tagId_dayKey`. **Backfillable in one batched job from the existing `tagIds` arrays** — which is precisely why the array ships in v1. |
| **`places` (merchant clustering)** | Inline `location` answers every v1 question. Clustering coordinates into named places is an inference problem, not a storage one. | `places {ledgerId \| null, name, lat, lng, geohash}` + `ledgerItems.placeId: v.optional(v.id('places'))` (free) + `by_ledgerId_placeId_dayKey` (`staged: true`). A batch job clusters existing inline coordinates — **no data is lost by deferring**, because lat/lng are already stored. |
| **CSV / bank import** | Needs a per-bank parser library and a mapping UI. | `importBatches {ledgerId, source, fileName, rowCount, importedCount, skippedCount, state}` + `ledgerItems.importBatchId` and `externalKey` (both free optional) + `by_ledgerId_deletedAt_externalKey` with `staged: true` for dedupe. Old rows correctly have no `externalKey`, since dedupe only applies to imported rows. |
| **Saved filters / custom reports** | A v2 screen; the queries it would run are all already index-served. | `savedViews {ledgerId, userId, name, isShared, filter: <typed object>, chartKind}` + `by_ledgerId_userId`. |
| **Per-member spending rollups** | Recomputable from source at any time, because `authorId` (and `paidByUserId`) are already stored and already indexed. | `ledgerMemberMonthlyRollups {ledgerId, userId, monthKey, shard, expenseMinor, incomeMinor, itemCount}` + `by_ledgerId_userId_monthKey_shard`, backfilled with `@convex-dev/migrations`. Until then, `by_ledgerId_deletedAt_authorId_dayKey_occurredAt` answers the same question over a bounded page. |
| **`fxRates` cache table** | v1 has `currency === baseCurrency` for every row, so `fxRate` is always `1` and there is nothing to look up. | `fxRates {base, quote, dayKey, rate, source, fetchedAt}` + `by_base_quote_dayKey`, populated by a daily cron action. `ledgerItems.fxRateSource` already distinguishes `'IDENTITY' \| 'MANUAL' \| 'FEED'`, so historical rows stay interpretable. |
| **`@convex-dev/aggregate` B-trees** | Every v1 number is a 1–120 document rollup read. A B-tree adds shared internal nodes that serialize concurrent inserts (`13` §3.2) for zero v1 benefit. | Add `TableAggregate<{Namespace: Id<'ledgers'>; Key: [monthKey, occurredAt]}>` **namespaced by ledger** when the arbitrary-date-range report screen ships. Backfill with the standard batched `insertIfDoesNotExist` chain. Never un-namespaced. |
| **Full-text search on comments** | Search storage is Convex's smallest allowance (0.5 GB free, `13` §9) and memo search already consumes it. | `itemComments.searchIndex('search_body', {searchField: 'body', filterFields: ['ledgerId','deletedAt']})` — one line, added when someone asks. |
| **App lock (PIN / biometrics)** | It is a *device* control, not shared-ledger data. Storing a PIN server-side would make it a liability with no benefit. | `expo-secure-store` (Keychain / Android Keystore). The legacy app kept the PIN in AsyncStorage in plaintext behind a hardcoded `ENCRYPTION_KEY` committed to the repo — never reproduce this. |
| **Ads (AdMob)** | The legacy app ran banner ads. Whether BooKoo does is a business decision, and it needs no schema. | If subscriptions ever ship: `subscriptions {userId, productId, platform, expiresAt, originalTransactionId}` + `by_userId`, `by_originalTransactionId`. Nothing in the ledger tables changes. |
| **`opinions` as a live feature** | The legacy node was never read by the app. | Imported archivally into `feedback` with `legacyKey` + `legacyCreatedAt`; the new table is a real inbox. |

---

## 13. Risks and open questions

1. **`Intl` timezone support inside the Convex isolate.** `dayKeyOf` depends on
   `Intl.DateTimeFormat` honouring an arbitrary IANA `timeZone`. This must be asserted by a
   `convex-test` case on day one. **Contained**: the fallback (`@date-fns/tz`, pure JS, isolate-safe)
   changes one file in `shared/`, never the schema. Nothing else in the design depends on it.
2. **`convex-helpers/server/triggers` is unproven in both reference repos.** Neither Martie nor
   FightingHows uses it (`13` §0). If the `customMutation` wrapper proves awkward, the fallback is a
   hand-called `applyItemDelta(ctx, doc, sign)` helper — correctness then depends on discipline
   rather than structure, which is strictly worse but not blocking. Decide before the first rollup
   mutation is written, not after.
3. **`SHARD_COUNT` is a guess.** v1 ships `1`. The number that matters is the OCC-conflict rate on
   `ledgerMonthlyRollups` under N concurrent writers, and only a load test answers it (`13` §10.2).
   The design makes raising it a constant change, so guessing wrong is cheap.
4. **Per-ledger category seeding creates 34 rows per ledger.** A user with 10 ledgers carries 340
   category rows. That is fine at any realistic scale, but it does mean a preset *label* correction
   (and note `04` §3.1 lists **eight** known bad translations) must be applied by a migration across
   every ledger's seeded rows, not by editing one shared row. Mitigated by `presetKey` +
   `label === undefined` meaning "resolve through i18n": a translation fix ships in the app bundle
   and takes effect everywhere, **as long as the user never renamed the category**. Renamed rows keep
   the user's label, which is correct.
5. **Ledger discoverability defaults to `false`,** so every migrated ledger becomes unsearchable.
   That is a deliberate privacy improvement, but it is a *visible behaviour change* for any user who
   relied on "search my ledger by exact title to let a friend request to join". The invite link
   replaces it. Product should confirm.
6. **`baseCurrency` immutability after the first item** is enforced in the mutation, but migrated
   ledgers arrive with `currencyIsAssumed: true` and *already have items*. The one-time confirmation
   prompt must therefore be allowed to change it — and it triggers the re-conversion job. That is a
   deliberate hole in the invariant; it must be gated to `currencyIsAssumed === true` and closed
   permanently on first confirmation.
7. **The activity feed doubles the write count for item mutations** (6 documents instead of 5) and
   grows a table nobody deletes for 180 days. At household scale this is negligible; at 100k items
   per ledger it is another 100k documents. The 180-day `FEED` purge is what keeps it bounded, and
   `retention: 'AUDIT'` is what keeps the membership history forever. Confirm 180 days with product.
8. **Push fan-out is unauthenticated Expo push** (raw `fetch` to `exp.host`), inherited from
   FightingHows. Expo recommends an access token for production. Not a schema issue, but it belongs
   on the launch checklist.
9. **`userProfiles.email` is stored denormalized and indexed.** It is the account-merge key, so it
   must be. It is also PII in an index — the serializer `toPublicMember` must never include it, and
   the invite-by-email flow must never confirm whether an address has an account (an enumeration
   oracle). Both are function-layer concerns; flagged here so they are not forgotten.
10. **Item edit does not version the item.** `ledgerActivity` records that an edit happened and
    snapshots the amount, but not a full before/after. Full versioning (`ledgerItemRevisions`) is a
    deferred seam; if "restore a previous version" is wanted, `detailsJson` is currently the only
    place the old values survive, and it is explicitly documented as render-only. Decide whether
    that is enough before shipping shared editing to large households.
