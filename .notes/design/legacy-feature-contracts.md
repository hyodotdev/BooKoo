# DESIGN — Legacy feature release contracts (D3 / G23–G31)

**Status:** normative client feature annex, 2026-08-24.

**Authority:** measured facts in `research/15-REAL-DATA-PROFILE.md` → `SCHEMA.md` → this document →
`app-shell-and-screens.md` and `client-ia.md`. This annex closes feature ownership and release behavior;
D4's `privacy-and-compliance.md` and `release-and-store.md` now own legal copy, protected receipt access,
personal/ledger export, and store privacy disclosures.

## 1. Decisions at a glance

| Gap | Release answer |
|---|---|
| G23 photos | cpk-ui `PinchZoom` inside SDK-pinned `react-native-pager-view`; save an explicit local copy to the device; permission-gated delete in edit mode |
| G24 location | Preserve migrated place text and open it in system Maps; ship no location capture, SDK, embedded map, or location permission in v1 |
| G25 statistics | Victory Native 41 over its installed Skia renderer; top 7 + Other donut, exact running balance, 12-month trend, semantic list fallback |
| G26 search | Memo full-text and exact category/type refinements; a separate indexed exact-amount mode, never legacy numeric substring matching |
| G27 tutorial/legal entry | Three-page hero lives on the sign-in route and never blocks auth; ToS/privacy links stay beside the sign-in actions, with D4 owning URLs/copy |
| G28 content/feedback | Bounded accordions, device-local notice read watermark, feedback history, and one ADMIN-only in-app ops route for content/config/triage |
| G29 locale/currency | Language is the user's UI setting; preferred currency only pre-fills new ledgers; active ledger accounting settings stay ledger-wide |
| G30 color | Typed light/dark app theme, six ledger accents, fifteen category colors, semantic money colors, automated AA contrast checks |
| G31 tablet | The D1 three-degree layout and the `useTabletLayout()` authority apply to every feature in this annex; no second breakpoint exists |

R5's `notifications-push.md` already owns push-on-add, including coalescing, permission timing,
channels, receipts, and tap routing. D3 consumes that contract and does not create another push design.

## 2. G23 — photo viewer, save, and delete

### 2.1 Viewer and gesture ownership

`photo/[itemId].tsx?index=&edit=` is a full-screen modal. It subscribes only to
`photos.listByItem({itemId})`, capped at `PHOTO_SCAN_LIMIT = 20`; the item/member authorization check is
server-side. The initial index is parsed as a non-negative integer and clamped to the live array.

Each native pager page owns exactly one cpk-ui `PinchZoom`. `react-native-pager-view@8.0.2` owns
horizontal paging. `react-native-awesome-gallery` and a second zoom library are not dependencies.
While the active image scale is greater than 1, horizontal translation belongs to `PinchZoom`; paging
is re-enabled after its release/reset callback. A page change resets the old page through
`PinchZoomRef` so a zoom transform never leaks to the next image.

The image uses `PrivateImage` over `expo-image`, D4's authenticated original endpoint with the current
Convex Auth header, and a matching protected thumbnail/blurhash placeholder,
`contentFit="contain"`, `cachePolicy="memory"`, and a stable `recyclingKey` based on the photo id. One tap
toggles chrome;
double tap zooms through `PinchZoom`; vertical swipe-to-dismiss is deliberately absent because it
competes with panning. The header shows back, `current / total`, save, and edit-authorized delete.

Loading keeps a black modal canvas and geometry-matched image skeleton. A photo removed by a co-member
clamps to the next valid index; zero remaining photos dismisses to the item. Forbidden/gone errors use
the shared error contract and reveal neither URL nor metadata.

### 2.2 Save to device

Saving is an explicit user action and never happens during viewing. The client:

1. downloads D4's authenticated original endpoint with the Convex Auth Bearer header into an
   extension-bearing file under `Paths.cache` (an authenticated `fetch`/file write, not a public URL);
2. asks only for write/add access at action time (`requestPermissionsAsync(true, ['photo'])`);
3. creates the system-library asset from that local file through `MediaLibrary.Asset.create`;
4. deletes the temporary cache file in `finally`; and
5. shows a success snackbar only after asset creation resolves.

The root-package `saveToLibraryAsync` export is not used: in Expo Media Library 57 it is a deprecated
runtime-throwing shim. `app.config.ts` configures `expo-media-library` with only the `photo` granular
permission and no media-location access. `assets/langs/meta/{en,ko,ja,zh,id}.json` owns localized
`NSPhotoLibraryAddUsageDescription`; all five locale files are registered in Expo config.

Denied permission leaves the viewer intact with “Settings” and “Cancel”; download, permission, and
asset-write failures are retryable and never claim the file was saved. D4's private media route rechecks
current membership and exposes no storage id/URL.

### 2.3 Delete

Delete is visible only when `edit=1` and the same local permission projection used by item edit says the
member may edit. It opens the shared confirm surface with the concrete destructive label “사진 삭제”.
On confirm, `photos.detach({photoId})` rechecks item/ledger membership and policy, soft-deletes the row,
updates cover/count, and schedules blob cleanup per `SCHEMA.md`. The tile may disappear optimistically,
but any mutation failure restores it at the same index. Delete never removes a copy the user previously
saved to the device library.

## 3. G24 — migrated locations without new collection

Measured production truth is binding: only 239 of 34,799 legacy item children carry a place (0.7%).
Those values are preserved, but location capture is not a v1 input.

An item with `place` renders its `label`, optional `address`, and an “Open in Maps” action. `place/view`
is a static detail modal with the same fields and a platform system-map URL built from the stored
latitude/longitude. It does not fetch a static-map tile, contact Google Maps APIs, reverse-geocode,
request the device position, or expose coordinates in analytics/logging. Invalid or non-finite migrated
coordinates still show the text but disable the Maps action.

There is no “add location” control in create/edit, no shipped `place/pick` route, no `expo-location`, no
map SDK, and no `NSLocationWhenInUseUsageDescription` in the v1 native metadata. The reserved route seam
may ship only in a later task that delivers all of the following together:

- a named location/map provider and data-retention contract;
- D4-approved separate, revocable precise-location consent and five-locale permission copy;
- an `appConfig.featureLocationCapture` kill switch;
- capture/edit/delete UX and store privacy-label updates; and
- device tests for denied, approximate, revoked, and offline permission states.

This is a deliberate read-path preservation decision, not a silent feature drop.

## 4. G25 — statistics and charts

### 4.1 Library and data composition

Victory Native 41.26.0 is the chart layer; its installed Skia 2.6.2 peer is the renderer, so there is no
separate “Victory versus Skia” decision. Reanimated handles pager/selection motion. Reduce Motion makes
transitions immediate and disables decorative interpolation.

The month screen keeps the four bounded query families in `SCHEMA.md`:

```text
categories = rollups.categoriesOfMonth(ledgerId, monthKey)
month      = rollups.month(ledgerId, monthKey)
before     = rollups.balanceBefore(ledgerId, monthKey)
balance    = before.netMinor + month.incomeMinor - month.expenseMinor
```

No chart reads `ledgerItems`, recomputes rollups, or adds a third balance query.

### 4.2 Donut and breakdown

The expense/income segment chooses the corresponding non-negative aggregate. Rows are sorted by amount
descending, then stable `categoryKey`. The donut renders the top seven non-zero categories and one
`category.other` slice equal to the exact sum of all remaining rows. This eight-slice ceiling is fixed;
zero-value categories are absent. A real slice opens its category drill-down. “Other” expands/collapses
the remaining breakdown rows and is never passed as a fake category key.

The center renders the localized running balance and an explicit “including this month” label. It uses
`text.income`, `text.expense`, or `text.basic` from the sign, never the active ledger accent. A month with
no rows renders the `role.border` empty ring and the zero-data copy while month navigation remains live.

### 4.3 Trend and accessibility

`stats/category/[categoryKey]` uses exactly twelve civil month keys in ledger timezone and
`rollups.categoryTrend`. Missing months are zero nodes; the line is not allowed to bridge an unknown
month. Selecting a node filters the bounded `items.listByCategory` drill-down to that month.

Charts are supplementary. The donut has one localized summary label, and every slice has a real
`CategoryBreakdownRow` containing category, amount, and percentage. The trend has a screen-reader list
of all twelve month/amount pairs and the selected state. Color is never the only signal: rows include
icons/labels, selected nodes include shape/label state, and income/expense is written in text. Dynamic
Type may replace the two-column tablet composition with a vertical stack; content is never clipped.

The frozen fifteen-color mapping lives in `src/theme/chartPalette.ts`. Statistics assigns colors by
stable category token, not current rank, so month paging does not make a category change color.

## 5. G26 — search that matches the new model honestly

### 5.1 Two explicit modes

The search header contains one input and exact filter chips:

- **Memo mode:** after 300 ms and at least two non-whitespace characters,
  `items.searchMemo({ledgerId, term, type?, categoryKey?})` searches `search_memo`. Type is All/Expense/
  Income and category is single-select from the bounded category sidecar. Category labels are selected
  as filters; they are never copied into an item's indexed memo.
- **Amount mode:** when the whole input parses as one positive currency value using the shared minor-unit
  parser, an “exact amount” suggestion switches to
  `items.searchAmount({ledgerId, amountMinor, type?})`. Category is cleared/disabled in this mode because
  the authoritative amount index does not place category before amount.

Convex full-text queries always require one text search expression; a filter field alone cannot answer
an amount-only search. Therefore `SCHEMA.md` adds
`by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt`. With a type chip, the query reads one exact
range; with All, it merges the exact EXPENSE and INCOME ranges in chronological order. It never applies
`.filter()` to `ledgerItems`. See the official behavior contract:
<https://docs.convex.dev/search/text-search>.

Both modes read at most `SEARCH_SCAN_LIMIT = 31`, return 30 rows plus `truncated`, and ask the user to
refine when truncated. They do not leave accumulating live pages. A changed term/mode/filter replaces
the one subscription through `useStableQuery`; stale results remain visually marked while the new query
loads and cannot be tapped as if they matched the new criteria.

### 5.2 Deliberate legacy differences

- `12` does not substring-match 12,000; the exact suggestion must parse 12,000 in the ledger currency.
- typing a translated category label does not mutate/search denormalized item text; selecting the
  matching category chip is the discoverable replacement.
- memo is now searchable, which the legacy list could not do.
- an empty query shows recent-search hints and filters, not every item in the ledger.

No results names the active memo/filter and offers one-tap clear. Offline search is unavailable unless
the exact argument set already has a safe in-memory result; it never scans the MMKV page-zero cache and
pretends that partial local rows are the full ledger.

## 6. G27 — tutorial and the legal entry surface

The legacy three-slide tutorial becomes the top hero of `(auth)/index.tsx`, backed by
`react-native-pager-view`. It is not a separate route, not an auth/onboarding state, and not an MMKV
gate. All provider/email actions remain reachable without completing a swipe; screen readers traverse
three labelled static pages and then the sign-in actions. A returning signed-out user may swipe the same
product explanation again, which is harmless and makes a replay setting unnecessary.

The sign-in action block contains the D4-owned legal rows and tappable Terms/Privacy links. Missing or
placeholder production URLs are a build/release blocker, not a hidden link. Account finalization records
separate affirmative Terms acceptance, Privacy Notice acknowledgement, and 14+ attestation; optional
marketing is never bundled or pre-checked. Push permission is not part of auth:
`notifications-push.md` asks in context after the first ledger join and supports denial.

`privacy-and-compliance.md` owns the Korean PIPA basis, document versions/evidence, precise URLs, export,
deletion disclosures, and store labels. This D3 annex does not redefine them.

## 7. G28 — announcements, FAQ, support, and operations

### 7.1 Reader screens

`settings/announcements` and `settings/faq` use the shared FlashList-backed settings SectionList with sticky
section headers over `api.content.queries.list`. The client passes a stable epoch-millisecond boundary; the
query remains deterministic, uses the kind/deleted/sort index, paginates with a 50-row ceiling, and bounds
visibility narrowing to a 200-row scan. Each row resolves the requested locale, then English, then Korean.
No raw missing copy or unbounded collection reaches the screen.

FAQ expands in place. Announcements open one content detail route. Both screens use compact skeleton, empty,
and not-found states and must be opened on the native candidate after Convex changes. There is no device-local
new badge or read watermark in the current surface.

The current app has no `settings/feedback` route. Customer inquiry is `settings/legal/support` and exposes one
email action. The `feedback` table plus legacy send/history endpoints remain compatibility and migration
contracts for already deployed clients and retained records; they are not linked from current BooKoo UI and
must not be described as a shipping menu.

### 7.2 Restricted operations path

`settings/ops.tsx` remains hidden unless the current profile has `appRole === ADMIN`, and every server query
or mutation still enforces administrator authorization. The current screen owns only the maintenance toggle
and the open/reviewing report queue. Both report sources use indexed Convex pagination at 30 rows per page
and render through FlashList. It does not expose FAQ, announcement, or Feedback authoring.

Operational writes retain application audit records with actor, target, changed field names, and timestamp,
without private report bodies or secrets. Content seeds and legacy Feedback rows remain backend data contracts,
not justification for unused current-app routes.

## 8. G29 — language, currency, and settings ownership

The UI uses three visibly separated owners:

| Surface | Authority | Behavior |
|---|---|---|
| Language | `userProfiles.preferredLocale` + boot MMKV mirror | Changes UI immediately across all ledgers; server mirror controls recipient-language push/email rendering |
| Default currency | `userProfiles.preferredCurrency` | A synchronous radio choice with one centred amount example; only pre-fills `ledgers/new` and never reformats an existing ledger |
| This ledger | `ledgers` + ledger policy | Base currency, timezone, week start, period start, color, item-write policy, and notification policy are shared facts |

`settings/language` offers all eleven shipped locales in their own language. It persists the Convex locale,
leaves the route, and only then notifies the local catalog so Android Fabric does not remount the saving footer
mid-navigation. `settings/default-currency` uses the complete ISO list and formatter from the money design,
one centred amount example, and no explanatory hero or preview label.

Ledger settings are reachable from the active ledger header. `ledger/[ledgerId]/currency` is editable
only for an empty ledger or the one-time migrated `currencyIsAssumed` confirmation defined by
`SCHEMA.md` §7.3. A migrated assumed-currency banner stays on Calendar, Timeline, Stats, and ledger
settings for OWNER/ADMIN until confirmation; it explains the rebase/maintenance step before action.
Populated non-migrated ledgers render base currency as read-only. Timezone/week start/period start show
their ledger-wide impact and role requirement before mutation.

Changing UI locale never changes `dayKey`, currency, amount, or category identity. Changing preferred
currency never writes a ledger. Changing a ledger setting never rewrites device/profile preferences.

## 9. G30 — executable theme and color ownership

`src/theme.ts` defines every cpk-supported `bg`, `role`, `text`, and `button` token for light and dark
mode with no `any`. The extra BooKoo tokens remain inside those four buckets because cpk-ui drops a new
top-level group at runtime. `src/styled.d.ts` extends kstyled's `DefaultTheme` with that exact shape.

Per-ledger colors are not global theme tokens. `src/theme/ledgerAccent.ts` owns the six
`PINK | ORANGE | YELLOW | TEAL | BLUE | PURPLE` identity swatches. Light and dark use the same original base
swatch; readable foreground, subtle surface, and border tokens adapt around it. Ledger accents identify a ledger
and its Income state. Expense input remains the BooKoo main accent; links, validation, and charts keep their
semantic tokens.

`src/theme/chartPalette.ts` owns literal light/dark values for the fifteen category tokens used by the
authoritative preset mapping:

```text
red brown orange purple blue navy teal green yellow slate pink grey indigo lime sky
```

Those mappings live beside chart code rather than inside the cpk theme because category token keys are
data identities, not cpk component roles. Income/expense text/fill colors remain the semantic
`text.*`/`role.*` pairs. `test/src/theme.test.ts` computes WCAG relative luminance and rejects enabled
button, informational text, ledger-accent, or category-canvas pairs below 4.5:1. Disabled controls are
the sole documented contrast exemption and never convey information.

Shared tokens own product colors. Intentional fixed overlays may use literal black or white with measured
opacity. Ledger swatches never fork into separate light and dark reds, greens, yellows, blues, oranges, or
purples.

## 10. G31 — tablet application

D1 already owns the one breakpoint (`useTabletLayout()`, window minimum dimension >= 600dp; it replaced
`useCPK().media.isTablet` on 2026-09-09) and the three layout degrees. This annex applies it concretely:

- photo viewer remains a full-screen modal at every size;
- stats becomes chart/breakdown/trend split panes;
- search becomes result list/detail panes while filters remain one shared state machine;
- announcements, FAQ, Account, and ledger Manage use the shared responsive settings list;
- language/currency leaf forms use the centered-width wrapper; and
- auth tutorial uses a wider hero but the same three pages and provider actions.

Routes, data hooks, permissions, mutations, empty states, and deep links remain identical across phone
and tablet. `isDesktop`, window width, and orientation may derive column geometry but cannot choose a
different screen tree. D1's iPad screenshot requirement remains the release acceptance source.

## 11. D3 implementation acceptance

- Entry location uses `expo-location` and `expo-maps` (Apple Maps on iOS, Google Maps on Android); Android production fails configuration without a
  Maps key, while keyless development renders a recoverable unavailable state.
- Photo save is tested on iOS denied/allowed and Android 13+ denied/allowed paths with a real local file.
- Deleting the current/last photo leaves a valid pager or dismisses safely.
- Stats top-seven/Other sums exactly to the selected rollup total in both modes.
- Screen-reader traversal exposes every chart value without relying on the canvas.
- Memo and amount searches use their documented bounded indexes; no `.filter()` touches `ledgerItems`.
- Tutorial never blocks any sign-in action; legal URLs are D4 release-gated.
- Non-ADMIN callers cannot read the operations report queue or invoke maintenance and moderation mutations.
- Locale/default-currency/ledger-currency changes affect only their declared owner.
- Theme contrast tests and the canonical repo gate pass.
