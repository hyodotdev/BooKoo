# BooKoo — COMPLETENESS CRITIC: gap register

Status: **historical review output; all 60 gaps resolved as of 2026-08-24.** Nothing here is itself a
design decision: each `Resolved` note points to the normative owner and `RECONCILIATION.md` records the
cross-document answer.

Inputs read in full: `DECISIONS.md`; `design/SCHEMA.md`, `design/auth-onboarding.md`,
`design/sharing-invites.md`, `design/calendar-component.md`, `design/money-categories-i18n.md`,
`design/category-icons.md`; `research/01`, `research/02` (index + §2.2, §13), `research/13` §11,
`research/15-REAL-DATA-PROFILE.md`; plus the live scaffold (`package.json`, `app.config.ts`, `eas.json`,
`.github/workflows/ci.yml`, `shared/*`, `src/theme.ts`, `.agents/`+mirrors).

Severity key:
- **BLOCKER** — implementation cannot start (or will produce wrong data/failed writes) until it is resolved.
- **IMPORTANT** — ships broken, ships illegal, or is expensive to retrofit.
- **NICE** — real but deferrable with a written note.

Original counts: **60 gaps — 25 BLOCKER · 27 IMPORTANT · 8 NICE**. Remaining: **0**.

---

## Executive summary — the five things that matter most

1. **`SCHEMA.md` is declared authoritative but the other four design documents were written against a
   different schema and were never reconciled.** They use different table names, different field names,
   a different index-naming grammar, a different permission-helper name, a different currency-mutation
   rule, and one of them (`auth-onboarding.md`) depends on a table (`userEmails`) that `SCHEMA.md` does
   not contain. Roughly 30 % of the code blocks in `auth-onboarding.md` and `sharing-invites.md` would
   fail `convex dev` validation as written. **This is the single largest risk in the project.** (G1–G15)
2. **There is no screen / navigation / information-architecture design at all.** Four subsystem documents
   plus a schema exist; the app shell (tabs, ledger switcher, tablet split), the entry add/edit screen
   (the biggest legacy screen, 1153 lines), the item detail screen, the stats screens, the photo viewer
   and the settings tree are undesigned. (G22–G31)
3. **Nine legacy features named in the brief have no owner**: push-on-entry-add, the pinch-zoom photo
   viewer with save/delete, location capture + map, the donut and 12-month line charts, in-list search
   semantics, the tutorial/intro, announcements/FAQ authoring, currency/language settings screens, and
   ledger colour theming in dark mode. (G23–G31)
4. **`research/15-REAL-DATA-PROFILE.md` is measured production truth and post-dates every design
   document. Five of its nine "shape surprises" break the importer as specified** — `reviews` as a JSON
   array, one malformed ledger-root child, 434 RTDB users with no usable profile email, `created`
   missing on 3,855 item-shaped nodes, and an 88-row measured maximum against the 120-category cap.
   (G16–G21, G49–G54)
5. **Legal/compliance is unowned.** No consent screen (Korea PIPA requires explicit, separable consent
   and this app collects location and financial data), no privacy policy/ToS surface (legacy `Intro` had
   one), no data-export/portability path (two documents disagree on whether it even ships), no Play Data
   Safety / App Privacy label plan, and receipt photos are served over permission-free, never-expiring
   Convex storage URLs. (G37, G38, G41)

---

# PART A — BLOCKERS: cross-document contradictions

These are all the same class of failure: `SCHEMA.md` says it is the winner, but no one went back and
rewrote the other documents, so an implementer following `auth-onboarding.md` or `sharing-invites.md`
literally writes code that does not compile against `SCHEMA.md`.

## G1 — `userEmails` table is required by auth and absent from the schema — **BLOCKER**
**Owner: `SCHEMA.md` (add the table) + `auth-onboarding.md` (align).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R1/G1; `SCHEMA.md` §3.1.1 is normative.

`auth-onboarding.md` §6.7 defines `convex/schema/userEmails.ts` and then depends on it in §11.4
(`applyEmailLink` steps 3–6), §11.5 (`claimLegacyAccount` reads `by_userId_and_deletedAt`), §12.7
(`purgeUser` step 3), and the public `myEmails` / `setPrimaryEmail` / `removeEmail` functions in §8.
`SCHEMA.md` §2.1 lists 33 application tables and `userEmails` is not one of them; instead
`userProfiles.emailNormalized` + `by_emailNormalized` models **one** address per account.

The two models are not compatible: the whole point of `userEmails` is that an Apple private-relay user,
a Kakao-no-consent user, and a legacy user with a dead university address need to prove **several**
addresses to reach their legacy data (§11.4 exists solely for this). A single `emailNormalized` column
cannot express it, and `claimLegacyAccount`'s server-side re-verification ("is this candidate reachable
from an address the caller has PROVEN") has nothing to read.

**Proposal.** Add `userEmails` to `SCHEMA.md` §3 with the schema-wide conventions applied:
`{userId: v.id('users'), emailNormalized: v.string(), emailRaw: v.string(), verifiedAt: v.number(),
source: v.union('OTP','GOOGLE','APPLE','KAKAO','LINK'), isPrimary: v.boolean(), ...timestamps,
...softDelete, ...legacyTrailer}` with `.index('by_emailNormalized_deletedAt', ['emailNormalized',
'deletedAt'])`, `.index('by_userId_deletedAt', ['userId', 'deletedAt'])` and `.index('by_legacyKey',
['legacyKey'])`. Keep `userProfiles.emailNormalized` as the **denormalized primary** (it is what the
merge probe and the migration claim read in one indexed hop) and add a §6 denormalization-register row
naming `setPrimaryEmail` / `applyEmailLink` as its only writers and a nightly
`PRIMARY_EMAIL_MIRROR_CHECK` as its repair. This is 34 tables, still far inside every budget.

## G2 — `userProfiles` is defined twice, incompatibly; the auth callback's insert would fail validation — **BLOCKER**
**Owner: `auth-onboarding.md` §7 (delete its copy and point at `SCHEMA.md` §3.1).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R1/G2; one schema and one complete insert helper.

`auth-onboarding.md` §6.1's `afterUserCreatedOrUpdated` inserts:

```ts
await db.insert('userProfiles', {
  userId, displayName, avatarUrl, locale: 'ko', onboardingStep: 'handle',
  appearance: 'system', pushEnabled: true, legacyClaimState: 'none', updatedAt: Date.now(),
});
```

Against `SCHEMA.md` §3.1 this insert is **rejected**, because these required fields are missing:
`bio`, `phone`, `preferredCurrency`, `preferredTimeZone`, `preferredWeekStartsOn`,
`notifyLedgerActivity`, `notifyComments`, `notifyInvites`, `appRole`, `isPlaceholder`,
`avatarMigrationState`, `avatarAttempts`, `createdAt`. And `appearance: 'system'` is invalid —
`appearanceValidator` is `'SYSTEM' | 'LIGHT' | 'DARK'`. Further name drift: auth's `defaultCurrency`
vs schema's `preferredCurrency` (the `currentUser` query in §8.1 returns `defaultCurrency`);
auth's `locale` default `'ko'` vs `money-categories-i18n.md` §3.1's `DEFAULT_LOCALE = 'en'`.

**Proposal.** Delete the `userProfilesTable` / `userHandlesTable` / `appleRefreshTokensTable` /
`emailLinkCodesTable` / `legacyUsersTable` / `authAuditTable` definitions from `auth-onboarding.md` §7
and replace them with a one-line pointer to `SCHEMA.md` §3.1–3.3 / §3.18. Rewrite the §6.1 insert as a
single `newUserProfileDefaults(userId, user)` helper in `convex/lib/userProfiles.ts` that returns a
complete `Omit<Doc<'userProfiles'>, '_id' | '_creationTime'>` — so the required-field list lives in one
place and adding a field is a compile error rather than a runtime rejection. Rename `defaultCurrency` →
`preferredCurrency` in the `currentUser` return validator, and uppercase the appearance literals.

## G3 — Three tables are referred to by two different names each — **BLOCKER**
**Owner: `auth-onboarding.md`, `money-categories-i18n.md`, `calendar-component.md`.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R1/G3; every affected subsystem doc uses SCHEMA names.

| `SCHEMA.md` (authoritative) | Also called | Where |
|---|---|---|
| `ledgerItems` | `entries` | `auth-onboarding.md` §6.5 disposable probe, §11.3 `reparentBatch` ORDER, §18 open question 6 |
| `itemComments` | `entryComments` | same |
| `itemPhotos` | `entryPhotos` | same |
| `ledgerDayRollups` | `dailyRollups` | `calendar-component.md` §7.5 query + index `by_ledger_day`; `money-categories-i18n.md` §1.6 |
| `ledgerMonthRollups` + `ledgerCategoryMonthRollups` | `monthlyRollups` (one table with optional `categoryKey`) | `money-categories-i18n.md` §1.6 |
| `migrationAnomalies` | `migrationIssues` | `money-categories-i18n.md` §1.9 step 5, §2.6 step 6 |
| `appAnnouncements` (one table, `kind: NOTICE\|FAQ`) | `announcements` + `faqs` (two tables) | `money-categories-i18n.md` §3.2, §3.9 step 5 |
| `ledgers.baseCurrency` | `ledgers.currency` | `sharing-invites.md` §5.1, §4.6 |
| `ledgerStats` (deleted in `SCHEMA.md` §2.1) | still read | `money-categories-i18n.md` §1.8 (`ledgerStats.itemCount === 0`) |

`money-categories-i18n.md` §1.6's single `monthlyRollups` with an optional `categoryKey` is not a naming
nit: `SCHEMA.md` §3.13 argues at length that one table cannot satisfy the calendar's, the donut's and
the trend's three mutually exclusive field orders, and §9 row 12 rejects it explicitly.

**Proposal.** Do one mechanical pass over `auth-onboarding.md`, `money-categories-i18n.md` and
`calendar-component.md` replacing every name in column 2 with column 1, and replace
`money-categories-i18n.md` §1.6's rollup table block with a pointer to `SCHEMA.md` §3.13. Replace
`ledgerStats.itemCount === 0` in §1.8 with the `SCHEMA.md` §4.3 probe
(`ledgerItems.by_ledgerId_deletedAt_dayKey_occurredAt` `.first()` returns `null`). Add a CI grep in
`scripts/lint-docs.ts` that fails when a design document mentions a table name that is not a key of
`convex/schema.ts` — the same trick that makes the index-name lint work.

## G4 — Field names differ between `sharing-invites.md` and `SCHEMA.md` on every shared table — **BLOCKER**
**Owner: `sharing-invites.md` §5 (rewrite against `SCHEMA.md` §3.5–3.8).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R1/G4; duplicate table blocks became SCHEMA pointers.

| `SCHEMA.md` | `sharing-invites.md` | Table |
|---|---|---|
| `deletedAt` / `deletedByUserId` + `endReason` | `removedAt` / `removedBy` | `ledgerMembers` (§5.2, and §2.7 step 9, §4.1 trigger, §4.3, §5.7 `requireLedgerRole`) |
| `invitedByUserId` | `invitedBy` | `ledgerMembers` |
| `createdByUserId` | `createdBy` | `ledgerInvites` |
| `revokedByUserId` | `revokedBy` | `ledgerInvites` |
| `inviteeEmailNormalized` | `inviteeEmail` | `ledgerInvites` (+ index name) |
| `decidedByUserId` | `decidedBy` | `ledgerJoinRequests` |
| `actorUserId` / `createdAt` | `actorId` / `at` | `ledgerAuditLog` |
| `colorKey` (token union) | `color: v.number()` | `ledgers` (+ `invites.preview` return type §2.5) |
| `baseCurrency` | `currency` | `ledgers` |
| `description: v.string()` (required, `''`) | `description: v.optional(v.string())` | `ledgers` |
| `authorId` | `createdBy` | `ledgerItems` (§1.2 prose, §5.7 `canEditItem`) |

`sharing-invites.md` §5.7's `canEditItem` reads `item.createdBy`, which does not exist — `SCHEMA.md`
§3.10 has `authorId`. This is the function that implements permission-matrix rows #4/#5, i.e. the single
most-called authorization branch on the write path.

**Proposal.** Rewrite `sharing-invites.md` §5.1–§5.6 as pointers to `SCHEMA.md` §3.5–§3.8 (keep only
the *rationale* prose, delete the duplicated `defineTable` blocks — duplicated schema is how this drift
happened), and fix the field references in §2.5, §2.7, §4.1, §4.3 and §5.7 in place. `canEditItem` must
read `item.authorId`.

## G5 — Two index-naming grammars, one of them lint-enforced — **BLOCKER**
**Owner: `auth-onboarding.md` §7 and `sharing-invites.md` §5 (adopt `SCHEMA.md` §1.2).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R1/G5; mapping published and subsystem references aligned.

`SCHEMA.md` §1.2 mandates `by_ + fields.join('_')` and §7.8 check 1 **fails the build** on anything else,
with a stated reason (`_and_` overflows the 64-char index-name limit on the five-field item indexes and
is not mechanically derivable). `auth-onboarding.md` §7 and `sharing-invites.md` §5 both declare
"index grammar is note 09 §3.1: `by_<a>_and_<b>`" and then use it everywhere:
`by_userId_and_clientId`, `by_emailNormalized_and_claimState`, `by_userId_and_createdAt`,
`by_ledger_and_user`, `by_ledger_and_removed_and_role`, `by_invite_and_user`,
`by_status_and_expiresAt`, `by_inviteeEmail_and_revoked`, …

`sharing-invites.md` additionally abbreviates the field (`by_ledger_and_user` for
`['ledgerId','userId']`), which the lint cannot repair automatically.

**Proposal.** Mechanical rename in both documents. Publish the mapping table in the same commit so the
function-inventory tables (`sharing-invites.md` §5.8, which cites index names in every row) stay
readable. Add check 1 of `scripts/lint-schema.ts` to CI **before** the first schema file lands, so this
class of drift is impossible after today.

## G6 — Three incompatible rules for changing a ledger's currency — **BLOCKER (money-correctness)**
**Owner: `SCHEMA.md` §7.3 is right; `sharing-invites.md` and `money-categories-i18n.md` must yield.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R2/G6; empty-ledger patch or migrated-ledger one-time
`confirmCurrency` only. Populated non-migrated re-denomination is deferred to v2.

| Document | Rule |
|---|---|
| `SCHEMA.md` §7.3 rule 6/7 | `baseCurrency` is **immutable** once the ledger holds a non-deleted item. One hole: `ledgers.confirmCurrency`, permitted **only while `currencyIsAssumed === true`**, which **re-derives** `amountMinor` from `legacyRealAmount` at the confirmed exponent and then runs `ROLLUP_REBUILD`. |
| `sharing-invites.md` §1.4 row 22 + §4.6 + §5.8 `ledgers.mutations.setCurrency` | OWNER may change it **at any time**; "existing items untouched … a ledger that switches KRW→JPY renders history in KRW and new rows in JPY, with a divider in the list". |
| `money-categories-i18n.md` §1.8 | Free change while empty; otherwise an explicit `CURRENCY_REBASE`-style migration at **one user-supplied rate**, stored in a `ledgers.baseCurrencyMigration` object field that does not exist in `SCHEMA.md`. |

The sharing-invites version is the dangerous one. `SCHEMA.md` §3.13's rollup contract is "all money is
`baseAmountMinor`, i.e. the ledger's baseCurrency; a rollup row is NEVER a multi-currency sum". If the
base currency changes and old items keep their own, every pre-change rollup row is denominated in the
old currency and every post-change row in the new, and the month header sums them. That is exactly the
legacy defect (`02` §6) the rewrite exists to kill.

**Proposal.** Delete `ledgers.mutations.setCurrency` from `sharing-invites.md` §5.8 and change
permission-matrix row 22 to read **"통화 확정 (`ledgers.confirmCurrency`, migrated ledgers only, once)"**
— OWNER, hard confirm, audit `CURRENCY_CONFIRMED`, permitted only while `currencyIsAssumed === true`.
Delete §4.6's "renders history in KRW and new rows in JPY" paragraph. In
`money-categories-i18n.md` §1.8, keep only the empty-ledger case (a single `patch`, gated on the
`.first()` emptiness probe) and replace the `baseCurrencyMigration` object with `SCHEMA.md`'s
`maintenanceLock: 'CURRENCY'` + a `CURRENCY_REBASE` row in `maintenanceJobs`. A genuine
KRW→JPY re-denomination on a populated non-migrated ledger is then explicitly **not supported in v1**;
say so, and add it to `SCHEMA.md` §10 as a v2 seam whose exact change is "allow `confirmCurrency` a
second gate keyed on an admin flag".

## G7 — Three incompatible rules for inferring a legacy item's `type`, and the measured data contradicts two of them — **BLOCKER (data correctness)**
**Owner: `SCHEMA.md` §8.4 (already closest); `money-categories-i18n.md` §1.9 and §2.6 must yield.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R2/G7; `sign(realAmount)` is authoritative, with the
measured 25,895 expense / 8,903 income import counts locked into the migration verification contract.

| Document | Rule |
|---|---|
| `research/15` (measured) | "`type` comes from `sign(realAmount)`, **NOT** from `category.category` — that field exists on only **1,090 of 34,799** items." Measured: 25,895 negative, 8,903 positive, **0 zeros**. |
| `SCHEMA.md` §8.4 | `realAmount < 0 → EXPENSE`, `> 0 → INCOME`, `=== 0 → category.category === 1 ? INCOME : EXPENSE` + `ZERO_AMOUNT` anomaly; a sign/category disagreement is imported **by sign** and flagged. ✅ correct. |
| `money-categories-i18n.md` §1.9 | `category.category` **wins**, sign is the fallback. ❌ inverted. |
| `money-categories-i18n.md` §2.6 STEP 6 | On a kind conflict, "derive `ledgerItems.type` from `PRESET.kind`". ❌ a third rule, and it would silently flip the sign of every item whose user re-purposed a preset. |

**Proposal.** Make `SCHEMA.md` §8.4 the single normative statement and rewrite `money-categories-i18n.md`
§1.9's `type :=` line and §2.6 STEP 6 to defer to it. STEP 6 must be reduced to: *the item's
`categoryKey` follows the preset (the icon the user picked is the strongest signal of which category
they meant), the item's `type` follows the sign, and a disagreement writes an
`AMOUNT_SIGN_CATEGORY_MISMATCH` / `CATEGORY_KIND_CONFLICT` anomaly.* Add a unit test over the real
export asserting `count(type === 'EXPENSE') === 25_895` and `count(type === 'INCOME') === 8_903` —
the numbers are known, so the importer's most consequential branch becomes a regression test. Also drop
the `=== 0` arm of the union from the *cutover gate* rather than the code (0 zeros measured, so the arm
is dead but harmless).

## G8 — The Calendar computes day keys in the **device** timezone; the schema computes them in the **ledger** timezone — **BLOCKER**
**Owner: `calendar-component.md` §2.1, §4.3, §7.5, open question 5.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R3/G8; every BooKoo grid, selected-day query, marker,
and “today” key uses `ledgers.timeZone`, with `ledgers.weekStartsOn` passed explicitly.

`calendar-component.md` §2.1: *"`CalendarDateKey` … ALWAYS `yyyy-MM-dd`, zero-padded, **in the
DEVICE-LOCAL calendar**"*, and open question 5 resolves the conflict as *"`dailyRollups.dayKey` is
documented as 'in the ledger's tz'. **For v1: device-local.**"*

`SCHEMA.md` axiom **P6** and §7.2 make the opposite a hard structural rule, and
`money-categories-i18n.md` §4.3 spends a page arguing it is "not negotiable". They are right: a member
in Los Angeles opening a Seoul household ledger would see the grid's `2026-08-31` cell fetch the rollup
row for `20260831` — a day that, for that ledger, contains transactions the LA member would place on
`2026-08-30`. The dots, the day subtotals and the tapped-day list would all be off by one for the
travelling member, silently.

**Proposal.** cpk-ui's `<Calendar>` stays timezone-agnostic (correct — a UI kit must not own a ledger
concept), but the *contract* changes from "device-local" to **"the grid is built from the `month` key
and `weekStart` props by pure integer arithmetic; the caller decides what timezone those keys mean."**
Concretely: (a) delete the words "in the DEVICE-LOCAL calendar" from §2.1 and replace them with "in
whatever calendar the caller's keys are expressed in — the component never calls `new Date()` except
through the injectable `today` prop"; (b) `<LedgerCalendar>` (§7.5) computes `today` as
`dayKeyToISO(toDayKey(Date.now(), ledger.timeZone))` and passes it in, so "today" is the ledger's today;
(c) `onChange(date, key)` hands the app a ledger-tz day key which converts to an integer `dayKey` at
the Convex argument boundary; (d) resolve open question 5 as **ledger tz, v1**, and add a test to §8
that runs the wrapper under `TZ=America/Los_Angeles` against an `Asia/Seoul` ledger and asserts the
month-boundary cell maps to the Seoul `dayKey`.

## G9 — The `<LedgerCalendar>` reference implementation contains a money bug and queries a schema that does not exist — **BLOCKER**
**Owner: `calendar-component.md` §7.5.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R3/G9; canonical `rollups.daysInRange` reads
`ledgerDayRollups.by_ledgerId_dayKey_shard`, sums all shards server-side, and formats the base-currency
minor-unit total through `formatMoney` without a hard-coded exponent.

Four concrete defects in one 80-line code block:

1. `money.format(net / 100)` hard-codes exponent 2. For KRW and JPY — the two currencies the actual user
   base uses — this renders **₩120** for a ₩12,000 day. `money-categories-i18n.md` §1.2 exists precisely
   to stop this; the correct call is `formatMoney({amountMinor: net, currency: ledger.baseCurrency},
   locale)`.
2. It queries `dailyRollups` / `by_ledger_day` / `api.rollups.dayMarkers`. The schema has
   `ledgerDayRollups` / `by_ledgerId_dayKey_shard` / `api.rollups.daysOfMonth` (G3).
3. It **does not sum shards.** `SCHEMA.md` §1.8 rule 1 makes `shard` the last index field precisely so
   readers range the prefix and sum in JS. With `ROLLUP_SHARD_COUNT = 1` the code happens to work; the
   day `ROLLUP_SHARD_COUNT` is raised per §5.4 it silently renders one shard's partial total. This is
   the exact bug `SCHEMA.md` §9 row 3 rejects proposals A and C for.
4. `weekStart={0}` is hard-coded, while `SCHEMA.md` §7.2 and `money-categories-i18n.md` §4.3 rule 6 make
   `weekStartsOn` a **ledger** property (so the grid matches for every member) and
   `calendar-component.md` C2 makes the prop locale-defaulted.

**Proposal.** Rewrite §7.5's query block against `SCHEMA.md` §3.13 + §4 row 2: `rollups.daysOfMonth({
ledgerId, fromDayKey, toDayKey })` reading `by_ledgerId_dayKey_shard`, summing shards into a
`Map<dayKey, {expenseMinor, incomeMinor, itemCount}>` server-side, `.take(DAY_ROLLUP_SCAN_LIMIT = 400)`.
Replace `money.format(net / 100)` with `formatMoney`. Pass `weekStart={ledger.weekStartsOn}`. Add the
shard-summing assertion to the §8 test list so the bug cannot come back when the constant is raised.

## G10 — Bundle identifier and deep-link path disagree between the docs and the shipped scaffold — **BLOCKER**
**Owner: `auth-onboarding.md` §4/§5, `sharing-invites.md` §2.1/§2.4.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R4/G10; native id
`dev.hyodotdev.bookoo`, Apple Services ID `dev.hyodotdev.bookoo.web`, and public invite path
`https://bookoo.hyo.dev/invite/<code>` now match the shipped scaffold, AASA, Android, and router.

- `DECISIONS.md` §7 and the live `app.config.ts` use **`dev.hyodotdev.bookoo`**.
  `auth-onboarding.md` §4 sets `const BUNDLE_ID = 'dev.hyo.bookoo'`, §5.1 gives
  `EXPO_PUBLIC_APPLE_SERVICE_ID` as `dev.hyo.bookoo.web`, and §5.2 gives `APPLE_BUNDLE_ID` as
  `dev.hyo.bookoo`. These are the **`aud` values Apple ID tokens are verified against** — a wrong value
  is not cosmetic, it is "Sign in with Apple returns `error.auth.apple.aud` for 100 % of users".
- `sharing-invites.md` §2.1 defines the link as `https://bookoo.hyo.dev/i/BK1-…` with
  `pathPrefix: '/i'` and an AASA `paths: ["/i/*"]`; the live `app.config.ts` ships
  `pathPrefix: '/invite'`. The Universal Link would not resolve.
- `auth-onboarding.md` §4's `app.config.ts` block also omits `associatedDomains` and `intentFilters`
  entirely, so a reader who follows it loses invite links.

**Proposal.** Global replace `dev.hyo.bookoo` → `dev.hyodotdev.bookoo` and `dev.hyo.bookoo.web` →
`dev.hyodotdev.bookoo.web` throughout `auth-onboarding.md`; pick one path prefix (recommend `/invite`,
matching the shipped scaffold and reading better in a KakaoTalk message) and change
`sharing-invites.md` §2.1/§2.4/§6 row 20 and the AASA `paths` to match; merge the two `app.config.ts`
blocks into one that the live file is diffed against in CI (a 20-line jest test that imports
`app.config.ts` and asserts `ios.bundleIdentifier`, `scheme`, `associatedDomains` and the intent filter
is cheap and stops this permanently).

## G11 — Four roles are defined; one document uses a fifth name that does not exist — **BLOCKER**
**Owner: `money-categories-i18n.md` §2.5.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R4/G11; the only roles are
`OWNER | ADMIN | MEMBER | VIEWER`, with rank-minimum guards. Category create is MEMBER+; shared taxonomy
management is ADMIN+.

`money-categories-i18n.md` §2.5 gates every category mutation on
`requireLedgerRole(ctx, ledgerId, ['OWNER', 'EDITOR'])`. `EDITOR` is not a role —
`sharing-invites.md` §1.1 and `SCHEMA.md` §3.6 define `OWNER | ADMIN | MEMBER | VIEWER`. The helper
signature also differs: `sharing-invites.md` §5.7's is
`requireLedgerRole(ctx, ledgerId, minimum: LedgerRole, opts?)` — a **rank minimum**, not an array.

Worse, the *permission* it encodes contradicts the matrix. `sharing-invites.md` §1.4 row 10 says
**MEMBER** may add a category (additive, low blast radius) and row 11 says rename/delete/reorder is
ADMIN+. `money-categories-i18n.md` grants all five mutations to the same set.

**Proposal.** Rewrite §2.5's permission line as: `create` → `requireLedgerRole(ctx, ledgerId, 'MEMBER')`;
`reorder` / `rename` / `setHidden` / `archive` → `requireLedgerRole(ctx, ledgerId, 'ADMIN')`. Note that
`materialize()` is called by `create`, so a MEMBER's first custom category materializes the overlay —
that is intended and should be stated. Add rows 10/11 of the matrix to the §5.8-style function
inventory so the guard and the matrix are checked against each other in review.

## G12 — `convex/crons.ts` is specified three times with disjoint job lists — **BLOCKER**
**Owner: `SCHEMA.md` §6.1 (make it the union).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R4/G12; `SCHEMA.md` §6.1 is the single eleven-job
registry, including join-request expiry at 16:00 UTC and stale-unverified-user purge at 23:00 UTC.

| File | Jobs |
|---|---|
| `SCHEMA.md` §6.1 | repair rollups (hourly), repair counters, purge soft-deleted, purge ledgers, purge accounts, expire invites, purge audit feed, sweep orphan uploads, copy legacy blobs — **9** |
| `auth-onboarding.md` §8.6 | purge expired accounts, **purge stale unverified users** — 2 |
| `sharing-invites.md` §5.8 | **expire join requests**, gc invites, purge ledgers, repair member counts — 4 |

Two jobs exist in only one document and are genuinely required:
**`purgeStaleUnverifiedUsers`** (auth §3.5 [lib-verified]: `@convex-dev/auth` creates a `users` row at
OTP *request* time, so anyone who can type an address mints rows — without this cron the `users` table
is an open write endpoint) and **`expireJoinRequests`** (`ledgerJoinRequests.expiresAt` and the
`by_status_expiresAt` index exist in `SCHEMA.md` §3.7 with nothing scheduled to read them, so `PENDING`
rows never become `EXPIRED` and the 14-day promise in `sharing-invites.md` §3.3 is unimplemented).

**Proposal.** Make `SCHEMA.md` §6.1 the single, complete cron file — 11 jobs — and replace the other two
blocks with pointers. While merging, resolve the naming collision (`purge accounts` ≡
`purgeExpiredAccounts`, `purge ledgers` ≡ `purgeLedgers`, `expire invites` ≡ `gcInvites` +
`INVITE_USECOUNT_REPAIR`) and re-check the `hourUTC` spread — `SCHEMA.md` deliberately staggers
17:00–22:00 UTC and the two new jobs need slots (suggest 16:00 for `expireJoinRequests`, 23:00 for
`purgeStaleUnverifiedUsers`).

## G13 — `convex/lib/rateLimits.ts` is specified twice with disjoint buckets and two different component versions — **BLOCKER**
**Owner: a new merged block; put it in `SCHEMA.md` §2.2 or a shared appendix.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R4/G13; `SCHEMA.md` §2.2 owns one exact-pinned
`@convex-dev/rate-limiter@0.3.2` component and all sixteen buckets. Handle availability remains an
unlimited query; claim and rename writes are limited.

`auth-onboarding.md` §15 declares `otpRequestPerEmail`, `otpRequestGlobal`, `handleClaim`,
`handleRename`, `emailLinkRequest`, `emailLinkConfirm`, `accountLink`, `legacyClaim`,
`deletionRequest`, and pins `@convex-dev/rate-limiter@^0.2.0`. `sharing-invites.md` §2.8 declares
`inviteCreate`, `inviteCreateDaily`, `inviteRedeem`, `joinRequestCreate`, `ledgerMemberChurn`, and pins
`@convex-dev/rate-limiter@0.3.2`. Each block is a complete `new RateLimiter(components.rateLimiter,
{...})` — instantiating either one drops the other's buckets, and `rateLimiter.limit(ctx, 'inviteRedeem')`
would be a type error in the auth version.

`SCHEMA.md` §2.2 additionally lists a use the other two do not: **feedback and content reports**, and
**handle-availability probes** — but `auth-onboarding.md` §15 explicitly says
"`checkHandleAvailability` is deliberately left unlimited". Contradiction inside the contradiction.

Neither version is in `package.json` (G45).

**Proposal.** One `convex/lib/rateLimits.ts` with all 14 buckets plus `feedbackSend` and
`reportCreate`; one pinned version verified against `convex@1.45.0`'s peer range and added to
`package.json`. Resolve the handle-probe question in favour of `auth-onboarding.md` (unlimited, because
a query cannot write and the real abuse is in the claim) and **fix `SCHEMA.md` §2.2's comment**, which
currently justifies mounting the component partly on the strength of that limit.

## G14 — The `memberCount` and single-OWNER invariants have two mechanisms each — **BLOCKER**
**Owner: `SCHEMA.md` §6 (rows 6 and 7) vs `sharing-invites.md` §4.1/§4.6.**

**Resolved 2026-08-24:** `RECONCILIATION.md` R4/G14; membership mutations maintain `memberCount`
exactly once in-transaction and migration P3 patches the exact total. Ownership-changing mutations assert
the single live OWNER mirror in-transaction; nightly jobs verify both invariants. Membership triggers are
discarded independently of the still-open rollup-trigger spike.

`sharing-invites.md` §4.1 ships a `convex-helpers` **trigger** on `ledgerMembers` that maintains
`ledgers.memberCount`, and §4.6 ships a **trigger** that asserts "exactly one active OWNER row equal to
`ledgers.ownerId`" and aborts the mutation. `SCHEMA.md` §6 row 6 assigns `memberCount` to the five
membership *mutations* with a nightly `MEMBER_COUNT_REPAIR`, and row 7 assigns the OWNER invariant to a
nightly `OWNER_INVARIANT_CHECK` that **alerts and deliberately does not self-heal**, plus an in-mutation
assertion (§5.1 `members.setRole`).

These are not equivalent. A trigger fires on `invites.redeem`'s membership insert *and* on the
migration's 2,184 membership inserts — `SCHEMA.md` §5.1 explicitly says the migration does **not** fire
the rollup trigger, and a `memberCount` trigger firing 2,184 times while P3 also "patches `memberCount`
per ledger" (§8.7) double-counts every migrated ledger.

Compounding this: `SCHEMA.md` §10.1 open item 2 says `convex-helpers/server/triggers` is **unproven in
both reference repos** and must be decided *before the first rollup mutation is written* — yet
`sharing-invites.md` already depends on triggers for two invariants and `SCHEMA.md` §3.13 depends on
them for all three rollups.

**Proposal.** Decide triggers **first** (a one-day spike: register a trigger on a scratch table in a dev
deployment, confirm it fires inside the mutation transaction and that a throw aborts). Then: if triggers
are adopted, `SCHEMA.md` §6 rows 6/7 change owner to "the `ledgerMembers` trigger" and P3 stops patching
`memberCount` (the trigger does it); if not, delete the trigger blocks from `sharing-invites.md` §4.1/§4.6
and keep the mutation-maintained version. Either way the migration passes must be explicitly excluded —
add a `migrationMode` flag to the trigger wrapper, or have P3 insert through the raw mutation.

## G15 — Category icons: two incompatible decisions, and the preset key casing differs — **BLOCKER**
**Owner: `money-categories-i18n.md` §2.3/§2.4 (yield to `design/category-icons.md`).**

**Resolved 2026-08-24:** `RECONCILIATION.md` R2/G15; cpk-ui `IconName` values only, camelCase app
slugs plus separate uppercase `legacyStringKey`, and no category PNG/SVG/MCI asset pipeline.

`design/category-icons.md` is headed **AUTHORITATIVE**, is the newest design file, and decides: use
cpk-ui's bundled 3,771-glyph Phosphor font, ship **no** category assets, store an icon **name** that must
be a member of cpk-ui's `iconList` union. `money-categories-i18n.md` §2.4 evaluates that as option B and
**rejects** it, choosing option C (re-trace 34 PNGs as SVG, compile with SVGR into
`src/components/icons/generated/*.tsx`, dispatch on a `'bk:' | 'mci:'` namespace).

The `SYSTEM_CATEGORIES` array in §2.3 therefore carries fields the authoritative decision makes dead
(`iconKey: 'bk:meal'`, `mciFallback`, `legacyAsset`) and is missing the one it needs (the cpk-ui icon
name). `SCHEMA.md` §3.9 sides with §2.4 (`iconKey: 'bk:meal' | 'mci:car-wrench'`), and
`money-categories-i18n.md` §2.5's `assertIconKeyAllowed` validates against a `CUSTOM_ICON_POOL` that has
no definition anywhere.

Second, smaller, but it breaks the join: `category-icons.md` keys the presets `CAFE`, `MEAL`, `SALARY`
(the legacy `STRINGS.js` keys); `money-categories-i18n.md` §2.3 keys them `cafe`, `meal`, `salary`
(camelCase slugs) and states the key is "the migration identity" and the i18n key suffix
(`t('category.' + key)`). `ledgerItems.categoryKey` stores this string on 34,799 rows — pick once.

**Proposal.** Adopt `category-icons.md` wholesale. Rewrite `money-categories-i18n.md` §2.3's array to
`{key, kind, icon: CpkIconName, colorToken, legacyIconId, legacyStringKey, sortOrder}` — dropping
`iconKey`/`mciFallback`/`legacyAsset` — and delete §2.4 entirely, replacing it with a pointer. Keep
**camelCase slugs** as `key` (they are the i18n suffix and read correctly in `category.meal`), and add
the `legacyStringKey` column (`MEAL`) which is what `category-icons.md`'s table is really keyed on, so
both tables join. Update `SCHEMA.md` §3.9's `iconKey` comment and validator to "a member of cpk-ui's
`iconList`". Delete `assertIconKeyAllowed`'s `CUSTOM_ICON_POOL` in favour of the `iconList` union
(a typo becomes a compile error, which is the stated benefit).

---

# PART B — Defects inside a single document

## G16 — `scripts/lint-schema.ts` check 3 would fail the schema it is written to enforce — **BLOCKER**
**Owner: `SCHEMA.md` §7.8.**

Check 3 reads: *"Every table whose fields include `deletedAt` has `deletedAt` at position 2 of every
index whose first field is a tenant key (`ledgerId`, `itemId`, `userId`)."* Applied literally, these
indexes in `SCHEMA.md` §3 fail it:

- `ledgerMembers.by_ledgerId_userId` — **the single most-called index in the app**, position 2 is `userId`
- `ledgerMembers.by_userId_deletedAt` — first field `userId`, position 2 *is* `deletedAt`… but
  `by_ledgerId_deletedAt_role` and `by_joinedViaInviteId` are fine while `by_legacyUid` is not tenant-first, ok
- `ledgerCategories.by_ledgerId_key` and `by_ledgerId_legacyIconId` — the table has `archivedAt`/`hiddenAt`,
  not `deletedAt`, so it escapes by accident rather than by design
- `ledgerMemberState.by_userId_ledgerId` and `by_ledgerId_userId` — no `deletedAt` on the table, escapes
- `userProfiles.by_userId` — has `deletedAt`, first field `userId` → **fails**
- `ledgerItems.by_ledgerId_monthKey` — has `deletedAt`, first field `ledgerId` → **fails**, and §3.10
  comment (6) says it omits `deletedAt` **on purpose** so the repair pass sees soft-deleted rows
- `itemPhotos.by_itemId_deletedAt_order` passes; `notifications.by_ledgerId_createdAt` → **fails**

Checks 7 and 8 have the same problem: check 7 (*"every table with a mutable domain row spreads
`timestamps`; every user-visible one spreads `softDelete`"*) fails on the three rollup tables (they carry
`updatedAt` but no `createdAt`), on `ledgerAuditLog` and `ledgerInviteRedemptions` (append-only,
`createdAt` only), and on `notifications` (declares `deletedAt` inline instead of spreading `softDelete`,
and has no `deletedByUserId`). Check 1 fails on the library-owned `authTables` indexes
(`userIdAndProvider`, `providerAndAccountId`, `email`, `phone`).

**Proposal.** Rewrite §7.8 as a spec with explicit exemptions, because a lint that everybody has to
suppress is worse than no lint: check 1 skips `authTables`; check 3 applies only to indexes marked
`// list` in a machine-readable trailing comment (the doc already distinguishes "list index" from
"lookup index" in prose — make that distinction syntactic, e.g. a `LIST_INDEXES` const per table file, or
name lookup indexes `lookup_*`); check 7 splits into 7a (`createdAt` + `updatedAt` on mutable rows), 7b
(`createdAt` alone on append-only rows, listed), 7c (`softDelete` spread on the eight user-visible
tables, listed). Make `notifications` spread `softDelete` (it gains `deletedByUserId`, which costs
nothing and is genuinely useful for "who dismissed this"). Add `ledgerItems.by_ledgerId_monthKey` to an
explicit `MAINTENANCE_INDEXES` exemption with the §3.10 comment as the reason.

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G16; the exhaustive index and table-lifecycle
manifests make lookup/list/maintenance intent and all exceptions explicit.

## G17 — `ledgerItems` carries two fields for "who last edited this" — **BLOCKER (schema)**
**Owner: `SCHEMA.md` §3.10.**

`SCHEMA.md` §3.10 declares both `lastEditedByUserId: v.optional(v.id('users'))` (in the authorship
block) and `updatedByUserId: v.optional(v.id('users'))` (in the denormalized block). Neither is
documented as different from the other; §4.3 and §6 refer only to `updatedAt`/`updatedByUserId`, and
§3.10's own `authorId` comment explains the *author* semantics but never distinguishes the two edit
fields. `sharing-invites.md` §1.2 refers to a third name, `updatedBy`.

Two fields for one fact is exactly the "two representations of one fact always drift" failure that
`money-categories-i18n.md` §1.3 point 4 diagnoses in the legacy `amount`/`realAmount` pair.

**Proposal.** Delete `lastEditedByUserId`. Keep `updatedByUserId`, document it as *"the last member to
patch this row, whatever they changed; `undefined` means it has never been edited since creation"*, and
add it to the §7.6 `ItemRow` projection so the detail screen can render "수정: @spouse · 2일 전" —
which is a real product answer to the legacy's inability to say who changed an amount.

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G17; `updatedByUserId` is the sole last-editor field.

## G18 — Migration pass P10 imports a reference-carrying table by JSONL, contradicting the document's own rule D7 — **BLOCKER**
**Owner: `SCHEMA.md` §1.3 / §8.7.**

§1.3 states the rule: *"only a JSONL/CSV/ZIP data import can set `_creationTime`, and every
reference-carrying table (`ledgerItems`, `itemComments`, `itemPhotos`, `ledgerMembers`) must go through a
batch mutation, which cannot."* §8.7 then schedules **P10 `bookoo/opinions` → `feedback` as a JSONL
import** — but `feedback.userId: v.optional(v.id('users'))` is a reference, and it must resolve against
`users` rows that P1 created **inside Convex** (their ids are not knowable when the JSONL file is
written). The same objection applies to P0 (`legacyUsers`) only in reverse — P0 is genuinely
reference-free, so it is fine.

**Proposal.** Change P10 to a batch mutation at `IMPORT_BATCH = 300` resolving `legacyUid` →
`userProfiles.by_legacyUid` → `userId`, and set `feedback.createdAt` explicitly (the table already has
an explicit `createdAt` and `legacyCreatedAtDate`, so nothing depends on `_creationTime` and the
`by_status_createdAt` / `by_userId_createdAt` indexes already order on the explicit field). Update §1.3's
parenthetical list of reference-carrying tables to include `feedback`, `ledgerJoinRequests`,
`ledgerInvites` and `ledgerMemberState` — all four are batch-mutation passes in §8.7 and all four carry
`v.id('users')`, so the rule and the pass table finally agree.

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G18; P10 is a reference-resolving batch mutation.

## G19 — `SCHEMA.md` §4.3's unseen-activity design leaks across ledger deletion and archival — **IMPORTANT**
**Owner: `SCHEMA.md` §4.3 / §4 row 1.**

The badge is `newestItem.createdAt > memberState.lastReadAt`, computed by an
`.order('desc').first()` on `ledgerItems.by_ledgerId_deletedAt_createdAt` **per ledger**, ×20 ledgers,
in `ledgers.unseen` (§4 row 1, 21 documents, re-runs once per item write per member). Two problems:

1. §5.5 costs `ledgers.unseen` at **8 re-runs × 21 documents = 168 documents per item write** and then
   proposes, at >20 members, moving it behind a 5-second coalescing window. But the re-run count is
   driven by *ledger count*, not member count: with 20 ledgers each getting occasional writes, this
   single subscription is the most frequently invalidated query in the app and it is mounted on the
   **first screen after launch**.
2. Archived ledgers are still in `ledgerMembers.by_userId_deletedAt` (archive sets `archivedAt`, not
   `deletedAt`), so the badge query fans out over them too and an archived ledger can light up a dot.

**Proposal.** Cap the fan-out at the **pinned + recently-opened** set: `ledgers.unseen` takes an explicit
`ledgerIds: v.array(v.id('ledgers'))` argument capped at 8, chosen client-side from
`ledgerMemberState.sortOrder`/`pinnedAt`, with the rest resolving lazily when the switcher opens.
Exclude `archivedAt !== undefined` in the same pass. State the resulting bound in §4 row 1 (8 + 1
documents) and re-cost §5.5. Keep the 5-second coalescing note as the >20-member mitigation.

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G19; the client supplies at most eight watermarked
targets and the server rechecks live membership and ledger lifecycle (25 documents worst case).

## G20 — The item-write push fan-out is asserted but never specified, and it is the one unbounded action on the hot path — **BLOCKER**
**Owner: a new `design/notifications-push.md`; referenced from `SCHEMA.md` §3.14.**

`SCHEMA.md` §3.14 says, of item creation: *"the PUSH still fires (a scheduled action fanning out over
≤8 devices), preserving the behaviour members actually notice"*, and §5.1 costs `items.create` as
"4 documents (+ a scheduled push action, **0 documents**)". The action is nowhere designed, and it is
not 0 documents: to send it must read `ledgerMemberState.by_ledgerId_userId` (≤200 rows, to honour
`muted` / `notifyNewItem`), then `pushTokens.by_userId_disabledAt` **per recipient** (the one sanctioned
`.collect()`), then `userProfiles` for nothing (the locale is cached on the token row — good). At 8
members and 20 entries/day that is 160 actions/day × ~10 reads = 1,600 reads/day per ledger, plus 160
outbound Expo batches — none of which appears in the §5.5 budget.

Everything else about it is also undecided: which `notificationKind` (there is deliberately none for
items), the `titleKey`/`bodyKey`/`params` (and how a money amount is localized into a push body in the
**recipient's** currency and locale), Android notification channels, the permission-request UX and when
it is asked, `expo-notifications` receipt handling and the `DeviceNotRegistered` → `disabledAt` loop,
deep-link routing on tap (`notifications.route` exists; nothing consumes it), coalescing (20 entries in
one evening = 20 banners), and quiet hours.

**Proposal.** Write `design/notifications-push.md` covering: (1) the `internal.notifications.sendPush`
action signature and its exact read set, with a `PUSH_RECIPIENT_SCAN_LIMIT`; (2) an
`ITEM_ADDED`-shaped **push-only** payload that writes no `notifications` row (preserving §3.14's
decision) and carries `{ledgerTitle, categoryLabelKey, amountMinor, currency}` as params so the body is
rendered per recipient; (3) **coalescing**: at most one item-push per (ledger, recipient) per 10 minutes,
implemented as a `ledgerMemberState.lastItemPushAt` throttle field — this alone removes the worst
UX complaint the legacy had; (4) Android channels (`ledger-activity`, `ledger-social`,
`ledger-governance`) mapped to the notification kinds; (5) the permission ask deferred to the first
ledger join, not first launch; (6) receipt handling and the `disabledAt` write-back; (7) the tap →
`expo-router` deep-link table; (8) an updated §5.5 budget row. Add the resulting reads to `SCHEMA.md`
§5.1's `items.create` row so the cost is honest.

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G20 and `notifications-push.md`; fan-out, coalescing,
receipts, channels, permission timing, routing, and synchronous/asynchronous costs are bounded.

## G21 — `notifications.params` cannot carry money, and the notification kind set is defined twice — **IMPORTANT**
**Owner: `SCHEMA.md` §3.14 vs `sharing-invites.md` §4.2.**

`SCHEMA.md` §3.14: `LEDGER_INVITE`, `JOIN_REQUESTED`, `JOIN_APPROVED`, `JOIN_REJECTED`, `MEMBER_JOINED`,
`MEMBER_REMOVED`, `ROLE_CHANGED`, `OWNERSHIP_TRANSFERRED`, `COMMENT_ADDED`, `LEGACY_CLAIMED`,
`ANNOUNCEMENT`, `SYSTEM`. `sharing-invites.md` §4.2 uses `LEDGER_INVITE_RECEIVED`,
`LEDGER_MEMBER_JOINED`, `LEDGER_JOIN_REQUESTED`, `LEDGER_JOIN_APPROVED`, `LEDGER_JOIN_REJECTED`,
`LEDGER_ROLE_CHANGED`, `LEDGER_MEMBER_REMOVED`, **`LEDGER_MEMBER_LEFT`**, `LEDGER_OWNERSHIP_TRANSFERRED`,
**`LEDGER_ARCHIVED`** — a different prefix convention plus two kinds the union does not contain.

Separately, `params: v.record(v.string(), v.string())` forces a money amount to be stringified at write
time — i.e. in the *sender's* locale and currency, which is precisely the legacy defect
(`01` §8: "notification titles are localized with the sender's language") that
`money-categories-i18n.md` §3.4 point 1 says the new design fixes.

**Proposal.** Make `SCHEMA.md` §3.14's union the authority, add `MEMBER_LEFT` and `LEDGER_ARCHIVED`, and
rewrite `sharing-invites.md` §4.2's kind column to match. Change `params` to
`v.record(v.string(), v.union(v.string(), v.number()))` and add a documented convention: a key ending
`Minor` is an integer amount whose currency is the sibling key `currency`, formatted by the renderer.
Add one line to §7.6: *"no notification field ever holds a rendered sentence or a formatted amount."*

**Resolved 2026-08-24:** `RECONCILIATION.md` R5/G21; `SCHEMA.md` owns one kind union and params carry
raw `string | number` values under the minor-unit/currency convention.

---

# PART C — Legacy features and screens nobody designed

`research/01` §17 is the checklist that says "nothing may be silently dropped". Walking it against the
five design documents:

## G22 — There is no app-shell / navigation / screen design at all — **BLOCKER**
**Owner: a new `design/app-shell-and-screens.md`.**

**Resolved 2026-08-24:** `app-shell-and-screens.md` is the normative G22 acceptance contract and
`client-ia.md` is its detailed route/screen implementation annex. Together they own the complete 60-route
target tree, all 30 legacy-route outcomes, four-tab + add-modal shell, ledger switcher, cpk `isTablet`
phone/tablet contract, per-screen query budgets, and the complete loading/empty/gone/error/offline state
model. Entry create/edit now fixes the minor-unit keypad and SDK-57 date picker, keeps sensitive drafts
out of MMKV, saves the primary item before photo work, claims each POST-returned storage id, attaches
original/thumbnail pairs atomically, retries per tile, and never fabricates a Convex document id.

The earlier proposed `inFlightStorageId`-before-POST flow was impossible: Convex returns a storage id
only from the upload POST, not from `generateUploadUrl`. `SCHEMA.md` §5.1/§7.5 now owns the corrected
POST → `files.claimUpload` → `photos.attach` protocol and two bounded orphan-GC passes. This G22 closure
assigned route seams; D3 subsequently closed G23–G31 in `legacy-feature-contracts.md`, and D4 closed the
legal/privacy/private-media seams in `privacy-and-compliance.md` and `release-and-store.md`.

## G23 — The pinch-zoom photo viewer with save-to-device and delete is unowned — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md`.**

`01` §5.31 marks this **"Preserve (explicitly called out)"**, and the task brief names it. `SCHEMA.md`
supplies `itemPhotos` and two queries (§4 rows 8 and 13) and stops there. Nothing chooses the gallery
library (`01` §11 suggests `react-native-awesome-gallery` or
`@likashefqet/react-native-image-zoom` + `react-native-pager-view` — none installed), nothing designs
save-to-device (`expo-media-library` was installed by R6, but its screen/config/permission contract is
still unowned; the legacy downloaded into an invisible sandbox directory, which is a bug to fix, and
saving needs `NSPhotoLibraryAddUsageDescription` +
`WRITE_EXTERNAL_STORAGE`/`READ_MEDIA_IMAGES` copy in five locales), and nothing designs delete-in-edit
mode against the `photos.detach` mutation.

**Proposal.** One section: `react-native-awesome-gallery` (or Reanimated + gesture-handler directly,
since both are already dependencies and Skia is present) inside an `expo-router` modal route
`app/item/[id]/photos/[index]`; `expo-image` with `blurhash` placeholders driven by
`itemPhotos.blurhash`; save via `expo-media-library.saveToLibraryAsync` after a permission ask with a
five-locale usage string in `assets/langs/meta/*.json`; delete → `photos.detach` with an
optimistic splice and the confirm dialog. R6 already supplied the package; D3 must finish its config and
runtime UX.

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G23 and `legacy-feature-contracts.md` §2. The viewer is
cpk `PinchZoom` inside SDK-pinned `react-native-pager-view`, with no gallery dependency. Save uses a
cache download, action-time write-only photo permission, and SDK 57 `MediaLibrary.Asset.create`; all
five native locale files contain the add-to-library string. Edit-authorized detach owns delete.

## G24 — Location capture and the read-only map are unowned — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md` + a privacy note.**

`SCHEMA.md` §3.10 models `place: {label, lat, lng, address?, countryCode?}` and §8.4 migrates it, and
`research/15` measures location on 239 of 34,799 items (0.7 %) and says it "does not deserve first-class
UI investment in v1". But *some* answer is required, and the pieces are missing: `expo-location` is not
installed, no map library is installed, no permission copy exists, and — the part that matters —
**collecting precise location in Korea requires separate, revocable consent under PIPA** and a
`NSLocationWhenInUseUsageDescription` in five locales (the legacy had it English-only).

**Proposal.** Ship the *read* path in v1 and defer the *write* path: migrated `place` renders on the item
detail screen as a label + a static map image (or a plain "open in maps" `Linking` intent, which needs no
dependency at all), and the "attach a location" affordance is behind `appConfig.featureLocationCapture`
(a new flag — the pattern already exists) with `expo-location` added only when it is turned on. Record
the decision, the PIPA consent requirement, and the exact usage strings in the new document. This keeps
0.7 % of a feature from pulling in two dependencies and a consent flow at launch, without dropping data.

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G24 and `legacy-feature-contracts.md` §3. Measured
locations remain readable as label/address plus system Maps linking. V1 ships no capture route, map or
location SDK, static-map network request, or native location permission. A later capture task must ship
provider, D4 consent, kill switch, and store disclosure as one unit.

## G25 — The donut chart and the 12-month line graph have queries but no design — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md` (a "Statistics" section).**

`SCHEMA.md` §4 rows 6, 7 and 7b give the three queries and their exact document counts, which is the
hard part. Nothing else exists: no chart library decision (`victory-native@41` **and**
`@shopify/react-native-skia@2.6` are both installed and neither design mentions either), no dark-mode
palette for up to 34 category slices (`money-categories-i18n.md` §2.4's `category.*` tokens are named but
the values are "defined twice (light/dark)" without being defined), no legend/percent/"기타" bucketing
rule for the long tail, no empty state, no accessibility answer for a chart (a donut with 34 slices is
unreadable to a screen reader without a data table alternative), and no design for the running-balance
centre label — which `SCHEMA.md` §4.5 splits into two queries specifically so it does not re-read 120
documents per expense, a subtlety a naive implementation will lose.

**Proposal.** Pick `victory-native` XL (it is the higher-level of the two and Skia is its renderer, so
both stay) and write: the donut spec (top N by magnitude, remainder collapsed into `category.other`,
tap → `items.listByCategory` drill-down), the 12-month trend spec (bar or line, `rollups.categoryTrend`,
tappable month → the same drill-down bounded to that month), the balance composition
(`balanceBefore + month.income − month.expense`, computed client-side, never a third query), the 14
`category.*` colour tokens × 2 themes as literal hex values, and the a11y fallback (an
`accessibilityRole="summary"` table behind the chart).

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G25 and `legacy-feature-contracts.md` §4. Victory Native
41 uses its installed Skia renderer; the donut is top seven plus an exact Other bucket, balance composes
the authoritative cold/hot queries, trend is twelve ledger-zone months, and every visual value has a
labelled row/list alternative. The typed fifteen-token palette (including `category.green`) and
contrast tests are executable.

## G26 — In-list search has been narrowed relative to legacy without a UX answer — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md`; the schema decision itself is right.**

Legacy `Tab2` filtered on `realAmount.toString().includes(txt) || category.txt.toLowerCase().includes(txt)`
— amount **substring** and category **name substring**, no memo. The new design
(`SCHEMA.md` §3.10 `search_memo`) indexes **memo full-text** with `amountMinor` as an *exact-equality*
filter field and `categoryKey` as an *exact-equality* filter field, and §3.10 explains persuasively why a
`${memo} ${categoryLabel}` composite must not exist.

So the three legacy behaviours all change: typing `카페` no longer matches items in the Cafe category
(the user's mental model), typing `12` no longer matches `12,000` (substring → exact), and memo is newly
searchable (an improvement). Nobody has designed the replacement UI, so an implementer will ship a search
box that feels broken to every returning user.

**Proposal.** Design the search screen as **query + chips**: a text field bound to `search_memo`, plus a
category chip row (multi-select, driven by the already-subscribed category sidecar, feeding the
`categoryKey` filter field or the `mergedStream` multi-select path of `SCHEMA.md` §7.7 rule 2), a
type toggle, and an "amount is exactly…" chip that appears when the typed string parses as a number.
State in the doc that category *search* is now category *filter*, and that this is deliberate.

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G26 and `legacy-feature-contracts.md` §5. Memo search has
single exact category/type chips. Exact amount is a separate mode/index because Convex full-text search
requires a text expression; it never emulates numeric substring search or filters `ledgerItems` in JS.
Both modes return at most 30 plus a bounded truncation signal.

## G27 — The tutorial/intro and the terms/privacy consent surface are unowned — **IMPORTANT (also legal, see G37)**
**Owner: `auth-onboarding.md` §9 (extend the state machine).**

`01` §5.1/§5.2 describe a 3-slide tutorial and an Intro screen carrying the ToS and Privacy links
(`Linking.openURL` to dooboolab.com — dead URLs for a new listing).
`auth-onboarding.md` §9.1's state machine goes `signed-out → handle → profile → legacy → ledger → done`
with no tutorial and no consent step, and §9.5's table has four rows. `money-categories-i18n.md` §3.2
reserves an `intro` and a `tutorial` i18n namespace and §3.9 collapses `INTRO_FOOTER_TXT1..5` into
`intro.agreementNotice` — so the *strings* are planned and the *screens* are not.

**Proposal.** Add to `auth-onboarding.md` §9: a pre-auth `tutorial` gate keyed on an MMKV
`hasSeenTutorial` flag (not part of `onboardingStep` — it is device state and must not cost a server
round trip), rendered with `react-native-reanimated-carousel` or a horizontal FlashList; and a
**consent block on the sign-in screen** rendering `intro.agreementNotice` with the two links, plus —
for Korea — a separate, explicitly checkable optional-consent row for marketing/push if any is ever
sent. Record the ToS and Privacy URLs (they must exist before the first TestFlight build).

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G27 and `legacy-feature-contracts.md` §6. The three-slide
hero is part of the auth landing and never a route, server step, or MMKV gate; sign-in actions are always
reachable. The agreement/link surface is owned, while exact legal copy, production URLs, and consent
evidence remain explicit D4 release blockers.

## G28 — Announcements / FAQ / feedback have tables and no screens, and no one can author content — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md` + a new "ops console" note.**

`SCHEMA.md` §3.17 models `appAnnouncements` well (bounded `translations` array, `NOTICE`/`FAQ` kinds,
draft via `publishedAt`) and §3.16 models `feedback` with a "my previous messages" index that the legacy
lacked. But: no screen designs; no "new since I last read" mechanism (`SCHEMA.md` §3.17's
`by_kind_publishedAt` comment says *"Is there anything new since I last looked"* with nothing storing
"when I last looked"); `appAnnouncements` has **no `createdByUserId`** and there is no authoring path,
so the stated benefit — "publishing a notice no longer requires an App Store release" — is unreachable;
and the same is true of `appConfig` (force-update thresholds, feature flags, maintenance mode), which a
human must be able to edit under time pressure.

**Proposal.** (a) Add `userProfiles.announcementsReadAt: v.optional(v.number())` (one field, one write per
visit, no new table) and derive the badge from `max(publishedAt) > announcementsReadAt`. (b) Add
`createdByUserId` / `updatedByUserId` to `appAnnouncements`. (c) Decide the authoring surface explicitly:
recommend **`npx convex run` internal mutations plus a seeded JSON file** for v1
(`convex/seed/legacyContent.json` already exists in `money-categories-i18n.md` §3.9 step 5) with an
`appRole: 'ADMIN'` guard, and record "a web admin console is out of scope for v1" — otherwise the
`appRole` enum and the `by_appRole` index are dead weight. (d) Design the three screens (accordion, same
`DoubleListView` shape as legacy, plus a feedback composer with the "my previous messages" list, which
is a genuine improvement over the legacy fire-and-forget).

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G28 and `legacy-feature-contracts.md` §7. Reader queries
and counts are hard-bounded; NOTICE read state is a rendered-`publishedAt` MMKV watermark rather than a
hot profile write. A guarded in-app ADMIN ops route owns five-locale content, app config, and feedback
triage; announcements now audit creator/updater. Seed JSON is initial migration only, not authoring.

## G29 — Currency and language settings screens, and the per-user vs per-ledger split, are unowned — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md`.**

The model is a real behaviour change and nobody has designed how to explain it. Legacy: currency and
language were **one device-level setting** (`AsyncStorage.LOCALE`) that formatted every ledger. New:
`userProfiles.locale` is per-user UI language; `userProfiles.preferredCurrency` only **pre-fills** a new
ledger; `ledgers.baseCurrency` is the authority and is effectively immutable (G6);
`ledgers.timeZone` and `ledgers.weekStartsOn` are ledger-wide too. A returning user who opens
설정 → 통화 and changes it will expect their ledger's numbers to change, and nothing will happen.

**Proposal.** Design the settings tree with the split made visible: a **Profile** section (language,
appearance, default currency for *new* ledgers, handle, linked accounts, emails), a **This ledger**
section reachable from the ledger header (base currency — read-only with a "확정" affordance only when
`currencyIsAssumed`, timezone, week start, salary-cycle `periodStartDay`, colour, policies), and a
**Device** section (app lock, notifications). Add the one-time owner banner
`money-categories-i18n.md` §1.9 step 3 already specifies for migrated ledgers.

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G29 and `legacy-feature-contracts.md` §8. Language is a
per-user UI/server-rendering preference, preferred currency is labelled as a new-ledger default only,
and all existing-ledger accounting/calendar settings remain ledger authority. The assumed-currency
owner/admin banner persists across ledger screens until the one legal confirmation flow completes.

## G30 — Ledger colour theming has no token definition, and `src/theme.ts` is an empty stub containing `any` — **IMPORTANT**
**Owner: `money-categories-i18n.md` (extend §2.4's colour section) or a new `design/theme-tokens.md`.**

`SCHEMA.md` §3.5 turns the legacy `info.color` 0..5 into a token union
(`PINK|ORANGE|YELLOW|TEAL|BLUE|PURPLE`) with the explicit reason *"dark mode needs TWO hex values per
colour so a raw index cannot be the source of truth"* — and then **nobody defines the twelve hex
values**. Same for the 14 `category.*` colour tokens (`money-categories-i18n.md` §2.3 references
`category.red`, `.brown`, `.orange`, `.purple`, `.blue`, `.navy`, `.teal`, `.yellow`, `.slate`, `.pink`,
`.grey`, `.indigo`, `.lime`, `.sky` and §2.4's tail says they are "defined twice (light/dark)" without
defining them). `calendar-component.md` §2.4 is the only place any token table exists, and it covers 13
calendar slots only.

Meanwhile the live `src/theme.ts` is 18 lines, has three social-brand hexes, and declares
`export const light: CpkThemeParams & any = {}` — **an `any`**, which `DECISIONS.md` §6 and
`AGENTS.md` ban and which ESLint's `no-explicit-any` should already be failing.

**Proposal.** Write the token table: 6 ledger accents × {light, dark}, checked for AA contrast against
both `theme.bg.basic` values and against white/black label text (the calendar's `readableTextOn`
helper already exists for the yellow case — legacy `$yellow rgb(238,209,0)` with white text was
unreadable); 14 category colours × {light, dark}; and the `income`/`expense` semantic pair. Fix
`src/theme.ts` to a typed `CustomAppTheme` with no `any`, and add a jest test asserting every token pair
meets 4.5:1 against its intended background — cheap, and it is the only way a 20-token dark palette
stays correct.

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G30 and `legacy-feature-contracts.md` §9. The live theme
is fully typed, contains the complete cpk-compatible light/dark role surface, and has separate six-ledger
accent and fifteen-category mappings (including the preset map's omitted-from-gap `category.green`).
Automated relative-luminance tests enforce AA on every intended
text/canvas pair; components may not carry hex values.

## G31 — Tablet layout is a `DECISIONS.md` requirement with no design — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md`.**

`DECISIONS.md` §5 requires it and names the pattern (Martie's `app/_Tabs/` Mobile/Tablet branch).
`calendar-component.md` §6.2 sketches Tab1 (calendar sidebar + list) and `sharing-invites.md` §7 says
members/invites/requests become two-pane. Everything else — the timeline, stats, item detail, settings,
the ledger switcher, and the breakpoint values themselves — is undesigned, and `app.config.ts` already
sets `supportsTablet: true`, so a tablet reviewer will see phone layouts stretched to 1024pt.

**Proposal.** One section listing, per screen, the phone layout and the ≥768pt layout, using
`useTheme().media` with the `isDesktop → isTablet → phone` test order that `calendar-component.md` §6.1
warns about (the flags are cumulative). Master-detail for timeline+item-detail and members+member-detail;
a persistent ledger rail replacing the drawer; two-column stats. Add the iPad screenshot set to the store
checklist (G44).

**Resolved 2026-08-24:** `RECONCILIATION.md` D3/G31 and `legacy-feature-contracts.md` §10. D1's
three-degree layout covers every D3 screen and `useCPK().media.isTablet` remains the only structural
breakpoint. Phone/tablet share routes, data hooks, permissions, and mutations; the iPad screenshot gate
remains owned by store-release work.

---

# PART D — Cross-cutting concerns with no owner

## G32 — There is no single `AppErrorCode` union, and no client error-handling design — **BLOCKER**
**Owner: `SCHEMA.md` §1.7 says the union is "extended with the ledger codes"; nobody wrote the union.**

`auth-onboarding.md` §7.2 declares a 20-member `AppErrorCode`. `sharing-invites.md` uses
`authError('NOT_FOUND'|'FORBIDDEN', 'error.ledger.*')` plus `OWNER_MUST_TRANSFER` and
`error.invite.roleNotLinkable`, and additionally introduces a **second error style** — a discriminated
`RedeemResult` union returned instead of thrown (§2.7), which is a good decision that nothing else
adopts. `money-categories-i18n.md` uses `invalidInput('error.amountNotInteger')`. `SCHEMA.md` §1.7 adds
`LEDGER_MAINTENANCE`. Two helper names exist (`appError` in auth, `authError` in sharing) in two files
(`convex/lib/errors.ts` vs `convex/lib/permissions.ts`).

Nothing at all designs the **client** side: no error boundary policy (`react-native-error-boundary` is
installed and unused by any design), no toast/inline/dialog decision tree, no retry affordance, no
"what the user sees when a mutation fails", and no offline error copy.

**Proposal.** One `convex/lib/errors.ts` with the complete union (auth's 20 + `LEDGER_NOT_FOUND`,
`LEDGER_FORBIDDEN`, `LEDGER_ARCHIVED`, `LEDGER_MAINTENANCE`, `CANNOT_ACT_ON_PEER`, `CANNOT_GRANT_ROLE`,
`ROLE_NOT_LINKABLE`, `OWNER_MUST_TRANSFER`, `AMOUNT_INVALID`, `CATEGORY_INVALID`, `NOT_A_MEMBER`), one
`appError()` helper, and one rule written down: **expected business outcomes are discriminated-union
return values (the `RedeemResult` pattern); only genuine failures throw.** Then a short
`design/error-handling.md`: an `ErrorBoundary` at the root and one per tab; `ConvexError` payloads
narrowed by `code` into three presentations (inline field error / toast / blocking dialog);
`ACCOUNT_DELETED` and `ONBOARDING_REQUIRED` routed by the router gate, never rendered; a `messageKey`
that is missing from the catalog rendering `error.generic` and logging loudly in dev
(the legacy `getString` returned `'...'` silently).

**Resolved 2026-08-24:** `error-handling.md` owns the result-vs-throw rule, code/context presentation
matrix, retry safety, render boundaries, static i18n rendering, and PII-scrubbed diagnostics.
`shared/appErrors.ts` is the executable single code/key/payload vocabulary with untrusted wire guards and
unit coverage; `convex/lib/errors.ts#appError` is the only server constructor. Ledger permissions now use
ledger-specific codes; non-members deliberately collapse to `LEDGER_NOT_FOUND` rather than the proposed
`NOT_A_MEMBER`, preventing an id-existence oracle. G55's suspension code/gate and G56's duplicate error
helper were resolved in the same contract.

## G33 — Offline behaviour is undesigned, and this is an expense tracker — **IMPORTANT**
**Owner: a new `design/offline-and-caching.md`.**

The only statements anywhere are `auth-onboarding.md` §13.4 (*"Convex's own reconnection handles the
rest — do not build a bespoke offline gate"*) and `DECISIONS.md` §5's "MMKV 캐시 + 낙관적 업데이트".
That covers **reads**. It does not cover the thing users actually do: standing at a till with no
signal and typing an expense. A Convex mutation issued while offline is held in the client's in-memory
queue and is **lost if the app is killed** — so the single most common write in the app can silently
vanish, which is worse than the legacy behaviour (Firebase RTDB persisted writes to disk).

Also unaddressed: what the UI shows while disconnected, whether the timeline renders from MMKV,
whether the calendar renders cached markers (`calendar-component.md` §7.5 calls `useMmkvCache` — a
helper nothing designs), and how a queued write reconciles with the rollup deltas when it lands.

**Proposal.** Write `design/offline-and-caching.md`: (1) an MMKV **outbox** for `items.create` /
`items.update` / `comments.create` only — the three writes worth persisting — holding the mutation args
plus a client-generated `clientRequestId`, drained on reconnect, with server-side idempotency via a
`ledgerItems.clientRequestId: v.optional(v.string())` + `by_ledgerId_clientRequestId` index (add both to
`SCHEMA.md` §3.10 now; retrofitting an idempotency key after real data exists is expensive); (2) the
read cache contract (which three queries get MMKV write-through, per `research/13` §11 rule 12); (3) the
offline banner and the "저장 대기 중 N건" affordance; (4) an explicit statement that photo uploads are
**not** queued offline (they need a signed URL) and are retried on next foreground.

**Resolved 2026-08-24:** `offline-and-caching.md` selects a separate encryption-keyed MMKV instance,
device-only SecureStore key, account partition, 14-day review ceiling, and honest local-pending/server-
committed copy. Item create/comment create store UUID+server hash on their target rows; item update uses
`expectedUpdatedAt` plus a 30-day `clientMutationReceipts` row so an older offline edit cannot overwrite a
newer one. Exactly four encrypted query mirrors ship (`me`, `listMine`, latest `daysInRange`, item page
zero), plus one bounded derived recent-category ordering with no titles/amounts/item ids; the old
plaintext/month cache and “offline writes out of scope” text are superseded. Photos and all other
mutations remain online-only.

**Superseded 2026-09-02:** the encrypted query mirrors and durable outbox described
above have been retired. The current normative contract is
[`offline-and-caching.md`](./offline-and-caching.md): Convex is the only durable
ledger-data authority, writes fail honestly while disconnected, and only an
unchanged in-memory retry keeps its `clientRequestId`.

## G34 — No crash reporting and no analytics exist, and one design document already assumes Sentry — **IMPORTANT**
**Owner: a new `design/observability.md`.**

`01` §9 documents the legacy's Sentry + Amplitude and the exhaustive event list. No design document
mentions either, and neither `@sentry/react-native` nor any analytics package is in `package.json`.
Meanwhile `money-categories-i18n.md` §1.4 says the `INTL_CAPS` probe result "is logged once to Sentry so
we learn the real matrix across the fleet" — an instruction that cannot be followed.

Without crash reporting, the OCC-conflict threshold in `SCHEMA.md` §5.4 ("> 0.5 % of `items.create`
invocations over a rolling 1 h window"), the cold-start budget in `auth-onboarding.md` §13.3
("p50 ≤ 450 ms, p95 ≤ 900 ms … if a change pushes p95 past 900 ms, it does not ship") and the
`PERFORMANCE_TRACE` log all have no collector.

**Proposal.** `design/observability.md`: `@sentry/react-native` with the Expo config plugin, auth token
as an EAS secret, `tracesSampleRate` low, PII scrubbing (**no memo text, no amounts, no email, no
handle** in breadcrumbs — this is financial data), release/dist tied to `runtimeVersion`; Convex-side,
the dashboard's function-error metrics plus a `logs`-based alert for the §5.4 threshold; a minimal
analytics event taxonomy (~15 events mirroring the legacy list plus `entry_created`,
`invite_redeemed`, `legacy_claimed`, `onboarding_step_completed`) behind a
`userProfiles.analyticsOptOut` flag, with the provider decision recorded (PostHog or Amplitude) and the
App Privacy / Data Safety consequences written down in the same file and reconciled with D4 (G37/G41).

**Resolved 2026-08-24:** D4's higher-authority launch privacy baseline is preserved: no Sentry,
analytics, session replay, or third-party client log SDK and no speculative opt-out field. D6 uses a
closed, 200-entry non-persisted local diagnostic ring; explicit previewed user support bundles; Convex
Health/Functions/Logs; opt-in platform crash/ANR aggregates; and deterministic device benchmarks. The
450/900 ms p50/p95 is now a ≥20-run release sample, not a nonexistent fleet metric. `INTL_CAPS` and
missing-translation signals are never automatic Sentry breadcrumbs. The unmeasurable launch claim
“OCC >0.5%/hour” is replaced by any sustained Convex Health write-conflict insight; an exact rate may
return only with a separately approved retry-count log stream.

## G35 — Force-update and maintenance mode have a table and no client gate — **IMPORTANT**
**Owner: `design/app-shell-and-screens.md` (boot sequence) or `design/observability.md`.**

`SCHEMA.md` §3.17 ships `appConfig` with `minSupportedIosBuild`, `minSupportedAndroidBuild`,
`latestIosVersion`, `latestAndroidVersion`, `iosStoreUrl`, `androidStoreUrl`, `maintenanceMode`,
`maintenanceMessageKey`, and §4 row 0 costs the read at one cached document. Nothing designs the gate:
where in the boot sequence it runs relative to the splash and the auth gate
(`auth-onboarding.md` §9.3's `AuthGate` has no slot for it), what the blocking screen looks like, how
the build number is obtained (`expo-constants` vs `expo-updates`), whether the check is blocking or a
soft nag below the threshold, and how it interacts with `expo-updates` OTA (a JS-only fix should ship as
an update, not a store gate). An `update-version` skill exists in `.agents/` and assumes a
"Convex force-update record" that no design specifies.

**Proposal.** Add a `<BootGate>` between `ConvexAuthProvider` and `AppLockProvider` that reads
`api.content.appConfig` and renders, in priority order: maintenance screen (`maintenanceMessageKey`
translated client-side), hard force-update (build < `minSupportedBuild`, no dismiss, store button), soft
update nag (version < `latest*Version`, dismissible, once per 7 days via MMKV). Specify that the gate is
**skipped when the query has not resolved** so a Convex outage cannot brick the app, and that
`expo-updates` `checkForUpdateAsync` runs in parallel and wins when the fix is JS-only.

**Resolved 2026-08-24:** `boot-and-providers.md` puts BootGate after cache/locale/connectivity/sensitive
storage and before AppLock/AuthGate. Only a live config blocks, in maintenance → minimum native build
order; unresolved config fails open after 1.5 s and cached config never bricks the app. Native values come
from a required direct `expo-application` dependency, OTA uses bounded Expo Updates checks and defers
reload over dirty work, and a strict-SemVer soft store nag is dismissible once per exact version/7 days.

## G36 — Content moderation exists in the schema and in no flow; blocks are not enforced on the invite path — **IMPORTANT**
**Owner: `sharing-invites.md` (§2.7 redeem order) + a new short moderation section.**

`SCHEMA.md` §3.4 ships `contentReports` and `userBlocks` and correctly cites App Store Guideline 1.2
(public `@handle`s + a public comment thread require reporting, blocking and a 24-hour response
commitment). But: `sharing-invites.md` §2.7's 13-step redeem order **never reads `userBlocks`**, even
though `SCHEMA.md` §3.4's `by_blockedUserId` index comment says it is "the reverse check when someone
tries to invite a user who has blocked them"; `sharing-invites.md` §6 has 28 attack rows and none of
them is "a harasser follows their target into a shared ledger"; nothing designs the report UI, the
report→queue→action pipeline, what `ACTIONED` *does* (hide the comment? suspend the account? the
`appRole: 'SUSPENDED'` value exists and nothing sets it), or the 24-hour response process.

There is also a genuine product question nobody asked: **what does blocking mean inside a shared
ledger?** Two members of one household ledger where A has blocked B still both need to see the
ledger's entries. A block cannot hide financial rows without corrupting totals.

**Proposal.** (a) Insert a step 8b into `sharing-invites.md` §2.7: after the binding checks, read
`userBlocks.by_blockerUserId_blockedUserId` for (invite creator ↔ redeemer) in both directions and
return `BLOCKED` on a hit. (b) Write the moderation flow in one page: report entry points (comment
long-press, `/@handle` overflow, ledger settings), `contentReports.create` (rate-limited), the ops queue
via `by_status_createdAt`, the four `ACTIONED` remedies (soft-delete the comment; remove the member;
`appRole: 'SUSPENDED'` which `beforeSessionCreation` must then refuse — **it currently only refuses
`purgedAt`**; no action), and the 24-hour SLA with the support address. (c) State the shared-ledger rule
explicitly: **a block hides profile surfaces (avatar, handle, comments) but never ledger rows**, and
blocking a co-member offers "leave this ledger" as the real remedy.

**Resolved 2026-08-24:** `moderation-and-safety.md` defines report entry points, rate/subject validation,
oldest-first ADMIN queue, 24-hour triage coverage, reporter confidentiality, and atomic typed remedies:
no action, comment removal, item-content redaction without changing money, governed member removal, or
account suspension with auth audit/session gates. Account blocks are directional storage but symmetric
interaction gates. Direct invites check the pair; redeem/request/approval check both directions against
every capped live member, preventing a harasser from joining through somebody else's link. Existing
co-members retain all financial rows/totals while identity/comments/push are hidden or muted.

## G37 — GDPR/PIPA data export contradicts itself and there is no consent surface — **IMPORTANT (legal)**
**Owner: a new `design/privacy-and-compliance.md`.**

Three separate problems:
1. **Export contradiction.** `sharing-invites.md` §1.4 row 26 grants ADMIN+ "내보내기 (CSV / JSON / 사진
   zip)" and §5.8 lists a real `exports.actions.requestExport` action with an `EXPORT_REQUESTED` audit
   row. `SCHEMA.md` §10 row 16 defers ledger export to **v2** ("the permission row exists; the mechanism
   is an action, not a table"). `ledgerAuditLog` ships the `EXPORT_REQUESTED` literal either way.
2. **Legal export is a different thing.** GDPR Art. 20 / PIPA Art. 35 give the *individual* a right to
   their own data in a portable format, which is not the same as a ledger admin exporting everyone's.
   `auth-onboarding.md` §12 designs deletion in exhaustive detail and never mentions export.
3. **No consent, no policy surface.** The legacy Intro linked ToS and Privacy. Nothing in the new design
   does (G27). PIPA additionally requires separable consent for optional items and a Korean-language
   notice; the app collects financial records, optionally location, and a phone number
   (`userProfiles.phone`, migrated from `info.tel`).

**Proposal.** `design/privacy-and-compliance.md` covering: (a) **personal data export** — a
`user.requestDataExport` action producing a JSON+CSV zip of the caller's profile, their emails, their
memberships, their authored items and comments and photos, delivered as a `_storage` blob with a
notification, batched via `maintenanceJobs` kind `USER_EXPORT`; ship it in v1, it is ~150 lines and it
is a legal obligation with a 30-day statutory clock; (b) **ledger export** — decide explicitly, and if it
is v2 then delete the permission row and the audit literal or mark them `// v2`; (c) the consent screen
and the two URLs; (d) a data-retention table (soft-delete 30 d, audit `AUDIT` forever, `FEED` 180 d,
`legacyRaw` permanent — is that defensible? state why); (e) the App Privacy / Play Data Safety
declarations, which must match whatever G34 decides about analytics; (f) the sub-processor list
(Convex, Expo push, Resend, Sentry, Apple/Google/Kakao/Naver) that a PIPA notice must enumerate.

**Resolved 2026-08-24:** `privacy-and-compliance.md` separates personal and ADMIN+ ledger export and
ships both in v1 through `dataExports`/protected ≤18 MiB parts. It corrects the register's legal premise:
PIPA Article 35-2 is scoped by the enforcement decree and is not a universal 30-day BooKoo obligation;
the self-service package remains a product/GDPR commitment. Core service uses the contract basis, optional
consents stay separate, versioned `legalEvents` record evidence, public five-locale URLs and retention/
processor/overseas-transfer/store matrices are release gates. “Forever” legacy/audit retention is removed.

## G38 — Receipt photos are served over permission-free, non-expiring URLs — **IMPORTANT (expensive to retrofit)**
**Owner: `SCHEMA.md` §7.5 (make it a stated policy, not a footnote).**

`sharing-invites.md` §4.3 documents this honestly as an accepted residual: `ctx.storage.getUrl` returns
an unguessable but permission-free URL, BooKoo denormalizes those URLs onto `itemPhotos` and
`ledgerItems.coverThumbUrl` to avoid the per-row `getUrl` trap, so **a removed member's cached URL keeps
working forever**, and the stated mitigation ("re-key the ledger's blobs on removal") is "deliberately
not done by default".

For a photo of a receipt this is a weaker property than it sounds: the URL is also in every client's
MMKV cache, in every push payload that carries a thumbnail, and — because the URLs are denormalized onto
documents — in any database export. `SCHEMA.md` §7.6 lists eleven fields that must never reach a client
and photo URLs are not among them, correctly, because they must; but that means the *only* control is
"nobody leaks the string".

Retrofitting authenticated delivery later means minting a new storage id for every photo and rewriting
every denormalized URL on `itemPhotos` **and** `ledgerItems.coverThumbUrl` — i.e. touching the 1M-row
table. Decide now.

**Proposal.** Either (a) accept it and write the acceptance into `SCHEMA.md` §7.5 as rule 6 with the
blast radius stated, plus a `photos.rekeyLedger` maintenance job shipped-but-unscheduled so the mitigation
is one `convex run` away when a user asks; or (b) serve photos through a Convex `httpAction`
(`GET /p/:photoId`) that checks `requireLedgerMember` and 302s to a freshly minted storage URL, and store
**no** URL on the document — the denormalization then becomes `photoId`, the per-row `getUrl` trap is
still avoided, and removal is instantly effective. (b) costs one HTTP hop per image and is what a
financial app should do; (a) is defensible only if written down. Recommend (b) for the **original**
image and (a) for the ~320 px thumbnail, which is the cheap compromise: the thumbnail leaks little, the
full receipt leaks a lot.

**Resolved 2026-08-24:** D4 chooses authenticated delivery for **both** variants. `coverPhotoId` replaces
`coverThumbUrl`; receipt documents keep server-only storage ids and no rendered URL. An HTTP action uses
the Convex Auth Bearer token and current membership before returning `ctx.storage.get()` bytes, never a
redirect. Installed Auth/Expo Image APIs support the token/header path. Cache purge handles sign-out/
removal, 15 MiB upload and 20 MiB response limits are explicit, and all 724 measured legacy photos need a
pre-cutover terminal decision because no `legacyUrl` client fallback ships.

## G39 — Accessibility is designed for one component and nothing else — **IMPORTANT**
**Owner: a new `design/accessibility.md`, or a section in the app-shell document.**

`calendar-component.md` §5 is a genuinely complete a11y contract, enforced by a Storybook addon with
`a11y: {test: 'error'}`. Everything else has one line: `money-categories-i18n.md` §1.7's
`a11y.expenseAmount` label. Missing app-wide: dynamic-type policy (the calendar caps at 1.6; nothing else
does, and Korean users run large type), minimum touch targets, VoiceOver labels for the entry row (an
amount tinted red is invisible to a screen reader — the sign must be spoken), the chart alternative
(G25), focus order in the entry form, `reduce-motion` for the collapsing header and the calendar
collapse, contrast for the 6 ledger accents and 15 category colours in both themes (G30), and the app
lock's PIN entry (six presentational boxes driven by one hidden input is a screen-reader trap unless
labelled).

**Proposal.** One page: the six rules above, each with a testable assertion; add
`@testing-library/react-native`'s `toHaveAccessibleName` checks to the three highest-traffic components
(entry row, amount keypad, day cell); adopt the calendar's `maxFontSizeMultiplier` default globally via
a wrapped `<Text>`; and add a manual VoiceOver/TalkBack pass to the `e2e-test` skill's checklist.

**Resolved 2026-08-24:** `accessibility.md` owns uncapped normal text, 2.0-only dense geometry caps with
full alternatives, ≥44 pt/48 dp targets, focus/modal/error rules, spoken money direction and complete item
semantics, chart data tables, accessible PIN, Reduce Motion/contrast/sensory alternatives, automated
render assertions, and a physical VoiceOver/TalkBack release matrix. Calendar's default cap is corrected
from 1.6 to 2.0. The old claim that a nonexistent Storybook script already enforces CI is removed; D7/I4
must implement it before anyone may report it green.

## G40 — Testing strategy is split across three documents and the two enforcement scripts do not exist — **IMPORTANT**
**Owner: `SCHEMA.md` §7.9 (make it the umbrella).**

Three good but disconnected plans: `SCHEMA.md` §7.9 (three tiers, with the Tier-2 transaction-metric
fixture declared "a schema-PR deliverable"), `auth-onboarding.md` §17, `calendar-component.md` §8.
Gaps:
- **`scripts/lint-schema.ts` does not exist** and is not in `package.json`'s `lint:all`
  (`bun lint && bun lint:i18n`). `SCHEMA.md` §7.8 says it "runs in CI".
- **`scripts/verify-langs.ts` does not exist.** `money-categories-i18n.md` §3.3 specifies
  `"lint:all": "bun lint && bun lint:i18n && bun tsx scripts/verify-langs.ts"`; the shipped script omits
  it. The placeholder-parity check it performs is the one thing `eslint-plugin-i18n-json` cannot do.
- **Tier 2 is not in CI.** `.github/workflows/ci.yml` runs lint, typecheck and `bun run test --coverage`;
  the transaction-metric assertions need a real dev deployment and `convex/seeds.ts`, neither of which
  the workflow provisions. §7.9 calls Tier 2 *"the only automated guard that catches the regression class
  that killed the legacy app"* — so it is currently unguarded.
- **Tier 3** (the §5.4 load test, "must be run and its conflict rate recorded before the first public
  build") has no owner, no script and no place to record the number.
- No E2E in CI (the `e2e-test` skill is manual/local).

**Proposal.** Make `SCHEMA.md` §7.9 the umbrella and add: the two missing scripts, wired into `lint:all`;
a second CI job `convex-budgets` gated on `CONVEX_DEPLOY_KEY` being present that runs
`convex run seeds:seedLedger` against a **preview deployment** (`--preview-create ci-$SHA`) then the
Tier-2 suite, skipped on forks exactly like the existing codegen step; a `docs/perf/loadtest-<date>.md`
artefact for Tier 3 with the conflict rate; and a line in the PR template requiring the Tier-2 budget
table to be re-pasted when a `convex/` query changes.

**Resolved 2026-08-24:** D7 adds executable language/schema/dependency/secret/readiness gates and an
honest PR contract. Tier 2 becomes mandatory with I3's seed/functions/preview job; Tier 3 becomes a P1
driver plus dated aggregate report. Staged readiness fails if either owner is marked DONE without its
artefacts; a secretless skip is never green evidence.

## G41 — EAS submit config has three placeholders and store metadata is unplanned — **IMPORTANT**
**Owner: a new `design/release-and-store.md`.**

`eas.json` ships `"ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID"`,
`"appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"` and a `serviceAccountKeyPath` pointing at a file that must
not be committed. `DECISIONS.md` §7 makes this a **brand-new store listing** under
`dev.hyodotdev.bookoo`, which means the full listing must be produced: name, subtitle, description,
keywords and screenshots **in five locales** (`app.config.ts` already declares
`CFBundleLocalizations: ['ko','en','ja','zh-Hans','id']`), an iPad screenshot set (`supportsTablet:
true`), a privacy policy URL, App Privacy answers, Play Data Safety answers, an age rating, and — because
Sign in with Apple is present — an account-deletion path the reviewer can reach (`auth-onboarding.md`
§12.4 designs it; the review notes must point at it) plus the `APP_REVIEW_FIXED_OTP_*` reviewer bypass
(§3.5) documented for the reviewer.

`DECISIONS.md` §7 also flags an open item: how existing users of the 2017 `com.dooboolab.bookoo` listing
learn about the move. Nobody owns it.

**Proposal.** `design/release-and-store.md`: the placeholder checklist with owners; the five-locale
metadata table; the screenshot matrix (6.7"/6.1" iPhone, 13" iPad, Android phone/tablet × 5 locales ×
light+dark); the review-notes template (test account, fixed OTP, where to find account deletion, what the
app does with location and photos); the migration-notice plan for the old listing (store description +
screenshot update is the only realistic channel, since the old app is Expo 36 and unbuildable) and the
in-app copy on the new app's sign-in screen for legacy users
(`auth-onboarding.md` §11.7 already specifies `app/(auth)/legacy-help.tsx`).

**Resolved 2026-08-24:** `release-and-store.md` owns the new-listing identity, placeholder/external-id
gates, five-locale metadata, truthful 8-scene mixed-theme iPhone 6.9-inch/iPad 13-inch/Android phone/tablet
matrix, reviewer OTP controls/notes, privacy/rating answers, legacy-listing notice, private legacy asset
archive, and thirteen evidence-based production gates. Old Android screenshots may be archived under
`.local` and used as references, never stretched into misleading new-app/iPhone store screenshots.

## G42 — Secrets from the legacy repo have not been rotated or scoped — **IMPORTANT (security)**
**Owner: `design/release-and-store.md` or a short ops note.**

`research/01` §16 enumerates committed secrets in the legacy tree, which is **present in this repository**
at `BooKooLegacy/`: `functions/admin_key.json` (a Firebase service account), `keys/BooKoo.jks`,
`keys/BooKoo_dist.p12`, `keys/BooKoo_push.p12`, a Sentry `authToken`, Google Maps API keys in
`app.json`, the Firebase web config, AdMob unit ids, the Amplitude key, and the Facebook app id. It ends
with **"Rotate all of them."** No design document mentions rotation, and the migration
(`SCHEMA.md` §8) needs *live* Firebase credentials to run — so the service account is about to be used,
not retired.

**Proposal.** A dated checklist with an owner per credential: rotate or delete the Firebase service
account **immediately after** the migration rehearsal and again after cutover; revoke the Sentry token
and the Maps keys; confirm the old AdMob/Amplitude/Facebook apps are deleted (the new app uses only new
dev.hyo.bookoo AdMob records for the documented Free banner and has no
Amplitude, no Facebook); confirm `BooKooLegacy/` stays gitignored (the last commit did this — verify the
history does not already contain the keys, and if it does, say so plainly and rotate rather than
rewrite); and add a `gitleaks` or `trufflehog` step to CI so this cannot recur.

**Resolved 2026-08-24:** `operations-and-quality.md` carries the dated owner/action/evidence ledger;
all external rotations remain explicitly pending. CI scans full reachable history with pinned Gitleaks,
and a local redacted snapshot check protects ignored/private paths and high-confidence token shapes.

## G43 — Data-migration scripts have no home and the export is PII — **IMPORTANT**
**Owner: `SCHEMA.md` §8 (add a §8.8 "where the code lives").**

`SCHEMA.md` §8 specifies 14 passes, `money-categories-i18n.md` names
`scripts/migrate/lib/email.ts` (which a CI step must byte-diff against `shared/email.ts` per
`auth-onboarding.md` §11.1) and `05-normalize.ts`, and `sharing-invites.md` §8 item 13 names three more
steps. None of it exists; `scripts/` holds `convert-legacy-strings.ts` and a README. The 27 MB export
lives at `.local/firebase-export/bookoo-rtdb.json` and is described as "gitignored, PII" — it contains
2,230 users' emails, phone numbers and eight years of spending.

**Proposal.** Add `SCHEMA.md` §8.8: the `scripts/migrate/` layout (`00-export.ts`, `05-normalize.ts`,
`10-load-*.ts` per pass, `90-verify.ts`, `lib/email.ts`, `lib/legacyKey.ts`, `lib/checksum.ts`), the
CI byte-diff step for `email.ts`, an explicit statement that the export and every intermediate file live
only under `.local/` (already gitignored) and are **deleted after cutover sign-off**, and a rule that no
migration script ever prints an email or a memo to stdout. Add the `.local/` path to the secrets
checklist in G42.

**Resolved 2026-08-24:** the already-complete 01–19 inventory in `migration-plan.md` remains canonical;
all outputs move from the unsafe/unignored `dump/` name to `.local/migration/**`, Git and EAS exclude it,
stdout is PII-free, the email normalizer is byte-diff gated when M1 creates it, and the signed retention
window is 90 days absent a minimal dated hold.

## G44 — `research/13` §11 rule 5 (two-arg `ctx.db.get`) is violated in the auth design — **NICE**
**Owner: `auth-onboarding.md` §6.1.**

Rule 5 is *"`ctx.db.get("table", id)` — two-arg form (1.42 deprecated the one-arg form)"*. `SCHEMA.md`
and `sharing-invites.md` use the two-arg form; `auth-onboarding.md` §6.1 uses `await db.get(userId)`.
Trivial, but it is the kind of thing that gets copy-pasted forty times.

**Proposal.** Fix the two call sites and add it to `convex/AGENTS.md` as a lint-able convention.

**Resolved 2026-08-24:** both auth examples use the two-argument API. The Convex directory rule already
states it, and the executable schema/source lint rejects one-argument `db.get` calls.

## G45 — `ConvexQueryCacheProvider` is required by the perf design and absent from the provider tree — **IMPORTANT**
**Owner: `auth-onboarding.md` §13.1.**

`SCHEMA.md` §4.2 states that the roster and category sidecars "are kept warm across tab switches by
`ConvexQueryCacheProvider`", and `research/13` §11 rule 12 requires it. The provider stack in
`auth-onboarding.md` §13.1 is `GestureHandlerRootView → RootProvider → ErrorBoundary →
KeyboardProvider → ActionSheetProvider → ConvexAuthProvider → AppLockProvider → AuthGate` — no cache
provider, and no locale provider either (`money-categories-i18n.md` §3.4's `useLocale` needs one, or at
least a documented module-level listener), and no notification provider.

Without the cache provider, every tab switch tears down and re-establishes the roster and category
subscriptions, which is exactly the "sidecar" design's premise.

**Proposal.** Amend the tree to
`… → ConvexAuthProvider → ConvexQueryCacheProvider → LocaleProvider → AppLockProvider → BootGate (G35)
→ AuthGate`, and state the ordering constraint (the cache provider must be inside the auth provider so
cached entries are dropped on sign-out).

**Resolved 2026-08-24:** the complete tree is Root/Cpk (one SafeArea) → root boundary → keyboard/action
sheet → ConvexAuth → session-epoch cache boundary → ConvexQueryCache → Locale →
AccessibilityPreferences → Connectivity → SensitiveStorage → BootGate → AppLock → AuthGate → ready-only
Outbox → LedgerAccent → Notification → navigator. Cache remount/clear occurs before sign-out/account
switch; outbox/push never mount for a signed-out, onboarding, suspended, deleting, or locked session.

## G46 — Nine dependencies required by the designs are not installed — **BLOCKER**
**Owner: `research/10`'s pinned `package.json` is stale; fix `package.json` and note the drift.**

| Package | Required by | Status |
|---|---|---|
| `@convex-dev/rate-limiter` | `SCHEMA.md` §2.2, `auth-onboarding.md` §15, `sharing-invites.md` §2.8 | **missing** |
| `@convex-dev/workpool` | `SCHEMA.md` §2.2 (`blobImport`, `maxParallelism: 20`) | **missing** |
| `@noble/hashes` | `auth-onboarding.md` §14.4 (scrypt PIN), `sharing-invites.md` §2.2 (invite hash) | **missing** |
| `expo-image-manipulator` | `SCHEMA.md` §7.5 rule 3, `research/13` §11 rule 11 (client thumbnails) | **missing** |
| `expo-media-library` | photo save-to-device (G23) | **missing** |
| `expo-clipboard` | `sharing-invites.md` §2.4 iOS deferred-deep-link hand-off | **missing** |
| `react-native-play-install-referrer` | `sharing-invites.md` §2.4 Android deferred deep link | **missing** |
| `expo-location` (+ a map) | `place` capture (G24) | **missing, deferrable** |
| `@sentry/react-native` | `money-categories-i18n.md` §1.4, G34 | **missing** |
| `@date-fns/tz` | `SCHEMA.md` §7.2 and `money-categories-i18n.md` §4.3 both import `TZDate` | **missing — and `shared/date.ts` deliberately implements it with `Intl` instead** |

The last row is a **live contradiction between the docs and the code**: the shipped `shared/date.ts`
opens with a section headed "WHY Intl AND NOT `@date-fns/tz`" and implements `zonedFields` /
`timeZoneOffsetMs` directly. It also lives at `shared/date.ts` while `SCHEMA.md` §7.2 calls the file
`shared/period.ts` and names functions the file does not export (`offsetMinutesAt`,
`dayKeyRangeOfMonth`, `dayKeyRangeOfPeriod`, `addMonths`, `dayKeyToCalendarKey`,
`calendarKeyToDayKey`, `monthKeyToCalendarKey`, `calendarKeyToMonthKey`); the file exports
near-equivalents under different names (`timeZoneOffsetMs` returns **ms**, not minutes, while
`ledgerItems.occurredOffsetMinutes` needs minutes).

**Proposal.** Install the six non-deferrable packages with pinned versions; rewrite `SCHEMA.md` §7.2 to
reference `shared/date.ts` and its real export names, add the four missing codecs and
`offsetMinutesAt` / `dayKeyRangeOfPeriod` to the file, and delete the `@date-fns/tz` import from both
design documents (the shipped implementation is the better one — it removes a dependency and the probe
already exists in `shared/currency.ts`'s `intlCaps`). Also move `intlCaps` to `shared/intlCaps.ts` as
`money-categories-i18n.md`'s file map says, or fix the file map.

**Resolved 2026-08-24:** `RECONCILIATION.md` R6/G46; all ten register rows were decided, seven
dependencies were installed at recorded pins, and the Intl/date implementation was completed and tested.

## G47 — `research/10`'s pinned `package.json` and the shipped one have drifted, with no reconciliation note — **NICE**
**Owner: a one-paragraph note in `SCHEMA.md` or the app-shell doc.**

`victory-native@41` and `@shopify/react-native-skia@2.6` are installed with no design mentioning either
(G25); `@backpackapp-io/react-native-toast` and `react-native-error-boundary` are installed with no
design mentioning either (G32); `expo-auth-session` is installed although
`auth-onboarding.md` §3 says there is "no server-side OAuth redirect for Google/Kakao/Naver at all"
(it is presumably for the Apple-on-Android web flow, which uses `expo-web-browser` — so it may be dead).

**Proposal.** One table mapping each installed package to the design that requires it, with unmatched
rows either justified or removed. Cheap, and it is what stops a 90-dependency app from accumulating
another 20.

**Resolved 2026-08-24:** `scripts/verify-dependencies.ts` exhaustively owns every direct runtime/dev
package and fails on unowned or stale rows. Six unused packages are removed; the operations note records
their designed replacements and the API/tooling drift cleanup.

---

# PART E — Measured production data that the migration design does not handle

`research/15` is measured and post-dates every design document. It explicitly says it "overrides any
inference in note 02". These are the places the designs have not caught up.

## G48 — `reviews` is a JSON **array** on a large minority of items — **BLOCKER**
**Owner: `SCHEMA.md` §8.5 / §8.7 pass P8.**

Measured: `reviews` is a list on **378** items and a map on **1,310**. Array entries "can carry
`key: "0"` — a positional index, not a push id". `SCHEMA.md` §8.5 maps `reviews/{r}.text|writer|date`
and §8.7's P8 reads `items[].reviews` as though it were always a map; `legacyKey` is
`` `${ledgerKey}/${itemKey}/${reviewKey}` `` — for an array, `reviewKey` is `"0"`, `"1"`, …, which is
still globally unique (the item key disambiguates) but only if the importer *knows* to use the index.
A naive `Object.entries()` over an array happens to yield `["0", value]`, so this may work by accident —
and "works by accident" on 378 comment threads in a financial record is not good enough. Arrays can also
contain `null` holes from RTDB, which would produce a row with no `text` or `writer`.

Separately: **a review carries a fully denormalized `user` object** (`displayName`, `email`, `photoURL`,
`statusMsg`, `tel`) alongside `writer`. `SCHEMA.md` §8.5 does not mention it. That object is not just
noise — for the **270 users with no `info` node** it may be the only surviving display name and avatar
for a placeholder profile, and it contains email and phone (PII that must land in `legacyRaw`, never in
a projection).

**Proposal.** Amend §8.5: normalize `reviews` with an explicit
`const entries = Array.isArray(reviews) ? reviews.map((v, i) => [String(i), v] as const).filter(([,v]) => v != null) : Object.entries(reviews)`;
add a `REVIEW_SHAPE_ARRAY` count to the verification report and assert `378 + 1310` at the cutover gate;
route the denormalized `user` object into `itemComments.legacyRaw`; and add a P1.5 step that, for a
`legacyUsers` row with no `displayName`, back-fills it from the most recent review's embedded
`user.displayName` (and `photoURL` → `avatarLegacyUrl`) — turning 270 nameless placeholders into
recognisable ones, which is what makes a migrated 2019 comment thread readable.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G48. Both shapes and null holes are explicit and shape
counts are gated. Snapshots remain forensic-only; the proposed P1.5 backfill is rejected because a
PII-safe aggregate found zero name/avatar coverage among the 270 users without `info`.

## G49 — One ledger has no `owner`, no `info` and no `members`, and three required fields depend on them — **BLOCKER**
**Owner: `SCHEMA.md` §8.3.**

Measured field frequency: `info` on **1,784** of 1,785 ledgers, `owner` on **1,784**, `members` on
**1,784**, `visible` on 1,784. So exactly one ledger is missing all four. `SCHEMA.md` §3.5 makes
`title: v.string()`, `description: v.string()`, `colorKey`, `ownerId: v.id('users')` and
`baseCurrency` **required**, and §8.3 has no arm for an absent `info` or an absent `owner`. The importer
throws on row 1,785, and `SCHEMA.md`'s stated invariant is "every source-vs-destination count delta is 0".

The same table also shows two push-id-shaped child keys where ledger field names should be. A strict
importer will trip on those too.

**Proposal.** Add an explicit degenerate-ledger arm to §8.3: absent `info` → `title = t-less literal
'(제목 없음)'` stored as `''` with a `LEDGER_INFO_MISSING` anomaly (add the kind), `description = ''`,
`colorKey = 'TEAL'` (the documented legacy fallback); absent `owner` → resolve to the first key of
`members`, else to the synthetic `__unknown__` placeholder from P0.5, with an
`ORPHAN_SOLE_MEMBER_LEDGER` or a new `LEDGER_OWNER_MISSING` anomaly and `orphanedAt = now`; unknown
child keys under a ledger node → `legacyRaw` plus an `UNEXPECTED_LEDGER_CHILD` anomaly, never a throw.
State the rule once: **the importer never throws on shape; it records an anomaly and produces the most
honest row it can.**

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G49. Measurement shows the node is an item container,
not an owner-less ledger, so no tenant is fabricated. Two orphan children and the separate ghost
item/review are archived under dedicated schema literals with `producedRow: false` before transforms.

## G50 — 434 RTDB users have no usable profile email; Auth provider recovery still needs a gate — **IMPORTANT**
**Owner: `auth-onboarding.md` §11.7 and §18 open question 1.**

`auth-onboarding.md` §18 asked for the exact `orphan_no_email` count. The RTDB measurement was initially
coarsened to ~276; re-measurement finds **434 of 2,230 user nodes with no usable `info.email`** and 270
with no `info` at all. This is a recovery-readiness population, not the provider-derived Facebook-only
cohort: the password-stripped Auth export is still required for that exact count.

The RTDB population is large enough that P13 ownership rescue and support cannot be deferred, even though
the exact P13 row count comes from Auth. The existing "retained 12 months, then purged" rule would put
real user data on a deletion clock solely because no recovery email was available.

**Proposal.** Make the Auth-export count a preflight gate but do not condition the architecture on it,
and re-decide two consequences at the measured RTDB scale: (a) the 12-month orphan retention — recommend
extending to 24 months or making it indefinite,
since storage for 27 MB of source data is free and deleting a stranger's 8-year ledger because we could
not email them is the worst possible outcome; (b) build the §11.7 step-3 support escape hatch
(`forceClaim` + the identity-verification checklist) **for launch**, not as a maybe, and write the
support runbook. Measure whether G48's proposed P1.5 backfill actually covers these profiles.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G50. The precise RTDB count is 434 without usable profile
email and 270 without `info`; Auth still supplies the exact provider cohort. Support/rescue ships at
launch with dual approval and two-signal proof. Orphan ledgers get no automatic purge clock; the proposed
P1.5 backfill has zero measured coverage.

## G51 — `created` is missing on ~3,850 items and `createdAt` is a required field — **BLOCKER**
**Owner: `SCHEMA.md` §8.4.**

Measured: *"`created` is missing on ~3,850 items; `memo` missing on ~780. Neither is safe to assume
present."* Also `amount` is `NoneType` on 1 item and `selectedDate` is `NoneType` on 1.
`SCHEMA.md` §1.3 makes `createdAt: v.number()` **required on every table**, and §8.4 maps
`created → createdAt + legacyCreatedAt` with no fallback. 11 % of items would fail the insert.

§8.4 *does* specify a fallback chain for `occurredAt` (`selectedDate → created → updated → push-id
timestamp`, recorded in `legacyDateSource`) and says *"a resolved `occurredAt` of 0 fails the run"* —
so the machinery exists; it simply is not applied to `createdAt`.

**Proposal.** Add one line to §8.4: `createdAt := created ?? updated ?? pushIdTimestamp(itemKey)`,
never `Date.now()` (a 2019 row must not sort as new), with `legacyCreatedAt` absent when `created` was
absent so the difference between "we know" and "we derived" stays visible — the same honesty rule the
document already applies to `feedback.legacyCreatedAtDate`. Add `memo: item.memo ?? ''`,
`legacyAmountString: item.amount ?? undefined`, and assert at the cutover gate that no valid row uses an
import-time clock.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G51. One missing-field node is the skipped ghost; all 3,854
valid items missing `created` have both parseable `updated` and push-id time. Required resolution is
`created → updated → push id`, never import time; missing memo is `''`.

## G52 — 1,081 distinct `category.txt` values against a 120-category-per-ledger cap — **IMPORTANT**
**Owner: `SCHEMA.md` §8.4 / §3.19 + `money-categories-i18n.md` §2.6.**

Measured: **1,081 raw distinct `category.txt` values** across 34,799 items, including frequently reused
user-invented labels. The recovery rule creates one `ledgerCategories` CUSTOM row per distinct
`(ledgerId, iconId, normalized txt)`. `MAX_CATEGORIES_PER_LEDGER = 120` and `CATEGORY_SCAN_LIMIT = 120`
bound the picker query (`.take(120)`); a business-like ledger with 200 distinct labels would silently
lose rows past the cap — the picker `.take(120)` would truncate and `resolveCategory` would fall back to
`'uncategorized'` for the rest, **after** the items were written pointing at real keys.

Neither `SCHEMA.md` §8.4 nor `money-categories-i18n.md` §2.6 mentions the cap in the migration path.

**Proposal.** Measure it first — a five-line query over the export gives
`max(distinct (iconId, normalized txt) per ledger)`. Then: if the max is under ~90, state the number in
§8.4 and move on; if any ledger exceeds it, raise `MAX_CATEGORIES_PER_LEDGER` for migrated ledgers only
(it is a picker-scan bound, not a storage bound, and 300 rows is still one indexed read), keep the
34-preset overlay plus customs, and add a `CATEGORY_CAP_EXCEEDED` anomaly for anything beyond. Either
way, make the picker query's `.take()` a **cap that is asserted**, not a silent truncation:
`if (rows.length === CATEGORY_SCAN_LIMIT) log a ROLLUP_DRIFT-style anomaly`.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G52. The exact five-locale classifier measures 1,598 custom
triples across 505 ledgers, max 54 customs / 88 materialized rows, and zero unrecoverable. The cap stays
120; P6 asserts it and runtime reads 121 to reject overflow rather than truncate.

## G53 — The migration is sized for a load that does not exist, and the cutover gate should be restated — **NICE**
**Owner: `SCHEMA.md` §5.6 / §8.7.**

Measured totals: 34,799 item children / 34,798 migrated rows (not 1M), 724 photos (not 100k), 1,784
review children / 1,783 migrated comments, 2,184 memberships, 357
invites, **6 join requests**, 69 opinions, 27 MB total, max 1,829 items in one ledger.
`SCHEMA.md` §5.6 computes "1M rows is ~3,340 batch mutations … ≈ 35 minutes"; §2.2 justifies the
`blobImport` workpool with "a serial chain at ~500 ms/blob is ~14 h for 100k photos; a workpool at
maxParallelism 20 is ~45 min". At the real numbers the whole import is ~120 batch mutations and the blob
copy is **~6 minutes serially**.

This is not a defect — the scale architecture is for future growth, which is the stated requirement —
but three decisions were justified by numbers that are three orders of magnitude off, and one of them
(`@convex-dev/workpool`) is a component and a dependency.

**Proposal.** Add a paragraph to §8.7 restating the measured volumes and their consequences: keep the
workpool (it is also the retry/backoff mechanism, which is the real justification, and the dependency
is cheap) but drop the 45-minute claim; note that P12 can run **before** cutover, closing
`SCHEMA.md` §10.1 open item 7; and restate the cutover gate thresholds in absolute counts
(`itemPhotos` PENDING+FAILED must reach 0 out of **724**; `migrationAnomalies` unresolved must be 0 out
of a run over **34,799** items) so the sign-off is checkable rather than aspirational.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G53. SCHEMA separates the future 1M/100k stress model from
the observed 34,798-row item target and 724 photos. Workpool rationale is retry/backoff and terminal
state; P12 drains before public cutover.

## G54 — `ledgerMemberState` and `ledgerCategories` are written by migration passes but carry no legacy trailer — **NICE**
**Owner: `SCHEMA.md` §1.6 / §8.7.**

Axiom **P7** says `legacyKey`/`legacyUid`/`legacyCreatedAt` exist *"on day one on every table that
receives migrated data"*. Pass P3 writes `ledgerMemberState`; pass P6 writes `ledgerCategories`; neither
table has the trailer. Both happen to have a natural idempotency key (`by_ledgerId_userId`,
`by_ledgerId_key`), so re-runs are safe — but the axiom is stated without exception and a reader will
either add the fields or wonder why they are absent.

**Proposal.** Amend P7 to *"every table that receives migrated data **and lacks a natural unique key**"*,
and add a one-line note on both tables naming the index that serves as the idempotency key instead.

**Resolved 2026-08-24:** D5/`RECONCILIATION.md` G54. P7 now has exactly two natural-key exceptions:
`ledgerMemberState.by_ledgerId_userId` and `ledgerCategories.by_ledgerId_key`; all other migrated tables
retain the legacy trailer and `by_legacyKey`.

---

# PART F — Smaller contradictions and omissions

## G55 — `beforeSessionCreation` does not refuse a suspended account — **IMPORTANT**
**Owner: `auth-onboarding.md` §6.1.**

`userProfiles.appRole` includes `'SUSPENDED'` (`SCHEMA.md` §3.1) and `SCHEMA.md` §3.4 exists to support
moderation, but `beforeSessionCreation` only throws on `purgedAt`, and `requireActiveProfile` only checks
`deletedAt`. A suspended account can sign in and keep writing.

**Proposal.** Add `if (profile?.appRole === 'SUSPENDED') throw appError('ACCOUNT_SUSPENDED',
'error.auth.accountSuspended')` to `beforeSessionCreation`, add the code and key to the unions (G32),
add the check to `requireActiveProfile` so a live session is cut off too, and add a
`/account/suspended` screen with the appeal address.

**Resolved 2026-08-24:** `ACCOUNT_SUSPENDED` is in the shared closed union.
`beforeSessionCreation` refuses new sessions, `requireActiveProfile` stops live-session capabilities,
the root projection exposes only the restricted gate boolean, and the 59th route
`/account/suspended` mounts appeal/help + sign-out with no ledger query.

## G56 — Two permission-helper modules with two names — **IMPORTANT**
**Owner: `sharing-invites.md` §5.7 vs `auth-onboarding.md` §7.3 vs `SCHEMA.md` §1.7.**

`auth-onboarding.md` §7.3 defines `convex/lib/permissions.ts` with six account-level gates.
`sharing-invites.md` §5.7 defines `convex/lib/ledgerPermissions.ts` with `requireLedgerRole` and imports
`authError` from `./permissions`. `SCHEMA.md` §1.7 says *"Every ledger-scoped function's first line is
`requireLedgerMember(ctx, ledgerId)` or `requireLedgerRole(ctx, ledgerId, 'MEMBER')` from
`convex/lib/ledgerPermissions.ts`"* — introducing a third function, `requireLedgerMember`, which
`sharing-invites.md` never defines. `calendar-component.md` §7.5 and
`money-categories-i18n.md` §2.5 both call `requireLedgerMember`.

**Proposal.** Define `requireLedgerMember(ctx, ledgerId)` in `sharing-invites.md` §5.7 as
`requireLedgerRole(ctx, ledgerId, 'VIEWER')` (an alias whose name reads correctly at read-only call
sites), keep the two-file split, and add both names to `convex/AGENTS.md` as the only sanctioned entry
points.

**Resolved 2026-08-24:** account gates remain in `convex/lib/permissions.ts`; ledger gates remain in
`convex/lib/ledgerPermissions.ts`. The latter now defines `requireLedgerMember` as the VIEWER-minimum
membership alias plus `requireLedgerRole` for ranked operations. Both import the one `appError`
constructor; `authError` is deleted from the design vocabulary.

## G57 — The invite-link default TTL is 7 days in one document and 30 in another — **NICE**
**Owner: `sharing-invites.md` §2.3 vs `SCHEMA.md` §3.19 / §3.7.**

`sharing-invites.md` §2.3: `expiresAt` default `now + 7d`, server cap ≤ 90 d.
`SCHEMA.md` §3.19: `INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000`, and §3.7's comment says "New links get
30 d." Also `JOIN_REQUEST_TTL_MS` is 14 d in both (consistent), and the 20-active-links cap is in both.

**Proposal.** Pick 7 days (the `sharing-invites.md` §2.9 abuse argument — "the link is dead a week after
the family finished joining" — is the stronger one) and change `SCHEMA.md` §3.19 to
`INVITE_TTL_MS = 7 * DAY` and `INVITE_TTL_MAX_MS = 90 * DAY`.

**Resolved 2026-08-24:** seven days is the default and 90 days the server maximum; join requests remain
14 days.

## G58 — The default locale is `'en'` in one document and `'ko'` in another — **NICE**
**Owner: `auth-onboarding.md` §6.1 vs `money-categories-i18n.md` §3.1.**

`money-categories-i18n.md` §3.1: `DEFAULT_LOCALE: SupportedLocale = 'en'`.
`auth-onboarding.md` §6.1's profile insert: `locale: 'ko', // corrected by the client on first launch`.
`SCHEMA.md` §3.1's `localeValidator` lists `ko` first and comments "ko/en/ja are the launch set".

The auth version is defensible (the user base is Korean) but "corrected by the client on first launch"
means a push sent between account creation and the first `setLocale` goes out in Korean to a Japanese
user — which is the exact legacy defect.

**Proposal.** Have the client pass its resolved device locale as an argument to the sign-in flow (the
OTP provider ids are already locale-scoped, so the locale is *already known* at account creation for the
email path; for the social paths add an optional `locale` to the credentials object), and default to
`'en'` only when nothing is known. Align `DEFAULT_LOCALE` in one place.

**Resolved 2026-08-24:** shared `DEFAULT_LOCALE = 'en'` is the no-signal fallback. Onboarding resolves
and stores device locale before the D6 ready-only notification provider can register a target; locale-
scoped OTP already knows it. No wrong-language push race remains.

## G59 — `handles.check` rate limiting is contradicted between two documents — **NICE**
**Owner: `SCHEMA.md` §2.2 vs `auth-onboarding.md` §15.** See G13; listed separately because it changes
the justification for mounting a Convex component.

**Resolved 2026-08-24:** `handles.check` is deliberately an unlimited cached indexed query. Claim and
rename mutations own the abuse budgets; a write-backed counter on the harmless probe is rejected.

## G60 — `userHandles.by_userId` was dropped from the schema but is still queried — **NICE**
**Owner: `auth-onboarding.md` §10.6.**

`SCHEMA.md` §3.2 ships `by_handleKey`, `by_userId_claimedAt`, `by_userId_releasedAt`.
`auth-onboarding.md` §7 declares `by_userId` and §10.6's history row says
"`by_userId` `.take(HANDLE_HISTORY_LIMIT)`". Use `by_userId_claimedAt` (which additionally orders the
history correctly — the whole point of the row).

**Resolved 2026-08-24:** history is `by_userId_claimedAt.order('desc').take(50)` and the dropped
`by_userId` index is not recreated.

---

# What is NOT a gap — checked and confirmed

So the register is not read as "everything is broken":

- **`DECISIONS.md` §6 (AI agent config) is fully satisfied.** `.agents/skills/` holds 8 skills with a
  `sync-skills.sh`, mirrored into `.claude/skills/`, `.codex/skills/` (with `agents/openai.yaml`),
  `.grok/skills/`, and `.cursor/rules/*.mdc` (9 rules incl. `00-project.mdc`). `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, `CONVENTION.md` and per-directory `AGENTS.md` files exist, and `AGENTS.md` states the
  pagination and no-`any` rules the brief demanded.
- **The unbounded-data requirement is met at the schema level, thoroughly.** `SCHEMA.md` §4's per-screen
  document-count table, §4.6's page ceiling, §5's write-path table and §5.5's function-call budget are
  the most rigorous part of the whole design set, and §4.4/§4.5 catch two real bugs (partial day
  subtotals under sharding; the balance query re-reading 120 documents per expense) that all three
  proposals missed.
- **`research/13` §11's fifteen rules are honoured**, with two deliberate, defended deviations: rule 9
  (`ledgerStats`) is rejected with a strong argument in §2.1/§9 row 1, and rule 7's aggregate component
  is deferred with a stated adoption trigger. Rule 5 has one stray violation (G44); rule 12 has one
  omission (G45).
- **Migration idempotency exists from day one.** Source-bearing tables carry a globally unique legacy
  key plus `by_legacyKey`; G54's two derived sidecars use their documented natural unique indexes.
- **Soft-delete, timezone and money each have exactly one normative rule** (`SCHEMA.md` §7.1, §7.2,
  §7.3), and each is argued from a specific legacy defect.
- **The ledger colour mapping is correct.** `SCHEMA.md` §3.5 marks legacy `3` TEAL as the *fallback* and
  `4` BLUE as the *default*, which matches `research/02` §2.2 (`Ledger.ts` default `color: 4`,
  "Fallback teal"); `research/01` §13's "(default)" annotation on index 3 is the one that is wrong.
- **The auth design's security reasoning is sound** — I2/I3 (never write an unverified `users.email`;
  auto-link only on an audience-bound verified assertion; Naver permanently excluded) closes a real
  account-takeover path, and §10.3's check-then-insert OCC argument for handle uniqueness is correct and
  correctly conditioned (C1/C2/C3).

---

# Suggested order of work

1. **Reconcile the schema references** (G1–G5, G11, G15, G17, G56, G60) — one editing pass, no new
   design thinking, and everything downstream depends on it.
2. **Settle the five semantic conflicts** (G6 currency, G7 legacy type, G8 calendar timezone,
   G12 crons, G13 rate limits, G14 triggers) — each is a decision, not an edit.
3. **Fix the migration against measured data** (G48–G52, G18, G43) before writing a line of importer.
4. **Write the three missing design documents**: `app-shell-and-screens.md` (G22–G31),
   `notifications-push.md` (G20, G21), `privacy-and-compliance.md` (G37, G24, G42).
5. **Close the cross-cutting owners**: errors (G32), offline (G33), observability (G34), boot gate
   (G35), moderation (G36), blobs (G38), a11y (G39), testing/CI (G40), release/store (G41).
6. **Install the missing dependencies and fix `src/theme.ts`** (G46, G30) — mechanical, but the schema
   PR cannot compile without the first three rows of G46's table.
