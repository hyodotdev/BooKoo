# E2E UX Test (connected devices and simulators)

End-to-end UX validation for BooKoo's ledger flows. Each scenario is
send input → wait → screenshot → read the screenshot → mark PASS/FAIL with
evidence.

**Use when**: verifying that a change (especially anything touching sign-in,
ledger membership, entry create/edit, the timeline list, the calendar, or the
statistics screen) has not broken the core loop.

**Don't use for**: pure backend refactors with no user-visible surface, docs, or
agent tooling. Say so explicitly instead of running a hollow pass.

---

## Prerequisites

- A dev build installed on the target, or build it: `bun ios` / `bun android`.
- iOS Simulator builds still need ad-hoc signing and the app's keychain entitlements.
  Do not set `CODE_SIGNING_ALLOWED=NO`: SecureStore and notification registration
  fail even if Xcode reports a successful build. Preserve app data and cold-launch
  the correctly signed replacement before evaluating session/UI behavior.
- Normal QA bundle/package: `dev.hyo.bookoo.qa` from `shared/application.json`.
- Resolve the installed Android launchable activity rather than assuming the
  application id equals its Java/Kotlin namespace.
- QA scheme: `bookoo-qa://`. Public invite App/Universal Links are an explicit
  store-acceptance exception: use the store binary and an owner-approved excluded
  account. Normal QA must not claim the production host.
- A reachable Convex deployment. `bun dev:convex` in a separate shell for dev; the
  app cannot render a ledger without one.
- Two synthetic accounts supplied through `BOOKOO_E2E_ACCOUNT_A` and
  `BOOKOO_E2E_ACCOUNT_B`. Never write their addresses into screenshots or the
  report. On an exact `ENVIRONMENT=development` deployment every normalized
  email uses the fixed eight-digit QA code `68686868` and delivery is skipped.
  Production never inherits this universal development code. Convex Auth
  indexes verification-code hashes globally, so request and verify each
  synthetic account before requesting the next account's fixed code: a newer
  shared-code request intentionally invalidates the older outstanding one.
- Read `.notes/qa/USER-CORRECTIONS.md` before the run. Its active rows are part
  of this gate even when an older screenshot gallery already exists.
- Treat every new user correction as an immediate gate update: reproduce it as
  FAIL when possible, change it to PENDING after the fix, and promote it to
  PASS only after the exact rebuilt artifact has focused automation, a read
  full-resolution capture and a clean platform log. Never wait until the end of
  the run to reconstruct this from memory.

## Reasonable assumptions

The shared protocol in `../../loop-ui/references/execution.md` owns selection,
preflight, batching and evidence reuse. Setup commands are references for
missing prerequisites, not a script to replay on every invocation. Prefer the
explicitly requested connected devices; do not allocate substitutes silently.

- Inventory `adb devices -l` and `xcrun devicectl list devices` first. Select
  the user's physical targets explicitly; do not assume `emulator-5554`.
- If a booted iOS simulator already exists, reuse it (`xcrun simctl list devices booted`).
- Do not create a second iOS simulator for invite or account-isolation tests.
  Reuse one existing simulator and exercise `A -> logout -> B -> logout -> A`.
  This is both the intended session-replacement gate and the storage-safe setup.
- If Metro is missing, start it with `bun start` and use a bounded readiness
  check. Keep its process handle and log path for this run.
- Preserve app data. A fresh-install scenario requires an explicitly approved
  disposable target, not a reset of the user's connected phone or tablet.
- Dev-build warning toasts can cover buttons. Dismiss them before tapping.

---

## Setup

```bash
# Read-only inventory; choose actual IDs from the output.
$ADB devices -l
xcrun devicectl list devices
xcrun simctl list devices booted
curl -fsS http://localhost:8081/status
```

For an Android debug target, run `adb -s <selected-id> reverse tcp:8081
tcp:8081` only when needed. Boot an existing simulator only for a required
unavailable target; do not start an emulator solely because one is absent when
the requested Pixel is already connected. Build and verify native compatibility
before starting the route batch.

### Sign in on the simulator without a remote backend

The development code works on the cloud dev deployment, but an agent does not send credentials to a remote
deployment. To sign in on the iOS simulator without doing so, run a Convex backend on 127.0.0.1 and point the
app at it. Every step below is local.

1. Start a cached `convex-local-backend` binary (`~/.cache/convex/binaries/*/`) on 127.0.0.1:3210 and :3211
   with `--disable-beacon`. Do not use `CONVEX_AGENT_MODE=anonymous convex dev` for this: it downloads the
   newest backend binary.
2. From a git worktree, never the main checkout (`convex dev` writes `.env.local`), push the functions with
   `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` (`convex-local-backend keygen admin-key`).
   Then `convex env set` `ENVIRONMENT=development`, `SITE_URL` and a throwaway RS256 `JWT_PRIVATE_KEY` and
   `JWKS`.
3. In the same worktree, give `.env.local` the two local `EXPO_PUBLIC_CONVEX_*` URLs and start Metro on
   another port. Expo's development env lets `.env.local` override the shell, so a shell override is
   ignored: the file itself must say 127.0.0.1.
4. Launch the Debug app with `-RCT_jsLocation 127.0.0.1:<port>`. Add `-RCT_enableDev NO
   -RCT_enableMinification YES` for release-like timing. Before typing anything, check that
   `lsof -nP -iTCP -sTCP:ESTABLISHED | grep '^BooKoo'` shows 127.0.0.1 and no cloud host.
5. The simulator's HID typing turns `@` into `2`. Put the address on the pasteboard with `xcrun simctl
   pbcopy`, tap the empty field once, and tap Paste.
6. Maestro drives the same flow without the control tool's per-device grant: `maestro --device <udid> test
   <flow>.yaml`, with `tapOn: {id: auth-email-input}`, `inputText` for the address (no pasteboard needed)
   and the fixed development code. Its logs land in `~/.maestro/tests/`; delete them afterwards.
7. Metro prints the app's `console.log` as `LOG` lines, the quickest way to read stage and route changes. A
   fresh account is a reinstall: `xcrun simctl uninstall`, `keychain <udid> reset`, then `install` from a
   saved copy of the .app. `simctl io recordVideo` writes a variable frame rate (about 26 fps), so extract
   with `-vf fps=30` when timing matters, and delete the video once the frames are read.

### Fresh state

Use a separate approved disposable install for fresh-state gates. Resolve the
exact device ID and artifact before any authorized reset, reinstall the app
before launching it, and wait for a positive onboarding/sign-in state. Do not
uninstall then try to launch the absent app. A cold process launch preserves
data and is a different scenario; it needs no uninstall, `pm clear` or fixed
twelve-second delay.

Preflight recognizes `tutorial-next`, configured sign-in controls, authenticated
shell and app errors as distinct settled states. An onboarding/sign-in state
blocks authenticated scenarios until the approved synthetic session is ready;
it is not a splash hang, a native failure or a reason to repeat every route.

### Screenshots

```bash
# Use the selected target and a private, run-specific path.
$ADB -s <selected-id> exec-out screencap -p > <private-capture-path>.png
xcrun simctl io <selected-simulator-id> screenshot <private-capture-path>.png
```

Physical iOS uses the validated signed harness, not `simctl`. Do not capture
system photo libraries, private account details or actual location unnecessarily.

### Logs

```bash
# Android: use the batch start time, then inspect only matching app errors.
$ADB -s <selected-id> shell 'logcat -d -t "<MM-DD HH:MM:SS.mmm>" -s AndroidRuntime:E ReactNativeJS:E' | rg -i 'fatal|exception|error|convex|addViewAt|parent'
```

On iOS collect bounded process-specific logs or the focused test failure,
not an unowned background log stream. Record the actual filter/time window;
no matches means only that filter was clear, not that the entire app is error-free.

---

## Scenarios

Verify every route path against `app/` before deep-linking. `typedRoutes` is on,
so a path the router does not export is a bug in this document, not in the app.

### 1. Cold start → sign-in

On an approved fresh install, inspect onboarding and then navigate to sign-in.
Expect the sign-in screen with every provider
that `app.config.ts` actually mounted — Kakao and Google appear only when their
env keys are configured, so a missing button is a PASS when the key is absent.
Say which providers were configured in the report.

**MUST NOT**: crash, hang on the splash screen past 15 s, or land on a ledger
screen without an authenticated session.

### 2. Email OTP sign-in + unique username

Enter synthetic account A, request the code, submit `68686868` on the confirmed
development deployment. Complete that verification before requesting the same
fixed code for account B.
Expect the username step to appear for a first-time account and to reject a
handle that is already taken. Expect it to be non-skippable.

Continue through every mutation-backed transition separately: Handle →
Profile, Profile → Ledger setup, and Ledger setup → authenticated timeline.
For each tap, capture the loading state, wait for the destination, read the
full-resolution screenshot, and run the Android Fabric/ReactHost log filter.
Async buttons must retain a treated control and spinner without remounting or
flattening their native child tree.

**MUST NOT**: reach the ledger list with an empty username, show a blank root
view, or log `View already has a parent` / `addViewAt` during a successful
transition.

### 2a. Account isolation and session replacement

Create or reuse two synthetic users. Account A owns ledger A and invites B;
account B accepts and also owns a private ledger B. Add visibly different
synthetic entries to both ledgers. Run the complete
`A -> logout -> B -> accept invite -> logout -> A` sequence on one existing
simulator. Do not create another simulator for this scenario. Cross-device live
delivery belongs to the separate interaction gates and must reuse already
available physical devices or simulators instead of allocating a new one.

Expect: each session shows only its authorized ledgers, the invite appears once,
live shared edits/comments cross devices, and private ledger content never
crosses accounts. The active ledger after each sign-in belongs to that account.

**MUST NOT**: reuse an item, ledger, member, comment, profile, IAPKit
identity or cached detail from the previous session.

### 2b. Foreign and stale route rejection

While B is signed in, open A's ledger and LedgerItem URLs first from an existing
screen with back history, then from a cold/no-history launch. Also pair a valid
item id with the wrong ledger id:

```bash
$ADB shell am start -W -a android.intent.action.VIEW -d \
  "bookoo-qa://ledger/$BOOKOO_E2E_FOREIGN_LEDGER_ID" dev.hyo.bookoo.qa
$ADB shell am start -W -a android.intent.action.VIEW -d \
  "bookoo-qa://ledger/$BOOKOO_E2E_LEDGER_ID/item/$BOOKOO_E2E_FOREIGN_ITEM_ID" dev.hyo.bookoo.qa

xcrun simctl openurl booted \
  "bookoo-qa://ledger/$BOOKOO_E2E_FOREIGN_LEDGER_ID"
xcrun simctl openurl booted \
  "bookoo-qa://ledger/$BOOKOO_E2E_LEDGER_ID/item/$BOOKOO_E2E_FOREIGN_ITEM_ID"
```

Expect: only the shared waiting composition may appear before immediate Back;
without history the deterministic timeline appears. The previously active
ledger remains unchanged.

**MUST NOT**: render protected content, error UI, refresh the app, enter an
ErrorBoundary, or briefly add the foreign ledger to the drawer.

### 3. Create a ledger, add entries

Create a ledger with a title, currency, and color. Add one expense and one
income entry with a category, memo, and a receipt photo from the picker.

Expect: both entries appear after the server confirms the save, the amounts
render with the ledger currency, and the day-section
subtotal matches the two entries.

**MUST NOT**: show a decimal drift or a currency mismatch — amounts are integer
minor units and are formatted at the edge.

### 3a. LedgerItem detail and author/admin editing

Open the same item as its author, a non-author MEMBER, an ADMIN and the OWNER.
Use the canonical `/ledger/[ledgerId]/item/[itemId]` route.

Expect: the metadata group has readable category/date spacing. Author,
ADMIN and OWNER see the top-right Update action; the other member does not.
Update opens the same composition as Add. Delete is present only inside Update,
uses the shared confirmation, and a cancelled confirmation changes nothing.

**MUST NOT**: expose inline Update/Delete buttons in detail, let `ANY_MEMBER`
edit another member's item, or open a writable edit form by typing its URL.

### 4. Timeline pagination (the critical gate)

Seed or accumulate enough entries to exceed two pages. Scroll the timeline to
the bottom repeatedly.

Expect:

- more rows load at `onEndReached` without a spinner that never resolves;
- day-section subtotals are still correct **across a page boundary** — this is
  the exact failure a client-side group-by produces;
- the list does not blank, jump, or reset scroll position while loading;
- editing one entry re-renders that row, not the whole list.

Record the row count at first paint and after two `loadMore` rounds. Any visible
stall over 500 ms while scrolling is a FAIL; follow up with `$perf-audit`.

### 5. Calendar month view

Open the calendar, switch to the previous and next month, including a month with
no entries.

Expect: day cells show per-day totals, an empty month renders an empty state
rather than a spinner, and switching months does not refetch the whole ledger.
The weekday row is compact, date rows use the 48-point rhythm, the 42-point
selected circle has breathing room, and an entry marker stays inside that
circle without touching the numeral. Verify phone and tablet screenshots at
full resolution; localized weekdays must not become date-suffixed copy such as
`4일` or `5일`.

### 6. Statistics totals

Open the statistics screen for the same month used in scenario 4.

Expect: the monthly total and the per-category breakdown match the sum of that
month's timeline entries exactly. A mismatch means the rollup and the source
table disagree — report the numbers side by side.

### 7. Invite deep link

Normal custom-scheme QA uses the separate QA app below. The HTTPS lines are
only for an explicitly scoped store-acceptance batch; do not run them as normal
QA or launch a store app through an old hardcoded Maestro appId. Derive a QA
flow/route from its canonical fixture and verify the installed native id first.

```bash
# Android — custom scheme
$ADB shell am start -W -a android.intent.action.VIEW -d 'bookoo-qa://invite/<token>' dev.hyo.bookoo.qa
# Explicit store-acceptance only — excluded test account, store binary
# Android — App Link
$ADB shell am start -W -a android.intent.action.VIEW -d 'https://bookoo.hyo.dev/invite/<token>'

# iOS
xcrun simctl openurl booted 'bookoo-qa://invite/<token>'
xcrun simctl openurl booted 'https://bookoo.hyo.dev/invite/<token>'
```

Expect: the join screen for the invited ledger, joining adds the account as a
member, and an already-used or invalid token shows a clear error rather than a
blank screen.

**MUST NOT**: a Naver-scheme regression — the Naver SDK owns `bookoonaver://`,
so if `bookoo://` links stop resolving, check that the plugin's `urlScheme` is
still separate.

### 8. Item comments

Open one shared entry on Android and iPad/iPhone. Focus a multiline comment,
type enough lines to require scrolling, attach a photo, submit, confirm the
other device receives it live, then verify own-delete and non-own-report states.

Expect: the comment list is paginated like every other list, and a deleted
comment leaves the thread coherent. While typing, the composer follows the
keyboard, the keyboard-time bottom Safe Area is zero, and the scroll owner can
bring all input and prior messages above the keyboard.

### 8a. Photo viewer

Open an item with at least three general photos. Swipe left/right at 1x, pinch
and pan one image, return to 1x, then page again. Verify Save, Share and
authorized Delete; cancel deletion during exploratory runs unless destructive
testing was separately approved.

Expect: authenticated originals render on black with full-screen Safe Area
chrome. Viewer order matches thumbnail order. A non-author without admin rights
has no Delete action.

### 8b. Drawer and member roles

Open the drawer, select another ledger, reopen it, tap outside, reopen and tap
X, then open My Profile. In Members, swipe rows as OWNER, ADMIN and MEMBER.

Expect: ledger selection immediately changes and closes the drawer; outside/X
also close it; profile navigation opens the dedicated self-management screen
at canonical signed-in route `/profile/me`, with Edit profile and Change
username. It must not open `/u/[handle]`, reuse the onboarding `/profile` path,
render a literal route-pattern header, or expose Block/Report against the
signed-in user. Only OWNER receives ownership transfer, while permitted
admin/removal actions use tappable cpk-ui dialogs. The Invite icon and text
share the same contrast-safe foreground.

### 9. App lock

Enable app lock in settings, background the app, foreground it.

Expect: the local-authentication gate appears before any ledger content is
visible, and a cancelled authentication does not reveal the content behind it.
On the simulator, enrol a biometric first (Features → Face ID → Enrolled) or
report the scenario as SKIPPED with the reason.

### 10. Dark mode and tablet

Toggle the system appearance while the app is foregrounded, then run scenarios
3–5 on a tablet/iPad target.

Expect: no unreadable contrast in either theme, and the tablet layout uses the
wider layout branch rather than a stretched phone layout.

### 11. Final correction and route inventory

For final acceptance, walk every route exported under `app/` and every interaction state named in
`.notes/qa/USER-CORRECTIONS.md`, including dropdowns, sheets, dialogs, keyboard
states, empty/loading/error states and permission variants. Capture individual
full-resolution images first; contact sheets are review indexes only.

Expect: every active register row has a PASS/FAIL/SKIPPED result for the exact
candidate commit. A previously captured gallery never substitutes for this run.

---

## Recovery

| Symptom                           | Action                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shows a network/Convex error  | Confirm `bun dev:convex` is running and `EXPO_PUBLIC_CONVEX_URL` is set for this build                                                                                                                                                                           |
| Android cannot reach Metro        | Re-run `adb reverse tcp:8081 tcp:8081`                                                                                                                                                                                                                           |
| White screen after a route change | Capture the hierarchy and log filter above before restarting; specifically preserve Fabric `addViewAt`, `View already has a parent`, SurfaceMountingManager and ReactHost teardown lines because a restart destroys the evidence                                 |
| Development OTP is rejected       | Confirm exact `ENVIRONMENT=development`, then inspect Convex auth logs for a duplicate global code hash. Request and verify one account at a time; the newest shared-code request invalidates older outstanding fixed-code rows. Do not weaken production policy |
| Emulator wedged                   | `adb emu kill`, then relaunch from Setup                                                                                                                                                                                                                         |

## Reporting

Use the table in `../SKILL.md` and mirror every active row from
`.notes/qa/USER-CORRECTIONS.md`. Attach every screenshot path, exact commit and
artifact identity. Never call a bug fixed until the UI evidence and the log
evidence agree. If a run disproves an older note, label that note/capture
SUPERSEDED in the active register and add a correcting append-only status entry
instead of silently retaining the stale claim.
