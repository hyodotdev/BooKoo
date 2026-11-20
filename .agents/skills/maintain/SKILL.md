---
name: maintain
description: Complete one serialized BooKoo maintenance or owner-directed product cycle, recovering existing work and releases before selecting, verifying, integrating and delivering one bounded bundle. Use when the user runs `/maintain` or `$maintain`, requests autonomous upkeep, or a configured daily maintenance run resumes.
---

# Maintain

Coordinate existing skills; keep their implementation and gates authoritative.
Standing owner authority and its exceptions live in
[AGENTS.md](../../../AGENTS.md#autonomous-operation). Current scope, evidence and
resume point live only in [STATUS](../../../.notes/STATUS.md); decisions and
visual direction stay in their existing `.notes/` owners.

## Acquire Before Acting

1. Verify the checkout and canonical remote `https://github.com/hyodotdev/BooKoo`.
   An older ops checkout may have unrelated history: preserve it and use the
   existing public worktree/checkout. Discover actual remote names; do not assume
   `origin` points to the public repo. Inspect Git status without exposing `.local/`.
2. Acquire the host-wide OS lock with
   `python3 .agents/skills/maintain/scripts/coordinator.py hold --owner <run-id>`
   in a managed interactive terminal. Keep that terminal/process alive throughout
   the cycle. Require its `ACQUIRED` result; exit code 75 means another run owns
   the coordinator: report contention and exit without starting any mutations.
   A new checkout without the skill must acquire the same lock from an existing
   checkout before creating branches or installing anything.
3. `status` probes the actual kernel lock, not PID guesses. The lock is shared
   across worktrees and clones on this host. If the holder dies, the OS releases
   it; retain the lock file/inode and acquire it normally. Never unlink it or kill
   an unfamiliar holder. A live orphan needs inspection of its terminal/run before
   stopping it. Across hosts require shared scheduler concurrency; this local
   lock alone is insufficient. Never enable a second host coordinator.
4. Immediately before each mutation after a wait, ensure the holder terminal is
   alive and `status` still reports the same owner/PID. If ownership is lost,
   stop mutations and reacquire before reconstructing remote state.
5. Release by sending a newline to the holder terminal only after saving the
   resume point and stopping owned transient processes. Do not leave a holder
   running across a saved external/PENDING checkpoint.

## Recover And Select

- Read STATUS, current owner goal, root/directory rules, package/lockfile, current
  workflows and relevant sibling skills. Fetch the canonical main; inspect open
  PRs, exact CI and release tags/runs. Recover existing task branches first.
  Preserve unrelated edits; isolate new work rather than stashing or resetting.
- Recover a pending/failed release before starting a dependent bundle. Query each
  platform separately: source/tag, artifact/build ID, internal upload, review,
  approval and public availability are different facts. A successful GitHub
  Release run only proves dispatch. After timeout query remote state before retry.
- If authentication/external review is the only blocker, record exact prerequisites
  and continue independent maintenance; never duplicate an upload or submission.
- With no new goal, choose one evidenced bug/security/performance/compatibility/CI/
  documentation fix. With a product goal, define flows, acceptance and order;
  record new direction proposals instead of implementing them without an owner goal.
- Before edits, claim one branch in STATUS with purpose, dependency order,
  acceptance, base SHA and expected delivery path. Bound the bundle: newly found
  unrelated updates go to the next cycle unless urgent or a real prerequisite.
  Use official release notes and compatibility sources for upgrades, preserve
  `.ncurc.json` exclusions and patch purposes, and review cumulative native changes.

## Execute Through Existing Owners

| Need | Reuse |
| --- | --- |
| Aggregate growth evidence / one growth experiment | `$analyze` / `$grow`, only when relevant to the owner's goal |
| Implementation to integration | `$loop-review` with `$commit`, `$review-self`, `$review-pr` |
| Lists, Convex, rollups | `$perf-audit` |
| UI refinement and implicated device scenarios | `$loop-ui` / `$e2e-test` |
| Marketing version / explicit build-floor decision | `$update-version` |
| Backend, OTA, candidate, store and follow-up | `$release-update` and purchase acceptance matrix |

Keep one coordinator and one review polling owner. Perform edits, installs,
hook installation, prebuild, integration and delivery sequentially. Self-review
must retain two complete clean snapshots at least five minutes apart covering
the final tree, terminal CI and resolved feedback. A single polling fallback
cannot replace this. Do not invoke external reviewers or call self-review
independent. Use bounded tool waits in the current task, not another automation
watching this PR. Save PENDING when the runtime cannot continue.

Run current CI's mandatory commands: frozen copyfile install, `bun lint:all`,
`bun typecheck`, coverage tests, full-history secret scan and the separate
anonymous local Convex 100k budget job. The budget child success marker is
required; exit 0 from its parent is insufficient. General Jest may skip that
suite. Prefer exact-head CI for isolated budget/history evidence; never borrow
an old SHA's result for changed inputs. Local QA must remove inherited deployment
credentials and use the existing anonymous runner. Store bounded logs/artifacts
on the verified DevLogs volume on the owner's host; no internal bulk fallback.
Record PASS / FAIL / PENDING / N/A per check and invalidate affected evidence
when files change. Required premerge native gates remain mandatory.

Read branch protection/rulesets and root merge policy immediately before
integration; use nonforce fast-forward when permitted, never implicit squash or
an admin bypass. Recheck remote main ancestry and exact reviewed head. Verify
GitHub recognizes the PR merge and check the exact main CI/deploy job afterwards.

## Decide Delivery And Resume

- Docs, skills and development-tooling-only bundles finish with integration and
  exact-main verification. Do not dispatch OTA or store tags for them.
- Runtime bundles deliver only when their acceptance and applicable source,
  native, purchase and old-client/backend compatibility gates pass. Compare
  cumulative changes since each platform's actual last public artifact.
- Reuse the existing backend CI, Patch OTA or Codemagic/local EAS native path;
  no EAS cloud builds. Require backend/index readiness before a dependent client.
  Verify target binary/version/fingerprint before asserting OTA compatibility.
  Internal candidate uploads precede final candidate acceptance; public review/
  rollout waits for it. Do not raise force-update floors with routine releases.
- Before release record last healthy source/artifact and a supported recovery
  path. Verify deployed functions and relevant smoke/error signals afterwards
  without gathering private ledgers. On regression stop dependent releases and
  use a verified compatible fix, supported OTA recovery or rollout halt.
- Limit the same failure to three cause-based attempts (or a stricter sibling
  limit). New evidence must justify a retry. Save exact PR/base/head/merge,
  checks, deployment states, external conditions and next runnable action in
  STATUS/PR; no duplicate backlog/history file or date-only commits. GitHub PR
  metadata owns final merge SHA, avoiding a SHA-only follow-up commit.
- Daily scheduling belongs to the supported app scheduler, once at 09:00
  Asia/Seoul after the first verified cycle. Inspect existing schedules before
  creating/updating one; no recursive runner or schedule proliferation. A local
  run needs the host awake, app running, project access, credentials and DevLogs
  for bulk work. If unavailable, report `$maintain` as the supported manual entry.
