# BooKoo operations status

## Active batch

- Mode: maintenance; standing authority remains AGENTS.md Autonomous operation.
- IMPLEMENTED: `bugfix/secure-shell-quote`, base
  `c4ba5783b097a0255c6c67d238849e2e3b87dd1c`.
- Purpose: resolve [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)
  (CVE-2026-102422) in locked
  shell-quote 1.10.0. Audit reports this as critical. The only lockfile owner is
  react-devtools-core 6.1.5 (`^1.6.1`), loaded by React Native's `__DEV__` setup.
  No app-specific exploit path or production compromise is asserted.
- Order: recover existing delivery/PR state; verify maintainer advisory/release
  and actual callers; select a compatible same-major fixed dependency; exercise
  the advisory input without executing it; regenerate only the transitive lock;
  frozen install/patch checks, source verification and production bundle boundary;
  exact-head CI, two clean self-reviews >=300s apart, strict nonforce FF merge,
  then exact-main CI/backend readback.
- Acceptance: vulnerable shell-quote removed from lock/install and audit;
  benign quoting/parse preserved and unsafe post-comment terminators rejected;
  no added direct dependency/override, unrelated upgrades, patch removal,
  native/backend contract or marketing version change. Verify whether the
  dependency reaches production before deciding native/client delivery gates.
- Selected version: shell-quote 1.12.0, current npm stable within the owner's
  existing ^1.6.1 range. [Maintainer changelog](https://github.com/ljharb/shell-quote/blob/v1.12.0/CHANGELOG.md)
  confirms the 1.11.0 fix is included. Only one lock resolution changes.
  Bun 1.3.13's named update added a direct dependency and retained a nested
  vulnerable copy; reject that result. A temporary resolution override followed
  by normal lock generation refreshes the transitive copy, with package.json
  restored exactly and no override/direct dependency left in the final tree.
- Delivery: tooling-only resolution; no native module or application change.
  Before/after production-mode exports (QA native identity, not signed store
  candidates) are byte-identical across all 190 iOS / 194 Android output files,
  including Hermes bytecode and source maps. Neither selected package nor
  react-devtools-core appears in 3,801 iOS / 3,893 Android mapped sources.
  React Native also gates its DevTools setup behind __DEV__. No client OTA,
  binary build, version bump, native/device/purchase acceptance is needed here.
- Integration record: [tracking PR](https://github.com/hyodotdev/BooKoo/pulls?q=is%3Apr+head%3Abugfix%2Fsecure-shell-quote).
  Its exact head/merge/checks and final comment own completion evidence; if
  merged with passing exact-main CI, continue the next-cycle queue below.

## Verification and resume

- PASS recovery: current public main c4ba5783, no open PR/issues, exact-main CI
  44764921928 and production deployment successful. Prior maintain PR9 is merged.
- PASS read-only audit: registry reports 12 affected package names including one
  critical shell-quote advisory. Keep this bundle confined to that dependency;
  other advisories need separate reachability/compatibility triage.
- PASS capability recovery: stored Codemagic API credential and existing Patch
  CLI login work. Environment-variable absence alone does not prove no access.
  Finish sanitized release readbacks before new uploads; no build was started.
- PASS: frozen copyfile install and existing patch/postinstall checks; complete
  lint:all, typecheck and coverage (227 suites, 1,751 passed, 15 existing skips).
  Real consumer resolution is shell-quote 1.12.0. Before fix: 0/4 malicious
  post-comment line terminators rejected; after fix: 4/4 rejected as TypeError.
  Two normal quote/parse round trips pass in both versions. No generated command
  was executed. package.json is byte-for-byte unchanged; lock diff is one record.
- PASS production boundary: all exported files identical on both platforms.
  Hermes SHA-256: iOS 8b74842e75a9ddfdce0a98f74c247953ced5b43395850ba51b1d416a8fd4231a;
  Android 74456e5b90232d1eae887220999d9707f9e997165e0320b8e3db9704ac68117f.
- Scoped advisory PASS: shell-quote absent from fresh audit; critical count 1→0.
  Overall audit still FAIL: 44 existing entries (20 high, 16 moderate, 8 low)
  across 11 other package names. No warnings suppressed or global clean claim.
- N/A: Convex source deploy validation, perf audit, native/device/purchase gates;
  no backend, unbounded list or production/native runtime changes. Required CI
  still runs the isolated Convex budgets and verifies the child success marker.
- Final exact-head/history/budget CI, two clean self-reviews >=300s apart,
  merge and exact-main deploy evidence belong to the tracking PR's final comment.
  These remain mandatory integration gates; do not infer them from local tests.
- SSOT/KISS: bun.lock owns transitive resolution; upstream shell-quote owns
  escaping. Reuse its API and react-devtools-core's allowed semver range; do not
  add an application escaping implementation or a permanent speculative override.
- Owner decisions needed: none for this bounded maintenance fix.

## Last observed delivery (verify before client release)

| Surface | Observed state | Evidence / next read |
| --- | --- | --- |
| Backend | PASS: production deployed source `c4ba5783` before this batch | [main CI](https://github.com/hyodotdev/BooKoo/actions/runs/44764921928), deploy job succeeded; final batch state comes from the tracking PR |
| Source | package 1.5.0; Expo 57 / RN 0.86.3 / React 19.2.3 / Convex 1.45.0 / expo-iap 6.4.2 | package.json + bun.lock; no version changes in this batch |
| Release dispatch | PASS: last run was `ota-dry`, not a store or public OTA dispatch; current remote has no tags | [run](https://github.com/hyodotdev/BooKoo/actions/runs/44467232727), step log inspected; do not replay removed tags |
| iOS | PASS ASC readback: 1.5.0 READY_FOR_SALE / AFTER_APPROVAL, selected build 60 VALID, not expired | App 6805969489 / dev.hyo.bookoo, read 2026-11-21 KST; [public Apple lookup](https://itunes.apple.com/lookup?id=6805969489&country=kr) independently confirms 1.5.0 (release 2026-11-18T18:25:16Z) |
| Android | PASS public listing advertises 1.5.0; exact build/versionCode and internal-track state PENDING authenticated Play readback | [public Play](https://play.google.com/store/apps/details?id=dev.hyo.bookoo&hl=en&gl=US); no new upload or rollout performed |
| OTA | PASS authenticated Patch Production readback: zero releases for both BooKoo-iOS and BooKoo-Android, total=0 | Existing login used; latest Codemagic dry run 6afe8cca799fbd143cea904c finished successfully; no new dispatch |

## Next cycle

Finish the current security bundle before selecting another update. The baseline
registry audit contains 45 advisory entries (1 critical, 20 high, 16 moderate,
8 low) across 12 package names; these are reported ranges, not proof of app
reachability. This batch resolves the sole critical package, shell-quote. Triage
remaining packages and their actual app/server/tooling call paths next; no silent
suppression, audit-pass claim, wholesale major upgrade or broad override.

Delivery recovery: no open public PR or active/retryable build was found before
this batch. Latest Codemagic run was an OTA dry run, and Patch Production has no
releases on either platform. iOS 1.5.0 was already READY_FOR_SALE; do not duplicate
submission. Android exact versionCode/internal-track state still needs
an authenticated Play readback before any future native release decision.

Daily scheduler `bookoo` (BooKoo 일일 유지보수) remains ACTIVE, 09:00 Asia/Seoul,
returning to this public worktree/chat. This turn is its first daily cycle.
Do not duplicate or recursively start it. The host/app/project/auth and registered
DevLogs must be available. Manual entry is `$maintain`; the coordinator lock is
host-local, so a second host requires shared exclusion. No owner decision is
needed for the current bounded fix. The tracking PR's latest delivery comment
owns final head/merge/CI and post-deploy evidence, avoiding a recursive SHA-only
status commit.
