# Review PR Comments

Review and address PR review comments for this repository.

## Arguments

- `$ARGUMENTS` — PR number (e.g. `65`) or PR URL.

Resolve the repository slug from the remote instead of hard-coding it:

```bash
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
```

## Project-Specific Checks

Based on the changed files, run these BEFORE committing a fix:

| Area | Commands |
|------|----------|
| Convex backend | `bun dev:convex:once` |
| TypeScript | `bun typecheck` |
| Lint + i18n JSON | `bun lint:all` |
| Unit tests | `bun run test` |
| Everything | `bun check` |
| Lists / queries / dashboard numbers | `$perf-audit` |
| Native, auth, permissions, device flows | `$e2e-test` |

## Project Conventions

When reviewing, check these BooKoo-specific rules:

- **Lists**: any list that can grow without bound uses `@shopify/flash-list`
  with `usePaginatedQuery` and `onEndReached`. `ScrollView` + `.map()` over
  server data is a defect, not a preference.
- **Convex queries**: `paginationOptsValidator` server-side, `withIndex` on
  every read, `.collect()` only on O(members)/O(months) bounded ranges, never on
  `ledgerItems`. `.filter()` on a growing table is a defect.
- **Aggregates**: month/category/balance numbers come from `monthlyRollups`,
  `dailyRollups`, or `ledgerStats`, patched in the same mutation as the write —
  never summed on the client.
- **Schema**: table definitions live under `convex/schema/` and are imported in
  `convex/schema.ts`. Every table carries `legacyUid`/`legacyKey` where the
  migration needs it.
- **TypeScript**: `any` is banned (`@typescript-eslint/no-explicit-any` is an
  error). No `as any` on route strings — `experiments.typedRoutes` is on.
- **i18n**: user-facing strings live in `assets/langs/` with static keys. No
  `t(dynamicKey as any)`.
- **Money and time**: integer minor units (`amountMinor`) plus an ISO 4217
  currency string; `monthKey`/`dayKey` arguments instead of `Date.now()` inside
  queries.
- **Styling**: `kstyled` template literals; no Emotion, no inline style objects
  recreated per render inside list rows.
- **State**: zustand stores in `src/stores/`, MMKV for the cold-start cache.

## Response Rules (CRITICAL)

**NEVER respond with "will address in a follow-up" or "will fix later".** Fix
all review comments now in the current PR. Every comment must be addressed with
a code fix and committed before replying. No exceptions.

For each comment:

1. **Read the code** the comment refers to.
2. **Fix it** immediately.
3. **Commit and push.**
4. **Reply** with the commit hash (plain text, no backticks).
5. **Track the thread ID** of each comment you replied to.
6. **Resolve ONLY the threads you replied to** — never resolve all threads
   blindly:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
```

**IMPORTANT:** only resolve threads where you posted a fix reply. The user may
want to review and resolve the others manually.

## Reply Format Rules (CRITICAL)

### Commit Hash Formatting

**Never wrap commit hashes in backticks or code blocks.** GitHub only auto-links
plain-text commit hashes.

| Format | Example | Result |
|--------|---------|--------|
| CORRECT | Fixed in f3b5fec. | Clickable link to the commit |
| WRONG | Fixed in `f3b5fec`. | Plain text, no link |

**Example of a correct reply:**

```text
Fixed in f3b5fec.

**Changes:**
- Replaced the ScrollView with FlashList + usePaginatedQuery
- Added the by_ledger_occurredAt index the paginated query needs
```

## Fetching Review State

```bash
gh pr view <PR> --json number,headRefOid,mergeable,reviewDecision,statusCheckRollup
gh api graphql -f query='
query($owner:String!,$name:String!,$pr:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$pr){
      reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{author{login} body}}}}
    }
  }
}' -F owner=<owner> -F name=<name> -F pr=<PR>
```

Record the head SHA with every clean verdict. Any push invalidates prior review
coverage.
