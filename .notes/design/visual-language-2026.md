# BooKoo visual language — 2026 modernization

Status: active P1 direction, 2026-08-26.

## Product read

- **Job:** let a community, team, project, club, or travel group record, understand,
  and discuss shared money. Households and couples are included use cases.
- **Visual-result authority:** preserve BooKooLegacy's recognizable mint header, piggy-bank identity,
  compact ledger navigation, category colours, and four core destinations. Preserve its user journey,
  not its obsolete ratio math or fixed-device layout.
- **Temperament:** optimistic social utility — calm enough for daily finance, friendly enough to feel
  shared, and precise enough that totals remain trustworthy.
- **Memorable device:** the **living ledger ring**. Category colour moves through totals, progress,
  selection, and detail instead of appearing as an isolated chart decoration.

## System rules

### October 26 — receipt failures stay visible without scrolling

Receipt reading failures and unusable/no-result warnings use the existing
cpk-ui global Snackbar, outside the entry editor's scroll content. A user must
see this feedback immediately from the scan action without dragging to the
bottom of the form. Reuse localized receipt messages, preserve draft fields
and pending attachments, and leave scan retry available. OCR feedback must not
turn the unrelated Done action into a save-error retry state. Successful OCR
still requires explicit review and Apply before changing the draft.

### October 26 — advertising space follows confirmed display

An ad that is unavailable, loading, loaded without display, or failed must
reserve zero advertising height and accept no touches. LevelPlay load success
alone does not establish a visible creative: only `onAdDisplayed` may expand
the existing adaptive slot. Keep the SDK view mounted at its real requested size
for delivery, retries and refresh, while the outer layout remains collapsed.
Retain a filled native view across width changes whenever its actual requested
size still fits; do not restart an auction simply because the slot grew.
The single footer still owns the genuine bottom safe area; never remove the
home-indicator/navigation protection or add a second inset to the tab bar.
Preserve unresolved and verified-Pro suppression. This refines the older
`onAdLoaded` expansion rule below; new network inventory still requires native
verification before release, separate from controlled callback/layout evidence.

### September 20 — transparent community ledger positioning

The owner's product direction is a transparent community ledger: company-team
treasurers, global project groups, hiking clubs, and family trips all belong.
Product copy and visual examples should lead with shared funds, records members
can inspect, and discussion attached to a transaction. Couples are one example,
not the product's defining audience. Use one coherent group story per demo.

Transparency follows the existing membership and role permissions; it does not
imply public access or equal administrative capabilities. Match screenshots and
claims to working features and supported group sizes. New ledgers currently cap
Free at 2 and Pro at 5 members; a larger-group offer is still undecided. See the
September 20 entry in `RECONCILIATION.md` and `.notes/DECISIONS.md`.

### September 16 — auth field placeholders stay unclipped (R69)

Sign-in text fields must show every line of their placeholder, including
`hello@gmail.com` and localized OTP hints, at large system font scales. cpk-ui
`EditText` owns a complete native line box (`lineHeight`, explicit
`paddingTop`/`paddingBottom`, `includeFontPadding: false`). Auth fields reserve
at least two scaled lines via `minHeight` and do not put instructional sentences
in the placeholder — those belong in the screen subtitle. Never disable font
scaling or ellipsize the placeholder to hide wrapping.

### September 13 — press geometry and visible authentication (R66–R68)

- Button layout margins belong to the outer `style`, never the inner
  `styles.container`. Inner margins create a blank area inside the ripple or
  underlay. The first-ledger pill retains its 24dp external gap and 56dp fill;
  inspect held feedback, not only idle geometry or accessibility bounds.
- Drawer Add ledger follows the supplied design: an unfilled row, one subtle
  44dp rounded-square plus tile aligned with ledger marks, and a muted label.
  Keep the whole row one accessible action with rounded, bounded feedback.
  This supersedes R61–R63's filled-row direction.
- Every social attempt immediately identifies the active provider with a
  spinner and a localized signing-in label. Disable competing login actions
  and reject duplicate requests synchronously. After the native provider
  returns, show a cpk-ui progress dialog during the session exchange. Do not
  present a competing native modal over the provider's authentication sheet.
  Cancellation/failure restores the controls; a failure remains retryable.

### September 13 — eight-scene Play story (R65)

The user approves the restrained mint/navy design and requests the same breadth
as the iOS listing: eight panels per locale, ordered calendar, timeline,
statistics, ledger switching, sharing, category selection, quick entry, dark
appearance. Preserve consistent frames/short benefits and authentic Android
UI. Four panels were an initial selection, not the final gallery limit. Do not
reintroduce the rejected mixed raw screenshots or decorative clutter.


### September 13 — Android density, press feedback and store presentation (R61–R64)

- Android onboarding places progress and Next in normal flow above the live
  bottom safe area, with at least 20dp of visual breathing room. A footer
  positioned absolutely against the screen bottom is not safe-area-aware.
- Keep sign-in compact: 200dp wordmark, 16sp provider labels, 48dp minimum
  actions and restrained legal copy. Preserve font scaling and scroll access;
  never change device density or disable accessibility scaling to shrink UI.
- Android actions use one Material ripple from cpk-ui. Filled/outlined buttons
  clip feedback to their own rounded surface; bare icons use a circular target.
  Provider colour and touch surface occupy the same 48dp circle. Hit slop must
  never enlarge the visible feedback or overlap neighboring actions.
- Ledger creation is an explicit exception to the full-width completion bar:
  place a white rounded Done button at bottom right on the ledger-colour canvas,
  outside the scroll owner, above safe area or keyboard. Keep its async state
  busy until successful navigation; failures restore the editable form.
- Back must work after a direct launch as well as ordinary navigation. Dismiss
  the keyboard before leaving; if history is empty, replace with the owning
  list or sign-in step. Never dispatch an unhandled GO_BACK or hide its warning.
- Store screenshots form one quiet sequence with a consistent background,
  short benefit headline and aligned device frame. Prefer the calendar,
  recording, statistics and sharing story before secondary settings. Use
  inspected real app captures and synthetic data; no mixed raw debug screens,
  stretched UI, loading frames or decorative clutter. Korean store identity
  explicitly connects BooKoo with 부쿠 and 공유 가계부 in natural language.

Category management uses a visible drag handle for direct reorder, with an
accessible alternative but no visual Move up/Move down buttons. Hide is not
offered here; existing hidden state is not silently changed. The selected
Expense/Income tab supplies type context, so rows do not repeat it. Contextual
actions say Add, Save or Archive; confirmations retain the affected name and
necessary consequences. cpk-ui owns the reorderable list and gesture visuals.

Amount inputs must reserve a complete native line box for both the empty `0`
and entered decimals. When overriding cpk-ui input spacing, set explicit edge
slots (`paddingTop` / `paddingBottom`); axis padding does not replace existing
edge values. Inspect empty, focused/blurred and rotated native captures before
calling clipping fixed. Keep the current 28pt amount in a 36pt line box and a
minimum 60pt touch area; preserve numeric validation, sign and semantic tokens.

1. **One hierarchy, not a card pile.** Use base surface, spacing, type, and dividers first. A card is
   reserved for one genuine focus object such as the monthly financial summary.
2. **Continuous geometry.** Controls use full capsules when selection is binary/segmented; focus cards
   use 24–32 point continuous corners; list category marks remain circles. Touch targets stay at least
   44 points.
3. **Ledger colour is context; ranked colour is chart data.** The ledger accent owns status/header/selected
  navigation and the leading Stats slice. Remaining Stats slices use the balanced Legacy-ranked series
   palette, while stored category colours own picker/editor icon identity. Category rows repeat their assigned
   slice colour on the icon outline and proportional indicator.
4. **Numbers are the interface.** Financial metrics use tabular numerals, explicit semantic labels,
   and no decorative metrics. A chart's centre describes the charted measure; balance is separate.
5. **Motion explains change.** Mode/month/category changes may animate one coordinated transition
   (roughly 250–450 ms). Bottom-tab items stay fixed while one 56×32 indicator moves between their slots in
   250 ms. Respect reduced-motion and never animate static chrome for novelty.
6. **Light/dark parity.** Use `theme.ts`/cpk-ui tokens only. The six ledger identity swatches stay exactly
   the same in light and dark mode; surrounding surfaces and foregrounds provide contrast. Filled surfaces
   always use their defined foreground, and ranked chart data may keep its coordinated chart palette.
7. **Platform structure remains native; reusable visuals remain upstream.** Expo Router owns navigation,
   FlashList owns unbounded lists, and cpk-ui owns every reusable control and chart. Missing or insufficient
   primitives are added or improved in cpk-ui; BooKoo keeps only domain mapping and screen composition.
8. **One fact appears once.** Navigation, selection, and route context already visible upstream is not repeated
   in a downstream empty state or helper paragraph. Keep only the next useful action.
9. **Native surfaces share the saved appearance.** App-selected Light/Dark must also style RevenueCat
   Paywalls, native alerts and pickers. Synchronize the app-only native appearance override with the saved
   preference; System removes that override. Do not override the device's global theme or derive a sticky
   override from CPK's currently resolved System colour.

## Stats reference composition

- Compact month navigation followed by the shared rounded mode selector.
- The shared List/Stats mode selector is visually compact: one 44-point rail, 36-point selected capsule,
  14-point labels, and no raised legacy shadow. Each tab still owns the full 44-point hit target; visual
  density must never be achieved by shrinking accessibility geometry.
- One monthly focus card containing a thinner category ring.
- The largest ranked slice begins with the active ledger colour. Following slices use the measured Legacy
  sequence (cloudy blue, carnation, orange, yellow, mint, blue, purple), keeping the measured swatches in both
  appearances; they never inherit arbitrary stored category hues that can collapse the ring into muddy adjacent colours.
- The ring centre shows the selected measure's total (`CONSUME` or `INCOME`), never an unrelated
  balance. Balance lives in a small capsule at the ring's lower edge.
- One category uses an accurate 360-degree ring. Multiple categories use a restrained open sweep and
  visible angular separation. The server-defined top-seven-plus-Other cap remains authoritative.
- Category rows repeat the slice colour on the icon outline and a proportional progress line, while
  preserving amount, percentage, drill-down, pagination, and accessibility output.

## Per-ledger More reference composition

- The existing bottom `More` tab belongs to the active ledger. It is the concise front door to
  `/ledger/[id]/settings`; it must never become a profile, theme, notification, language, or account dashboard.
- Use the compact ledger-coloured hamburger/title header followed by common ledger rows, Pro, Currency, Time
  zone, and one Manage row. Manage opens only export, deleted entries, join requests, activity,
  report, archive and deletion; never repeat the common More rows there. Separate
  its untitled card from Preferences with 24 points above it; omit this gap when
  the section starts a standalone page. Its header is `Manage`, not a
  repeated ledger name, and no identical section label is needed. The Drawer does not duplicate this
  destination; its ledger rows switch only.
- More and the full management screen use the shared FlashList-backed SectionList with sticky headers. Keeping
  the same row primitive and hierarchy makes the two levels feel related without exposing every low-frequency
  action in the tab.
- Use compact section labels and continuous grouped rows with the active ledger's light/dark accent, current
  value, inset divider, pressed feedback, and one disclosure caret. Do not fabricate the Legacy Repeat switch
  or raw-email Excel delivery; SCHEMA keeps recurrence in v2 and requires protected expiring exports.

## App settings reference composition

- Saving language must update retained tabs, drawer labels and memoized entry /
  Stats / comment rows immediately. Subscribe at formatting boundaries, not
  only the app root. Never key-remount navigation to refresh translations or
  discard a draft; verify an actual mounted Korean → English transition.
- Embedded entry comments reserve the keyboard overlap within their actual
  scene. Tab/ad footer height is not a second upward translation. The composer
  touches the keyboard suggestion bar and the thread scrolls above it, in
  tablet portrait and landscape as well as a standalone phone detail.

- FAQ and Announcements both expand inline through cpk-ui's public `Accordion`,
  including its disclosure motion. Do not replace it with conditional body
  mounting or push a detail page when the row is tapped. Remove the separate
  content-detail route, screen and unused single-item query. Their lists
  fill the available phone/tablet width within 16-point side gutters, without
  the general settings column's 680-point cap. Keep server content paginated
  in FlashList; each recycled row owns one keyed accordion item.
- General app settings are owned only by the Drawer gear and dedicated `/settings` stack: appearance,
  notifications, app lock, language, default currency, account, announcements, FAQ, Customer inquiry,
  Privacy and data, and About. Logout and withdrawal appear only after Account opens; the removed in-app
  feedback form must not compete with Customer inquiry.
- One shared FlashList-backed SectionList owns the surface and pins each section header. Do not add parallax
  motion or a separate scroll owner around it.
- Use compact section labels and continuous grouped cards. Each row has a mint icon tile, plain-language label,
  optional current value, inset divider, pressed feedback, and one disclosure caret.
- Account opens account management; it must not be mislabeled as logout when logout and deletion live on the
  destination screen.
- Profile ID (`아이디`) cannot be saved empty in either production or development: Update stays disabled.
  The earlier development-only empty-field exception is superseded. Display names may be duplicated.
  Availability copy (`사용할 수 있는 아이디입니다` / `사용할 수 없는 아이디입니다`)
  hides while typing and appears only after debounce; do not fire a handle probe on every keystroke.

## All-ledgers reference composition

- The native Stack header owns back navigation, the localized title, and one 44-point add action. A
  populated list must not repeat Add ledger as a large in-content banner or reserve blank space for it.
- Use one responsive, centred `FlashList` with 16-point page gutters and 12-point row rhythm. The native
  Stack owns the top safe area, so this child list disables automatic inset adjustment instead of adding a
  second header-sized gap.
- Each ledger is an 80-point-minimum, 24-point continuous card. The current ledger uses a subtle highlight,
  mint outline, and filled inverse check; inactive ledgers use the basic surface and disclosure caret.
- Metadata is user language, not storage language: localized member count plus base currency, with archived
  state only when applicable. Never expose internal role enums such as `OWNER` in this list.
- Ledger identity is colour plus a Phosphor glyph. A stored `iconKey` renders inside a circle of the ledger
  accent; migrated ledgers without `iconKey` keep the colour piggy asset.

## Ledger create identity

- Creating or editing a ledger chooses both colour and icon. Colour swatches stay on the form. Choosing a
  colour assigns a random catalog icon; shuffle rerolls it; the icon row opens the reusable colour+icon
  picker (same chrome as currency `OptionSelect`: close, title, Apply).
- The picker is a paper screen: six colour dots, a search field, Expense/Income/Other icon groups, and Apply.
  It is a BooKoo selection primitive, not a second inline chip row.
- Icon targets use 8pt symmetric vertical padding and vertically centered contents, with rounded
  pressed bounds. Keep the full-width cpk-ui search field inside a page-gutter wrapper: margins on the
  100%-width field itself can push its border offscreen. Its boxed border uses `styles.container`.
- A new ledger starts on TEAL. Filled mint chrome (empty-ledger header, recovery header, create canvas)
  uses the original `brandLedgerSurface` swatch `#1DD3A9` in both appearances. The empty-ledger add
  action is a solid `BookooButton` on that fill with its contrast-safe ledger foreground, not an outline
  whose label disappears on the navy canvas. Do not substitute a separate dark TEAL companion.
- Until a ledger exists, hide the tab bar and tab ad footer. The empty canvas is one dashboard
  surface (hamburger + add). Tabs appear only after the first ledger.

## Ledger Drawer reference composition

- The left ledger switcher is an actual Expo Router Drawer surrounding the bottom tabs, never a transparent
  `Modal` or an absolutely positioned panel that only looks like navigation.
- The compact Legacy hamburger and tappable ledger title open the same Drawer. The navigator owns the
  backdrop, close/back behavior, focus containment, and edge gesture so motion preserves spatial continuity.
- The Drawer is the Legacy account dashboard, not a duplicate of All ledgers: close/settings actions lead,
  then the current user's avatar and identity, a localized `My ledgers` label, and a flat virtualized ledger
  list. Each row is one full-width selection target with inset dividers and a small inverse selected check
  attached to the ledger icon; do not split the row with a redundant `more` action.
- The selected ledger highlights its entire edge-to-edge row with that ledger's subtle light/dark accent.
  Selecting a ledger updates the active ledger and closes in one interaction. Per-ledger settings belong to
  the bottom `More` tab. Add ledger is an unfilled row with a subtle 44-point
  rounded plus tile, muted label and 56-point minimum target height (R67).
  Its icon and label share one bounded feedback surface. Do not also render it as an empty-state heading in the middle of the list.
- Phone width is responsive at 84% with a 360-point cap and continuous trailing corners. Do not reintroduce
  Legacy ratio math, manual status offsets, or delayed close-then-navigate timers.
- Close and settings are 56-point circular icon targets. CustomPressable underlay and Android ripple must
  clip to that circle (`borderRadius: 28`, `overflow: 'hidden'`). Square press highlights are a defect.
- The profile row opens My Profile (`/profile/me`). Settings opens `/settings`. Both routes live on the
  `(app)` stack, so the Drawer must not unmount that stack to show an overlay panel.

## Monthly reference composition

- Monthly has one `FlashList` scroll owner: the expanded mint header, calendar, selected-day summary, and
  paginated entries move together. A UI-thread `ParallaxHeader` reduces the intrinsically measured title surface to the
  compact 56-point Legacy chrome; reduced-motion keeps the same state change without decorative movement.
- Keep ledger identity legible in both parallax states: the expanded title uses bold Heading3 (24 points),
  and the leading-aligned collapsed title uses bold Heading5 (20 points). Do not reuse a regular Body token or animate
  font size/weight from scroll position; the shared header already crossfades the two semantic title states.
- Use the shared cpk-ui `Calendar` with a fixed six-week grid, ledger-time-zone today, ledger week start,
  swipe paging, automatic light/dark contrast, and a custom 56-point day cell. Calendar typography stays
  independent from the cell geometry so the tighter rhythm does not enlarge or shrink text unexpectedly.
- The enlarged month title is a 44-point-or-larger date-picker trigger with a disclosure caret. Previous and
  next are separate rounded 44-point controls and move exactly one calendar month; the same title opens a
  themed, fixed-six-week date picker whose own month controls and exact-day selection update the main view.
- Keep the primary cell at 56 points with 28-point month text, 18-point dates, and 14-point weekday labels.
  Tap geometry must not force oversized typography or excessive vertical whitespace.
- Dates with entries carry a marker and announce their entry count. Selection remains controlled by the
  ledger day key and changing a month moves the bounded 126-day query window through the existing codecs.
- Empty and populated days share one flex-growing, theme-basic list surface through the bottom tab bar, so a
  short result never reveals a paper/basic seam. The mobile scroll content derives its final safe inset from
  the same 56-point tab-bar base height plus the live bottom Safe Area, so the last entry clears the overlaid
  tab bar without a guessed device ratio or a differently coloured footer. An empty day contains only one
  centred Add entry button on mobile/portrait. A landscape tablet uses the centered
  entry invitation below instead. Neither repeats the selected date or “no entries” copy.

## Repository UI audit baseline

Measured on 2026-08-26 before the all-ledgers pass: 76 route components, 71 captured app-flow surfaces,
and 13,907 app/source TSX lines. Token drift is low for raw colours (6 hex uses), typography (8 raw font
sizes), and radii (43 raw radii), but material for layout rhythm (202 raw spacing declarations). Six legacy
shadow/elevation declarations remain and must be replaced when their owning screens are modernized.

The remaining sweep order after the real Drawer and all-ledgers passes is:

1. Core shell: shared empty-state composition, Monthly, and common native headers.
2. Transaction flow: add, detail, edit, photos, comments, and category/date/place selection.
3. Ledger administration: create/edit, members, invitations, permissions, and destructive actions.
4. Identity and support: profile/public profile, settings destinations, legal, feedback, diagnostics, and
   not-found/error/loading surfaces.

Every pass must preserve the Legacy journey, use the current stack rather than Legacy ratio/layout math,
cover light/dark and compact/tall viewports, and add a focused regression test. The stored app-flow captures
remain the route inventory and failure ledger; a screen is not complete merely because its happy path renders.

## Research adopted

- Expo official `expo-native-ui` and `expo-design-system`: native-feeling controls, semantic theming,
  continuous corners, explicit primitive variants/states, and pressed/reduced-motion behavior.
- Emil Kowalski `animate-expo`: deliberate UI-thread motion for Expo/Reanimated rather than scattered
  decorative animation.
- The skills are installed globally for Codex discovery; this document carries the decisions in the
  repository so every alternating agent has the same source of truth.

## Tutorial

- The three-page tutorial keeps the navy canvas and the existing footer (dots + Next/Get started).
  Artwork and titles stay near vertical centre, only slightly above the footer so they are not pinned
  under the status bar or dropped onto the dots. Do not hide the status bar: light glyphs on the navy
  field, with the live top inset applied to the slide padding.
- Next / Get started is a cpk-ui `type="text"` button, never a bare `CustomPressable`. The pressed
  underlay must include the text-button padding below, not hug the glyphs.
- Get started finishes on the same native auth index screen: unmount the pager, then mount sign-in
  in place. Do not `router.replace('/sign-in')` or otherwise native-stack swap those two trees;
  Android Fabric `addViewAt` fails when the tutorial pager and the sign-in dock are inserted as a
  screen replacement. `/sign-in` remains a real route for invites and help.

## cpk-ui Button radius

- `Button` and `BookooButton` set corners with the `borderRadius` prop. Do not put
  `borderRadius` or `padding` in `style`; padding belongs in `styles.container`.
  A loading overlay must match that prop so the corner does not change while busy.

## Text buttons

- Every `type="text"` button hugs its label with **8pt vertical and 16pt horizontal padding** and
  paints `theme.role.underlay` on press. Do not use transparent underlay, zero horizontal inset, or a
  full-bleed stretch unless the caller explicitly stretches the control. Icon buttons are a separate
  primitive and keep their existing 44-point target.

## Signed-out intro

- The post-tutorial sign-in canvas is the navy Legacy field with the mint BooKoo wordmark centered
  and the value-prop line in Body1: you can log separately and still share a tidy ledger, from daily
  spending to trip costs. Do not use Body2 or smaller for that line, and do not add a second
  headline, a “shared ledger” pill, a wallet glyph, or a decorative ledger illustration.
- Light/dark appearance does not apply to the tutorial or the navy intro dock. Email OTP login
  (`/sign-in-email`, `/sign-in-code`) uses the stored light/dark theme and the Legacy login
  composition: back caret, Login title, underline email (check when valid), mint send-code. The
  password field is replaced by the 8-digit code step. Do not keep those screens on the navy canvas.
- After sign-in the real `(app)` tab shell mounts. Missing IDs require the
  live-shell identity dialog and an available user-chosen ID in development
  and production alike (R27). Only missing display names receive a generated
  fallback; names may repeat. Never silently assign or skip the public ID.
  The empty-ledger mark, copy, and
  add action must remain visible around the dialog — pin that canvas to the Legacy top spacing,
  not vertical center. Close / Android Back exits the app on Android and signs out on iOS.
  First-ledger stays on this live tab shell and its real Drawer. Do not mount a second
  "legacy" dashboard overlay. Ambiguous account-claim remains the only dedicated onboarding route.
- Full-screen recovery, not-found, offline, and other problem canvases reuse that empty-ledger
  composition: mint 56-point header, paper field, white 80-point mark, placeholder Heading4 copy,
  and one mint-outlined 56-point capsule. Do not use a logo-and-code-pill dashboard or a red
  developer error sheet as the product UI.
- Provider actions sit in a full-bleed dock that spans the screen width, with extra top padding above
  the first Continue row. Do not wrap them in an inset rounded card.
- The login dock is a bottom sheet: it sits flush with the bottom on tablet and tall phones. The
  wordmark stays in the navy field above it. Scrolling lifts that sheet up over the wordmark so every
  Continue row stays reachable. Scroll stops at the end of the provider dock — do not add empty
  sheet fill past the buttons. Landscape is edge-to-edge — do not inset the sheet with left/right
  Safe Area. The value line sits further below the wordmark with extra horizontal padding.
- Email, Apple and Google are large white Continue capsules. Continue marks are 24pt (Apple 24×30 so
  the cropped glyph matches the G). Apple uses the black Apple mark on white (HIG white style on a
  dark field). Google uses the official multicolor G on white with the guideline `#747775` stroke.
  Do not recolor those marks from the app theme. Kakao and Naver are 40pt brand-color circles
  (`#FEE500` / `#03C75A`) with a 24pt padded Talk/N mark inside; do not let the glyph fill the circle.
- Terms and Privacy in the age/consent sentence are Body2 on light gray, with tappable underlined
  white links, and open the public legal pages. Do not use Body4 or medium-gray for that line. The
  email OTP step does not repeat that sentence or the wordmark: it uses the themed Login form.
  The Android Apple web callback (`bookoo://apple-callback`) is not a user screen: rewrite it to
  `/apple-callback` and hold there until the session is onboarding or ready. Do not send it to `/`
  while still signed out — that cancels the login and returns to the intro.

## Loading reference composition

- The native cold-start surface on iOS uses BooKooLegacy `splash.png`. Android uses the dedicated
  transparent `splash-icon.png`: the existing BooKoo wordmark is padded inside the Android 12+ circular
  splash safe area on the navy background. Never reuse the launcher adaptive icon or an edge-to-edge wordmark
  for the splash. Internal route/query waits use the shared, logo-free cpk-ui loading primitive on the
  destination's semantic background so navigation never looks like a second cold launch or repeats the
  product identity on every query.
- Use one shared loader per waiting composition. Do not repeat the indicator independently in chart/list or
  master/detail panes, and do not restore rectangular skeleton rows.
- Full-screen waits occupy the available scene and centre the indicator/copy group in that viewport;
  callers must not add an upward bias or select different positions through arbitrary skeleton-row
  counts. Pagination alone uses the compact inline variant. All variants announce one polite busy state.
- The restrained coin-orbit motion is native-driven with opacity/transform only. Reduced-motion
  is static. Do not add Lottie for this simple motion unless a future illustrated sequence materially needs it.
- A filtered empty page is still loading, not proof of an empty collection. Advance requested pages
  with no visible additions until a visible row or exhaustion; do not prefetch the full visible list.

## Feedback-to-rule protocol

- Every explicit user correction is checked for a reusable invariant before the session ends. Record the
  invariant here, record source-of-truth conflicts in `RECONCILIATION.md`, and add a focused regression test.
- Capture intent rather than a one-off screenshot coordinate: e.g. “empty copy uses disabled text,” “a wait
  stays centred in its available viewport,” or “a swipe-controlled indicator follows the finger.” Device-ratio arithmetic
  and per-screen magic coordinates remain prohibited.
- When later feedback supersedes an earlier value, update the earlier rule instead of leaving contradictory
  numbers in this file. The latest explicit user correction wins for presentation; SCHEMA and measured data
  retain their existing authority for data contracts.

## Entry interaction invariants

- Income and Expense are compact 44-point tab targets with a narrower visible underline. A horizontal form
  swipe moves that single indicator continuously with the finger on the UI thread, then settles in 160 ms;
  tab presses settle the same indicator and reduced-motion follows the system preference.
- The amount field is a plain numeric surface. It has no leading `+`, calculator, refund control, box, or
  underline; the OS decimal keyboard owns numeric entry. While empty, the native placeholder uses
  `theme.text.disabled`, never normal label contrast or the active ledger accent; a typed value switches to
  the ledger accent. Category, information rows, memo, photos, and the safe-area-covering Done bar remain
  visually separate.
- Headerless full-screen LedgerItem create/edit routes own their back chrome. The route header begins after
  the live top Safe Area inset, keeps Back in a separate 48-point row, and Edit alone places confirmed Trash
  at the top right. It never shares space with the status bar or Dynamic Island. Do not reproduce this with
  device ratios, fixed y-coordinates, or model-specific padding.

## No-ledger empty canvas

- When the signed-in user has no ledger, every main tab (Monthly, List, Stats, More) uses the
  BooKooLegacy Main empty composition — not a generic Wallet `ScreenState`. Mint hamburger header
  with no title, paper canvas, the Legacy `icNoLedger` sad-face mark in a padded white circle,
  two-line placeholder copy (`가계부가 없습니다.` / `가계부를 추가해주세요.`), and a solid TEAL
  capsule `가계부 추가` with white label text. Keep the mark, copy, and add action vertically
  centered in the remaining canvas. The white circle around the mark stays tight (about 80pt) with
  modest inner padding.
- The hamburger opens the real Drawer. Do not invent a second empty illustration or a heading that
  repeats the add action. The add action is the solid TEAL capsule, not an outline.

## Monthly density and quiet empty copy

- Monthly uses cpk-ui's compact 48-point numeric Calendar cell with 18-point dates, 14-point weekday labels,
  a 30-point weekday row, and a 42-point selected pill. This is the current compromise between a legible
  circular selection and the user's corrected tighter week rhythm; do not increase row height merely to
  enlarge typography or reintroduce a gap below the weekday labels.
- On mobile/portrait, a day without entries renders only one centred Add entry button.
  Landscape tablets use the entry invitation below; neither repeats the selected date.

## Landscape tablet entry invitation — September 8

- An empty landscape tablet pane is an intentional place to start, not a lone
  text action at its upper edge. Center one compact group in the actual available
  body: a ledger-tinted cpk-ui note/pencil tile, the short localized invitation
  “Every entry counts.”, and a rounded filled `+ Add entry` button.
- Monthly centers within the right entry pane; an entirely empty Timeline uses
  its whole available body without a redundant detail panel. Derive centering
  from measured pane height, not screen ratios or fixed top offsets. Short
  windows and larger text must remain scrollable rather than clip the CTA.
- Use cpk-ui Card/Icon/Typography/Button through domain composition, not custom
  drawing, fake receipt rows, new animation or an additional reusable primitive.
  Preserve contextual ledger colors and white filled-action labels/icons.
- Mobile, portrait and square layouts retain their existing compact empty
  states. Add uses the existing selected ledger/day navigation; no duplicate
  date, totals, explanation paragraph or second in-content CTA is introduced.

## Ledger accent ownership and form completion

- The active ledger colour is the contextual primary colour for every ledger-scoped, non-destructive action:
  filled and outlined buttons, selected segmented controls, selection checks, FAB/header actions, and focus
  marks. Each ledger keeps the exact same original swatch in light and dark mode; actions do not invert the
  appearance palette and there are no separate dark red, green, yellow, blue, orange, or purple identity hues.
  Filled ledger controls and chrome use white labels/icons in both themes via `ledgerAccentSurface`;
  never switch them to navy in dark mode. This explicit September 6 product choice is not a claim that
  white text on every original bright swatch meets WCAG AA. Disabled, danger, warning, success,
  and validation states keep their semantic tokens instead of being recoloured.
- A ledger create/edit screen previews its unsaved colour choice on its primary CTA and header immediately. Do
  not wait for the server round trip or active-ledger query to repaint the button, and do not leave a fixed mint
  CTA beneath a yellow, pink, blue, orange, or purple ledger header.
- Every visible touch surface clips its feedback to a continuous rounded rectangle or a circle. A transparent
  rectangular hit surface around rounded content is unfinished; 44 points remains the minimum target.
- A single-purpose create/edit/settings form completes with `await mutation -> back`. It stays on screen only
  when the mutation fails, so the user can correct or retry. If a deep link has no local history, replace with
  the deterministic owning surface (ledger forms use the active ledger More tab). Inline collection managers
  such as category reorder/hide remain in place because they intentionally support repeated actions.

## Private media and category trend drill-down

- Every user-visible receipt thumbnail is an exact, full-tile navigation target. It opens the same black,
  headerless full-screen viewer at that photo's item-relative index; a thumb must never be a decorative dead
  end in entry detail, entry edit, item photos, or ledger photos.
- The full-screen viewer loads the authenticated original variant with `contain`, supports horizontal paging,
  and delegates pinch/pan bounds and reduced-motion correction to cpk-ui `PinchZoom`. One-finger paging remains
  available at 1×; once zoomed, the image owns the pan until it settles back to 1×. Close and media actions are
  compact circular, inverse controls on black rather than ordinary form buttons.
- A custom black media header consumes the live top Safe Area before its 52-point control row. Close, zoom,
  save, and authorized-delete controls must sit below the status bar and Dynamic Island on every device; never
  infer this inset from a screenshot, device model, or fixed ratio.
- Native picker assets are uploaded from their local URI through Expo FileSystem's native foreground upload.
  Do not convert picker URIs with `fetch(uri).blob()` on iOS: that path can produce an unreadable request body.
  Validate source existence/size, HTTP status, and the returned Convex `storageId` before claiming the photo.
- A category row in Stats drills into a 12-month category trend and the selected month's paginated entries.
  The generic responsive line, points, grid, tooltip and full-interval hit targets belong to cpk-ui `LineChart`;
  BooKoo supplies only the category kind, category/light-dark colour, minor-unit formatter, month labels,
  selection, query and navigation. The chart and its entry list share one vertical scroll composition.

## Entry-detail discussion

- An entry detail contains one compact discussion below its financial and receipt content. Each comment shows
  avatar, author, timestamp and body; deleted/blocked states use their existing privacy contract rather than
  leaking identity. Own comments expose a destructive delete action, while non-own comments retain the report
  path required by moderation policy.
- The composer is a multiline text field plus one ledger-accent circular send control. Its whole visible circle
  is the press target, it disables for blank/submitting state, and a successful mutation clears the field while
  Convex live queries insert the comment for every authorized member without a manual refresh.
- cpk-ui `EditText` owns a 100%-wide root. Inside a horizontal composer it is
  contained by a `flex: 1`, zero-minimum-width wrapper between the two fixed
  44-point controls; giving the EditText itself flex is insufficient on narrow
  iOS widths. cpk-ui `CustomPressable.style` is a static `StyleProp`, not React
  Native `Pressable`'s state callback. Passing a function can leave an action's
  white icon on an unpainted white surface, so pressed behavior stays inside
  the primitive and BooKoo supplies a static rounded surface.
- The composer is a keyboard-sticky sibling of the virtualized comment list,
  not a footer that depends on the route resizing. Attachment, input and Send
  move as one surface to the software-keyboard edge. Keyboard-open state
  contributes no device bottom Safe Area; keyboard-closed state paints the
  full bottom inset. The list remains the scroll owner so long discussions can
  move behind the sticky composer without hiding the focused input.

## Ledger and LedgerItem route and editing invariants

- Domain and route names are explicit: a shared book is a `Ledger`, one transaction is a `LedgerItem`, and its
  read screen is `LedgerItemDetail`. New in-app navigation uses
  `/ledger/[ledgerId]/item/[itemId]`; the older `/entry/[itemId]` route exists only for notification and
  installed-link compatibility and must not spread into new feature navigation.
- Route params are untrusted. A ledger or item route resolves current membership before changing the active
  ledger or showing protected content. A missing membership, stale account-switch id, mismatched
  ledger/item pair, or revoked deep link renders only the shared waiting composition while it immediately
  returns to history, or to the deterministic timeline when no history exists. It must not flash an error
  boundary, refresh the app, reveal stale content, or overwrite the previously active ledger.
- LedgerItemDetail keeps category, date, memo and location in a continuously rounded metadata group. Each
  information row has at least 64 points of height and 14 points of vertical breathing room. The page contains
  no inline Update/Delete button pair. Only the item's author or an `ADMIN`/`OWNER` sees the localized Update
  action in the top-right header; `ANY_MEMBER` controls creation policy, never ownership of another member's
  item.
- Update reuses the same form composition as Add. The update form owns both Save and the secondary destructive
  Delete action; deletion is confirmed with the shared cpk-ui dialog and returns to the timeline only after the
  mutation succeeds. A soft-deleted item replaces Update with one top-right Restore action so the Deleted Items
  journey remains reversible; it never restores from an inline detail footer. A viewer or non-author member
  cannot open a writable edit form through a typed URL.

## Free-tier advertising

- Development/preview builds use Google's test inventory even when native/JS
  optimization makes `__DEV__` false. Production requires configured real IDs;
  missing/unknown stage must not silently substitute test inventory. Test ad
  callbacks must not report revenue to RevenueCat. Consent and verified Pro
  suppression remain unchanged across build types.

- Advertising is a shared footer of the four authenticated root tabs, matching Martie's proven shell order:
  tab content and bottom navigation first, then one centred anchored adaptive banner, then the device's bottom
  Safe Area.
  The tab bar does not also consume that bottom inset. The banner is never inserted into Monthly's calendar
  or transaction list, and never appears in input, receipt, discussion, invite, export, privacy, deletion,
  authentication, or error routes.
- The native banner remains mounted while eligible so failed loads can retry, but its device-reported adaptive
  height stays collapsed and non-interactive until `onAdDisplayed`. A failed or unavailable ad therefore leaves
  only the required bottom Safe Area, never a blank advertising gap. Returning from the background reloads a
  missing banner, and retries use capped exponential backoff rather than stopping permanently after a small
  count.
- On Android, that mounted slot is scoped to ledger and its measured width,
  not window width: root constraints can make the slot narrower. Wait for its
  first layout before requesting an ad. Rotation passes the measured width to
  the SDK and replaces the old creative so its
  disclosure and action never clip. Height-only changes do not request another
  ad; the replacement slot stays collapsed until its own load succeeds.
- Subscription uncertainty fails toward privacy and paid-user respect: render no ad until both the viewer's
  entitlement and the active ledger owner's entitlement are resolved as Free. Pro-funded invited members
  inherit the owner's ad-free experience.
- The SDK-provided ad surface owns its disclosure and interaction. BooKoo wraps it only for responsive
  centring and spacing; do not imitate a ledger card, add custom copy that looks like an endorsement, or
  apply a ledger accent that obscures the ad boundary.

## Settings and paid-conversion task states

- Settings use one calm information architecture: preferences first, account second, information last.
  Logout and withdrawal live only inside Account; the root never duplicates those actions. The native stack
  header owns the page title and top Safe Area. Page content
  begins directly with useful controls; it does not repeat the route title, add a hero icon, or explain what
  the settings screen is for. Grouped settings screens use a FlashList-backed SectionList with sticky section
  headers. Task-state titles such as PIN creation, plan review, and account-removal review may appear in
  content because they name a step rather than the route. Grouped rows use semantic cpk-ui tokens, 56-point
  minimum targets, continuous cards, and restrained 34-point icon wells instead of repeated outlined buttons.
- Account places an outlined Logout button immediately below the sign-in methods in the scrolling content.
  Only the quiet leave-BooKoo action is fixed at the bottom centre; it has no account-removal section label.
  Korean UI names it `탈퇴하기`, and every other shipped locale uses its natural “leave BooKoo” verb. Legal
  data-removal copy may still say account deletion when describing the actual process. Do not place either
  action beside a filled red square, oversized warning icon, or permanently filled destructive button before
  the dedicated confirmation step.
- A new app PIN is a two-state ceremony with the same visual composition: `Create your PIN` accepts six
  digits, then replaces itself with `Enter it once more`. Confirmation is never shown as a second field on
  the first screen. Reduced-motion users receive an immediate state swap; others receive only a short
  opacity transition. Management, auto-lock timing, and biometric preferences live after setup rather than
  competing with credential creation.
- Pro is a three-step conversion path: compact benefit overview, side-by-side plan selection, then a separate
  final review. The overview uses one short brand line and one unified three-row benefit group rather than a
  large decorative hero or competing feature tiles. Selecting a radio card never purchases. The review is an
  invoice-like summary of plan, exact localized price, billing period, and trial/cancellation condition; the
  App Store purchase action exists only in its safe-area footer, with a quiet route back to change plans.
  Changing state remounts the scroll surface at the top so review titles cannot inherit a prior scroll offset.
  Its benefit group names only the enforced launch value: no ads for the owner-funded household, additional
  owned ledgers, and up to five members in each new ledger. Photos, comments, statistics and export remain in
  Free and must never appear as locked benefits. Reaching five members is an absolute limit state, not another
  conversion opportunity.
- Destructive account removal opens a dedicated review state with one concise confirmation and a link to the
  full removal guide before exposing the destructive action. Do not repeat recovery, shared-record, and device
  effects as separate cards. Empty announcements, FAQ, and operator-denied states use one concise
  state label instead of a generic illustration or coaching copy.
- Diagnostics remains readable rather than exhaustive: the screen shows the latest twelve allowlisted
  events and their total count, while Copy diagnostics retains the full allowlisted snapshot. No account or
  ledger content is added to that surface.
- Language, appearance, currency, auto-lock timing, ledger switcher, and plan cards are
  single-choice lists: each row is a cpk-ui radio, never a checkbox and never an arrow that turns
  into a check. Saving a language must not remount the live form in the new locale before the
  screen has left — apply the locale after the pop settles, or Android Fabric freezes.
- A selection row changes local visual state synchronously. Static choices such as currency must already be
  available when the route opens; any optional asynchronous preparation starts on screen entry, never from the
  row press. Only the explicit Save action performs the profile mutation and navigation.
- Ordinary menu rows use a one-line noun label and, only when useful, a current value. They do not carry a
  sentence that explains the label. Explanatory copy is reserved for permissions, irreversible consequences,
  validation, empty states and recovery. Ledger More contains ledger-specific controls only; it does not repeat
  global language or appearance. Frequent ledger controls stay on More and low-frequency export, deleted,
  request, audit and destructive controls sit behind one `Manage` row.
- Appearance, notifications, lock, language and currency stay under General; Account has one root entry;
  Announcements, FAQ, Customer inquiry, Privacy and data, and About stay under Information. The in-app feedback
  form is removed rather than competing with Customer inquiry. About is only the centred app logo and version in
  the FlashList-backed SectionList header; it has no wallet glyph, tagline, policy rows, support rows, or document
  history. Privacy and data owns privacy-policy, privacy-choice, export and blocked-account controls, while
  Account removal owns the full removal guide.
- FAQ and Announcements both expand inline with cpk-ui Accordion. Neither has a separate detail page.
  Both lists fill the available width with consistent 16-point side gutters on phones and tablets.
  Legal and customer-inquiry documents use the same stack-owned title, sticky grouped sections,
  and selectable text. They omit summary heroes, effective-date furniture, and document-history notices.
  Customer inquiry omits sign-in and legacy-recovery marketing; its single action is `이메일 문의`. Changing the
  dynamic document key remounts its list at the top; a newly opened policy must never inherit another policy's
  scroll position.
- A screen with exactly one completion action uses one shared, full-width bottom action bar. Its visible button
  surface has zero side inset and zero corner radius, and the same surface continues through the live bottom
  Safe Area; do not place a lone rounded button inside the scroll content or above a differently coloured home-
  indicator strip. Secondary escape/change/cancel actions remain quiet rows in the content so the footer keeps
  one unambiguous primary action.
- The bottom action is a sibling of the scroll owner, never its final child. Keyboard-aware screens use the
  app's keyboard-controller viewport with automatic navigation offset: the action moves to the keyboard edge,
  while the scroll/list viewport shrinks and retains enough content extent to reach every field and message.
  While the keyboard is visible, the bottom Safe Area contribution is zero and the action keeps only its
  normal vertical touch padding; never carry home-indicator padding into the keyboard-attached state.
  This rule applies to settings, Pro review, ledger currency/time-zone, category creation, location
  selection, and future single-action forms.
- An asynchronous action replaces its own label or icon with a compact loading indicator, announces busy and
  disabled accessibility state, and blocks duplicate presses. The initiating row alone shows progress for row-
  scoped work. A filled primary or semantic-danger action keeps its intended surface while loading instead of
  flashing to an unrelated disabled grey; failure copy appears immediately above the action or in the affected
  row without shifting the button back into scroll content.

## Text length and overflow

- Category names are compact one-line labels with tail ellipsis (R56), not
  two-line card titles. User-entered create/rename values exclude whitespace;
  existing/preset names are not rewritten. The full name is readable/editable
  in the editor and exposed to accessibility.
- Expanded parallax titles wrap naturally up to two lines (R55). Do not reserve
  two lines or predict the line count. Measure actual content only to align the
  absolute header, list inset and collapse distance. Use 8pt above the title and
  14pt below; sticky state remains one line.

Choose truncation by the text's purpose, never globally in Typography:

| Text surface | Default | Overflow behavior |
| --- | --- | --- |
| Navigation/sticky title; compact author/metadata | One line | Tail ellipsis; preserve the full accessible value |
| Screen/card title; selectable ledger/member name | Up to two lines | Tail ellipsis when full detail/edit access exists; retain intrinsic height |
| Category name | One line | Tail ellipsis; full name available in its editor |
| Comment, memo, invitation note, FAQ/announcement answer, instruction, legal or confirmation body | Full content | Wrap naturally; allow scrolling without a fixed-height clipping parent |
| Amount, input value, button/action label | Full value | Reflow adjacent content or controls; do not ellipsize meaning away |

Give text `minWidth: 0` and a shrinkable lane beside fixed icons, badges and
actions. A detail-only value with no other full-text surface must remain fully
readable. Test long unbroken strings and large system text, not only short
English fixtures. A screen-reader label does not replace visible body text.

## Confirmation dialogs and swipe actions

- Custom cpk-ui dialog title content keeps intrinsic height. Never apply
  `flex: 1` to the root of a title slot whose parent is an unconstrained column:
  it collapses the heading and paints the icon outside the card. Keep the icon
  non-shrinking, let a concise title wrap within its two-line allowance, and retain distinct
  title/body/action spacing at larger text sizes. A semantic label in the
  accessibility tree does not prove the heading is actually painted.
- September 9 reference supersedes the cramped horizontal icon/title trial:
  use a vertical semantic badge → heading → explanation composition, with
  generous, balanced card padding and a clear pause before trailing Cancel /
  confirm actions. Baseline: 28-point insets, 64-point badge, 20-point badge-to-
  heading gap, 12-point heading-to-body gap, and 32-point body-to-actions gap.
  A short landscape viewport may use a compact header; text must still wrap.
  Keep the 88% / maximum 360-point card, not a stretched tablet banner.
- Compose confirmations through cpk-ui `AlertDialog`'s `renderHeader`,
  `renderBody` and `renderActions` slots. Header icons, body content and custom
  buttons are caller-supplied; the primitive owns modal geometry and dismissal.
  Keep a plain title for accessibility. Existing element/string APIs remain
  backward compatible. Preserve custom action sizing rather than overriding it.
- The overlay darkens the underlying page in either theme, never a white veil
  in dark mode. Danger and warning retain their semantic colours. Destructive
  actions still need a concise consequence and explicit confirmation.
- A confirmation never closes from an outside tap and never performs work before its explicit confirm action.
  Captures and exploratory E2E cancel role, membership, deletion, logout and purchase-adjacent actions unless the
  user separately authorizes the state change.
- Controls revealed inside `ReanimatedSwipeable` use Gesture Handler's native button surface, not a React Native or
  cpk-ui pressable that can lose its tap to the parent pan recognizer. The native button receives exactly one content
  child so Jest's Gesture Handler mock and the physical Android gesture path exercise the same accessible action.

## Invitation continuation

- An invitation is a shareable link, not an automatically sent email. The receiving user may open it before
  having a BooKoo account; the public preview names the ledger, inviter and proposed role before any membership
  change.
- If authentication or first-run setup is required, retain the normalized invite code in device-only
  SecureStore for at most 24 hours. After handle and profile setup, return automatically to the same preview at
  the ledger onboarding step. Accepting the invitation completes that step, so a newly invited user is never
  forced to create an unrelated personal ledger first.
- Joining is always an explicit action. OAuth return, process restart and account setup may restore the preview,
  but must never silently add a member. A code is cleared after join/already-member, after a join request is
  submitted, or after a terminal invalid, expired, revoked or exhausted result. One code is resumed at most once
  per signed-in identity during a mounted app session so Back remains usable and account switching cannot loop.

## Brand casing and security claims

- The human-facing product name is always `BooKoo`, with both capital `B` and `K`. App titles, visible dashboard
  display names, store copy, review notes, screenshots, support pages and UI labels must never render `bookoo` as
  the brand. Lowercase remains correct only for technical identifiers whose compatibility depends on exact casing,
  including the Expo slug, npm package name, bundle/package id, URL scheme, host name, storage keys and code paths.
- Store copy may lead with privacy-conscious design only through concrete, reviewable behavior: ledgers are private
  and invitation-based, management actions are role-gated, optional PIN or biometric app lock protects local access,
  and people can export their data or start account deletion. Avoid absolute claims such as “unhackable,” “fully
  encrypted,” or “anonymous,” and do not imply that advertising or store purchase systems collect no data.
- BooKoo is not marketed as open source while its source repository is private and its package is `UNLICENSED`.
  Shipaton's public-repository and open-source-license requirement applies only to the student-only Next Gen Award;
  ordinary store-published categories do not require a repository. A future public repository and explicit license
  must ship before any “open source” claim appears in product or store copy.

## Contextual state surfaces

- A full-screen state begins below the native header and top Safe Area, not at the geometric centre of the display.
  Its first viewport presents a compact semantic symbol, a concrete heading, a plain-language consequence, and the
  next useful action. On iPad, the explanation and contextual visual may form two balanced columns; a phone-sized
  card must never float alone in the middle of a large tablet canvas.
- Empty, unavailable, error, and recovery states are different compositions. An empty day does not repeat the
  selected date and offers the centred Add entry action (with the landscape-tablet
  invitation above when spacious); an empty search preserves the query and suggests
  changing it; lost access leaves the current ledger immediately; an invalid invite explains that the link cannot
  be used and returns Home. Do not expose enum names, internal error codes, cache terminology, deployment names,
  or implementation details as user-facing copy.
- Compact states inside an existing list, calendar, or card are horizontal and contextual. They keep the parent
  screen's hierarchy instead of opening a second hero section. Loading uses skeletons or progress inside the region
  that will be replaced; a lone spinner in a large blank viewport is not a finished screen.
- An empty comment thread stays inside the conversation region: keep the comment-count heading, then pair a compact
  message symbol with either a concrete invitation to add context, a question or a photo, or a read-only explanation
  when the current role cannot comment. Do not leave the entire lower half of an entry detail as unexplained whitespace,
  and do not turn this section-level state into another full-screen hero.
- Connectivity failures keep the user's draft visible and put a short explanation plus Try again beside the affected
  action. A write is complete only after the server confirms it. The UI must never show a queued, pending, or success
  state for a write that exists only on the device.
- State actions meet the shared touch-target, Dynamic Type, dark-mode, and VoiceOver rules. A destructive action names
  its consequence and uses the shared confirmation surface; it is never styled as an ordinary optimistic primary
  action. Long translations wrap without reducing the semantic text size or clipping the action row.

## Localized domain vocabulary

- Translate the product concept, not the legacy key name. `ledger` is a personal or shared ledger/household book,
  and `ledgerItem` is an entry or record; user-facing copy must never expose implementation terms such as “list,”
  “household item,” or a literal database entity name.
- Accept and Reject are opposing membership actions and must remain semantically distinct in every locale. Income
  and expense labels use their financial meanings, including Japanese `収入` rather than `輸入`.
- One state never mixes languages. Empty, validation and destructive copy is reviewed as a complete localized
  sentence, not assembled from translated fragments or inherited legacy machine translation.

## Identity completion and tutorial progress

- A public BooKoo ID is chosen by the user. If the server profile has no handle,
  the signed-in app shell stays visible but is blocked by the identity dialog
  until a valid, available ID is confirmed. A stale completed-onboarding flag
  must never bypass this requirement. Closing the dialog leaves the incomplete
  session; it does not silently assign or skip the ID.
- A display name is optional input, not an optional stored identity. When a
  provider or user supplies no valid name, the server assigns a stable,
  non-sensitive generated name. Empty profile saves regenerate that fallback
  instead of persisting an empty label.
- Tutorial pagination uses one restrained moving progress pill over fixed page
  markers. cpk-ui `PageIndicator` consumes the pager's fractional scroll position
  on the UI thread, including partial swipes and reversal. Never start a second
  timed movement after momentum ends. Only the settled page updates React's CTA
  and accessibility state; rapid Next taps must not finish before the last page
  arrives. Reduced motion snaps to the committed page and disables animated Next
  scrolling. No per-frame React updates or duplicate local indicator geometry.

## Release UI compatibility and device parity

- Ordinary forward navigation reuses the destination with `router.navigate`.
  Settings, profiles, ledger/entry screens and pickers must not stack duplicate
  instances from repeated taps. Keep entity parameters and existing dismiss/
  replace semantics; `push` is reserved for an explicitly documented independent
  instance, with Back-stack coverage. Current routes have no such exception.
  Reused read-only screens must reset their domain selection when query context
  changes (photo/comment/index or statistics month). Key the selected domain
  content, not the whole route; do not apply that reset to editable drafts.
  An already-authenticated return to the home shell targets the canonical tabs
  route, not a redirect shim that replaces into another copy of that shell.

- Inspect pages proactively with `$loop-ui`: capture the running UI, exercise controls and transient states,
  fix verified defects, replay them, then refresh the storyboard. A captured route is not automatically a
  visual or functional pass; retain explicit untested/device-blocked coverage in the run report.
- A parallax ledger title wraps intrinsically up to two lines while expanded, with no reserved second line.
  Its sticky form is one line, leading-aligned beside the hamburger. Header/list insets share the same height.
- Button labels remain complete during press, release and loading transitions. A two-word action losing a
  word is a shared-control regression, not an acceptable pressed effect.
- Contextual outlined actions use the same ledger foreground for text and every border edge. Preserve
  cpk-ui disabled and semantic danger styles; a generic border override must not leave mint edge colors.
- Entry type controls are ordered **Expense, Income**, including statistics filters. This supersedes the
  earlier Income-first request. Tab labels and the amount share one leading content edge; touch padding may
  extend beyond that edge without moving the text. Keep the tabs and amount in one compact visual group.
  In the entry editor, keep Expense fixed and halve the visible label gap: 88-point target cells with no
  outer gap and balanced 8-point horizontal padding retain the previous 72-point text width. Keep a minimum
  44-point touch height. The underline and swipe progress use that same 88-point step; the row/underline
  offsets compensate for the padding so Expense stays aligned with the amount. Do not shrink text or wrap
  English labels to make controls closer. This supersedes the September 7 104-point/16-point layout.
- Full-screen loading occupies the available body below navigation, never a chart-sized or half-width slot.
  Compact empty-state icons and copy align vertically at their centres. An empty month has one message, not
  a duplicate inside an empty chart and beside it.
- The tablet monthly view uses side-by-side calendar and entries only when the current window is wider than
  it is tall. Portrait and square windows put the calendar above entries in the same paginated FlashList.
  Keep the selected month/day owned above the layout branch so rotation does not reset the selection.
- Android startup art and launcher art have separate jobs. The adaptive icon remains mask-safe; the Android
  splash uses the padded transparent BooKoo wordmark at `imageWidth: 280` on navy. Any future splash change
  must be cold-launched on a physical Android device because an in-app preview cannot prove Android 12+
  masking and crop behavior.
- Entry amount input accepts localized decimal numbers only. It normalizes full-width digits, strips letters,
  preserves one locale-appropriate decimal separator, and must still work when Hermes lacks
  `Intl.NumberFormat.formatToParts`. Expense display adds the minus sign after parsing; stored money remains
  integer minor units. The system photo picker opens directly and caps selection at five.
  This is a new-upload limit, not a retroactive read restriction: existing entries created under
  the previous 20-photo cap remain readable without deletion or silent truncation.
- Pasting grouped money preserves its numeric magnitude: grouping is removed
  before the locale decimal is normalized. For zero-decimal currencies, ignore
  fractional input instead of concatenating it into the whole amount.
- Cash-flow signs are derived once from entry type and the stored amount.
  Ordinary expenses are negative, expense refunds positive, and income
  clawbacks negative. Do not discard a stored negative with `abs` or prepend a
  second sign in list/detail/editor. This changes presentation, not stored money.
- After entry creation succeeds, a photo-upload retry owns that same entry ID.
  Editing the draft during retry updates it; it must not create another entry.
- Empty ledger prompts use muted foreground contrast over the selected ledger
  surface. Entered text uses opaque foreground, in both appearances.
- A full-screen picker rendered inside an editor owns Android hardware Back. Back closes the inline picker and
  returns to the unchanged editor; it must not pop the editor route. E2E after a native reinstall must cold-start
  the app before sending a deep link so a stale React context cannot turn setup failure into a false UI result.
- The Pro surface is the native RevenueCat Paywall, not a second hand-built purchase screen. Its hero uses
  the actual BooKoo app logo at a restrained 64pt instead of a large repeated `BooKoo Pro` text heading. One short headline and a
  compact truthful benefit group lead into Annual and Monthly live-price rows, one purchase action,
  renewal disclosure, Restore, Terms, and Privacy. Reuse the real brand asset; do not generate a replacement
  or add decorative hero media. Use a native image component supported by the pinned SDK. Light and dark
  use the same mint CTA and theme-appropriate canvas. Terms and Privacy actions keep explicit nested URL
  payloads for native decoder compatibility. Name the main dashboard configuration
  `BooKoo Pro — Main Paywall`, never `Untitled Paywall`.
- Paywall hierarchy emphasizes the choice and its real billing terms, not the logo. Keep prices and both
  plans readable, one prominent purchase action, and accessible exit/restore/legal actions. Conversion is
  an experiment outcome, not a claim inferred from a nicer screenshot; never obscure renewal terms or
  fake a selected plan to make the default option look preferable.
- Native Paywall acceptance includes visible plan selection, reachable Close/Restore/legal actions and
  correct sandbox outcomes, not only a rendered price. Keep incomplete editor drafts unpublished.
- Plan borders/fills must use RevenueCat's actual Selected override, not permanent Annual styling.
  Remove decorative checkmarks if their conditional visibility cannot be made reliable. Native image
  format fields must use their matching generated assets in both themes; a PNG URL is not a HEIC URL.
- Resolve the signed-in subscription before presenting Pro. Existing subscribers get **Manage subscription**
  through RevenueCat Customer Center, with native store management as a fallback. Never leave them on a
  Paywall-opening loader. After a completed or deferred transaction, show one confirmation-pending state,
  not another purchase button. SDK identity binding, native commerce and sign-out are serialized; server
  entitlement verification alone controls access. Unknown subscription state suppresses ads.
- Tablet statistics follow the same portrait/landscape principle as the calendar: controls/chart above rows
  in portrait or square windows; side-by-side panels only in landscape. Rotation keeps the selected month.
- Tablet layout uses the current window's shortest dimension of at least 600dp,
  not a desktop/media breakpoint or hardware model. A 600dp portrait Android
  tablet must use its full available width. Split windows below 600dp use the
  compact layout; landscape split panes still require width greater than height.
- A UI release is not phone-complete until the same binary is checked on a current iPhone-sized viewport and an
  iPad in portrait and landscape. Check light and dark, keyboard/safe-area behavior, pushed routes, sticky
  sections, empty states, and the native paywall. Tablet whitespace may grow; controls, text width, and touch
  targets may not stretch into accidental desktop UI.

## Efficient evidence-led validation

- Keep the user's original font/display settings as the design baseline.
  Announce temporary accessibility scale checks before changing device-wide
  settings, label their evidence and restore the originals before handoff,
  including an interrupted run. Large-text robustness is not an app-wide
  typography redesign (R57).

- Native-stack detail pages (Members, Categories, Invite links, ledger settings,
  currency/timezone and other detail routes) must not consume the status-bar
  inset a second time below the visible header. `AppScreen` follows the router's
  public `HeaderShownContext`; a visible native header owns the top inset.
  Headerless/custom-parallax pages keep their safe area, and explicit native-sheet
  overrides remain. Verify the first content edge on the device, not only a
  padding constant in source. No negative top margins or device-height guesses.
  Removing the duplicate inset is not permission to crowd the header: detail
  content starts with 20pt of deliberate breathing room (`DETAIL_CONTENT_TOP`).
  A first section heading may contribute part of that total. The initial 8pt
  Members trial was explicitly rejected. Review the hierarchy together: ledger
  heading up to two lines, aligned Invite action, distinct search field and
  whitespace before rows. Icon slots must not inject a colored square.
  Large-font member names must shrink/ellipsis within their own row region;
  You and role badges retain distinct widths and must never paint over names.
  Inspect both the normal and large-text native result after changing spacing.
- Native Android category sheets own their top window inset. Their embedded
  picker/create screens must not add the full-screen status-bar inset again;
  keep the compact header directly below the native sheet chrome. Full-screen
  routes and iOS inset behavior are unchanged. Verify settled sheet captures,
  not just the opening animation or accessibility labels.
  The Android category creation form uses one tall sheet detent so Save is
  visible immediately, including above the keyboard. Do not require users to
  discover a drag gesture to reveal a form's primary action.
  Use the native Android sheet-footer slot for fixed actions; do not combine
  native sheet translation with a second JS keyboard-height reduction. Verify
  the input and the action together, not either control in isolation.

- An information list does not repeat the native route title as its only
  section heading. FAQ questions and announcement titles may occupy two lines;
  default settings labels stay one line. Distinct multi-section headings remain
  sticky. This is domain composition through cpk-ui Typography, not a new row
  renderer.
- Saved appearance must reach native commerce activities as well as React
  surfaces. Android app-only overrides must release to System without changing
  the device-wide setting. A checked System radio is selection evidence, not
  evidence that an immediate transition frame represents the OS appearance.

- UI inspection and functional E2E share one audit matrix and device session.
  Resume pending/invalidated scenarios; do not re-run a whole app after each fix
  or count repeated captures as new coverage. Latest corrections reopen gates.
- Preflight distinguishes native incompatibility, onboarding/sign-in, app error
  and authenticated readiness before navigation. Fix the prerequisite instead
  of waiting for unrelated routes to fail. Preserve user data and use positive
  destination/selection assertions, not fixed sleeps or disappeared loaders.
- Reuse evidence only with its original source/native/configuration identity.
  Final shipping-candidate acceptance remains a fresh full declared-scope sweep.
  Record measured setup/retry time and actual remaining release blockers.

- Every tablet master/detail surface, including Timeline, stacks vertically in
  portrait/square windows; side-by-side is landscape-only. Do not reserve an
  empty detail panel for an empty/loading list. Keep selection across rotation.
- Expanded ledger titles allow two lines; sticky titles use one line beside the
  menu. Short lists still provide the full collapse distance without clipping.
- Intrinsic-width CTA labels remain complete and centered at rest, while held,
  and after returning from a destination. Native painted pixels and AX bounds
  must agree; a matching accessibility string alone cannot close this gate.

- Timeline dates are quiet section labels, not bold table headings. Use regular
  cpk-ui body text in the semantic placeholder color, no bottom rule, and
  24pt top / 16pt bottom spacing aligned with entry-row edges. Preserve the
  server-computed daily net as secondary information and an opaque pinned
  background. Apply the user's reference first to the Android release; do not
  reproduce a low-contrast literal color or replace FlashList pagination.
- Entry detail metadata text fills its available row width beside the icon.
  Long category names and date/time labels may wrap, never paint beyond an
  intrinsic-width box or lose the trailing time in tablet split view.

- Category identity editing has three explicit controls: name, color and a
  searchable, grouped icon catalog with a live preview. Use the same domain
  fields from category management and Entry creation. Expense and Income
  remain separate (the user's briefly suggested unification was withdrawn).
  Keep catalogs bundled locally and synchronize saved identities through the
  shared ledger backend; do not introduce a device-only category database.
- A draggable collection is not an inline keyboard form. Category Add/Edit
  opens a dedicated scrolling form, with one keyboard-resize owner and an
  accessible Save action above the IME. Keep management actions Edit/Archive,
  preserve drag ordering and kind on return, and show the actual saved color
  and icon. Cancel must not write; failure retains the complete draft.
- Async actions keep their native parent hierarchy stable through press,
  disabled and loading states. On successful Save + navigation, do not reset
  loading on the detaching screen; only failure restores editable/idle state.
  Verify repeated saves with the keyboard present in optimized Android builds.
  A live process or a passing JS test does not prove the native surface survived.
- Category ellipsis actions transition open and closed through cpk-ui's
  controlled Accordion. Use one expanded row, independent edit/drag targets,
  one mounted body, and reduced-motion support; verify interrupted toggles and
  scrolled rows on native, including saving after menu navigation.
- Agreement copy and legal links share a single text flow. Let the text engine
  wrap at the available width, without manual breaks, nonbreaking-space hacks
  or separate flex siblings. Preserve localized prose and tappable link roles.
- Email sign-in shows `hello@gmail.com` as its empty-state placeholder in the
  shared input's muted placeholder color. It is not an initial value, stored
  address or automatic recipient. Retain the Email label and email keyboard.


## September 30 — purposeful details and restrained selection feedback

The owner preserves the main screens and ledger creation layout. Improve their
interaction feedback without rearranging the composition. A committed colour or
icon choice may briefly grow its identity mark and settle with a small spring;
unchanged selections, initial rendering and background query refreshes stay still.
Motion belongs to cpk-ui, uses transform/opacity on the UI thread, and respects
system reduced motion. Fast repeated choices must cancel obsolete motion.

Invitation and other supporting details should read as BooKoo's community
workflow, rather than a repeated large decorative icon, heading and card stack.
Lead with the actual ledger identity and the next useful action. Put role and
capabilities together, use continuous sections for supporting facts, and retain
complete consent, expiry and privacy information. Never invent members, activity
or status for visual decoration. Preserve accepted dialogs and native header
spacing; redesign detail composition rather than globally changing typography.


## October 1 — perceptible, causal motion and complete acceptance

R71: The owner requests noticeable impact in deliberate selections and important
transitions, while retaining September30's restraint and approved main/create
composition. Evaluate the actual optimized native motion before tuning magnitude
and settling time. A completed choice should feel crisp and connected to the
selected identity; repeated choices, data refreshes and navigation must not cause
unrelated bounce. Respect native reduced motion and interrupt old feedback.
Whole-screen acceptance includes the supporting pages and reachable states,
actual landscape pixels, large text and paginated scrolling. Unit tests or
focused screenshots alone cannot mark the whole app complete.


## October 1 — lively calendar selection and causal UI feedback

R72: The owner explicitly requests a little rising, spring-settling circle when
a calendar day is selected, and more life throughout the app. This authorizes
clearer deliberate-selection motion beyond identity editors. Keep the calendar
layout, money, day labels and tap targets stable; animate the selected circle
without moving neighbouring days or the whole grid. Rapid changes interrupt old
motion; tapping the current day, initial render and month/query refreshes do not
replay it. System reduced motion preserves instant, legible selection. Review
other disclosures, pickers and successful actions for causal feedback while
preserving platform navigation and approved main/create composition.

R73: Calendar selection ink must fit the measured column at the peak of its
spring, including large system text. Cell height is not the available circle
diameter. cpk-ui owns the measured ink bound and exposes it to custom day
renderers; BooKoo only caps its domain mark to that bound. Keep row spacing,
date labels and touch targets stable rather than shrinking the complete grid.
The Android font-scale2 regression was reproduced and replayed on native.


R74: Bounded numeric calendar marks, YYYY.MM headings and short tab labels
must retain their intended type size at supported Dynamic Type settings.
Do not combine native auto-fit with a fixed line box for these predictable
labels: iOS can collapse the ink to a few pixels while the target stays large.
Keep the existing 1.25 control scaling cap and natural text measurement, use
cpk-ui Typography for the domain date numeral, and reserve the picker weekday
row independently. Date-picker heading scaling must leave the grid readable.
Verify selected, unselected and motion-peak states in native large text; a
standard-font settled screenshot cannot close this gate. Entry markers stay
inside the bounded date circle at every supported scale; pin their bottom
inset rather than allowing enlarged line boxes to push them out.

R75: Compact member swipe actions use short, familiar verbs and role names.
Do not let a long role name split inside a word in an 84pt action. The English
actions use “Make admin” and “Remove admin”; the confirmation body still spells
out the permission change. This is a domain-copy refinement under the owner's
whole-app detail polish request. Keep gesture geometry, targets and confirmation
guards intact; do not shrink text to hide the problem. Native Galaxy dark and
Android tablet light captures replay the original wrap and corrected action.


R76: Deliberate calendar selection feedback belongs to the visible pager slot.
Preloaded neighbour pages can repeat month-boundary dates; they must not
consume the shared selection intent or steal the visible circle's spring.
Keep the existing pop size, reduced-motion behavior and quiet repeated,
initial and programmatic selections. Regression evidence must include the
first and last week of a month, alongside a middle-month choice. cpk-ui owns
this visibility rule for default and domain day renderers.

R77: Selecting calendar dates must not blink the Add entry action. When the
bounded day rollups already confirm an empty selected date, keep that action
mounted while its paginated query resolves. Unknown or populated dates still
show genuine loading; never retain another date's financial rows. Selection
feedback stays on the selected circle and does not replay on the action.

R78: A ledger description is optional user input in creation and editing.
Only a nonblank title gates creation; blank descriptions persist as an empty
string under the existing server contract. Mark the description prompt as
optional in every locale without changing the approved creation layout.

## October 9 — English first in store presentation

R79: English is the first-priority store language. Google Play's default
listing language is `en-US`; its title, descriptions and visual assets supply
the fallback for languages without a listing. Retain localized titles and
assets for supported user languages, including Korean. Verify the explicit
default-language setting and localized public titles; a Console dashboard
heading alone does not establish correct internationalization.

## October 9 — legacy-inspired store cover

R80: The owner prefers the legacy BooKoo gallery over the current flat,
headline-heavy treatment, especially its first panel. Use a quiet mint cover
with the exact white pig/B mark, generous upper space, a large angled white
phone and a matching phone partly entering from the upper right. The first
panel needs no benefit headline. Show the real calendar inside the devices;
preserve native UI pixels and proportions. AI composition exploration is
acceptable, but final store UI must come from inspected native captures.
Following panels use the existing navy background, lighter short captions
and consistent upright white frames. English remains the first-priority
version under R79; supported languages keep their own actual app captures.

## October 9 — store gallery order from owner captures

R81: Start with the separate mint intro, then follow the owner's supplied
captures in this exact order: calendar, timeline, statistics, entry, sharing,
comments, theme. The intro's calendar texture does not replace the separate
calendar feature panel. Keep eight panels per locale; a dedicated categories
panel is omitted from this sequence. Apply the same order to all supported
store languages, with English first under R79. Preserve R80's visual treatment
and authentic native UI while changing positions and numbered filenames.

## October 9 — receipt scan at the tab row's trailing edge

R82: In the entry editor, put the receipt scan action at the far right of the
same horizontal row as Expense and Income, after Income. Keep it above the
amount field. Do not put the scan action in the photo section. Ordinary photo
attachment remains the separate plus action; OCR runs only after explicitly
choosing receipt scan and still requires review and Apply. Preserve the tab
geometry and a 44-point action target. Narrow windows and large system text
may use a short localized action label with the full accessibility name;
never hide either transaction tab or move the action onto another line.

R83: iOS receipt recognition follows the user's device language preferences.
Choose the first preference supported by Apple Vision, preserving its script
and region when available, then add English only as a receipt-text fallback.
Do not alphabetically reorder priorities or request every language. The iOS
app uses system Vision; no separate ML Kit language models are bundled there.

R82 native visual verification: pass the form's ledger accent explicitly to
BookooButton so its outline and caption agree. Japanese and Italian action copy
must use concise receipt wording that fits the existing tab geometry without
truncation or shrinking text. Final five-locale native form captures verify it.

## R84 — all Apple families and locales share the current gallery (2026-10-09)

The owner rejected inherited Apple screenshots in1.1.0. R80/R81 applies to
iPhone, iPad and iPhone Duo, with English primary and all existing Apple
localizations. Use authentic native captures for each family and proportional
composition; never relabel Android or resized-phone pixels as a Duo/iPad test.
Verify uploaded image digests and order before review. New header/search
creative uses the same mint pig/B and quiet navy visual language. Test Duo
opened/closed/rotated transitions on its actual simulator and record the SDK
and device proof separately from artwork generation.

## R85 — compact receipt scan action (2026-10-09)

The owner finds the Scan receipt button's horizontal and vertical whitespace
too large. Fit its width to its localized label instead of stretching into
the row's remaining space. Use 6-point horizontal and 4-point vertical padding
with a 34-point minimum visible height; extend only its vertical hit area by
5 points per edge to retain a 44-point touch target. Keep R82's far-right
Expense/Income row placement, concise narrow-window label, ledger accent and
explicit OCR flow. Use the existing cpk-ui Button style slots, not a second
button implementation.

## R86 — folded focus and unfolded auth illustration (2026-10-09)

The owner requests actual folded/opened Duo previews and a considered image in
sign-in's empty right-hand area. Use one generated, transparent mint/white
piggy-bank and ledger illustration in the wide sign-in, email and OTP layouts.
Keep one live form and one action set mounted while the window changes size;
show the decorative panel only when the existing tablet window threshold and
scaled form width leave room. Folded/short phone windows retain focused,
scrollable authentication. No baked-in wording, fake app interface or duplicate
legal copy in artwork; all locales share the asset. Safe-area side gutters use
the page background; a bottom-action accent paints only the bottom inset.
Verify actual fold, unfold and rotation with typed input, keyboard and large
text rather than resizing an image of a phone.

Landscape verification must use the device's real landscape window. A temporary
portrait `wm size` override inside a landscape emulator is not landscape evidence;
restore test density/size before showing the owner a preview. Authentication's
keyboard avoidance applies on Android as well as iOS: a centered wide form must
keep its completion action above the keyboard or reachable by touch scrolling.

Keep the focused field and its following completion button above the keyboard
when a fold or rotation reduces the window height. Use the existing keyboard
controller's focused-input scrolling and layout synchronization, with clearance
that follows font scale; do not duplicate form state or store keyboard geometry.

R86 accessibility follow-up: auth command text must retain its complete scaled
line box at the maximum supported system text size. Configure cpk-ui's existing
text slot using the shared auth field line metrics; retain one public Button
implementation. Native folded portrait and opened landscape must keep the
focused value and following action visible with the software keyboard. Restore
QA display/font overrides to their original settings after verifying them.

## R87 — compress artwork without changing store pixels (2026-10-10)

The owner requests small images and WebP when both native platforms support it.
Use one compressed transparent WebP for the shared auth illustration, with real
iOS and Android render verification. Keep store assets in the format accepted
by each upload slot. Optimize PNG losslessly before writing the final manifest
and upload hashes; do not enable palette quantization or repaint native UI.

## R88 — use the same localized title on both stores (2026-10-10)

The owner requires Android store titles to match the current iOS titles in each
shared locale. English remains the default. Canonical localized names come from
`store-assets/metadata/*.json`; both platform adapters use them.
Apple names in the existing metadata are authoritative; Google names must match
exactly. Verify live store values and enforce equality in the metadata gate.

October13 owner-approved Korean title: `BooKoo 부쿠 - 공유 가계부` on both
stores, derived from store-assets/metadata/ko.json. Keep English as default.
Restore existing de/fr/es/it Play manual copy from the same locale JSON owners;
this initial step preceded the separate owner-authorized global copy update.
The October13 instruction to change all necessary store copy now adopts the
English expense-tracker and localized shared-expense names in the same canonical
JSON files. `store-assets/store-locales.json` owns13 Apple/15 Play aliases for12
copy owners; text-only additions inherit English artwork and do not add native
UI languages or replace existing image galleries. Record
each platform's saved/review/public transition separately while approvals
complete; canonical target names remain equal.


## R89/R90 — localized money and keyboard layout (2026-10-10)

Native localized-gallery inspection exposed a clipped long currency total in
stats. Preserve the full formatted money string and accessibility value; fit
one line within70% of the donut width through cpk-ui Typography's public props.
No shortened amount, alternate total or new chart primitive.

The R86 keyboard experiment's128pt clearance is superseded by24pt caret
clearance plus the keyboard controller's layout mode on iOS. The centered form
must reflow when the keyboard appears; a second iOS padding owner can blank the
form during scrolling. Retain verified Android parent padding/insets behavior.
Use one mounted form and its public focused-input/layout synchronization. A
short window or large text may scroll or dismiss the keyboard to complete the
form. Record native scope and restore QA text/window overrides; never claim
whole-app maximum-text acceptance from the standard-font replay.

## R91 — center entry tab labels over their underline (2026-10-10)

Expense and Income labels must share the horizontal center of their touch
cell and the narrower selected underline in every locale, including Korean
and Japanese. Preserve the 88-point step, 44-point touch height, swipe
progress, Expense-first order and compact trailing receipt action. The
amount keeps the form content edge; remove the old tab-only negative inset.
Current store imagery must use the selected gallery and native captures
with the receipt action present; historical pre-OCR cover candidates are
not current product proof.

## R92 — give the wide store logo its own space (2026-10-10)

In landscape store header/search artwork, place the original white pig/B mark
in the upper-left green space with generous distance from the phone silhouette.
Keep its scale, native calendar textures, phone arrangement and mint background.
Apply this shared composition to every localized wide creative; portrait gallery
covers retain their existing composition.


### October 14 — native purchase authentication and failure feedback

Keep checkout busy while the native store owns Touch ID/password authentication.
Do not substitute a clock timeout for a completed or deferred transaction. A
native failure restores the same plan controls with localized retryable feedback;
confirmation-pending remains for store deferral or receipt verification. The
canonical owner is `src/features/subscription/provider.tsx`; the paywall consumes
its outcome and reactive Convex entitlement.


## Purchase confirmation feedback (October15)

A valid store purchase must not remain labeled as an unspecified wait when
the server has identified an account restriction. Display the specific test
account or account-link recovery instruction with Restore and native Manage;
keep repeat-sale controls hidden. Reactive verified Pro activation clears the
confirmation page. An empty explicit restore resets a stale pending page, while
a failed or cancelled retry preserves its recovery controls. Never show purchase
success from the native success sheet alone; server proof/binding owns access.


## Store update messages (October22)

Lead public store release notes with the verified user benefit. For native
maintenance and SDK replacements, use concise localized stability/usability copy
(“앱 안정성과 사용성을 개선했습니다.”), without leading with ad-vendor internals.
Do not invent a feature or fix. Privacy notices and technical App Review evidence
retain the complete, factual SDK and data-processing details. The store metadata
JSON files remain the canonical owner of localized release messages.


## Public product website — October24 owner correction

The owner rejected the generic AI-looking landing page and cited SECOND ROUND
as a standard of product-specific visual craft. BooKoo must use its own mint,
navy, original wordmark and actual synthetic native screenshots. Short editorial
headlines, deliberate type scale/line breaks and generous composition lead;
search titles remain metadata rather than becoming long hero headings. Store
links have recognizable platform symbols and intentional download treatments.
Avoid generic pill-button collections, floating feature-card grids, fake app UI
and decorative gradients unrelated to the ledger. Legal/support pages share the
same typography and navigation while retaining readable document proportions.
All twelve languages must work; factual claims, SEO and accessibility survive.


## Banner network recovery — October27

The banner's network state is native internet reachability, not the backend's
WebSocket status. A known outage pauses SDK refresh and cancels queued manual
retries; unknown reachability still permits an attempt. Retain a creative that
is already displayed. On reconnect, resume refresh and request only a missing
creative, once, when active. Background reconnect waits for foreground. Empty
or failed ads still reserve no advertising height, and Pro suppresses ads.
No supply or production fill-rate promise follows from client recovery.
