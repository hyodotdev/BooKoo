# Screen and interaction inspection

Use this checklist during the page walk, not as a substitute for looking at the
screens. Apply the latest durable product rules when examples here are superseded.

## Visual checks on every distinct layout

- **Hierarchy and copy:** one title and one clear primary action; no repeated
  dates, field labels/placeholders or explanatory paragraphs saying the same
  thing. Retain essential financial, permission and destructive-action context.
  English copy is concise and natural; removed UI leaves no orphan i18n keys.
- **Text:** long names, two-line headings, localized labels and enlarged system
  text do not clip. Empty fields use placeholder contrast; actual values use
  foreground contrast. Test real input, not only the placeholder screenshot.
- **Spacing:** balanced top/bottom touch padding, icon/text vertical centering,
  aligned left edges, separation between search and section labels, no duplicate
  header/Safe Area inset. Keyboard and bottom actions must not cover content.
- **Touch states:** rounded hit/underlay bounds and accessible target size;
  readable pressed, disabled and loading states; complete labels throughout
  press/release. Explicitly press and hold multiword intrinsic-width buttons.
- **Motion:** indicators move with the gesture; interruption/reversal/rapid taps
  preserve state; reduced motion still communicates selection. Parallax long
  title fits up to two expanded lines, then one sticky line beside the hamburger.
- **Theme:** ledger identity uses the same swatches in light and dark; contrast
  comes from semantic foreground/surface tokens. Tab/ad backgrounds remain
  opaque. Retry must look actionable. Loading follows contextual brand color.
- **Loading and emptiness:** full-screen loading is centered in the available
  viewport, not a zero-height list header or top chart slot. One short loading
  label sits below it. Compact empty-state icon and copy have matching vertical
  centers; no fake skeleton after loading, duplicated empty chart or giant gap.
- **Responsive:** tablet portrait/square places the calendar above entries;
  landscape alone can split them. Rotate with a selected month/day and draft.
  Inspect split-screen/window resizing and larger text when supported; platform
  capability differences are documented, not silently treated as passes.

## Recurring defect classes (found after release, 2026-11-01)

Each of these reached a store candidate before a person noticed it. Check every
layout for all of them; a single page passing does not clear a class.

- **App language vs system language.** Run at least one phone and one tablet
  pass with the system language different from the app language (for example
  a Korean device with English selected in the app). Native date/time pickers,
  alert buttons, action sheets and permission or share prompts must read in the
  app language or be unmistakably system chrome. Every `Alert.alert` passes
  localized buttons (`showNotice` from `~/utils/alert`); a button-less alert
  shows "OK" in the system language on iOS and in English on Android.
- **Dialog actions.** Dialog buttons fill their action slot, and their labels
  are centered horizontally and vertically, at default and the largest text
  size. Notices and helper text follow the alignment of the body they sit in.
- **Tablet columns and sheets.** On tablets, footers, bottom actions and
  full-width buttons line up with the card column above them, in portrait and
  landscape. A grid inside a form or page sheet sizes from the sheet's measured
  width, not the window: a 512pt iPad sheet given six window-width columns
  ellipsized its labels.
- **Line boxes.** An input or text whose font size is overridden also sets a
  line height at least that large. Zoom into placeholders and typed values for
  cut ascenders (the bar of "T", the dot of "i", the tops of "l", "d", "f").
- **Record states.** Deleted, restored, archived, read-only and pending
  records say so where they are opened and offer the in-place recovery action.
  A deleted entry must never look live.
- **Copy consistency.** Controls in one group share capitalization
  (All | Expense | Income, never All | EXPENSE | INCOME). A field's visible
  label and its placeholder never say the same thing. First-run copy
  (tutorial, onboarding dialogs) is read in every shipped language, not only
  English; machine-translated or lower-case titles are defects. A page title,
  its section heading and its empty state do not repeat one sentence.
- **Largest text size.** Run one phone pass at the largest supported text size
  (iOS accessibility sizes, Android font scale 1.3). No word or amount may
  break inside itself ("Wee / ke…", "$12,34 / 5"), and no control label may be
  cut by a fixed height. Amounts fit one line; compact controls and grid
  labels keep the 1.25 cap; ledger-title and name headings keep the 1.35 cap;
  fixed-size pills grow with their label; settings-row titles may wrap.
- **Fixed-width cells.** Icon and category grids size their cells from the
  measured row, wide enough for the longest preset word on one line. A fixed
  narrow cell either ellipsizes ("Mainten…") or splits words ("Maintenan /
  ce fee"); both are defects.
- **Android system chrome.** On Android, check the bottom action sheet and any
  bottom bar against the navigation bar (no row under it) and in dark mode
  (no white sheet). Native Android date/time dialogs follow the device
  language, not the app's: compare them with the app language.
- **Korean line breaking.** Wrapped Korean keeps its words whole on iOS
  ("있어요", never "있어 / 요"); cpk-ui Typography sets
  `lineBreakStrategyIOS: "hangul-word"`, so plain `Text` must do the same.
- **Translations, not just strings.** Screenshots catch only the keys a pass
  reaches. Once per audit, compare every key the code uses in each shipped
  locale with English for meaning (a login titled "sign up", "Leave?" asked
  as "Stay?"), script (Korean inside the Chinese file) and shared labels
  reused with a different sense ("Update" on a refresh row).
- **Lists without day headers.** Search results, stats drill-downs and
  Recently deleted rows show each entry's date; a memo alone does not say
  when. Times use the app locale's clock everywhere an entry time appears.

## Functional gates by surface

| Surface | Exercise and inspect |
| --- | --- |
| Launch/auth | Cold start, uncropped splash, provider return, validation, cancellation, required username, logout and lock recovery. Never clear user data to get a clean screenshot. |
| Monthly/list/stats | Month/filter changes, selected day, empty/populated months, Add entry before/during/after press, expanded/sticky header, pagination past page one, totals and drill-down. |
| Entry editor/detail | Expense then Income; numeric-only input including paste and decimals; reject `1000a`; appropriate currency precision; expense minus sign; category/date/memo; draft preservation; save/error/retry and detail values. |
| Icons/ledger editing | Bordered search with leading icon, separated section title, selected rounded cell, balanced padding, empty/value contrast, long ledger title and shared palette. |
| Photos | Direct system picker, cancel, maximum five, upload progress/failure/retry, thumbnail → exact original, removal, return to unchanged draft. Use synthetic media only. |
| Location | First-open current location, denied permission, actual map tiles, search → pin, move pin → select address/coordinates, reopen same position, cancel and Back on iOS/Android. Map-unavailable fallback is not a working-map PASS. |
| Settings/detail pages | Every menu link and Back; pinned section headers; no unexpected top gap; instant currency/language selection; persistence after save; FAQ/announcements/privacy pagination and error/retry. |
| Account/about/support | Outlined Logout near account content; quiet Leave centered at bottom, no duplicate section label; About logo/version; concise contact action. Cancel real destructive/email actions. |
| Collaboration | Synthetic comments, empty copy, send/loading/error, pagination, member permissions, invitation creation/acceptance only with authorized test recipients. |
| Pro/native surfaces | Live offerings/prices, native paywall layout on phone/tablet, close and failure. Sandbox purchase/restore/cancel only when environment is confirmed; prove entitlement and ad behavior separately. |

## Evidence record

Keep one dated run report, with a compact row for each actual tested combination:

| Page/state | Device/theme/orientation | Action | Verdict | Evidence | Observation |
| --- | --- | --- | --- | --- | --- |
| Monthly / Add entry held | Android phone / light / portrait | Hold then release | FAIL | inspected before capture | Second word disappears while held. |

Record viewport/font scale and exact source/native provenance in the report
header, and per-row overrides when they change. Add before/after paths, regression
checks, and unresolved blockers per finding. This example is a regression case,
not pre-filled proof for a future run. An action that opens the next page must
also show the resulting page; the starting screenshot alone cannot pass it.

Separate app defects from infrastructure limitations. A blocked map key or
store sandbox is still an unverified product flow and remains visible in the
release handoff. Restore temporary device settings and test delays after use;
do not remove fixtures or evidence owned by another task.
