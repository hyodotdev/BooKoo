---
name: loop-review
description: Run BooKoo's complete change-to-merge loop from the latest origin/main; create a semantic branch, implement and verify the change, stabilize with review-self, commit and open a PR, poll CI every five minutes with an exact-head review-self fallback, fix and reverify findings, gate the performance and device regressions, and merge only when the exact head is clean. Use when the user runs `/loop-review` or `$loop-review`, or asks for the recurring review-self then commit --pr then review-pr until clean then merge workflow.
---

# Loop Review

Own one BooKoo change from a fresh `main` baseline through a verified merge.
Delegate to the sibling skill that owns a procedure instead of restating it.
Only the steps no sibling skill owns — polling, the
regression gates, and the merge — are specified here.

## Load The Workflows

Read before acting:

- `AGENTS.md` and `CLAUDE.md`
- `$review-self`, `$commit`, `$review-pr`, `$perf-audit`, `$e2e-test`

An explicit invocation authorizes the in-scope commit, push, PR creation, review
replies, thread resolution, and merge for this task. It does not authorize
`$release-update`, store submission, Expo updates, running data migrations
against production Convex, or unrelated cleanup. Existing standing authority in
AGENTS.md still applies when this is a `$maintain` continuation.

## 1. Start From Current Main

1. Snapshot `git status --short --branch`. Preserve every existing change.
2. Resolve the canonical repository and remote first. For `$maintain`, it is
   `hyodotdev/BooKoo`; an ops clone's `origin` can point elsewhere. Fetch that
   remote's main explicitly and record its full SHA as the integration base.
3. Require a clean task worktree before claiming new work. Branch from that
   fetched main using `$commit` naming rules. Fast-forward an existing local
   main only when its lineage matches and no other task uses it; otherwise
   preserve it and use an isolated checkout/worktree based on canonical main.
4. Record the remote name and main SHA. Use that remote/main throughout this
   loop, including PRs, ancestry checks, push and final readback; `origin/main`
   in examples is not authority to integrate into a different repository.

If invoked for work already in progress, treat it as a resumed loop. Do not
stash, reset, switch branches, or discard anything. Verify the merge base and
stop for direction when an update from `origin/main` would disturb unrelated
user work.

## 2. Implement And Verify

Implement the requested scope only. Run the checks the touched paths require:

- `bun lint:all`
- `bun typecheck`
- `bun run test`
- `bun dev:convex:once` when `convex/` changed

`bun check` runs lint, typecheck and tests; run `bun lint:all` separately for
the additional locale, dependency, secret, schema and release checks. The `pre-commit` hook that
`bun install` installs (`scripts/install-git-hooks.sh`) runs `bun lint:all` and `bun typecheck`, and `commit-msg` runs commitlint, so a
commit that skips them still fails. Never use `--no-verify`. Do not continue
while a required check is known to fail.

## 3. Stabilize With Review Self

Run `$review-self` immediately against the complete base-to-worktree diff. Fix
every validated in-scope finding and rerun the affected verification. Continue
its five-minute rounds until two consecutive complete snapshots are clean, as
that skill defines. Any material diff change resets the clean count.

Keep loop state out of tracked files. Never emulate the interval with a shell
sleep loop or a detached background process.

## 4. Commit And Open The PR

Follow `$commit` with push and PR:

- Stage only the files owned by this task.
- Write an English Angular Conventional Commit subject.
- Push the semantic branch and open an English PR against `main`.
- Apply 1–3 existing repository labels; never invent new ones.

Use `$review-self` for change reviews. Do not request Muse or substitute another
external reviewer. Inspect existing human/automation feedback through `$review-pr`;
report self-review honestly without claiming independent coverage. The single-round
fallback below handles feedback during polling; it does not replace step 3's two
clean snapshots separated by five minutes.

When the pushed head is identical to the diff step 3 already stabilized, record
that coverage against the head SHA instead of repeating the round. Any later
push invalidates it.

Record the PR number and the exact head SHA. Every push invalidates all prior
clean review coverage.

## 5. Poll Until The Exact Head Is Clean

Run `$review-pr` immediately, then re-enter it every five minutes through
supported bounded tool waits in the active task. `loop-review` is the only polling owner;
`review-pr` performs one pass per round.

Each round:

1. Fetch unresolved threads, review state, the current head SHA, and required
   CI.
2. Fix all valid findings in one coherent batch, push, reply to the exact inline
   comment with the plain commit hash, and resolve only the threads you replied
   to with a fix.
3. Rerun the checks the batch affects plus everything previously failing.
4. After a head change, redo step 4 for the new SHA — rerun the affected self-review
   and re-establish head coverage, since the push invalidated the previous
   round.
5. Keep polling while CI or actionable feedback is pending. Do not rerun
   expensive unchanged local checks on a no-op poll or request review bots.

Clean means all of these hold for the same head SHA:

- zero unresolved actionable review threads;
- the head has clean `$review-self` coverage and step 3's two separated clean
  snapshots still cover this exact tree; a single fallback is insufficient;
- every required CI check is terminal and successful;
- the PR is mergeable and carries every required update from `main`;
- the worktree is clean and the final diff has been reread.

## 6. Gate The Regressions Before Merging

Decide both gates **before** merging, not after.

### Performance gate

Require `$perf-audit` when the diff touches `convex/`, any list screen, any
`useQuery`/`usePaginatedQuery` call site, the schema, or a dashboard/chart
number. A FAIL row blocks the merge. This gate exists because the legacy app's
one fatal defect was loading a whole ledger into memory; CI does not catch it.

### Device gate

Require `$e2e-test` when the diff touches user-facing behavior or native
wiring — `app/`, `src/`, `assets/langs/`, ledger/item/calendar/statistics flows,
sign-in providers, invite deep links, app lock, receipt photo capture,
notifications, `app.config.ts`, `plugins/`, `android/`, `ios/`, or dependency
changes that reach the runtime.

When required, run `$e2e-test` for the implicated scenarios and record its
result on the PR before merging. Missing or failed native gates block merging.
Only an explicit written owner waiver naming the omitted checks and reason can
waive a missing gate; record it verbatim. Do not request a waiver for checks that
can be completed under standing authority.

Absence of an objection is not a waiver, and the loop never grants itself one.
Green CI is not a substitute — CI does not launch a simulator, add a ledger
entry, or exercise a social sign-in dialog.

A change confined to documentation, agent skills, repository automation, or
tooling does not need device regression. Say so explicitly and name the paths
that justify it; silence reads as an untested merge.

## 7. Merge And Close The Loop

Immediately before merging, refetch the PR and confirm its head still equals the
clean reviewed SHA. Follow root AGENTS.md: strict nonforce fast-forward only.
Confirm remote main is an ancestor of the reviewed head. Inspect current protection and
rulesets first. If permitted, push the reviewed head to main without force and
verify GitHub marks the PR merged. If protection requires a different method,
report the conflict without bypassing it. Do not silently substitute squash or
merge a stale, pending, or failing head.

After merge:

1. Confirm the PR state is `MERGED` and record the merge commit.
2. Preserve substantive review discussion and evidence; no reviewer-trigger
   comments are needed for self-review.
3. Fast-forward the matching local integration checkout only when that cannot
   disturb other work. Preserve any legacy ops main with a different history.
4. Report the PR, merge commit, final checks, review coverage, gate results, and
   anything skipped. Do not release or deploy unless separately requested.

## Stop Conditions

Stop without merging when a required decision lacks authority, the same finding
survives two fix attempts, the same access or tool blocker repeats three rounds,
a required regression gate has not run, or the exact head cannot satisfy the
clean gate. Report the concrete blocker. Never describe a pending or partially
reviewed PR as clean.
