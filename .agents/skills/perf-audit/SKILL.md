---
name: perf-audit
description: Audit BooKoo for unbounded-data performance regressions. Use when the user runs `/perf-audit` or `$perf-audit`, asks why a screen is slow, adds a new list or Convex query, or before merging anything that touches ledger entries, comments, members, or notifications. Checks FlashList usage, Convex pagination and indexes, denormalized aggregates, and render cost.
---

# Perf Audit

Legacy BooKoo died of one defect: it loaded a whole ledger's items into the
client and recomputed everything on every change. This audit is the standing
proof that the rewrite does not repeat it. It is a **runnable procedure with
pass/fail criteria**, not a reading exercise.

The rule list this audit enforces is
`.notes/research/13-convex-scale.md` §11 — cite the rule number in every
finding. `references/checklist.md` holds the full command set, the per-rule
pass/fail wording, and the exemption format.

## Scope

Run the whole audit before a release or when asked "why is this slow". Run only
the sections a diff touches when gating a PR:

| Diff touches | Sections |
|---|---|
| `convex/` | 1, 2, 5 |
| a list screen or `app/`, `src/` | 3, 4 |
| a chart, dashboard, or total | 2, 4 |
| schema or index change | 1, 5 |

## 1. Convex read surface

```bash
grep -rn "\.collect()"    convex --include='*.ts'
grep -rn "\.filter("      convex --include='*.ts'
grep -rn "\.paginate("    convex --include='*.ts'
grep -rn "\.withIndex("   convex --include='*.ts'
grep -rn "\.take("        convex --include='*.ts'
grep -rn "paginationOptsValidator" convex --include='*.ts'
grep -rn "Date.now()"     convex --include='*.ts'
```

**FAIL** when any of these hold:

- a `.collect()` whose `.withIndex()` bound is O(items) rather than O(members)
  or O(months), or that has no `.withIndex()` at all (§11.2);
- a `ctx.db.query(...).filter(...)` on `ledgerItems`, comments, notifications,
  or any other table that grows per entry — index it or filter a bounded page in
  JS instead (§11.1);
- a `.paginate(` whose chain has no `.withIndex(` (§11.3);
- a paginated query whose `args` omit `paginationOptsValidator` (§11.3);
- post-index JS filtering in a paginated query with no `maximumRowsRead` bound;
- `Date.now()` inside a query handler instead of a `monthKey`/`dayKey` argument
  (§11.13);
- a list query that does not begin with the indexed membership check on
  `ledgerMembers.by_ledger_user` (§11.4);
- a `storage.getUrl` call inside a per-row loop of a list query (§11.10).

**PASS** requires every `.collect()` and every `.filter(` hit to be either
absent or carry a one-line comment naming its bound. An unbounded read with no
justification is a FAIL even when the table is small today.

## 2. Aggregates come from rollups

```bash
grep -rn "monthlyRollups\|dailyRollups\|ledgerStats" convex src app --include='*.ts' --include='*.tsx'
grep -rn "\.reduce(\|+=" src app --include='*.ts' --include='*.tsx'
```

**FAIL** when a month total, category breakdown, running balance, member count,
or any dashboard number is computed by summing rows the client loaded (§11.7,
§11.9). Those numbers must be read from a rollup table patched in the same
mutation as the write.

**FAIL** when a rollup is patched outside the mutation that wrote the source row
— that is a consistency bug the audit owns, not a separate concern.

## 3. Every unbounded list is a paginated FlashList

```bash
grep -rn "FlashList\|FlatList\|SectionList\|ScrollView" app src --include='*.tsx'
grep -rn "usePaginatedQuery\|useQuery" app src --include='*.ts' --include='*.tsx'
grep -rn "\.map(" app src --include='*.tsx'
```

For every hit, resolve the data source and record it in the verdict table.

**FAIL** when:

- a `ScrollView` + `.map()` renders server data that can grow (§11.3);
- a `FlatList` or `SectionList` renders server data — the repo standard is
  `@shopify/flash-list`;
- a `FlashList` is fed by `useQuery` on a growing table rather than
  `usePaginatedQuery`;
- a `FlashList` has no `onEndReached` calling `loadMore`, or ignores `isDone`;
- `initialNumItems` is far from 30 or `loadMore` is far from 50 without a stated
  reason — a bigger page is a wider read set, not a free optimization (§11.3).

## 4. Render cost of the rows

Inspect every `FlashList` and its row component.

**FAIL** when:

- `keyExtractor` is unstable (index-based, or a value that changes per render);
- rows are heterogeneous and `getItemType` is missing;
- the row component is not memoized, or receives an inline object, array, or
  arrow function as a prop — every parent render then re-renders every row;
- a row calls its own `useQuery` (N subscriptions instead of one batched join);
- a row formats money by parsing a string — money is `amountMinor` integers
  formatted once at the edge (§11.14).

## 5. Read-set width of the hot queries

The three screen-defining queries — ledger timeline, calendar month, statistics
month — decide how the app feels. For each one, record what it reads.

- A query must not return both rarely-changing header data and constantly-
  changing list data. Split them, or every entry write re-renders the header.
- Hot-write fields belong in `ledgerStats`, never on the `ledgers` document
  (§11.9).
- Arguments must be coarse cache keys (`monthKey: 202608`), never `Date.now()`.
- Confirm the deployed function surface matches what the client calls:

  ```bash
  bunx convex function-spec
  ```

- When a deployment is reachable, read the Convex dashboard's Insights view for
  the documents-scanned and bytes-read outliers and name the worst query.

**FAIL** when a hot query's read set covers a whole table, or when one query
serves both a header and a list.

## Verdict Table

Report exactly this, one row per screen or query. Anything other than PASS
blocks the merge.

```markdown
| Screen / query | Data source | Index | Page size | Read set | Verdict | Rule |
|---|---|---|---|---|---|---|
| Ledger timeline | ledgerItems.paginate | by_ledger_occurredAt | 30 / 50 | one ledger, one page | PASS | §11.3 |
| Statistics month | monthlyRollups | by_ledger_month_category | n/a (≤ 30 rows) | one ledger-month | PASS | §11.7 |
```

Then list every FAIL with file:line, the rule number, and the concrete fix. Do
not soften a FAIL because the table is currently small — the audit exists for
the dataset the app will have, not the one it has.

## Exemptions

An exemption is a one-line comment at the call site naming the bound and why it
cannot grow, for example:

```ts
// Bounded: O(members) — a ledger caps at 50 members. 13-convex-scale §11.2
```

An exemption without a stated bound is a FAIL.

## Reference

Read `references/checklist.md` for the complete command set, the per-rule
pass/fail wording, and the reporting template.
