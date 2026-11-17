# 13 — Convex at Scale (BooKoo rewrite recon)

Research date: **2026-08-24**. All version numbers verified against the live npm registry on that
date. All behavioural claims are cited to `docs.convex.dev`, `stack.convex.dev`, or the Convex
GitHub source.

**The requirement this note exists to satisfy:** a ledger (가계부) with 100k+ items and years of
history must feel instant. The legacy app (`BooKooLegacy/`) is Firebase RTDB with the entire item
list nested inside the ledger document (`src/models/Ledger.ts` has `items = []` and `members = []`
as *arrays inside the Ledger*), pulled wholesale into Redux. That shape is structurally incapable of
scaling. Everything below is about not repeating it.

---

## 0. Verified versions (npm `latest`, 2026-08-24)

| Package | Version | Published |
|---|---|---|
| `convex` | **1.45.0** | 2026-08-21 |
| `convex-helpers` | **0.1.123** | 2026-08-14 |
| `convex-test` | **0.0.56** | 2026-08-20 |
| `@convex-dev/aggregate` | **0.2.2** | 2026-06-25 |
| `@convex-dev/sharded-counter` | **0.2.1** | 2026-06-24 |
| `@convex-dev/migrations` | **0.3.6** | 2026-07-28 |
| `@convex-dev/auth` | **0.0.95** | 2026-08-11 |
| `@convex-dev/rate-limiter` | **0.3.2** | 2025-12-09 |
| `@convex-dev/workpool` | **0.4.10** | 2026-08-21 |
| `@convex-dev/action-cache` | **0.3.1** | 2026-07-07 |
| `@convex-dev/crons` | **0.2.2** | 2026-06-24 |

Reference projects on this machine both pin `convex: ^1.42.3`:
- `/Users/hyo/Github/hyodotdev/Martie/package.json:64`
- `/Users/hyo/Github/hyodotdev/FightingHows/package.json:39` (+ `@convex-dev/auth: ^0.0.94`)

Neither reference project uses the aggregate component, sharded counter, triggers, streams, or the
query cache provider. **BooKoo will be the first of these codebases to need them.**

### Notable `convex` changes 1.38 → 1.45 (from `get-convex/convex-js/CHANGELOG.md`)

- **1.31**: `db.get("tableName", id)` table-name-first syntax introduced; `db.get(id)` deprecated in
  1.42. **Use the two-arg form everywhere in BooKoo.**
- **1.38**: `ctx.meta.getRequestMetadata()` (request ID, client IP, user agent).
- **1.40**: **`ctx.meta.getTransactionMetrics()`** — reports remaining transaction capacity.
- **1.41**: **`transactionLimits`** option on `ctx.runQuery` / `ctx.runMutation` to cap how much of
  the parent transaction budget a nested call may consume.
- **1.42**: `useStaleSnapshot` option on `runQuery` (OCC-avoidance); old table-name-less `db.*`
  deprecated; `FileMetadata` / `StorageId` types deprecated.
- **1.43**: `ctx.db.vars.commitTs` + `v.commitTs()` validator (upcoming commit timestamp);
  `usePaginatedQuery_experimental` page-split fix.
- **1.44**: **breaking** — `ConvexProviderWithAuth` context referential stability changed.
- **1.45**: local deployment upgrades now in-place.
- **1.24** (older, still relevant): optimistic-update helpers `insertAtTop`,
  `insertAtBottomIfLoaded`, `insertAtPosition`. React 18+ required.

Source: <https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md>

---

## 1. Query & index model

### 1.1 Indexes are sorted copies, not hints

> "indexes are separate data structures that order your documents for fast querying."
> — <https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf>

Declared in `defineTable(...).index(name, fields)`:

```ts
// convex/schema/ledgerItems.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ledgerItemsTable = defineTable({
  ledgerId: v.id("ledgers"),
  categoryId: v.id("categories"),
  authorId: v.id("users"),
  type: v.union(v.literal("EXPENSE"), v.literal("INCOME"), v.literal("TRANSFER")),
  amountMinor: v.number(),        // integer minor units — never float currency
  currency: v.string(),           // ISO 4217
  memo: v.string(),
  occurredAt: v.number(),         // epoch ms, user-chosen date (NOT _creationTime)
  dayKey: v.number(),             // YYYYMMDD as int, in the ledger's tz
  monthKey: v.number(),           // YYYYMM as int
  imageStorageIds: v.optional(v.array(v.id("_storage"))),
  deletedAt: v.optional(v.number()),
})
  // the workhorse: ledger timeline, newest first
  .index("by_ledger_occurredAt", ["ledgerId", "occurredAt"])
  // category filter within a ledger, still time-ordered
  .index("by_ledger_category_occurredAt", ["ledgerId", "categoryId", "occurredAt"])
  // month bucket scans for rollup repair
  .index("by_ledger_month", ["ledgerId", "monthKey"])
  .index("by_author", ["authorId"]);
```

**Rules that matter:**

1. **`_creationTime` is auto-appended as the final field of every index.** Do not list it yourself.
   (<https://docs.convex.dev/database/indexes/>) This is what makes index keys unique and cursors
   stable. Every index key ends with creation time and `_id`
   (<https://stack.convex.dev/pagination>).
2. **Field order defines the sort order.** `["ledgerId", "occurredAt"]` sorts by ledger, then by
   `occurredAt` within a ledger, then by `_creationTime`. The docs put it as: "books are sorted
   first by the author and then within each author by title."
3. **`withIndex` range expressions must step through fields in index order:** zero or more `.eq()`,
   then optionally one lower bound (`.gt()` / `.gte()`), then optionally one upper bound (`.lt()` /
   `.lte()`). You cannot range on field *n* without `.eq()` on fields *1..n-1*. The TypeScript
   types enforce this.
4. **Max 32 indexes per table, max 16 fields per index**, index name ≤ 64 chars, no duplicate
   fields, no `_`-prefixed fields.
5. **Redundant indexes are waste.** If you have `by_ledger_category_occurredAt`, you do *not* need
   `by_ledger_category` — the prefix of a compound index serves prefix queries. Convex best
   practices explicitly call out dropping `by_foo` when `by_foo_and_bar` exists
   (<https://docs.convex.dev/understanding/best-practices/>).
6. **Staged indexes** for adding an index to an already-large table without blocking:
   ```ts
   .index("by_ledger_month", { fields: ["ledgerId", "monthKey"], staged: true })
   ```
   Remove `staged: true` once the backfill completes to make it queryable.
   (<https://docs.convex.dev/database/indexes/>)

### 1.2 Canonical range query + `.order("desc")`

```ts
// newest-first page of one month of a ledger
const rows = await ctx.db
  .query("ledgerItems")
  .withIndex("by_ledger_occurredAt", (q) =>
    q.eq("ledgerId", ledgerId)
     .gte("occurredAt", monthStartMs)
     .lt("occurredAt", monthEndMs),
  )
  .order("desc")
  .paginate(args.paginationOpts);
```

`.order("desc")` walks the *same* index backwards — it is free. It does **not** trigger a scan.
`.order()` without `withIndex` uses the implicit `by_creation_time` index.

### 1.3 Why `.filter()` is the trap

> "`filter` allows you to write arbitrary, complex expressions but it won't be run using the index.
> Instead, `filter` expressions will be evaluated on every document in the range."
> — <https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf>

`.filter()` does not reduce documents *scanned*, only documents *returned*. On a 100k-row ledger a
`.filter()` that matches 1% still scans 100k documents → blows the 32,000-documents-scanned limit and
the 16 MiB read limit. **BooKoo rule: `.filter()` is banned on `ledgerItems`.** Either add an index
field or filter in JS *after* an index-bounded read of a bounded page.

**Anti-pattern found in the reference code** — `/Users/hyo/Github/hyodotdev/Martie/convex/rank/queries.ts`:

```ts
// getMyRank — UNBOUNDED. Grows with the table forever.
const betterRanks = await ctx.db
  .query('ranks')
  .filter((q) => q.gt(q.field('correctCount'), myRank.correctCount))
  .collect();
return { ...myRank, position: betterRanks.length + 1 };
```

```ts
// getTopRanks — collects the ENTIRE table, then slices.
const ranksResult = await ctx.db.query('ranks').withIndex('by_correctCount').order('desc').collect();
const ranks = ranksResult.slice(0, limit);
```

Both are exactly the class of bug that killed the legacy BooKoo. The first should be
`aggregate.indexOf()` (O(log n)); the second should be `.take(limit)`.

There is a legitimate escape hatch when you genuinely need JS predicates while staying bounded:
`filter` from `convex-helpers/server/filter` (applies the predicate in the query pipeline) combined
with `maximumRowsRead` on the pagination opts — see §2.5.

### 1.4 Search index (full-text)

For "find the 커피 receipt from last March" memo search:

```ts
.searchIndex("search_memo", {
  searchField: "memo",
  filterFields: ["ledgerId", "categoryId"],  // up to 16, equality only
})
```

```ts
const hits = await ctx.db
  .query("ledgerItems")
  .withSearchIndex("search_memo", (q) => q.search("memo", term).eq("ledgerId", ledgerId))
  .take(20);
```

- Results are **always in relevance order** (BM25 + proximity). You cannot re-sort by date inside
  the query; sort the ≤1024 results in JS if needed.
- **Max 1024 results scanned per search query**, up to 16 search terms, up to 8 filter expressions.
- **4 search indexes per table**, and they count against the 32-index-per-table budget.
- `.take()`, `.paginate()`, `.collect()`, `.first()`, `.unique()` all work.
- `maximumRowsRead`/`maximumBytesRead` are **not enforced for search queries** (see the JSDoc in
  `convex-js/src/server/pagination.ts`).
- Supports `staged: true` for async backfill.

Source: <https://docs.convex.dev/search/text-search>

### 1.5 Vector index

Not needed for BooKoo v1. Facts for completeness: 4 vector indexes/table, 16 filter fields, max 256
results, dimensions 2–4096. Vector search runs only in **actions**, not queries.

### 1.6 Hard limits (memorise these)

From <https://docs.convex.dev/production/state/limits>:

**Documents**
- Max document size: **1 MiB**
- Max fields per document: **1,024**
- Field name length: 64 chars top-level, 1,024 nested
- Nesting depth: **16**
- **Array elements: 8,192 per array** ← this is why `Ledger.items[]` (legacy) is fatal

**Indexes**
- 32 indexes/table · 16 fields/index · 64-char names

**Transactions (per query or mutation)**
- Data read: **16 MiB**
- Data written: **16 MiB**
- **Documents scanned: 32,000**
- Documents written: **16,000**
- Index-range reads (`withIndex` calls): **4,096**

**Execution time**
- Query/mutation user code: **1 second**
- Convex-runtime action: 30 min · Node action: 10 min

**Function payloads**
- Args: 16 MiB (5 MiB for Node actions) · Return: 16 MiB · HTTP response: 20 MiB
- `console.log` line: 4 KiB · 256 log lines per function

**Scheduling**
- 1,000 scheduled functions per mutation · 4 MiB args each, 16 MiB total per mutation
- 1,000,000 outstanding scheduled functions

### 1.7 Measuring headroom in-flight (new in 1.40/1.41)

```ts
const MiB = 1024 * 1024;
const metrics = await ctx.meta.getTransactionMetrics(); // each field: { used, remaining }
if (
  metrics.bytesRead.used > 4 * MiB ||
  metrics.bytesWritten.used > 2 * MiB ||
  metrics.databaseQueries.remaining < 500
) {
  // stop this batch, schedule a continuation
}
```

And to stop a nested call from eating the parent's budget:

```ts
await ctx.runQuery(internal.rollups.recompute, args, {
  transactionLimits: { bytesRead: 2 * MiB, documentsScanned: 2000 },
});
```

Only available in queries and mutations. Sources:
<https://docs.convex.dev/functions/mutation-functions>,
<https://docs.convex.dev/functions/query-functions>,
<https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md>

---

## 2. Pagination

### 2.1 Exact types (verbatim from `convex-js/src/server/pagination.ts`)

```ts
export const paginationOptsValidator = v.object({
  numItems: v.number(),
  cursor: v.union(v.string(), v.null()),
  endCursor: v.optional(v.union(v.string(), v.null())),
  id: v.optional(v.number()),
  maximumRowsRead: v.optional(v.number()),
  maximumBytesRead: v.optional(v.number()),
});
```

`PaginationResult<T>`:

```ts
{
  page: T[];
  isDone: boolean;
  continueCursor: Cursor;                 // string
  splitCursor?: Cursor | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}
```

There is also `paginationResultValidator(itemValidator)` (added 1.29) for typed `returns:`.

Field semantics, quoted from the source JSDoc:

- `numItems` — "you may receive more or less items than this if items were added to or removed from
  the query range."
- `endCursor` — "explicitly sets the range of documents the query will return, from `cursor` to
  `endCursor`. It's used by reactive pagination clients to ensure there are no gaps between pages
  when data changes, and to split pages when `pageStatus` indicates a split is recommended or
  required."
- `maximumRowsRead` — "limits rows entering the query pipeline **before filters are applied**. Use
  this when filtering for rare items, where low `numItems` won't bound execution time because the
  query scans many rows to find matches. Currently this is not enforced for search queries."
- `maximumBytesRead` — same, for bytes. Also not enforced for search.

### 2.2 Server side

```ts
import { paginationOptsValidator } from "convex/server";

export const listItems = query({
  args: {
    ledgerId: v.id("ledgers"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { ledgerId, paginationOpts }) => {
    await requireLedgerMember(ctx, ledgerId);   // access check
    const result = await ctx.db
      .query("ledgerItems")
      .withIndex("by_ledger_occurredAt", (q) => q.eq("ledgerId", ledgerId))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map(toRow),   // map/filter over the page is fine — it's bounded
    };
  },
});
```

`.paginate()` is only valid on an `OrderedQuery`, i.e. after `withIndex`/`order`, and only **once**
per query function.

### 2.3 Client side — exact signature

```ts
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryResult<PaginatedQueryItem<Query>>;

export type UsePaginatedQueryResult<Item> = {
  results: Item[];
  loadMore: (numItems: number) => void;
} & (
  | { status: "LoadingFirstPage"; isLoading: true }
  | { status: "CanLoadMore";      isLoading: false }
  | { status: "LoadingMore";      isLoading: true }
  | { status: "Exhausted";        isLoading: false }
);
```

(Source: `get-convex/convex-js/src/react/use_paginated_query.ts`. Note `args` accepts the `"skip"`
sentinel — use it while `ledgerId` is undefined during route transitions.)

`loadMore(n)` is a no-op unless `status === "CanLoadMore"`.

### 2.4 Reactivity model — the thing that actually determines performance

**Convex reactivity is per-query-subscription, keyed on the *read set*.** From
<https://docs.convex.dev/database/advanced/occ>: a transaction is "a *declarative proposal* to write
records on the basis of any read record versions (the 'read set')". A query subscription re-runs
when any record version in its read set changes. Convex provides **serializability**, not merely
snapshot isolation.

Also: "All database reads inside a single query call are performed at the same logical timestamp"
and "Convex caches query results automatically. If many clients request the same query, with the
same arguments, they will receive a cached response."
(<https://docs.convex.dev/functions/query-functions>)

**Applied to pagination:** each loaded page is its own query subscription with its own
`paginationOpts` args, hence its own read set. Convex converts pages from "the first N items" into a
**range between two pinned cursors**:

> "Whenever the query is recomputed, Convex ignores the `numItems` parameter and instead returns all
> items until the end cursor." — <https://stack.convex.dev/fully-reactive-pagination>

Consequences you must design around:

1. **A write only invalidates the pages whose cursor range it falls inside.** Inserting a new item
   at `occurredAt = now` in a `desc` list touches page 0's range → page 0 re-runs. Pages 5–20 do
   **not** re-run. This is the crucial property: an infinite ledger does not fully re-render on
   every write.
2. **BUT: an insert at the head is the common case in a ledger app.** Page 0 re-runs on every new
   expense from any member. Keep page 0 cheap — don't do per-row `ctx.storage.getUrl()` or per-row
   joins with unbounded fan-out inside it (see §6.3).
3. **Pages grow, they don't shift.** Insert into a page's range → that page returns N+1 items. No
   gaps, no duplicates across pages.
4. **A page that grows too big is split automatically.** When the server sets
   `pageStatus: "SplitRecommended"` / `"SplitRequired"`, or when
   `page.length > initialNumItems * 2`, the client splits the page at `splitCursor` into two
   subscriptions (`use_paginated_query.ts` lines ~325–345). `"SplitRequired"` means the server
   could not fetch the full page and results are truncated until the split completes.
5. **Changing `args` (other than `paginationOpts`) resets the whole pagination**, dropping every
   page and re-loading page 0. So switching category filter / month filter = full reload. Budget for
   that in UX (keep a skeleton, or use `useStablePaginatedQuery`, §7.3).
6. On a query error the hook logs `"usePaginatedQuery hit error, resetting pagination state"` and
   restarts from scratch.

### 2.5 `numItems` tuning for BooKoo

- List rows are small (~300 bytes serialized). `initialNumItems: 30` for the ledger timeline
  (roughly 2 screens on a phone, 1 on a tablet), `loadMore(50)` thereafter.
- Do **not** set it high "to reduce round trips": a bigger page = a bigger read set = more spurious
  re-runs and more bandwidth per invalidation. Bandwidth is a billed metric (§9).
- If a query has any post-index JS filtering of rare rows, **always** set `maximumRowsRead`
  (e.g. 4,000) so a sparse match can't scan the table:
  ```ts
  const result = await ctx.db.query("ledgerItems")
    .withIndex("by_ledger_occurredAt", q => q.eq("ledgerId", ledgerId))
    .order("desc")
    .paginate({ ...paginationOpts, maximumRowsRead: 4000 });
  ```
  The page may come back short; the client keeps calling `loadMore` until `isDone`. FightingHows
  documents this exact contract at
  `/Users/hyo/Github/hyodotdev/FightingHows/convex/board/queries.ts:44-50`:
  > "A page may therefore return fewer than `numItems` rows — clients must keep paging until `isDone`."

### 2.6 When built-in pagination isn't enough

`usePaginatedQuery` cannot do: joins of two paginated sources, unions, jump-to-position, bidirectional
scroll, or unloading off-screen pages (<https://stack.convex.dev/pagination>). For those, use
`convex-helpers/server/pagination`:

```ts
import { getPage, paginator } from "convex-helpers/server/pagination";

// drop-in replacement for db.query().paginate(), but composable
const result = await paginator(ctx.db, schema)
  .query("ledgerItems")
  .withIndex("by_ledger_occurredAt", (q) => q.eq("ledgerId", ledgerId))
  .order("desc")
  .paginate(paginationOpts);

// lower-level: explicit index keys
const { page, indexKeys, hasMore } = await getPage(ctx, {
  table: "ledgerItems",
  index: "by_ledger_occurredAt",
  schema,
  startIndexKey: [ledgerId, cursorOccurredAt],
  startInclusive: false,
  order: "desc",
  targetMaxRows: 100,
  absoluteMaxRows: 500,
});
```

An index key looks like `[ledgerId, occurredAt, _creationTime, _id]` — "to avoid duplicates, every
index key ends with the creation time and ID."

**And the one that matters most for BooKoo's filter UI** — `convex-helpers/server/stream` lets you
paginate a *merged/filtered* stream while keeping index-backed ordering:

```ts
import { stream, mergedStream } from "convex-helpers/server/stream";

// "show me EXPENSE items across 3 selected categories, newest first, paginated"
const streams = categoryIds.map((categoryId) =>
  stream(ctx.db, schema)
    .query("ledgerItems")
    .withIndex("by_ledger_category_occurredAt", (q) =>
      q.eq("ledgerId", ledgerId).eq("categoryId", categoryId))
    .order("desc"),
);
const merged = mergedStream(streams, ["occurredAt"]);          // union, still ordered
const page = await merged.filterWith(async (d) => !d.deletedAt).paginate(paginationOpts);
```

This is the correct answer to "multi-select category filter over 100k items". A naive `.filter()`
here would scan the whole ledger.

---

## 3. Aggregation at scale

BooKoo needs: monthly total per ledger, per-category totals for the donut chart, running balance,
"this month vs last month", member counts, and a lifetime total. Three strategies.

### 3.1 Compute on the fly

Only acceptable when the read set is provably bounded — e.g. "today's total" for one ledger reads at
most a few dozen rows via `by_ledger_occurredAt` with a one-day range. **Never** for "this year" or
"all time".

### 3.2 `@convex-dev/aggregate` (v0.2.2)

A B-tree stored in Convex documents giving **O(log n)** `count` / `sum` / `min` / `max` / `at` /
`indexOf` / `paginate`, versus O(n) for `.collect()`
(<https://github.com/get-convex/aggregate>, <https://www.convex.dev/components/aggregate>).

Setup:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(aggregate, { name: "spendByLedgerMonth" });
app.use(aggregate, { name: "spendByLedgerCategory" });
export default app;
```

```ts
// convex/aggregates.ts
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";

export const spendByLedgerMonth = new TableAggregate<{
  Namespace: Id<"ledgers">;          // one B-tree per ledger — no cross-ledger contention
  Key: [number, number];             // [monthKey, occurredAt]
  DataModel: DataModel;
  TableName: "ledgerItems";
}>(components.spendByLedgerMonth, {
  namespace: (doc) => doc.ledgerId,
  sortKey: (doc) => [doc.monthKey, doc.occurredAt],
  sumValue: (doc) => (doc.type === "EXPENSE" ? doc.amountMinor : 0),
});
```

Read:

```ts
const total = await spendByLedgerMonth.sum(ctx, {
  namespace: ledgerId,
  bounds: { prefix: [202608] },      // one month
});
const count = await spendByLedgerMonth.count(ctx, { namespace: ledgerId, bounds: { prefix: [202608] } });
```

Write — wire it via `convex-helpers` triggers so no mutation can forget:

```ts
import { Triggers } from "convex-helpers/server/triggers";
import { customMutation, customCtx } from "convex-helpers/server/customFunctions";

const triggers = new Triggers<DataModel>();
triggers.register("ledgerItems", spendByLedgerMonth.trigger());
triggers.register("ledgerItems", spendByLedgerCategory.trigger());
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

Full method set (README): `count`, `sum`, `min`, `max`, `at(offset)`, `indexOf(key)`, `paginate`,
batch variants `countBatch` / `sumBatch` / `atBatch`, writes `insert` / `delete` / `replace`,
idempotent writes `insertIfDoesNotExist` / `deleteIfExists` / `replaceOrInsert`, and
`clear(ctx, maxNodeSize?, rootLazy?)`. `bounds` accepts `{ prefix?, lower?: {key, inclusive},
upper?: {key, inclusive} }`. Read options accept `{ stale?: boolean }`; write options accept
`{ async?: boolean }`.

#### The OCC / contention story — read this twice

Verbatim from the aggregate README (`### Read dependencies and writes`):

> "When a query calls `await aggregate.count(ctx)`, this depends on the entire aggregate data
> structure. When any mutation changes the data structure, i.e. `insert`, `delete`, or `replace`,
> the query reruns and sends new results to the frontend. This is necessary to keep the frontend
> looking snappy, but it can cause large function call and bandwidth usage on Convex."

> "When a *mutation* calls `await aggregate.count(ctx)`, then this mutation needs to run
> transactionally relative to other mutations. Another mutation that does an `insert`, `delete`, or
> `replace` can cause an OCC conflict."

And the single most important sentence for a ledger app:

> "**Corollary: if a table's aggregate uses a key on `_creationTime`, each new data point will be
> added to the same part of the data structure (the end), because `_creationTime` keeps increasing.
> Therefore all inserts will wait for each other and no mutations can run in parallel.**"

Mitigations, in order of preference:

1. **Namespace by `ledgerId`.** "each namespace has its own data structure and there's no overlap in
   internal nodes between namespaces." A shared household ledger has maybe 2–6 concurrent writers —
   that is fine. A global (un-namespaced) aggregate over all users would serialize every write in
   the product.
2. **Always pass `bounds`.** "This query only reads scores between 95 and 100, so in a query it only
   reruns when a score in that range changes, and in a mutation it only conflicts with mutations
   that modify a score in that range."
3. **`rootLazy`** — default **`true`**: the root node stores no count, so "an insert at a very small
   key won't intersect with a write or read on a very large key." Set to `false`
   (`aggregate.clear(ctx, 16, false)`) only for read-heavy / write-rare aggregates.
4. **`maxNodeSize`** — default **16**. "each write updates some document that accumulates 1/16th of
   the entire data structure. So each write will intersect with 1/16th of all other writes, and
   reads may spuriously rerun 1/16th of the time." Raise it via `aggregate.clear(ctx, 32)` (this
   **destroys and requires a rebuild**).
5. **Queued writes** (eventual consistency) for the hottest aggregates:
   ```ts
   await aggregate.insert(ctx, { key, id, sumValue }, { async: true });
   const count = await aggregate.count(ctx, { stale: true });
   ```
   A [Batch Worker](https://github.com/get-convex/batch-worker) serializes updates. Trade-off: you
   cannot read your own queued write in the same transaction, and **you cannot mix modes** — "If
   there are any writes queued, a non-stale read or non-async write will throw an error."
6. **Aggregate methods are atomic within themselves**, unlike two `ctx.db` reads-then-writes. The
   README's `addTwo` example shows plain Convex code losing an increment where the component does
   not.

**Operational hazard:** editing rows in the Convex dashboard bypasses triggers and silently corrupts
the aggregate (<https://stack.convex.dev/efficient-count-sum-max-with-the-aggregate-component>).
Repair = `aggregate.clear(ctx)` + backfill with `insertIfDoesNotExist`, or diff via `paginate()` on
both sides. Attach-to-existing-table procedure (README): swap to idempotent methods → deploy →
backfill migration → swap back.

### 3.3 Denormalized rollup tables

A plain Convex table maintained inside the same mutation as the write:

```ts
export const monthlyRollupsTable = defineTable({
  ledgerId: v.id("ledgers"),
  monthKey: v.number(),                 // YYYYMM
  categoryId: v.optional(v.id("categories")), // undefined = whole-month row
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
  updatedAt: v.number(),
}).index("by_ledger_month_category", ["ledgerId", "monthKey", "categoryId"]);
```

```ts
async function applyDelta(ctx: MutationCtx, doc: Doc<"ledgerItems">, sign: 1 | -1) {
  for (const categoryId of [undefined, doc.categoryId]) {
    const row = await ctx.db
      .query("monthlyRollups")
      .withIndex("by_ledger_month_category", (q) =>
        q.eq("ledgerId", doc.ledgerId).eq("monthKey", doc.monthKey).eq("categoryId", categoryId))
      .unique();
    const expense = doc.type === "EXPENSE" ? sign * doc.amountMinor : 0;
    const income  = doc.type === "INCOME"  ? sign * doc.amountMinor : 0;
    if (row) {
      await ctx.db.patch("monthlyRollups", row._id, {
        expenseMinor: row.expenseMinor + expense,
        incomeMinor:  row.incomeMinor  + income,
        itemCount:    row.itemCount    + sign,
        updatedAt:    Date.now(),
      });
    } else {
      await ctx.db.insert("monthlyRollups", {
        ledgerId: doc.ledgerId, monthKey: doc.monthKey, categoryId,
        expenseMinor: expense, incomeMinor: income, itemCount: sign, updatedAt: Date.now(),
      });
    }
  }
}
```

Properties:
- **Read cost: 1 document.** The month screen's header reads exactly one row. Nothing beats that.
- **Read set is a single doc** → the header only re-renders when that month's total actually changes.
  An edit to a 2019 item does not touch the 2026 header.
- **Write contention scope:** one document per (ledger, month, category). Two members adding
  expenses in the same category in the same month in the same second can OCC-conflict. At household
  scale (a handful of writers) Convex's automatic retries absorb this. It would *not* survive a
  global "all users" row — which is why there must never be one.
- Because a mutation is ACID ("All database writes get committed together. If the mutation writes
  some data to the database, but later throws an error, no data is actually written"
  — <https://docs.convex.dev/functions/mutation-functions>), the item insert and the rollup patch
  either both land or neither does. **No idempotency token is needed inside a single mutation.**
  Idempotency *is* needed for anything reached via `ctx.scheduler` or an action retry — see §5.4.

### 3.4 Decision rule for BooKoo

| Need | Use |
|---|---|
| Fixed, small set of buckets known at write time (month × category totals, member count, per-ledger lifetime total) | **Rollup table** |
| Arbitrary user-chosen date range ("2024-03-05 → 2025-11-20"), ranked/percentile queries, "what's my rank", offset jumps into a list | **`@convex-dev/aggregate`** with `Namespace: ledgerId` |
| Bounded window that's already cheap ("today", "this week") | **On the fly** |
| Very hot single counter with many concurrent writers (a global "items logged" stat) | **`@convex-dev/sharded-counter`** |

Concretely: **BooKoo v1 should use rollup tables for the month/category dashboard (the hot path),
and add `@convex-dev/aggregate` only when the custom-date-range report screen ships.** The rollup
table is simpler, has a 1-document read set, and has no B-tree contention. Do not adopt the
aggregate component for something a rollup row already answers.

### 3.5 Sharded counter (for the one case rollups can't take)

```ts
// convex/convex.config.ts
app.use(shardedCounter);

// convex/counters.ts
import { ShardedCounter } from "@convex-dev/sharded-counter";
const counter = new ShardedCounter(components.shardedCounter, {
  shards: { globalItemsLogged: 100 },
  defaultShards: 8,      // library default is 16 if omitted
});

await counter.inc(ctx, `ledger:${ledgerId}:items`);
const n = await counter.count(ctx, `ledger:${ledgerId}:items`);
```

API: `add(ctx, key, n)`, `inc`, `dec`, `subtract`, `reset`, `count`, `estimateCount(ctx, key,
numShards)`, and `for(key)` to bind a key.

**Caveat from the README:** `count()` "creates a read dependency on all shard documents" — in a
query subscription any increment re-runs it; in a mutation it causes OCC conflicts. Use
`estimateCount` (samples a subset of shards) where exactness doesn't matter.
Source: <https://github.com/get-convex/sharded-counter>

### 3.6 The generic OCC error

Error text: *"Documents read from or written to the table changed while this mutation was being run
and on every subsequent retry"* (<https://docs.convex.dev/error#1>). Convex retries internally and
only surfaces this when mutations arrive faster than they can complete. Causes and fixes:

1. **Same document hammered** (a counter) → shard it.
2. **Mutation reads a whole table** → narrow to an indexed range. The docs' example: a `writeCount`
   mutation reading the entire table conflicts with every `addTask`.
3. **Mutation called in a loop from an action** → batch into one mutation, or use `@convex-dev/workpool`.
4. Convex also suggests `@convex-dev/action-cache` to cut mutation frequency.

---

## 4. Reactivity cost

### 4.1 What causes a recompute

A query subscription re-runs iff a document version in its **read set** changes. The read set is
built from the exact `ctx.db` reads the handler performed — index ranges included. So:

- `.withIndex("by_ledger_occurredAt", q => q.eq("ledgerId", A))` → read set is ledger A's range only.
  Writes to ledger B never wake it.
- `.collect()` over a table → read set is the whole table → **every** write to that table wakes it.
  This is the single biggest reactivity footgun and is exactly what `Martie/convex/rank/queries.ts`
  does.

Also: **`Date.now()` in a query does not cause re-runs** — Convex best practices warn that "current
time doesn't trigger automatic re-runs"; a query that computes "is this month" from `Date.now()`
will go stale at midnight and never recover. Fix: pass the client's local `monthKey` as an argument
(which also makes the query cacheable per-month), or flip a flag from a cron.

### 4.2 How many subscriptions is too many

There is no published hard cap on concurrent subscriptions per client, but each is a billed function
call on every invalidation, and every re-run pushes bytes (billed as egress). Practical budget for a
BooKoo screen:

- **Target ≤ 10 live subscriptions per mounted screen.** A ledger timeline with 20 loaded pages is
  already 20 subscriptions — that's fine because each has a narrow, disjoint cursor range.
- **Never** subscribe per list row. Batch the joins server-side (see §4.4).
- Unmounted screens must unsubscribe. `ConvexQueryCacheProvider` (§7.3) keeps them warm for a
  bounded time instead of forever.

### 4.3 Patterns that keep read sets narrow

1. **Split queries by volatility.** `getLedgerHeader` (name, member count, month total — changes
   rarely) must be a *different* query from `listItems` (changes constantly). Never return both from
   one function, or the header re-renders on every keystroke-fast write.
2. **Separate tables for hot-write data.** Put `viewCount` / `lastActivityAt` in a
   `ledgerStats` table keyed by `ledgerId`, not on the `ledgers` document — otherwise every activity
   ping invalidates every query that read the ledger document (which is all of them).
   FightingHows chose the opposite (counters live on `posts` at
   `/Users/hyo/Github/hyodotdev/FightingHows/convex/schema/posts.ts` — `viewCount`, `likeCount`,
   `commentCount`); that's acceptable there because the list query reads those counters anyway. For
   BooKoo, the ledger *document* is read by many queries that don't care about activity, so split it.
3. **Bound every scan.** FightingHows does this well with named constants —
   `PINNED_SCAN_LIMIT = 50`, `CATEGORY_SCAN_LIMIT = 100`, `REPLY_SCAN_LIMIT = 100`
   (`convex/board/queries.ts:26-45`). Adopt this convention verbatim in BooKoo.
4. **Argument-level cache keys.** Convex caches per (query, args). Passing `monthKey: 202608` makes
   the month view cacheable and shareable across the ledger's members; passing `now: Date.now()`
   destroys the cache. Round any time argument to a coarse bucket.

### 4.4 Batched joins instead of N subscriptions

Copy `loadAuthorMap` from `/Users/hyo/Github/hyodotdev/FightingHows/convex/lib/serializers.ts` — its
comment states the reason exactly:

> "Convex has no `IN` operator, so a `Map` keyed by `userId` keeps list rendering to one lookup per
> distinct author instead of one per row."

```ts
const unique = [...new Set(page.map((r) => r.authorId as string))];
const entries = await Promise.all(unique.map(async (userId) => [
  userId, await toPublicAuthor(ctx, await profileOf(ctx, userId), userId),
] as const));
const authors = new Map(entries);
```

For a 30-row page with 3 members, that's 3 reads instead of 30. Note `Promise.all` — Convex reads are
concurrent within a transaction; sequential `await` in a loop is a latency multiplier.

---

## 5. Denormalization patterns for BooKoo

### 5.1 Schema shape (the anti-legacy)

Legacy: `Ledger { items: [], members: [] }` — unbounded arrays inside one document. Hard-blocked by
Convex anyway (8,192 array elements, 1 MiB document). The rewrite:

| Table | Key fields | Indexes |
|---|---|---|
| `ledgers` | `title`, `color`, `currency`, `ownerId`, `memberCount`, `archivedAt` | `by_owner` |
| `ledgerMembers` | `ledgerId`, `userId`, `role`, `joinedAt` | `by_ledger`, `by_user`, `by_ledger_user` |
| `ledgerItems` | as §1.1 | `by_ledger_occurredAt`, `by_ledger_category_occurredAt`, `by_ledger_month` |
| `monthlyRollups` | as §3.3 | `by_ledger_month_category` |
| `dailyRollups` | `ledgerId`, `dayKey`, `expenseMinor`, `incomeMinor`, `itemCount` | `by_ledger_day` |
| `ledgerStats` | `ledgerId`, `lastItemAt`, `lifetimeExpenseMinor` | `by_ledger` |
| `categories` | `ledgerId?` (null = global preset), `name`, `iconId`, `sortOrder` | `by_ledger` |

`ledgerMembers.by_ledger_user` gives an O(1) membership check for the auth guard on every query —
this is the single most-called index in the app.

### 5.2 Sectioned infinite list (the main screen)

Korean 가계부 UIs are day-sectioned with a per-day subtotal. Do **not** compute day subtotals by
grouping the loaded page in JS (wrong at page boundaries) and do **not** issue one query per day
(N subscriptions). Instead:

- Paginate `dailyRollups` by `by_ledger_day` desc for the section headers (≈30 rows = one month).
- Paginate `ledgerItems` by `by_ledger_occurredAt` desc for the rows.
- Merge client-side by `dayKey`. Two subscriptions, both narrow.

Alternative when you want it in one query: `mergedStream` (§2.6) over the two tables is possible but
`dailyRollups` invalidates on *every* item write, so keeping them separate is strictly better for
reactivity.

### 5.3 Running balance

Never compute a running balance by summing all prior items. Two correct options:

- **Rollup-based:** balance at end of month M = `sum(monthlyRollups.income - expense)` for months
  ≤ M. With ~120 rows for 10 years, one indexed range read. Cheap forever.
- **Aggregate-based** for arbitrary "balance as of date D":
  `spendByLedgerMonth.sum(ctx, { namespace: ledgerId, bounds: { upper: { key: [monthKeyOfD, tsOfD], inclusive: true } } })`
  — O(log n).

### 5.4 Keeping denormalized data correct

- **Within one mutation you get ACID for free.** Item insert + rollup patch + stats patch in one
  mutation is atomic. No compensation logic.
- **Route every write through triggers**, not through discipline:
  ```ts
  triggers.register("ledgerItems", async (ctx, change) => {
    if (change.operation === "insert") await applyDelta(ctx, change.newDoc!, 1);
    if (change.operation === "delete") await applyDelta(ctx, change.oldDoc!, -1);
    if (change.operation === "update") {
      await applyDelta(ctx, change.oldDoc!, -1);
      await applyDelta(ctx, change.newDoc!, 1);
    }
  });
  export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
  ```
  Then **never import the raw `mutation`** anywhere else. `change` carries `operation`, `id`,
  `oldDoc`, `newDoc`; throwing inside a trigger aborts the whole mutation atomically.
- **Idempotency is required only across transaction boundaries** — scheduled functions and actions
  can run more than once. Give any scheduled rollup job a natural key (`ledgerId + monthKey`) and
  make it *recompute-from-source* rather than *increment*, so a double run is harmless.
- **Nightly repair cron** (§8): recompute one ledger-month from `by_ledger_month` and patch the
  rollup if it disagrees. This is the safety net that lets you ship denormalization confidently.
- **Soft delete, not hard delete.** `deletedAt` + rollup delta. FightingHows uses this
  (`posts.deletedAt`, with the rule "a deleted post that still has comments is rendered as
  '삭제된 글입니다'"). For a shared ledger this also preserves the audit trail members expect.
  Caveat, also from FightingHows: an index without `deletedAt` in it means hidden rows can only be
  dropped *after* the page returns → short pages → client must page until `isDone`.

### 5.5 Member count

`ledgers.memberCount` maintained in the invite/leave mutations (a handful of writes per ledger per
year). Do not `.collect()` `ledgerMembers` to count — that read set covers the whole membership,
so any member's profile-touching write re-runs it.

---

## 6. File storage (receipt photos)

### 6.1 Upload flow — 3 steps, always the upload-URL flow

```ts
// convex/files.ts
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireLedgerMember(ctx, /* ... */);   // gate it — see FightingHows
    return await ctx.storage.generateUploadUrl();
  },
});
```

```ts
// client
const postUrl = await generateUploadUrl();
const res = await fetch(postUrl, {
  method: "POST",
  headers: { "Content-Type": asset.mimeType },
  body: blob,
});
const { storageId } = await res.json();
await attachReceipt({ itemId, storageId });
```

- The URL is **valid for 1 hour**; the POST has a **2-minute timeout**; **no file size limit** on
  this path.
- The HTTP-action alternative (`ctx.storage.store(blob)` inside an `httpAction`) is a single request
  but is capped at **20 MB** and needs CORS. Use it only if you need per-request access control at
  upload time.
- Source: <https://docs.convex.dev/file-storage/upload-files>

**Gate `generateUploadUrl` behind membership.** FightingHows' comment at
`/Users/hyo/Github/hyodotdev/FightingHows/convex/files/mutations.ts` explains why: "Every uploader
must already be an approved member so pending accounts cannot burn storage quota."

**Track blob ownership.** Convex records no uploader on `_storage` metadata, so a mutation handed a
storage id "cannot tell a member's own file from one they guessed". FightingHows solves this with an
`uploads` table (`{ storageId, userId }`, index `by_storage`) written when an id is first attached to
a document — copy this table into BooKoo verbatim. Orphaned blobs (uploaded, never attached) are
swept by a nightly job.

### 6.2 Serving

`await ctx.storage.getUrl(storageId)` returns a public URL. Facts:

- **Anyone with the URL can access the file without further authentication.** There is no expiry;
  revocation = deleting the file. For a shared household ledger this is acceptable (the URLs are
  unguessable), but note it explicitly in the privacy copy.
- For real access control, serve via an `httpAction` that authenticates and returns
  `await ctx.storage.get(storageId)` as a Blob — capped at **20 MB** response.
- Source: <https://docs.convex.dev/file-storage/serve-files>

### 6.3 Caching `getUrl` — the list-query trap

`ctx.storage.getUrl()` inside a paginated list query means one storage lookup *per row, per re-run*.
FightingHows does exactly this in `toPostListRow` (`thumbnailUrl: await storageUrl(ctx, images[0])`)
and it is the weakest part of that code at scale.

**BooKoo rule: denormalize the URL onto the document at attach time.**

```ts
// in the mutation that attaches the receipt
const url = await ctx.storage.getUrl(storageId);
await ctx.db.patch("ledgerItems", itemId, {
  imageStorageIds: [...existing, storageId],
  thumbnailUrl: url ?? undefined,     // stored, not recomputed per read
});
```

The list query then returns a plain string field. If a stored URL ever needs invalidating (file
deleted), the same mutation that deletes the blob clears the field — atomically.

### 6.4 Image variants

Convex has **no built-in image transformation**. Generate variants client-side before upload
(`expo-image-manipulator`): store a ~320px thumbnail and the original as two storage ids
(`thumbStorageId`, `fullStorageId`). This keeps the timeline's bandwidth down by ~20× — and bandwidth
is billed (§9). Render with `expo-image` (`cachePolicy="memory-disk"`, explicit `placeholder` blurhash)
so scrolling a year of receipts doesn't refetch.

### 6.5 Metadata

`_storage` is a queryable system table via `ctx.db.system.get("_storage", id)` /
`ctx.db.system.query("_storage")`, read-only, reactive, paginatable
(<https://docs.convex.dev/database/advanced/system-tables>). Useful for the orphan-blob sweeper.
Note the `FileMetadata` / `StorageId` TS types were deprecated in convex 1.42.

---

## 7. Client-side: making it feel instant

### 7.1 Provider setup (Expo SDK 57 + expo-router)

```tsx
// app/_layout.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,   // REQUIRED on React Native — no window.onbeforeunload
});

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <ConvexQueryCacheProvider expiration={300_000} maxIdleEntries={250}>
        <Stack />
      </ConvexQueryCacheProvider>
    </ConvexAuthProvider>
  );
}
```

`unsavedChangesWarning: false` is documented in the Expo guide
(<https://docs.expo.dev/guides/using-convex/>). `EXPO_PUBLIC_CONVEX_URL` is written by
`eas integrations:convex:connect`.

### 7.2 Optimistic updates

```ts
import { insertAtTop } from "convex/react";

const addItem = useMutation(api.items.add).withOptimisticUpdate((localStore, args) => {
  insertAtTop({
    paginatedQuery: api.items.listItems,
    argsToMatch: { ledgerId: args.ledgerId },   // only the matching list, not every list
    localQueryStore: localStore,
    item: {
      _id: crypto.randomUUID() as Id<"ledgerItems">,
      _creationTime: Date.now(),
      ...args,
    },
  });
  // also bump the month header optimistically
  const key = { ledgerId: args.ledgerId, monthKey: args.monthKey };
  const cur = localStore.getQuery(api.rollups.month, key);
  if (cur) localStore.setQuery(api.rollups.month, key, {
    ...cur, expenseMinor: cur.expenseMinor + args.amountMinor,
  });
});
```

Rules from <https://docs.convex.dev/client/react/optimistic-updates>:
- `withOptimisticUpdate((localStore, args) => void)`.
- `localStore.getQuery(ref, args)` / `setQuery(ref, args, value)` / `getAllQueries(ref)`.
- **"Always create new objects inside of optimistic updates"** — mutating cached objects corrupts
  client state.
- The client rolls the update back automatically when the server result lands; temporary ids/times
  are replaced by authoritative values. Small mismatches are expected and self-heal.
- Helpers (convex 1.24+): `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`, and
  `optimisticallyUpdateValueInPaginatedQuery(localStore, query, args, updateFn)` for in-place edits
  across every loaded page. `argsToMatch` scopes the update when the same query serves several lists.

### 7.3 Anti-jank: query cache + stable results

- **`ConvexQueryCacheProvider`** (`convex-helpers/react/cache`) with drop-in `useQuery`,
  `usePaginatedQuery`, `useQueries` keeps subscriptions alive for `expiration` ms after unmount
  (up to `maxIdleEntries`). This is what makes tab-switching in a bottom-tab layout instant instead
  of flashing a spinner. **Adopt this from day one** — neither reference project has it and both
  flicker.
- **`useStableQuery` / `useStablePaginatedQuery`** (convex-helpers) return the *previous* value while
  new args load, instead of `undefined` — exactly what you want when changing month or category
  filter, since changing args resets pagination (§2.4 point 5).
- **`"skip"` sentinel** on `useQuery`/`usePaginatedQuery` while route params are still resolving —
  avoids a wasted subscription + an `undefined` render.

### 7.4 Cold start & session memory

Convex has **no built-in offline persistence**. The React client "will handle reconnecting and
re-establishing the Convex session automatically" (<https://docs.convex.dev/client/react>), but
`useQuery` returns `undefined` until the socket is up and the first result arrives. On a cold start
over LTE that can be several hundred ms. As of 2026-09-02, BooKoo deliberately does **not** persist
server query results or mutation arguments on-device: the server is the only source of truth, and
offline writes fail clearly with retry guidance instead of entering a durable outbox.

Mitigation:

1. **Session-scoped query cache.** Application reads use the drop-in hooks from
   `convex-helpers/react/cache` under `ConvexQueryCacheProvider`. The provider is keyed by the signed-in
   account and retains a bounded set of idle subscriptions for five minutes, so tab and route remounts
   stay warm without surviving an app restart or crossing accounts.
2. **Reserve layout.** Fixed row heights and matching skeleton geometry prevent live results from
   reflowing the screen. A cold launch intentionally shows a truthful skeleton until Convex responds.
3. **Direct online mutations.** Item and comment writes call Convex directly. Server-side
   `clientRequestId` idempotency remains in force, but no local pending-write queue is created.
4. Older RN bug worth knowing: `window.addEventListener is not a function` was fixed in convex
   1.31.4; anything ≥1.42 is clear.

---

## 8. Scheduling, crons, actions — moving work off the hot path

### 8.1 Scheduler

`ctx.scheduler.runAfter(delayMs, internal.foo.bar, args)` /
`ctx.scheduler.runAt(timestamp, ...)`. Limits: 1,000 scheduled functions per mutation, 4 MiB args
each / 16 MiB total, 1,000,000 outstanding. Always schedule `internal.*`, never `api.*`
(<https://docs.convex.dev/understanding/best-practices/>).

Use it for anything not needed to render the next frame: push notifications to co-members, receipt
OCR, currency-rate fetch, analytics.

### 8.2 Crons

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("repair rollups", { hourUTC: 18 }, internal.rollups.repairStaleMonths);
crons.interval("sweep orphan uploads", { hours: 6 }, internal.uploads.sweepOrphans);
export default crons;
```

- Methods: `crons.interval(id, {seconds|minutes|hours}, fn, args?)`, `crons.cron(id, "* * * * *", …)`
  (UTC), `crons.hourly/daily/weekly/monthly` with `{ hourUTC, minuteUTC?, day? }`.
- "At most one run of each cron job can be executing at any moment" — later runs are skipped (and
  logged) if the previous is still running.
- **Omit `minuteUTC` so Convex spreads load across the hour** instead of piling on `:00`.
- Source: <https://docs.convex.dev/scheduling/cron-jobs>
- `@convex-dev/crons` (0.2.2) exists if you need crons registered *dynamically* at runtime.

Both reference projects already have `convex/crons.ts` — see
`/Users/hyo/Github/hyodotdev/Martie/convex/crons.ts` and
`/Users/hyo/Github/hyodotdev/FightingHows/convex/crons.ts` for the house style.

### 8.3 Actions and the batching rules

- Actions are **not transactional**. Do not do `runMutation` in a loop — best practices: "Avoid
  sequential `ctx.runMutation`/`ctx.runQuery` calls in actions"; batch into one mutation.
- `ctx.runAction` only to cross runtimes (Node-only libraries). Otherwise call a plain TS function.
- `@convex-dev/workpool` (0.4.10) for bounded-concurrency background queues (bulk import of a CSV
  ledger, for example) — it also prevents the OCC storm a naive fan-out would cause.
- `@convex-dev/migrations` (0.3.6) for batched, resumable, cursor-tracked backfills (needed for the
  aggregate backfill in §3.2 and for legacy Firebase import).

### 8.4 Batched backfill skeleton

```ts
export const backfillMonth = internalMutation({
  args: { ledgerId: v.id("ledgers"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { ledgerId, cursor }) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query("ledgerItems")
      .withIndex("by_ledger_occurredAt", (q) => q.eq("ledgerId", ledgerId))
      .paginate({ numItems: 500, cursor });
    for (const doc of page) await aggregate.insertIfDoesNotExist(ctx, doc);
    if (!isDone) await ctx.scheduler.runAfter(0, internal.backfill.backfillMonth, {
      ledgerId, cursor: continueCursor,
    });
  },
});
```

500/batch keeps you well inside 16,000 writes and 1 s of user CPU; the `runAfter(0)` chain gives each
batch a fresh transaction.

---

## 9. Cost & limits that could bite

From <https://www.convex.dev/pricing> (verified 2026-08-24):

| Metric | Free / Starter | Pro ($25/dev/mo) | Overage |
|---|---|---|---|
| Function calls | 1M | 25M | $2.20 / $2.00 per extra 1M |
| Action compute | 20 GB-hours | 250 GB-hours | $0.33 / $0.30 per GB-hour |
| Database storage | 0.5 GB | 50 GB | $0.22 / $0.20 per GB |
| Database bandwidth (I/O) | 1 GB | 50 GB | $0.22 / $0.20 per GB |
| File storage | 1 GB | 100 GB | $0.033 / $0.03 per GB |
| Search storage | 0.5 GB | 1 GB | $0.55 / $0.50 per GB |
| Data egress | 1 GB | 50 GB | $0.132 / $0.12 per GB |
| Team members | 1–6 | 1–20 | — |

**What actually bites a reactive ledger app:**

1. **Function calls, not storage.** Every query *re-run* is a function call. A badly-scoped
   subscription (e.g. an un-namespaced aggregate `count()` read by 1,000 users, re-running on every
   insert anywhere) can burn 1M calls in hours. The aggregate README says this outright: it "can
   cause large function call and bandwidth usage on Convex."
2. **Database bandwidth.** Each re-run re-reads its read set. 1 GB free = ~3M reads of a 300-byte
   row. Wide pages × frequent invalidation is the multiplier to watch.
3. **Egress**, from receipt images served straight out of `_storage` at full resolution. §6.4's
   thumbnails are a cost control, not just a UX one.
4. **Search storage** is the smallest allowance (0.5 GB free) — a full-text index over every memo in
   every ledger will consume it. Consider making memo search a paid/opt-in feature, or index a
   truncated memo field.

Set **usage limits** per deployment (<https://docs.convex.dev/production/usage-limits>) so a runaway
subscription loop can't produce a surprise invoice. Watch the **Health dashboard** for cache hit
rate and failure rate (<https://docs.convex.dev/dashboard/deployments/health>).

---

## 10. Testing & load testing

### 10.1 `convex-test` (0.0.56)

```bash
npm i -D convex-test vitest @edge-runtime/vm
```

```ts
import { convexTest } from "convex-test";
import schema from "./schema";
const modules = import.meta.glob("./**/!(*.*.*)*.*s");

test("adding an item updates the monthly rollup", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user_1", name: "Hyo" });
  const ledgerId = await asUser.mutation(api.ledgers.create, { title: "집" });
  await asUser.mutation(api.items.add, {
    ledgerId, amountMinor: 12_000, type: "EXPENSE", monthKey: 202608, /* … */
  });
  const rollup = await asUser.query(api.rollups.month, { ledgerId, monthKey: 202608 });
  expect(rollup.expenseMinor).toBe(12_000);
});
```

APIs: `t.query/.mutation/.action(ref, args)`, `t.run(async (ctx) => …)` for raw db/file access,
`t.withIdentity({...})`, scheduler control via `vi.useFakeTimers()` +
`t.finishInProgressScheduledFunctions()` / `t.finishAllScheduledFunctions(vi.runAllTimers)`.

**Documented limitations — do not trust it for scale conclusions:**
- No enforced size/time limits (so a `.collect()` that would blow up in prod passes in test).
- Text and vector search are simplified — no relevance ranking, no efficient indexes.
- No cron support.
- Runtime differs from the real Convex runtime.
Source: <https://docs.convex.dev/testing/convex-test>

**Therefore BooKoo needs a second tier of tests: assertions on transaction metrics against a real
dev deployment.** Wrap the hot queries with `ctx.meta.getTransactionMetrics()` and assert
`documentsScanned.used < 2000` on a seeded 100k-item ledger. This is the only automated guard that
actually catches the regression class that killed the legacy app.

### 10.2 Load testing

Convex ships **LoadGenerator**, a Rust tool in the open-source backend repo
(`crates/load_generator`, docs at `self-hosted/advanced/benchmarking.md`). Architecture:
LoadGenerator → ScenarioRunner → Backend, with a stats report and optional Datadog export.

```sh
# 1. push scenario functions to a THROWAWAY backend (it replaces your functions)
cd npm-packages/scenario-runner
npx convex deploy --admin-key=<key> --url=<url>

# 2. run a workload
cd ../../crates/load_generator
just self-hosted crates/load_generator/workloads/<workload>.json \
  --existing-instance-url <url> --existing-instance-admin-key <key>
```

Custom scenario config:

```json
{
  "name": "bookoo_ledger_write",
  "scenarios": [
    { "name": "RunFunction", "path": "bench:addItem", "fn_type": "mutation", "rate": 20 },
    { "name": "RunFunction", "path": "bench:listPage0", "fn_type": "query", "rate": 200 }
  ]
}
```

`rate` = requests/second (open-loop), or thread count in benchmark mode. Convex's own testing uses
Jepsen and Antithesis for concurrency correctness plus open-loop load testing.

**Pragmatic BooKoo plan (don't build a Rust harness on day one):**
1. Seed script: `convex run seeds:seedLedger '{"items": 100000, "years": 5}'` — both reference
   projects already have a `convex/seeds.ts` (Martie's is 12 KB, FightingHows' 12.8 KB) to copy the
   shape from.
2. A `bench.ts` module of internal queries mirroring each hot screen; run each via
   `npx convex run` and read the dashboard's function latency + cache-hit panels.
3. Assert on `getTransactionMetrics()` in CI as above.
4. Only reach for LoadGenerator when you need concurrency numbers (N members writing to one ledger
   → OCC conflict rate on the rollup row).

---

## 11. BooKoo-specific rules (the checklist)

1. **No `.filter()` on `ledgerItems`, ever.** Index it or filter a bounded page in JS.
2. **No `.collect()` without a `.withIndex()` bound that is O(members) or O(months), never O(items).**
   Best practice threshold: `.collect()` only under ~1,000 docs.
3. **Every list is `.paginate()`d.** `initialNumItems: 30`, `loadMore(50)`.
4. **Every query starts with an indexed membership check** on `ledgerMembers.by_ledger_user`.
5. **`ctx.db.get("table", id)`** — two-arg form (1.42 deprecated the one-arg form).
6. **All mutations go through the triggers-wrapped `customMutation`.** Raw `mutation` is imported in
   exactly one file.
7. **Rollup tables for the dashboard; `@convex-dev/aggregate` (namespaced by `ledgerId`) only for
   arbitrary-range reports.** Never an un-namespaced aggregate.
8. **Never key an aggregate on `_creationTime`** — it serializes all inserts (README corollary).
9. **Hot-write fields live in `ledgerStats`, not on the `ledgers` document.**
10. **`getUrl` results are denormalized onto the document**, never called per row in a list query.
11. **Thumbnails generated client-side** before upload; two storage ids per photo.
12. **`ConvexQueryCacheProvider` plus its drop-in query hooks for every application read.** The
    five-minute cache is memory-only, bounded, and remounts on auth change. Never persist server query
    results or mutation arguments in MMKV; cold starts use truthful skeletons.
13. **No `Date.now()` inside queries** — pass `monthKey`/`dayKey` as arguments.
14. **Money is `amountMinor: v.number()` integers**, currency as ISO 4217 string. The legacy model
    kept `amount = '0'` (string) *and* `realAmount = 0` — do not repeat that.
15. **Set deployment usage limits** before the first public build.

---

## 12. Source index

- Pagination: <https://docs.convex.dev/database/pagination> · <https://stack.convex.dev/fully-reactive-pagination> · <https://stack.convex.dev/pagination>
- Pagination types: `get-convex/convex-js/src/server/pagination.ts`, `src/react/use_paginated_query.ts`
- Indexes: <https://docs.convex.dev/database/indexes/> · <https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf>
- Limits: <https://docs.convex.dev/production/state/limits>
- OCC: <https://docs.convex.dev/database/advanced/occ> · <https://docs.convex.dev/error#1>
- Queries/mutations: <https://docs.convex.dev/functions/query-functions> · <https://docs.convex.dev/functions/mutation-functions>
- Best practices: <https://docs.convex.dev/understanding/best-practices/>
- Aggregate: <https://github.com/get-convex/aggregate> · <https://www.convex.dev/components/aggregate> · <https://stack.convex.dev/efficient-count-sum-max-with-the-aggregate-component>
- Sharded counter: <https://github.com/get-convex/sharded-counter>
- convex-helpers: <https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md>
- Search: <https://docs.convex.dev/search/text-search>
- Storage: <https://docs.convex.dev/file-storage/upload-files> · <https://docs.convex.dev/file-storage/serve-files> · <https://docs.convex.dev/database/advanced/system-tables>
- Optimistic updates: <https://docs.convex.dev/client/react/optimistic-updates>
- React/RN client: <https://docs.convex.dev/client/react> · <https://docs.convex.dev/client/react-native> · <https://docs.expo.dev/guides/using-convex/>
- Crons: <https://docs.convex.dev/scheduling/cron-jobs>
- Testing: <https://docs.convex.dev/testing/convex-test>
- Load testing: `get-convex/convex-backend/self-hosted/advanced/benchmarking.md` · `crates/load_generator/README.md`
- Pricing: <https://www.convex.dev/pricing>
- Changelog: <https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md>
- Local-first options: <https://github.com/trestleinc/replicate> · <https://stack.convex.dev/automerge-and-convex>

**Local reference files cited:**
- `/Users/hyo/Github/hyodotdev/FightingHows/convex/board/queries.ts` (scan-limit constants, short-page contract)
- `/Users/hyo/Github/hyodotdev/FightingHows/convex/lib/serializers.ts` (`loadAuthorMap` batched join, `storageUrl`)
- `/Users/hyo/Github/hyodotdev/FightingHows/convex/schema/posts.ts` (denormalized counters, soft delete)
- `/Users/hyo/Github/hyodotdev/FightingHows/convex/schema/uploads.ts` + `convex/files/mutations.ts` (blob ownership)
- `/Users/hyo/Github/hyodotdev/Martie/convex/rank/queries.ts` (**anti-patterns**: unbounded `.filter().collect()`)
- `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/models/Ledger.ts` (`items = []` nested array — the bug being rewritten away)
