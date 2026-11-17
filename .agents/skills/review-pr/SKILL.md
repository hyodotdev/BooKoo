---
name: review-pr
description: Review BooKoo GitHub pull requests. Use when the user runs `/review-pr` or `$review-pr`, asks for PR review, wants actionable findings, or asks to address PR review comments.
---

# Review PR

Default to a code-review stance: findings first, ordered by severity, with
file/line references. Use GitHub connector tools when available; otherwise use
`gh` and local git commands.

## Workflow

1. Identify the PR, base branch, changed files, and discussion context.
2. Read the patch and the surrounding code it depends on.
3. Prioritize bugs, regressions, missing tests, data loss, privacy, and
   production risks.
4. Apply the BooKoo rules from `CLAUDE.md` and `AGENTS.md`, especially:
   - [SSOT and KISS](../../../AGENTS.md#ssot-and-kiss): verify canonical owners,
     reuse and the smallest required change; record any justified exceptions;
   - unbounded lists must be `FlashList` + `usePaginatedQuery` + `onEndReached`;
   - Convex list queries must be `paginate()` behind a `withIndex`, never
     `.collect()` on a growing table and never `.filter()` on `ledgerItems`;
   - dashboard and chart numbers come from rollup tables, not client-side sums;
   - `any` is banned, route strings are typed, i18n keys are static;
   - money is integer minor units and dates follow the repo-wide key convention.
5. Run `$perf-audit` when the PR touches `convex/`, a list screen, or a
   dashboard number, and quote its verdict table in the review.
6. If replying to PR comments, follow the formatting rules in
   `references/workflow.md`.
7. Do not request changes for style-only preferences unless they create concrete
   risk.

## Review Comment Handling

When addressing review comments, fix the issue in the current PR, commit, push,
reply to the exact review comment with the plain commit hash, then resolve only
that thread. Do not resolve unrelated threads blindly. If a suggestion cannot be
applied safely, reply with the concrete reason and evidence, and leave it
unresolved unless the user explicitly asks to resolve it.

## Reference

Read `references/workflow.md` for the full PR-review workflow and reply
formatting constraints.
