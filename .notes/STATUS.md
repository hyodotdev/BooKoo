# BooKoo operations status

## Active batch

- Mode: maintenance. Owner goal: autonomous, sequential maintenance and delivery;
  product work follows the owner's latest direction.
- Standing authority: [AGENTS.md](../AGENTS.md#autonomous-operation), granted
  2026-11-21 Asia/Seoul. No price/payment policy, forced-update floor, new paid
  contract, invented privacy declaration or irreversible production-data change.
- IMPLEMENTED: `chore/autonomous-maintenance`, base
  `0341b45cdafeb368abb03d88aa5e21d720f73076` in
  [hyodotdev/BooKoo](https://github.com/hyodotdev/BooKoo).
  The pre-existing local ops checkout has a different history and is preserved.
- Scope/order: acquire coordinator lock; restore remote/release state; add
  `$maintain` orchestration and test mutual exclusion; correct appConfig/date/
  merge documentation; sync skills; run source checks and two clean self-reviews;
  PR/CI/integration; connect one daily run at 09:00 Asia/Seoul.
- Acceptance: discoverable canonical skill, tested crash-safe exclusion across
  worktrees, public resumable status, preserved validation/native gates, accurate
  source contracts, exact-head CI and self-review, no unnecessary client release.
- Delivery: agent/tooling/docs only. No runtime dependency migration or native
  change; device/performance audits N/A for this diff. No OTA/store tag.
- Integration/review record: [tracking PR](https://github.com/hyodotdev/BooKoo/pulls?q=is%3Apr+head%3Achore%2Fautonomous-maintenance).
  Its current head, merge SHA, check runs and final delivery comment are the
  authoritative completion record. Resume this batch if unmerged; after MERGED
  plus successful exact-main CI, select the next cycle below. Do not create a
  recursive SHA-only completion commit.

## Verification and resume

- PASS baseline: no open public PR; main protection/rulesets absent on inspection.
  Root strict nonforce fast-forward policy still applies.
- PASS local: frozen copyfile install; lint:all (all i18n, dependency owner,
  tracked-secret, schema, public/store/readiness checks); typecheck; coverage
  227 suites / 1,751 tests passed, 15 existing skips; lock behavioral tests 4/4;
  canonical validator and idempotent sync; actual Codex app-server skills/list
  discovered enabled maintain with no discovery errors. Initial validator's
  missing PyYAML was resolved using an isolated uv dependency, not repo changes.
- Final exact-head evidence: use the tracking PR checks and delivery comment for
  full-history secret scan, separate Convex 100k budget marker, two clean full
  self-reviews separated by >=300s and exact-main production CI deployment.
  These are mandatory integration gates, never inferred from general Jest.
- N/A device/purchase/performance audit: no app/src/native/runtime/Convex change.
  The required anonymous budget test still runs in PR CI.
- SSOT/KISS: reuse AGENTS authority, existing status/decisions/design records,
  canonical sibling skills, appConfig and shared/date owners. New executable
  logic is only a small stdlib OS-lock holder with behavioral tests. Generated
  skill pointers derive from the canonical file and metadata.
- Resume: finish this branch before selecting another bundle. No automatic
  dependency upgrades during this tooling batch. Local QA must use an isolated
  anonymous deployment, never inherited production credentials.
- Product decisions needed: none for this batch.

## Last observed delivery (verify before client release)

| Surface | Observed state | Evidence / next read |
| --- | --- | --- |
| Backend | PASS: production deployed source `0341b45c` | [main CI](https://github.com/hyodotdev/BooKoo/actions/runs/44466753587), deploy job succeeded |
| Source | package 1.5.0; Expo 57 / RN 0.86.3 / React 19.2.3 / Convex 1.45.0 / expo-iap 6.4.2 | package.json + bun.lock; no version changes in this batch |
| Release dispatch | PASS: last run was `ota-dry`, not a store or public OTA dispatch; current remote has no tags | [run](https://github.com/hyodotdev/BooKoo/actions/runs/44467232727), step log inspected; do not replay removed tags |
| iOS | PASS ASC readback: 1.5.0 READY_FOR_SALE / AFTER_APPROVAL, selected build 60 VALID, not expired | App 6805969489 / dev.hyo.bookoo, read 2026-11-21 KST; [public Apple lookup](https://itunes.apple.com/lookup?id=6805969489&country=kr) independently confirms 1.5.0 (release 2026-11-18T18:25:16Z) |
| Android | PASS public listing advertises 1.5.0; exact build/versionCode and internal-track state PENDING authenticated Play readback | [public Play](https://play.google.com/store/apps/details?id=dev.hyo.bookoo&hl=en&gl=US); no new upload or rollout performed |
| OTA | PENDING Patch release/deployment readback | Patch first binary 1.5.0; <=1.4.0 uses former expo-updates; do not target an unverified public binary |

## Next cycle

Recover any active release first. The most recent observed dispatch was an
OTA dry run, and iOS 1.5.0 is already READY_FOR_SALE: do not duplicate that
submission. Verify actual remaining platform state and candidate gates before
submitting anything.
If only external prerequisites remain, preserve them and select one independent,
small maintenance bundle. Keep proposed new features here with evidence; none yet.
Daily scheduler: local thread heartbeat `bookoo`, named BooKoo 일일 유지보수,
09:00 Asia/Seoul. Created paused; activate only after this batch's final gates
and exact-main CI pass. The live app automation (and final PR delivery comment)
owns current ACTIVE/PAUSED state; do not duplicate it. All three historical
BooKoo release monitors were PAUSED and retain their original purpose.
The host must be awake with Codex running, project/auth access and registered
DevLogs available for bulk runs. Manual entry is `$maintain` in this public
checkout. The lock is host-local; no second host without shared exclusion.

No owner decision is needed for this tooling batch. Next actions: authenticate
remaining Play/Patch release readbacks using existing available access, then
choose one evidenced maintenance defect. Do not republish iOS 1.5.0 or replay the
removed dry-run tag merely to recreate history.
