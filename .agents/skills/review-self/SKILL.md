---
name: review-self
description: Independently review and improve BooKoo's current implementation, working-tree changes, or pull request; fix actionable in-scope gaps; rerun relevant verification; and recheck at five-minute intervals until stable. Use when the user runs `/review-self` or `$review-self`, asks the agent to review its own changes, requests a self-review loop, or wants current work monitored after implementation.
---

# Review Self

Review the current work immediately, fix validated gaps, and use five-minute
confirmation rounds until the result is stable.

## Preserve Scope And Authority

- Treat invocation as authorization to inspect current work, make local in-scope
  fixes, and run relevant verification.
- Preserve the original request's authority. Do not commit, push, edit a PR,
  merge, deploy, or release unless the user already authorized it.
- Keep fixes tied to the original goal; avoid speculative refactors and
  unrelated cleanup.
- Record the initial worktree and preserve unrelated user changes.
- Stop when a fix requires a material product choice, new authority, or expanded
  scope.

## Establish The Target

1. Reconstruct the requested outcome and acceptance criteria from the
   conversation and the repository.
2. Prefer an explicitly supplied PR, branch, range, or path. Otherwise review
   the current branch, including staged, unstaged, and untracked changes.
3. Derive PR base and head from GitHub metadata. Without a PR, use the upstream
   merge base rather than assuming a base branch.
4. Read `AGENTS.md`, `CLAUDE.md`, and any applicable per-directory conventions
   before editing.
5. Stop with a concise report when no reviewable diff and no asynchronous state
   exist.

## Run One Round

1. Resnapshot the complete base-to-head diff plus all worktree overlays and
   untracked contents. Never trust the previous round's snapshot.
2. Read surrounding code, tests, requirements, CI, and review feedback.
3. Look for evidence-backed gaps in:
   - [SSOT and KISS](../../../AGENTS.md#ssot-and-kiss): identify canonical
     owners, check reuse and record justified duplication or complexity;
   - requirement completeness and end-to-end wiring;
   - correctness, state transitions, errors, concurrency, data safety, and
     security;
   - public contracts, compatibility, i18n, generated-file rules, and native
     platform parity;
   - required tests, migrations, documentation, and operational safeguards;
   - BooKoo's hard rules — every unbounded list is `FlashList` +
     `usePaginatedQuery`, every Convex list query is `paginate()` behind a
     `withIndex`, `any` never appears, route strings are typed, i18n keys are
     static, and money stays in integer minor units.
4. Validate findings against current code. Reject taste-only churn, duplicates,
   and unrelated nice-to-haves.
5. Fix all validated in-scope findings in one coherent batch and preserve
   unrelated edits.
6. Re-read the result and run touched-path lint, typecheck, tests, builds, and
   `git diff --check`. Avoid repeating expensive checks when the fingerprint is
   unchanged.
   - `bun lint:all` plus `bun check` (lint, typecheck and tests). `bun check`
     alone does not run the locale, dependency, secret, schema or release checks.
   - `bun dev:convex:once` when `convex/` changed.
7. When the diff touches `convex/`, a list screen, or a chart/dashboard number,
   run `$perf-audit` and treat any FAIL row as a blocking finding.
8. For native, permission, auth-provider, or device-flow changes, use
   `$e2e-test` when applicable.
9. If a PR exists, use `$review-pr` for one feedback-handling pass, but do not
   start its polling loop while this skill owns polling.
10. Commit or push only when already authorized, following `$commit`; stage only
    files owned by the current batch.

## Act As A Fallback Reviewer

When `$loop-review` or `$review-pr` invokes this skill because the configured
external reviewer has not covered the current PR head — it failed, it is not
installed, or it simply has not answered — do not wait for it:

- Run exactly one complete round against the supplied base, head SHA, and
  acceptance criteria. Keep the commit and push authority the caller supplied.
- Do not schedule the recurring rounds below, re-enter the calling workflow, or
  request another review bot. The caller stays the only polling owner.
- Return the reviewed head fingerprint, validated findings and fixes, checks
  run, and a clean or blocked result. The caller may cache a clean result only
  for that exact head and must invalidate it after any head change.

This override exists so a fallback review never starts a second polling loop.

## Recheck Every Five Minutes

- Run the first round immediately.
- In an active task, use supported bounded tool waits to recheck after at least
  300 seconds; do not create an automation to watch this task to completion.
  If the environment cannot continue, save a resumable PENDING checkpoint.
  Never emulate recurrence with shell sleep loops or detached background jobs.
- Keep one polling owner for the same target.
- Carry the original goal, target/base, head and worktree fingerprints, seen
  feedback/check IDs, poll count, clean count, findings, fix attempts, and
  commit/push authority in the active loop checkpoint.
- Keep loop state out of tracked files and revalidate it against disk and
  GitHub.
- Increment the clean count only after a full round has no actionable findings,
  verification passes, required checks are terminal, feedback is resolved, and
  the final diff is reread. Reset it on material change.
- Finish after two consecutive clean snapshots separated by five minutes.
- Treat pending CI or review automation as neither clean nor failed.
- After self-review stabilizes, hand control to `$review-pr` at the user's
  requested interval instead of running both polling loops concurrently.

## Stop Safely

Stop and report exact state when:

- two separated clean snapshots establish stability;
- the user redirects or stops the task;
- the PR closes, merges, disappears, or changes incompatibly;
- a finding needs new authority or a product decision;
- the same finding survives two fix attempts;
- the same tool or authentication blocker repeats three rounds;
- only unchanged pending external state remains after 12 polls.

Do not describe blocked, pending, or interrupted work as clean.

## Communicate

- At startup, state target, base, scope, and external-write authority.
- Report material findings, fixes, verification failures, pushes, and external
  transitions promptly; keep no-op updates brief.
- On completion, summarize fixes, changed files, checks, commits/pushes, the two
  clean snapshots, and unresolved blockers.
