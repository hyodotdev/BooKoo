# BooKoo AI workflow audit

Audited on 2026-08-27 against the Martie repository's canonical `.agents`
skills and the current Codex skills/AGENTS conventions.

## Result

BooKoo already had project-specific commit, review, release, E2E, performance,
and version workflows. They are intentionally stricter than Martie's shared
versions because BooKoo must preserve indexed Convex pagination, integer minor
money units, typed Expo Router paths, static i18n keys, measured migration
evidence, and private media authorization.

Two reusable Martie ideas were adapted rather than copied:

- `$analyze` interprets aggregate store, IAPKit, approved Convex, sampled
  EAS Observe performance, and user-supplied dashboard/export evidence without
  introducing product analytics or exposing private ledger data.
- `$grow` runs one measurable experiment per round and uses
  `docs/growth/ledger.md` as its only cross-session memory.

## Skill matrix

| Martie skill | BooKoo decision | Reason |
| --- | --- | --- |
| `commit` | Keep BooKoo version | BooKoo gates pagination, money, i18n, Convex, and cpk-ui ownership |
| `e2e-test` | Keep BooKoo version | BooKoo requires two-client ledger, media, invite, and role flows |
| `loop-review` | Keep BooKoo version | Already adapted to BooKoo checks and device review |
| `release-update` | Keep BooKoo version | BooKoo has new-listing, backend-first, and store-evidence constraints |
| `review-pr` | Keep BooKoo version | Already enforces BooKoo data and pagination contracts |
| `review-self` | Keep BooKoo version | Already includes hard repository rules and `$perf-audit` |
| `update-version` | Keep BooKoo version | Package version is the source of truth; force-update is explicit |
| `analyze` | Adapt | Martie's quiz events and Firebase assumptions contradict BooKoo's privacy copy |
| `grow` | Adapt | Martie's quiz/store ids and growth levers are product-specific |
| `render-shorts` | Do not port | Revisit only when BooKoo has an approved content-production pipeline |
| `seed-articles` | Do not port | BooKoo has no article product surface |
| `seed-quizzes` | Do not port | Quiz content is unrelated to a shared ledger |

## Authoring rules

- Canonical skills live only in `.agents/skills/<name>/`.
- Run `bash .agents/scripts/sync-skills.sh` after canonical changes; generated
  pointers are never hand-edited.
- Long-lived product decisions go in `docs/` or `.notes/`, not only in a skill.
- A skill may explain how to perform an authorized task; it never grants cloud,
  store, deployment, billing, production-data, or destructive authority.
- Skills must preserve `.local/` privacy and aggregate growth evidence.
- Review and release skills must report checks that were not run or failed;
  they never convert missing evidence into PASS.

## Duplicate prevention and simplicity

[AGENTS.md §SSOT and KISS](../../AGENTS.md#ssot-and-kiss) is the shared rule for
implementation and every review. Record the canonical owners reused and any
justified duplication or added complexity in the existing review evidence.

## Screen-list and async-interaction checks

- Ordinary menus use one-line noun labels with an optional current value. Do not add a sentence
  explaining each row, duplicate Logout/support/global preferences across parent and child menus,
  or expose low-frequency administration before one clear Manage entry.
- A static choice such as currency, language, theme or auto-lock changes local selection on the
  press frame. Load fixed options synchronously; start optional async preparation when the route
  mounts. The press handler must not begin a fetch before showing selection. Only an explicit Save
  performs the mutation and navigation.
- For every unbounded FlashList, compare both `initialNumItems` and every `loadMore(count)` with the
  exact Convex query limit. Different queries on one screen may have different limits; never reuse
  one convenient count across them. Add a test that asserts the client counts whenever a query
  rejects out-of-range pagination.
- After changing a list query or page size, open the exact native route past its first page and
  assert that the app fallback is absent. A passing typecheck or mocked empty list does not prove
  that the deployed query accepts the requested count.

## Current known gap

The global user-level `analyze` skill is Martie-specific. Repository-local
BooKoo skill pointers therefore take precedence while working in this checkout.
If a future global skill becomes product-neutral, reconcile it with this matrix
rather than maintaining two competing metric contracts.

## Current cpk-ui version

BooKoo pins **`cpk-ui@0.8.1`** (npm `latest`), release commit
`1fca029f8273280ec5d1e4491908f27e08b0b45d`
([cpk-ui PR #28](https://github.com/crossplatformkorea/cpk-ui/pull/28)),
published by the trusted workflow
[41455669778](https://github.com/crossplatformkorea/cpk-ui/actions/runs/41455669778)
after a dry run
([41455236606](https://github.com/crossplatformkorea/cpk-ui/actions/runs/41455236606));
registry integrity
`sha512-PGy/ODwspp0B9xRDpMffDwyF+hJu7a1mnzQWJuPDQLx5L7ysEqQPRsjx5vZD98w00mI84iiTNhH4tq3NnHrZKg==`,
the same as `bun.lock`. 0.8.1 adds, from
[cpk-ui PR #27](https://github.com/crossplatformkorea/cpk-ui/pull/27):
- `LineChart` sizes its tooltip to the formatted value (full-width glyphs
  count wider) and caps it at the frame, so the category stats tooltip no
  longer clips long won amounts;
- `Calendar` day cells show the bare day number in ko/ja/zh. BooKoo's ledger
  calendar renders its own day cells, so this does not change it.
No cpk-ui patch remains.

0.8.0 is the stable 0.8 base, release commit
`aeeea4f83776d5b4afc72c91795b9af278b32256`
([cpk-ui PR #26](https://github.com/crossplatformkorea/cpk-ui/pull/26),
squash-merged). The owner asked for the open cpk-ui PRs to be resolved and
0.8.0 released through CI on 2026-11-02. The trusted publishing workflow
[41446518170](https://github.com/crossplatformkorea/cpk-ui/actions/runs/41446518170)
ran the release checks after a `dry_run=true` pass
([41446130833](https://github.com/crossplatformkorea/cpk-ui/actions/runs/41446130833))
and published with provenance under the `latest` tag; the registry integrity
is
`sha512-44lLMhQ5kRmng5xJ9dDxTogS+zLULwg0PUffT/Vl5+mpHFNxmAOJikTCEPwAZWF4jx26Y9MaG/h3ca2g1PgpCw==`,
the same as `bun.lock`.

**No cpk-ui patch remains.** 0.8.0 publishes, on top of beta.7, the output the
last overlay carried:
- `DonutChart` and `LineChart`
  ([cpk-ui PR #24](https://github.com/crossplatformkorea/cpk-ui/pull/24),
  formerly `feat/media-charts`);
- `SelectionFeedback`, Calendar `selectionAnimation` / `contentMaxSize` and the
  single-month weekday row, and RadioButton on `SelectionFeedback`
  ([cpk-ui PR #25](https://github.com/crossplatformkorea/cpk-ui/pull/25),
  formerly `feat/selection-feedback`).

The overlay's compiled files were byte-identical to those two branches before
review. Review fixes then changed what BooKoo runs:
- `LineChart` without `onSelect` is one image without point targets; with
  `onSelect` (the category stats chart) it is a group of point buttons whose
  touch areas reach halfway to their neighbours, and an all-zero series draws
  on the baseline instead of the top edge.
- `DonutChart` groups its centre content into the labelled image, so the
  stats total is read through `accessibilityLabel` (which already includes it).
- `SelectionFeedback` `reducedMotion={false}` no longer overrides the system
  Reduce Motion setting; side by side calendar months play a boundary date on
  its in-month copy.
- `Button` icon colours follow the flattened final text style
  (`StyleSheet.flatten`), so nested style arrays use their last override.

cpk-ui `react-native-svg` (>=15) is now a declared peer; BooKoo already
installs it.

Beta.7 (release commit `0514e01d0e5e89b5900ce510cc10698e5f81e7cb`,
[cpk-ui PR #23](https://github.com/crossplatformkorea/cpk-ui/pull/23)) added
`TimePicker`: hour and minute fields in a given locale's hour cycle,
separator, order and day period words (the Android entry editor's time edit,
found by the 2026-11-01 UI audit).

Beta.6 (release commit `453ba5c3535d57f7503ca11ccdb5879cb2b1878c`,
[cpk-ui PR #22](https://github.com/crossplatformkorea/cpk-ui/pull/22),
workflow
[41377710724](https://github.com/crossplatformkorea/cpk-ui/actions/runs/41377710724))
published, on top of beta.5:
- the AlertDialog Android keyboard avoidance (`padding` on every native
  platform), upstream commit `960c51257222d09767d63c990960a059cb827a4a`;
- the Typography iOS `lineBreakStrategyIOS: "hangul-word"` default, so Korean
  words stay whole, upstream commit `318def52a6ede7aeb5e62a790bfa481e5d7cb070`;
  both were found by the 2026-11-01 UI audit;
- the EditText native line box, upstream commit
  `7356cabb4af10fdcf22af50d70889a7afea8f81e`
  ([cpk-ui PR #20](https://github.com/crossplatformkorea/cpk-ui/pull/20));
- the PinchZoom rest-swipe hand-off to native paging (cpk-ui PR #21).

Beta.5 published bounded Android foreground ripple in Button, IconButton and
CustomPressable, transparent bare-icon backgrounds, the intrinsic single-line
button label (`0e5dee0`; its remaining tests landed as cpk-ui PR #17), stable
native loading parents (`e4df2dc`), and the controlled Accordion.

## Historical cpk-ui adoption evidence

The notes below retain the original September 6–9 gates and provenance.
References to beta.4 and Button/Accordion patches describe those historical
checkpoints; the 0.8.0 state above supersedes them.


Reusable media gestures, the generic line chart, and the SVG donut chart live
upstream in `crossplatformkorea/cpk-ui` commit `9a2c3bd` on
`feat/media-charts`. Its full `bun run test:all` (25 suites, 306 tests, 25/25
component coverage and 74 stories), `bun run build`, and web export passed
before BooKoo adoption.

BooKoo now pins published **`cpk-ui@0.8.0-beta.4`** from `fc467e9`
([PR #19](https://github.com/crossplatformkorea/cpk-ui/pull/19)). Trusted
publishing run `34275194246` passed; registry integrity, beta dist-tag and
release tag were verified. The temporary QA package was moved aside before
the registry install, and a frozen-lockfile install passes. The entire installed
package (including its retained compiled overlay) is byte-identical to the
tested final candidate. Beta.4 adds AlertDialog render slots/dark scrim and
FlashList-backed ReorderableList. Its patched JS-only Drax engine and MIT license
are bundled inside the published package; BooKoo must not add a second Drax
implementation or depend on an unshared local engine patch. The focused
publication/consumer evidence is in
`.notes/qa/loop-ui/2026-09-09-published-cpk.md`.

Previously, beta.3 came from `cd9ceab`
([PR #18](https://github.com/crossplatformkorea/cpk-ui/pull/18)). Trusted
publishing run `34046762288` passed; registry integrity and the release tag were
verified before installation. Beta.3 includes continuous `PageIndicator`, web
ARIA/native progress fixes, and EditText's non-grouping touch wrapper. Their
temporary output/export hunks are removed; never reapply them on this version.

The minimal `patches/cpk-ui+0.8.0-beta.4.patch` still carries compiled
`LineChart`, `PinchZoom`, `DonutChart`, the calendar weekday-row correction,
the single-line/native-parent Button follow-ups below, and matching chart exports. It applies
to the pristine beta.4 registry package and exactly reproduces the installed
package. The September 9 white-screen fix adds only the compiled Button parent
correction and its declaration map; the newly published dialog and
reorder components do not require additional consumer patches.
No local-path dependency is allowed. Remove each remaining hunk only when its
own upstream change is included in a published exact version.

Beta.2's controlled `AlertDialog` (`visible` / `onClose`), text-button padding/
underlay (`8px 16px`) and stable Button content parent (`collapsable: false`,
`dc0c67d`) remain part of the published package. They are not patched again.

September 6's follow-up Android check found that the stable wrapper alone did
not keep an intrinsic `Add entry` label on one painted line. The Button string
label now uses `numberOfLines={1}` in upstream commit `0e5dee0` on
`bugfix/solid-button-native-label` (pushed). Element-valued labels retain their
own layout. The temporary compiled Button hunk retains that change
while a release containing that separate commit remains outstanding. cpk-ui's
23-suite/304-test gate, build, Storybook build, live Light/Dark web stories,
physical iPad CTA navigation and the fresh Pixel 1.0.1 QA APK were checked.
Delete the hunk when its published exact release is adopted; do not mistake
the older beta.2 wrapper fix for this follow-up label fix.

September 9's physical Pixel regression additionally reproduced Fabric
`addViewAt: View already has a parent` during keyboard-open category Save.
Upstream commit `e4df2dc968288114b48197310060736fc0dce544`, pushed on
`bugfix/button-loading-native-parent`, sets `collapsable={false}` on the
ButtonContainer and loading slot as well. The published content parent alone
does not prevent opacity-driven stacking-context changes. cpk-ui's full
27-suite/340-test gate and package build pass. Native replay evidence and the
separate browser-policy blocker are recorded in
`.notes/qa/loop-ui/2026-09-09-white-screen.md`. Until a verified prerelease is
authorized at action time and published, the compiled-output overlay preserves
this pushed fix against exact registry beta.4; it is not a published beta.4
feature. Remove these hunks when adopting the published upstream fix.

The same September 9 user follow-up requests animated category ellipsis
actions. Pushed cpk-ui commits `3ab5b72` and `66ffadd` on `feat/controlled-accordion` add
controlled `expandedIndexes`/`onExpandedChange` and a complete `renderHeader`
slot to the existing public Accordion. Its single body uses Reanimated native
layout transitions, with reduced-motion and noninteractive collapsed state;
collapsed controls unmount while native exit animation completes, so hidden
actions do not remain in iOS accessibility. Native repeated open/close,
Edit/Back, and FAQ/Announcements reading replays pass on the iOS simulator.
invisible duplicate measurement controls are removed. Full upstream gates pass
(27 suites,342 tests,81 stories), and BooKoo's compiled Accordion overlay
reproduces that source pending remaining native/web verification and authorized release.
Pristine beta.4 plus the full patch is byte-identical to the installed package.
The expanded-state API is not part of published beta.4: remove these temporary
hunks when the containing exact prerelease is published and adopted.

PR18 was reviewed at `37c31dd`, with full 24-suite/312-test, type/lint/coverage,
package, Storybook and native/web gates. Pixel/iPhone native recordings show
continuous forward/reverse pill motion; strict iOS XCUITest verifies 100% at
the final page and actual input blur → border-focus → typing. This is not
spoken VoiceOver traversal or store acceptance. A Chromium held-finger
regression also passes: settled accessibility/reduced-motion state waits for
real `scrollend`, not a timeout. See the September7 checkpoint in
`.notes/qa/loop-ui/2026-09-06-android-release.md` for artifact-specific evidence.
Direct linking previously conflicted with Expo peers and existing overlays;
use the published exact package, not a link or a second source implementation.

## Expo Observe privacy patch

`expo-observe@57.0.26` currently imports `expo-app-metrics@57.0.23`, whose
package entry point installs an unhandled-JavaScript-error collector at import
time. The public configuration type in these exact releases has no supported
switch for that collector, so BooKoo applies
`patches/expo-app-metrics+57.0.23.patch` during `postinstall`.

The patch exists to preserve BooKoo's approved observability boundary: no
automatic JavaScript error payloads, free-form native exception messages, route
parameters, account/ledger/item identifiers, custom events, or global user
attributes. Sampled native crash diagnostics retain only numeric crash fields,
app version and symbolic code frames. Remove the patch as soon as a published
Expo Observe/App Metrics version exposes and honors equivalent official controls,
then pin that exact compatible version and re-run the privacy and native release
gates.

## Navigation intent

Ordinary forward movement uses `router.navigate`, not `push`. This includes
settings, ledger details, entry edit/create, category sheets, media viewers,
authentication entry points and notification destinations. Keep typed entity
params intact. A new instance of the same route is an explicit product need,
not the default; any future `push`/`<Link push>` exception needs an inline reason
and a Back-stack regression. No current forward route requires that exception.
Existing `back`/`dismissTo`/`replace` behavior remains intentional for completed
forms, modals and auth boundaries. Do not equate different aliases or nested
stacks, or claim global deduplication from a call-site substitution alone.
Validate rapid taps, A→B→A, changed entity params and a single Back interaction.
App and ledger `Stack.Screen` declarations use `dangerouslySingular`: the
installed router derives identity from the route and dynamic path IDs. This
reuses an earlier matching screen even after visiting another screen, while
different entry or ledger IDs remain distinct. Query params are not included
in that default identity; an independent draft/entity passed through a query
needs an explicit identity and a retained-state test, not a blanket singleton.
The integration tests use the real Expo Router stack and exercise repeated
navigation, A→B→A, separate entry IDs, and sheet dismissal with an intact draft.
For read-only photo and category-statistics routes, key the domain content by
its selection params so a reused route opens the requested photo/comment/month.
Changed and removed query params plus one Back are covered by the real-router
regressions in `test/app/navigationParams.test.tsx`. Do not apply that remount
policy to editable forms: preserving drafts is a separate contract.
Authenticated notification returns to home target `/(app)/(tabs)/(root)`
directly. Going through `/` and then `replace` can duplicate an already-mounted
tabs shell even with singular screens; the real-handler regression covers it.
Reference: [Expo Router navigation](https://docs.expo.dev/router/basics/navigation/).

Device tests must resolve the current native hierarchy before declaring login
failure. A retired header test ID is a harness defect, not a reason to clear
sessions, repeat OTP or reseed fixtures. After a scroll timeout, inspect the
actual reached item and adjust only that bounded scenario; resumed runs are
not same-distance performance benchmarks.

## Expo Router Android cold-start patch

`expo-router@57.0.25` can resolve Android's asynchronous initial deep link
before its `NavigationContainer` commits. The upstream race is tracked in
Expo issue `#49378`; React reports it as a state update on a component that has
not mounted yet, with `ContextNavigator -> ExpoRoot` as the owner stack.

`patches/expo-router+57.0.29.patch` queues only that initial unhandled-link
callback until the container's first effect. It also retains BooKoo's square
native drawer edge. Remove the callback guard once Expo ships an equivalent
fix, then rerun repeated cold deep-link launches on Android before deleting the
patch.

## Expo ImagePicker iOS 27.1 crash backport

Actual Duo receipt selection on iOS 27.1 raises `NSInvalidArgumentException`
inside `PHLivePhoto.readableTypeIdentifiersForItemProvider`, before OCR runs.
Expo's upstream fix is PR50435, commit
`3671bf44f7c5de8c60a5bd00295dbfd896107b0a`. It ships in SDK58's ImagePicker,
but the latest published SDK57 package, `57.0.20`, still has the crash.

`patches/expo-image-picker+57.0.20.patch` backports that exact native guard:
check whether live photos were requested first, and match `UTType.livePhoto`
without Foundation's crashing `canLoadObject` call. The dependency is pinned
to the patched version. Keep ordinary photos and receipt scanning on the same
existing picker. This requires a new locally built iOS binary; JavaScript OTA
cannot repair the crashing native implementation. Remove the patch after a
compatible published version includes the fix, then replay photo selection,
OCR review/cancel/apply, and Duo transitions on the new artifact.

Primary source: https://github.com/expo/expo/pull/50435.

## Production OTA policy

The September 13 release instruction authorizes finishing the reviewed changes,
submission and production OTA without another owner-confirmation pause. Play
managed publishing is disabled: accepted changes publish automatically after
Google approval. App Store Connect build 22 is already Waiting for Review with
Automatically release this version selected; `store.config.js` preserves
`automaticRelease: true`. A future native release still needs actual store
submission; automatic publication does not submit an unsubmitted build.

BooKoo ships over-the-air updates through Codemagic Patch (hosted for the
OpenIAP team at `https://ota.codemagicpatch.dev`, apps `BooKoo-iOS` and
`BooKoo-Android`). Store builds read the `Production` deployment and QA builds
read `Staging`; the keys live in `shared/otaDeployments.json`. A release targets
the binary's marketing version and Patch checks the native fingerprint. The
first Patch binary is 1.5.0; store binaries up to 1.4.0 still run expo-updates
and only receive EAS Update, so `bun ota:release` reaches devices only after
`package.json` and the store builds carry 1.5.0.

Production OTA publishing is manual and is allowed only for a JavaScript/assets-
compatible change from a clean checkout whose `HEAD` exactly matches
`origin/main` and whose exact push CI run succeeded. Run one of the guarded
package scripts with both an explicit compatibility acknowledgement and release
message:

```sh
OTA_CONFIRM_COMPATIBLE=1 \
OTA_MESSAGE="<what changed>" \
bun ota:release
```

Add `OTA_DRY_RUN=1` to verify the branch, clean-tree, exact-main and CI
gates without bundling or publishing an update.

When GitHub Actions cannot run (for example its included minutes are used up),
add `OTA_VERIFY=local`. The script then runs, on that exact clean commit,
the commands of CI's `check` job (`bun lint:all`, `bun typecheck`, `bun run
test`) in place of the CI lookup, and every other gate still applies. The Convex
budget suite and the history secret scan stay CI-only, so the mode is only for
the JavaScript/assets-only updates the compatibility acknowledgement already
requires, and a change under `convex/` must wait for a real CI run.

Use `ota:release:ios` or `ota:release:android` only when the compatible change
is intentionally platform-specific. The command bundles with the `production`
EAS environment through `eas env:exec` and publishes to the Patch `Production`
deployment. It never creates a cloud build.

Do not publish an OTA automatically on every merge. Any native dependency,
config plugin, permission, entitlement, manifest, Pod/Gradle input, or native
asset change requires new local-only IPA/AAB builds. The EAS `preview` profile
remains an optional local internal-test binary profile; it is unrelated to the
deleted Convex cloud preview deployments.

## Native Paywall release gate

Native billing uses OpenIAP (`expo-iap`) with Apple/Google products from
`shared/entitlements.ts`. IAPKit verifies proofs and binds the authenticated
Convex user; the mobile app never contains a billing API key. Signed lifecycle
notifications and receipt-matched verification own provenance and current
access; tokenless entitlements refresh only receipt-verified provider records; the indexed
projection retains access across multiple live purchases. Follow
`.notes/design/iapkit-entitlements.md` and `docs/release/PURCHASE_E2E.md` for
native rebuild, store ingress, pending payments, restore and management gates.
The former remote Paywall and Customer Center are removed.

For positive Google Play license-test purchase/restore, build locally with
`bun eas:purchase-test:android` and submit that exact AAB to the existing internal
track. This store-distributed preview profile uses the development backend and
test ad units. Production correctly rejects Google sandbox entitlements. Build
the final production AAB afterward; its next remote version code lets testers
update through Play while retaining data. Never promote the test bundle to
production.

## Native-install and device matrix

Use `$loop-ui` for page-by-page screenshot inspection and local UI refinement. Its canonical definition is
`.agents/skills/loop-ui/SKILL.md`; it reuses E2E setup and ends with an inspected storyboard refresh. Keep
capture provenance separate from PASS/FAIL and never treat stale screenshots as current candidate evidence.

A native-install E2E starts with a stopped app. Launch the newly installed binary cold, wait for the React
context and router, then open test deep links. This prevents a pre-initialization Android intent from being
misreported as a UI regression.

Every UI candidate uses the same source and native dependency baseline on:

- one current iPhone viewport;
- one iPad in portrait and landscape;
- one physical Android phone.

Check light and dark, safe areas, keyboard avoidance, sticky lists past page one, inline picker Back behavior,
empty and error states, and the native Paywall. Physical store purchase and restore remain separate signed-store
gates. Simulator rendering or a sideloaded Android debug build cannot satisfy commerce verification.

Distinguish app startup from test-driver startup. If Maestro emits no flow
steps, inspect its current process and Android instrumentation log once. A
driver process that fails to attach is not an app navigation failure. Do not
repeat that unchanged startup or install another driver over a live controller.
After it exits, basic native touches and full-resolution captures can verify
layout independently; label those results separately from automated-flow and
startup-performance acceptance. Wait for actual orientation/destination pixels
before accepting a capture: the first image after a rotation or tab tap can
still show the old screen. Restore and verify device settings at batch end.

## September 30 selection-feedback overlay

BooKoo keeps the exact published `cpk-ui@0.8.0-beta.5` dependency and existing
compiled overlays. Generic selection motion is owned upstream at
[`b76d5cc342fc90d3878c00a5d421387d959200c5`](https://github.com/crossplatformkorea/cpk-ui/commit/b76d5cc342fc90d3878c00a5d421387d959200c5),
shared on `feat/selection-feedback`. Its typed `SelectionFeedback` wrapper
confirms a changed selection without moving the outer touch target. It stays
still on mount, unchanged values, deselection and reduced motion; rapid changes
cancel the previous pulse. Colocated tests and light/dark Storybook stories
belong to cpk-ui.

The temporary patch adds only its compiled JavaScript, declaration, declaration
map and public exports. No local dependency or source fork is committed. The
full patch applies with `patch-package --error-on-fail` to a fresh registry
tarball, and that patched package matches every installed file byte for byte.
Remove this selection overlay when adopting the published upstream version.
Publication remains a separate owner-authorized action; this task publishes
neither npm nor an app release. Native, web and package verification is recorded
in `.notes/qa/loop-ui/2026-09-30-detail-ui-motion.md`.

### October 1 calendar and radio motion overlay

The owner subsequently authorized production OTA delivery. The same exact
beta.5 dependency now carries compiled output from shared upstream
[`4283d99`](https://github.com/crossplatformkorea/cpk-ui/commit/4283d99)
on `feat/selection-feedback`: deliberate calendar selections and radio marks
use the shared pop rhythm, and measured calendar columns reserve the 1.12 peak
for both default and domain day renderers. Repeated choices, initial rendering,
programmatic calendar refreshes and native reduced motion remain quiet.

This extends the existing temporary overlay with only compiled JavaScript,
declarations and declaration maps; no package manifest, local link or upstream
source is installed into the consumer. The complete overlay SHA256 is
`2fa51e75b489c0c22159583b63ab7e87974c78a75fd301dc29fca81eba280a6c`.
Its pristine registry replay and release delivery evidence are recorded in
`.notes/qa/ota-release-2026-10-01.md`. Remove the overlay when these changes are
available in a published exact cpk-ui version. This OTA does not publish npm.

The same compiled overlay includes the visible-page correction from shared
upstream [`d0b7513`](https://github.com/crossplatformkorea/cpk-ui/commit/d0b7513131ef90bde08340ac55ba63c4a71bd33e). Preloaded neighbour grids may
repeat boundary dates, but cannot consume deliberate selection feedback.
The full 26-file overlay replays against the exact beta.5 registry tarball;
all 381 package files match the native-tested installed package byte for byte.
No public API, dependency, native configuration or runtime version changed.

### October 22 native photo paging overlay

Physical Galaxy QA reproduced a1x photo viewer that consumed horizontal swipes
without changing pages. Canonical cpk-ui source is shared at
[`97cedd1f48220c75acb8968f1bc5265824f7f7a9`](https://github.com/crossplatformkorea/cpk-ui/commit/97cedd1f48220c75acb8968f1bc5265824f7f7a9)
([merged PR #21](https://github.com/crossplatformkorea/cpk-ui/pull/21)). It reuses the
already shared media-gesture implementation and makes pan fail before
activation at minimum zoom, preserving native paging and two-finger pinch.
BooKoo extends only the existing compiled PinchZoom JavaScript patch; its
published exact dependency and public API remain unchanged. No source fork,
link or local path is committed, and no npm publish is performed.

Upstream `test:all` passes29 suites/350 tests, build and final typecheck pass.
Two unchanged-content self-review rounds are separated by at least five
minutes. Galaxy paging/zoom/pan/reset and iPad paging/native pinch/pan/reset
have inspected physical captures. Bounded three-page web paging is inspected
in light/dark. The full overlay applies to SHA512-verified registry beta.5;
all381 replayed package files equal the installed native-tested package.
Remove this temporary section when adopting a published version containing
the shared fix. Final store-candidate acceptance remains a separate gate.

## Shared-checkout local native builds

Use the local-only build rule in [AGENTS.md](../../AGENTS.md#native-build-execution).
Serialize EAS archive phases when iOS and Android start from the same checkout:
EAS temporarily writes Git config, so simultaneous archives can fail on
`.git/config.lock`. Once each archive is complete, compilation in the independent
local build copies can overlap. A failed archive is not a product compile
failure or a submitted artifact. Preserve source, inspect the retry, and submit
the exact successful path. The1.1.0 evidence records the failed38 attempt and
successful39 retry in [.notes/qa](../../.notes/qa/2026-10-09-apple-gallery-1-1-0.md).

### Metadata-only store versions and native compatibility

Patch targets each OTA at the marketing version in package.json and compares
the native fingerprint, so an incompatible binary never receives it. Whenever
native dependencies, plugins, permissions or the native contract change, ship
both new iOS and Android binaries before any OTA that depends on them.
No OTA accompanies this metadata task.

The canonical Apple gallery selector is sourceVersion in
store-assets/apple-gallery-config.json. It selects the retained1.1.0 artwork
and provenance independently of package.json/ASC_APP_VERSION, which select the
remote version. The uploader validates all45 manifests,360 files and native
capture hashes before any mutation. Reusing screenshots never copies the gallery
or points the remote version back at1.1.0.

## LevelPlay mediation-only native integration

`unity-levelplay-mediation@9.4.0` pins native LevelPlay 9.7.0. Its default iOS
podspec also pulls Ad Quality, which auto-initializes. The exact-version
patch selects the vendor's `IronSourceSDK/Ads` subspec instead.
`plugins/withLevelPlay.js` excludes Android `adquality-sdk` across dependency
paths. This implements [Unity's native exclusion instructions](https://docs.unity.com/en-us/grow/levelplay/sdk/unity/exclude-ad-quality-sdk)
without adding advertising analytics. Verify the resolved Pods/Gradle graph
and artifacts after SDK upgrades; remove the podspec overlay when upstream
exposes a mediation-only dependency choice.
