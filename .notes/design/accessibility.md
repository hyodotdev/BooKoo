# BooKoo — app-wide accessibility contract

Status: **normative D6 contract** (2026-08-24). This document resolves G39 and overrides component-local
defaults where they are weaker. Accessibility is a release gate, not a post-launch enhancement.

## 1. Text, reflow, and truncation

All user-facing text uses BooKoo/cpk text primitives with `allowFontScaling` enabled. Body, headings,
labels, form values, errors, buttons, and legal copy have no `maxFontSizeMultiplier`. Dense geometry may
cap only Calendar/day numbers and chart annotations at **2.0**, and must expose the same information in an
uncapped adjacent/list representation. No control caps below 200%.

At font scale ≥1.6, horizontal item/member/settings rows reflow vertically; trailing amount/action moves
below the label rather than truncating. Calendar hides secondary visual totals before shrinking the day
number, while its spoken label remains complete. Forms use natural-height labels/errors and scrolling;
`numberOfLines={1}` is limited to decorative/dense labels with a full accessible name. Korean/Japanese/
Simplified Chinese and Indonesian/English are tested at largest accessibility sizes on the smallest
supported phone and tablet split panes.

The app never assigns global `Text.defaultProps`; third-party/cpk internals remain untouched. Shared
`AppText`, `AccessibleAmount`, `FormField`, and button wrappers encode the defaults and forward all native
accessibility props.

## 2. Touch, keyboard, and focus

Every interactive target is at least 44×44 pt on iOS and 48×48 dp on Android. `hitSlop` may satisfy the
target only when it does not overlap a sibling target; icon-only controls always have a visible pressed/
disabled state and an explicit accessible name. Destructive actions name the object (“가계부 삭제”), not
“확인.”

Focus order follows visible reading order. Opening a screen focuses its header only when navigation would
otherwise strand focus; opening a modal/sheet moves focus to its title, traps it within the modal, and
returns it to the invoking control on close. Validation moves to the first invalid field and announces the
error without clearing user input. Loading/success/error changes use a polite live region; destructive or
session-blocking failures may be assertive. Hardware keyboard Tab/Shift-Tab, Enter/Space activation,
Escape/back dismissal, and visible focus are required on tablet/web-capable surfaces.

## 3. Spoken financial semantics

Color, sign, position, icon, chart slice, and haptic feedback are never the only meaning. One item-row
accessibility element announces, in the viewer locale:

```text
{expense|income|refund|clawback}, {absolute localized amount and currency},
{category}, {author or blocked-user placeholder}, {ledger-zone full date and time},
{comment/photo counts when nonzero}, {pending|deleted|needs-review state when applicable}
```

It does not read raw minus characters or a currency symbol without the currency name when ambiguous.
The value/hint describes activation (“항목 세부정보 열기”) separately. Amount inputs announce the entered
minor-unit value after a short debounce, not every formatting character. Expense/income segments expose
role, selected state, and text labels. Category icons always have a localized label.

Charts expose a concise summary plus a focusable data table/list with every category/period, amount,
percentage, and “Other” composition. The table is the functional alternative for exploration and drill
navigation; an accessibility-hidden Skia/SVG drawing never contains the only data. Trend direction and
positive/negative state are spoken, not inferred from red/green.

## 4. Screen-specific rules

- **Calendar:** every day is one button with full date, today/selected/disabled state, item count, and
  expense/income/net summary. Weekday decorations and dots are hidden from screen readers. The default
  `maxFontSizeMultiplier` is 2.0, not the old 1.6. Month changes announce once after commit.
- **Entry form/keypad:** visible field label is programmatically associated with the input. The custom
  keypad buttons announce digit/action names and disabled state; Delete and refund/clawback are explicit.
  Save announces success only after the server commits. A disconnected attempt announces the connection
  requirement, preserves the draft and exposes a named Retry action.
- **PIN/app lock:** one real secure `TextInput` has localized label, six-digit requirement, digit-count
  value, submit/error state, and password semantics. Six visual boxes are hidden from accessibility.
  Biometrics, Forgot/Sign out, lockout countdown, and Retry remain reachable. Digits are never spoken.
- **Photos:** receipt images use “영수증 사진 N/N” plus authored alt/context available in the UI; OCR text
  is not invented. Pager position changes announce once. Zoom gestures have accessible zoom controls.
- **Block/report/update/maintenance:** state, consequence, target, and next action are explicit; no blocked
  identity leaks through nested labels.

## 5. Motion, contrast, and sensory alternatives

One `AccessibilityPreferencesProvider` reads and subscribes to `reduceMotionChanged`, screen-reader,
high-text-contrast/darker-system-colors, and platform cross-fade preferences where available. Reduce
Motion replaces parallax/springs/shared-element movement with zero-duration state changes or a short
cross-fade, stops skeleton pulses, and keeps focus stable. It never removes progress/state feedback.

All normal text and meaningful icons meet WCAG AA 4.5:1; large text meets 3:1; controls, focus rings,
chart marks, category/ledger indicators, and selected boundaries meet 3:1 against adjacent colors. The
six ledger accents and fifteen category colors are tested in light, dark, high-contrast, grayscale, and
selected/disabled states. Color meanings also have text/icon/pattern. Dark mode is not treated as a
contrast guarantee.

Haptics have visual and spoken equivalents. Audio is not required to complete any task. Timeouts are
absent from forms/modals; OTP/invite/session countdowns display remaining time and provide the documented
retry/recovery path.

## 6. Testing and release evidence

Component tests use `@testing-library/react-native` for accessible name, role, state, value, hint,
hidden descendants, live regions, and focus return. Minimum mandatory fixtures are item row,
`AccessibleAmount`, amount keypad, day cell, chart data alternative, entry validation, PIN input,
connection-required write state, block/report sheet, and maintenance/update screens.

Automated render checks cover both themes, phone/tablet widths, five locales, font scales 1.0/1.6/2.0/
largest OS setting, Reduce Motion, and high contrast. Storybook/a11y automation may be added by D7/I4,
but no document may claim it passes until the script and package exist.

Before every release, a named tester records a manual matrix on a physical iPhone/iPad and Android
phone/tablet:

- VoiceOver/TalkBack linear and explore-by-touch navigation;
- largest text, zoom/magnification, bold/high-contrast/invert/grayscale, Reduce Motion;
- switch/hardware keyboard access to sign-in, create/edit, calendar, item detail, report/block, export,
  update, and account deletion;
- orientation/safe-area/keyboard behavior and no trapped/vanishing focus.

Any inability to sign in, enter/read an item, understand money direction, navigate the calendar, report/
block, update, export/delete, or unlock is release-blocking. Cosmetic clipping with a complete accessible
alternative is still fixed before store screenshots are made.

## 7. Primary references checked 2026-08-24

- React Native [Accessibility](https://reactnative.dev/docs/accessibility) and
  [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo) document roles/states/live regions,
  focus events, Reduce Motion, screen-reader, and contrast preference APIs.
