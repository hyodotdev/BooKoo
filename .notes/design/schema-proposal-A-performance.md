# Schema Proposal A — PERFORMANCE-FIRST

**BooKoo Convex schema, complete.**
Angle: start from the read patterns, work backwards to tables. Optimise for narrow reactive read
sets, one-document dashboard reads, zero N+1, cheap cold start, no write hotspots.

Reference notes assumed read: `01` (features/screens), `02` (legacy RTDB forensics + slowness
inventory), `03` (calendar spec), `04` (categories/i18n), `06` (Martie conventions), `09`
(FightingHows house style + handle design), `13` (**the bible** — §3–§5, checklist §11), `14`
(migration). `DECISIONS.md` is binding.

Target load used for every number in this document:

> **A power user in 10 ledgers × 100,000 items each (1,000,000 items visible to one account),
> 8 co-members writing concurrently into the hottest ledger, 10 years of history
> (≈120 month buckets, ≈3,650 day buckets per ledger).**

---

## 0. The eight axioms this schema is derived from

| # | Axiom | The legacy failure it kills |
|---|---|---|
| A1 | **No screen's document-read count may be a function of ledger size.** Every number on screen is either one rollup row, a bounded rollup range (≤ months-of-history), or one 30-row page. | `S1`/`S2`/`S5` — `getMyLedger` pulled the entire ledger; `getMyLedgers` did it per ledger on every app open. |
| A2 | **Reactive read sets are split by write frequency, not by screen.** A query that reads a hot field must not also read a cold one. Hot fields get their own table. | `S3` — one `.on('value')` on the ledger-id list re-downloaded every ledger's whole item tree. |
| A3 | **Lists never join.** A list query returns raw rows; the identity/label sidecars (member roster, category catalog) are *separate, small, per-screen, cached* subscriptions the client resolves by id. | `S8`/`S9`/`S10` — N+1 profile fetches per member/review; `Tab1`'s 34-entry icon array indexed with no bounds check. |
| A4 | **Every derived number is a stored delta, maintained inside the same ACID mutation as the write.** Never recomputed on read, never recomputed on the client. | `S5`/`S15` — `Tab3.setChartData` and `LedgerLineGraph` walked all items on every render; zero precomputed totals existed. |
| A5 | **The soft-delete discriminator lives *inside* every list index**, second position, right after the tenant key. Pages are therefore never short. | FightingHows' documented "pages may come back short" caveat (`09` §3.1) — avoidable, so avoid it. |
| A6 | **Calendar bucketing is a server-side function of the *ledger's* timezone, never the device's.** | Legacy `moment()` local dates — two members in different timezones disagree about which month a transaction is in, so no shared total is well-defined. |
| A7 | **Money is one integer + one currency code. There is no display string in the database.** | `amount: "-₩12,000"` (string, locale of whoever created it) vs `realAmount: -12000`, with a client-side sign-fix patch and a `>0`/`>=0` inconsistency. |
| A8 | **`legacyUid` / `legacyKey` / `legacyCreatedAt` exist on day one, on every table that receives migrated data.** Adding them later means rewriting 1M rows. | `DECISIONS.md` §4. |

**The single most important structural consequence:** there is **no `ledgerStats`-style hot counter
document at all.** Note `13` §11 rule 9 says "hot-write fields live in `ledgerStats`, not on the
`ledgers` document". This design goes one step further and *removes* them: `lastItemAt` is a
one-document index probe (`by_ledger_and_deleted_and_createdAt`, `.order('desc').first()`), lifetime
totals are a bounded sum of ≤120 month-rollup rows, and `memberCount` is genuinely cold. That
eliminates a per-ledger document that all 8 writers would have patched on every single write.

---

## 1. Cross-cutting representations (decide these once, everywhere)

### 1.1 Money

```ts
// shared/money.ts — pure, imported by convex/ AND src/, unit-tested in __tests__/money.test.ts
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'KRW','JPY','VND','CLP','ISK','PYG','UGX','RWF','XAF','XOF','XPF','KMF','DJF','GNF','VUV',
]);
export function minorUnitExponent(currency: string): 0 | 2 | 3 { /* ISO-4217 table */ }
export function toMinor(major: number, currency: string): number;   // throws on lossy input
export function formatMinor(minor: number, currency: string, locale: string): string; // Intl.NumberFormat
```

Rules:

1. **`amountMinor: v.number()` is a NON-NEGATIVE integer magnitude.** The sign lives in
   `kind: 'EXPENSE' | 'INCOME'`. This is the deliberate departure from legacy `realAmount`, whose sign
   *was* the type and which needed a server-ish patch (`category.category === 0 → force negative`)
   plus a `> 0` vs `>= 0` inconsistency between the tab picker and the form state (`02` §6).
   `amountMinor === 0` is rejected at validation, exactly as legacy did.
2. **No display string is ever stored.** `amount` is dropped entirely. Formatting happens at render
   from `(amountMinor, currency, viewerLocale)`. If paranoia demands it, the legacy pair survives
   inside `items.legacyRaw` as an opaque JSON string that no code path parses.
3. **Multi-currency.** `ledgers.currency` is the ledger's **base currency** and is the unit of every
   rollup. An item carries what was actually entered (`amountMinor`, `currency`) *and* its
   contribution to the ledger (`baseAmountMinor`, `fxRate`). When `currency === ledger.currency`,
   `fxRate === 1` and `baseAmountMinor === amountMinor`.
   - `fxRate` is captured **at entry time and frozen**. A trip ledger's March total must not silently
     change when the KRW/JPY rate moves in August. Re-rating is an explicit, audited owner action.
   - Rollups sum `baseAmountMinor` only. There is exactly one number per (ledger, period), in one
     currency. This is what makes the month header a single-document read.
   - Legacy has **no currency anywhere in the DB** (`02` §16) — it lived in device `AsyncStorage`.
     Migration sets `currency: 'KRW'` + `currencyIsAssumed: true`; the first member to open a
     migrated ledger is prompted once to confirm.

### 1.2 Date / time — and the timezone rule

**The rule: a ledger owns exactly one IANA timezone. Every calendar bucket is computed server-side
in that timezone. Clients never compute bucket keys.**

```ts
// shared/date.ts — pure
export function dayKeyOf(occurredAtMs: number, timeZone: string): number;   // 20260824
export function monthKeyOf(occurredAtMs: number, timeZone: string): number; // 202608
export function dayRangeMs(dayKey: number, timeZone: string): {startMs: number; endMs: number};
export function monthRangeMs(monthKey: number, timeZone: string): {startMs: number; endMs: number};
// implemented with Intl.DateTimeFormat('en-CA', {timeZone}) — DST-correct, no offset table
```

| Field | Type | Meaning |
|---|---|---|
| `occurredAt` | `v.number()` epoch ms UTC | the instant the user picked. The authority. Sortable, precise, timezone-free. |
| `dayKey` | `v.number()` e.g. `20260824` | `occurredAt` rendered in **`ledger.timeZone`**. Derived server-side. |
| `monthKey` | `v.number()` e.g. `202608` | same. |
| `createdAt` / `updatedAt` | `v.number()` epoch ms | wall-clock audit stamps, **explicit fields, never `_creationTime`** (`14` D7: a batch-mutation import cannot set `_creationTime`, so index-sorting on it would order 1M migrated rows by import time). |

Why integers and not `'2026-08'` strings: index keys compare numerically, ranges
(`.gte(20260801).lte(20260831)`) are exact and total, and 8 bytes beats a string. Note `06` D9
proposed strings; note `13` §1.1 proposed integers. **Integers win** — they are the thing being range-scanned.

Why the *ledger's* timezone and not the *viewer's*:

- A shared 가계부's month total must be the same number for every member, or it is not a number.
  Two members in KST and PST would otherwise see different monthly totals for the same data.
- Rollup rows are **keyed** on `dayKey`/`monthKey`. A client-computed key would write the delta into
  the wrong bucket and permanently corrupt the aggregate. Keys must be derived from a single
  authority the mutation controls.
- DST and offset history are handled once, in one function, tested once.

Defaults and changes:
- `ledgers.timeZone` defaults to the creator's device timezone at creation
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`), with `timeZoneIsAssumed: true` for migrated
  ledgers (which get `'Asia/Seoul'`).
- The date picker on the entry form renders in `ledger.timeZone` and labels it when it differs from
  the device's, so "today" is never ambiguous.
- **Changing `ledgers.timeZone` is an owner action that re-keys every item and rebuilds every
  rollup**, run as a checkpointed batch job (`ledgerMaintenance.job = 'TZ_REKEY'`, §4.16), never
  inline. The UI warns and shows progress.

### 1.3 Soft delete

`deletedAt: v.optional(v.number())` on every user-visible table.

- **It sits at index position 2**, immediately after the tenant key, on every list index
  (`['ledgerId', 'deletedAt', 'occurredAt']`). Live rows are `.eq('deletedAt', undefined)`. This is
  the concrete improvement over FightingHows' `posts.by_category`, which post-filters and therefore
  returns short pages (`09` §3.1). Here a page of 30 is 30.
- **Rollups get the negative delta at soft-delete time**, so a soft-deleted item is invisible to both
  the list and the totals immediately.
- **Hard delete happens only in a purge cron**, 30 days after `deletedAt`, and it deletes the
  `_storage` blobs in the same pass (a receipt photo is financial data; a stored URL carries no auth
  and no expiry — `09` §7).
- **Membership is not soft-deleted.** `ledgerMembers` keeps exactly **one row per (ledgerId, userId)
  forever** and transitions `status: ACTIVE → LEFT | REMOVED`. Rationale: the auth gate is
  `by_ledger_and_user` `.unique()`; a stable single row keeps that O(1) and keeps `rollupShard`
  stable across a rejoin.
- **Join tables are hard-deleted** (`blocks`, `uploads` ownership rows on blob delete, push tokens on
  sign-out — the last one must be hard so the retired token stops matching `by_token`).

### 1.4 Identity, errors, naming

- **One canonical user identity: `v.id('users')`** (the Convex Auth table). Every foreign key points
  at `users`; `userProfiles` is a satellite reached through `by_user`. Martie's split
  (`purchases.userId: v.id('userProfiles')`) is the footgun being avoided (`06` D13).
- **Index naming (mechanical, from `09` §3.1):** `by_` + field identifiers joined by `_and_`, in
  tuple order, camelCase preserved. No exceptions.
- **Errors:** `ConvexError({code, messageKey, params})` with a closed `AppErrorCode` union in
  `shared/errors.ts`. `messageKey` is an i18n key, **not** a Korean sentence — BooKoo ships ko/en/ja
  (+ zh/id from the legacy set, `04` §2). This is the one structural fix over FightingHows (`09` §11.2).
- **`returns:` validators on 100% of public functions.** `args:` as an object literal, never
  `v.object({...})`.
- **No `any`, anywhere.** Where a value is genuinely opaque (audit detail, legacy blob, config JSON)
  the field is `v.string()` holding JSON, and it is documented as never parsed for control flow.

---

## 2. Read-path first: what the app actually asks for

Derived from `01` §5 (every screen) and `03` (calendar). Twelve screens, plus bootstrap.

| # | Screen | The questions it asks |
|---|---|---|
| 0 | Cold start | who am I · do I need to update · unread badge |
| 1 | Ledger switcher (drawer) | my ledgers · name, colour, member count, am-I-owner · "something changed" dot |
| 2 | Tab1 calendar grid | which days of month M have entries · each day's net |
| 3 | Tab1 selected-day list | that day's rows, newest first |
| 4 | Tab2 infinite list | all rows newest-first, day-sectioned with per-day income/expense subtotals |
| 5 | Tab2 search | rows matching a memo/category term |
| 6 | Tab3 donut + category rows | month total (expense and income) · per-category share · running balance |
| 7 | LedgerLineGraph | 12-month series for one category · one month's rows for that category |
| 8 | LedgerItemDetail | one item · its photos · its comment thread |
| 9 | Item add/update | the category catalog · the ledger's currency/timezone |
| 10 | Members / ledger settings | roster + roles · pending invites · pending join requests |
| 11 | Profile (mine / `/@handle`) | one profile |
| 12 | Settings / inbox / notices / feedback | notification inbox · announcements + FAQ · my feedback |

Every one of these is answered below in **O(1) or O(months-of-history)** documents. None is O(items).

---

## 3. `convex/schema.ts`

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

import {userProfilesTable, userPresenceTable, userHandlesTable} from './schema/users';
import {blocksTable, reportsTable} from './schema/moderation';

import {ledgersTable, ledgerMembersTable, ledgerMemberStateTable} from './schema/ledgers';
import {ledgerInvitesTable, ledgerJoinRequestsTable} from './schema/ledgerInvites';
import {ledgerAuditLogTable, ledgerMaintenanceTable} from './schema/ledgerOps';

import {categoriesTable} from './schema/categories';
import {itemsTable} from './schema/items';
import {itemPhotosTable} from './schema/itemPhotos';
import {itemCommentsTable} from './schema/itemComments';

import {
  ledgerDayRollupsTable,
  ledgerMonthRollupsTable,
  ledgerCategoryMonthRollupsTable,
} from './schema/rollups';

import {pushTokensTable, notificationsTable} from './schema/notifications';
import {uploadsTable, uploadMaintenanceTable} from './schema/uploads';
import {feedbackTable} from './schema/feedback';
import {appConfigTable, appReleasesTable, announcementsTable} from './schema/appContent';
import {
  legacyUsersTable,
  legacyInvitesTable,
  photoMigrationsTable,
  migrationRunsTable,
} from './schema/migration';

export default defineSchema({
  ...authTables,

  // identity
  userProfiles: userProfilesTable,
  userPresence: userPresenceTable,
  userHandles: userHandlesTable,
  blocks: blocksTable,
  reports: reportsTable,

  // tenancy
  ledgers: ledgersTable,
  ledgerMembers: ledgerMembersTable,
  ledgerMemberState: ledgerMemberStateTable,
  ledgerInvites: ledgerInvitesTable,
  ledgerJoinRequests: ledgerJoinRequestsTable,
  ledgerAuditLog: ledgerAuditLogTable,
  ledgerMaintenance: ledgerMaintenanceTable,

  // the ledger's contents
  categories: categoriesTable,
  items: itemsTable,
  itemPhotos: itemPhotosTable,
  itemComments: itemCommentsTable,

  // derived — never read by scanning items
  ledgerDayRollups: ledgerDayRollupsTable,
  ledgerMonthRollups: ledgerMonthRollupsTable,
  ledgerCategoryMonthRollups: ledgerCategoryMonthRollupsTable,

  // platform
  pushTokens: pushTokensTable,
  notifications: notificationsTable,
  uploads: uploadsTable,
  uploadMaintenance: uploadMaintenanceTable,
  feedback: feedbackTable,
  appConfig: appConfigTable,
  appReleases: appReleasesTable,
  announcements: announcementsTable,

  // migration staging — droppable after cutover
  legacyUsers: legacyUsersTable,
  legacyInvites: legacyInvitesTable,
  photoMigrations: photoMigrationsTable,
  migrationRuns: migrationRunsTable,
});
```

`convex/convex.config.ts`:

```ts
import {defineApp} from 'convex/server';
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import migrations from '@convex-dev/migrations/convex.config.js';
import workpool from '@convex-dev/workpool/convex.config.js';

const app = defineApp();
app.use(rateLimiter);   // handle probes, invite sends, feedback, OTP — no table of our own
app.use(migrations);    // batched resumable backfills (tz re-key, rollup rebuild, legacy import)
app.use(workpool, {name: 'photoImport'});  // bounded-concurrency Firebase → _storage copy
export default app;
```

**`@convex-dev/aggregate` is deliberately NOT used in v1.** Every v1 aggregate is a fixed bucket
known at write time, which `13` §3.4 says is exactly the rollup-table case: 1-document reads, no
B-tree contention, no `_creationTime`-keyed insert serialisation. It gets adopted only when the
arbitrary-date-range report screen ships (§10).

---

## 4. The tables

### 4.1 `convex/schema/users.ts`

```ts
import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

/** The five locales the legacy app shipped (04 §2). ko/en/ja are the launch set. */
export const localeValidator = v.union(
  v.literal('ko'), v.literal('en'), v.literal('ja'), v.literal('zh'), v.literal('id'),
);
export type AppLocale = Infer<typeof localeValidator>;

export const appearanceValidator = v.union(
  v.literal('SYSTEM'), v.literal('LIGHT'), v.literal('DARK'),
);

/** Sunday / Monday / Saturday — the only week starts any BooKoo locale uses. */
export const weekStartValidator = v.union(v.literal(0), v.literal(1), v.literal(6));

/** Global app role. Per-LEDGER roles live on ledgerMembers; this is support tooling only. */
export const appRoleValidator = v.union(
  v.literal('USER'), v.literal('SUPPORT'), v.literal('ADMIN'),
);

export const platformValidator = v.union(
  v.literal('ios'), v.literal('android'), v.literal('web'),
);

/**
 * The COLD half of a user. Read by the member-roster query of every ledger screen, so nothing
 * that changes more than a few times a month may live here. `lastSeenAt` in particular is in
 * `userPresence`: a 5-minute heartbeat here would re-run the roster query — and therefore
 * re-render the member strip — for all 8 co-members every time any one of them opened the app.
 */
export const userProfilesTable = defineTable({
  userId: v.id('users'),

  /** lowercase(trim(email)). The account-merge key. Never gmail-dot-folded (14 §3.4). */
  emailNormalized: v.string(),

  // ---- Instagram-style handle (design lifted from 09 §12, unchanged) ----
  /** Exactly what the member typed, for display. Absent between signup and onboarding. */
  handle: v.optional(v.string()),
  /** NFKC-folded, lowercased, ASCII `[a-z0-9._]`. Denormalized from userHandles so a
   *  `/@hyo` profile lookup is ONE indexed read with no join. */
  handleKey: v.optional(v.string()),
  handleUpdatedAt: v.optional(v.number()),

  /** Free Unicode, non-unique. Korean/Japanese names welcome. */
  displayName: v.string(),
  /** Legacy `info.statusMsg`. Required with a '' default so no read path needs `?? ''`. */
  bio: v.string(),
  /** Legacy `info.tel`. PRIVATE: never included in the PublicMember projection. */
  phone: v.optional(v.string()),

  avatarStorageId: v.optional(v.id('_storage')),
  /** Denormalized at upload time. NEVER call ctx.storage.getUrl() inside a list query (13 §6.3). */
  avatarUrl: v.optional(v.string()),
  avatarThumbUrl: v.optional(v.string()),

  locale: localeValidator,
  appearance: appearanceValidator,
  weekStartsOn: weekStartValidator,
  /** Pre-fills the currency picker when creating a ledger. Not authoritative for any ledger. */
  defaultCurrency: v.string(),
  /** IANA. Pre-fills a new ledger's timeZone. */
  defaultTimeZone: v.string(),

  // required booleans with insert-time defaults — no `?? true` on any read path (09 §3)
  pushEnabled: v.boolean(),
  notifyLedgerActivity: v.boolean(),
  notifyComments: v.boolean(),
  notifyInvites: v.boolean(),

  appRole: appRoleValidator,

  createdAt: v.number(),
  updatedAt: v.number(),
  /** Soft-deleted == signed out, enforced in one place: getCurrentProfile (09 §4.1). */
  deletedAt: v.optional(v.number()),

  // migration
  legacyUid: v.optional(v.string()),        // Firebase Auth localId
  legacyCreatedAt: v.optional(v.number()),
  /** True while this row is a tombstone stand-in for a legacy writer nobody has claimed. */
  isLegacyPlaceholder: v.optional(v.boolean()),
})
  .index('by_user', ['userId'])
  .index('by_emailNormalized', ['emailNormalized'])
  .index('by_handleKey', ['handleKey'])
  .index('by_legacyUid', ['legacyUid'])
  .index('by_appRole', ['appRole'])
  .searchIndex('search_handle', {
    searchField: 'handle',
    filterFields: ['deletedAt'],
  });

/**
 * The HOT half of a user, split out per 13 §4.3 rule 2. One row per user, written by the
 * throttled `touchLastSeen` heartbeat. Nothing that renders another member's row reads it.
 */
export const userPresenceTable = defineTable({
  userId: v.id('users'),
  lastSeenAt: v.number(),
  platform: platformValidator,
  appVersion: v.string(),
  buildNumber: v.number(),
  localeAtLastSeen: localeValidator,
}).index('by_user', ['userId']);

/**
 * Authority for handle uniqueness. One row per handle EVER claimed; never deleted on rename.
 *
 * Convex has no unique constraint. Uniqueness is a check-then-insert inside ONE mutation against
 * `by_handleKey`: Convex tracks index RANGES in the read set, so an insert into the range this
 * mutation read invalidates it, Convex aborts and re-runs, and the re-run sees the winner's row
 * (09 §12.2). The three conditions are load-bearing: same mutation, `.eq()` on the NORMALIZED
 * key via withIndex (never `.filter()`), and one normalization function shared by client+server.
 *
 * `releasedAt` is what stops a freed handle being recycled straight into an impersonation.
 */
export const userHandlesTable = defineTable({
  handleKey: v.string(),
  handle: v.string(),
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away. undefined == currently held. */
  releasedAt: v.optional(v.number()),
})
  .index('by_handleKey', ['handleKey'])
  .index('by_user_and_released', ['userId', 'releasedAt'])
  .index('by_user_and_claimedAt', ['userId', 'claimedAt']);
```

### 4.2 `convex/schema/moderation.ts`

```ts
/**
 * Required by App Store Guideline 1.2 the moment the app has public @handles and a public
 * comment thread. The legacy app had neither and shipped neither; both are now in scope.
 */
export const blocksTable = defineTable({
  blockerId: v.id('users'),
  blockedId: v.id('users'),
  createdAt: v.number(),
})
  .index('by_blocker_and_blocked', ['blockerId', 'blockedId'])  // O(1) "is this person blocked"
  .index('by_blocker_and_createdAt', ['blockerId', 'createdAt']); // the block list screen

export const reportReasonValidator = v.union(
  v.literal('SPAM'), v.literal('ABUSE'), v.literal('IMPERSONATION'),
  v.literal('PRIVACY'), v.literal('OTHER'),
);
export const reportStatusValidator = v.union(
  v.literal('OPEN'), v.literal('ACTIONED'), v.literal('DISMISSED'),
);

export const reportsTable = defineTable({
  reporterId: v.id('users'),
  /** Discriminated union instead of (targetType: string, targetId: string) — no `any`, and the
   *  id types are checked by the compiler at every construction site. */
  subject: v.union(
    v.object({kind: v.literal('USER'), userId: v.id('users')}),
    v.object({kind: v.literal('COMMENT'), commentId: v.id('itemComments')}),
    v.object({kind: v.literal('ITEM'), itemId: v.id('items')}),
    v.object({kind: v.literal('LEDGER'), ledgerId: v.id('ledgers')}),
  ),
  reason: reportReasonValidator,
  detail: v.optional(v.string()),
  status: reportStatusValidator,
  createdAt: v.number(),
  decidedAt: v.optional(v.number()),
  decidedBy: v.optional(v.id('users')),
})
  .index('by_status_and_createdAt', ['status', 'createdAt'])
  .index('by_reporter_and_createdAt', ['reporterId', 'createdAt']);
```

### 4.3 `convex/schema/ledgers.ts`

```ts
/**
 * Legacy `info.color` was a number 0..5 indexing six hardcoded rgb() literals (02 §2.2).
 * A named union instead, because: (a) dark mode needs TWO hex values per colour so a raw index
 * cannot be the source of truth; (b) a literal union is typo-proof and self-documenting;
 * (c) the 0..5 → name map is total, so migration is lossless and the number need not be stored.
 * Legacy fallback was teal; keep it.
 */
export const ledgerColorValidator = v.union(
  v.literal('PINK'),   // 0  rgb(255,114,141)
  v.literal('ORANGE'), // 1  rgb(246,166, 35)
  v.literal('YELLOW'), // 2  rgb(238,209,  0)
  v.literal('TEAL'),   // 3  rgb( 29,211,168)   <- fallback
  v.literal('BLUE'),   // 4  rgb(103,158,255)
  v.literal('PURPLE'), // 5  rgb(182,105,249)
);

/**
 * COLD BY CONSTRUCTION. Read by the ledger switcher and by every ledger screen's header, so a
 * single hot field here would invalidate all of them on every expense entry. There is
 * deliberately no lastItemAt / itemCount / lifetimeTotal on this document — see §5.2 for how
 * each of those is answered without one.
 */
export const ledgersTable = defineTable({
  title: v.string(),
  description: v.string(),
  colorKey: ledgerColorValidator,

  /** ISO-4217. THE base currency: every rollup row is denominated in it. */
  currency: v.string(),
  /** True for migrated ledgers (legacy stored no currency at all). Drives a one-time prompt. */
  currencyIsAssumed: v.boolean(),

  /** IANA, e.g. 'Asia/Seoul'. THE calendar authority — dayKey/monthKey are derived from it. */
  timeZone: v.string(),
  timeZoneIsAssumed: v.boolean(),

  /** Denormalized from the OWNER membership row so the switcher can draw the crown without
   *  joining ledgerMembers per ledger (legacy did `ledger.owner === uid` the same way). */
  ownerId: v.id('users'),
  /** Denormalized. The switcher renders "{n} People" for every ledger; without this the
   *  switcher would read 8 membership rows × 10 ledgers = 80 docs instead of 0.
   *  Written only by join/leave/remove — a handful of writes per ledger per year. */
  memberCount: v.number(),

  /** Opt-in to appearing in ledger search. Legacy ledgers were ALL implicitly searchable by
   *  exact title, which is a privacy defect, so this defaults to false. */
  discoverable: v.boolean(),

  /** Hidden from the switcher, still readable. Distinct from deletion. */
  archivedAt: v.optional(v.number()),

  createdBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),

  legacyKey: v.optional(v.string()),        // RTDB push id
  legacyOwnerUid: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),  // from the time-ordered push id
})
  .index('by_owner_and_deleted', ['ownerId', 'deletedAt'])
  .index('by_discoverable_and_deleted', ['discoverable', 'deletedAt'])
  .index('by_legacyKey', ['legacyKey'])
  .searchIndex('search_title', {
    searchField: 'title',
    filterFields: ['discoverable', 'deletedAt'],
  });

/** Legacy had exactly two roles (owner / member) and no role field at all (02 §9). */
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'),   // + transfer ownership, delete ledger, change currency/timezone
  v.literal('ADMIN'),   // + invite, remove members, manage categories, edit anyone's item
  v.literal('EDITOR'),  // + create items/comments, edit own items
  v.literal('VIEWER'),  // read only
);
export const membershipStatusValidator = v.union(
  v.literal('ACTIVE'), v.literal('LEFT'), v.literal('REMOVED'),
);
export const joinSourceValidator = v.union(
  v.literal('CREATE'), v.literal('LINK'), v.literal('EMAIL'),
  v.literal('REQUEST'), v.literal('MIGRATION'),
);

/**
 * THE AUTHORIZATION DOCUMENT. `by_ledger_and_user` is the single most-called index in the app:
 * the first line of every ledger-scoped query and mutation is
 *   requireLedgerMember(ctx, ledgerId) -> .eq(ledgerId).eq(userId).unique()
 * — one document, and its read set is exactly that one index key, so ANOTHER member joining or
 * leaving does not invalidate my queries.
 *
 * Because it is in every read set in the app, this row must be nearly immutable. It therefore
 * carries NO lastReadAt, NO unread count, NO display-name snapshot. Those are in
 * ledgerMemberState (hot) and userProfiles (resolved once per screen by the roster query).
 *
 * Exactly ONE row per (ledgerId, userId) forever. Leaving flips `status`; rejoining flips it
 * back, which keeps `rollupShard` stable.
 */
export const ledgerMembersTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  role: ledgerRoleValidator,
  status: membershipStatusValidator,

  /**
   * Which rollup shard this member's writes land in: `ordinal % ROLLUP_SHARD_COUNT`, assigned
   * once at first join. With ROLLUP_SHARD_COUNT = 1 (launch) every member shares shard 0.
   * Raising the constant makes concurrent members write DISJOINT rollup documents, removing the
   * only remaining OCC contention point (§7.2) without a schema change.
   */
  rollupShard: v.number(),

  joinedAt: v.number(),
  invitedBy: v.optional(v.id('users')),
  invitedVia: joinSourceValidator,
  /** When status left ACTIVE. */
  endedAt: v.optional(v.number()),
  endedBy: v.optional(v.id('users')),

  legacyKey: v.optional(v.string()),   // `${ledgerKey}/${uid}`
  legacyUid: v.optional(v.string()),
})
  .index('by_ledger_and_user', ['ledgerId', 'userId'])
  .index('by_user_and_status', ['userId', 'status'])
  .index('by_ledger_and_status_and_role', ['ledgerId', 'status', 'role'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * The HOT per-(ledger, member) row. Split out of ledgerMembers precisely so that writing
 * `lastReadAt` — which happens every time anyone opens a ledger — cannot invalidate the
 * authorization read set of every query in that ledger.
 *
 * Deliberately has NO unread COUNT. Maintaining one would mean 8 document writes per item
 * insert (one per member), which is exactly the write hotspot this schema exists to avoid.
 * The badge is a timestamp comparison instead: see §5.3.
 */
export const ledgerMemberStateTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  /** Throttled write (LAST_READ_THROTTLE_MS = 60_000). Drives the "new activity" dot. */
  lastReadAt: v.number(),
  lastOpenedAt: v.number(),
  muted: v.boolean(),
  notifyItems: v.boolean(),
  notifyComments: v.boolean(),
  /** Client-chosen order in the switcher. Replaces legacy AsyncStorage `selectedLedgerIndex`,
   *  which stored an ARRAY INDEX and broke whenever ledger order changed (02 §14). */
  pinnedAt: v.optional(v.number()),
  sortOrder: v.number(),
  updatedAt: v.number(),
})
  .index('by_user_and_ledger', ['userId', 'ledgerId'])
  .index('by_ledger_and_muted', ['ledgerId', 'muted']);
```

### 4.4 `convex/schema/ledgerInvites.ts`

```ts
/**
 * ONE TABLE, TWO INDEXES — this is the direct replacement for the legacy `bookoo/invites`
 * DOUBLE INDEX (02 §4), which mirrored the same fact into two subtrees of the SAME map:
 *   invites/{ledgerKey}/{encodedEmail} = encodedEmail     (index A: "who is pending on this ledger")
 *   invites/{encodedEmail}/{ledgerKey} = ledgerKey        (index B: "which ledgers await this email")
 * They shared a namespace, were distinguished only by a "does the key look like a push id"
 * heuristic, and both `Promise.all` bugs in the legacy writer left orphans in production.
 *
 * Here index A is `by_ledger_and_revoked` and index B is `by_emailNormalized_and_revoked`, over
 * one row. Two views of one fact, maintained by the database, impossible to desynchronise.
 *
 * Primary flow per DECISIONS.md §1: an unguessable `code` in a deep link. `by_code` is both the
 * O(1) redemption lookup and the check-then-insert uniqueness gate for code generation.
 */
export const ledgerInvitesTable = defineTable({
  ledgerId: v.id('ledgers'),
  /** 22 chars of base64url from crypto.getRandomValues. Deep link: bookoo://join/<code>. */
  code: v.string(),
  /** Role granted on redemption. Never OWNER — ownership moves only via transferOwnership. */
  role: ledgerRoleValidator,

  /** Targeted invite ("invite hyo@hyo.dev"); undefined = an open share link. */
  emailNormalized: v.optional(v.string()),
  /** What the inviter typed, for display in the pending list. */
  emailRaw: v.optional(v.string()),

  createdBy: v.id('users'),
  createdAt: v.number(),
  expiresAt: v.number(),
  maxUses: v.number(),
  useCount: v.number(),
  revokedAt: v.optional(v.number()),
  revokedBy: v.optional(v.id('users')),
  lastRedeemedAt: v.optional(v.number()),

  legacyKey: v.optional(v.string()),          // `${ledgerKey}/${encodedEmail}`
  legacyEncodedEmail: v.optional(v.string()),
})
  .index('by_code', ['code'])
  .index('by_ledger_and_revoked_and_createdAt', ['ledgerId', 'revokedAt', 'createdAt'])
  .index('by_emailNormalized_and_revoked', ['emailNormalized', 'revokedAt'])
  .index('by_legacyKey', ['legacyKey']);

export const joinRequestStatusValidator = v.union(
  v.literal('PENDING'), v.literal('ACCEPTED'), v.literal('REJECTED'), v.literal('CANCELLED'),
);

/**
 * Legacy `ledgers/{k}/requests/{uid} = uid` — a toggle-able join request the owner accepted or
 * rejected (02 §9 path B). Retained as a real table rather than dropped, because:
 *  - "search a ledger by name and ask to join" is a shipped feature real users used, and
 *  - a rejected request that leaves no record lets a stranger re-request forever.
 * It is now gated behind `ledgers.discoverable`, and the decision is recorded (status +
 * decidedBy + decidedAt) instead of the legacy "reject = just remove the node".
 */
export const ledgerJoinRequestsTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  status: joinRequestStatusValidator,
  message: v.optional(v.string()),
  createdAt: v.number(),
  decidedAt: v.optional(v.number()),
  decidedBy: v.optional(v.id('users')),
})
  .index('by_ledger_and_status_and_createdAt', ['ledgerId', 'status', 'createdAt'])
  .index('by_user_and_status', ['userId', 'status'])
  .index('by_ledger_and_user', ['ledgerId', 'userId']);
```

### 4.5 `convex/schema/ledgerOps.ts`

```ts
export const auditActionValidator = v.union(
  v.literal('LEDGER_CREATED'), v.literal('LEDGER_UPDATED'),
  v.literal('LEDGER_ARCHIVED'), v.literal('LEDGER_DELETED'), v.literal('LEDGER_RESTORED'),
  v.literal('CURRENCY_CHANGED'), v.literal('TIMEZONE_CHANGED'),
  v.literal('INVITE_CREATED'), v.literal('INVITE_REVOKED'),
  v.literal('MEMBER_JOINED'), v.literal('MEMBER_LEFT'), v.literal('MEMBER_REMOVED'),
  v.literal('ROLE_CHANGED'), v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('JOIN_REQUEST_DECIDED'),
  v.literal('CATEGORY_CREATED'), v.literal('CATEGORY_DELETED'),
  v.literal('BULK_IMPORT'), v.literal('ROLLUP_REPAIRED'), v.literal('ITEMS_REKEYED'),
);

/**
 * GOVERNANCE events only. Deliberately NOT written for item create/update/delete: that would
 * double the write volume of the hottest path in the app and make the audit table the largest
 * table in the deployment. Item history is answered by items.updatedAt/updatedBy and by the
 * 30-day soft-delete window.
 */
export const ledgerAuditLogTable = defineTable({
  ledgerId: v.id('ledgers'),
  action: auditActionValidator,
  actorId: v.optional(v.id('users')),
  targetUserId: v.optional(v.id('users')),
  createdAt: v.number(),
  /** JSON string. Rendered by the client for humans; never parsed for control flow. */
  detail: v.optional(v.string()),
})
  .index('by_ledger_and_createdAt', ['ledgerId', 'createdAt'])
  .index('by_ledger_and_action_and_createdAt', ['ledgerId', 'action', 'createdAt']);

export const maintenanceJobValidator = v.union(
  v.literal('TZ_REKEY'),        // ledger.timeZone changed -> re-derive dayKey/monthKey, rebuild rollups
  v.literal('ROLLUP_REBUILD'),  // full recompute from items
  v.literal('PURGE_DELETED'),   // hard-delete soft-deleted rows + their blobs past the window
  v.literal('CURRENCY_REBASE'), // ledger.currency changed -> re-derive baseAmountMinor
);
export const maintenanceStateValidator = v.union(
  v.literal('IDLE'), v.literal('RUNNING'), v.literal('DONE'), v.literal('FAILED'),
);

/** Checkpoint row so an unbounded cascade is never one mutation (09 §9.5 pattern). */
export const ledgerMaintenanceTable = defineTable({
  ledgerId: v.id('ledgers'),
  job: maintenanceJobValidator,
  state: maintenanceStateValidator,
  /** Pagination cursor of the batch chain. */
  cursor: v.optional(v.string()),
  processed: v.number(),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  requestedBy: v.optional(v.id('users')),
})
  .index('by_ledger_and_job', ['ledgerId', 'job'])
  .index('by_state_and_job', ['state', 'job']);
```

### 4.6 `convex/schema/categories.ts`

```ts
export const itemKindValidator = v.union(v.literal('EXPENSE'), v.literal('INCOME'));
export type ItemKind = Infer<typeof itemKindValidator>;

/**
 * THE BIGGEST FEATURE FIX IN THIS SCHEMA.
 *
 * Legacy categories were NEVER in Firebase (02 §7.1). They lived in a device-local expo-sqlite
 * table seeded from a 34-entry constant, with the LOCALIZED LABEL FROZEN AT INSTALL TIME, and a
 * user's custom categories never synced anywhere. Consequences: reinstall lost them, member A's
 * custom category appeared to member B only as a denormalized {iconId, txt} snapshot on the item,
 * and changing app language never re-translated existing categories.
 *
 * Two scopes in one table:
 *  - ledgerId === undefined -> a GLOBAL PRESET, one row per entry of DEFAULT_CATEGORIES (04 §3.2),
 *    identified by a stable slug `key`; its label is an i18n key `category.${key}`, resolved at
 *    RENDER time in the viewer's locale. Nothing is frozen.
 *  - ledgerId set -> a per-LEDGER custom category with a user-typed `name`, shared by every member.
 *
 * Items store `categoryId` only. Labels and icons are resolved client-side from ONE catalog
 * subscription per ledger — never joined per row (axiom A3).
 */
export const categoriesTable = defineTable({
  /** undefined = global preset shared by every ledger. */
  ledgerId: v.optional(v.id('ledgers')),

  /** Preset slug ('cafe', 'salary', ...). Present iff ledgerId is undefined. i18n key suffix. */
  key: v.optional(v.string()),
  /** Custom label. Present iff ledgerId is set. Raw user text, not translated. */
  name: v.optional(v.string()),

  kind: itemKindValidator,
  /** 0..33 index into the legacy icon atlas; kept as the icon identity for continuity. */
  iconId: v.number(),
  colorHex: v.optional(v.string()),
  sortOrder: v.number(),

  createdBy: v.optional(v.id('users')),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** Soft delete so items already referencing it keep resolving to a real label. */
  deletedAt: v.optional(v.number()),

  legacyIconId: v.optional(v.number()),
  legacyLabel: v.optional(v.string()),
})
  .index('by_ledger_and_deleted_and_sortOrder', ['ledgerId', 'deletedAt', 'sortOrder'])
  .index('by_key', ['key'])
  .index('by_ledger_and_legacy', ['ledgerId', 'legacyIconId', 'legacyLabel']);
```

### 4.7 `convex/schema/items.ts` — the unbounded table

```ts
/**
 * The one table that grows forever. EVERY index starts (ledgerId, deletedAt) so that
 *  (a) the tenant is pinned — a write to ledger B never wakes a subscription on ledger A, and
 *  (b) the soft-delete discriminator is inside the index, so a page of 30 is 30 rows (A5).
 *
 * `.filter()` is BANNED on this table (13 §11 rule 1). Post-index JS narrowing may only run
 * over an already-bounded page.
 */
export const itemsTable = defineTable({
  ledgerId: v.id('ledgers'),
  deletedAt: v.optional(v.number()),

  kind: itemKindValidator,
  categoryId: v.id('categories'),
  /** The ORIGINAL author — legacy `writer`, set once and preserved across edits by other
   *  members, because it grants edit permission. Optional only because a migrated row's writer
   *  uid may not resolve to any account (deleted Firebase users). */
  authorId: v.optional(v.id('users')),

  // ---- money (§1.1) ----
  /** NON-NEGATIVE integer minor units, as entered. `kind` carries the sign. */
  amountMinor: v.number(),
  /** ISO-4217 of what was entered. */
  currency: v.string(),
  /** Non-negative minor units in ledger.currency. The ONLY thing rollups sum. */
  baseAmountMinor: v.number(),
  /** Rate frozen at entry time. 1 when currency === ledger.currency. */
  fxRate: v.number(),

  memo: v.string(),

  // ---- time (§1.2) ----
  /** epoch ms UTC — the instant the user picked. */
  occurredAt: v.number(),
  /** DERIVED SERVER-SIDE from occurredAt in ledger.timeZone. 20260824. */
  dayKey: v.number(),
  /** DERIVED SERVER-SIDE. 202608. */
  monthKey: v.number(),

  /** Legacy `location` was an unstructured expo reverseGeocode blob plus lat/lng, of which only
   *  `street` was ever read (02 §7.2). Normalised to three fields, kept INLINE (not a table)
   *  because it is immutable with the item and read only on the detail screen — a join would
   *  buy nothing. The raw blob goes to legacyRaw. */
  place: v.optional(v.object({
    lat: v.number(),
    lng: v.number(),
    label: v.string(),
  })),

  /** Denormalized from itemPhotos so the list row renders a thumbnail with ZERO joins and ZERO
   *  ctx.storage.getUrl() calls per row (13 §6.3). Written by attach/detach in the same mutation. */
  photoCount: v.number(),
  coverThumbUrl: v.optional(v.string()),
  /** Denormalized from itemComments. The legacy row showed a review count superscript, so this
   *  is read on every list render anyway; the invalidation it causes (page containing this item
   *  re-runs when a comment lands) is exactly the invalidation the UI needs. */
  commentCount: v.number(),

  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.optional(v.id('users')),

  // ---- migration ----
  legacyKey: v.optional(v.string()),          // `${ledgerKey}/${itemKey}` — globally unique
  legacyWriterUid: v.optional(v.string()),
  legacyCreatedAt: v.optional(v.number()),
  /** JSON of everything unmodelled: the `amount` display string, the raw geocode blob, the
   *  frozen category label, `showDelBtn`. Never parsed by any code path. */
  legacyRaw: v.optional(v.string()),
  /** Set when the importer could not resolve iconId/category/date and a human should look. */
  needsReview: v.optional(v.boolean()),
})
  // 1. THE workhorse: ledger timeline desc, and any occurredAt range (a day, a month, a year)
  .index('by_ledger_and_deleted_and_occurredAt', ['ledgerId', 'deletedAt', 'occurredAt'])
  // 2. category drill-down, still time-ordered
  .index('by_ledger_and_deleted_and_category_and_occurredAt',
         ['ledgerId', 'deletedAt', 'categoryId', 'occurredAt'])
  // 3. "entries by this member", still time-ordered
  .index('by_ledger_and_deleted_and_author_and_occurredAt',
         ['ledgerId', 'deletedAt', 'authorId', 'occurredAt'])
  // 4. "biggest expenses" / amount-range filter (replaces legacy's substring search on the
  //    stringified amount, which could not use any index)
  .index('by_ledger_and_deleted_and_kind_and_amount',
         ['ledgerId', 'deletedAt', 'kind', 'baseAmountMinor'])
  // 5. INSERTION order. Serves the "new since I last looked" probe and the activity feed.
  //    An explicit createdAt, not _creationTime, because migrated rows are inserted by batch
  //    mutations whose _creationTime is import time (14 D7).
  .index('by_ledger_and_deleted_and_createdAt', ['ledgerId', 'deletedAt', 'createdAt'])
  // 6. MAINTENANCE ONLY. Spans deleted rows on purpose: the tz re-key and rollup-rebuild jobs
  //    must see soft-deleted rows so a later restore lands in the right bucket.
  .index('by_ledger_and_monthKey', ['ledgerId', 'monthKey'])
  // 7. cross-ledger "everything I entered" on the profile screen
  .index('by_author_and_deleted_and_occurredAt', ['authorId', 'deletedAt', 'occurredAt'])
  // 8. migration idempotency: one .unique() probe per imported row
  .index('by_legacyKey', ['legacyKey'])
  .searchIndex('search_memo', {
    searchField: 'memo',
    filterFields: ['ledgerId', 'deletedAt', 'kind', 'categoryId'],
  });
```

8 indexes + 1 search index = **9 of the 32-per-table budget**; longest name 48 of 64 chars.

### 4.8 `convex/schema/itemPhotos.ts`

```ts
/**
 * Legacy stored photos as `item.picture[]`, an ARRAY on the item (02 §7.3). Three reasons that
 * is now a table:
 *  1. Every attach rewrote the whole item document — including, in the legacy code, the entire
 *     nested `reviews` map, which silently destroyed any comment added between load and save (S12).
 *  2. Convex caps arrays at 8,192 elements and documents at 1 MiB.
 *  3. A photo now carries real metadata (two storage ids, dimensions, blurhash, uploader,
 *     migration state) that has no business inflating the row every list page reads.
 *
 * Two storage ids per photo: a ~320px thumb generated client-side with expo-image-manipulator
 * before upload, and the original. ~20x less timeline bandwidth, and bandwidth is billed (13 §9).
 * Both URLs are denormalized at attach time — never resolved per row in a query (13 §11 rule 10).
 */
export const itemPhotosTable = defineTable({
  itemId: v.id('items'),
  /** Denormalized tenant key so the ledger-wide photo gallery ("SeeAllPicture" across a ledger)
   *  and the purge job never have to walk items first. */
  ledgerId: v.id('ledgers'),
  order: v.number(),

  fullStorageId: v.id('_storage'),
  fullUrl: v.string(),
  thumbStorageId: v.optional(v.id('_storage')),
  thumbUrl: v.optional(v.string()),

  width: v.number(),
  height: v.number(),
  byteSize: v.number(),
  mimeType: v.string(),
  blurhash: v.optional(v.string()),

  uploadedBy: v.id('users'),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),

  legacyKey: v.optional(v.string()),        // `${ledgerKey}/${itemKey}/${order}`
  legacyPath: v.optional(v.string()),       // GCS object name, spaces and '+' intact
  legacyUrl: v.optional(v.string()),        // one of the three legacy URL shapes (02 §11.4)
  legacyBase64: v.optional(v.boolean()),    // the deprecated putString() upload path
})
  .index('by_item_and_deleted_and_order', ['itemId', 'deletedAt', 'order'])
  .index('by_ledger_and_deleted_and_createdAt', ['ledgerId', 'deletedAt', 'createdAt'])
  .index('by_legacyKey', ['legacyKey']);
```

### 4.9 `convex/schema/itemComments.ts`

```ts
/**
 * Legacy `reviews` — the comment thread on a transaction, which is "the social in social ledger"
 * (01 §5.18). Legacy read it with `.limitToLast(100).on('value')` plus ONE `users/{writer}/info`
 * fetch PER REVIEW, sorting inside each callback: O(n^2 log n) and the only limit in the app (S10).
 *
 * Here: a real table, real pagination, no threading (legacy had none), and NO author join —
 * the client resolves authorId against the same roster subscription the rest of the screen uses.
 */
export const itemCommentsTable = defineTable({
  itemId: v.id('items'),
  /** Denormalized tenant key: the permission gate and the ledger activity feed both need it
   *  without loading the parent item. */
  ledgerId: v.id('ledgers'),
  authorId: v.optional(v.id('users')),
  body: v.string(),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),

  legacyKey: v.optional(v.string()),        // `${ledgerKey}/${itemKey}/${reviewKey}`
  legacyWriterUid: v.optional(v.string()),
})
  .index('by_item_and_deleted_and_createdAt', ['itemId', 'deletedAt', 'createdAt'])
  .index('by_ledger_and_deleted_and_createdAt', ['ledgerId', 'deletedAt', 'createdAt'])
  .index('by_author_and_deleted_and_createdAt', ['authorId', 'deletedAt', 'createdAt'])
  .index('by_legacyKey', ['legacyKey']);
```

### 4.10 `convex/schema/rollups.ts` — where the dashboard actually comes from

```ts
/**
 * THREE tables, not one table with a `periodKind` discriminator. A single table would need
 * (ledgerId, periodKind, periodKey, categoryId, shard) as its index tuple, and Convex range
 * expressions require .eq() on every field before the one you range over. The calendar wants
 * "range periodKey, categoryId absent"; the donut wants "eq periodKey, range categoryId". Those
 * two demands are unsatisfiable by one field order. Three tables, three optimal indexes.
 *
 * Every row is denominated in ledgers.currency (items.baseAmountMinor).
 * expenseMinor / incomeMinor are NON-NEGATIVE magnitudes; net = incomeMinor - expenseMinor.
 *
 * The `shard` component: reads always range over it (no .eq), writes always .eq(myShard).
 * ROLLUP_SHARD_COUNT is 1 at launch, so every read below returns exactly one row per bucket.
 * Raising it to 4 makes up to 4 concurrent members write disjoint documents with no schema
 * change and a single backfill — see §7.2.
 */

/** Calendar month grid, Tab2 section headers, "today's total". */
export const ledgerDayRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  dayKey: v.number(),          // 20260824
  shard: v.number(),
  /** Redundant with dayKey but lets the rebuild job walk a month without integer math. */
  monthKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledger_and_dayKey_and_shard', ['ledgerId', 'dayKey', 'shard']);

/** Month header, Tab3 centre label, running balance, ledger switcher subtitle. */
export const ledgerMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),        // 202608
  shard: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
  /** Stamped by the nightly repair cron when it verified this bucket against items. */
  repairedAt: v.optional(v.number()),
}).index('by_ledger_and_monthKey_and_shard', ['ledgerId', 'monthKey', 'shard']);

/** Tab3 donut + category rows, and the LedgerLineGraph 12-month series. */
export const ledgerCategoryMonthRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  categoryId: v.id('categories'),
  shard: v.number(),
  kind: itemKindValidator,
  /** NON-NEGATIVE magnitude. `kind` says which side of the donut it belongs to. */
  amountMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  // "all categories of month M" — the donut. eq(ledgerId).eq(monthKey) -> <= 34 rows.
  .index('by_ledger_and_monthKey_and_category_and_shard',
         ['ledgerId', 'monthKey', 'categoryId', 'shard'])
  // "one category across months M1..M2" — the line graph. eq(ledgerId).eq(categoryId)
  // .gte(monthKey).lte(monthKey) -> <= 12 rows. The SAME data, the OTHER field order:
  // this is the index that would be impossible if rollups were one table.
  .index('by_ledger_and_category_and_monthKey_and_shard',
         ['ledgerId', 'categoryId', 'monthKey', 'shard']);
```

### 4.11 `convex/schema/notifications.ts`

```ts
export const notificationKindValidator = v.union(
  v.literal('LEDGER_INVITE'),
  v.literal('MEMBER_JOINED'),
  v.literal('MEMBER_REMOVED'),
  v.literal('ROLE_CHANGED'),
  v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('JOIN_REQUEST'),
  v.literal('JOIN_REQUEST_DECIDED'),
  v.literal('COMMENT_ADDED'),
  v.literal('SYSTEM'),
);

/**
 * NOTE WHAT IS NOT IN THAT UNION: there is no ITEM_ADDED / ITEM_UPDATED notification row.
 *
 * The legacy app pushed on every item add/update (01 §5.17) but kept no inbox. Writing an inbox
 * row per member per item would mean 8 document inserts on the hottest write path and ~800,000
 * notification rows for one 100k-item ledger. That is the single worst write-amplification
 * available in this schema, so it is not taken:
 *   - the PUSH still fires (a scheduled action, fan-out over <= 8 tokens), preserving the
 *     behaviour members actually notice;
 *   - the in-app signal is the O(1) timestamp comparison of §5.3, at zero extra writes.
 *
 * Rows are written only for LOW-FREQUENCY, PERSONALLY-ADDRESSED events, all O(1) per event.
 */
export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,

  /** i18n key + params, NOT a rendered sentence. FightingHows stores Korean strings in the DB
   *  and therefore cannot localize a push per recipient; BooKoo is multi-language, so the text
   *  is rendered at send time from the RECIPIENT's userProfiles.locale (09 §11.2). */
  titleKey: v.string(),
  bodyKey: v.string(),
  params: v.record(v.string(), v.string()),
  /** English rendering, so an unknown key still shows something rather than a raw key. */
  fallbackTitle: v.string(),
  fallbackBody: v.string(),

  /** expo-router deep link, e.g. `/ledger/<id>/item/<id>`. */
  route: v.optional(v.string()),
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('items')),

  createdAt: v.number(),
  readAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  // inbox list: deletedAt inside the index so hidden rows are skipped BY the index
  .index('by_user_and_deleted_and_createdAt', ['userId', 'deletedAt', 'createdAt'])
  // unread badge: triple-eq, `.take(UNREAD_COUNT_LIMIT = 50)`, UI renders "50+"
  .index('by_user_and_deleted_and_read', ['userId', 'deletedAt', 'readAt']);

/**
 * Upsert keyed on the TOKEN STRING, not the user: Expo rotates a device's token and a device can
 * be handed to another account, so an existing row is re-pointed rather than duplicated.
 * HARD delete on sign-out — a retired token must stop matching `by_token` (09 §10.2).
 */
export const pushTokensTable = defineTable({
  userId: v.id('users'),
  token: v.string(),                 // ExponentPushToken[...]
  platform: platformValidator,
  deviceName: v.optional(v.string()),
  /** Cached so the push action can localize without reading the profile for every token. */
  locale: localeValidator,
  updatedAt: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_token', ['token']);
```

### 4.12 `convex/schema/uploads.ts`

```ts
/**
 * Convex records no uploader on `_storage` metadata, so a mutation handed a storage id cannot
 * tell a member's own blob from one they guessed. Ownership is first-claim-wins, recorded here,
 * and every delete path checks it. Copied wholesale from FightingHows (09 §7) minus the backfill
 * machinery, which a greenfield deployment does not need.
 *
 * A receipt photo is financial data and a Convex storage URL carries no auth and no expiry, so
 * BooKoo must DELETE blobs, not just references.
 */
export const uploadsTable = defineTable({
  storageId: v.id('_storage'),
  userId: v.id('users'),
  /** Set once the blob is attached, so the ledger purge can free its blobs without a scan. */
  ledgerId: v.optional(v.id('ledgers')),
  byteSize: v.number(),
  createdAt: v.number(),
})
  .index('by_storage', ['storageId'])
  .index('by_user_and_createdAt', ['userId', 'createdAt'])
  .index('by_ledger_and_createdAt', ['ledgerId', 'createdAt']);

/** Single row. High-water mark for the nightly orphan sweep. */
export const uploadMaintenanceTable = defineTable({
  purgedThrough: v.optional(v.number()),
  lastRunAt: v.optional(v.number()),
  lastRunDeleted: v.number(),
});
```

### 4.13 `convex/schema/feedback.ts`

```ts
export const feedbackCategoryValidator = v.union(
  v.literal('BUG'), v.literal('FEATURE'), v.literal('QUESTION'), v.literal('OTHER'),
);
export const feedbackStatusValidator = v.union(
  v.literal('NEW'), v.literal('TRIAGED'), v.literal('RESOLVED'), v.literal('SPAM'),
);

/**
 * Replaces legacy `bookoo/opinions` (02 §10), a write-only inbox the developer read in the
 * Firebase console. It stored a denormalized `user{}` snapshot from Firebase Auth (uid,
 * displayName, email, phoneNumber, photoURL) and a DATE-ONLY `createdAt` ('YYYY-MM-DD').
 *
 * Changes: userId reference instead of a PII snapshot; epoch-ms createdAt; the client
 * environment that actually makes a bug report actionable; a triage status so it is a queue
 * rather than a landfill; and rate limiting via @convex-dev/rate-limiter.
 */
export const feedbackTable = defineTable({
  /** Optional so a signed-out user can still report "I cannot sign in". */
  userId: v.optional(v.id('users')),
  category: feedbackCategoryValidator,
  body: v.string(),
  contactEmail: v.optional(v.string()),

  locale: localeValidator,
  appVersion: v.string(),
  buildNumber: v.number(),
  platform: platformValidator,
  osVersion: v.string(),
  deviceModel: v.string(),

  status: feedbackStatusValidator,
  adminNote: v.optional(v.string()),
  createdAt: v.number(),

  legacyKey: v.optional(v.string()),
  /** The legacy nested user{} object, verbatim JSON, for the archive import. */
  legacyUserRaw: v.optional(v.string()),
})
  .index('by_status_and_createdAt', ['status', 'createdAt'])
  .index('by_user_and_createdAt', ['userId', 'createdAt'])
  .index('by_legacyKey', ['legacyKey']);
```

### 4.14 `convex/schema/appContent.ts`

```ts
/** `{ko: '...', en: '...'}`. v.record keeps adding a locale a data change, not a schema change. */
export const localizedTextValidator = v.record(v.string(), v.string());

/**
 * Remote config. `value` is a discriminated union rather than v.any(): no `any` anywhere, and the
 * reader narrows on `kind` instead of casting. JSON payloads are a string parsed by a typed
 * reader in shared/config.ts.
 */
export const appConfigTable = defineTable({
  key: v.string(),
  value: v.union(
    v.object({kind: v.literal('STRING'), string: v.string()}),
    v.object({kind: v.literal('NUMBER'), number: v.number()}),
    v.object({kind: v.literal('BOOLEAN'), boolean: v.boolean()}),
    v.object({kind: v.literal('JSON'), json: v.string()}),
  ),
  description: v.optional(v.string()),
  updatedAt: v.number(),
  updatedBy: v.optional(v.id('users')),
}).index('by_key', ['key']);

/**
 * Version gate read once on cold start. The query takes only {platform} as an argument, so
 * Convex's per-(query,args) cache serves ONE result to the entire user base (13 §4.3 rule 4).
 */
export const appReleasesTable = defineTable({
  platform: platformValidator,
  version: v.string(),          // '3.0.1'
  buildNumber: v.number(),
  /** Anything below this must update before it can be used. */
  minSupportedBuild: v.number(),
  storeUrl: v.string(),
  mandatory: v.boolean(),
  releaseNotes: localizedTextValidator,
  releasedAt: v.number(),
}).index('by_platform_and_releasedAt', ['platform', 'releasedAt']);

export const announcementKindValidator = v.union(v.literal('NOTICE'), v.literal('FAQ'));

/**
 * Legacy shipped 9 announcements and 11 FAQs as HARDCODED i18n keys inside a 87 KB STRINGS.js,
 * with a `new: true` boolean literal on item 1 (01 §5.23/§5.24). Content moves to the database
 * so it can change without a store release, and "new" becomes
 * `publishedAt > ledgerMemberState-independent user lastNoticeReadAt` on the client.
 */
export const announcementsTable = defineTable({
  kind: announcementKindValidator,
  title: localizedTextValidator,
  body: localizedTextValidator,
  sortOrder: v.number(),
  pinned: v.boolean(),
  publishedAt: v.optional(v.number()),   // undefined = draft
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
  /** e.g. 'ANNOUNCEMENT_TXT_6' — provenance for the STRINGS.js converter. */
  legacyStringKey: v.optional(v.string()),
})
  .index('by_kind_and_deleted_and_sortOrder', ['kind', 'deletedAt', 'sortOrder'])
  .index('by_kind_and_published', ['kind', 'publishedAt']);
```

### 4.15 `convex/schema/migration.ts` — staging, droppable after cutover

```ts
export const claimStateValidator = v.union(
  v.literal('unclaimed'), v.literal('claimed'),
  v.literal('ambiguous'), v.literal('orphan_no_email'),
);

/** Verbatim from 14 §3.4. Legacy identities land HERE; nothing is written into Convex Auth's
 *  users/authAccounts by the migration. A `users` row appears only on a real verified sign-in. */
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

/** The legacy double index, imported as an ARCHIVE (14 §6.4). No behaviour is driven by it
 *  except one thing: when an email claims an account, `by_emailNormalized` surfaces the
 *  invitations that email was actually waiting on, and the claim flow offers them. */
export const legacyInvitesTable = defineTable({
  legacyKey: v.string(),                    // `${ledgerKey}/${encodedEmail}`
  legacyLedgerKey: v.string(),
  encodedEmail: v.string(),
  emailNormalized: v.optional(v.string()),
  ledgerId: v.optional(v.id('ledgers')),
  /** True when reconciliation found this email already in ledgers/{k}/members — an orphan left
   *  by the legacy `Promise.all(snapshot.forEach(...))` bug (02 §4). */
  supersededByMembership: v.boolean(),
  importedAt: v.number(),
})
  .index('by_legacyKey', ['legacyKey'])
  .index('by_emailNormalized', ['emailNormalized'])
  .index('by_ledger', ['ledgerId']);

export const photoMigrationStateValidator = v.union(
  v.literal('pending'), v.literal('done'), v.literal('missing'), v.literal('failed'),
);

/** Work queue for the Firebase Storage -> Convex _storage copy, driven by @convex-dev/workpool. */
export const photoMigrationsTable = defineTable({
  legacyKey: v.string(),                    // `${ledgerKey}/${itemKey}/${order}`
  itemId: v.optional(v.id('items')),
  order: v.number(),
  sourceUrl: v.string(),
  sourcePath: v.optional(v.string()),
  isBase64: v.boolean(),
  contentType: v.optional(v.string()),
  bytes: v.optional(v.number()),
  sourceMd5: v.optional(v.string()),
  migrationState: photoMigrationStateValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  photoId: v.optional(v.id('itemPhotos')),
})
  .index('by_legacyKey', ['legacyKey'])
  .index('by_state_and_attempts', ['migrationState', 'attempts'])
  .index('by_item_and_order', ['itemId', 'order']);

/** Audit trail of every import batch: table, counts, timestamps. Enables the per-table undo. */
export const migrationRunsTable = defineTable({
  runId: v.string(),
  table: v.string(),
  inserted: v.number(),
  skipped: v.number(),
  failed: v.number(),
  at: v.number(),
}).index('by_runId_and_table', ['runId', 'table']);
```

### 4.16 Constants (`convex/lib/constants.ts`)

```ts
export const ROLLUP_SHARD_COUNT = 1;          // raise to 4 only after measuring OCC (§7.2)

export const ITEM_PAGE_SIZE = 30;             // ~2 phone screens
export const ITEM_PAGE_MORE = 50;
export const COMMENT_PAGE_SIZE = 20;
export const NOTIFICATION_PAGE_SIZE = 20;

export const ROSTER_SCAN_LIMIT = 100;         // members per ledger; UI caps at 100
export const CATEGORY_SCAN_LIMIT = 200;       // 34 presets + up to 166 custom per ledger
export const INVITE_SCAN_LIMIT = 50;
export const JOIN_REQUEST_SCAN_LIMIT = 50;
export const PHOTO_SCAN_LIMIT = 20;           // photos per item
export const UNREAD_COUNT_LIMIT = 50;         // renders "50+"
export const NEW_ITEM_BADGE_LIMIT = 50;
export const MONTH_ROLLUP_SCAN_LIMIT = 600;   // 50 years of monthly buckets
export const LEDGER_SCAN_LIMIT = 50;          // ledgers one account may belong to
export const SEARCH_TAKE = 30;
export const SPARSE_FILTER_MAX_ROWS_READ = 4000;  // paginationOpts.maximumRowsRead

export const LAST_READ_THROTTLE_MS = 60_000;
export const LAST_SEEN_THROTTLE_MS = 5 * 60_000;
export const SOFT_DELETE_PURGE_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const HANDLE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDLE_RELEASE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
```

---

## 5. How the hard reads are answered without a scan

### 5.1 Every dashboard number is a rollup row

| UI element | Source | Docs |
|---|---|---|
| Month header "이번 달 지출 / 수입" | `ledgerMonthRollups` `.eq(ledgerId).eq(monthKey)` | **1** |
| Calendar day dots + per-day badge | `ledgerDayRollups` `.eq(ledgerId).gte(dayKey, mStart).lte(dayKey, mEnd)` | **≤31** |
| Tab2 section header subtotals | same table, paginated desc | **30 / page** |
| Donut per-category share | `ledgerCategoryMonthRollups` `.eq(ledgerId).eq(monthKey)` | **≤34** |
| 12-month line for one category | `ledgerCategoryMonthRollups` `.eq(ledgerId).eq(categoryId).gte(m1).lte(m2)` | **≤12** |
| Running balance at end of month M | `ledgerMonthRollups` `.eq(ledgerId).lte(monthKey, M)`, capped at 600 | **≤120 @10y** |
| Lifetime totals | same range, unbounded upper | **≤120 @10y** |

The legacy equivalents (`Tab3.setChartData`, `LedgerLineGraph`, `Tab2.convertSectionToMap`) each
walked **every item in the ledger, on every render**, in `getDerivedStateFromProps` (S5).

### 5.2 The three things that *look* like they need a hot counter, and do not

| Need | Naive design | This design | Why it matters |
|---|---|---|---|
| `lastItemAt` per ledger | field on `ledgers`, patched on every insert | `items.by_ledger_and_deleted_and_createdAt` `.order('desc').first()` — **1 doc** | removes a document all 8 writers would contend on; read set is the index tail, which changes exactly when a new item lands (correct invalidation, for free) |
| lifetime totals | fields on `ledgers`, patched on every insert | sum of ≤120 `ledgerMonthRollups` rows | same; and the monthly rows already exist |
| `itemCount` | field on `ledgers` | `sum(ledgerMonthRollups.itemCount)`, or a `.take(50)` probe rendered as "50+" | same |

Net effect: **`ledgers` has zero hot fields**, so the ledger switcher — the first screen after
launch — never re-renders because someone typed an expense.

### 5.3 The unseen-activity badge, at zero write cost

```ts
// per ledger, one comparison
const memberState = await ctx.db.query('ledgerMemberState')
  .withIndex('by_user_and_ledger', (q) => q.eq('userId', userId).eq('ledgerId', ledgerId))
  .unique();                                                            // 1 doc
const newest = await ctx.db.query('items')
  .withIndex('by_ledger_and_deleted_and_createdAt',
             (q) => q.eq('ledgerId', ledgerId).eq('deletedAt', undefined))
  .order('desc').first();                                               // 1 doc
const hasUnseen = (newest?.createdAt ?? 0) > memberState.lastReadAt;
```

Two documents per ledger, **zero extra writes on the item path**. The rejected alternative —
`ledgerMemberState.unreadCount++` for each of 8 members on every insert — is 8 extra document
writes per item and 8 extra contended documents. If a numeric count is ever demanded, it is a
bounded `.take(NEW_ITEM_BADGE_LIMIT = 50)` over the same index with `.gt('createdAt', lastReadAt)`,
rendered "50+".

This is also why the badge query is a **separate subscription** from `ledgers.listMine`: the ledger
list (cold) must not re-run when the badge (hot) changes.

### 5.4 Zero N+1: sidecar subscriptions instead of joins

A list query returns **raw rows**. Two small, long-lived, per-screen subscriptions supply the labels:

```ts
api.ledgers.roster({ledgerId})   // <= 8 ledgerMembers + <= 8 userProfiles = <= 16 docs, one sub
api.categories.catalog({ledgerId}) // 34 presets + <= N custom, capped 200, one sub
```

Both are cached across tab switches by `ConvexQueryCacheProvider` (`13` §7.3) and shared by every
loaded page. A 30-row page of `items` therefore costs **30 document reads, full stop** — no
`loadAuthorMap`, no `ctx.storage.getUrl()`, no category lookup.

Compare: legacy `SeeMembers` did one `users/{uid}` read per member and resolved its promise only
when `membersInfo.length === members.length`, so a single missing member node hung the screen
forever (S8).

Consequence worth stating: because the item list query does **not** read `userProfiles`, a
co-member renaming themselves or bumping `lastSeenAt` does not invalidate anyone's timeline. Only
the 16-doc roster subscription re-runs.

### 5.5 The sectioned infinite list (Tab2)

Two subscriptions, merged client-side by `dayKey` (`13` §5.2):

```ts
usePaginatedQuery(api.items.list,        {ledgerId}, {initialNumItems: 30});
usePaginatedQuery(api.rollups.dayPage,   {ledgerId}, {initialNumItems: 30});
```

Not one merged stream: `ledgerDayRollups` is invalidated by *every* item write, `items` page 5 is
not. Merging them would drag the cold pages into the hot read set.

### 5.6 Search

`items.searchIndex('search_memo')` with `filterFields: ['ledgerId','deletedAt','kind','categoryId']`,
`.take(30)`. Results come back in relevance order (BM25) and are sorted by date in JS over ≤30 rows.
Legacy searched `realAmount.toString().includes(txt) || category.txt.includes(txt)` over the whole
in-memory array **on every keystroke with no debounce** (S6). Amount search is now an explicit
range filter on `by_ledger_and_deleted_and_kind_and_amount`; category search is a chip filter on
`by_ledger_and_deleted_and_category_and_occurredAt`. Multi-select category filter uses
`mergedStream` from `convex-helpers/server/stream` (`13` §2.6), never `.filter()`.

Cost note: search storage is the smallest Convex allowance (0.5 GB free, `13` §9). Memos are short;
if it becomes a problem the fix is a truncated `memoSearch` field, not dropping the index.

---

## 6. READ-PATH TABLE — every screen, every query, every index, docs @100k items/ledger

`G` = the membership gate, `requireLedgerMember` → `ledgerMembers.by_ledger_and_user` `.unique()`, **1 doc**,
included in every ledger-scoped row below.

| # | Screen | Query | Index | Bound | Docs @100k | Grows with |
|---|---|---|---|---|---|---|
| 0 | Cold start | `users.me` | `userProfiles.by_user` | `.unique()` | 1 | — |
| 0 | | `app.release({platform})` | `appReleases.by_platform_and_releasedAt` desc | `.first()` | 1 | — (one cached result for the whole user base) |
| 0 | | `notifications.unreadCount` | `notifications.by_user_and_deleted_and_read` | `.take(50)` | ≤50 | — |
| 1 | Ledger switcher | `ledgers.listMine` | `ledgerMembers.by_user_and_status` `.eq(userId).eq('ACTIVE')` `.take(50)` + `db.get('ledgers', …)` | ≤50 ledgers | 10 + 10 = **20** | # ledgers |
| 1 | | `ledgers.unseen` (separate sub) | `ledgerMemberState.by_user_and_ledger` ×N + `items.by_ledger_and_deleted_and_createdAt` `.order('desc').first()` ×N | — | 10 + 10 = **20** | # ledgers |
| 2 | Tab1 calendar grid | `rollups.monthDays({ledgerId, monthKey})` | `ledgerDayRollups.by_ledger_and_dayKey_and_shard` `.eq(ledgerId).gte(dayKey,m0).lte(dayKey,m1)` | 31×shards | **≤31** + G | days in month |
| 2 | | `rollups.month({ledgerId, monthKey})` | `ledgerMonthRollups.by_ledger_and_monthKey_and_shard` | `.unique()` per shard | **1** | — |
| 3 | Tab1 day list | `items.listByDay({ledgerId, dayKey, paginationOpts})` | `items.by_ledger_and_deleted_and_occurredAt` `.gte(dayStartMs).lt(dayEndMs)` desc `.paginate(30)` | 30/page | **≤30** | entries that day |
| 3 | | `ledgers.roster` (shared, cached) | `ledgerMembers.by_ledger_and_status_and_role` + `userProfiles.by_user` | `.take(100)` | 8+8 = **16** | # members |
| 3 | | `categories.catalog` (shared, cached) | `categories.by_ledger_and_deleted_and_sortOrder` ×2 ranges | `.take(200)` | 34+N ≈ **40** | # custom categories |
| 4 | Tab2 infinite list | `items.list({ledgerId, paginationOpts})` | `items.by_ledger_and_deleted_and_occurredAt` desc `.paginate(30)` | 30/page | page 0 **30**; 20 pages **600** | pages *scrolled*, never table size |
| 4 | | `rollups.dayPage({ledgerId, paginationOpts})` | `ledgerDayRollups.by_ledger_and_dayKey_and_shard` desc `.paginate(30)` | 30/page | **30/page** | pages scrolled |
| 5 | Tab2 search | `items.search({ledgerId, term, kind?, categoryId?})` | `items.searchIndex search_memo` | `.take(30)` | **≤30** returned, ≤1024 scanned (Convex hard cap) | — |
| 5 | Tab2 amount filter | `items.listByAmount({ledgerId, kind, minMinor, maxMinor, paginationOpts})` | `items.by_ledger_and_deleted_and_kind_and_amount` | `.paginate(30)` | **≤30/page** | pages scrolled |
| 6 | Tab3 donut | `rollups.categoryMonth({ledgerId, monthKey})` | `ledgerCategoryMonthRollups.by_ledger_and_monthKey_and_category_and_shard` `.eq(ledgerId).eq(monthKey)` | ≤34×shards | **≤34** | # categories used that month |
| 6 | | `rollups.month({ledgerId, monthKey})` | as row 2 | — | **1** | — |
| 6 | | `rollups.balanceThrough({ledgerId, monthKey})` | `ledgerMonthRollups.by_ledger_and_monthKey_and_shard` `.lte(monthKey)` | `.take(600)` | **≤120 @10y** | months of history |
| 7 | LineGraph series | `rollups.categorySeries({ledgerId, categoryId, fromMonth, toMonth})` | `ledgerCategoryMonthRollups.by_ledger_and_category_and_monthKey_and_shard` | 12×shards | **≤12** | months requested |
| 7 | LineGraph month list | `items.listByCategory({ledgerId, categoryId, monthKey, paginationOpts})` | `items.by_ledger_and_deleted_and_category_and_occurredAt` + occurredAt range | `.paginate(30)` | **≤30/page** | pages scrolled |
| 8 | Item detail | `items.get({itemId})` | `db.get('items', id)` | — | **1** + G | — |
| 8 | | `photos.listByItem({itemId})` | `itemPhotos.by_item_and_deleted_and_order` | `.take(20)` | **≤20** | photos on the item |
| 8 | | `comments.list({itemId, paginationOpts})` | `itemComments.by_item_and_deleted_and_createdAt` desc `.paginate(20)` | 20/page | **≤20/page** | pages scrolled |
| 9 | Item add/update | `categories.catalog` (shared) | as row 3 | `.take(200)` | **≤200** | # custom categories |
| 9 | | `ledgers.get({ledgerId})` | `db.get` | — | **1** | — |
| 10 | Members / settings | `ledgers.roster` | as row 3 | `.take(100)` | **16** | # members |
| 10 | | `invites.listPending({ledgerId})` | `ledgerInvites.by_ledger_and_revoked_and_createdAt` `.eq(ledgerId).eq(revokedAt, undefined)` | `.take(50)` | **≤50** | open invites |
| 10 | | `joinRequests.listPending({ledgerId})` | `ledgerJoinRequests.by_ledger_and_status_and_createdAt` | `.take(50)` | **≤50** | pending requests |
| 10 | | `audit.list({ledgerId, paginationOpts})` | `ledgerAuditLog.by_ledger_and_createdAt` desc | `.paginate(30)` | **≤30/page** | pages scrolled |
| 11 | My profile | `users.me` + `handles.mine` | `userProfiles.by_user`, `userHandles.by_user_and_claimedAt` `.take(10)` | — | **≤11** | — |
| 11 | `/@handle` | `users.byHandle({handleKey})` | `userProfiles.by_handleKey` `.unique()` + `blocks.by_blocker_and_blocked` | — | **2** | — |
| 11 | handle availability | `handles.check({handle})` | `userHandles.by_handleKey` `.unique()` (advisory only) | — | **≤1** | — |
| 12 | Notification inbox | `notifications.list({paginationOpts})` | `notifications.by_user_and_deleted_and_createdAt` desc | `.paginate(20)` | **≤20/page** | pages scrolled |
| 12 | Notices / FAQ | `content.announcements({kind})` | `announcements.by_kind_and_deleted_and_sortOrder` | `.take(50)` | **≤50** | # notices |
| 12 | My feedback | `feedback.mine` | `feedback.by_user_and_createdAt` desc | `.take(20)` | **≤20** | — |

**Every cell in the "Grows with" column is bounded by something the user can see on screen.
Not one is `O(items)`.** That is the whole proposal in one sentence.

Worst realistic screen: Tab3 with 10 years of history = 1 (gate) + 1 (month) + 34 (donut) + 120
(balance) = **156 documents**. Legacy Tab3 read 100,000 and then re-derived them on every render.

Cold start to first pixel: `users.me` (1) + `ledgers.listMine` (20) = **21 documents**, plus the
MMKV cached copies of those two rendered instantly while the socket connects (`13` §7.4).

---

## 7. WRITE-PATH TABLE — every mutation, every document, every contention point

All mutations go through the triggers-wrapped `customMutation` (`13` §5.4 / §11 rule 6); the raw
`mutation` is imported in exactly one file. Rollup deltas are applied by a trigger registered on
`items`, so no mutation can forget them, and a throw inside the trigger aborts the whole mutation
atomically.

```ts
// convex/lib/rollups.ts — the single delta function, called by the items trigger
async function applyItemDelta(ctx: MutationCtx, doc: Doc<'items'>, sign: 1 | -1) {
  const shard = await shardOf(ctx, doc.ledgerId, doc.authorId);   // ledgerMembers.rollupShard
  const expense = doc.kind === 'EXPENSE' ? sign * doc.baseAmountMinor : 0;
  const income  = doc.kind === 'INCOME'  ? sign * doc.baseAmountMinor : 0;
  await upsertDay(ctx,  doc.ledgerId, doc.dayKey,   shard, expense, income, sign);
  await upsertMonth(ctx, doc.ledgerId, doc.monthKey, shard, expense, income, sign);
  await upsertCategoryMonth(ctx, doc.ledgerId, doc.monthKey, doc.categoryId, shard,
                            doc.kind, sign * doc.baseAmountMinor, sign);
}
```

### 7.1 The table

| Mutation | Documents written | Contended documents | Frequency | Risk |
|---|---|---|---|---|
| `items.create` | `items` +1 · `ledgerDayRollups` ×1 · `ledgerMonthRollups` ×1 · `ledgerCategoryMonthRollups` ×1 → **4 writes** (+ scheduled push action) | day(today) · month(current) · categoryMonth(current, that category) | the hottest path | **the only real OCC surface**; see §7.2 |
| `items.update` (amount/kind/category/date) | `items` ×1 · up to 2 day rows · up to 2 month rows · up to 2 categoryMonth rows → **≤7** | same buckets, old **and** new | moderate | same; a date edit crossing a month boundary touches two of each |
| `items.update` (memo only) | `items` ×1 → **1** | none | moderate | none; the trigger short-circuits when no rollup-relevant field changed |
| `items.softDelete` | `items` ×1 · 3 rollup rows → **4** | same | low | same |
| `items.restore` | `items` ×1 · 3 rollup rows → **4** | same | rare | same |
| `items.purge` (cron, >30d) | `items` −1 · `itemPhotos` −N · `_storage` −2N · `uploads` −N | none (rollups already zeroed at soft-delete) | nightly, batched 100 | none |
| `comments.create` | `itemComments` +1 · `items.commentCount` ×1 · `notifications` +1 (item author only, if not self and not muted) → **3** (+ scheduled push) | the parent `items` doc | low | contention only among people commenting on the *same item*; invalidates the one page containing that item, which is the desired UI update |
| `comments.softDelete` | `itemComments` ×1 · `items.commentCount` ×1 → **2** | parent item | low | none |
| `photos.attach` | `itemPhotos` +1 · `items.photoCount` + `coverThumbUrl` ×1 · `uploads` +1 → **3** | parent item | low | none. Uploads are parallel and happen **before** this mutation (legacy uploaded serially *inside* the save path — S13) |
| `photos.detach` | `itemPhotos` ×1 · `items` ×1 · `uploads` −1 · `_storage` −2 → **4** | parent item | low | none |
| `files.generateUploadUrl` | none | none | low | gated by `requireLedgerMember` so a non-member cannot burn storage quota |
| `ledgers.create` | `ledgers` +1 · `ledgerMembers` +1 · `ledgerMemberState` +1 · `ledgerAuditLog` +1 → **4** | none | rare | none |
| `ledgers.update` (title/desc/colour) | `ledgers` ×1 · `ledgerAuditLog` +1 → **2** | `ledgers` doc — read by every screen header | rare | invalidates all ledger screens once, correctly |
| `ledgers.setTimeZone` | `ledgers` ×1 · `ledgerAuditLog` +1 · `ledgerMaintenance` +1, then a **batched TZ_REKEY chain** re-deriving `dayKey`/`monthKey` on every item and rebuilding all rollups, 300 rows per transaction | every item + every rollup of that ledger | very rare | must never be inline; blocked while another maintenance job is RUNNING; the UI shows progress |
| `ledgers.setCurrency` | same shape, `CURRENCY_REBASE`: re-derive `baseAmountMinor` + rebuild rollups | same | very rare | same |
| `ledgers.softDelete` | `ledgers` ×1 · audit +1, then a self-rescheduling cascade over items/photos/comments/rollups at 200/batch (`09` §9.5) | none | very rare | an unbounded cascade must never be one mutation |
| `invites.create` | `ledgerInvites` +1 · audit +1 → **2** | `by_code` index range (uniqueness check-then-insert) | low | negligible — the range is one 22-char random key |
| `invites.redeem` | `ledgerInvites.useCount` ×1 · `ledgerMembers` +1/×1 · `ledgerMemberState` +1 · `ledgers.memberCount` ×1 · `notifications` +1 · audit +1 → **6** | the invite doc · `ledgers` doc | low | two people redeeming the *same* link race on `useCount`; Convex retries, and `maxUses` is then enforced correctly by the re-run |
| `invites.revoke` | `ledgerInvites` ×1 · audit +1 → **2** | invite doc | rare | none |
| `joinRequests.create` | `ledgerJoinRequests` +1/×1 · `notifications` +1 (owner+admins, ≤3) → **≤5** | none | rare | none |
| `joinRequests.decide` | request ×1 · membership +1 · memberState +1 · `ledgers.memberCount` ×1 · notification +1 · audit +1 → **6** | `ledgers` doc | rare | none |
| `members.setRole` | `ledgerMembers` ×1 · audit +1 · notification +1 → **3** | that member's gate doc — invalidates **their** queries only | rare | none |
| `members.remove` / `members.leave` | `ledgerMembers` ×1 · `ledgers.memberCount` ×1 · audit +1 · notification +1 → **4** | `ledgers` doc | rare | none |
| `members.transferOwnership` | 2× `ledgerMembers` ×1 · `ledgers.ownerId` ×1 · audit +1 · notification +1 → **5** | `ledgers` doc + 2 gate docs | very rare | invariant "exactly one ACTIVE OWNER" enforced in the mutation and re-verified nightly |
| `memberState.markRead` | `ledgerMemberState` ×1 → **1** | own row only | every ledger open, **throttled to 60 s** | none. This is exactly why it is not on `ledgerMembers` |
| `categories.create` | `categories` +1 · audit +1 → **2** | none | rare | none |
| `categories.softDelete` | `categories` ×1 · audit +1 → **2** | catalog subscription of that ledger | rare | items keep resolving because the row survives |
| `handles.claim` | `userHandles` +1 (+×1 release of the old) · `userProfiles` ×1 → **≤3** | `userHandles.by_handleKey` range for that exact key | once per account, then rate-limited | the intended contention: two claimers of the same handle serialise, loser gets `HANDLE_TAKEN` (`09` §12.2) |
| `users.updateProfile` | `userProfiles` ×1 (+ `uploads` +1 on avatar change) | own profile doc — invalidates the roster query of every ledger they are in | rare | acceptable; rosters are 16-doc subscriptions |
| `users.touchLastSeen` | `userPresence` ×1 → **1** | own row only | every app focus, **throttled to 5 min** | none — the reason `userPresence` exists |
| `push.registerToken` | `pushTokens` +1/×1 → **1** | `by_token` range | per launch | none |
| `push.removeToken` | `pushTokens` −1 | — | per sign-out | none |
| `notifications.markRead` / `markAllRead` | ×1 / ×N (`.take(100)` batched) | own rows | low | none |
| `feedback.submit` | `feedback` +1 → **1** | none | very low, rate-limited | none |
| `migrate.importItems` | ≤300 `items` inserts, one `by_legacyKey` `.unique()` probe each, **rollups intentionally NOT triggered** | none | migration only | rollups are built once at the end by a full `ROLLUP_REBUILD`, so 1M inserts do not hammer 3 rollup rows each |

### 7.2 Where OCC contention actually arises, and the plan

Convex conflicts when one transaction writes into an index range another transaction read
(`13` §2.4, `09` §12.2). A rollup upsert **reads** its bucket (`.unique()` on the index) then
patches it, so two mutations landing in the same bucket conflict and one is retried.

**The three contended documents, ranked:**

1. **`ledgerDayRollups(ledger, today, shard 0)`** — 8 members entering today's expenses hit the
   same row. Highest-probability collision by far.
2. **`ledgerMonthRollups(ledger, currentMonth, shard 0)`** — identical write rate, same row.
3. **`ledgerCategoryMonthRollups(ledger, currentMonth, popularCategory, shard 0)`** — same rate but
   split ~34 ways, so ~34× less likely.

**Why this is fine at launch.** These mutations write 4 tiny documents and do no I/O; they complete
in single-digit milliseconds. Convex retries internally and only surfaces a write-conflict error
when mutations arrive faster than they complete. A household ledger with 8 members produces on the
order of tens of writes per *hour*. Measured collision probability is effectively zero.

**Why the escape hatch is in the schema from day one.** `rollupShard` on `ledgerMembers` and `shard`
in all three rollup index tuples cost nothing today and remove the contention entirely tomorrow:

- reads never `.eq()` the shard, so raising `ROLLUP_SHARD_COUNT` needs **no query change**;
- writes always `.eq(myShard)`, so raising it needs **no mutation change**;
- the upgrade is: bump the constant → run a `ROLLUP_REBUILD` job per ledger → done. **No schema
  migration, no index change, no downtime.**

Cost of `ROLLUP_SHARD_COUNT = 4`: the calendar reads 124 docs instead of 31, the donut 136 instead
of 34. Still O(1) in ledger size. Do not pay it until the health dashboard shows conflicts.

**Deliberately NOT contended:**
- `items` itself — inserts conflict only with transactions that *read* the range they land in, and
  no mutation reads the item index range. Only paginated *queries* do, and queries do not conflict.
- `ledgers` — no hot field on it at all (§5.2).
- `ledgerMembers` — the gate document is read by everything and written almost never.
- `userProfiles` — the heartbeat that would have made it hot lives in `userPresence`.

**Anti-pattern explicitly avoided:** an un-namespaced `@convex-dev/aggregate` keyed on
`_creationTime`. The aggregate README's own corollary is that this "adds every new data point to the
same part of the data structure … therefore all inserts will wait for each other and no mutations
can run in parallel" (`13` §3.2). That would have been strictly worse than the rollup rows.

---

## 8. Every legacy behaviour named in the brief — the design for each

| Legacy | Where it went | Why |
|---|---|---|
| **`info.color` 0..5** | `ledgers.colorKey`, a 6-literal union `PINK\|ORANGE\|YELLOW\|TEAL\|BLUE\|PURPLE`. Migration maps the index; fallback `TEAL` (legacy's fallback). | Dark mode needs two hex values per colour, so a raw index cannot be the source of truth. A literal union is typo-proof and readable in the dashboard. The mapping is total, so nothing is lost. |
| **`visible` flag** | **Dropped.** Split into `ledgers.deletedAt` (soft delete) and `ledgers.archivedAt` (hidden from the switcher, still readable). | `visible` was written `true` at creation and **never set to false anywhere in the codebase** (`02` §2.1); the security rules treated it as a soft-delete flag the app never used. It carried zero information. Migration maps any `visible === false` row to `deletedAt`. |
| **`owner` + transfer ownership** | `ledgerMembers.role = 'OWNER'` is the authority; `ledgers.ownerId` is a denormalized copy. `members.transferOwnership` patches both membership rows, `ledgers.ownerId`, and writes an audit row, in one ACID mutation. | The gate already loads the membership row, so role comes free with the O(1) auth check. `ownerId` on the ledger lets the switcher draw the crown without joining memberships per ledger. Legacy's `changeOwner` wrote **one field** and left the old owner as a plain member with no record — now it is atomic and audited. Invariant "exactly one ACTIVE OWNER" is asserted in the mutation and re-verified by a nightly cron over `by_ledger_and_status_and_role`. |
| **Join requests** (`ledgers/{k}/requests/{uid}`) | `ledgerJoinRequests` table, gated behind the new `ledgers.discoverable` opt-in. Decisions are recorded (`status` + `decidedBy` + `decidedAt`). | Legacy stored a bare `uid → uid` toggle and a *reject simply deleted the node*, so a stranger could re-request forever and the owner had no record. Legacy also re-read every ledger's requests **sequentially in a `for await` loop on every refresh** (S4); now it is one `.take(50)` on the settings screen only. Discovery is opt-in because legacy ledgers were all implicitly searchable by exact title. |
| **Bidirectional `invites` index for unregistered emails** | **One `ledgerInvites` row, two indexes:** `by_ledger_and_revoked_and_createdAt` (legacy index A — "who is pending on this ledger") and `by_emailNormalized_and_revoked` (legacy index B — "which ledgers await this email"). Primary UX is a deep link keyed by `by_code`. | Legacy mirrored the same fact into two subtrees of the **same map**, distinguished only by a "does this key look like a push id" heuristic, and both writers had `Promise.all` bugs that left orphans in production (`02` §4). One row with two indexes is the same two lookups, maintained by the database, impossible to desynchronise. The legacy rows are still imported into `legacyInvites` so that when an invited email finally claims an account, the invitations it was actually waiting on are surfaced. |
| **Per-item `picture[]` array** | `itemPhotos` table (one row per photo) + `items.photoCount` + `items.coverThumbUrl` denormalized for the list row. Two storage ids per photo (client-generated 320px thumb + original). | An array on the item meant every attach rewrote the whole item — which in legacy also rewrote the nested `reviews` map and silently destroyed any comment added between load and save (S12). Convex caps arrays at 8,192 and documents at 1 MiB. The denormalized `coverThumbUrl` is what keeps a list page at zero `ctx.storage.getUrl()` calls (`13` §6.3). |
| **`location {street, lat, lng, …}`** | `items.place: {lat, lng, label}`, **inline**, optional. Raw geocode blob → `items.legacyRaw`. | Legacy persisted a whole Expo SDK-36 `reverseGeocodeAsync` result whose shape varied by platform and locale, of which **only `street` was ever read back** (`02` §7.2). Three normalised fields cover every read site. Inline, not a table: it is immutable with the item and read only on the detail screen, so a join would buy nothing and cost a document. |
| **Per-item `reviews` comment thread** | `itemComments` table, paginated `by_item_and_deleted_and_createdAt`, no threading, `items.commentCount` denormalized for the row badge. Authors resolved from the shared roster subscription. | Legacy used a live `.limitToLast(100)` listener that re-fetched all 100 on any change, did a `users/{writer}/info` read **per review**, and sorted the array **inside each callback** — O(n² log n) (S10). No threading because legacy had none and a ledger comment thread is short. |
| **Device-local SQLite categories** | `categories` table, server-side, two scopes: global presets (`ledgerId: undefined`, stable `key` slug, label = i18n key resolved at render) and per-ledger customs (`name`, shared by all members). Items store `categoryId` only. | This is the biggest *feature* fix. Legacy seeded 34 categories into `expo-sqlite` at first launch with the **localized label frozen into the DB**, so changing app language never re-translated them; custom categories never synced, so member A's category appeared to member B only as a `{iconId, txt}` snapshot on the item; and a reinstall lost them all (`02` §7.1). Resolving labels at render from a slug fixes the freeze; a shared per-ledger scope fixes the sync gap. Migration builds the per-ledger set by uniquing `(kind, iconId, label)` across that ledger's items, with an `Uncategorized` fallback for out-of-range `iconId` (legacy indexed a 34-entry array with **no bounds check**, so bad data exists). |
| **`amount` string vs `realAmount` signed number** | `amountMinor` (non-negative integer minor units) + `currency` + `kind`. `amount` **dropped**; the legacy pair survives only inside `items.legacyRaw`, never parsed. Formatting is `Intl.NumberFormat` at render. | `amount` embedded the currency **and locale of whoever created the row** and was never parsed back for math, so one ledger could contain `"₩-12,000"`, `"-$12.00"` and `"-12.000 Rp"` side by side with no per-ledger currency anywhere (`02` §6/§16). `realAmount`'s sign *was* the type, which required a client-side patch (`category.category === 0 → force negative`), had no equivalent guard for income, and produced a live `> 0` vs `>= 0` inconsistency on zero-amount rows. An explicit `kind` plus an unsigned magnitude makes all of that unrepresentable, and integers make the migration's checksum verification exact. |
| **`opinions` feedback** | `feedback` table: `userId` reference (not a PII snapshot), epoch-ms `createdAt`, `category`, triage `status`, and the client environment (`appVersion`, `buildNumber`, `platform`, `osVersion`, `deviceModel`, `locale`). Rate-limited. Legacy rows imported to `legacyKey` + `legacyUserRaw`. | Legacy pushed a nested `{uid, displayName, email, phoneNumber, photoURL}` snapshot with a **date-only** `createdAt` into a node the app never read (`02` §10). The snapshot duplicates PII that is already in `userProfiles` and goes stale; the date-only stamp cannot order same-day reports; and without device/version fields a bug report is not actionable. |

### 8.1 Other legacy facts folded elsewhere

| Legacy artefact | Disposition |
|---|---|
| `info.people` (always `1`, never read) | dropped. Real member count is `ledgers.memberCount`, maintained on join/leave. |
| `users/{uid}/ledgers` mirror map | dropped. `ledgerMembers.by_user_and_status` replaces it. Legacy left dangling pointers behind after `deleteLedger`, which then threw and wiped the client's whole ledger list (`02` §9). |
| `users/{uid}/push_tokens` with hand-encoded keys | `pushTokens` table, keyed on the raw token string, `by_token`. The `%2E` key encoding disappears with RTDB. |
| `category.showDelBtn` / `category.img` / `category.key` / `results` / `pictureDelete` / `LedgerItem.categories` | dropped (UI leakage / transient). |
| `item.created` / `item.updated` (client-clock ISO strings, never read by the UI) | `items.createdAt` / `updatedAt`, epoch ms, server-stamped; `legacyCreatedAt` preserves the original. |
| `selectedLedgerIndex` (an **array index** in AsyncStorage) | `ledgerMemberState.sortOrder` / `pinnedAt` server-side + last-selected **ledgerId** in MMKV. Legacy broke whenever ledger order changed. |
| App lock: `LOCKED`, `LOCKED_NUMBER` (plaintext PIN), `LOCKED_FINGERPRINT` | **stays device-local**, moved to `expo-secure-store` with a hashed PIN. Not modelled server-side — see §10. |
| `switch_new` / `switch_update` notification prefs (device-local) | `userProfiles.notify*` (account-level) + `ledgerMemberState.notifyItems/notifyComments/muted` (per-ledger). Legacy prefs never left the device, so a new phone silently re-enabled everything. |
| 9 announcements + 11 FAQs hardcoded in `STRINGS.js` | `announcements` table with `localizedText`, `legacyStringKey` for provenance. |
| 46-entry hardcoded currency table (with real errors: EUR unit `$`, `IND` instead of `IDR`, ZAR unit `VND`, pre-euro `GRD`/`ITL`) | **not ported.** Currency list derives from a maintained ISO-4217 set in `shared/money.ts`; `ledgers.currency` stores the code, the symbol comes from `Intl.NumberFormat`. |
| `.indexOn: "info/title"` + exact-match `searchLedgers` | `ledgers.searchIndex('search_title')` with `filterFields: ['discoverable','deletedAt']`, prefix/fuzzy-capable. Legacy required the **exact full title**, then re-checked it in JS, and dragged the whole `items` subtree along with each result (S11). |

---

## 9. Migration fields — where every `legacy*` lives

Placed on day one per `DECISIONS.md` §4. `legacyKey` values are **globally unique composites**, never
a bare RTDB child key (`14` §6.1 — a bare `itemKey` is not unique across ledgers and
`by_legacyKey(...).unique()` would eventually throw).

| Table | Field | Legacy source | Index |
|---|---|---|---|
| `legacyUsers` | `legacyUid` | Firebase Auth `localId` | `by_legacyUid` |
| `userProfiles` | `legacyUid`, `legacyCreatedAt`, `isLegacyPlaceholder` | Auth `localId`, `createdAt` | `by_legacyUid` |
| `ledgers` | `legacyKey`, `legacyOwnerUid`, `legacyCreatedAt` | RTDB push id, `owner`, push-id timestamp | `by_legacyKey` |
| `ledgerMembers` | `legacyKey` = `` `${ledgerKey}/${uid}` ``, `legacyUid` | `ledgers/{k}/members` (authoritative) | `by_legacyKey` |
| `ledgerInvites` | `legacyKey` = `` `${ledgerKey}/${encodedEmail}` ``, `legacyEncodedEmail` | `invites` index A | `by_legacyKey` |
| `items` | `legacyKey` = `` `${ledgerKey}/${itemKey}` ``, `legacyWriterUid`, `legacyCreatedAt`, `legacyRaw`, `needsReview` | item node | `by_legacyKey` |
| `itemComments` | `legacyKey` = `` `${ledgerKey}/${itemKey}/${reviewKey}` ``, `legacyWriterUid` | `reviews` | `by_legacyKey` |
| `itemPhotos` | `legacyKey` = `` `${ledgerKey}/${itemKey}/${order}` ``, `legacyPath`, `legacyUrl`, `legacyBase64` | `picture[]` | `by_legacyKey` |
| `categories` | `legacyIconId` (0..33), `legacyLabel` | denormalized `{iconId, txt}` on items — the **only** surviving record of a custom category | `by_ledger_and_legacy` |
| `feedback` | `legacyKey`, `legacyUserRaw` | `opinions/{pushKey}` | `by_legacyKey` |
| `announcements` | `legacyStringKey` | `STRINGS.js` key | — |
| `legacyInvites` | `legacyKey`, `legacyLedgerKey`, `encodedEmail`, `supersededByMembership` | the whole `invites` subtree, both indexes | `by_legacyKey`, `by_emailNormalized` |
| `photoMigrations` | `legacyKey`, `sourceUrl`, `sourcePath`, `isBase64` | Storage objects | `by_legacyKey` |

Every `by_legacyKey` index exists for exactly one reason: **one `.unique()` probe per imported row
makes the batch import idempotent and resumable** (`14` §4.5). They are the only indexes in this
schema that serve no product screen, and they are dropped (with the four staging tables) once the
cutover is verified.

Timestamp fields (`legacyCreatedAt`) exist because a batch-mutation import cannot set
`_creationTime` — only a JSONL data import can (`14` D7). Every index in this schema sorts on an
explicit `createdAt` / `occurredAt`, **never** on `_creationTime`, so the two import mechanisms
produce identical ordering.

One migration-specific write-path rule, worth repeating from §7.1: **`migrate.importItems` does not
fire the rollup trigger.** One million inserts each patching three rollup rows would be one million
serialised conflicts. Rollups are built once at the end by a per-ledger `ROLLUP_REBUILD` job, which
is also the nightly repair job — so the migration exercises the safety net it will rely on forever.

---

## 10. What I deliberately did NOT model, and why

| Not modelled | Why |
|---|---|
| **`@convex-dev/aggregate`** | Every v1 aggregate is a fixed bucket known at write time, which is exactly the case `13` §3.4 says belongs in a rollup table: 1-document reads, no B-tree, no contention, no `_creationTime` insert serialisation. Adopt it only when an arbitrary-date-range report ships ("2024-03-05 → 2025-11-20"), namespaced by `ledgerId`, never global. |
| **`@convex-dev/sharded-counter`** | There is no global counter in the product. Per-ledger sharding is handled by the `shard` field, which is simpler and readable in one index range. |
| **Accounts / wallets and `kind: 'TRANSFER'`** | Legacy has no concept of an account, so a transfer has no source or destination and the rollup math (income − expense) would become ambiguous. Adding accounts changes the entry UX and the balance definition; that is a product decision, not a schema one. `itemKindValidator` is a union, so adding `'TRANSFER'` later is a data change, not a migration. |
| **Budgets and budget alerts** | Not a legacy feature. A budget is one row per (ledger, monthKey, categoryId?) with a threshold, checked against the rollup row that already exists — trivially addable, so nothing is being locked out. |
| **Recurring / scheduled transactions** | Not a legacy feature. Would need a `recurringRules` table plus a materialisation cron; it also complicates the "every item is a real row" invariant that makes rollups exact. |
| **Split / settle-up between members ("who owes whom")** | Not a legacy feature. It is a genuinely different product (Splitwise), needing per-item shares and a settlement ledger. |
| **Attachment of a category to an item as a denormalized label** | Deliberately reverted. Legacy froze the localized label onto the item; this schema stores `categoryId` and resolves the label at render. The cost is one catalog subscription per screen; the benefit is that changing app language actually re-translates. |
| **A per-item audit/history table** | `ledgerAuditLog` covers governance only. Versioning every item edit would roughly double the write volume of the hottest path and make the audit table the largest in the deployment. `updatedAt` + `updatedBy` + the 30-day soft-delete window cover the questions members actually ask. |
| **In-app notification rows for `ITEM_ADDED` / `ITEM_UPDATED`** | 8 inserts per item, ~800k rows per 100k-item ledger. The push still fires; the in-app signal is the O(1) timestamp comparison of §5.3. |
| **Denormalized author name/avatar on `items` or `ledgerMembers`** | A rename would fan out to every row, and putting a display snapshot on the gate document would make a rename invalidate every query in the ledger for every member. The 16-document roster subscription is strictly cheaper. |
| **Server-side app lock (PIN / biometric)** | A server-stored PIN is a liability with no benefit: the lock must work offline and its whole purpose is local device protection. Moves from AsyncStorage plaintext to `expo-secure-store` with a hash, plus lock-on-background and a failed-attempt lockout — all client-side. |
| **A `rateLimits` table** | `@convex-dev/rate-limiter` is a component; its sharding is already solved. One fewer table to keep correct. |
| **Geospatial index on `items.place`** | "Map of all my spending" is not a legacy screen. Convex has no geo index; it would need a geohash column. Deferred, and adding a `geohash` field later is additive. |
| **A `ledgerStats` hot-counter table** | Removed rather than relocated — see §5.2. This is the one place where this proposal deliberately goes further than note `13` §11 rule 9. |
| **`bookoo/ledgers/{k}/requests` as a live toggle** | Replaced by `ledgerJoinRequests` with recorded decisions. The toggle semantics ("press again to un-request") remain in the UI; the storage is now auditable. |

---

## 11. Compliance audit against note `13` §11 (literally, item by item)

| Rule | Status |
|---|---|
| 1. No `.filter()` on `ledgerItems`, ever | ✅ Banned on `items` by convention **and structurally**: `deletedAt` and `kind` and `categoryId` are all index components, so there is nothing left to filter. The remaining narrowing (`mergedStream` for multi-select categories) is index-backed. |
| 2. No `.collect()` without an O(members)/O(months) bound | ✅ Only `.collect()` sites: a user's `pushTokens` (bounded by devices) and a member's rollup shards (bounded by `ROLLUP_SHARD_COUNT`). Everything else is `.take(CONST)` or `.paginate()`. |
| 3. Every list is `.paginate()`d, 30 / 50 | ✅ `ITEM_PAGE_SIZE = 30`, `ITEM_PAGE_MORE = 50`. |
| 4. Every query starts with an indexed membership check | ✅ `requireLedgerMember` → `ledgerMembers.by_ledger_and_user` `.unique()`, 1 doc, first line. |
| 5. `ctx.db.get("table", id)` two-arg form | ✅ Convention; `convex/AGENTS.md` states it. |
| 6. All mutations through the triggers-wrapped `customMutation` | ✅ Raw `mutation` imported in one file; rollup deltas are a registered trigger on `items`. |
| 7. Rollup tables for the dashboard; aggregate only for arbitrary ranges, namespaced | ✅ Three rollup tables; aggregate deferred (§10). |
| 8. Never key an aggregate on `_creationTime` | ✅ No aggregate. Every index sorts on explicit `createdAt` / `occurredAt` / `dayKey` / `monthKey`. |
| 9. Hot-write fields in `ledgerStats`, not on `ledgers` | ✅ **Exceeded** — hot fields eliminated, no such table exists (§5.2). Hot per-member state is in `ledgerMemberState`; hot per-user state is in `userPresence`. |
| 10. `getUrl` denormalized onto the document | ✅ `itemPhotos.fullUrl` / `thumbUrl`, `items.coverThumbUrl`, `userProfiles.avatarUrl` / `avatarThumbUrl` — all written at attach time, cleared by the same mutation that deletes the blob. |
| 11. Thumbnails generated client-side, two storage ids per photo | ✅ `fullStorageId` + `thumbStorageId`. |
| 12. Query cache + stable pagination + MMKV for the 3 screen-defining queries | ✅ `api.ledgers.listMine`, `api.rollups.month`, page 0 of `api.items.list`. |
| 13. No `Date.now()` inside queries — pass `monthKey` / `dayKey` as args | ✅ Every rollup query takes an explicit key argument, which is also what makes it cacheable per-month and shareable across the ledger's members. |
| 14. Money is integer minor units + ISO-4217 | ✅ §1.1, and the legacy string is gone. |
| 15. Deployment usage limits before the first public build | ✅ Operational checklist item, not schema. |

Convex hard limits: max **9 indexes** on any table (`items`); max **4 fields** in any index tuple;
longest index name 48 of 64 chars; no `_`-prefixed field indexed; no document approaches 1 MiB
(the largest, a migrated `items` row with `legacyRaw`, is < 8 KB); no array field anywhere — the
legacy `Ledger.items[]` / `picture[]` / `members{}` nesting is fully decomposed.

---

## 12. Verification plan (the guard that keeps this true)

`convex-test` alone cannot prove any of this: it enforces no size or time limits, so a `.collect()`
that would blow up in production passes (`13` §10.1). Two tiers:

1. **`convex-test` unit tests** — correctness of the rollup deltas (create / edit across a month
   boundary / soft-delete / restore round-trips to zero), the handle uniqueness race, the
   permission matrix, and the pure `shared/` modules (`money.ts`, `date.ts`, `username.ts`).
2. **Transaction-metric assertions against a real dev deployment**, seeded with
   `convex run seeds:seedLedger '{"items": 100000, "years": 5, "members": 8}'`. Every hot query is
   wrapped and asserted:
   ```ts
   const m = await ctx.meta.getTransactionMetrics();
   expect(m.documentsScanned.used).toBeLessThan(BUDGET[queryName]);
   ```
   with `BUDGET` taken column-by-column from §6. **This is the only automated guard that catches the
   regression class that killed the legacy app**, and it must run in CI on every PR touching
   `convex/`.

Plus a nightly `ROLLUP_REBUILD` repair cron that recomputes one ledger-month from
`items.by_ledger_and_monthKey` and patches the rollup if it disagrees, stamping `repairedAt`. That
cron is the safety net that makes shipping this much denormalisation defensible — and it is the same
code path the migration uses to build the rollups in the first place, so it is exercised on day one.

---

## 13. Open questions for implementation

1. **`Intl.DateTimeFormat` with a `timeZone` option inside the Convex isolate** — verify with a
   one-line `convex run` before `shared/date.ts` is written. If the isolate ships without full ICU
   the fallback is a compact IANA offset table bundled in `shared/`, which is uglier but tractable
   (BooKoo needs perhaps 40 zones in practice).
2. **`ROLLUP_SHARD_COUNT`** — launch at 1. What conflict rate on the Convex health dashboard should
   trigger the bump to 4?
3. **`fxRate` source and refresh policy** for multi-currency items — which provider, and does the
   client or a scheduled action fetch it? Frozen-at-entry is decided; the source is not.
4. **Ledger discovery** — ship `discoverable` + `ledgerJoinRequests` in v1, or invite-links only and
   dark-launch the tables? The schema supports either.
5. **Memo search index** — index full memos, or a truncated `memoSearch` field? Search storage is
   the smallest Convex allowance (0.5 GB free) and this is the one line item that scales with the
   number of items.
6. **Comment threading** — legacy had none; FightingHows has one level. Confirm flat is acceptable
   before the index shape (`by_item_and_deleted_and_createdAt`) hardens.
7. **Photo migration budget** — how many legacy blobs exist, and does the workpool copy run before
   or after cutover? This determines whether `photoMigrations` is a pre-cutover or post-cutover job.
8. **Legacy `selectedDate` recovery rate** — `02` §8 predicts a class of items whose `selectedDate`
   was written as an empty object (the `Date`-object bug) and therefore vanished. The fallback chain
   is `selectedDate → created → push-id timestamp`, but the *rate* must be measured against a real
   export, because every one of those items lands in the wrong `dayKey` bucket.
