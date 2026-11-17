# Martie — Convex Backend Conventions (full extraction)

Source of truth: `/Users/hyo/Github/hyodotdev/Martie/convex` (+ `app/`, `src/` for client wiring).
Extracted for the BooKoo greenfield rewrite (Expo SDK 57 + expo-router + Convex + Convex Auth + cpk-ui + kstyled).

Versions in Martie (`/Users/hyo/Github/hyodotdev/Martie/package.json`):
- `convex` `^1.42.3` (installed 1.42.3) — **runtime dependency**
- `@convex-dev/auth` `^0.0.94` (installed 0.0.94) — **devDependency** (works because Convex bundles server code; the `@convex-dev/auth/react` import in `app/_layout.tsx` is still bundled by Metro)
- `@auth/core` `^0.41.3`, `oslo` `^1.2.1`, `resend` `^6.18.1` — devDependencies used by the OTP provider
- `expo` `~57.0.9`, `expo-router` `~57.0.9`, `expo-secure-store` `~57.0.1`, `cpk-ui` `0.7.0`, `kstyled` `0.4.1`, `@shopify/flash-list` `2.0.2`
- Node engines `^22.13.0 || >=24.3.0`, package manager `bun@1.3.13`

**No `@convex-dev` components at all beyond auth.** There is NO `convex/convex.config.ts` (verified: `ls convex/convex.config.ts` → no such file). No `@convex-dev/aggregate`, no `@convex-dev/migrations`, no `@convex-dev/rate-limiter`, no `@convex-dev/action-retrier`, no `convex-helpers`. All aggregation is hand-rolled with `.collect()` + JS reduce, which is the single biggest performance liability in the codebase.

---

## 1. File / folder layout

```
convex/
  schema.ts                 # defineSchema only, imports table defs
  schema/<tableName>.ts     # one file per table, exports `<tableName>Table`
  <domain>/queries.ts       # public queries
  <domain>/mutations.ts     # public + internal mutations
  <domain>/actions.ts       # "use node"-free actions (fetch, storage.store)
  <domain>/helpers.ts       # shared ctx-taking helper functions (NOT convex functions)
  <domain>/types.ts         # plain TS types for the domain
  utils/<name>.ts           # framework-agnostic helpers (no ctx)
  auth.ts, auth.config.ts, http.ts, crons.ts
  ResendOTP.ts, emailTemplates.ts
  internals.ts              # internalAction/internalMutation grab-bag
  actions.ts, queries.ts    # root-level leftovers (legacy, inconsistent)
  migrations.ts, seeds.ts, iap.ts ("use node")
  types.ts
  tsconfig.json
```

Full inventory (73 non-generated files):

| Domain folder | files |
|---|---|
| `appVersion/` | `queries.ts` (24), `mutations.ts` (25) |
| `article/` | `queries.ts` (118), `mutations.ts` (59), `actions.ts` (47) |
| `articleLanguage/` | `queries.ts` (34), `mutations.ts` (28) |
| `category/` | `queries.ts` (38) — no mutations file (seeded via `seeds.ts`) |
| `chat/` | `queries.ts` (24), `mutations.ts` (51), `actions.ts` (123) |
| `dailyChallenge/` | `queries.ts` (252), `mutations.ts` (367) |
| `feather/` | `helpers.ts` (55) only — no convex functions |
| `league/` | `queries.ts` (110), `mutations.ts` (232) |
| `purchase/` | `mutations.ts` (131) — no queries |
| `quiz/` | `queries.ts` (339), `mutations.ts` (66), `types.ts` (17) |
| `quizLanguage/` | `queries.ts` (126), `mutations.ts` (75), `helpers.ts` (33) |
| `quizResult/` | **`query.ts` (278), `mutation.ts` (141)** ← singular, breaks the convention |
| `quizSubmission/` | `queries.ts` (344), `mutations.ts` (174), `helpers.ts` (29) |
| `rank/` | `queries.ts` (104) |
| `referral/` | `queries.ts` (23), `mutations.ts` (101) |
| `reviewQueue/` | `queries.ts` (92), `mutations.ts` (92), `helpers.ts` (34) |
| `user/` | `queries.ts` (95), `mutations.ts` (463) |
| `userCategory/` | **`mutation.ts` (54)** ← singular again |
| `utils/` | `resendClient.ts` (59), `streakDate.ts` (40), `validators.ts` (11) |

**Inconsistency to fix in BooKoo:** `quizResult/query.ts`+`mutation.ts` and `userCategory/mutation.ts` are singular while everything else is plural. This leaks into the client as `api.quizResult.query.getPaginatedResults` vs `api.article.queries.listPaginated`. Pick **plural `queries.ts` / `mutations.ts` / `actions.ts` / `helpers.ts`** and enforce it.

`convex/tsconfig.json` is stock Convex: `strict: true`, `moduleResolution: "Bundler"`, `isolatedModules: true`, `lib: ["ES2021","dom","ES2023.Array"]`, `include: ["./**/*"]`, `exclude: ["./_generated"]`.

---

## 2. `schema.ts` + `schema/` conventions

### 2.1 `convex/schema.ts` (45 lines) — verbatim

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

import {userProfilesTable} from './schema/userProfiles';
import {imagesTable} from './schema/images';
// ... 17 more imports

export default defineSchema({
  ...authTables,
  userProfiles: userProfilesTable,
  images: imagesTable,
  categories: categoriesTable,
  userCategories: userCategoriesTable,
  quizzes: quizzesTable,
  quizResults: quizResultsTable,
  quizLanguages: quizLanguagesTable,
  ranks: ranksTable,
  rankCategories: rankCategoriesTable,
  providers: providersTable,
  chats: chatsTable,
  purchases: purchasesTable,
  appVersions: appVersionsTable,
  articles: articlesTable,
  articleLanguages: articleLanguagesTable,
  dailyChallenges: dailyChallengesTable,
  leagues: leaguesTable,
  reviewQueue: reviewQueueTable,
  quizSubmissions: quizSubmissionsTable,
});
```

Conventions:
- `...authTables` spread first → brings in `users`, `authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`, `authRateLimits`.
- Table key = plural camelCase (`userProfiles`, `quizResults`) except `reviewQueue` (singular collective).
- Every table file: `import {defineTable} from 'convex/server'; import {v} from 'convex/values';` then `export const <name>Table = defineTable({...}).index(...)`.
- No `searchIndex` / `vectorIndex` anywhere.
- No `system fields` declared — `_id` / `_creationTime` are relied upon implicitly.

### 2.2 Every table, verbatim

```ts
// schema/userProfiles.ts
export const userProfilesTable = defineTable({
  userId: v.id('users'),
  email: v.string(),
  displayName: v.string(),
  description: v.optional(v.string()),
  avatarUrlId: v.optional(v.id('_storage')),
  categoryIds: v.optional(v.array(v.id('categories'))),
  level: v.number(),
  totalPoints: v.number(),
  lastQuizCursor: v.optional(v.string()),
  bulbCount: v.optional(v.number()),
  type: v.optional(v.union(v.literal('MARTIE'))),
  deletedAt: v.optional(v.string()),          // ISO datetime string
  isPremium: v.optional(v.boolean()),
  premiumExpiration: v.optional(v.number()),  // epoch ms  ← number
  hasCertifiedBadge: v.optional(v.boolean()),
  updatedAt: v.optional(v.string()),          // ISO datetime string ← string
  currentStreak: v.optional(v.number()),
  longestStreak: v.optional(v.number()),
  lastStreakDate: v.optional(v.string()),     // "2026-04-12"
  streakFreezeCount: v.optional(v.number()),
  lastStreakRecoveryAt: v.optional(v.string()), // "YYYY-MM-DD"
  featherCount: v.optional(v.number()),
  referralCode: v.optional(v.string()),
  referredBy: v.optional(v.id('users')),
  referralCount: v.optional(v.number()),
})
  .index('by_email', ['email'])
  .index('by_user', ['userId'])
  .index('by_referralCode', ['referralCode']);
```

```ts
// schema/quizResults.ts  ← the unbounded, per-user, append-only table (= BooKoo's `transactions`)
export const quizResultsTable = defineTable({
  userId: v.id('users'),
  quizId: v.id('quizzes'),
  categoryName: v.string(),        // DENORMALIZED copy of categories.name
  isCorrect: v.boolean(),
  selectedOptionIndex: v.number(),
  timeSpentMs: v.number(),
  level: v.number(),               // DENORMALIZED copy of quizzes.level
  createdAt: v.string(),           // ISO datetime string, e.g. "2026-04-12T09:33:01.123Z"
  isDaily: v.optional(v.boolean()),
})
  .index('by_user_and_correct', ['userId', 'isCorrect'])
  .index('by_user_and_date', ['userId', 'createdAt'])
  .index('by_user_and_quiz', ['userId', 'quizId'])
  .index('by_quiz', ['quizId']);
```

```ts
// schema/quizzes.ts
export const quizzesTable = defineTable({
  categoryId: v.id('categories'),
  level: v.number(),
  key: v.string(),
  answerKey: v.string(),
  indexes: v.array(v.string()),
  options: v.array(v.object({key: v.string(), isAnswer: v.optional(v.boolean())})),
  youtubeUrl: v.optional(v.string()),
  providerId: v.optional(v.id('providers')),
  creatorUserId: v.optional(v.id('users')),
})
  .index('by_category', ['categoryId'])
  .index('by_provider', ['providerId'])
  .index('by_category_and_level', ['categoryId', 'level'])
  .index('by_key', ['key'])
  .index('by_creator', ['creatorUserId']);
```

```ts
// schema/quizSubmissions.ts — best-in-repo index coverage
export const quizSubmissionsTable = defineTable({
  userId: v.id('users'),
  categoryId: v.id('categories'),
  language: v.union(v.literal('en'), v.literal('ko'), v.literal('ja')),
  question: v.string(),
  options: v.array(v.object({text: v.string(), isAnswer: v.boolean()})),
  answerExplanation: v.optional(v.string()),
  status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
  rejectionReason: v.optional(v.string()),
  reviewedBy: v.optional(v.id('users')),
  reviewedAt: v.optional(v.string()),
  quizId: v.optional(v.id('quizzes')),
  createdAt: v.string(),
})
  .index('by_user', ['userId'])
  .index('by_user_and_createdAt', ['userId', 'createdAt'])
  .index('by_status', ['status'])
  .index('by_status_and_createdAt', ['status', 'createdAt'])
  .index('by_createdAt', ['createdAt'])
  .index('by_user_and_status', ['userId', 'status']);
```

```ts
// schema/leagues.ts
export const leaguesTable = defineTable({
  userId: v.id('users'),
  tier: v.string(),        // "bronze"|"silver"|"gold"|"diamond"|"master" — NOT a v.union!
  weeklyXp: v.number(),
  weekStart: v.string(),   // "2026-04-07" (Monday, UTC)
  groupId: v.string(),     // `${tier}_${weekStart}_${index}` — synthesized string key
})
  .index('by_userId', ['userId'])
  .index('by_group_and_xp', ['groupId', 'weeklyXp'])
  .index('by_weekStart', ['weekStart']);
```

```ts
// schema/ranks.ts — precomputed rollup table (GOOD pattern)
export const ranksTable = defineTable({
  userId: v.id('users'),
  correctCount: v.number(),
  totalAttempts: v.number(),
  accuracy: v.number(),
  lastUpdated: v.number(),   // epoch ms ← number
})
  .index('by_userId', ['userId'])
  .index('by_correctCount', ['correctCount'])
  .index('by_accuracy', ['accuracy']);

// schema/rankCategories.ts — per (user, category) rollup
export const rankCategoriesTable = defineTable({
  userId: v.id('users'),
  categoryId: v.id('categories'),
  correctAnswers: v.number(),
  totalAttempts: v.number(),
  highestLevel: v.number(),
  lastAttemptAt: v.string(),  // ISO datetime string
}).index('by_user_and_category', ['userId', 'categoryId']);

// schema/userCategories.ts — near-duplicate of rankCategories (redundancy smell)
export const userCategoriesTable = defineTable({
  userId: v.id('users'),
  categoryId: v.id('categories'),
  totalAttempts: v.number(),
  correctAnswers: v.number(),
  lastAttemptAt: v.string(),
  highestLevel: v.number(),
})
  .index('by_userId', ['userId'])
  .index('by_userId_and_categoryId', ['userId', 'categoryId']);
```

```ts
// schema/articles.ts — storage-id + external-url dual field
export const articlesTable = defineTable({
  key: v.string(),                                 // "20260411_article_0001"
  categoryName: v.string(),
  thumbnailUrl: v.string(),                        // Unsplash URL
  thumbnailStorageId: v.optional(v.id('_storage')),// Convex storage fallback
  publishedAt: v.string(),                         // ISO date string
})
  .index('by_key', ['key'])
  .index('by_publishedAt', ['publishedAt'])
  .index('by_category', ['categoryName'])
  .index('by_category_and_publishedAt', ['categoryName', 'publishedAt']);

// schema/articleLanguages.ts and schema/quizLanguages.ts — i18n side tables keyed by string
export const quizLanguagesTable = defineTable({
  key: v.string(),        // "20250225_0001_key" | "_answer" | "_opt1"
  language: v.union(v.literal('en'), v.literal('ko'), v.literal('ja')),
  value: v.string(),
  type: v.string(),       // "question" | "answer" | "option"  ← should be v.union
})
  .index('by_key_and_language', ['key', 'language'])
  .index('by_key', ['key'])
  .index('by_language_and_key', ['language', 'key'])
  .index('by_language', ['language']);
```

```ts
// schema/purchases.ts — NOTE: userId points at userProfiles, not users!
export const purchasesTable = defineTable({
  userId: v.id('userProfiles'),   // ← different target table than every other userId
  productId: v.string(),
  amount: v.number(),
  currency: v.string(),
  paymentMethod: v.string(),
  transactionId: v.string(),
  metadata: v.optional(v.any()),  // ← the only v.any() in the schema
  createdAt: v.number(),          // epoch ms ← number
}).index('by_userId', ['userId']);

// schema/dailyChallenges.ts
export const dailyChallengesTable = defineTable({
  date: v.string(),                        // "2026-04-12" UTC
  quizIds: v.array(v.id('quizzes')),       // array of foreign ids (denormalized join)
  categoryId: v.id('categories'),
}).index('by_date', ['date']);

// schema/reviewQueue.ts
export const reviewQueueTable = defineTable({
  userId: v.id('users'),
  quizId: v.id('quizzes'),
  reviewStage: v.number(),      // 0:1d 1:3d 2:7d 3:done — magic numbers, no union
  nextReviewAt: v.string(),     // "2026-04-13"
  createdAt: v.string(),
})
  .index('by_userId', ['userId'])
  .index('by_user_and_quiz', ['userId', 'quizId'])
  .index('by_user_and_next', ['userId', 'nextReviewAt']);

// schema/images.ts — DEAD TABLE (no query/mutation touches it anywhere)
export const imagesTable = defineTable({
  author: v.id('users'),
  body: v.id('_storage'),
  format: v.string(),
});   // ← zero indexes

// schema/chats.ts
export const chatsTable = defineTable({
  message: v.string(),
  reply: v.string(),
  author: v.id('users'),
  isInitialQuestion: v.optional(v.boolean()),
}).index('by_message_and_initial', ['message', 'isInitialQuestion']);
// ← no by_author index: cannot list a user's chats without a full scan

// schema/categories.ts / providers.ts / appVersions.ts
categoriesTable  = defineTable({name: v.string(), description: v.string()}).index('by_name', ['name']);
providersTable   = defineTable({name: v.string(), url: v.optional(v.string()), description: v.optional(v.string())}).index('by_name', ['name']);
appVersionsTable = defineTable({version: v.string(), shouldUpdate: v.boolean(), createdAt: v.number()}).index('by_shouldUpdate', ['shouldUpdate']);
```

### 2.3 Validator style — observations

- `v.optional(...)` is used **liberally on late-added fields** and NOT on original fields. `userProfiles` has 17 optional fields vs 5 required. This is schema drift: every field added after launch was made optional to avoid a migration, and nobody ever backfilled + tightened.
- Enum-ish fields are inconsistent:
  - `quizSubmissions.status` and `*.language` use `v.union(v.literal(...))` ✅
  - `leagues.tier` uses bare `v.string()` with a comment ❌ (the allowed values live in `convex/league/mutations.ts:5` as `const LEAGUE_TIERS = [...] as const`)
  - `quizLanguages.type` / `articleLanguages.type` use bare `v.string()` ❌
  - `userProfiles.type: v.optional(v.union(v.literal('MARTIE')))` — a union of exactly one literal, vestigial.
- `v.any()` appears once: `purchases.metadata`.
- Args validators: **two competing styles** in the same repo.
  - `args: {foo: v.string()}` (object-literal form) — used by ~70% of functions, e.g. `convex/quizResult/mutation.ts`, `convex/article/queries.ts`, `convex/league/mutations.ts`.
  - `args: v.object({foo: v.string()})` (wrapped form) — used by `convex/actions.ts`, `convex/internals.ts`, `convex/user/mutations.ts` (`updateProfile`, `createUserProfile`, `checkIsDeletedUser`, `updateLastUserCursor`, `updateBulbCount`, `syncBulbCount`), `convex/userCategory/mutation.ts`, `convex/chat/actions.ts`.
  - **Neither form is wrong, but pick one.** Object-literal form is the documented Convex style and gives better inference; use it in BooKoo.
- **No `returns:` validator anywhere.** Convex 1.42 supports `returns:` on `query`/`mutation`/`action`; Martie never uses it, so return shapes drift freely between `null`, `[]`, `{page:[],isDone:true,continueCursor:null}` and thrown errors. Adopt `returns:` in BooKoo — it is the cheapest possible contract test.

### 2.4 Index naming convention

Observed grammar: `by_<field>` / `by_<fieldA>_and_<fieldB>`.

| Style | Examples | Count |
|---|---|---|
| `by_<camelField>` matching the field name exactly | `by_userId`, `by_correctCount`, `by_publishedAt`, `by_referralCode`, `by_shouldUpdate`, `by_createdAt`, `by_accuracy`, `by_weekStart` | most |
| `by_<shortened>` (drops the `Id`) | `by_user` (`['userId']`), `by_category` (`['categoryId']`), `by_creator` (`['creatorUserId']`), `by_provider` (`['providerId']`), `by_quiz` (`['quizId']`) | many |
| compound with `_and_` | `by_user_and_date`, `by_user_and_quiz`, `by_user_and_correct`, `by_key_and_language`, `by_category_and_level`, `by_group_and_xp`, `by_status_and_createdAt`, `by_userId_and_categoryId`, `by_user_and_next` | 14 |

**The convention is not self-consistent:** `userProfiles` has `by_user` on `['userId']` while `leagues`/`ranks`/`userCategories` have `by_userId` on `['userId']`. `userCategories` even mixes both in one table (`by_userId` and `by_userId_and_categoryId`). Also `by_user_and_next` names the index after a nickname (`next`) rather than the field (`nextReviewAt`).

**BooKoo rule (recommendation):** index name is mechanically `by_` + the field list joined by `_and_`, using the **exact field identifiers**. `['ledgerId','date']` → `by_ledgerId_and_date`. Zero judgement calls, greppable, and a lint rule can verify it.

### 2.5 Foreign keys

- Always `v.id('<tableName>')`, never a raw string.
- Almost everything references `v.id('users')` (the Convex-Auth table), **not** `v.id('userProfiles')`. The one exception is `purchases.userId: v.id('userProfiles')`, which forces `convex/purchase/mutations.ts:37-40` to first look up the profile before inserting. This split identity (`users._id` for auth, `userProfiles._id` for app data) is the single most confusing thing in the Martie backend.
- Array-of-ids denormalization: `dailyChallenges.quizIds: v.array(v.id('quizzes'))`, `userProfiles.categoryIds: v.optional(v.array(v.id('categories')))`. Works because both are bounded (5 and ~20).
- Cross-table denormalized *copies* (not ids): `quizResults.categoryName` (copy of `categories.name`), `quizResults.level` (copy of `quizzes.level`). Deliberate, to avoid joins in list rendering. Good pattern; no invalidation mechanism exists though.

### 2.6 Timestamps — the inconsistency, and the verdict

Three different representations coexist:

| Representation | Fields |
|---|---|
| `v.number()` epoch ms (`Date.now()`) | `appVersions.createdAt`, `purchases.createdAt`, `ranks.lastUpdated`, `userProfiles.premiumExpiration` |
| `v.string()` full ISO datetime (`new Date().toISOString()`) | `quizResults.createdAt`, `quizSubmissions.createdAt`, `quizSubmissions.reviewedAt`, `rankCategories.lastAttemptAt`, `userCategories.lastAttemptAt`, `reviewQueue.createdAt`, `userProfiles.updatedAt`, `userProfiles.deletedAt` |
| `v.string()` date-only `YYYY-MM-DD` | `dailyChallenges.date`, `leagues.weekStart`, `reviewQueue.nextReviewAt`, `userProfiles.lastStreakDate`, `userProfiles.lastStreakRecoveryAt`, `articles.publishedAt` |

How the date-only convention is centralized — `convex/utils/streakDate.ts` (40 lines, verbatim, this is the *good* part):

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
export function streakToday(): string  { return new Date().toISOString().split('T')[0]; }
export function streakYesterday(): string { return new Date(Date.now() - DAY_MS).toISOString().split('T')[0]; }
/** Lower bound (inclusive) of the UTC day window for `createdAt` filters. */
export function streakDayStart(date: string): string { return date; }
/**
 * Upper bound (exclusive)... Returns the *next day's* `YYYY-MM-DD` so a `.lt(end)`
 * predicate is gap-free. The previous `T23:59:59.999Z` form excluded any record
 * stamped at exactly that millisecond and silently lost data on day boundaries.
 */
export function streakDayEnd(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().split('T')[0];
}
```

The trick that makes it work: because full ISO datetimes (`"2026-04-12T09:33:01.123Z"`) sort lexicographically **within** the same prefix as date-only strings, a range on the string index works:

```ts
// convex/dailyChallenge/queries.ts:120-128 — index range on an ISO-string field
await ctx.db.query('quizResults')
  .withIndex('by_user_and_date', (q) =>
    q.eq('userId', userId)
     .gte('createdAt', streakDayStart(today))   // "2026-04-12"
     .lt('createdAt',  streakDayEnd(today)),    // "2026-04-13"
  )
  .filter((q) => q.eq(q.field('isDaily'), true))
  .collect();
```
This is correct only because ISO-8601 is lexicographically sortable **and** UTC-normalized (`Z` suffix). The file even documents the known KST bug (00:00–09:00 KST maps to the previous UTC day).

**Verdict for BooKoo:** ISO strings "work" but they cost 24 bytes/row vs 8, they cannot be arithmetic'ed without parsing, and they silently break the moment someone writes a non-`Z` offset (`2026-04-12T09:00:00+09:00` sorts wrong). The mixed representation also means `Date.now()` and `new Date().toISOString()` both appear as "now" in the same handler (`convex/purchase/mutations.ts` writes `createdAt: Date.now()` and `updatedAt: new Date().toISOString()` **four lines apart**).

Recommended BooKoo convention:
- **All instants are `v.number()` epoch-ms.** `createdAt`, `updatedAt`, `deletedAt`, `settledAt`.
- **All calendar buckets are a separate, explicitly-named `v.string()` `YYYY-MM-DD`** field — e.g. `date: v.string()` on a transaction — because a ledger genuinely groups by *local calendar day*, and epoch-ms cannot answer "which day is this in the user's timezone" without a stored tz. Store both: `occurredAt: v.number()` (sort/precision) **and** `dateKey: v.string()` (`YYYY-MM-DD` in the ledger's timezone, for grouping and for the index).
- Also store `monthKey: v.string()` (`YYYY-MM`) — a ledger's #1 query is "this month's transactions", and a `by_ledgerId_and_monthKey_and_occurredAt` index answers it in one bounded index range no matter how big the ledger gets. Martie has no analogue and pays for it.
- Never rely on `_creationTime` for domain ordering (Martie mostly doesn't either) — it is immutable and you will eventually need backdated entries, which a ledger absolutely needs.

---

## 3. Shape of a typical query / mutation

### 3.1 Canonical query (best example — `convex/article/queries.ts:31-63`)

```ts
import {query} from '../_generated/server';
import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';

export const listPaginated = query({
  args: {
    categoryName: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, {categoryName, paginationOpts}) => {
    const baseQuery = categoryName
      ? ctx.db.query('articles')
          .withIndex('by_category_and_publishedAt', (q) => q.eq('categoryName', categoryName))
      : ctx.db.query('articles').withIndex('by_publishedAt');

    const paginated = await baseQuery.order('desc').paginate(paginationOpts);

    const page = await Promise.all(
      paginated.page.map(async (article) => {
        let storageThumbnailUrl: string | null = null;
        if (article.thumbnailStorageId) {
          storageThumbnailUrl = await ctx.storage.getUrl(article.thumbnailStorageId);
        }
        return {...article, storageThumbnailUrl};
      }),
    );

    return {...paginated, page};
  },
});
```

Idioms to copy:
- destructure args in the handler signature: `handler: async (ctx, {a, b}) => ...`
- build a `baseQuery` conditionally, choosing a **different index** per filter branch — never `.filter()`
- enrich only `paginated.page` (bounded work), then `return {...paginated, page}` so `usePaginatedQuery` still sees `{page, isDone, continueCursor, splitCursor?, pageStatus?}`

### 3.2 Auth check — there is **no shared helper**

The literal pattern, repeated ~50 times:

```ts
import {getAuthUserId} from '@convex-dev/auth/server';

const userId = await getAuthUserId(ctx);
if (!userId) throw new Error('Not authenticated');
```

but the "else" branch is **completely inconsistent** across the codebase:

| Behaviour on unauthenticated | Where |
|---|---|
| `throw new Error('Not authenticated')` | `user/queries.ts:getUserCategories`, `quizSubmission/mutations.ts:submitQuiz`, `userCategory/mutation.ts`, `dailyChallenge/mutations.ts:grantRecoveryFreeze` |
| `return null` | `user/queries.ts:currentUser` (also wraps everything in try/catch), `user/queries.ts:getBulbCount`, `rank/queries.ts:getMyRank`, `league/queries.ts:getMyLeague`, `referral/mutations.ts:generateReferralCode` |
| `return` (undefined) | `quizResult/query.ts:getLastUserQuizResult`, `quizResult/query.ts:getResultsStats`, `user/mutations.ts:updateUserLevel`, `user/mutations.ts:updateLastUserCursor`, `league/mutations.ts:joinLeague`, `league/mutations.ts:addXp`, `dailyChallenge/mutations.ts:completeDailyChallenge` |
| `return []` / `return 0` / `return false` | `quizSubmission/queries.ts:getMySubmissions`, `reviewQueue/queries.ts:getPendingReviews`/`getPendingCount`, `dailyChallenge/queries.ts:isDailyCompleted` |
| `return {page: [], isDone: true, continueCursor: null}` | `quizResult/query.ts:getPaginatedResults`, `quizSubmission/queries.ts:getMySubmissionsPaginated` |
| `return {success: false, error: 'not_authenticated'}` | `referral/mutations.ts:applyReferral` |
| `await getAuthUserId(ctx).catch(() => null)` | `quiz/queries.ts:124`, `quizResult/query.ts:30`, `dailyChallenge/queries.ts:117` |
| custom message | `convex/actions.ts` → `'Authentication is required to send an inquiry.'`; `user/mutations.ts:updateProfile` → `'Called updateProfile without authentication present'`; `user/mutations.ts:deleteAccount` → `'Called currentUser without authentication present'` (copy-paste bug: wrong function name in the message) |

The **only** real auth helper in the repo is the admin check, `convex/quizSubmission/helpers.ts` (29 lines, verbatim):

```ts
import type {MutationCtx, QueryCtx} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {getAuthUserId} from '@convex-dev/auth/server';

// Keep in sync with src/utils/constants.ts ADMIN_USERS
const ADMIN_EMAILS = [/* redacted: 4 personal admin emails from another project */];

export async function assertAdmin(ctx: MutationCtx | QueryCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  const user = await ctx.db.get(userId);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email as string)) {
    throw new Error('Admin access required');
  }
  return userId;
}
```
Note: a **hardcoded email allowlist duplicated in the client** (`src/utils/constants.ts ADMIN_USERS`), kept in sync by a comment. Do not copy this.

### 3.3 Error style

- Always bare `throw new Error('<English sentence>')`. **No `ConvexError`, no error codes, no i18n keys.** The client cannot distinguish error types; it can only string-match.
- Messages mix registers: `'Not authenticated'`, `'Quiz not found'`, `'Exactly 4 options required'`, `'This display name is already taken.'`, `'Not enough bulbs (need 10)'`, `'Called updateProfile without authentication present'`.
- Some handlers swallow everything: `convex/user/queries.ts:currentUser` wraps the whole body in `try/catch` and returns `null`; `convex/quiz/queries.ts:getQuizzesPaginated` catches and returns `{page: [], continueCursor: null, isDone: true, lastKey: null}`; `convex/quizLanguage/queries.ts:getPaginatedKeys` catches and returns empty. This makes real failures indistinguishable from empty data.
- Some soft-fail with a result object: `referral/mutations.ts:applyReferral` returns `{success:false, error:'invalid_code'|'self_referral'|'already_referred'|'no_profile'|'not_authenticated'}` and `dailyChallenge/mutations.ts:grantRecoveryFreeze` returns `{success:false, reason:'no_streak'|'no_history'|'already_has_freeze'|'not_at_risk'|'cooldown'} as const`. **This discriminated-union style is the best error convention in the repo** — copy it.

### 3.4 Canonical mutation (`convex/quizResult/mutation.ts:7` `saveQuizResult`)

Shape: validate → `getAuthUserId` → `ctx.db.get` the referenced docs → `ctx.db.insert` the event row → **incrementally patch every rollup table** → call domain helpers. Verbatim core:

```ts
export const saveQuizResult = mutation({
  args: {
    quizId: v.id('quizzes'),
    isCorrect: v.boolean(),
    selectedOptionIndex: v.number(),
    timeSpentMs: v.optional(v.number()),
    isDaily: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const {quizId, isCorrect, selectedOptionIndex, timeSpentMs, isDaily} = args;
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const quiz = await ctx.db.get(quizId);
    if (!quiz) throw new Error('Quiz not found');
    const category = await ctx.db.get(quiz.categoryId);
    if (!category) throw new Error('Category not found');

    const resultId = await ctx.db.insert('quizResults', {
      userId, quizId: quiz._id, categoryName: category.name,
      isCorrect, selectedOptionIndex, timeSpentMs: timeSpentMs || 0,
      level: quiz.level, createdAt: new Date().toISOString(),
      ...(isDaily ? {isDaily: true} : {}),
    });

    if (!isCorrect) await enqueueForReview(ctx, userId, quiz._id);

    // upsert rankCategories
    const existingRankCategory = await ctx.db.query('rankCategories')
      .withIndex('by_user_and_category', (q) => q.eq('userId', userId).eq('categoryId', category._id))
      .first();
    if (existingRankCategory) { await ctx.db.patch(existingRankCategory._id, {...}); }
    else { await ctx.db.insert('rankCategories', {...}); }

    // ranks 테이블 증분 업데이트 (전체 collect 대신)   ← "incremental update instead of full collect"
    const existingRank = await ctx.db.query('ranks')
      .withIndex('by_userId', (q) => q.eq('userId', userId)).first();
    const newCorrectCount  = (existingRank?.correctCount  ?? 0) + (isCorrect ? 1 : 0);
    const newTotalAttempts = (existingRank?.totalAttempts ?? 0) + 1;
    const accuracy = (newCorrectCount / newTotalAttempts) * 100;
    if (existingRank) await ctx.db.patch(existingRank._id, {correctCount: newCorrectCount, totalAttempts: newTotalAttempts, accuracy, lastUpdated: Date.now()});
    else await ctx.db.insert('ranks', {correctCount: newCorrectCount, totalAttempts: newTotalAttempts, accuracy, lastUpdated: Date.now(), userId});

    if (isCorrect) await awardFeather(ctx, quiz._id, userId);
    // ... inline league weekStart computation + weeklyXp patch (duplicated from league/mutations.ts)
    return resultId;
  },
});
```

**This is the single most important pattern for BooKoo.** The event row is appended, and every aggregate the UI needs is maintained by O(1) patches at write time. The comment `// ranks 테이블 증분 업데이트 (전체 collect 대신)` records that they had to *retrofit* this after `.collect()` got slow. BooKoo should start here, not retrofit.

Weaknesses to fix: the league-XP block is copy-pasted verbatim into `saveQuizResult`, `updateUserLevel` (`user/mutations.ts:299-318`) and exists a third time as `league/mutations.ts:addXp` — three implementations of the same week-start math. Extract one helper.

### 3.5 Helper convention (`<domain>/helpers.ts`)

Plain async functions taking `ctx` as the first arg, typed `MutationCtx` / `QueryCtx` / `MutationCtx | QueryCtx` imported as `import type {MutationCtx, QueryCtx} from '../_generated/server'`. They are **not** Convex functions (no wrapper), so they compose inside a single transaction. Examples:

- `convex/reviewQueue/helpers.ts` → `enqueueForReview(ctx, userId, quizId): Promise<void>`
- `convex/feather/helpers.ts` → `awardFeather(ctx, quizId, solverId): Promise<void>`
- `convex/quizLanguage/helpers.ts` → `getQuizLanguageMap(ctx, keys: string[], language): Promise<Map<string,string>>` (N indexed `.first()` lookups in `Promise.all`, deduped by `Set`)
- `convex/quizSubmission/helpers.ts` → `assertAdmin(ctx)`
- `convex/user/mutations.ts` also contains module-local helpers that are *not* in a helpers file: `ensureUserProfile`, `ensureUserProfileWithMeta`, `generateUniqueNickname`, `normalizeProfileEmail`, `normalizeExistingProfileEmail`.

`ensureUserProfileWithMeta` (`convex/user/mutations.ts:76-135`) is worth copying as a pattern: idempotent get-or-create keyed on `by_user`, falling back to `by_email` (both normalized and raw), re-pointing an orphaned profile's `userId`, and returning `{profile, isNew}` so the client can fire `signup_completed` exactly once.

### 3.6 Internal functions

`internalQuery` / `internalMutation` / `internalAction` are used, imported from `./_generated/server`, and invoked via `internal.<path>.<fn>`:
- `convex/internals.ts` → `sendEmailAction` (internalAction), `overrideVerificationCode` (internalMutation)
- `convex/category/queries.ts` → `getById` (internalQuery)
- `convex/dailyChallenge/mutations.ts` → `generateDaily` (internalMutation, cron target)
- `convex/league/mutations.ts` → `weeklyReset` (internalMutation, cron target)
- `convex/migrations.ts` → `deleteQuizzesByCategory` (internalMutation)
- `convex/chat/mutations.ts` → `findChatMessage`, `insertChatMessage` (internal, called from `chat/actions.ts` via `ctx.runMutation`)

Scheduling: `await ctx.scheduler.runAfter(0, internal.internals.sendEmailAction, {...})` — `convex/actions.ts:26`. Only one use in the whole repo. No `runAt`, no cancellation, no retry wrapper.

---

## 4. Pagination — every occurrence

### 4.1 The two competing validators

**Official** — `import {paginationOptsValidator} from 'convex/server'` (5 files, 7 sites):
| file:line | function |
|---|---|
| `convex/quiz/queries.ts:113` | `getQuizzesPaginated` |
| `convex/quizSubmission/queries.ts:37` | `getMySubmissionsPaginated` |
| `convex/quizSubmission/queries.ts:253` | `getAdminSubmissionsPaginated` |
| `convex/quizResult/query.ts:23` | `getPaginatedResults` |
| `convex/article/queries.ts:35` | `listPaginated` |
| `convex/rank/queries.ts:17` | `getPaginatedRanks` |

**Home-rolled** — `convex/utils/validators.ts` (11 lines):
```ts
export const paginationOptsValidator = {
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};
```
Used only by `convex/quizLanguage/queries.ts:71-72` (`getPaginatedKeys`), which then calls `.paginate({cursor: args.cursor || null, numItems})` manually and returns `{items, cursor, hasMore}` — a shape `usePaginatedQuery` cannot consume. `convex/queries.ts:getQuizIndexesBatch` does the same by hand with `{cursor, limit}` args and returns `{results, nextCursor, isDone}`. Both are admin/script-only endpoints (`bun queries:getQuizIndexesBatch`). **Delete this pattern; never shadow a framework export's name.**

### 4.2 All 9 `.paginate()` call sites

| file:line | pattern |
|---|---|
| `convex/queries.ts:14` | `.withIndex('by_key').order('asc').paginate({cursor: cursor \|\| null, numItems: limit})` — manual |
| `convex/quizLanguage/queries.ts:97` | `.order('asc').paginate({cursor: args.cursor \|\| null, numItems})` — **no `withIndex`, full-table order** |
| `convex/quiz/queries.ts:167` | `query.paginate({...paginationOpts, numItems: paginationOpts.numItems ?? CLIENT_QUIZ_LIMIT})` after chained `.filter()`s |
| `convex/quiz/queries.ts:187` | fallback re-paginate when the cursor-filtered page came back empty |
| `convex/quizSubmission/queries.ts:53` | `.withIndex('by_user_and_createdAt', q=>q.eq('userId',userId)).order('desc').paginate(paginationOpts)` ✅ |
| `convex/quizSubmission/queries.ts:264` | `baseQuery.order('desc').paginate(paginationOpts)` where baseQuery picks `by_status_and_createdAt` or `by_createdAt` ✅ |
| `convex/quizResult/query.ts:52` | `resultQuery.order('desc').paginate(args.paginationOpts)` — **`resultQuery` has NO index, only `.filter()`** ❌ |
| `convex/article/queries.ts:46` | `baseQuery.order('desc').paginate(paginationOpts)` with index-per-branch ✅ |
| `convex/rank/queries.ts:24` | `.withIndex('by_correctCount').order('desc').paginate(paginationOpts)` ✅ |

### 4.3 Client — `usePaginatedQuery` (6 call sites)

| file:line | query | page size |
|---|---|---|
| `src/hooks/useQuizzes.ts:36` | `api.quiz.queries.getQuizzesPaginated` | `QUIZ_LIMIT` |
| `app/hall-of-fame.tsx:24` | `api.rank.queries.getPaginatedRanks` | `PAGE_SIZE = 30` |
| `app/quiz-results.tsx:25` | `api.quizResult.query.getPaginatedResults` | `LIST_SIZE = 20` |
| `app/admin-quiz-submissions.tsx:185` | `api.quizSubmission.queries.getAdminSubmissionsPaginated` | — |
| `app/my-quizzes.tsx:68` | `api.quizSubmission.queries.getMySubmissionsPaginated` | — |
| `app/_Tabs/TabArticle/TabArticleMobile.tsx:51` | `api.article.queries.listPaginated` | `LIST_SIZE = 20` |

Canonical client shape (`app/hall-of-fame.tsx`):
```tsx
import {PaginatedQueryReference, usePaginatedQuery} from 'convex/react';
import {FlashList} from '@shopify/flash-list';
import {api} from '../convex/_generated/api';
import type {Doc} from '../convex/_generated/dataModel';

const PAGE_SIZE = 30;
type RankItem = Doc<'ranks'> & {user: Doc<'userProfiles'> | null};

const {results, status, loadMore} = usePaginatedQuery(
  api.rank.queries.getPaginatedRanks as unknown as PaginatedQueryReference,
  {},                              // extra args (NOT paginationOpts — the hook injects it)
  {initialNumItems: PAGE_SIZE},
);

const handleLoadMore = useCallback(() => {
  if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
}, [loadMore, status]);
// → <FlashList ... onEndReached={handleLoadMore} onEndReachedThreshold={0.5} />
```

Notes / smells:
- **Every single call site casts**: `as PaginatedQueryReference` or `as unknown as PaginatedQueryReference`. This is because the handlers return hand-built objects (`{page: [], isDone: true, continueCursor: null as string | null}`) that don't structurally match `PaginationResult<T>` — `continueCursor` must be `string`, not `string | null`. The cast defeats arg type-checking too. **Fix in BooKoo by always returning the spread of the real `paginate()` result (`{...paginated, page}`) and never fabricating an empty result object.** If you must short-circuit, return `{page: [], isDone: true, continueCursor: ''}`.
- `src/hooks/useQuizzes.ts:36-47` passes `paginationOpts: {initialNumItems: ...}` **inside the args object AND** as the third hook argument — redundant/wrong; the hook owns `paginationOpts`.
- `status` values used: `'CanLoadMore'`, `'LoadingMore'`, `'Exhausted'`. `isLoading` is used for the footer spinner.
- The repo has an explicit written rule (`CLAUDE.md` + `AGENTS.md`, "List & Pagination Rules"):
  > Any list backed by user-generated, server-side, or otherwise unbounded data must use `FlashList`. Do not render unbounded data with `ScrollView + array.map()` or fetch the full collection with `useQuery`/Convex `.collect()` for screen lists. Pair `FlashList` with Convex pagination (`paginationOptsValidator` on the query, `usePaginatedQuery` on the client) and load more via `onEndReached`. If a query can grow over time, add the right index for the list sort/filter before adding pagination.

  **Adopt this rule verbatim in BooKoo's CLAUDE.md.** It is well written; Martie just doesn't enforce it (see §5).

---

## 5. Index usage vs `.filter()` — the perf audit

`.filter((q) => ...)` appears at **37 sites**. Convex `.filter()` is a post-read predicate: it scans every document the index/table stream produces. On an unbounded table it is O(rows).

### 5.1 The dangerous ones (unbounded table, no index narrowing)

| file:line | code | why it's bad |
|---|---|---|
| `convex/quizResult/query.ts:42` | `let resultQuery = ctx.db.query('quizResults'); resultQuery = resultQuery.filter(q => q.eq(q.field('userId'), userId));` then `.order('desc').paginate(...)` | **Full-table descending scan of `quizResults` filtered to one user.** The `by_user_and_date` index exists and is unused. Every "load more" re-scans from the global newest row. This is exactly the class of bug that makes a ledger app slow as it grows. |
| `convex/quizResult/query.ts:45` | additional `.filter(q => q.eq(q.field('isCorrect'), args.isCorrect))` on the same stream | compounds it; `by_user_and_correct` exists and is unused |
| `convex/quizResult/query.ts:179` `getResultsStats` | `ctx.db.query('quizResults').filter(q => q.eq(q.field('userId'), userId)).collect()` | **loads the user's entire history into memory** to compute 3 numbers. Grows without bound. |
| `convex/quizResult/query.ts:201` `getResultsStatsByCategory` | same `.collect()` of all results + `ctx.db.get` per unique quiz + per category | same, plus N+1 |
| `convex/quizResult/query.ts:105-131` (inside `getPaginatedResults`) | for **each** quizId on the page, `.withIndex('by_user_and_quiz').collect()` to compute attempts/accuracy | 20 extra collects per page render |
| `convex/rank/queries.ts:65` `getMyRank` | `ctx.db.query('ranks').filter(q => q.gt(q.field('correctCount'), myRank.correctCount)).collect()` then `.length + 1` | **computes rank position by collecting every better-ranked user.** Full scan of `ranks` (one row per user) on every profile render. `by_correctCount` index exists but `.filter()` is used instead of a `withIndex` range. |
| `convex/rank/queries.ts:80-84` `getTopRanks` | `.withIndex('by_correctCount').order('desc').collect()` then `.slice(0, limit)` | collects **all** ranks to take N. `.take(limit)` was right there. |
| `convex/quiz/queries.ts:149,154,163,182` `getQuizzesPaginated` | `.withIndex('by_key')` then `.filter(q => q.or(...categoryIds.map(id => q.eq(q.field('categoryId'), id))))` and `.filter(q => q.gt(q.field('key'), paginationKey))` | index only provides ordering; both real predicates are post-scan. With a user-cursor deep in the key space this scans everything before it, every page. There is even a fallback re-paginate at :187 when the filtered page comes back empty. |
| `convex/quiz/queries.ts:293-303` `getByKeys` | `.filter(q => q.and(q.or(...keys.map(k => q.eq(q.field('key'), k)))))` `.collect()` | full scan; should be `Promise.all(keys.map(k => withIndex('by_key').first()))` like `quizLanguage/helpers.ts` does |
| `convex/quiz/queries.ts:325-330` `getQuizzes` / `getAllQuizKeys` | `ctx.db.query('quizzes').collect()` with no bound | unbounded |
| `convex/dailyChallenge/mutations.ts:96-100` `generateDaily` | `.withIndex('by_category').collect()` of every quiz in a category, then Fisher-Yates shuffle in JS | grows with content |
| `convex/quizSubmission/queries.ts:169` `getAdminSubmissions` | `ctx.db.query('quizSubmissions').collect()` + per-row `by_quiz` collect | unbounded admin screen (a paginated twin exists at :250 — the unpaginated one was never deleted) |
| `convex/quizSubmission/queries.ts:216-225` `getAdminSubmissionStats` | three `.withIndex('by_status').collect()` just to get `.length` | count-by-collect; this is what `@convex-dev/aggregate` exists for |
| `convex/league/queries.ts:52-55` `getMyLeague` | `.withIndex('by_group_and_xp', q => q.eq('groupId', ...)).collect()` | bounded to 30 by design ✅ acceptable |
| `convex/league/mutations.ts:210-215` `findOrCreateGroup` | `.withIndex('by_weekStart').collect()` then `.filter(q => q.eq(q.field('tier'), tier))` | scans every league row for the week — grows with MAU |
| `convex/reviewQueue/queries.ts:80-86` `getPendingCount` | `.withIndex('by_user_and_next', q => q.eq(...).lte(...)).collect()` then `.length` | index-bounded ✅ but still a collect-to-count for a **tab badge that renders on every screen** |
| `convex/articleLanguage/queries.ts:27-32` `getByLanguage` | `.withIndex('by_language').collect()` | returns every article string for a language |
| `convex/category/queries.ts:11` / `:35` | `query('categories').collect()` / `.filter(q => q.eq(q.field('name'), name)).first()` | table is ~20 rows so the collect is fine, but `getByName` ignores the existing `by_name` index for no reason |
| `convex/appVersion/mutations.ts:12` | `.filter(q => q.eq(q.field('version'), version))` | no `by_version` index exists; tiny table |
| `convex/purchase/mutations.ts:48-52` | `.withIndex('by_userId').filter(q => q.eq(q.field('transactionId'), args.transactionId))` | index narrows to one user first ✅ but a `by_transactionId` unique index would be the correct dedup key |
| `convex/user/mutations.ts:51` `generateUniqueNickname` | `.filter(q => q.eq(q.field('displayName'), nickname)).first()` **inside a `while(true)` loop** | full-table scan per iteration; no `by_displayName` index exists |
| `convex/user/mutations.ts:174` `updateProfile` | `.filter(q => q.and(q.eq(q.field('displayName'), args.displayName))).first()` | same missing index; runs on every profile save |
| `convex/actions.ts:18`, `user/queries.ts:13`, `user/queries.ts:64`, `user/mutations.ts:158,222,339` | `ctx.db.query('users').filter(q => q.eq(q.field('_id'), userId)).first()` | **anti-pattern: a full-table scan to fetch a document by its own `_id`.** Should be `await ctx.db.get(userId)`. Appears 6 times. `quiz/queries.ts:299` does the same for quizzes. |
| `convex/user/queries.ts:90` `getBulbCount` | `.filter(q => q.eq(q.field('userId'), userId)).first()` | `by_user` index exists and is used 20 lines above in the same file |
| `convex/rank/queries.ts:53,60,93` | `.withIndex('by_userId').filter(q => q.eq(q.field('userId'), userId))` and bare `.filter` on `userProfiles` | redundant filter after the index at :53; bare scan at :60/:93 |

### 5.2 Where `.filter()` is legitimately used

After an index has already narrowed the stream to a small bounded set, `.filter()` for a secondary predicate is fine and Martie does this correctly in:
- `dailyChallenge/queries.ts:120-128, 220-228, 247-255` and `dailyChallenge/mutations.ts:158-166` — `by_user_and_date` range over one UTC day, then `.filter(isDaily === true)`. At most a few rows/day. ✅
- `feather/helpers.ts:22-24, 34-42` — `by_user_and_quiz` narrows to one (user, quiz) pair, then filters `isCorrect`. ✅
- `quizResult/query.ts:94` — `by_key_and_language` narrows to one row, then `.filter(type === 'question')`. ✅
- `quizSubmission/queries.ts:61, 101` — `by_quiz` narrows, then `.filter(neq userId)`. Bounded by that quiz's solve count (unbounded in theory). ⚠️

**Rule for BooKoo:** `.filter()` is only permitted when the preceding `withIndex(...)` already bounds the stream to a documented constant (≤ ~100 rows). Everything else must be expressed as index fields. Add a lint/review checklist item.

### 5.3 `.collect()` census (52 sites)

`convex/quizSubmission/queries.ts` 10, `convex/quiz/queries.ts` 8, `convex/quizLanguage/queries.ts` 4, `convex/quizResult/query.ts` 3, `convex/dailyChallenge/mutations.ts` 3, `convex/migrations.ts` 2, `convex/internals.ts` 2, `convex/articleLanguage/queries.ts` 2, `convex/league/mutations.ts` 2, `convex/rank/queries.ts` 2, and 1 each in `appVersion/queries.ts`, `article/queries.ts`, `dailyChallenge/queries.ts`, `category/queries.ts`, `league/queries.ts`, `reviewQueue/queries.ts`, `userCategory/mutation.ts`.

---

## 6. Auth, HTTP, crons, email

### 6.1 `convex/auth.ts` (10 lines) — entire file

```ts
import {convexAuth} from '@convex-dev/auth/server';
import {ResendOtpMartieEn, ResendOtpMartieJa, ResendOtpMartieKo} from './ResendOTP';

export const {auth, signIn, signOut, store, isAuthenticated} = convexAuth({
  providers: [ResendOtpMartieEn, ResendOtpMartieKo, ResendOtpMartieJa],
});
```
**Email-OTP only.** No OAuth providers at all — no Google, Apple, Kakao, or Naver. BooKoo needs all of those, so this file is a starting point, not a template: you'll add `@auth/core/providers/Google`, `Apple`, and custom OIDC/OAuth configs for Kakao/Naver, plus `SITE_URL`/`JWT_PRIVATE_KEY`/`JWKS` env vars that Martie doesn't need.

### 6.2 `convex/auth.config.ts` (8 lines) — entire file

```ts
export default {
  providers: [{domain: process.env.CONVEX_SITE_URL, applicationID: 'convex'}],
};
```

### 6.3 `convex/http.ts` (10 lines) — entire file

```ts
//* This file is needed for convex auth
import {httpRouter} from 'convex/server';
import {auth} from './auth';

const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```
**No custom HTTP endpoints at all** — no webhooks, no OG image routes, no RevenueCat/store-server-notification receiver. BooKoo will likely need `http.route(...)` for OAuth callbacks if Kakao/Naver need a redirect handler.

### 6.4 `convex/crons.ts` (20 lines) — entire file

```ts
import {cronJobs} from 'convex/server';
import {internal} from './_generated/api';

const crons = cronJobs();

crons.daily('generate daily challenge', {hourUTC: 0, minuteUTC: 0},
  internal.dailyChallenge.mutations.generateDaily);

crons.weekly('weekly league reset', {dayOfWeek: 'monday', hourUTC: 0, minuteUTC: 0},
  internal.league.mutations.weeklyReset);

export default crons;
```
Both targets are `internalMutation`s. `generateDaily` is idempotent (checks `by_date` first, returns the existing `_id`). `weeklyReset` is **not** idempotent and does an unbounded `.collect()` of the previous week's leagues then patches every row in one transaction — this will hit Convex's per-transaction limits as MAU grows.

### 6.5 `convex/ResendOTP.ts` (143 lines)

Uses `Email` from `@convex-dev/auth/providers/Email`, `generateRandomString`/`alphabet` from `oslo/crypto`, `sha256` from `@oslojs/crypto/sha2`, `encodeHexLowerCase` from `@oslojs/encoding`.

```ts
const createResendOtpProvider = (id: string, locale: MartieLocale) =>
  Email({
    id,
    apiKey: RESEND_API_KEY,               // process.env.AUTH_RESEND_KEY
    maxAge: 60 * 15,                      // 15 minutes
    async generateVerificationToken() {
      return generateRandomString(8, alphabet('0-9'));   // 8-digit numeric OTP
    },
    async sendVerificationRequest({identifier: email, provider, token}, ctx?) {
      if (await tryApplyFixedOtp(ctx, email, token, provider.id)) return;
      const template = emailTemplatesMartie[locale];
      await sendResendEmail(provider.apiKey ?? RESEND_API_KEY, {
        from: `Martie <${FROM_EMAIL}>`, to: [email],
        subject: template.subject, text: template.text(token), html: template.html(token),
      });
    },
  });

export const ResendOtpMartieEn = createResendOtpProvider('resend-otp', 'en');
export const ResendOtpMartieKo = createResendOtpProvider('resend-otp-ko', 'ko');
export const ResendOtpMartieJa = createResendOtpProvider('resend-otp-ja', 'ja');
```

**Localized auth via one provider id per locale** — the client picks `signIn('resend-otp-ko', …)`. Clean, worth copying for BooKoo (ko/en at minimum).

The `tryApplyFixedOtp` mechanism (lines 46-106) exists so App-Store/Play reviewers and dev accounts get a fixed code. It calls `internal.internals.overrideVerificationCode`, which finds the `authAccounts` row via the auth-provided `providerAndAccountId` index, keeps only the newest `authVerificationCodes` row, deletes duplicates and any row already holding the fixed hash, then patches `code` to `sha256(fixedCode)`. Env: `APP_REVIEW_FIXED_OTP_EMAILS` / `APP_REVIEW_FIXED_OTP_EMAIL`, `APP_REVIEW_FIXED_OTP_CODE`, `DEV_FIXED_OTP_EMAILS` (default `reviewer-a@example.com,reviewer-b@example.com`), `DEV_FIXED_OTP_CODE` (default `'00000000'`). **Very useful for store review; copy the idea, but note it reaches into `@convex-dev/auth`'s private tables and will break on auth upgrades.**

`FROM_EMAIL` = `onboarding@resend.dev` when `ENVIRONMENT !== 'production'`, else `martie@hyo.dev`.

### 6.6 `convex/utils/resendClient.ts` (59 lines)

Raw `fetch` against `https://api.resend.com/emails` — **no `resend` npm client at runtime** (it's a devDependency only). Guard: if `process.env.ENVIRONMENT !== 'production'` it logs and returns `{skipped: true}` without sending. Throws on `!response.ok || data?.error`. `ResendEmailPayload` interface exported.

`convex/emailTemplates.ts` (177 lines) exports `emailTemplatesMartie` keyed `en|ko|ja`, each `{subject, text(token), html(token)}`.

### 6.7 Convex env vars referenced

`AUTH_RESEND_KEY`, `CONVEX_SITE_URL`, `ENVIRONMENT`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `APP_REVIEW_FIXED_OTP_CODE`, `APP_REVIEW_FIXED_OTP_EMAIL(S)`, `DEV_FIXED_OTP_CODE`, `DEV_FIXED_OTP_EMAILS`.
Client env (`.env.sample`): `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL`.

### 6.8 `"use node"` actions

Only `convex/iap.ts` (116 lines) starts with `"use node";` — it imports `googleapis` to mint a Google Play `androidpublisher` access token from `GOOGLE_SERVICE_ACCOUNT_KEY`. `convex/chat/actions.ts` (OpenAI via `fetch`) and `convex/article/actions.ts` (fetch + `ctx.storage.store`) run in the default Convex runtime. **Keep `"use node"` files quarantined** — they're slower to cold-start and can't be in the same file as default-runtime functions.

### 6.9 `convex/migrations.ts` (67 lines) and `convex/seeds.ts` (349 lines)

- `migrations.ts` holds a single `internalMutation` `deleteQuizzesByCategory({category: v.string()})` that cascades: find category by `by_name` → `by_category` collect quizzes → for each, `by_key` collect `quizLanguages` and delete → delete quiz → delete category. Returns `{success, deletedQuizzes, deletedLanguages, message}`. **No migration framework, no versioning, no batching/continuation** — a one-off script that would blow the transaction limit on a large category.
- `seeds.ts` exports `insertCategories` (mutation) and `importAllQuizzes` / `importAllQuizLanguages` (actions reading `../scripts/_seeds/20260528_quiz`). Invoked from package.json: `convex run seeds:insertCategories`, `npx convex run seeds:importAllQuizzes`, `npx convex run migrations:deleteQuizzesByCategory '{"category":"CURRENT_AFFAIRS"}'`.

---

## 7. File storage (`_storage`)

Fields: `userProfiles.avatarUrlId: v.optional(v.id('_storage'))`, `articles.thumbnailStorageId: v.optional(v.id('_storage'))`, `images.body: v.id('_storage')` (dead table).

**Write path** — exactly one, in an action (`convex/article/actions.ts:19-33`):
```ts
const response = await fetch(article.thumbnailUrl);
const blob = await response.blob();
const storageId = await ctx.storage.store(blob);
await ctx.runMutation(api.article.mutations.updateThumbnailStorageId, {key: article.key, storageId});
```
**There is NO `ctx.storage.generateUploadUrl()` anywhere in the repo, and no client-side upload code.** `userProfiles.avatarUrlId` is accepted by `updateProfile`'s args (`avatarUrlId: v.optional(v.id('_storage'))`) but nothing in `app/` or `src/` ever produces one — avatars are effectively write-dead. There is also no `ctx.storage.delete()` anywhere, so orphaned files are never reclaimed.

**Read path** — `ctx.storage.getUrl(id)` called per-document at query time, 6 sites:
`convex/user/queries.ts:28` (wrapped in try/catch → `null`), `convex/quiz/queries.ts:238`, `convex/dailyChallenge/queries.ts:83`, `convex/article/queries.ts:20, 52, 79, 103`.

**No caching whatsoever.** `article/queries.ts:listPaginated` awaits `getUrl` for every row of every page on every reactive re-run. The URL is not persisted, not memoized, and not batched. `articles` keeps a second field `thumbnailUrl` (the original Unsplash URL) as a fallback, so the client has to pick `storageThumbnailUrl ?? thumbnailUrl`.

**For BooKoo:** receipts/attachments on a ledger are a real use case. Do it properly:
1. `generateUploadUrl()` mutation → client `PUT`s the file → client calls a mutation with the returned `storageId`.
2. Store the storage id on the row, and resolve URLs **lazily on the detail screen only**, not in list queries. If a list needs thumbnails, cache the resolved URL string on the document (`thumbUrl: v.optional(v.string())`) and refresh it from a cron/action, or use `expo-image` with a stable `storageId`-derived cache key.
3. Delete the blob in the same mutation that deletes the row (`ctx.storage.delete`).

---

## 8. Client wiring (`app/_layout.tsx`)

```tsx
import * as SecureStore from 'expo-secure-store';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
import {ConvexReactClient, useConvexAuth} from 'convex/react';

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// …RootLayout (app/_layout.tsx:545-559)
<RootProvider initialThemeType={isDarkMode ? 'dark' : 'light'}>
  <GrowtokiRootProvider>
    <ConvexAuthProvider
      client={convex}
      storage={Platform.OS === 'android' || Platform.OS === 'ios' ? secureStorage : undefined}
    >
      <App />
    </ConvexAuthProvider>
  </GrowtokiRootProvider>
</RootProvider>
```

- `ConvexReactClient` is a **module-level singleton** created at import time, outside React.
- `unsavedChangesWarning: false` — needed for RN/web parity.
- Secure token storage on native only; web falls back to the provider default (localStorage).
- Provider nesting order: `GestureHandlerRootView` → `RootProvider` (cpk-ui theme, `initialThemeType` read synchronously from MMKV `storage.getBoolean(Storage.ThemeType)`) → analytics provider → `ConvexAuthProvider` → `App`. **Theme provider is OUTSIDE Convex**, so the first paint never waits on auth. Copy this ordering for BooKoo's dark/light mode.
- Auth state consumed with `const {isAuthenticated, isLoading: isAuthLoading} = useConvexAuth()` inside `App`.
- API import path is inconsistent: `import {api} from '../convex/_generated/api'` (relative) in `app/hall-of-fame.tsx` and `src/hooks/useQuizzes.ts`, vs `import {api} from '@/convex/_generated/api'` in `app/quiz-results.tsx`. `tsconfig.json` defines `"paths": {"@/*": ["./*"]}`. **Pick `@/convex/_generated/api` everywhere in BooKoo.**
- Note `tsconfig.json`'s `include` does **not** list `convex/**`; `convex/tsconfig.json` typechecks that tree separately.

---

## 9. What Martie does WELL (copy these)

1. **One file per table in `convex/schema/<table>.ts`, `schema.ts` is a pure manifest.** Scales cleanly, diffs cleanly, and `...authTables` spread keeps auth tables out of your way.
2. **Per-domain folders with `queries.ts` / `mutations.ts` / `actions.ts` / `helpers.ts`.** The generated `api.<domain>.<file>.<fn>` path is self-documenting on the client.
3. **`helpers.ts` holding plain `(ctx, ...)` functions**, typed with `MutationCtx`/`QueryCtx`, composed inside one transaction. `enqueueForReview`, `awardFeather`, `getQuizLanguageMap`, `assertAdmin`.
4. **Incrementally-maintained rollup tables** (`ranks`, `rankCategories`) patched at write time in `saveQuizResult`, explicitly replacing an earlier `.collect()` implementation. This is the correct answer to unbounded data.
5. **`getQuizLanguageMap` batching pattern**: dedupe keys with a `Set`, then `Promise.all` of N indexed `.first()` calls, return a `Map`. Avoids both N+1 sequential awaits and a full-table scan.
6. **Idempotent get-or-create** with `{profile, isNew}` return (`ensureUserProfileWithMeta`) so the client can fire one-time analytics correctly.
7. **Idempotent cron target** (`generateDaily` checks `by_date` first).
8. **Discriminated-union soft errors** — `{success: false, reason: 'cooldown'} as const` in `grantRecoveryFreeze`, `{success:false, error:'invalid_code'}` in `applyReferral`. Typed, i18n-able on the client, no string matching.
9. **Centralized date-boundary module** (`utils/streakDate.ts`) with the timezone convention documented in the file header, including the known KST limitation and a comment explaining why `.lt(nextDay)` replaced `T23:59:59.999Z`.
10. **Localized auth providers by id** (`resend-otp`, `resend-otp-ko`, `resend-otp-ja`).
11. **Fixed-OTP escape hatch** for App Store / Play review accounts, env-gated and prod-safe.
12. **Non-prod email send guard** in `sendResendEmail` (`ENVIRONMENT !== 'production'` → log and skip).
13. **Provider ordering in `_layout.tsx`** — theme outside Convex so first paint is instant.
14. **The written List & Pagination rule** in `CLAUDE.md`/`AGENTS.md` (index → paginate → FlashList → onEndReached).
15. **`FlashList` + `usePaginatedQuery` + `status === 'CanLoadMore'` guard** as the standard list recipe.
16. **Denormalized display fields on the event row** (`quizResults.categoryName`, `.level`) so list rendering needs zero joins.

---

## 10. What I would do DIFFERENTLY for BooKoo (unbounded rows per user)

A shared ledger has the exact shape Martie struggled with: one append-only table (`transactions`) that grows forever, scoped to a *group* (ledger) rather than a single user, read constantly in date-ordered lists and in aggregates ("this month's total", "by category").

### 10.1 Non-negotiables

| # | Rule | Rationale from Martie |
|---|---|---|
| D1 | **Every query over an unbounded table must start with `withIndex` that pins at least the tenant key.** `.filter()` may only refine an already-bounded stream. | `quizResult/query.ts:42` full-scans `quizResults` filtered to a user, with a perfectly good `by_user_and_date` index sitting unused. This is *the* legacy-slowness bug. |
| D2 | **No `.collect()` on a per-user/per-ledger table. Ever.** Use `.take(n)`, `.paginate()`, or a rollup row. Add a review checklist item; consider an ESLint rule banning `.collect()` outside `convex/seeds.ts`/`migrations.ts`. | 52 `.collect()` sites; `getResultsStats` loads a user's whole history to produce 3 integers. |
| D3 | **Aggregates are rows, not scans.** Maintain `ledgerMonthlyTotals` / `ledgerCategoryTotals` incrementally in the same mutation that writes the transaction, `+=` on create, `-=` on delete, `-old +new` on edit. | Martie retrofitted exactly this for `ranks` (`// ranks 테이블 증분 업데이트 (전체 collect 대신)`) but never did it for `quizResults` stats. |
| D4 | **Use `@convex-dev/aggregate`** (`convex/convex.config.ts` + `app.use(aggregate)`) for sums/counts/offsets you can't hand-maintain — especially "what is my rank/position" and running balances. | `rank/queries.ts:getMyRank` computes position by collecting every better row. `getAdminSubmissionStats` counts by collecting. Both are textbook aggregate-component cases. Martie uses **zero** components. |
| D5 | **Use `@convex-dev/migrations`** for schema evolution with batching + continuation, and actually backfill + tighten `v.optional()` afterwards. | `userProfiles` has 17 optional fields because nobody wanted to write a migration. `convex/migrations.ts` is one unbatched delete script. |
| D6 | **Use `@convex-dev/rate-limiter`** on OTP requests, invite sends, and any mutation reachable pre-auth. | Martie has none; `generateUniqueNickname`'s `while(true)` + full-scan loop is a self-inflicted DoS. |
| D7 | **Declare `returns:` validators on every public function.** | Zero in Martie → return shapes drift → every client `usePaginatedQuery` call needs `as unknown as PaginatedQueryReference`. |
| D8 | **Never fabricate a pagination result.** On the empty/unauthorized path return `{page: [], isDone: true, continueCursor: ''}` (string, not `null`) or better, let the query be `'skip'`-ed on the client. | `continueCursor: null as string \| null` is why 6/6 client call sites cast. |
| D9 | **One time convention: `v.number()` epoch-ms for instants + explicit `dateKey`/`monthKey` `YYYY-MM-DD`/`YYYY-MM` strings for calendar grouping.** Store the ledger's IANA timezone on the ledger row and derive keys from it server-side. | Martie mixes three representations, sometimes two in adjacent lines (`purchase/mutations.ts`), and its UTC-day convention produces a documented 9-hour bug for Korean users — unacceptable for a Korean 가계부. |
| D10 | **Index naming is mechanical: `by_` + exact field identifiers joined by `_and_`.** | `by_user` vs `by_userId` for the same field across tables; `by_user_and_next` for `nextReviewAt`. |
| D11 | **One shared auth helper module, `convex/lib/auth.ts`,** exporting `requireUser(ctx): Promise<Id<'users'>>` (throws `ConvexError`), `getUser(ctx): Promise<Id<'users'> | null>` (nullable), and `requireLedgerMember(ctx, ledgerId): Promise<{userId, membership}>`. Every function uses exactly one of them. | Martie has 8 different unauthenticated behaviours across ~50 hand-written checks, and its only helper is a hardcoded email allowlist duplicated in the client. |
| D12 | **`ConvexError` with a structured payload** (`throw new ConvexError({code: 'LEDGER_FORBIDDEN', ...})`), never bare `Error` with an English sentence. i18n happens on the client from `code`. | Martie throws English strings from a tri-lingual app; the client cannot localize them. |
| D13 | **Single canonical user identity.** Either put all app fields on the Convex-Auth `users` table, or make *every* foreign key point at `userProfiles`. Do not split. | `purchases.userId: v.id('userProfiles')` while everything else uses `v.id('users')` forces a lookup hop and is a live footgun. |
| D14 | **Plural file names everywhere: `queries.ts` / `mutations.ts` / `actions.ts` / `helpers.ts`.** | `quizResult/query.ts` and `userCategory/mutation.ts` leak into the public API path. |
| D15 | **`args:` as an object literal, never `v.object({...})`.** | Both styles exist in Martie. |
| D16 | **Never fetch a doc by `_id` with a query+filter.** `ctx.db.get(id)`. | 7 occurrences of `.query('users').filter(q => q.eq(q.field('_id'), userId)).first()`. |
| D17 | **Client-side: import `api` via the `@/convex/_generated/api` alias, always.** | Mixed relative/alias imports in Martie. |
| D18 | **Never swallow errors into empty data.** Let it throw and render an error state; log with `console.error` *and* rethrow. | `currentUser`, `getQuizzesPaginated`, `getPaginatedKeys` all return "empty" on failure, making outages look like empty accounts. |

### 10.2 Concrete BooKoo schema sketch implied by the above

```ts
// convex/schema/transactions.ts — the unbounded table
export const transactionsTable = defineTable({
  ledgerId: v.id('ledgers'),          // tenant key — FIRST field of every index
  createdBy: v.id('users'),
  type: v.union(v.literal('expense'), v.literal('income'), v.literal('transfer')),
  amount: v.number(),                 // minor units (integer), never float
  currency: v.string(),               // ISO-4217
  categoryId: v.id('categories'),
  accountId: v.optional(v.id('accounts')),
  memo: v.optional(v.string()),
  receiptStorageId: v.optional(v.id('_storage')),
  occurredAt: v.number(),             // epoch ms — precision + sort
  dateKey: v.string(),                // "2026-08-24" in the ledger's tz
  monthKey: v.string(),               // "2026-08"  in the ledger's tz
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),  // soft delete
})
  .index('by_ledgerId_and_occurredAt',            ['ledgerId', 'occurredAt'])
  .index('by_ledgerId_and_monthKey_and_occurredAt',['ledgerId','monthKey','occurredAt'])
  .index('by_ledgerId_and_categoryId_and_occurredAt',['ledgerId','categoryId','occurredAt'])
  .index('by_ledgerId_and_createdBy_and_occurredAt',['ledgerId','createdBy','occurredAt']);

// convex/schema/ledgerMonthlyTotals.ts — D3 rollup, patched in the same mutation
export const ledgerMonthlyTotalsTable = defineTable({
  ledgerId: v.id('ledgers'),
  monthKey: v.string(),
  currency: v.string(),
  incomeMinor: v.number(),
  expenseMinor: v.number(),
  txCount: v.number(),
  updatedAt: v.number(),
}).index('by_ledgerId_and_monthKey_and_currency', ['ledgerId','monthKey','currency']);
```
The month list screen then reads `by_ledgerId_and_monthKey_and_occurredAt` with `paginate()` (bounded, index-only, no `.filter()`), and the header total reads **one row** from `ledgerMonthlyTotals` — constant time regardless of ledger size. That is the whole answer to "the legacy app got slow as ledgers grew."

### 10.3 Things Martie lacks that BooKoo needs from day one

- **Multi-tenant authorization.** Martie only ever checks "is this row mine". BooKoo needs `ledgerMembers` (`ledgerId`, `userId`, `role: v.union(v.literal('owner'),v.literal('editor'),v.literal('viewer'))`, indexed `by_ledgerId_and_userId` and `by_userId`) and a `requireLedgerMember` helper called at the top of **every** ledger-scoped function. Getting this wrong is a data-leak, not a perf bug.
- **OAuth providers** (Kakao / Naver / Google / Apple) in `convex/auth.ts` + probably custom `http.route` callbacks. Martie is OTP-only.
- **Real file upload** (`generateUploadUrl`) for receipts, plus `ctx.storage.delete` on row delete. Martie has neither.
- **`returns:` validators** and structured `ConvexError`s.
- **A components layer** (`convex/convex.config.ts`) — aggregate at minimum.
- **Optimistic updates** on transaction create/edit for snappiness. Martie uses none (`useMutation` only, no `.withOptimisticUpdate`). For a data-entry app where the user taps "save" and expects the list to update instantly, this matters.
- **Deletion cascade / soft-delete policy.** Martie's `deleteAccount` only stamps `userProfiles.deletedAt` and leaves every `quizResults` row behind. A shared ledger needs an explicit, documented policy for member removal and ledger deletion.
