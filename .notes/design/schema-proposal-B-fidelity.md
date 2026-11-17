# Schema Proposal B — Migration & Domain-Fidelity First

**Author angle:** every byte in `bookoo-89f6c` must have exactly one home in the new schema, the two-pass
import in `14-firebase-to-convex-migration.md` must be mechanical, and a legacy user's first sign-in must
restore *everything* — owned ledgers, ledgers they were merely a member of, items, photos, comments,
pending invites, pending join requests.

**Inputs:** `.notes/DECISIONS.md`, research notes `01`, `02`, `03`, `04`, `06`, `09`, `13`, `14`.
**Target:** `convex/schema.ts` + `convex/schema/*.ts`, Convex `1.45.0`, `@convex-dev/auth 0.0.95`.

Design posture, in priority order:

1. **Nothing legacy becomes unrepresentable.** Where the new model is cleaner than the old one, the old
   value is still *kept* in an explicit `legacy*` field or in `legacyRaw` (a JSON string). Never inferred
   and thrown away.
2. **Explicit and boring beats clever.** No polymorphic tables, no `v.any()`, no union-typed foreign keys,
   no field that means two things. Every table is auditable by a person reading a JSONL dump next to it.
3. **Every unbounded list paginates on an index that already excludes soft-deleted rows.** Every dashboard
   number is one document read. Membership is one index point-read.
4. **Timestamps are `v.number()` epoch ms, always, everywhere** (FightingHows rule, `09` §3). Ordering
   *never* uses `_creationTime`, because the batch-mutation import path cannot set it (`14` §4.3).

---

## Part 0 — Cross-cutting decisions (read this before the tables)

### 0.1 Money representation

| Concern | Decision |
|---|---|
| Storage | `amountMinor: v.number()` — **integer minor units**, **non-negative magnitude** |
| Sign | **Not encoded in the number.** `kind: 'EXPENSE' \| 'INCOME'` is the discriminator |
| Currency | `currency: v.string()` (ISO-4217) **on the item**, plus `ledgers.currency` as the ledger's base |
| Cross-currency | `baseAmountMinor: v.number()` (converted into `ledgers.currency`) + `fxRate: v.number()` + `fxRateSource` |
| Rollups | sum **`baseAmountMinor` only** — that keeps every rollup row a single, meaningful number |
| Legacy display string | `legacyAmountString` — **stored, never parsed** |
| Legacy signed number | `legacyRealAmount: v.number()` — stored verbatim so a re-derivation is always possible |

**Why magnitude + `kind` instead of the legacy signed `realAmount`:** every legacy read path already
branched on the sign (`Tab2.renderSectionHeader`, `Tab3.setChartData`, `LedgerItemDetail`), i.e. the sign
*was* a type tag wearing a number's clothes. Making it a real tag (a) makes `kind` indexable, which the
expense-only/income-only screens need, (b) makes `sum(amountMinor)` unambiguous in a rollup, and (c)
removes the whole class of legacy bug documented in `02` §6 (`realAmount > 0` on a `category.category === 0`
row; the `> 0` vs `>= 0` inconsistency between the tab picker and the income form).

**Migration rule for `kind`** (must be deterministic and reproducible):

```
kind = realAmount <  0 ? 'EXPENSE'
     : realAmount >  0 ? 'INCOME'
     : category.category === 1 ? 'INCOME'
     : 'EXPENSE'                                   // realAmount === 0, no category hint
amountMinor = toMinor(Math.abs(realAmount), currency)
```

Sign wins over `category.category` because **sign is what the legacy UI actually rendered**. Any row where
`sign(realAmount)` disagrees with `category.category` is migrated by sign *and* recorded in
`migrationAnomalies` with `kind: 'AMOUNT_SIGN_CATEGORY_MISMATCH'`. Any row with `realAmount === 0` is
recorded as `kind: 'ZERO_AMOUNT'`. Neither blocks the import.

**`toMinor`** is `14` §4.7 verbatim (zero-decimal currency set, throws on a lossy conversion). All BooKoo
legacy data is almost certainly `KRW` (zero-decimal), so `amountMinor === Math.abs(realAmount)` for the
overwhelming majority of rows — a property the verification pass asserts.

**There is no currency anywhere in the legacy DB** (`02` §16). So:
- `ledgers.currency` defaults to `KRW` for migrated ledgers, with `ledgers.currencyIsAssumed = true`.
- `ledgerItems.currencyIsAssumed = true` on every migrated row.
- The first member to open a migrated ledger gets a one-time "confirm this ledger's currency" prompt.
  Confirming flips `currencyIsAssumed` to `false` on the ledger and (via a batched internal mutation)
  rewrites `currency` on every item that still has `currencyIsAssumed === true`. Amounts do **not** change
  — only the label — because the legacy number was always a major-unit figure in the writer's own currency.

### 0.2 Date / time representation and **the timezone rule**

The legacy app wrote `moment().format()` — ISO-8601 with the *writer's device* UTC offset — and every list,
calendar and chart bucketed with a local `moment()` comparison on the *reader's* device (`02` §8,
`01` §5.8–5.10). Two members in Seoul and Los Angeles therefore saw the same expense on two different days,
and monthly totals disagreed between devices. This is a real correctness bug, not a cosmetic one, and a
shared ledger cannot ship with it.

> **THE RULE: the ledger owns the calendar.**
> Every `ledgers` row carries `timeZone: v.string()` — an IANA zone id (`"Asia/Seoul"`). Day/month bucketing
> for **every** member, on **every** device, is computed in **the ledger's** timezone. Members never see
> different day boundaries for the same ledger.

Each `ledgerItems` row therefore stores **four** time facts, all derived at write time on the server:

| field | type | meaning |
|---|---|---|
| `occurredAt` | `v.number()` | epoch ms — the absolute instant the user chose. The only orderable truth |
| `occurredOffsetMinutes` | `v.number()` | the UTC offset (minutes) in effect **in the ledger's tz** at `occurredAt`. Lets the client render the original wall clock without an IANA tz database round-trip and survives a later tz change |
| `dayKey` | `v.number()` | `YYYYMMDD` as an int, computed in the ledger's tz. `20260824` |
| `monthKey` | `v.number()` | `YYYYMM` as an int, computed in the ledger's tz. `202608` |

**`dayKey` is a monotone function of `occurredAt` for a fixed timezone.** That is the single most useful
property in this schema: an index on `["ledgerId", "deletedAt", "dayKey", "occurredAt"]` simultaneously
serves (a) the newest-first infinite timeline, (b) any month range, and (c) a single-day equality lookup —
so the ledger timeline needs **one** index, not three. `03` §11.3's `toDayKey`/`toMonthKey` become integer
variants; the client never recomputes them, it reads them.

Changing `ledgers.timeZone` is **owner-only** and schedules
`internal.ledgers.rebucket.run({ledgerId})`: a cursor-batched internal mutation that recomputes
`dayKey`/`monthKey`/`occurredOffsetMinutes` on every item and then recomputes every rollup row for the
ledger from source. `ledgers.timeZoneRebucketState` tracks it so the UI can show "recalculating…".

**Migration:** `timeZone = 'Asia/Seoul'` for every migrated ledger, `timeZoneIsAssumed = true`. Rationale:
BooKoo was a Korean product, every legacy `moment().format()` sample in the codebase shows `+09:00`, and
`Asia/Seoul` has had no DST since 1988 — so `dayKey` derived from a `+09:00` instant is exactly the day the
original writer saw. Any item whose parsed offset is **not** `+09:00` is still bucketed in `Asia/Seoul`
(the rule) but is flagged `migrationAnomalies.kind = 'NON_KST_OFFSET'` with the original offset, so a
support query can find the handful of travellers and offer them a per-ledger tz correction.

`occurredAt` resolution order for migration is `14` §4.3's `resolveOccurredAt` verbatim:
`selectedDate` (string, ISO) → `created` → `updated` → push-id timestamp. A `selectedDate` that is not a
string (the `Date`-object serialization bug, `02` §8) is preserved verbatim in `legacyRaw` and flagged
`migrationAnomalies.kind = 'SELECTED_DATE_LOST'`. A resolved `occurredAt` of `0` fails the run.

**Every migrated row also carries `legacyCreatedAt: v.number()`** (epoch ms). No index anywhere sorts on
`_creationTime`; where a table needs creation ordering it carries an explicit `createdAt: v.number()`
(`itemComments`, `itemPhotos`, `notifications`, `feedback`, …). This is not optional — the batch-mutation
import path *cannot* set `_creationTime`, so a comment thread imported today would otherwise sort by import
order instead of by when it was written.

### 0.3 Soft delete

`deletedAt: v.optional(v.number())`. Absent = live.

- **`deletedAt` is baked into the index tuple of every list index**, immediately after the scoping key and
  before the sort key: `["ledgerId", "deletedAt", "dayKey", "occurredAt"]`. Queries do
  `q.eq("ledgerId", id).eq("deletedAt", undefined).gte("dayKey", …)`. This is `09` §3.1 rule (1) — pages are
  never short, the client never has to over-page, and the read set never includes deleted rows.
- **Hard delete is reserved for exactly three things:** (a) join-table rows that carry no history
  (`ledgerJoinRequests` after a cancel — no, even those are soft; see below), (b) orphan `_storage` blobs
  and their `uploads` rows, (c) `authVerificationCodes` / `authVerifiers`, which Convex Auth manages.
  In practice: **nothing in the BooKoo domain is ever hard-deleted.** A shared money log where a co-member
  can silently erase a row is a trust failure; `deletedAt` + `deletedByUserId` + a `ledgerAuditLog` entry is
  the product behaviour, and it is also what makes rollup repair auditable.
- **Deleting a ledger** sets `ledgers.deletedAt` and schedules a batched cascade that sets `deletedAt` on
  `ledgerMembers` / `ledgerItems` / `itemPhotos` / `itemComments` and zeroes the rollups. It does **not**
  delete rows. This directly fixes the legacy dangling-pointer bug (`02` §9: `deleteLedger` left every other
  member's `users/{uid}/ledgers/{k}` pointing at a dead node, and `getMyLedger` then threw and wiped the
  whole drawer).
- Convex has no cascade. Every cascade is an explicit, cursor-batched `internalMutation` scheduled from the
  parent mutation, keyed so a double run is a no-op.

### 0.4 Legacy identity — the trailer that every migrated table carries

```ts
// convex/schema/legacy.ts — imported and spread into every migrated table
export const legacyTrailer = {
  /** Globally unique legacy path. Migration idempotency key. See the per-table format table in Part 4. */
  legacyKey: v.optional(v.string()),
  /** epoch ms. Firebase Auth createdAt, item.created, review.date, or the push-id timestamp. */
  legacyCreatedAt: v.optional(v.number()),
  /** JSON string of every source field this schema does not model. Never parsed by app code. */
  legacyRaw: v.optional(v.string()),
} as const;
```

- `legacyUid` (Firebase Auth `localId`) lives on `userProfiles`, `legacyUsers`, `ledgerMembers`
  (`legacyUid` of the member), and as `legacy*Uid` on any row that referenced a uid
  (`ledgers.legacyOwnerUid`, `ledgerItems.legacyWriterUid`, `itemComments.legacyWriterUid`).
- `legacyKey` (RTDB push id, or a `/`-joined path when the push id alone is not globally unique) lives on
  `ledgers`, `ledgerItems`, `itemComments`, `itemPhotos`, `ledgerMembers`, `ledgerInvites`,
  `ledgerJoinRequests`, `feedback`, `categories`.
- **Every table with `legacyKey` has a `by_legacyKey` index.** That index is what makes the batch import
  idempotent (`14` §4.5: one point-read per row, retry-safe) and what makes verification a join instead of
  a scan.
- `legacyRaw` is a **string**, not `v.any()`. Convex `v.any()` defeats validation and hides schema drift
  (`06` §2.3 flags Martie's single `v.any()` as a smell). A JSON string is opaque on purpose.

**These fields are declared on day one, before any production data exists.** `DECISIONS.md` §4 is explicit
that bolting them on later hurts; more concretely, adding `legacyKey` after the fact means adding an index
to an already-large table, which needs the `staged: true` dance (`13` §1.1 rule 6).

### 0.5 Naming and style rules (adopted wholesale from FightingHows, `09` §1–§3)

- One table per file under `convex/schema/`, except where two tables are a single unit
  (`schema/rollups.ts` exports three; `schema/notifications.ts` exports two; `schema/migration.ts` exports
  three).
- Every enum is `v.union(v.literal(...))` **exported from the schema file** and reused in function `args`.
  No bare `v.string()` enums (Martie's `leagues.tier` mistake).
- Index grammar `by_<a>_and_<b>_and_<c>`, fields in tuple order.
- Optional means *genuinely absent*. Behaviour flags and counters are **required with a default written at
  insert**, so no read path needs `?? 0`.
- `convex/AGENTS.md` is copied from FightingHows (`09` §1) with the pagination and soft-delete rules
  restated in Korean and English.

---

## Part 1 — The schema

### 1.0 `convex/schema.ts` (assembly)

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

// identity
import {userProfilesTable} from './schema/userProfiles';
import {userHandlesTable} from './schema/userHandles';

// ledger domain
import {ledgersTable} from './schema/ledgers';
import {ledgerMembersTable} from './schema/ledgerMembers';
import {ledgerInvitesTable} from './schema/ledgerInvites';
import {ledgerJoinRequestsTable} from './schema/ledgerJoinRequests';
import {ledgerAuditLogTable} from './schema/ledgerAuditLog';

// entries
import {categoriesTable} from './schema/categories';
import {ledgerItemsTable} from './schema/ledgerItems';
import {itemPhotosTable} from './schema/itemPhotos';
import {itemCommentsTable} from './schema/itemComments';

// derived data
import {
  ledgerDailyRollupsTable,
  ledgerMonthlyRollupsTable,
  ledgerCategoryRollupsTable,
  ledgerStatsTable,
} from './schema/rollups';

// platform
import {notificationsTable, pushTokensTable} from './schema/notifications';
import {uploadsTable} from './schema/uploads';
import {feedbackTable} from './schema/feedback';
import {announcementsTable} from './schema/announcements';
import {appVersionsTable, appConfigTable} from './schema/appConfig';

// migration
import {
  legacyUsersTable,
  legacyInvitesTable,
  migrationRunsTable,
  migrationAnomaliesTable,
} from './schema/migration';

export default defineSchema({
  ...authTables,

  userProfiles: userProfilesTable,
  userHandles: userHandlesTable,

  ledgers: ledgersTable,
  ledgerMembers: ledgerMembersTable,
  ledgerInvites: ledgerInvitesTable,
  ledgerJoinRequests: ledgerJoinRequestsTable,
  ledgerAuditLog: ledgerAuditLogTable,

  categories: categoriesTable,
  ledgerItems: ledgerItemsTable,
  itemPhotos: itemPhotosTable,
  itemComments: itemCommentsTable,

  ledgerDailyRollups: ledgerDailyRollupsTable,
  ledgerMonthlyRollups: ledgerMonthlyRollupsTable,
  ledgerCategoryRollups: ledgerCategoryRollupsTable,
  ledgerStats: ledgerStatsTable,

  pushTokens: pushTokensTable,
  notifications: notificationsTable,
  uploads: uploadsTable,
  feedback: feedbackTable,
  announcements: announcementsTable,
  appVersions: appVersionsTable,
  appConfig: appConfigTable,

  legacyUsers: legacyUsersTable,
  legacyInvites: legacyInvitesTable,
  migrationRuns: migrationRunsTable,
  migrationAnomalies: migrationAnomaliesTable,
});
```

25 own tables + the 7 from `authTables`.

---

### 1.1 `convex/schema/userProfiles.ts`

```ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';
import {legacyTrailer} from './legacy';

/** Legacy shipped en/ko/id strings and ko/ja/zh-cn/id moment locales (04 §4). We ship all five. */
export const userLocaleValidator = v.union(
  v.literal('en'), v.literal('ko'), v.literal('ja'), v.literal('zh'), v.literal('id'),
);

export const themePreferenceValidator = v.union(
  v.literal('SYSTEM'), v.literal('LIGHT'), v.literal('DARK'),
);

/**
 * The app-owned side of a user. `users` (authTables) stays untouched so a
 * @convex-dev/auth upgrade cannot collide with our columns.
 *
 * A PLACEHOLDER profile (isPlaceholder = true) is created by the migration for
 * every legacy uid so that membership rosters, "written by" labels and avatars
 * render correctly from day one. Its `users` row deliberately has NO
 * `authAccounts` row, so it can never be signed into. `migrate.claim` re-parents
 * everything onto the real row at first sign-in and tombstones the placeholder.
 */
export const userProfilesTable = defineTable({
  userId: v.id('users'),

  /** lowercase(trim(email)). Absent for FB-no-email legacy orphans and for Kakao/Apple-relay accounts. */
  emailNormalized: v.optional(v.string()),

  // ---- Instagram-style handle (09 §12). `userHandles` is the authority; these are the fast-read copies.
  /** As typed, for display: "HyoChan". Absent between account creation and onboarding. */
  handle: v.optional(v.string()),
  /** normalizeHandle(handle). This — not `handle` — is what by_handleKey indexes. */
  handleKey: v.optional(v.string()),
  handleUpdatedAt: v.optional(v.number()),

  // ---- legacy users/{uid}/info, 1:1
  displayName: v.string(),                    // info.displayName ('' allowed, as in legacy)
  statusMessage: v.string(),                  // info.statusMsg
  phone: v.string(),                          // info.tel — free text, legacy stored "010-1234-5678"
  avatarStorageId: v.optional(v.id('_storage')),
  /** info.photoURL, kept until the blob-copy worker fills avatarStorageId. Client renders storageId ?? this. */
  avatarLegacyUrl: v.optional(v.string()),

  // ---- preferences (legacy: device-local AsyncStorage LOCALE / switch_new / switch_update)
  locale: userLocaleValidator,
  themePreference: themePreferenceValidator,
  /** ISO-4217. Seeds the currency of ledgers this user creates; NOT authoritative for any item. */
  preferredCurrency: v.string(),
  /** 0 = Sunday .. 6 = Saturday. Legacy Calendar hardcoded weekStart={0} (03). */
  weekStartsOn: v.number(),
  pushEnabled: v.boolean(),
  pushOnItemCreated: v.boolean(),
  pushOnItemUpdated: v.boolean(),
  pushOnComment: v.boolean(),
  pushOnInvite: v.boolean(),

  /** True while this row stands in for an unclaimed legacy identity. */
  isPlaceholder: v.boolean(),
  lastSeenAt: v.optional(v.number()),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),

  legacyUid: v.optional(v.string()),          // Firebase Auth localId
  ...legacyTrailer,
})
  // Every authed request starts here. One point-read, no scan.
  .index('by_user', ['userId'])
  // /@handle deep links and mention resolution, in one indexed read with no join.
  .index('by_handleKey', ['handleKey'])
  // Invite-by-email resolution (replaces inviteUsers' full-table scan, 02 §S7) and legacy claim.
  .index('by_email', ['emailNormalized'])
  // Two-pass import: resolve legacy uid -> Id<'users'> without a scan.
  .index('by_legacyUid', ['legacyUid'])
  // Ops: "how many placeholders are still unclaimed?" Never used on a user read path.
  .index('by_placeholder_and_deleted', ['isPlaceholder', 'deletedAt'])
  // Member picker / "invite someone you know" typeahead. Relevance-ordered, ≤1024 scanned.
  .searchIndex('search_handle', {
    searchField: 'handle',
    filterFields: ['isPlaceholder', 'deletedAt'],
  });
```

**Index → query map**

| index | exact query | screen |
|---|---|---|
| `by_user` | `q.eq('userId', authUserId)` | `requireProfile()` — first line of *every* handler |
| `by_handleKey` | `q.eq('handleKey', key)` | `/@handle` deep link; handle-availability *display* check |
| `by_email` | `q.eq('emailNormalized', email)` | Invite by email (Members screen); legacy claim |
| `by_legacyUid` | `q.eq('legacyUid', uid)` | Import pass 2 only |
| `by_placeholder_and_deleted` | `q.eq('isPlaceholder', true).eq('deletedAt', undefined)` | migration ops dashboard |
| `search_handle` | `q.search('handle', term).eq('isPlaceholder', false).eq('deletedAt', undefined)` | Add-member typeahead |

**Legacy `users/{uid}/info` disposition:** `displayName` → `displayName`; `email` → `emailNormalized`
(+ raw preserved on `legacyUsers.emailRaw`); `photoURL` → `avatarLegacyUrl` then `avatarStorageId`;
`statusMsg` → `statusMessage`; `tel` → `phone`. **All five migrate. Nothing dropped.**

---

### 1.2 `convex/schema/userHandles.ts`

Adopted verbatim from `09` §12.4 — it is already the researched answer, and it is the only structure that
makes uniqueness race-safe *and* keeps a released handle out of an impersonator's hands.

```ts
export const userHandlesTable = defineTable({
  /** NFKC-folded, lowercased, ASCII-only. The uniqueness key. */
  handleKey: v.string(),
  /** Exactly what the member typed. */
  handle: v.string(),
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away. undefined == currently held. Row is NEVER deleted. */
  releasedAt: v.optional(v.number()),
})
  .index('by_handleKey', ['handleKey'])
  .index('by_user', ['userId'])
  .index('by_user_and_released', ['userId', 'releasedAt']);
```

| index | exact query | screen |
|---|---|---|
| `by_handleKey` | `.eq('handleKey', key).unique()` **inside the claim mutation** | Onboarding "choose your @handle"; Settings → rename. This is the OCC uniqueness gate (`09` §12.2) |
| `by_user` | `.eq('userId', me)` | Settings → "handle history" / rename cooldown |
| `by_user_and_released` | `.eq('userId', me).eq('releasedAt', undefined)` | "what is my live handle" without walking history |

**Migration note:** legacy had no usernames. Migrated users have `handle === undefined` and are routed to
`/onboarding/handle` on first sign-in — *after* the legacy claim has run, so the onboarding screen can
pre-fill a suggestion derived from their legacy `displayName`.

---

### 1.3 `convex/schema/ledgers.ts`

```ts
/**
 * Legacy `info.color` was an int 0..5 indexing a hardcoded RGB list (02 §2.2, 04 §6).
 * A named token survives a palette change and lets dark mode map the same identity to a
 * different hex. `legacyColorIndex` keeps the original int so the mapping is auditable.
 */
export const ledgerColorValidator = v.union(
  v.literal('red'),    // legacy 0 — rgb(255,114,141)
  v.literal('orange'), // legacy 1 — rgb(246,166,35)
  v.literal('yellow'), // legacy 2 — rgb(238,209,0)
  v.literal('green'),  // legacy 3 — rgb(29,211,168)
  v.literal('blue'),   // legacy 4 — rgb(103,158,255)  (legacy default)
  v.literal('purple'), // legacy 5 — rgb(182,105,249)
);

export const rebucketStateValidator = v.union(
  v.literal('IDLE'), v.literal('RUNNING'), v.literal('FAILED'),
);

export const ledgersTable = defineTable({
  // ---- legacy ledgers/{k}/info, 1:1 (minus `people`)
  title: v.string(),
  /** normalizeTitle(title) = NFKC + trim + lowercase + collapse whitespace. Exact-title lookup parity
   *  with legacy `orderByChild('info/title').equalTo(txt)`, without its case sensitivity. */
  titleKey: v.string(),
  description: v.string(),
  color: ledgerColorValidator,

  // ---- legacy ledgers/{k}/owner
  ownerUserId: v.id('users'),

  // ---- genuinely new: money + calendar authority
  /** ISO-4217. THE base currency of this ledger; all rollups are in it. */
  currency: v.string(),
  /** true while the value is the migration's KRW guess. Drives the one-time confirm prompt. */
  currencyIsAssumed: v.boolean(),
  /** IANA zone id. THE authority for dayKey/monthKey for every member. See §0.2. */
  timeZone: v.string(),
  timeZoneIsAssumed: v.boolean(),
  timeZoneRebucketState: rebucketStateValidator,

  /** Maintained in the join/leave/remove mutations only (a few writes per ledger per year). */
  memberCount: v.number(),
  /** Legacy: EVERY ledger was findable by exact title by any signed-in user. Default true for
   *  migrated ledgers to preserve behaviour; new ledgers default false (privacy-forward). */
  discoverable: v.boolean(),

  /** Owner archived it (hidden from the drawer, data intact). Replaces the never-used legacy `visible`. */
  archivedAt: v.optional(v.number()),
  /** Set by the migration when the sole member is an unrecoverable FB-no-email orphan (14 §3.5). */
  orphanedAt: v.optional(v.number()),
  /** Set by the ownership-rescue pass; audit breadcrumb for a transfer the human did not request. */
  ownershipTransferredFromLegacyUid: v.optional(v.string()),

  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),

  legacyOwnerUid: v.optional(v.string()),
  legacyColorIndex: v.optional(v.number()),
  ...legacyTrailer,   // legacyKey = the RTDB push id, e.g. "-L9xQ2fT3kZ8aB1cDe"
})
  .index('by_owner_and_deleted', ['ownerUserId', 'deletedAt'])
  .index('by_legacyKey', ['legacyKey'])
  .index('by_discoverable_and_titleKey', ['discoverable', 'titleKey'])
  .searchIndex('search_title', {
    searchField: 'title',
    filterFields: ['discoverable', 'deletedAt'],
  });
```

| index | exact query | screen |
|---|---|---|
| `by_owner_and_deleted` | `.eq('ownerUserId', me).eq('deletedAt', undefined)` | Settings → "ledgers I own" (delete-account guard: you cannot delete an account that still owns a multi-member ledger) |
| `by_legacyKey` | `.eq('legacyKey', k).unique()` | Import idempotency + pass-2 resolution |
| `by_discoverable_and_titleKey` | `.eq('discoverable', true).eq('titleKey', normalizeTitle(input))` | Ledger discovery — **exact-title parity with legacy `searchLedgers`**, so a legacy user's muscle memory still works |
| `search_title` | `q.search('title', term).eq('discoverable', true).eq('deletedAt', undefined)` | Ledger discovery — the *new* prefix/fuzzy search that legacy could not do (`02` §S11) |

**`visible` disposition.** `02` §2.1: written `true` by `addLedger`, never written `false` anywhere in the
app. The security rules treated it as a soft-delete flag the app never used. **Decision: do not model it as a
field.** But be strictly lossless: the import maps `visible === false` (if any such row exists in the export —
the wide-open rules made it *writable* by any client) to `archivedAt = legacyCreatedAt` and records
`migrationAnomalies.kind = 'LEDGER_NOT_VISIBLE'`. `visible === true` maps to nothing. The raw value is in
`legacyRaw` either way.

**`info.people` disposition. DROP.** `02` §2.2 is unambiguous: `addLedger` writes `1`, `LedgerUpdate` rewrites
the hardcoded `1`, and **nothing ever reads it**; the real count was computed client-side as
`snapshot.child('members').numChildren()`. It carries zero information. It is still captured in `legacyRaw`
for a byte-faithful audit, but there is no column.

---

### 1.4 `convex/schema/ledgerMembers.ts`

```ts
/**
 * Legacy had exactly two roles: `owner` (one uid) and `member` (present in the members map).
 * There was no admin tier and no read-only tier (02 §9).
 *
 * We add ADMIN and VIEWER because a shared household ledger with a single owner is a single
 * point of failure (the legacy `deleteLedger` + orphaned-owner problems are both symptoms),
 * and because in-laws / accountants want read-only. Migration only ever produces OWNER and
 * MEMBER, so the legacy semantics round-trip exactly.
 */
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'),   // exactly one live row per ledger; == ledgers.ownerUserId
  v.literal('ADMIN'),   // NEW: everything except transfer-ownership and delete-ledger
  v.literal('MEMBER'),  // legacy `member`: read all, write own items, edit/delete own items
  v.literal('VIEWER'),  // NEW: read only
);

export const joinSourceValidator = v.union(
  v.literal('CREATED'),           // legacy addLedger
  v.literal('INVITE_EMAIL'),      // legacy inviteUsers, invitee already registered
  v.literal('INVITE_LINK'),       // NEW (DECISIONS.md §1)
  v.literal('INVITE_DIRECT'),     // NEW: invited an existing user by @handle
  v.literal('REQUEST_APPROVED'),  // legacy acceptOrRejectRequestedUser
  v.literal('LEGACY_IMPORT'),     // provenance unknown — the legacy members map carried no source
);

export const ledgerMembersTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  role: ledgerRoleValidator,
  joinedAt: v.number(),
  joinedVia: joinSourceValidator,
  invitedByUserId: v.optional(v.id('users')),

  /** Per-member read cursor for the "N new entries" badge. Written at most once per session. */
  lastReadAt: v.optional(v.number()),
  /** Per-member mute, independent of the global userProfiles push flags. */
  mutedAt: v.optional(v.number()),

  /** Soft "left". Kept so authored items still resolve an author and the roster shows history. */
  leftAt: v.optional(v.number()),
  removedByUserId: v.optional(v.id('users')),

  legacyUid: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = `${ledgerKey}/${uid}`
})
  // THE most-called index in the app: the O(1) membership + role check on every query and mutation.
  .index('by_ledger_and_user', ['ledgerId', 'userId'])
  // Member roster, live members only, no post-filter.
  .index('by_ledger_and_left', ['ledgerId', 'leftAt', 'joinedAt'])
  // "My ledgers" for the drawer / ledger switcher.
  .index('by_user_and_left', ['userId', 'leftAt', 'joinedAt'])
  // Push fan-out target list and "who can approve this join request".
  .index('by_ledger_and_role_and_left', ['ledgerId', 'role', 'leftAt'])
  // Import idempotency + claim re-parenting sweep.
  .index('by_legacyKey', ['legacyKey'])
  .index('by_legacyUid', ['legacyUid']);
```

| index | exact query | screen / feature |
|---|---|---|
| `by_ledger_and_user` | `.eq('ledgerId', id).eq('userId', me).unique()` | `requireLedgerMember()` — every ledger query and mutation. **1 doc** |
| `by_ledger_and_left` | `.eq('ledgerId', id).eq('leftAt', undefined)` `.take(200)` | Members screen roster; ledger header avatar strip |
| `by_user_and_left` | `.eq('userId', me).eq('leftAt', undefined)` `.take(100)` | Drawer / ledger switcher (replaces `users/{uid}/ledgers` mirror) |
| `by_ledger_and_role_and_left` | `.eq('ledgerId', id).eq('role', 'OWNER').eq('leftAt', undefined)` | Approve/deny join request authorization; push recipient list |
| `by_legacyKey` / `by_legacyUid` | point reads | Import passes 1 & 2; `claimLegacyAccount` re-parenting |

**`users/{uid}/ledgers` mirror disposition. DROP the mirror, keep the information.** The legacy map was a
hand-maintained denormalized index that (a) went stale on `deleteLedger` and (b) was the entry point for the
worst perf bug in the app (`02` §S1–S3: a live `.on('value')` on it, fanning out to a full download of every
ledger's entire item tree). `ledgerMembers.by_user_and_left` is the same index, maintained by the database.

**Reconciliation rule (`02` §16):** `ledgers/{k}/members` is authoritative. `users/{uid}/ledgers` is read only
to *find* keys the members map might have missed; every key present in the mirror but absent from the members
map produces `migrationAnomalies.kind = 'DANGLING_MEMBERSHIP_POINTER'` and **is not** turned into a membership
(it is almost always a ledger that `deleteLedger` removed). Every key present in the members map is imported
unconditionally, whether or not the mirror agrees — that is what guarantees "a legacy user sees ledgers they
were merely a member of".

**Ownership transfer.** `changeOwner` in legacy patched one string and left the old owner as a plain member
(`02` §9). Same semantics, three writes in one mutation: patch `ledgers.ownerUserId`, patch the incoming
member's `role` to `OWNER`, patch the outgoing owner's `role` to `ADMIN` (not `MEMBER` — losing the crown
should not lose the ability to manage members; this is a deliberate, stated improvement), and insert one
`ledgerAuditLog` row. Guarded by `role === 'OWNER'`.

---

### 1.5 `convex/schema/ledgerInvites.ts`

This table absorbs the **entire legacy `bookoo/invites` double index** (`02` §4) *and* implements the deep-link
invite from `DECISIONS.md` §1. One table, three kinds, because all three answer the same question — "who is
allowed to become a member of this ledger, and how do they prove it?"

```ts
export const inviteKindValidator = v.union(
  v.literal('EMAIL'),   // legacy: an email with no account yet. Drained at first sign-in.
  v.literal('DIRECT'),  // NEW: aimed at an existing userId (by @handle). Needs consent — legacy did NOT.
  v.literal('LINK'),    // NEW: a shareable deep link, N uses, expiring.
);

export const inviteStatusValidator = v.union(
  v.literal('PENDING'), v.literal('ACCEPTED'), v.literal('DECLINED'),
  v.literal('REVOKED'), v.literal('EXPIRED'),
);

export const ledgerInvitesTable = defineTable({
  ledgerId: v.id('ledgers'),
  kind: inviteKindValidator,
  status: inviteStatusValidator,
  /** Role the invitee gets on acceptance. Legacy invites always produced MEMBER. */
  role: ledgerRoleValidator,

  /** kind === 'EMAIL' — lowercase(trim(email)). Indexed; this is the first-sign-in drain key. */
  emailNormalized: v.optional(v.string()),
  /** The email exactly as the inviter typed it, for the invitation copy. */
  emailRaw: v.optional(v.string()),

  /** kind === 'DIRECT' */
  targetUserId: v.optional(v.id('users')),

  /** kind === 'LINK' — SHA-256 of the token. The raw token is never stored (it is in the URL). */
  tokenHash: v.optional(v.string()),
  maxUses: v.optional(v.number()),
  useCount: v.number(),

  invitedByUserId: v.optional(v.id('users')),   // undefined for migrated rows (legacy stored no inviter)
  message: v.optional(v.string()),
  createdAt: v.number(),
  expiresAt: v.optional(v.number()),            // undefined = never (legacy invites never expired)
  acceptedByUserId: v.optional(v.id('users')),
  acceptedAt: v.optional(v.number()),
  revokedByUserId: v.optional(v.id('users')),
  revokedAt: v.optional(v.number()),

  /** The RTDB key exactly as it appeared: "hyo%40hyo%2Edev". Kept so index-A/B reconciliation is auditable. */
  legacyEncodedEmail: v.optional(v.string()),
  legacyLedgerKey: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = `${ledgerKey}/${encodedEmail}`
})
  // THE first-sign-in drain: "which ledgers were waiting for this email?"
  .index('by_email_and_status', ['emailNormalized', 'status', 'createdAt'])
  // Members screen: the "INVITING" pseudo-member rows (legacy getMembersInfo, index A).
  .index('by_ledger_and_status', ['ledgerId', 'status', 'createdAt'])
  // Deep-link redemption: one point-read on the hash.
  .index('by_tokenHash', ['tokenHash'])
  // "You have an invitation" badge for an already-registered target.
  .index('by_target_and_status', ['targetUserId', 'status'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | screen / feature |
|---|---|---|
| `by_email_and_status` | `.eq('emailNormalized', email).eq('status', 'PENDING')` `.take(50)` | **First sign-in** — replaces `authApi.addInvitedLedgers`'s walk of `invites/{encodedEmail}` |
| `by_ledger_and_status` | `.eq('ledgerId', id).eq('status', 'PENDING')` `.take(100)` | Members screen "INVITING" rows — replaces legacy index A |
| `by_tokenHash` | `.eq('tokenHash', sha256(token)).unique()` | Deep-link invite redemption |
| `by_target_and_status` | `.eq('targetUserId', me).eq('status', 'PENDING')` | Notification badge / "Invitations" inbox |
| `by_legacyKey` | point read | Import idempotency |

**The bidirectional index disposition — the single most important collapse in this proposal.**

Legacy wrote *two* mirrored maps under one namespace (`02` §4):
`invites/{ledgerKey}/{encEmail} = encEmail` (index A) and `invites/{encEmail}/{ledgerKey} = ledgerKey`
(index B), distinguished only by whether the first path segment *looks like* a push id. Both directions
become **one row** here, queried in both directions by two Convex indexes — which is precisely what an index
is for. Concretely: A-direction reads become `by_ledger_and_status`, B-direction reads become
`by_email_and_status`.

**Import algorithm for `bookoo/invites` (fully specified — this is the fiddliest part of the whole migration):**

```
for each child C of bookoo/invites:
    if key(C) matches /^-[A-Za-z0-9_-]{19}$/     -> classify as INDEX_A, ledgerKey = key(C)
    else if key(C) contains '%40'                -> classify as INDEX_B, email = decodeURIComponent(key(C))
    else                                          -> migrationAnomalies 'INVITE_UNCLASSIFIABLE'; archive only

build the set  P = { (ledgerKey, emailNormalized) }  as the UNION of index A and index B
   (union, not intersection: the Promise.all bugs in addInvitedLedgers and deleteInvites — 02 §4 —
    mean either direction may be missing its mirror)

for each (ledgerKey, email) in P:
    resolve ledger by legacyKey
      -> missing   : legacyInvites row with reconciledAs='LEDGER_MISSING'; no ledgerInvites row
    resolve a legacyUser by emailNormalized
      -> found AND already in ledgers/{ledgerKey}/members
                   : legacyInvites row with reconciledAs='ALREADY_MEMBER'; no ledgerInvites row
                     (this is the documented orphan class from the addInvitedLedgers bug)
      -> otherwise : insert ledgerInvites { kind:'EMAIL', status:'PENDING', role:'MEMBER',
                                            emailNormalized, legacyEncodedEmail, legacyLedgerKey,
                                            legacyKey: `${ledgerKey}/${encodedEmail}`,
                                            createdAt: legacyCreatedAt(ledger), expiresAt: undefined }
                     and reconciledAs='CONVERTED'

ALWAYS insert a legacyInvites archive row, for every child of bookoo/invites, regardless of outcome.
```

`decodeURIComponent(key)` alone is the correct decode — the legacy decoder's trailing
`.replace('%2E', /\./g)` is a documented no-op (`02` §5).

**Pending invites never expire on import** (`expiresAt: undefined`). A legacy user who was invited in 2019 and
signs in tomorrow still lands in that ledger. That is the "all their history intact" requirement, and it is
worth more than invite hygiene. New invites get a 30-day `expiresAt`.

**Behaviour change, stated loudly:** legacy `inviteUsers` made an *already-registered* invitee a member
**instantly, without consent** (`02` §9 path A). We do not reproduce that. A registered invitee gets a
`DIRECT` invite they must accept. An *unregistered* invitee still auto-joins on first sign-in (that is the
`EMAIL` kind), because there the act of signing in with that address *is* the consent. Migrated `EMAIL`
invites keep the legacy auto-join behaviour exactly.

---

### 1.6 `convex/schema/ledgerJoinRequests.ts`

The other half of the legacy membership state machine: `ledgers/{k}/requests/{uid}` (`02` §9 path B).

```ts
export const joinRequestStatusValidator = v.union(
  v.literal('PENDING'), v.literal('APPROVED'), v.literal('REJECTED'), v.literal('CANCELLED'),
);

export const ledgerJoinRequestsTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  status: joinRequestStatusValidator,
  message: v.optional(v.string()),          // NEW: "hi, I'm Hyo's partner"
  createdAt: v.number(),
  decidedByUserId: v.optional(v.id('users')),
  decidedAt: v.optional(v.number()),
  legacyUid: v.optional(v.string()),
  ...legacyTrailer,                          // legacyKey = `${ledgerKey}/${uid}`
})
  .index('by_ledger_and_status', ['ledgerId', 'status', 'createdAt'])
  .index('by_user_and_status', ['userId', 'status', 'createdAt'])
  .index('by_ledger_and_user', ['ledgerId', 'userId'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | screen |
|---|---|---|
| `by_ledger_and_status` | `.eq('ledgerId', id).eq('status', 'PENDING')` `.take(100)` | Members screen `WAITING_LIST` block; **and** the drawer's "pending request" dot on an owned ledger — which in legacy cost one sequential round-trip *per ledger, per refresh* (`02` §S4) |
| `by_user_and_status` | `.eq('userId', me).eq('status', 'PENDING')` | Ledger discovery — renders the `REQUESTED` button state without re-reading every ledger |
| `by_ledger_and_user` | `.eq('ledgerId', id).eq('userId', me).unique()` | The request **toggle** (legacy `requestLedger` was a toggle; preserved) |
| `by_legacyKey` | point read | Import idempotency |

**Why a separate table and not a `direction` column on `ledgerInvites`:** the two flows are inverses. An
invite is *the ledger granting permission* and is keyed by an email that may not correspond to an account; a
request is *a person asking for permission* and always has a `userId`. Fusing them would force
`emailNormalized`, `tokenHash`, `targetUserId` and `userId` all optional on one table and make every read
path check `direction` before trusting a field. Two boring tables, four indexes total, zero ambiguity.

**Reject keeps a row** (`status: 'REJECTED'`), unlike legacy which just dropped the node. That is what stops
a rejected requester from re-spamming the owner, and it is one line of extra state.

---

### 1.7 `convex/schema/categories.ts`

**This is the biggest structural fix in the rewrite.** Legacy categories lived in a **device-local SQLite
table** seeded once at install from `INITIAL_CATEGORIES` with the *already-translated* label frozen in
(`02` §7.1, `04` §3.3). Consequences: changing the app language never re-translated anything; two members of
the same ledger saw different names for the same icon; a user's custom categories were invisible to
co-members and were lost on reinstall; and the only surviving record of a custom category is the
denormalized `{iconId, txt}` snapshot on each item.

```ts
export const categoryScopeValidator = v.union(
  v.literal('GLOBAL'),  // one of the 34 seeded presets (04 §3.2). ledgerId is undefined.
  v.literal('LEDGER'),  // custom, owned by one ledger, visible to every member of it.
);

export const itemKindValidator = v.union(v.literal('EXPENSE'), v.literal('INCOME'));

export const categoriesTable = defineTable({
  scope: categoryScopeValidator,
  /** Required iff scope === 'LEDGER'. */
  ledgerId: v.optional(v.id('ledgers')),

  /** Stable slug. GLOBAL: 'cafe','salary',… (04 §3.2). LEDGER: slugified custom label + disambiguator. */
  key: v.string(),
  kind: itemKindValidator,
  /** One of the 34 icon slugs. DELIBERATELY decoupled from `key` so a custom category can be re-iconed. */
  iconKey: v.string(),

  /** GLOBAL only: i18n key, rendered as t(`category.${key}`) at display time — never frozen into the DB. */
  labelI18nKey: v.optional(v.string()),
  /** LEDGER only: the user's literal label, in whatever language they typed it. */
  customLabel: v.optional(v.string()),

  order: v.number(),
  createdByUserId: v.optional(v.id('users')),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** Hidden from the picker but still resolvable by existing items. */
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),

  /** 0..33. Set on all 34 GLOBAL rows and on any LEDGER row recovered from a legacy item snapshot. */
  legacyIconId: v.optional(v.number()),
  /** The exact `category.txt` the legacy item carried, for LEDGER rows recovered from items. */
  legacyLabel: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey for a recovered custom: `${ledgerKey}/cat/${legacyIconId}/${sha1(txt)}`
})
  .index('by_scope_and_kind_and_order', ['scope', 'kind', 'order'])
  .index('by_ledger_and_deleted_and_order', ['ledgerId', 'deletedAt', 'order'])
  .index('by_ledger_and_key', ['ledgerId', 'key'])
  .index('by_scope_and_legacyIconId', ['scope', 'legacyIconId'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | screen |
|---|---|---|
| `by_scope_and_kind_and_order` | `.eq('scope','GLOBAL').eq('kind','EXPENSE')` `.take(64)` | Entry form category sheet, expense tab — **27 docs** |
| `by_ledger_and_deleted_and_order` | `.eq('ledgerId', id).eq('deletedAt', undefined)` `.take(200)` | Same sheet, custom section; also the per-ledger label map the timeline joins against |
| `by_ledger_and_key` | `.eq('ledgerId', id).eq('key', slug).unique()` | Create-custom-category uniqueness gate; **import dedupe** |
| `by_scope_and_legacyIconId` | `.eq('scope','GLOBAL').eq('legacyIconId', n).unique()` | Import: map a legacy `category.iconId` to a preset |
| `by_legacyKey` | point read | Import idempotency for recovered customs |

**Category recovery algorithm (pass 1.5, runs between ledgers and items):**

```
1. Seed the 34 GLOBAL rows from DEFAULT_CATEGORIES (04 §3.2). legacyIconId = 0..33, kind from the seed.
2. Scan every legacy item. For each distinct (ledgerKey, category.iconId, normalize(category.txt)):
     iconId in 0..33 AND normalize(txt) equals the seed label in ANY of en/ko/ja/zh/id
        -> it is the stock category. Map to the GLOBAL row. No new row.
     otherwise
        -> it is a user-created category that only ever existed on one device.
           Insert a LEDGER category: kind = kind(item), iconKey = iconSlug(iconId) or 'stuffs' when
           iconId is out of range, customLabel = txt, legacyIconId, legacyLabel = txt.
3. Every legacy item then resolves to exactly one categoryId.
```

This is the **only** way a custom category survives at all, and it upgrades it from "device-local, invisible
to co-members" to "a real per-ledger category everyone can see and re-use". `iconId` values outside 0..33 —
which crashed the legacy list (`Tab1.tsx:224` had no bounds check, `02` §7.1) — are clamped to the `stuffs`
icon and flagged `migrationAnomalies.kind = 'CATEGORY_ICON_OUT_OF_RANGE'`.

**`category.showDelBtn` disposition. DROP.** It is a UI flag that leaked into the persisted model
(`02` §7.1), always `false` at save time. Captured in `legacyRaw`, no column.
**`category.img` / `category.key` disposition. DROP.** Deleted before every write by the legacy client
(`02` §3); if any leaked to production they are garbage.
**`LedgerItem.categories` disposition. DROP.** Declared in the model, never written, never read (`02` §3).

---

### 1.8 `convex/schema/ledgerItems.ts` — the transactions table

```ts
import {itemKindValidator} from './categories';

/**
 * Legacy `item.location` was `expo-location`'s reverseGeocodeAsync()[0] with `latitude`/`longitude`
 * injected — an unstructured Expo SDK-36 blob whose keys vary by platform and locale, of which the app
 * only ever read `.street` (02 §7.2). We model the four fields we can rely on and archive the rest.
 */
export const itemLocationValidator = v.object({
  lat: v.number(),
  lng: v.number(),
  /** legacy `street`, or the localized UNKNOWN string the legacy app substituted. Never empty. */
  label: v.string(),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  country: v.optional(v.string()),
  isoCountryCode: v.optional(v.string()),
  postalCode: v.optional(v.string()),
});

export const fxRateSourceValidator = v.union(
  v.literal('SAME_CURRENCY'),   // fxRate === 1 because currency === ledger.currency
  v.literal('ASSUMED_ONE'),     // migrated: we assumed the item is in the ledger's assumed currency
  v.literal('MANUAL'),          // the member typed the rate
);

export const ledgerItemsTable = defineTable({
  ledgerId: v.id('ledgers'),
  /** Original author. Legacy `writer` was set only when falsy, i.e. it survived edits by other members
   *  (02 §3) — we preserve that: authorUserId is never rewritten by an edit. */
  authorUserId: v.optional(v.id('users')),

  // ---- money (§0.1)
  kind: itemKindValidator,
  amountMinor: v.number(),            // NON-NEGATIVE magnitude, integer minor units
  currency: v.string(),               // ISO-4217, as entered
  currencyIsAssumed: v.boolean(),
  baseAmountMinor: v.number(),        // in ledgers.currency — the only thing rollups sum
  fxRate: v.number(),                 // baseAmountMinor = round(amountMinor * fxRate) modulo exponents
  fxRateSource: fxRateSourceValidator,

  // ---- content
  memo: v.string(),                   // legacy `memo`, '' allowed
  /** `${memo} ${categoryLabelSnapshot}` maintained on every write. Feeds search_text. */
  searchText: v.string(),

  // ---- category: an id for correctness, a snapshot for a zero-join list row
  categoryId: v.optional(v.id('categories')),
  categoryKey: v.string(),            // 'cafe' | 'my-coffee-fund'
  categoryIconKey: v.string(),        // 'cafe' — the icon slug, resolvable without a join
  /** Label frozen at write time. Used only when categoryId no longer resolves (deleted custom, or a
   *  migrated row we could not map). GLOBAL rows render t(`category.${categoryKey}`) instead. */
  categoryLabelSnapshot: v.string(),

  // ---- time (§0.2)
  occurredAt: v.number(),
  occurredOffsetMinutes: v.number(),
  dayKey: v.number(),                 // YYYYMMDD int, ledger tz
  monthKey: v.number(),               // YYYYMM int, ledger tz

  // ---- attachments, denormalized so a list row needs no join
  location: v.optional(itemLocationValidator),
  photoCount: v.number(),
  commentCount: v.number(),

  createdByUserId: v.optional(v.id('users')),
  createdAt: v.number(),
  updatedByUserId: v.optional(v.id('users')),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),

  // ---- legacy trailer (extended)
  legacyWriterUid: v.optional(v.string()),
  legacyRealAmount: v.optional(v.number()),     // the signed number, verbatim
  legacyAmountString: v.optional(v.string()),   // "-₩12,000" — stored, NEVER parsed
  legacyCategoryIconId: v.optional(v.number()),
  legacyCategoryTxt: v.optional(v.string()),
  legacyCategoryKind: v.optional(v.number()),   // category.category, 0|1, may be absent on old rows
  legacySelectedDate: v.optional(v.string()),   // the raw ISO string, or absent when it was lost
  legacyUpdatedAt: v.optional(v.number()),
  /** sha256 of the canonicalized source node. Verification joins on this (14 §4.5). */
  legacyChecksum: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = `${ledgerKey}/${itemKey}`
})
  // (1) THE workhorse. Serves the whole timeline, any month range, and any single day —
  //     because dayKey is a monotone function of occurredAt for a fixed ledger timezone.
  .index('by_ledger_and_deleted_and_dayKey_and_occurredAt',
         ['ledgerId', 'deletedAt', 'dayKey', 'occurredAt'])
  // (2) Category filter within a ledger, still time-ordered. Also the 12-month trend drill-down.
  .index('by_ledger_and_category_and_deleted_and_dayKey',
         ['ledgerId', 'categoryId', 'deletedAt', 'dayKey'])
  // (3) Expense-only / income-only lists (the stats screen's segmented control).
  .index('by_ledger_and_kind_and_deleted_and_dayKey',
         ['ledgerId', 'kind', 'deletedAt', 'dayKey'])
  // (4) Rollup repair + tz rebucket. INCLUDES deleted rows on purpose — repair must see everything.
  .index('by_ledger_and_monthKey', ['ledgerId', 'monthKey'])
  // (5) "Entries I wrote" and the claimLegacyAccount re-parenting sweep.
  .index('by_author_and_deleted_and_occurredAt', ['authorUserId', 'deletedAt', 'occurredAt'])
  // (6)(7) Migration.
  .index('by_legacyKey', ['legacyKey'])
  .index('by_legacyWriterUid', ['legacyWriterUid'])
  // Memo + category search, scoped to one ledger. Replaces the legacy in-memory filter on every keystroke.
  .searchIndex('search_text', {
    searchField: 'searchText',
    filterFields: ['ledgerId', 'deletedAt', 'kind', 'categoryId', 'amountMinor'],
  });
```

7 indexes + 1 search index = **8 of the 32-per-table budget**, leaving ample room.

| index | exact query | screen | docs @100k items |
|---|---|---|---|
| (1) | `.eq('ledgerId',L).eq('deletedAt',undefined).gte('dayKey',20260801).lte('dayKey',20260831)` `.order('desc').paginate({numItems:30})` | Month list (Tab2), infinite scroll | **30** |
| (1) | same with `.eq('dayKey', 20260824)` | Calendar selected-day list (Tab1) | ~3–10 |
| (1) | same with no dayKey bound, `.order('desc')` | Whole-ledger newest-first timeline | **30** |
| (2) | `.eq('ledgerId',L).eq('categoryId',C).eq('deletedAt',undefined).gte('dayKey',20260101).lte('dayKey',20261231)` | Category trend drill-down list | 30/page |
| (3) | `.eq('ledgerId',L).eq('kind','EXPENSE').eq('deletedAt',undefined).gte('dayKey',…)` | Stats screen → "expenses this month" list | 30/page |
| (4) | `.eq('ledgerId',L).eq('monthKey',202608)` `.paginate({numItems:200})` | **cron only**: nightly rollup repair, one ledger-month per batch | ≤200/batch |
| (5) | `.eq('authorUserId',U).eq('deletedAt',undefined)` `.order('desc')` | Profile → "my entries"; claim re-parenting (batched) | 30/page |
| `search_text` | `q.search('searchText',term).eq('ledgerId',L).eq('deletedAt',undefined)` `.take(50)` | Tab2 search box | ≤1024 scanned, 50 returned |

**Indexes deliberately NOT created**

- `by_ledger_and_occurredAt`. Redundant with (1): `dayKey` is monotone in `occurredAt` within a fixed
  timezone, so ordering by `(dayKey, occurredAt)` **is** ordering by `occurredAt`. `13` §1.1 rule 5 says drop
  redundant indexes; this is the same argument one level deeper.
- `by_ledger_and_dayKey` without `deletedAt`. Would produce short pages (`09` §3.1 rule 2). Never do it.
- Anything with `_creationTime` in it. Auto-appended; never listed (`13` §1.1 rule 1).

**Legacy item field disposition (every single one)**

| legacy field | disposition | where it lands |
|---|---|---|
| `amount` (string) | **transform + archive** | `legacyAmountString`. Never parsed — it embeds the *writer's* device locale and currency, which is not knowable server-side (`02` §6) |
| `realAmount` (number) | **transform + archive** | `kind` + `amountMinor` + `baseAmountMinor`; verbatim in `legacyRealAmount` |
| `memo` | **migrate** | `memo` |
| `category.category` | **transform + archive** | contributes to `kind` (tie-break only); verbatim in `legacyCategoryKind` |
| `category.iconId` | **transform + archive** | resolves `categoryId` / `categoryIconKey`; verbatim in `legacyCategoryIconId` |
| `category.txt` | **transform + archive** | resolves `categoryId`; frozen into `categoryLabelSnapshot`; verbatim in `legacyCategoryTxt` |
| `category.showDelBtn` | **drop** | `legacyRaw` only — pure UI leakage, always `false` |
| `selectedDate` | **transform + archive** | `occurredAt`/`dayKey`/`monthKey`/`occurredOffsetMinutes`; verbatim in `legacySelectedDate` |
| `created` | **transform** | `legacyCreatedAt` (and `createdAt`) |
| `updated` | **transform** | `legacyUpdatedAt` (and `updatedAt`) |
| `writer` | **transform + archive** | `authorUserId` via `by_legacyUid`; verbatim in `legacyWriterUid` |
| `location` | **transform + archive** | `location` object (4 modeled + 5 optional fields); the full geocode blob in `legacyRaw` |
| `picture[]` | **relocate** | one `itemPhotos` row per element (§1.9) + `photoCount` |
| `reviews{}` | **relocate** | one `itemComments` row per child (§1.10) + `commentCount` |
| `results`, `pictureDelete` | **drop** | transient client state, deleted before write. `legacyRaw` if present |

---

### 1.9 `convex/schema/itemPhotos.ts`

Legacy `item.picture` was an **array inside the item document** (`02` §7.3). Convex caps arrays at 8,192
elements and documents at 1 MiB, but the real reason to break it out is the migration: the blob copy is the
slowest, flakiest phase and needs per-photo state, retries and resumability (`14` §5.2–5.3).

```ts
export const photoMigrationStateValidator = v.union(
  v.literal('NATIVE'),   // uploaded through the new app; never had a Firebase blob
  v.literal('PENDING'),  // migrated row, blob not copied yet — client renders legacyUrl
  v.literal('DONE'),     // storageId populated
  v.literal('MISSING'),  // the object is not in the bucket (orphan RTDB row)
  v.literal('FAILED'),
);

export const itemPhotosTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized: lets the copy worker shard by ledger and lets ledger-delete cascade without a join. */
  ledgerId: v.id('ledgers'),
  /** Position in the legacy picture[] array; the display order in the grid. */
  order: v.number(),

  storageId: v.optional(v.id('_storage')),
  contentType: v.optional(v.string()),
  bytes: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),

  uploadedByUserId: v.optional(v.id('users')),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),

  migrationState: photoMigrationStateValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  /** picture[i].path — ABSENT on cloud-function-era rows, which is exactly why deletePhoto never
   *  cleaned them up and the bucket has orphans (02 §11.2). */
  legacyPath: v.optional(v.string()),
  /** picture[i].url — one of THREE shapes (02 §11.4). Rendered as a fallback until storageId lands. */
  legacyUrl: v.optional(v.string()),
  /** picture[i].base64 === true — the deprecated putString path; the "blob" is a data: URI. */
  legacyIsBase64: v.boolean(),
  /** GCS md5Hash (base64) from the storage manifest, for byte-level verification. */
  legacySourceMd5: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = `${ledgerKey}/${itemKey}/${order}`
})
  .index('by_item_and_deleted_and_order', ['itemId', 'deletedAt', 'order'])
  .index('by_ledger_and_deleted_and_createdAt', ['ledgerId', 'deletedAt', 'createdAt'])
  .index('by_state_and_attempts', ['migrationState', 'attempts'])
  .index('by_storage', ['storageId'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | screen |
|---|---|---|
| `by_item_and_deleted_and_order` | `.eq('itemId',I).eq('deletedAt',undefined)` `.take(24)` | Item detail photo grid (first 6 + SEE ALL); full-screen swipe viewer |
| `by_ledger_and_deleted_and_createdAt` | `.eq('ledgerId',L).eq('deletedAt',undefined)` `.order('desc').paginate()` | Ledger-wide photo gallery (a modernization of `SeeAllPicture`); also the ledger-delete cascade cursor |
| `by_state_and_attempts` | `.eq('migrationState','PENDING').lt('attempts',6)` `.take(200)` | **Blob-copy worker only.** The whole two-phase design in `14` §5.3 hangs off this index |
| `by_storage` | `.eq('storageId', s).unique()` | Orphan-blob GC cross-check against `uploads` |
| `by_legacyKey` | point read | Import idempotency |

**Client render rule:** `storageId ? await ctx.storage.getUrl(storageId) : legacyUrl`. This is what lets the
app ship on day one of the cutover with the blob copy still running (`14` D8). **`getUrl` is called once per
row of a bounded page, never inside an unbounded loop** (`13` §4.3, "keep page 0 cheap").

**`base64: true` rows** (`02` §11.3): the copy worker downloads, strips the
`data:image/png;base64, ` prefix (note the space after the comma), decodes and uploads. `legacyIsBase64`
exists so the worker can branch without re-fetching to sniff.

---

### 1.10 `convex/schema/itemComments.ts`

Legacy `reviews` (`02` §3.1). Renamed to *comments* because that is what they are — the legacy name is a
misnomer that confused the code (`Review.ts` model, `ReviewListItem`, `SEE_ALL_REVIEWS`) — but the i18n keys
keep the user-facing wording per locale.

```ts
export const itemCommentsTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized: permission checks resolve membership without loading the item. */
  ledgerId: v.id('ledgers'),
  authorUserId: v.optional(v.id('users')),   // undefined when the legacy writer uid no longer exists
  body: v.string(),                          // legacy `text`
  /** MUST be explicit: the batch import cannot set _creationTime, so sorting on it would order a
   *  2019 comment thread by import order (14 §4.3). */
  createdAt: v.number(),                     // from legacy `date`
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),
  legacyWriterUid: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = `${ledgerKey}/${itemKey}/${reviewKey}`
})
  .index('by_item_and_deleted_and_createdAt', ['itemId', 'deletedAt', 'createdAt'])
  .index('by_author_and_deleted_and_createdAt', ['authorUserId', 'deletedAt', 'createdAt'])
  .index('by_legacyKey', ['legacyKey'])
  .index('by_legacyWriterUid', ['legacyWriterUid']);
```

| index | exact query | screen |
|---|---|---|
| `by_item_and_deleted_and_createdAt` | `.eq('itemId',I).eq('deletedAt',undefined).order('desc').paginate({numItems:10})` | Item detail comment thread — replaces `limitToLast(100)` + a per-comment profile fetch + a sort inside every callback (`02` §S10) |
| `by_author_and_deleted_and_createdAt` | `.eq('authorUserId',U)` | Claim re-parenting sweep; "my comments" |
| `by_legacyKey` / `by_legacyWriterUid` | point reads | Import passes 1 & 2 |

The author join is **batched once per page** via `loadAuthorMap` (`13` §4.4) — 10 rows with 3 distinct
authors is 3 reads, not 10.

**Legacy write hazard closed:** `addOrUpdateLedgerItem` rewrote the whole item node *including its reviews*
on every save, so a comment added between load and save was silently destroyed (`02` §S12). Comments now live
in their own table; editing an item cannot touch them, and `commentCount` is maintained by a trigger.

---

### 1.11 `convex/schema/rollups.ts`

Per `13` §3.4: **rollup tables for the fixed bucket set (the hot path), `@convex-dev/aggregate` deferred until
a custom-date-range report screen ships.** A rollup row is a 1-document read set — nothing beats that, and it
has no B-tree contention.

```ts
/** One row per (ledger, day). ~365/year/ledger. Powers the calendar dots and the per-day subtotals. */
export const ledgerDailyRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  dayKey: v.number(),          // YYYYMMDD int, ledger tz
  monthKey: v.number(),        // YYYYMM int — lets a month scan use one index and one range
  expenseMinor: v.number(),    // in ledgers.currency
  incomeMinor: v.number(),
  itemCount: v.number(),
  photoCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledger_and_dayKey', ['ledgerId', 'dayKey']);

/** One row per (ledger, month). ~12/year/ledger. Powers month headers and the running balance. */
export const ledgerMonthlyRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledger_and_monthKey', ['ledgerId', 'monthKey']);

/** One row per (ledger, month, category). ~40/month/ledger. Powers the donut and the 12-month trend. */
export const ledgerCategoryRollupsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.number(),
  categoryId: v.id('categories'),
  kind: itemKindValidator,
  amountMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
})
  .index('by_ledger_and_monthKey_and_kind', ['ledgerId', 'monthKey', 'kind', 'amountMinor'])
  .index('by_ledger_and_category_and_monthKey', ['ledgerId', 'categoryId', 'monthKey']);

/** Exactly one row per ledger. Hot-write counters live HERE, not on `ledgers` (13 §4.3). */
export const ledgerStatsTable = defineTable({
  ledgerId: v.id('ledgers'),
  itemCount: v.number(),
  lastItemAt: v.optional(v.number()),
  lastItemByUserId: v.optional(v.id('users')),
  firstDayKey: v.optional(v.number()),
  lastDayKey: v.optional(v.number()),
  photoCount: v.number(),
  commentCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledger', ['ledgerId']);
```

| index | exact query | screen | docs |
|---|---|---|---|
| `ledgerDailyRollups.by_ledger_and_dayKey` | `.eq('ledgerId',L).gte('dayKey',20260801).lte('dayKey',20260831)` `.collect()` | **Calendar dots + per-day subtotals** for one month | ≤31 |
| `ledgerMonthlyRollups.by_ledger_and_monthKey` | `.eq('ledgerId',L).eq('monthKey',202608).unique()` | Month header total | **1** |
| `ledgerMonthlyRollups.by_ledger_and_monthKey` | `.eq('ledgerId',L).lte('monthKey',202608)` `.collect()` | **Running balance** as of a month | ≤120 for 10 yrs |
| `ledgerCategoryRollups.by_ledger_and_monthKey_and_kind` | `.eq('ledgerId',L).eq('monthKey',202608).eq('kind','EXPENSE').order('desc')` `.take(40)` | **Donut chart** — pre-sorted by amount because `amountMinor` is the last index field | ≤40 |
| `ledgerCategoryRollups.by_ledger_and_category_and_monthKey` | `.eq('ledgerId',L).eq('categoryId',C).gte('monthKey',202601).lte('monthKey',202612)` | **12-month trend line** | ≤12 |
| `ledgerStats.by_ledger` | `.eq('ledgerId',L).unique()` | Drawer row "last activity"; ledger header entry count | **1** |

`.collect()` appears three times above and is safe **only** because every one of them is provably bounded by
a calendar range (≤31, ≤120, ≤40, ≤12). Each carries a comment saying so, per the `09` §3 named-limit
convention.

**Why `amountMinor` is the last field of `by_ledger_and_monthKey_and_kind`:** it makes the donut's
"largest categories first" ordering free — no in-memory sort, and `.take(8)` for the chart plus a paginated
list for the breakdown below it.

**Migration:** rollups are **not** maintained during the import (`14` §4.6 — maintaining a shared counter
inside a bulk import is the textbook OCC self-conflict). They are built **once, offline, after** the item
import, by `@convex-dev/migrations` scanning `ledgerItems.by_ledger_and_monthKey` one ledger-month at a time
and *writing the computed value*, not incrementing it. That makes a double run harmless.

---

### 1.12 `convex/schema/notifications.ts`

```ts
export const pushPlatformValidator = v.union(v.literal('ios'), v.literal('android'));

export const pushTokensTable = defineTable({
  userId: v.id('users'),
  token: v.string(),                    // ExponentPushToken[...]
  platform: pushPlatformValidator,
  deviceName: v.optional(v.string()),
  /** Recipient locale AT REGISTRATION. Legacy localized the push in the SENDER's language (01 §8). */
  locale: userLocaleValidator,
  appVersion: v.optional(v.string()),
  updatedAt: v.number(),
  /** Expo returned DeviceNotRegistered — stop sending, keep the row for diagnostics. */
  disabledAt: v.optional(v.number()),
})
  .index('by_user_and_disabled', ['userId', 'disabledAt'])
  .index('by_token', ['token']);

export const notificationKindValidator = v.union(
  v.literal('ITEM_CREATED'), v.literal('ITEM_UPDATED'), v.literal('ITEM_DELETED'),
  v.literal('COMMENT_ADDED'),
  v.literal('INVITE_RECEIVED'), v.literal('INVITE_ACCEPTED'),
  v.literal('JOIN_REQUESTED'), v.literal('JOIN_APPROVED'), v.literal('JOIN_REJECTED'),
  v.literal('MEMBER_REMOVED'), v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('ANNOUNCEMENT'), v.literal('LEGACY_CLAIMED'),
);

export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,
  /** i18n KEY + params, never a rendered sentence: the inbox must re-render when the user changes
   *  language, and the push body must be rendered in the RECIPIENT's locale, not the sender's. */
  titleI18nKey: v.string(),
  bodyI18nKey: v.string(),
  paramsJson: v.string(),               // JSON: {ledgerTitle, amount, categoryKey, actorName, …}
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  actorUserId: v.optional(v.id('users')),
  /** expo-router path, e.g. "/ledger/<id>/item/<id>". Legacy taps did NOTHING (01 §8). */
  route: v.optional(v.string()),
  createdAt: v.number(),
  readAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  .index('by_user_and_deleted_and_createdAt', ['userId', 'deletedAt', 'createdAt'])
  .index('by_user_and_deleted_and_read', ['userId', 'deletedAt', 'readAt'])
  .index('by_ledger_and_createdAt', ['ledgerId', 'createdAt']);
```

| index | exact query | screen |
|---|---|---|
| `pushTokens.by_user_and_disabled` | `.eq('userId',U).eq('disabledAt',undefined)` `.collect()` (bounded by device count) | Server-side push fan-out |
| `pushTokens.by_token` | `.eq('token',t).unique()` | Register/deregister; Expo `DeviceNotRegistered` receipt handling |
| `notifications.by_user_and_deleted_and_createdAt` | `.eq('userId',U).eq('deletedAt',undefined).order('desc').paginate()` | Notification inbox |
| `notifications.by_user_and_deleted_and_read` | `.eq('userId',U).eq('deletedAt',undefined).eq('readAt',undefined)` `.take(100)` | Unread badge — `deletedAt` sits *before* `readAt` so an inbox full of read rows is skipped by the index, not walked and post-filtered (`09` §3.1) |
| `notifications.by_ledger_and_createdAt` | `.eq('ledgerId',L)` | Ledger activity feed (optional screen); ledger-delete cascade |

**Legacy `users/{uid}/push_tokens` disposition. DROP, do not migrate.** Rationale, stated plainly: Expo push
tokens are device- and install-scoped, the legacy app is Expo SDK 36 and the tokens were minted by a
`Notifications` module that no longer exists, and every one of those installs will be replaced by a new build
that registers a fresh token on first launch. Migrating them would populate the table with dead tokens that
the first send would have to garbage-collect anyway. The *encoding* of those keys (`02` §5) is therefore
irrelevant to the migration — a small, welcome subtraction.

**Fan-out moves server-side.** Legacy POSTed to `exp.host` **from the client**, which required every client to
be able to read every member's tokens (`02` §1.3, §12). New: mutation → `ctx.scheduler` →
`internalAction sendExpoPush`, batched 100 tokens per Expo request, with receipt handling that sets
`disabledAt`. Clients never see a token but their own.

---

### 1.13 `convex/schema/uploads.ts`

```ts
export const uploadPurposeValidator = v.union(
  v.literal('AVATAR'), v.literal('ITEM_PHOTO'), v.literal('LEDGER_COVER'),
);

/** Ownership + provenance for every _storage blob, so orphans can be found and access can be checked. */
export const uploadsTable = defineTable({
  storageId: v.id('_storage'),
  ownerUserId: v.optional(v.id('users')),
  purpose: uploadPurposeValidator,
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  contentType: v.optional(v.string()),
  bytes: v.optional(v.number()),
  createdAt: v.number(),
  /** Set by the GC cron once it has confirmed a referrer exists. */
  referencedCheckedAt: v.optional(v.number()),
})
  .index('by_storage', ['storageId'])
  .index('by_owner_and_createdAt', ['ownerUserId', 'createdAt'])
  .index('by_purpose_and_checked', ['purpose', 'referencedCheckedAt']);
```

| index | exact query | feature |
|---|---|---|
| `by_storage` | `.eq('storageId',s).unique()` | Access check before `getUrl`; dedupe |
| `by_owner_and_createdAt` | `.eq('ownerUserId',U)` | Account deletion: enumerate a user's blobs |
| `by_purpose_and_checked` | `.eq('purpose','ITEM_PHOTO').eq('referencedCheckedAt', undefined)` `.take(200)` | Nightly orphan-blob GC |

This directly answers the legacy bucket's two known leaks: `deleteLedger` deleted no Storage objects at all,
and cloud-function-era photos had no `path` so `deletePhoto` could never remove them (`02` §11.2).

---

### 1.14 `convex/schema/feedback.ts` — legacy `bookoo/opinions`

```ts
export const feedbackStatusValidator = v.union(
  v.literal('NEW'), v.literal('TRIAGED'), v.literal('ANSWERED'), v.literal('CLOSED'),
);

export const feedbackTable = defineTable({
  userId: v.optional(v.id('users')),      // undefined when the legacy uid no longer resolves
  body: v.string(),                       // legacy `opinion`
  contactEmail: v.optional(v.string()),
  locale: v.optional(userLocaleValidator),
  platform: v.optional(v.string()),
  appVersion: v.optional(v.string()),
  status: feedbackStatusValidator,
  createdAt: v.number(),
  triagedByUserId: v.optional(v.id('users')),
  triagedAt: v.optional(v.number()),

  /** legacy `user` object, verbatim: {uid, displayName, email, phoneNumber, photoURL} with nulls dropped. */
  legacyUserJson: v.optional(v.string()),
  legacyUid: v.optional(v.string()),
  /** legacy createdAt was 'YYYY-MM-DD' — DATE ONLY, no time, no zone (02 §10). Kept as typed. */
  legacyCreatedAtDate: v.optional(v.string()),
  ...legacyTrailer,   // legacyKey = the RTDB push id
})
  .index('by_status_and_createdAt', ['status', 'createdAt'])
  .index('by_user_and_createdAt', ['userId', 'createdAt'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | screen |
|---|---|---|
| `by_status_and_createdAt` | `.eq('status','NEW').order('desc').paginate()` | Ops/admin feedback inbox |
| `by_user_and_createdAt` | `.eq('userId',U).order('desc')` `.take(20)` | Settings → "my feedback" (**new**: legacy was write-only) |
| `by_legacyKey` | point read | Import idempotency |

**MIGRATE, do not discard.** `02` §10 notes nothing in the app ever read `opinions` — it was a write-only
inbox the developer read in the Firebase console. That is exactly why it must come across: it is the only
record of what users complained about, and turning the Firebase project off would destroy it. It is small,
flat, reference-free, and imports as JSONL with a settable `_creationTime` (`14` §4.4).

`legacyCreatedAtDate` is kept as the literal `'2020-01-15'` string *and* `createdAt` is set to
`Date.parse('2020-01-15T00:00:00+09:00')`. Keeping both is the honest thing: the source had no time, and a
fabricated midnight should be visibly a derivation, not a fact.

---

### 1.15 `convex/schema/announcements.ts`, `convex/schema/appConfig.ts`

Legacy `SettingAnnouncement` / `SettingFAQ` were accordions over **hardcoded `STRINGS.js` keys**
(`ANNOUNCEMENT_TXT_1..n`) — publishing a notice required an app-store release. Announcements move
server-side; the FAQ stays in the i18n bundle (it changes once a year and belongs with the copy).

```ts
export const announcementSeverityValidator = v.union(
  v.literal('INFO'), v.literal('IMPORTANT'), v.literal('MAINTENANCE'),
);

export const announcementsTable = defineTable({
  key: v.string(),                        // 'v3-launch', 'legacy-migration-notice'
  severity: announcementSeverityValidator,
  /** ≤5 rows, one per supported locale. Bounded, so an inline array is correct here. */
  translations: v.array(v.object({
    locale: userLocaleValidator, title: v.string(), body: v.string(),
  })),
  publishedAt: v.optional(v.number()),    // undefined = draft
  expiresAt: v.optional(v.number()),
  pinned: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index('by_deleted_and_publishedAt', ['deletedAt', 'publishedAt'])
  .index('by_key', ['key']);

export const appVersionsTable = defineTable({
  platform: pushPlatformValidator,
  latestVersion: v.string(),              // semver
  minSupportedVersion: v.string(),
  forceUpdate: v.boolean(),
  storeUrl: v.string(),
  releaseNotesI18nKey: v.optional(v.string()),
  updatedAt: v.number(),
}).index('by_platform', ['platform']);

/** Small key/value flags. `valueJson` is a JSON string, never v.any(). */
export const appConfigTable = defineTable({
  key: v.string(),                        // 'migration.claimEnabled', 'features.inviteLinks'
  valueJson: v.string(),
  updatedAt: v.number(),
}).index('by_key', ['key']);
```

| index | exact query | screen |
|---|---|---|
| `announcements.by_deleted_and_publishedAt` | `.eq('deletedAt',undefined).lte('publishedAt',now).order('desc')` `.take(30)` | Settings → Announcements |
| `announcements.by_key` | `.eq('key',k).unique()` | Idempotent seeding/publishing |
| `appVersions.by_platform` | `.eq('platform','ios').unique()` | App-start force-update gate |
| `appConfig.by_key` | `.eq('key',k).unique()` | Feature flags, incl. the migration claim kill-switch |

**`now` is passed as a coarse argument (rounded to the hour), not read from `Date.now()` inside the query** —
`13` §4.1: `Date.now()` in a query neither triggers re-runs nor caches well.

---

### 1.16 `convex/schema/ledgerAuditLog.ts`

Nothing in legacy. Added because this is a shared-money app: a member removal, an ownership transfer or a
soft-deleted 300,000-won entry has to be explainable afterwards.

```ts
export const ledgerAuditActionValidator = v.union(
  v.literal('LEDGER_CREATED'), v.literal('LEDGER_UPDATED'), v.literal('LEDGER_ARCHIVED'),
  v.literal('LEDGER_DELETED'), v.literal('LEDGER_TIMEZONE_CHANGED'),
  v.literal('LEDGER_CURRENCY_CONFIRMED'),
  v.literal('MEMBER_JOINED'), v.literal('MEMBER_LEFT'), v.literal('MEMBER_REMOVED'),
  v.literal('MEMBER_ROLE_CHANGED'), v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('INVITE_CREATED'), v.literal('INVITE_REVOKED'),
  v.literal('JOIN_REQUEST_DECIDED'),
  v.literal('ITEM_DELETED'), v.literal('ITEM_RESTORED'),
  v.literal('MIGRATION_IMPORTED'), v.literal('MIGRATION_OWNERSHIP_RESCUED'),
);

export const ledgerAuditLogTable = defineTable({
  ledgerId: v.id('ledgers'),
  action: ledgerAuditActionValidator,
  actorUserId: v.optional(v.id('users')),   // undefined = the system / the migration
  targetUserId: v.optional(v.id('users')),
  itemId: v.optional(v.id('ledgerItems')),
  detailJson: v.optional(v.string()),
  createdAt: v.number(),
}).index('by_ledger_and_createdAt', ['ledgerId', 'createdAt'])
  .index('by_ledger_and_action_and_createdAt', ['ledgerId', 'action', 'createdAt']);
```

| index | exact query | screen |
|---|---|---|
| `by_ledger_and_createdAt` | `.eq('ledgerId',L).order('desc').paginate({numItems:30})` | Ledger settings → Activity |
| `by_ledger_and_action_and_createdAt` | `.eq('ledgerId',L).eq('action','ITEM_DELETED').order('desc')` | "Recently deleted" / restore |

---

### 1.17 `convex/schema/migration.ts`

```ts
export const claimStateValidator = v.union(
  v.literal('unclaimed'), v.literal('claimed'), v.literal('ambiguous'), v.literal('orphan_no_email'),
);

/** 14 §3.4 verbatim, plus the ledger-key mirror needed for reconciliation. */
export const legacyUsersTable = defineTable({
  legacyUid: v.string(),
  emailNormalized: v.optional(v.string()),
  emailRaw: v.optional(v.string()),
  emailVerifiedAt: v.optional(v.number()),
  displayName: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  statusMsg: v.optional(v.string()),
  tel: v.optional(v.string()),
  providers: v.array(v.string()),                 // ["password","google.com","facebook.com"]
  /** Verbatim `users/{uid}/ledgers` keys. Reconciled against ledgers/{k}/members; never trusted alone. */
  legacyLedgerKeys: v.array(v.string()),
  legacyCreatedAt: v.number(),
  legacyLastSignInAt: v.optional(v.number()),
  legacyDisabled: v.boolean(),

  claimState: claimStateValidator,
  claimedByUserId: v.optional(v.id('users')),
  claimedAt: v.optional(v.number()),
  /** The unsignable stand-in that owns this identity's rows until the human arrives. */
  placeholderUserId: v.optional(v.id('users')),
  /** Support-path breadcrumb for forceClaim. */
  claimTicketRef: v.optional(v.string()),
})
  .index('by_legacyUid', ['legacyUid'])
  .index('by_email_and_claimState', ['emailNormalized', 'claimState'])
  .index('by_claimState', ['claimState'])
  .index('by_placeholder', ['placeholderUserId']);

/** Byte-faithful archive of every child of bookoo/invites, whatever we decided to do with it. */
export const legacyInvitesTable = defineTable({
  direction: v.union(v.literal('A_BY_LEDGER'), v.literal('B_BY_EMAIL'), v.literal('UNCLASSIFIED')),
  rawParentKey: v.string(),
  rawChildKey: v.string(),
  rawValue: v.string(),
  legacyLedgerKey: v.optional(v.string()),
  emailNormalized: v.optional(v.string()),
  reconciledAs: v.union(
    v.literal('CONVERTED'), v.literal('ALREADY_MEMBER'),
    v.literal('LEDGER_MISSING'), v.literal('UNCLASSIFIABLE'),
  ),
  inviteId: v.optional(v.id('ledgerInvites')),
  importedAt: v.number(),
})
  .index('by_email', ['emailNormalized'])
  .index('by_legacyLedgerKey', ['legacyLedgerKey'])
  .index('by_reconciledAs', ['reconciledAs']);

/** One row per batch mutation call. The import's ledger. */
export const migrationRunsTable = defineTable({
  runId: v.string(),                      // "items-2026-08-24T09:00Z"
  table: v.string(),
  batchIndex: v.number(),
  inserted: v.number(),
  skipped: v.number(),
  failed: v.number(),
  at: v.number(),
}).index('by_runId_and_table', ['runId', 'table', 'batchIndex']);

export const anomalyKindValidator = v.union(
  v.literal('SELECTED_DATE_LOST'),
  v.literal('NON_KST_OFFSET'),
  v.literal('ZERO_AMOUNT'),
  v.literal('AMOUNT_SIGN_CATEGORY_MISMATCH'),
  v.literal('CATEGORY_ICON_OUT_OF_RANGE'),
  v.literal('CATEGORY_MISSING'),
  v.literal('LEDGER_NOT_VISIBLE'),
  v.literal('DANGLING_MEMBERSHIP_POINTER'),
  v.literal('MEMBER_UID_UNKNOWN'),
  v.literal('WRITER_UID_UNKNOWN'),
  v.literal('INVITE_UNCLASSIFIABLE'),
  v.literal('DUPLICATE_NORMALIZED_EMAIL'),
  v.literal('PHOTO_URL_UNPARSEABLE'),
  v.literal('PHOTO_OBJECT_MISSING'),
  v.literal('LOSSY_AMOUNT_CONVERSION'),
  v.literal('ORPHAN_SOLE_MEMBER_LEDGER'),
);

export const migrationAnomaliesTable = defineTable({
  kind: anomalyKindValidator,
  legacyKey: v.string(),
  table: v.string(),
  detailJson: v.string(),
  resolvedAt: v.optional(v.number()),
  resolvedNote: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_kind_and_resolved', ['kind', 'resolvedAt'])
  .index('by_legacyKey', ['legacyKey']);
```

| index | exact query | feature |
|---|---|---|
| `legacyUsers.by_email_and_claimState` | `.eq('emailNormalized',e).eq('claimState','unclaimed')` `.collect()` | **The claim, inside `afterUserCreatedOrUpdated`** (`14` §3.4). >1 row ⇒ mark all `ambiguous`, never guess |
| `legacyUsers.by_legacyUid` | `.eq('legacyUid',u).unique()` | Import pass 1 & 2 |
| `legacyUsers.by_claimState` | `.eq('claimState','orphan_no_email')` | Ops dashboard |
| `legacyUsers.by_placeholder` | `.eq('placeholderUserId',U).unique()` | Reverse lookup during re-parenting |
| `legacyInvites.by_reconciledAs` | `.eq('reconciledAs','ALREADY_MEMBER')` | Verification report |
| `migrationRuns.by_runId_and_table` | `.eq('runId',R).eq('table','ledgerItems')` | Driver checkpointing / resume |
| `migrationAnomalies.by_kind_and_resolved` | `.eq('kind','SELECTED_DATE_LOST').eq('resolvedAt',undefined)` | Sign-off checklist |

---

## Part 2 — The read-path table

Doc counts are for a **100,000-item ledger with 10 years of history, 40 categories and 6 members**, on a
cold subscription. "Docs" = documents *scanned*, which is the number the 32,000 limit and the billing meter
care about — not documents returned.

| # | Screen | Query | Index | Docs @100k | Notes |
|---|---|---|---|---|---|
| 1 | **App boot / auth gate** | `users.currentProfile` | `userProfiles.by_user` | **1** | plus `appVersions.by_platform` (1) and `appConfig.by_key` (≤5) |
| 2 | **Drawer / ledger switcher** | `ledgers.listMine` | `ledgerMembers.by_user_and_left` → `.take(100)` | **≤100 memberships** | then a batched `db.get` per ledger (**≤100**) + `ledgerStats.by_ledger` (**≤100**). Legacy: downloaded *every item of every ledger* on every open (`02` §S1–S3) |
| 2b | drawer pending-request dot | `ledgers.pendingRequestCounts` | `ledgerJoinRequests.by_ledger_and_status` per owned ledger, `.take(1)` | **≤ #owned** | legacy did this as N **sequential** round-trips per refresh (`02` §S4) |
| 3 | **Calendar month (Tab1, upper)** | `items.monthMarkers` | `ledgerDailyRollups.by_ledger_and_dayKey` range | **≤31** | dots + per-day subtotals in one read. Legacy: O(n²) `checkEventDates` over all items (`02` §S5) |
| 4 | **Selected-day list (Tab1, lower)** | `items.listByDay` | `ledgerItems.by_ledger_and_deleted_and_dayKey_and_occurredAt`, `.eq(dayKey)` | **~3–10** | + `categories.by_ledger_and_deleted_and_order` (≤40, cached per ledger) + `loadAuthorMap` (≤6) |
| 5 | **Month list w/ day sections (Tab2)** | `items.listByMonth` (paginated) | same index, `.gte/.lte(dayKey)`, `.order('desc')`, `numItems:30` | **30/page** | day headers come from query #3's rollups, merged client-side by `dayKey` (`13` §5.2) — never grouped from the page |
| 6 | **Search (Tab2 search box)** | `items.search` | `ledgerItems.search_text` | **≤1024 scanned, 50 returned** | debounced 250 ms. Exact-amount search uses the `amountMinor` filter field. Legacy filtered the whole in-memory array on every keystroke (`02` §S6) |
| 7 | **Stats donut (Tab3)** | `stats.monthByCategory` | `ledgerCategoryRollups.by_ledger_and_monthKey_and_kind`, `.take(40)` | **≤40** | pre-sorted by `amountMinor` |
| 7b | donut centre: running balance | `stats.balanceAsOf` | `ledgerMonthlyRollups.by_ledger_and_monthKey`, `.lte(monthKey)` | **≤120** | 10 years. Legacy summed every item on every render (`02` §S5) |
| 8 | **12-month category trend** | `stats.categoryTrend` | `ledgerCategoryRollups.by_ledger_and_category_and_monthKey` range | **≤12** | Legacy walked all 100k items (`02` §S5, `01` §5.19) |
| 8b | trend → month drill-down list | `items.listByCategoryMonth` | `ledgerItems.by_ledger_and_category_and_deleted_and_dayKey` | **30/page** | |
| 9 | **Item detail** | `items.get` + `photos.listByItem` + `comments.listByItem` | `db.get` / `itemPhotos.by_item_and_deleted_and_order` / `itemComments.by_item_and_deleted_and_createdAt` | **1 + ≤24 + 10/page** | + `loadAuthorMap` over the ≤10 distinct comment authors (**≤6**). Legacy: `limitToLast(100)` + one profile fetch *per comment* + a sort inside every callback (`02` §S10) |
| 10 | **Entry add/edit** | `categories.listForLedger` | `categories.by_scope_and_kind_and_order` (**≤34**) + `categories.by_ledger_and_deleted_and_order` (**≤200**) | **≤234** | both bounded catalogs, `.take()`-capped, MMKV-cached client-side |
| 11 | **Members screen** | `members.list` + `invites.listPending` + `joinRequests.listPending` | `ledgerMembers.by_ledger_and_left` (**≤200**) / `ledgerInvites.by_ledger_and_status` (**≤100**) / `ledgerJoinRequests.by_ledger_and_status` (**≤100**) | **≤400** | + one batched `userProfiles.by_user` per distinct member (**≤6**). Legacy: N+1 per member, N+1 per requester, and a promise that never resolved if any lookup failed (`02` §S8, §S9) |
| 12 | **Ledger settings** | `ledgers.get` | `db.get` + `ledgerStats.by_ledger` | **2** | |
| 13 | **Ledger discovery** | `ledgers.searchPublic` | `ledgers.search_title` (**≤1024 scanned, 20 returned**) + `ledgerJoinRequests.by_user_and_status` (**≤50**) | **≤1074** | owner names via one batched `loadAuthorMap` (**≤20**). Legacy read every matched ledger's *entire* node including items (`02` §S11) |
| 14 | **Profile (mine / theirs)** | `users.getByHandle` | `userProfiles.by_handleKey` | **1** | + `ledgerMembers.by_user_and_left` for shared-ledger count (**≤100**) |
| 15 | **Notification inbox** | `notifications.list` | `notifications.by_user_and_deleted_and_createdAt` | **30/page** | unread badge: `by_user_and_deleted_and_read`, `.take(100)` |
| 16 | **Onboarding: claim handle** | `handles.checkAvailability` (advisory) | `userHandles.by_handleKey` | **≤1** | the mutation re-checks; the query is UX only (`09` §12.2 C1) |

**Nothing on this table scans more than ~1,100 documents, and every screen's hot path is under 250.** The
only `.collect()` calls are on provably calendar-bounded rollup ranges (#3, #7b, #8).

**Subscription budget per mounted screen** (`13` §4.2, target ≤10): Tab1 = 3 (profile, day markers, day list).
Tab2 = 3 (profile, month markers, item page-0) plus one per loaded page. Item detail = 4.

---

## Part 3 — The write-path table

Every mutation below routes through `convex-helpers` `Triggers` + `customMutation` so a rollup can never be
forgotten (`13` §5.4). The raw `mutation` is never imported outside `convex/lib/`.

| Mutation | Documents written | OCC contention |
|---|---|---|
| `handles.claim` | `userHandles` insert (1), `userProfiles` patch (1) | **By design.** `by_handleKey` `.eq()` is the narrowest possible read set; two people racing for the same handle conflict, Convex retries, the loser sees `HANDLE_TAKEN` (`09` §12.2). Zero contention between *different* handles |
| `ledgers.create` | `ledgers` (1), `ledgerMembers` (1), `ledgerStats` (1), `ledgerAuditLog` (1) | None |
| `ledgers.update` | `ledgers` (1), `ledgerAuditLog` (1) | Owner-only; effectively single-writer |
| `ledgers.setTimeZone` | `ledgers` (1), `ledgerAuditLog` (1) + **schedules** `rebucket` | Rebucket batches touch every item and every rollup of the ledger; it sets `timeZoneRebucketState='RUNNING'` and the item mutations **reject writes while it runs** (a 2-second lockout is better than a silently wrong `dayKey`) |
| `ledgers.confirmCurrency` | `ledgers` (1), `ledgerAuditLog` (1) + **schedules** an item `currencyIsAssumed` sweep | Batched, cursor-based, recompute-not-increment |
| `ledgers.transferOwnership` | `ledgers` (1), 2× `ledgerMembers` (2), `ledgerAuditLog` (1), `notifications` (1) | Owner-only |
| `ledgers.softDelete` | `ledgers` (1), `ledgerAuditLog` (1) + **schedules** cascade | Cascade batches touch members/items/photos/comments/rollups by cursor; idempotent (re-setting `deletedAt` to the same value is a no-op patch) |
| `members.remove` / `members.leave` | `ledgerMembers` (1), `ledgers.memberCount` (1), `ledgerAuditLog` (1), `notifications` (1) | `ledgers.memberCount` is a shared counter — but membership changes are a handful per ledger **per year**. Contention is theoretical |
| `invites.createEmail` / `createLink` / `createDirect` | `ledgerInvites` (1), `ledgerAuditLog` (1), `notifications` (0–1) + **schedules** the email/push action | None |
| `invites.accept` | `ledgerInvites` (1), `ledgerMembers` (1), `ledgers.memberCount` (1), `ledgerAuditLog` (1), `notifications` (1) | `memberCount`; negligible |
| `invites.drainForEmail` *(first sign-in)* | up to 50× (`ledgerInvites` + `ledgerMembers` + `ledgers.memberCount` + audit) | **The one real burst.** Batched at 20 invites per scheduled mutation. Each ledger's `memberCount` is a distinct doc, so the batch conflicts with itself only if the same ledger appears twice — which it cannot |
| `joinRequests.create` (toggle) | `ledgerJoinRequests` (1) | Per (ledger,user); none |
| `joinRequests.decide` | `ledgerJoinRequests` (1), on approve `ledgerMembers` (1) + `ledgers.memberCount` (1), `ledgerAuditLog` (1), `notifications` (1) | None |
| **`items.create`** | `ledgerItems` (1) · `ledgerDailyRollups` (1 upsert) · `ledgerMonthlyRollups` (1 upsert) · `ledgerCategoryRollups` (1 upsert) · `ledgerStats` (1 patch) · `uploads` (0–n) · `itemPhotos` (0–n) · `notifications` (0–5) + schedules push = **5 + photos + notifications** | **The hot path.** Contention scope: two members of the **same** ledger writing in the **same second**. `ledgerStats` is the tightest (every write touches it); the daily rollup is next (same ledger, same day). Convex's automatic retries absorb household-scale concurrency (`13` §3.3). Scope never crosses ledgers — there is **no global counter anywhere in this schema**, which is the single most important contention property |
| **`items.update`** | same as create, plus a **second** rollup delta set when `dayKey`/`monthKey`/`categoryId`/`kind`/`baseAmountMinor` changed (old bucket −, new bucket +) — up to **9 docs** | Same scope. The trigger does `applyDelta(old,-1)` then `applyDelta(new,+1)` in one transaction, so a partial application is impossible |
| **`items.softDelete`** | `ledgerItems` (1), 3 rollups (3), `ledgerStats` (1), `ledgerAuditLog` (1) | Same scope |
| `photos.attach` | `itemPhotos` (1), `ledgerItems.photoCount` (1), `uploads` (1), rollup `photoCount` (1) | Per item; none |
| `photos.remove` | `itemPhotos` (1), `ledgerItems.photoCount` (1), rollup (1) | Per item; none |
| `comments.add` | `itemComments` (1), `ledgerItems.commentCount` (1), `ledgerStats.commentCount` (1), `notifications` (0–5) | `ledgerItems.commentCount` — per item, only contends with a simultaneous comment on the **same** item |
| `comments.remove` | `itemComments` (1), `ledgerItems.commentCount` (1), `ledgerStats` (1) | Same |
| `categories.createCustom` | `categories` (1) | `by_ledger_and_key` `.eq()` gate; conflicts only with a same-slug race in the same ledger |
| `push.registerToken` | `pushTokens` (1 upsert on `by_token`) | None |
| `feedback.send` | `feedback` (1) | None |
| `migrate.import*` (batch, ≤300 rows) | `ledgerItems`/`itemComments`/… inserts + 1 `migrationRuns` | **Rollups are NOT maintained during import** (`14` §4.6). A single sequential driver per table does not self-conflict |
| `migrate.claimLegacyAccount` (scheduled) | `legacyUsers` (1), `userProfiles` (1–2), then batched re-parenting of `ledgerMembers` / `ledgers.ownerUserId` / `ledgerItems.authorUserId` / `itemComments.authorUserId` | Runs at first sign-in, one user at a time, batched by cursor. Guarded by `claimState !== 'unclaimed' → return`, so it is re-entrant |
| `cron rollups.repair` (nightly) | recomputes ≤N ledger-months from `by_ledger_and_monthKey` and **writes the computed value** | Recompute-not-increment ⇒ a double run is harmless. This is the safety net that makes shipping denormalization defensible (`13` §5.4) |
| `cron uploads.gc` (nightly) | deletes orphan `_storage` blobs + `uploads` rows | The only hard delete in the system |

**OCC summary:** the deepest contention is 5 documents per item write, all scoped to one ledger. There is no
cross-ledger counter, no global aggregate, and no `_creationTime`-keyed aggregate — which is exactly the
failure mode the aggregate README warns about ("all inserts will wait for each other", `13` §3.2). If a
"total entries logged across BooKoo" vanity metric is ever wanted, it goes to `@convex-dev/sharded-counter`
and nowhere near this schema.

---

## Part 4 — Migration mapping (the two-pass import, table by table)

`legacyKey` formats — every one is **globally unique**, which is what makes `by_legacyKey` a valid
idempotency key:

| target table | `legacyKey` format | example |
|---|---|---|
| `legacyUsers` | `legacyUid` (its own column) | `7Xk2aBcD…` |
| `ledgers` | `{ledgerKey}` | `-L9xQ2fT3kZ8aB1cDe` |
| `ledgerMembers` | `{ledgerKey}/{uid}` | `-L9xQ…/7Xk2aBcD` |
| `ledgerInvites` | `{ledgerKey}/{encodedEmail}` | `-L9xQ…/hyo%40hyo%2Edev` |
| `ledgerJoinRequests` | `{ledgerKey}/{uid}` | `-L9xQ…/pQ9r…` |
| `ledgerItems` | `{ledgerKey}/{itemKey}` | `-L9xQ…/-M2ab…` |
| `itemComments` | `{ledgerKey}/{itemKey}/{reviewKey}` | `-L9xQ…/-M2ab…/-M9zz…` |
| `itemPhotos` | `{ledgerKey}/{itemKey}/{order}` | `-L9xQ…/-M2ab…/0` |
| `categories` (recovered) | `{ledgerKey}/cat/{iconId}/{sha1(txt)}` | `-L9xQ…/cat/3/9f8a…` |
| `feedback` | `{opinionPushKey}` | `-MabC…` |

### Pass order (each pass is resumable, each row is a point-read dedupe)

| pass | source | target | mechanism | batch |
|---|---|---|---|---|
| 0 | `auth-users.safe.json` + `bookoo/users/*/info` | `legacyUsers` | `convex import --table` JSONL (sets `_creationTime`) | whole file |
| 1 | `legacyUsers` | `users` (placeholder) + `userProfiles` | batch mutation | 500 |
| 2 | `bookoo/ledgers/{k}` root | `ledgers` + `ledgerStats` | batch mutation, resolves `legacyOwnerUid` → `Id<'users'>` | 200 |
| 3 | `bookoo/ledgers/{k}/members` | `ledgerMembers` | batch mutation, patches `ledgers.memberCount` at the end of each ledger | 500 |
| 4 | `bookoo/ledgers/{k}/requests` | `ledgerJoinRequests` (`status:'PENDING'`) | batch mutation | 500 |
| 5 | `bookoo/invites` (both directions) | `ledgerInvites` + `legacyInvites` | batch mutation, algorithm in §1.5 | 500 |
| 6 | all items' `category` sub-objects | `categories` (GLOBAL seed + LEDGER recovery) | seed + batch mutation, algorithm in §1.7 | 300 |
| 7 | `bookoo/ledgers/{k}/items/{i}` | `ledgerItems` | batch mutation | 300 |
| 8 | `items[].reviews` | `itemComments` + patch `ledgerItems.commentCount` | batch mutation | 500 |
| 9 | `items[].picture[]` | `itemPhotos` (`migrationState:'PENDING'`) + patch `photoCount` | batch mutation | 500 |
| 10 | `bookoo/opinions` | `feedback` | JSONL import | whole file |
| 11 | *(none — computed)* | all four rollup tables | `@convex-dev/migrations`, **recompute from source** | 100 docs |
| 12 | GCS blobs | `_storage` + patch `itemPhotos.storageId` | resumable worker on `by_state_and_attempts` | 200 |
| 13 | — | ownership rescue for `orphan_no_email` sole-member ledgers | internal mutation | — |

Pass 2 (the "resolve `legacyUid` → `Id<'users'>`" sweep from `14` D9) is **not a separate phase here** — every
uid reference is resolved inline at insert time because pass 1 has already created a placeholder `users` row
for **every** legacy uid. Where a uid appears that pass 0 never saw (a deleted Firebase Auth account whose
uid is still in a `members` map — the wide-open rules made this possible), the reference is left `undefined`
and a `MEMBER_UID_UNKNOWN` / `WRITER_UID_UNKNOWN` anomaly is recorded; the row still imports, and the UI
renders "탈퇴한 사용자 / former member". **No legacy row is ever skipped because a reference is missing.**

### First-sign-in guarantee (the acceptance test for this whole proposal)

A 2019 user signs in with email OTP to `hyo@hyo.dev`. In one scheduled `claimLegacyAccount`:

1. `legacyUsers.by_email_and_claimState` finds exactly one `unclaimed` row → claim proceeds
   (2 rows ⇒ both marked `ambiguous`, support path, never a guess).
2. `userProfiles` merges `displayName` / `statusMsg` / `tel` / `photoURL` **only where the new profile is empty**.
3. Re-parenting, batched by cursor:
   `ledgerMembers.by_legacyUid` → `userId`; `ledgers` where `ownerUserId === placeholder` → real id;
   `ledgerItems.by_author_and_deleted_and_occurredAt` → real id;
   `itemComments.by_author_and_deleted_and_createdAt` → real id.
4. `ledgerInvites.by_email_and_status` drains every pending invite into a membership.
5. The placeholder `userProfiles` row is tombstoned (`deletedAt`), its `users` row kept (it has no
   `authAccounts` row, so it was never signable) so no foreign key can dangle.

**Result:** every ledger they owned, every ledger they were merely a member of, every item they wrote, every
item other people wrote in shared ledgers, every photo, every comment they wrote, every comment on their
items, and every invite that was still pending — all present, in the right order, with the right day
boundaries. That is the requirement, and every field above exists to satisfy it.

### Verification (what "verifiable" means concretely)

| assertion | query |
|---|---|
| row counts | `count(ledgerItems) === jq total items` per ledger, joined on `legacyKey` |
| no duplicates | `by_legacyKey` `.unique()` never throws across a full sweep |
| money is lossless | `sum(legacyRealAmount)` per ledger-month === `±(incomeMinor − expenseMinor)` from `ledgerMonthlyRollups`, after minor-unit scaling |
| rollups are correct | nightly repair cron reports zero deltas on a full pass |
| dates are sane | `count(occurredAt === 0) === 0`; `count(anomalies kind='SELECTED_DATE_LOST')` matches the pre-computed jq count |
| memberships are complete | for every `(ledgerKey, uid)` in the RTDB members maps, exactly one `ledgerMembers.legacyKey` exists |
| invites reconcile | `count(legacyInvites) === count(children of bookoo/invites)`, and every `CONVERTED` row has a live `inviteId` |
| photos accounted for | `count(itemPhotos) === Σ picture[].length`; `DONE + MISSING + FAILED === total` at the end of pass 12 |

---

## Part 5 — Legacy field disposition, exhaustively

Every field in `02`'s data dictionary. **M** = migrate as-is, **T** = transform, **A** = archive only
(`legacyRaw` / a `legacy*` column), **D** = drop.

### `bookoo/users/{uid}`

| field | | destination / justification |
|---|---|---|
| `info.displayName` | M | `userProfiles.displayName`, `legacyUsers.displayName` |
| `info.email` | T | `userProfiles.emailNormalized` + `legacyUsers.emailRaw` (raw preserved: normalization is lossy) |
| `info.photoURL` | T | `userProfiles.avatarLegacyUrl` → `avatarStorageId` after the blob copy |
| `info.statusMsg` | M | `userProfiles.statusMessage` |
| `info.tel` | M | `userProfiles.phone` |
| `ledgers/{k}` (mirror map) | T | `legacyUsers.legacyLedgerKeys` (archive) + reconciliation input. **The mirror itself is dropped**; `ledgerMembers.by_user_and_left` replaces it |
| `push_tokens/{enc}` | D | Expo tokens are install-scoped and every install is being replaced; migrating them would seed the table with dead tokens (§1.12) |

### `bookoo/ledgers/{k}`

| field | | destination / justification |
|---|---|---|
| `info.title` | M | `ledgers.title` (+ derived `titleKey`) |
| `info.description` | M | `ledgers.description` |
| `info.color` (0..5) | T | `ledgers.color` (named token) + `legacyColorIndex` |
| `info.people` | D | Always `1`, never read (`02` §2.2). `legacyRaw` only |
| `owner` | T | `ledgers.ownerUserId` + `legacyOwnerUid`; also a `ledgerMembers` row with `role:'OWNER'` |
| `visible` | T | `true` → nothing; `false` → `archivedAt` + anomaly. The field itself is not modeled |
| `members{}` | T | one `ledgerMembers` row each (`role:'MEMBER'`, `joinedVia:'LEGACY_IMPORT'`) |
| `requests{}` | T | one `ledgerJoinRequests` row each, `status:'PENDING'` |
| `items{}` | T | `ledgerItems` (§1.8) |
| *(no `createdAt`)* | T | derived from the push-id timestamp → `legacyCreatedAt` |

### `bookoo/ledgers/{k}/items/{i}` — see the full table in §1.8. Summary: 13 fields, **0 dropped without archive**.

### `bookoo/ledgers/{k}/items/{i}/reviews/{r}`

| field | | destination |
|---|---|---|
| `text` | M | `itemComments.body` |
| `writer` | T | `itemComments.authorUserId` + `legacyWriterUid` |
| `date` | T | `itemComments.createdAt` + `legacyCreatedAt` |

### `bookoo/invites`

| | | destination |
|---|---|---|
| index A `{ledgerKey}/{encEmail}` | T | one `ledgerInvites` row (union with B) + a `legacyInvites` archive row |
| index B `{encEmail}/{ledgerKey}` | T | same row + its own `legacyInvites` archive row |
| orphans from the `Promise.all` bugs | T | `legacyInvites.reconciledAs = 'ALREADY_MEMBER'`; **no** `ledgerInvites` row |

### `bookoo/opinions/{k}`

| field | | destination |
|---|---|---|
| `opinion` | M | `feedback.body` |
| `user.uid` | T | `feedback.userId` via `by_legacyUid`, + `legacyUid` |
| `user.{displayName,email,phoneNumber,photoURL}` | A | `feedback.legacyUserJson` — a point-in-time snapshot, not current truth |
| `createdAt` (`YYYY-MM-DD`) | T | `feedback.createdAt` (00:00 KST) **and** `legacyCreatedAtDate` verbatim |

### Device-local state (`02` §14) — none of it is in Firebase, all of it must be decided

| key | | destination |
|---|---|---|
| SQLite `categories` (stock) | T | re-seeded server-side as the 34 GLOBAL `categories` (`04` §3.2) |
| SQLite `categories` (custom) | T | **recovered from item snapshots** into per-ledger `categories` (§1.7). The only possible recovery; upgrades them from device-local to shared |
| `LOCALE.lang` | T | `userProfiles.locale` (unmigratable — defaults from device locale at first launch) |
| `LOCALE.currency/unit/currencyLang` | T | `userProfiles.preferredCurrency`; `unit`/`currencyLang` **dropped** — `Intl` derives both (`04` §5) |
| `LOCKED`, `LOCKED_NUMBER`, `LOCKED_FINGERPRINT` | D | **Never server-side.** The PIN goes to `expo-secure-store`, hashed. Storing an app-lock PIN in Convex would make it a server-side credential for a purely local gate |
| `switch_new`, `switch_update` | T | `userProfiles.pushOnItemCreated` / `pushOnItemUpdated` (server-side at last, so a reinstall keeps the preference) |
| `push` | D | see push tokens above |
| `selectedLedgerIndex` | T | MMKV, **as a ledger id, not an array index** (the legacy index broke whenever ledger order changed) |
| `email`, `pw`, `token`, `login_type` | D | Convex Auth owns the session; `expo-secure-store` holds it. `ENCRYPTION_KEY = 'BOOKOO_LEGENDARY_LEDGER_5897'` is a leaked secret (`04` §6) |
| `APP_INSTALLED`, `title` | D | vestigial |

---

## Part 6 — What I deliberately did NOT model, and why

| Not modeled | Why |
|---|---|
| **A `transactions`/`transfer` kind** | `kind` is `EXPENSE \| INCOME` only. Legacy had no transfer concept, no account concept, and no data to migrate into one. Adding a third literal now would need `fromAccountId`/`toAccountId` and a signed-pair rollup rule — real complexity for zero existing data. The union is trivially extensible when the feature is actually designed |
| **Accounts / wallets** (cash, card, bank) | Same reason. The 가계부 category `walletMoney` is an income *category*, not an account |
| **Budgets, recurring entries, splits, settle-up** | No legacy equivalent. Each needs its own product design; guessing at a schema now would produce columns nobody writes |
| **A live FX-rate table** | `fxRate` + `fxRateSource` make a multi-currency item *representable* today (`MANUAL` entry). A rate provider, historical rates and re-valuation are a separate feature. All migrated data is `ASSUMED_ONE` |
| **`@convex-dev/aggregate`** | `13` §3.4's explicit rule: rollup tables answer every v1 screen with a 1-document read set and no B-tree contention. The aggregate component comes in **only** when a custom-date-range report ships, namespaced by `ledgerId`. Adopting it now buys nothing and adds an OCC surface and a corruption mode (dashboard edits bypass triggers) |
| **`@convex-dev/sharded-counter`** | No global counter exists in this schema. That is a feature |
| **A `ledgerItemRevisions` history table** | `ledgerAuditLog` records *that* an item was deleted or restored; full field-level revision history is a bigger product decision (storage cost, UI, privacy between members). `updatedByUserId` + `updatedAt` cover the "who touched this" question that legacy could not answer at all |
| **Full-text search on comments** | Only 4 search indexes per table and they count against the 32-index budget. Comment search has no legacy equivalent and no demand |
| **A `users` table override** | Convex Auth owns `authTables.users`. Every app field lives on `userProfiles`. Redefining `users` to add `isPlaceholder` would couple the schema to `@convex-dev/auth`'s internals across upgrades — and the placeholder is already unsignable by virtue of having no `authAccounts` row |
| **Firebase password hashes** | `14` D4/§3.3: the new app has no password provider, and scrypt at N=2¹⁴ does not fit a 1-second mutation budget. `passwordHash`/`salt` are stripped from the dump before it ever leaves the export machine |
| **Facebook as a provider** | `DECISIONS.md` §3. FB users with an email recover via email OTP; FB-only-no-email users land in `claimState:'orphan_no_email'` with a support-only `forceClaim` path |
| **`item.amount` parsing** | Stored in `legacyAmountString`, never parsed. It embeds the *writer's* device locale and currency, neither of which is knowable server-side (`02` §6) |
| **`info.people`, `category.showDelBtn`, `category.img`, `category.key`, `LedgerItem.categories`, `results`, `pictureDelete`** | Dead or transient in the legacy source. `legacyRaw` captures them for the audit; no column exists |
| **The legacy `visible` flag as a column** | Write-once `true`, never read as `false`. Mapped to `archivedAt` in the one pathological case and flagged |
| **`assets/cldr.json` (3.16 MB) and `react-native-globalize`** | Client-side, and Hermes on SDK 57 ships full-ICU `Intl` (`04` §4). Not a schema concern, but it is the reason `LOCALE.unit`/`currencyLang` have no columns |
| **AdMob / Amplitude tables** | Legacy ad call-sites were all commented out; analytics belongs in an analytics product, not in the transactional database |

---

## Appendix A — Index budget per table

| table | indexes | search | budget used (max 32) |
|---|---|---|---|
| `userProfiles` | 5 | 1 | 6 |
| `userHandles` | 3 | 0 | 3 |
| `ledgers` | 3 | 1 | 4 |
| `ledgerMembers` | 6 | 0 | 6 |
| `ledgerInvites` | 5 | 0 | 5 |
| `ledgerJoinRequests` | 4 | 0 | 4 |
| `categories` | 5 | 0 | 5 |
| **`ledgerItems`** | **7** | **1** | **8** |
| `itemPhotos` | 5 | 0 | 5 |
| `itemComments` | 4 | 0 | 4 |
| `ledgerDailyRollups` | 1 | 0 | 1 |
| `ledgerMonthlyRollups` | 1 | 0 | 1 |
| `ledgerCategoryRollups` | 2 | 0 | 2 |
| `ledgerStats` | 1 | 0 | 1 |
| `pushTokens` | 2 | 0 | 2 |
| `notifications` | 3 | 0 | 3 |
| `uploads` | 3 | 0 | 3 |
| `feedback` | 3 | 0 | 3 |
| `announcements` | 2 | 0 | 2 |
| `appVersions` / `appConfig` | 1 / 1 | 0 | 1 / 1 |
| `ledgerAuditLog` | 2 | 0 | 2 |
| `legacyUsers` | 4 | 0 | 4 |
| `legacyInvites` | 3 | 0 | 3 |
| `migrationRuns` | 1 | 0 | 1 |
| `migrationAnomalies` | 2 | 0 | 2 |

Every table has room. No index exceeds 4 fields (limit 16). No index name exceeds 64 characters — the longest
is `by_ledger_and_deleted_and_dayKey_and_occurredAt` at 47.

## Appendix B — Post-migration cleanup schedule

| when | action |
|---|---|
| cutover + 0 | `legacyInvites`, `migrationRuns` become read-only archives |
| cutover + 30 d | drop the `staged` flag on any index added during the import |
| cutover + 60 d | Firebase project decommissioned (`14` D10). `itemPhotos.legacyUrl` becomes dead — the copy worker **must** report `PENDING === 0` before this date |
| cutover + 90 d | tighten `userProfiles.legacyUid` etc. from `v.optional` to required? **No** — new users legitimately have no legacy identity. These stay optional forever, by design |
| cutover + 12 mo | purge `orphanedAt` ledgers whose sole member was an unrecoverable orphan (`14` §3.5) |
| never | `legacyKey`, `legacyCreatedAt`, `legacyRaw` are permanent. They are the audit trail |
