# Perf Audit — full checklist

Authoritative rule list: `.notes/research/13-convex-scale.md` §11. Every finding
cites a rule number from it. Supporting detail lives in the same document:
§1.3 (`.filter()` is the trap), §1.6 (hard limits), §2 (pagination), §3
(aggregation), §4.3 (narrow read sets), §5 (BooKoo denormalization), §6.3
(`getUrl` list trap), §7 (client-side feel).

Run from the repository root. `grep -rn` is used rather than `rg` so the
commands work on a bare macOS shell; substitute `rg` freely if it is installed.

---

## 0. Preflight

```bash
git status --short --branch
bun lint
bun typecheck
```

`@typescript-eslint/no-explicit-any` is an error, so a lint failure mentioning
`any` is a perf finding too: an `any` on a query result is how an unpaginated
source hides from the type checker.

---

## 1. Convex read surface

### 1.1 `.collect()` census — rule §11.2

```bash
grep -rn "\.collect()" convex --include='*.ts'
```

For each hit answer, in the report:

| Question | PASS answer |
|---|---|
| Is there a `.withIndex(` in the same chain? | yes |
| What is the bound? | O(members) or O(months), never O(items) |
| Could it exceed ~1,000 docs in five years? | no |
| Is the bound stated in a comment at the call site? | yes |

Anything else is a FAIL. Convex's own limits make this non-negotiable: 32,000
documents scanned and 16 MiB read per transaction (§1.6).

### 1.2 `.filter()` census — rule §11.1

```bash
grep -rn "\.filter(" convex --include='*.ts'
```

Separate the two kinds of hit:

- `ctx.db.query("table").filter(q => ...)` — a **server-side** filter. On
  `ledgerItems`, comments, notifications, or any per-entry table this is an
  automatic FAIL: Convex scans every row the index range returns and only then
  discards. Index it instead, or narrow the index range.
- `page.filter((row) => ...)` — a JS filter over an already-bounded page. This is
  fine, and is the documented workaround.

### 1.3 Pagination shape — rule §11.3

```bash
grep -rn "\.paginate(" convex --include='*.ts'
grep -rn "paginationOptsValidator" convex --include='*.ts'
grep -rn "maximumRowsRead" convex --include='*.ts'
```

PASS requires, for every paginated query:

- `args` include `paginationOpts: paginationOptsValidator`;
- the chain has a `.withIndex(` before `.paginate(`;
- `.order("desc")` where the UI shows newest first, rather than reversing in JS;
- `maximumRowsRead` (e.g. 4000) whenever rows are dropped in JS after the index
  — soft-deleted rows, permission-hidden rows, rare categories. Without it a
  sparse match scans the table.

A page bounded by `maximumRowsRead` may return fewer than `numItems` rows. The
client contract is therefore "keep calling `loadMore` until `isDone`" — verify
the client honours it (section 3).

### 1.4 Membership guard — rule §11.4

```bash
grep -rn "by_ledger_user" convex --include='*.ts'
```

Every query and mutation that touches ledger-scoped data must start with the
indexed membership check on `ledgerMembers.by_ledger_user`. A query that reads
ledger data without it is both a security and a perf finding.

### 1.5 Time arguments — rule §11.13

```bash
grep -rn "Date.now()" convex --include='*.ts'
```

`Date.now()` inside a query handler destroys the per-(query, args) cache and
makes the result unshareable between members. PASS requires `monthKey` / `dayKey`
passed as arguments. Inside mutations it is fine.

### 1.6 Document API and mutation wrapper — rules §11.5, §11.6

```bash
grep -rn "ctx.db.get(" convex --include='*.ts'
grep -rn "from \"./_generated/server\"\|from '.\/_generated\/server'" convex --include='*.ts'
```

- `ctx.db.get("table", id)` — the two-argument form.
- The raw `mutation` may be imported in exactly one file (the triggers wrapper).
  Every other module imports the wrapped `customMutation`. More than one raw
  import is a FAIL: rollups then depend on discipline instead of triggers.

### 1.7 File URLs — rule §11.10

```bash
grep -rn "getUrl" convex --include='*.ts'
```

FAIL when `storage.getUrl` is called per row inside a list query. The URL is
denormalized onto the document at write time.

---

## 2. Aggregates

Rules §11.7, §11.8, §11.9.

```bash
grep -rn "monthlyRollups\|dailyRollups\|ledgerStats" convex src app --include='*.ts' --include='*.tsx'
grep -rn "\.reduce(\|+=" src app --include='*.ts' --include='*.tsx'
grep -rn "@convex-dev/aggregate" convex --include='*.ts'
```

PASS criteria:

- every dashboard, chart, or header number resolves to a rollup table read;
- the rollup is patched in the **same mutation** as the source write, through
  the triggers wrapper, so it is atomic;
- an aggregate component, if used at all, is namespaced by `ledgerId` and is
  never keyed on `_creationTime` (§11.8);
- `memberCount` is maintained on write, never counted by collecting
  `ledgerMembers`.

FAIL examples to look for specifically:

- summing the loaded page to draw a "this month" total — wrong at page
  boundaries, not merely slow;
- computing a running balance by walking all prior entries;
- a chart component that receives the raw item list as its prop.

---

## 3. Lists on the client

Rule §11.3, plus §11.12 for the cached screens.

```bash
grep -rn "FlashList\|FlatList\|SectionList\|ScrollView" app src --include='*.tsx'
grep -rn "usePaginatedQuery" app src --include='*.ts' --include='*.tsx'
grep -rn "useQuery" app src --include='*.ts' --include='*.tsx'
grep -rn "onEndReached\|loadMore\|isDone\|initialNumItems" app src --include='*.tsx'
```

For each list, fill one verdict row. PASS requires all of:

| Property | PASS |
|---|---|
| Component | `FlashList` from `@shopify/flash-list` |
| Source | `usePaginatedQuery` on an indexed, paginated Convex query |
| Paging | `onEndReached` calls `loadMore(50)`; loop continues until `isDone` |
| First page | `initialNumItems: 30` unless a stated reason says otherwise |
| Empty/loading | rendered from `status`, not from `data.length === 0` alone |

`useQuery` is allowed only on bounded data: a single ledger document, the
current user, the member list of one ledger, the category preset list. Using it
on `ledgerItems`, comments, or notifications is a FAIL regardless of the current
row count.

A `ScrollView` is allowed only for a fixed-height form or a settings page whose
content cannot grow with data.

---

## 4. Row render cost

For each `FlashList`:

- `keyExtractor` returns the document id, never the index;
- `getItemType` is provided when rows differ structurally (day header vs entry);
- the row component is wrapped in `React.memo`, and its props are primitives or
  stable references — no inline `{}`, `[]`, or `() => {}` in the list's JSX;
- styles come from `kstyled` template literals defined at module scope, not from
  objects rebuilt per render;
- no row issues its own `useQuery`. Batch the join server-side into a map keyed
  by `userId` (see 13-convex-scale §4.4);
- amounts render from `amountMinor` integers through a single formatter
  (§11.14).

---

## 5. Read-set width

Rules §11.9, §11.12, plus §4.3.

For the ledger timeline, the calendar month, and the statistics month:

```bash
bunx convex function-spec
```

Record for each: the tables read, the index used, the argument cache key, and
whether the query mixes volatile and stable data.

PASS requires:

- header data and list data come from **different** queries;
- hot-write counters live in `ledgerStats`, not on the `ledgers` document;
- arguments are coarse buckets (`monthKey`), so members of the same ledger share
  a cache entry;
- the three screen-defining queries use the session-scoped
  `ConvexQueryCacheProvider` hooks. The cache is bounded and memory-only; a
  persistent server-data mirror or offline write queue is a finding.

When a deployment is reachable, read the Convex dashboard's Insights view and
name the top queries by documents scanned and bytes read. A query in the top
slot that is not one of the three screen-defining queries is a finding.

---

## 6. Reporting template

```markdown
## Perf audit — <branch or PR> @ <sha>

| Screen / query | Data source | Index | Page size | Read set | Verdict | Rule |
|---|---|---|---|---|---|---|
| … | … | … | … | … | PASS/FAIL | §11.x |

### Findings

1. **FAIL — §11.1** `convex/ledger/queries.ts:42`
   `ctx.db.query("ledgerItems").filter(...)` scans the whole ledger.
   Fix: add `by_ledger_category_occurredAt` and narrow the index range.

### Exemptions accepted

- `convex/ledger/members.ts:18` — `.collect()` bounded to O(members), 50 max,
  comment present.

### Not checked

- <sections skipped and why>
```

Never report PASS for a section that was not run. "Not checked" is an honest
result; a blank verdict table is not.
