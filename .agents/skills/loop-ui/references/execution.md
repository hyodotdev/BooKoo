# Shared UI/E2E execution protocol

One audit, one coverage matrix, one owner per device. Visual inspection and
functional E2E share navigation and captures; neither starts another whole-app
run through the other skill.

## Select work without losing coverage

- **Resume:** default for an unfinished audit. Read the STATUS current summary,
  active task row and linked current run; inspect historical entries only when
  needed to resolve a conflict. Read mandatory instructions fully once; reuse
  them within the turn and reload changed files. Do not repeatedly dump the
  append-only history. Latest user corrections always reopen their gates.
- **Focused:** reproduce a defect, then verify its fix and affected shared
  consumers. Keep the remaining full matrix pending, not implicitly passed.
- **Final:** after the final material fix, walk the declared release scope on
  the exact native/JS candidate and backend/configuration. This is full
  acceptance, not an extra full sweep after every individual fix.

Write the mode and next runnable batch before executing. Group adjacent pages
by parent navigation and device/theme. Reuse a capture for all applicable
assertions; do not recapture an unchanged state because another skill needs it.

## Preflight once per device and candidate

1. Confirm connection, unlock/automation, installed bundle/build, native
   dependency identity, Metro/update source and backend environment. Version
   `1.0.0 (1)` alone cannot distinguish binaries with different native modules.
2. Inspect settled launch and bounded app errors. Wait for any recognized
   terminal state: authenticated shell, onboarding/sign-in, or app error.
   Classify a redbox, missing module, sign-in prerequisite or automation denial
   before downstream tests.
   Never wait for every route to time out or capture one error as every page.
3. Probe only prerequisites of the batch. Commerce requires valid store
   credentials/catalog and confirmed test identity; ordinary UI does not.
4. Prefer requested physical devices. Simulator Maestro support does not prove
   physical iOS support: validate the adapter once; use an available signed
   XCUITest harness when appropriate. Do not repeat failed adapter discovery
   for each route or silently substitute another device.

After native changes, rebuild **locally**, install over the existing app without
uninstalling, cold-launch once and repeat preflight. Metro cannot supply a missing
native module. Reuse `test-without-building` when the harness/build inputs are
unchanged; harness and app are different binaries. For XCUITest default to
`-collect-test-diagnostics never`: app screenshots/hierarchy and bounded app
logs suffice for UI failures without broad device sysdiagnostics. Keep results
private; never promote a result bundle wholesale.

## Evidence identity and invalidation

Record source SHA plus relevant tracked/untracked content fingerprint,
flow/harness fingerprint, native artifact/install identity, backend/config
identity, device/OS, locale/theme/orientation/font scale and capture time.
Paywall configuration also needs its draft/published revision.

- Retain unchanged evidence for **resume planning**, with original identity and
  time. Never rename it fresh or promote it to another binary.
- Source changes invalidate their scenarios and affected shared consumers.
  Native, auth/provider, theme/navigation or unknown-scope changes require
  broader revalidation. Explain the dependency decision; uncertainty expands
  coverage, not a silent cache hit.
- Docs-only edits do not require rebuilding/rerunning unchanged UI. Changed
  tests require that test's replay. Backend rules, store plans and Paywall
  revisions invalidate their service gates even if the Git SHA is unchanged.
- Version strings, a green command, a contact sheet or filename are not cache
  keys. Final store-artifact acceptance remains fresh.

## Batches, retries and checkpoints

Use diagnosable batches, usually one journey or 3–5 adjacent screens. Separate
devices may run concurrently with independent session/data ownership. Never
issue two controllers to one device or race shared-account mutations. Do useful
independent work while builds run.

Use bounded destination/selected-state assertions, not fixed sleeps or unbounded
animation-idle waits. Inspect the first failure before restarting. Classify
**product defect**, **test defect**, **build/environment mismatch**, or
**external prerequisite**. A retry must name changed evidence or cause. Never
loop a denied operation, missing credential or unchanged failing Save. After
two unsuccessful fixes reassess; do not restart the whole suite.

If command timings show a native tap spending seconds waiting after its visible
state changed, bound that tap's settling and assert the resulting selected state
or CTA. Do not apply a global short timeout. Before screenshots, assert the
radio's checked state; a tap can finish on a pressed transitional frame. Compare
the same command/scenario before and after, not unrelated suite lengths.

For native overlays, wait for an actionable control on the presented surface
(for example, the Paywall's hittable Restore button). The covered React screen
can remain in the accessibility tree; requiring its loader to disappear caused
a false timeout despite a usable Paywall. Inspect the native hierarchy before
changing app code or replaying navigation. A clipped rotated app capture is
likewise not UI evidence: compare with a screen-level capture and actual frame
geometry, rather than repeating the same capture method.

Readiness is not acceptance. A Restore action can also exist on the app's
unavailable-catalog fallback. Assert the published Paywall's distinctive
headline and packages after readiness, and classify the fallback as a store
prerequisite failure, never as native Paywall success. After publication,
record cache behavior: one data-preserving cold restart may verify a fresh
Offering; do not require reinstall/login or repeatedly reopen stale content.

Checkpoint after each batch:

| Gate | Result / evidence identity | Failure class / cause | Next action or unlock condition |
| --- | --- | --- | --- |

Record duration, newly inspected gates, reopened gates, and repeat gates with
their reason. Optimize measured setup/retry costs; shorter instructions alone
do not prove speedup. Do not rerun passed basics to fill time while commerce is
blocked: take the next independent pending gate. Store/credential work stays
in a separate queue and must not interrupt a device modal/test sequence.

Refresh the storyboard at a coherent checkpoint/final pass from inspected
allowlisted captures, retaining historical provenance. Count unique
page-state-device gates, not screenshots or taps.
