# Design — `<Calendar>` for cpk-ui, and the BooKoo `<LedgerCalendar>` wrapper

> Status: **final design, ready to implement**.
> Inputs: `.notes/DECISIONS.md`, `.notes/research/01-legacy-features.md` §5.8/§6.8/§6.9,
> `.notes/research/03-legacy-calendar-spec.md` (whole), `.notes/research/11-cpk-ui-api.md`
> (§4 tokens, §7 contribution gates, §8 local dev), `.notes/research/12-kstyled-api.md`
> (§5 perf contract, §6 gotchas), `.notes/research/13-convex-scale.md` §5.1 (`ledgerDayRollups`).
> Legacy sources are read-only at `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/`.
> Target repo for the component: `/Users/hyo/Github/crossplatformkorea/cpk-ui`.

---

## 0. Decisions that changed since note 03, and why

Note 03 §10 proposed an API. Six things are **deliberately different** in this final design. Each
change is here because it makes the component cheaper, smaller, or a better library citizen.

| # | Note 03 proposed | Final decision | Why |
|---|---|---|---|
| C1 | `visibleMonth` / `onVisibleMonthChange` | **`month` / `onMonthChange`** | Shorter, matches every other calendar library's vocabulary, and `visible*` implied a viewport concept the component does not have. |
| C2 | `weekStartsOn: WeekStart` | **`weekStart?: WeekStart`**, default resolved from `locale` | Keeps the legacy prop name (zero-friction port of `Tab1`), and making it optional lets the locale supply the correct default instead of hard-coding Sunday. |
| C3 | `locale?: import('date-fns').Locale` | **`locale?: string`** (BCP-47 tag) + **`formatters?: Partial<CalendarFormatters>`** | **cpk-ui gains no date library at all.** A UI kit forcing a `date-fns` peer dep on every consumer is a real cost (cpk-ui's peer list is 7 entries and CI runs `check-peer-deps`). All calendar arithmetic the component needs is ~60 lines of dependency-free integer math (§3.1); all *localized text* comes from `Intl.DateTimeFormat`, which Hermes ships on both platforms. BooKoo still uses date-fns everywhere else and can inject its own formatters. date-fns stays in cpk-ui as a **devDependency test oracle** (§4.5). |
| C4 | `isDateDisabled` predicate only | **`disabledDates` (set/array, normalized once) + `isDateDisabled` predicate** | `disabledDates` is the 95 % case and is O(1); the predicate stays as the escape hatch. Precedence is defined in §2.6. |
| C5 | `mode: 'month' \| 'week'` as two unrelated page models | **`mode` + `collapseProgress` (Reanimated `SharedValue<number>`), with week view rendered as the month grid clipped to the active week** | BooKoo Tab1 needs a Google-Calendar-style month→week collapse driven by the parallax header's scroll (`01-legacy-features.md` §5.8/§6.8). Making the transition a pure height + `translateY` interpolation over the **same mounted cells** means the collapse costs zero re-renders and zero remounts. §3.4. |
| C6 | `size?: 'compact'\|'regular'\|'expanded'\|number` sets the *cell edge* and the column width | Same prop, but it sets **row height only**; column width is always `flex: 1` | Removes width from every day-cell prop, so a container resize (rotation, split-view, tablet sidebar) never re-renders a single cell. §3.3. |

Everything else from note 03 §10–§11 stands, including: the controlled-first contract, `markers` as
an O(1) map, at most 3 pages mounted, no `onChange` on mount, `isSameDay` (year included), fixed row
height with no measure pass, frozen palette passed down, and the full defect list D1–D23 as
acceptance criteria.

---

## 1. What the component is (and is not)

**Is:** a pure presentational, fully controlled month/week grid. It owns no application state, knows
nothing about Convex/zustand/Redux, fetches nothing, and renders no modal.

**Is not:** a date *picker* dialog, a range picker (v1), an agenda/timeline view, or a data source.
Note 11 §9.7 is explicit: cpk-ui ships no list/virtualization primitives, so "fast with unbounded
data" is an app-side property. The Calendar's contribution to that property is that it accepts
**already-aggregated** per-day decorations and never iterates anything unbounded.

---

## 2. Public API

All of this lives in `src/components/uis/Calendar/types.ts` and is re-exported from `Calendar.tsx`.

### 2.1 Key codecs and primitive types

```ts
/** Canonical civil-day key. ALWAYS `yyyy-MM-dd`, zero-padded.
 *  It has no timezone; the caller defines the calendar all keys belong to. */
export type CalendarDateKey = string;

/** Canonical civil-month key. ALWAYS `yyyy-MM`, in the same caller-defined calendar. */
export type CalendarMonthKey = string;

/** The key identifying one pager page: a month key in `mode='month'`, a day key
 *  (the first day of the week) in `mode='week'`. */
export type CalendarPageKey = CalendarMonthKey | CalendarDateKey;

/** 0 = Sunday … 6 = Saturday. Same numbering as `Date.prototype.getDay()`. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CalendarWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CalendarViewMode = 'month' | 'week';

export type CalendarSizeType = 'compact' | 'regular' | 'expanded' | number;

export type CalendarChangeSource = 'press' | 'swipe' | 'button' | 'keyboard' | 'imperative';
```

### 2.2 Decoration types

```ts
export type CalendarDot = {
  /** Stable identity within the day — used as the React key. */
  key: string;
  /** Defaults to `palette.dot` (theme.role.primary). */
  color?: string;
};

/**
 * Everything one day cell can be decorated with. Looked up O(1) by `CalendarDateKey`.
 * Marker objects SHOULD be referentially stable across renders (see §3.6).
 */
export type CalendarMarker = {
  dots?: readonly CalendarDot[];
  /** Overrides the selected pill background for this day only. */
  selectedColor?: string;
  /** Overrides the day-number color when the day is NOT selected. */
  textColor?: string;
  /** Tiny caption under the number. Max 6 grapheme clusters; hidden when fontScale > 1.3. */
  badgeText?: string;
  badgeColor?: string;
  disabled?: boolean;
  /** Appended to the cell's accessibilityLabel, e.g. "3 entries, minus 42,000 won". */
  accessibilityHint?: string;
};

export type CalendarMarkerMap = Readonly<Record<CalendarDateKey, CalendarMarker>>;
```

### 2.3 Grid model (what `renderDay` receives)

```ts
export type CalendarDayModel = {
  key: CalendarDateKey;
  /** Device-local-noon interop view of `key`; never an instant to persist — see §4.3. */
  date: Date;
  dayOfMonth: number;                 // 1..31
  weekday: CalendarWeekday;           // 0 = Sunday, independent of `weekStart`
  /** True when the cell belongs to the previous/next month (month mode only). */
  isOutside: boolean;
  /** 0-based row index inside the page grid (0..5). */
  weekIndex: number;
  /** ISO 8601 week number, only computed when `showWeekNumbers` is true; else 0. */
  weekNumber: number;
};

export type CalendarDayState = {
  day: CalendarDayModel;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  marker?: CalendarMarker;
};
```

### 2.4 Theming contract — cpk-ui tokens ONLY

The component resolves a single frozen `CalendarPalette` in one `useMemo([theme, colors])` and
threads it down as one prop. **It reads exactly 13 theme tokens and no others.**

```ts
export type CalendarPalette = Readonly<{
  background: string;
  headerText: string;
  navIcon: string;
  weekdayLabel: string;
  weekNumberLabel: string;
  dayText: string;
  sundayText: string;
  saturdayText: string;
  outsideText: string;
  disabledText: string;
  todayText: string;
  todayRing: string;
  selectedBackground: string;
  selectedText: string;
  underlay: string;
  border: string;
  dot: string;
  badgeText: string;
}>;

/** Caller-facing overrides; every key defaults to the token in the table below. */
export type CalendarColors = Partial<Omit<CalendarPalette, never>>;
```

| Palette slot | cpk-ui token | Rationale |
|---|---|---|
| `background` | `'transparent'` (literal) | the calendar inherits the surface it sits on; never paints `#fff` (fixes **D15**) |
| `headerText` | `theme.text.basic` | |
| `navIcon` | `theme.text.basic` | passed to `IconButton` as `styles.icon` colour |
| `weekdayLabel` | `theme.text.label` | |
| `weekNumberLabel` | `theme.text.disabled` | |
| `dayText` | `theme.text.basic` | |
| `sundayText` | `theme.role.danger` | KR/JP convention; legacy used a hard-coded pink |
| `saturdayText` | `theme.role.info` | KR/JP convention |
| `outsideText` | `theme.text.disabled` | |
| `disabledText` | `theme.text.disabled` | |
| `todayText` | `theme.role.secondary` | `#3D8BFF` in both themes — passes AA on both `bg.basic` values |
| `todayRing` | `theme.role.secondary` | 1.5 px ring; legacy today had **no** circle (Day.tsx L36-41 commented out) |
| `selectedBackground` | `theme.role.primary` | BooKoo overrides this with the ledger colour |
| `selectedText` | `theme.text.contrast`, **or** auto-contrast — see below | |
| `underlay` | `theme.role.underlay` | pressed state, via `CustomPressable` |
| `border` | `theme.role.border` | optional header separator only |
| `dot` | `theme.role.primary` | |
| `badgeText` | `theme.text.label` | |

**Auto-contrast rule (fixes a real legacy bug).** Legacy `selectedDayText` was always `white`,
unreadable on `$yellow rgb(238,209,0)`. When `colors.selectedBackground` is supplied by the caller
and `colors.selectedText` is **not**, resolve the label colour by relative luminance:

```ts
// utils.ts — no dependency, WCAG relative luminance
const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export function readableTextOn(bg: string, light: string, dark: string): string {
  const rgb = parseColor(bg);                 // #rgb | #rrggbb | rgb()/rgba()
  if (!rgb) return light;
  const L =
    0.2126 * srgbToLinear(rgb.r / 255) +
    0.7152 * srgbToLinear(rgb.g / 255) +
    0.0722 * srgbToLinear(rgb.b / 255);
  return L > 0.45 ? dark : light;             // 0.45 chosen so #EED100 → dark, #1B1B1B → light
}
```

Tokens the Calendar must **never** read: `theme.role.success`, `.warning`, `.accent`, `.link`,
`.underlayContrast`, `theme.bg.*` (the calendar is transparent), and any `theme.button.*`
(navigation chrome delegates to `IconButton`, which owns those).

Dark mode is automatic: light/dark palettes already exist in `cpk-ui/src/utils/colors.ts`. There is
not a single hex literal in the component apart from `'transparent'`.

### 2.5 Formatters (the `Intl` seam)

```ts
export type CalendarFormatters = {
  /** Header title, e.g. "August 2026" / "2026년 8월". Default: Intl {year:'numeric', month:'long'}. */
  monthTitle: (date: Date, locale: string) => string;
  /** Header title in week mode, e.g. "Aug 23 – 29, 2026". Default: Intl.DateTimeFormat#formatRange. */
  weekTitle: (start: Date, end: Date, locale: string) => string;
  /** Weekday column header. Default: Intl {weekday:'narrow'} → S M T W T F S / 일 월 화 …. */
  weekdayLabel: (date: Date, locale: string) => string;
  /** Day number. Default: Intl {day:'numeric'} — respects locale numbering systems. */
  dayNumber: (date: Date, locale: string) => string;
  /** Full a11y label. Default: Intl {dateStyle:'full'} → "Monday, August 24, 2026". */
  dayAccessibilityLabel: (date: Date, locale: string) => string;
};
```

Every default is a `Intl.DateTimeFormat` instance created **once per (locale, shape)** and kept in a
module-level `Map` (§4.4). An app that already owns date-fns (BooKoo does) can pass
`formatters={{monthTitle: (d) => format(d, 'LLLL yyyy', {locale: ko})}}` — the object must be
referentially stable (`useMemo`).

### 2.6 Props

```ts
export type CalendarLabels = {
  previousMonth?: string;   // default 'Previous month'
  nextMonth?: string;       // default 'Next month'
  previousWeek?: string;    // default 'Previous week'
  nextWeek?: string;        // default 'Next week'
  today?: string;           // default 'Today' — appended to the today cell's a11y label
  selected?: string;        // default 'Selected'
  weekNumber?: string;      // default 'Week'
  /** Announced by the header live region on page change. Default: (t) => t */
  pageAnnouncement?: (pageTitle: string) => string;
};

export type CalendarStyles = {
  container?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  headerTitle?: StyleProp<TextStyle>;
  weekdayRow?: StyleProp<ViewStyle>;
  weekdayLabel?: StyleProp<TextStyle>;
  weekRow?: StyleProp<ViewStyle>;
  dayCell?: StyleProp<ViewStyle>;
  dayText?: StyleProp<TextStyle>;
  selectedDayCell?: StyleProp<ViewStyle>;
  selectedDayText?: StyleProp<TextStyle>;
  todayDayCell?: StyleProp<ViewStyle>;
  todayDayText?: StyleProp<TextStyle>;
  outsideDayText?: StyleProp<TextStyle>;
  disabledDayText?: StyleProp<TextStyle>;
  dotRow?: StyleProp<ViewStyle>;
  dot?: StyleProp<ViewStyle>;
  badgeText?: StyleProp<TextStyle>;
};

export type CalendarProps = {
  // ── selection ───────────────────────────────────────────────────────────────
  /** Controlled selection. `null` clears it. A `Date` is normalized to its local day key. */
  value?: Date | CalendarDateKey | null;
  /** Uncontrolled initial selection. Ignored when `value !== undefined`. */
  defaultValue?: Date | CalendarDateKey | null;
  /** User interaction only. NEVER fired on mount (fixes D3). */
  onChange?: (date: Date, key: CalendarDateKey, source: CalendarChangeSource) => void;

  // ── paging ──────────────────────────────────────────────────────────────────
  /** Controlled page anchor. `'yyyy-MM'` or `'yyyy-MM-dd'` or a `Date`. */
  month?: Date | CalendarPageKey;
  defaultMonth?: Date | CalendarPageKey;
  onMonthChange?: (
    firstDayOfPage: Date,
    key: CalendarPageKey,
    source: CalendarChangeSource,
  ) => void;

  // ── view mode / collapse ────────────────────────────────────────────────────
  mode?: CalendarViewMode;                          // default 'month'
  defaultMode?: CalendarViewMode;
  onModeChange?: (mode: CalendarViewMode) => void;
  /**
   * Optional Reanimated shared value in [0, 1]: 0 = full month, 1 = single week.
   * When supplied the caller owns the collapse animation (drive it from a scroll handler);
   * the component only reads it. When omitted the component animates internally on `mode` change.
   */
  collapseProgress?: SharedValue<number>;

  // ── calendar math ───────────────────────────────────────────────────────────
  /** BCP-47 tag. Default: `Intl.DateTimeFormat().resolvedOptions().locale`. */
  locale?: string;
  /** Default: `resolveWeekStart(locale)` → 0 for en-US/ko/ja/zh, 1 for most of Europe. */
  weekStart?: WeekStart;
  /** Injectable civil "today". A key avoids deriving another calendar from a Date instant.
   *  Default: an internal device-local clock that re-arms at local midnight (fixes D18). */
  today?: Date | CalendarDateKey;
  /** Always render 6 rows so the height never changes between months. Default `true` (fixes D11). */
  fixedWeeks?: boolean;

  // ── decorations ─────────────────────────────────────────────────────────────
  /** O(1) lookup by `yyyy-MM-dd`. MUST be memoized by the caller. */
  markers?: CalendarMarkerMap;
  showDots?: boolean;                               // default true
  maxDotsPerDay?: number;                           // default 3
  showWeekNumbers?: boolean;                        // default false
  showOutsideDays?: boolean;                        // default true (legacy rendered blank fillers)

  // ── constraints ─────────────────────────────────────────────────────────────
  minDate?: Date | CalendarDateKey;
  maxDate?: Date | CalendarDateKey;
  /** Normalized to a `Set` once per identity change. */
  disabledDates?: ReadonlySet<CalendarDateKey> | readonly CalendarDateKey[];
  /** Escape hatch. Called only for the ≤126 dates in the mounted window. Must be pure and cheap. */
  isDateDisabled?: (date: Date, key: CalendarDateKey) => boolean;

  // ── chrome / layout ─────────────────────────────────────────────────────────
  showHeader?: boolean;                             // default true
  showNavigationButtons?: boolean;                  // default true (legacy showControls)
  showWeekdayRow?: boolean;                         // default true
  paging?: 'swipe' | 'none';                        // default 'swipe'
  monthsToShow?: 1 | 2;                             // default 1; 2 is opt-in for tablets
  size?: CalendarSizeType;                          // default 'regular' (44) — see §3.3
  /** Multiplier cap applied to every text node. Default 1.6. */
  maxFontSizeMultiplier?: number;

  // ── theming / escape hatches ────────────────────────────────────────────────
  colors?: CalendarColors;
  styles?: CalendarStyles;
  style?: StyleProp<ViewStyle>;
  formatters?: Partial<CalendarFormatters>;

  // ── render props (must be referentially stable) ─────────────────────────────
  renderHeader?: (ctx: {
    title: string;
    date: Date;
    mode: CalendarViewMode;
    canGoPrevious: boolean;
    canGoNext: boolean;
    goPrevious: () => void;
    goNext: () => void;
  }) => ReactNode;
  renderWeekdayLabel?: (ctx: {weekday: CalendarWeekday; label: string}) => ReactNode;
  /** Full control of a cell. Receives everything precomputed; must not format dates itself. */
  renderDay?: (ctx: CalendarDayState & {palette: CalendarPalette; cellSize: number}) => ReactNode;

  // ── interaction ─────────────────────────────────────────────────────────────
  onDayLongPress?: (date: Date, key: CalendarDateKey) => void;
  onDisabledDayPress?: (date: Date, key: CalendarDateKey) => void;

  // ── a11y / testing ──────────────────────────────────────────────────────────
  labels?: CalendarLabels;
  accessibilityLabel?: string;
  testID?: string;                                  // default 'calendar'
};

export type CalendarRef = {
  goToMonth: (month: Date | CalendarPageKey, animated?: boolean) => void;
  goToToday: (animated?: boolean) => void;
  next: (animated?: boolean) => void;
  previous: (animated?: boolean) => void;
  setMode: (mode: CalendarViewMode, animated?: boolean) => void;
  /** Focus a specific day (screen reader / external keyboard). */
  focusDay: (key: CalendarDateKey) => void;
};

export const Calendar: React.MemoExoticComponent<
  React.ForwardRefExoticComponent<CalendarProps & React.RefAttributes<CalendarRef>>
>;
export default Calendar;
```

**Disabled precedence** (first match wins, evaluated at grid-build time, memoized):
`marker.disabled === true` → `disabledDates.has(key)` → `key < minKey || key > maxKey` →
`isDateDisabled(date, key)` → enabled. Pressing a disabled day fires `onDisabledDayPress` and
never `onChange`.

**Defaults summary** (the reviewer will ask):
`mode='month'`, `paging='swipe'`, `monthsToShow=1`, `size='regular'`, `fixedWeeks=true`,
`showHeader=true`, `showNavigationButtons=true`, `showWeekdayRow=true`, `showOutsideDays=true`,
`showDots=true`, `maxDotsPerDay=3`, `showWeekNumbers=false`, `maxFontSizeMultiplier=2.0`,
`markers={}` (a frozen module-level `EMPTY_MARKERS`), `testID='calendar'`.

### 2.7 Legacy → final prop mapping (supersedes note 03 §10.3)

| Legacy prop (`BooKooLegacy/src/components/libs/Calendar/index.tsx`) | Final |
|---|---|
| `currentMoment.selected` (Redux) | `value` / `onChange` |
| `currentMoment.current` (Redux) | `month` / `onMonthChange` |
| `onDateSelect(isoString)` | `onChange(date, key, 'press')` |
| `onSwipePrev` / `onSwipeNext` | `onMonthChange(d, k, 'swipe')` |
| `onTouchPrev` / `onTouchNext` | `onMonthChange(d, k, 'button')` |
| `calendarFormat: 'monthly'\|'weekly'` | `mode: 'month'\|'week'` |
| `scrollEnabled` | `paging: 'swipe' \| 'none'` |
| `showControls` | `showNavigationButtons` |
| `showEventIndicators` | `showDots` |
| `events: Array<{date, …}>` | `markers: Record<CalendarDateKey, CalendarMarker>` |
| `eventDates: string[]` | removed — build a `markers` map |
| `dayHeadings` | removed — derived from `locale` + `weekStart`; override via `renderWeekdayLabel` |
| `monthNames`, `titleFormat` | removed — `formatters.monthTitle` / `renderHeader` |
| `prevBtn` / `nextBtn` | `renderHeader` (defaults use cpk-ui `IconButton` + `CaretLeft`/`CaretRight`) |
| `nextButtonText`, `currentMonth`, `startOfMonth`, `todayIndex` | **dropped — dead code** (D21) |
| `customStyle` (flat bag) | `styles` (typed) + `colors` |
| `width` | removed — the calendar fills its parent (§3.3) |
| `removeClippedSubviews` | removed — a 3-page window makes it pointless (D5) |
| built-in `DateTimePicker` modal | removed (D23) — BooKoo composes its own sheet and drives `month` |
| `today` | kept, but now also has a live midnight clock (D18) |
| `weekStart` | kept, now optional and locale-aware |

---

## 3. Rendering and gesture architecture

### 3.1 Component tree

```
<Calendar>                              // controllable state, palette, formatters, ref API, keyboard
 ├─ <CalendarHeader/>                   // memo(title, canPrev, canNext, palette, labels)
 ├─ <CalendarWeekdayRow/>               // memo(weekStart, locale, palette, showWeekNumbers)
 └─ <CalendarPager/>                    // Reanimated translateX; exactly 3 pages
     ├─ <CalendarPage pageKey='2026-07'/>   // memo
     ├─ <CalendarPage pageKey='2026-08'/>
     └─ <CalendarPage pageKey='2026-09'/>
          └─ <CalendarWeekRow/> ×6          // memo with explicit comparator
               └─ <CalendarDay/> ×7         // memo with explicit comparator
```

`CalendarDay` props — every one is a primitive or a stable reference:

```ts
type CalendarDayProps = {
  dayKey: CalendarDateKey;
  dayLabel: string;          // precomputed by the grid builder (no formatting in render)
  weekday: CalendarWeekday;
  isOutside: boolean;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  marker?: CalendarMarker;
  accessibilityLabel: string; // precomputed
  chrome: CalendarChrome;     // ONE frozen object, see below
};

/** Everything invariant across all 42 cells. Created once per (theme, size, callbacks) change. */
type CalendarChrome = Readonly<{
  palette: CalendarPalette;
  cellSize: number;
  rowHeight: number;
  showDots: boolean;
  maxDots: number;
  maxFontSizeMultiplier: number;
  fontScale: number;
  labels: Required<CalendarLabels>;
  styles: CalendarStyles;
  renderDay?: CalendarProps['renderDay'];
  onPress: (key: CalendarDateKey) => void;         // stable useCallback
  onLongPress?: (key: CalendarDateKey) => void;    // stable useCallback
  onDisabledPress?: (key: CalendarDateKey) => void;
}>;
```

**Context vs props: props win, and there is no Calendar context at all.** A context whose value
changes on selection would re-render all 42 consumers *through* `React.memo` (context bypasses memo).
Bundling the invariants into one frozen `chrome` object gives the ergonomics of context (one prop to
thread) with the bail-out behaviour of props: `CalendarDay`'s comparator compares `chrome` by
identity in O(1).

### 3.2 Memoization strategy — why a selection change costs 2 cell renders

Three levels, from cheap to cheapest:

1. **Grid model cache (module-level LRU, 24 entries).** Keyed by
   `` `${pageKey}|${weekStart}|${fixedWeeks}|${mode}|${locale}|${showWeekNumbers}` ``. Value is a
   frozen `readonly CalendarDayModel[]` **plus** the parallel arrays `dayLabels: string[]` and
   `a11yLabels: string[]`. Re-visiting a month (swipe back and forth) is a `Map.get`. This is the
   only place `Intl.DateTimeFormat#format` is ever called for cells (42 + 42 calls per new month,
   ~0.6 ms on a Pixel 6a, amortized to zero by the LRU).

2. **`CalendarWeekRow` comparator.** A row re-renders only if something *in that row* changed:

   ```ts
   type CalendarWeekRowProps = {
     days: readonly CalendarDayModel[];   // frozen 7-slice from the grid LRU
     dayLabels: readonly string[];
     a11yLabels: readonly string[];
     markers: CalendarMarkerMap;
     chrome: CalendarChrome;
     selectedKey: CalendarDateKey | null;
     todayKey: CalendarDateKey;
     disabledVersion: number;             // bumped when min/max/disabledDates/predicate identity changes
   };

   /** True when the row's 7 keys contain `key`. Keys are sorted and consecutive,
    *  so this is two string compares, not a scan. */
   const rowHasKey = (days: readonly CalendarDayModel[], key: string | null): boolean =>
     key !== null && key >= days[0].key && key <= days[6].key;

   const areRowsEqual = (a: CalendarWeekRowProps, b: CalendarWeekRowProps): boolean =>
     a.days === b.days &&
     a.chrome === b.chrome &&
     a.markers === b.markers &&
     a.disabledVersion === b.disabledVersion &&
     rowHasKey(a.days, a.selectedKey) === rowHasKey(b.days, b.selectedKey) &&
     rowHasKey(a.days, a.todayKey) === rowHasKey(b.days, b.todayKey) &&
     // when the selection is inside this row on both sides, it must be the SAME day
     (!rowHasKey(b.days, b.selectedKey) || a.selectedKey === b.selectedKey) &&
     (!rowHasKey(b.days, b.todayKey) || a.todayKey === b.todayKey);
   ```

   Changing the selection from `2026-08-10` to `2026-08-11` (same row) re-renders **1 row**; moving
   across a row boundary re-renders **2 rows**. The other 4–5 rows never even allocate elements.

3. **`CalendarDay` comparator.**

   ```ts
   const areDaysEqual = (a: CalendarDayProps, b: CalendarDayProps): boolean =>
     a.dayKey === b.dayKey &&
     a.isSelected === b.isSelected &&
     a.isToday === b.isToday &&
     a.isDisabled === b.isDisabled &&
     a.chrome === b.chrome &&
     a.accessibilityLabel === b.accessibilityLabel &&
     isSameMarker(a.marker, b.marker);

   /** Identity first, then a shallow value compare so a rebuilt-but-equal marker still bails. */
   function isSameMarker(a?: CalendarMarker, b?: CalendarMarker): boolean {
     if (a === b) return true;
     if (!a || !b) return false;
     return (
       a.dots === b.dots &&                    // caller should reuse the array; see §7.3
       a.badgeText === b.badgeText &&
       a.badgeColor === b.badgeColor &&
       a.selectedColor === b.selectedColor &&
       a.textColor === b.textColor &&
       a.disabled === b.disabled &&
       a.accessibilityHint === b.accessibilityHint
     );
   }
   ```

   Net effect: **selection change → exactly 2 `CalendarDay` renders**, which is acceptance criterion
   #1 in note 03 §11.1 and test #8 in §12.

**Stable callbacks.** `chrome.onPress` is a single `useCallback((key) => …)` created once; the cell
calls `onPress(dayKey)`. No inline arrows anywhere in the tree (fixes **D7**, which alone made
`React.memo` impossible in the legacy component).

**Stable keys.** React keys are the **day key**, not the render index. Legacy used `key={renderIndex}`
(0..41), which forces React to reconcile every cell whenever the grid shifts. Keying by
`'2026-08-24'` means a month change reuses nothing (correct — different days) but a *collapse*
month→week reuses the 7 surviving cells exactly.

**kstyled discipline** (note 12 §5): the grid uses fully-static `css` templates hoisted to module
scope for every layout declaration; the *only* dynamic style on a cell is the one merged colour
object, passed as an array `style={[DAY_CELL, dynamicColorStyle]}` where `dynamicColorStyle` is
memoized inside the cell on `(isSelected, isToday, isDisabled, isOutside, marker, chrome.palette)`.
No `styled` component is defined inside a render body; no CSS comments inside templates; no
`p => p.theme` inside `css`; no `${CONSTANT}` interpolations (they defeat hoisting).

### 3.3 Geometry — no measure pass anywhere

Legacy measured the first week row with `onLayout` on **each of 5 pages**, racing 5 `setState`s into
one `rowHeight`, and then applied `numOfWeeks` computed for the *centre* month to all pages
(**D11/D12/D13**). The final design has no measurement in the vertical axis at all.

| `size` | `cellSize` | `rowGap` | `rowHeight` | `weekdayRowHeight` | `headerHeight` |
|---|---|---|---|---|---|
| `'compact'` | 36 | 4 | 40 | 24 | 44 |
| `'regular'` (default) | 44 | 6 | 50 | 28 | 48 |
| `'expanded'` | 56 | 8 | 64 | 32 | 56 |
| `number n` | `n` | `clamp(round(n * 0.14), 4, 10)` | `n + rowGap` | `round(n * 0.62)` | `round(n * 1.1)` |

Then, with `fontScale` from `useWindowDimensions()`:

```ts
const scaled = Math.round(baseCellSize * Math.min(fontScale, maxFontSizeMultiplier));
const cellSize = clamp(scaled, 32, 96);
const rowHeight = cellSize + rowGap;
const rowCount = mode === 'week' ? 1 : fixedWeeks ? 6 : weeksInMonth(pageDate, weekStart);
const gridHeight = rowCount * rowHeight;
const containerHeight =
  (showHeader ? headerHeight : 0) + (showWeekdayRow ? weekdayRowHeight : 0) + gridHeight;
```

Every one of those is a pure function of props + `fontScale`. `fixedWeeks: true` (the default) makes
`gridHeight` **identical for every month**, so the pager container never resizes, neighbouring pages
are never clipped, and there is zero layout thrash on a swipe.

**Horizontal axis.** Width is the one thing that must be observed, because the calendar fills its
parent (no more `336 * ratio`, fixing **D17**). One `onLayout` on the pager container only:

```ts
const pageWidth = useSharedValue(initialWidth);   // seeded from useWindowDimensions()
const [widthReady, setWidthReady] = useState(false);
const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
  const w = e.nativeEvent.layout.width;
  if (Math.abs(w - pageWidth.value) < 0.5) return;
  pageWidth.value = w;                            // shared value write — NO React re-render
  if (!widthReady) setWidthReady(true);
}, [pageWidth, widthReady]);
```

Because column width is `flex: 1` inside `flexDirection: 'row'` and the day pill is a fixed
`cellSize × cellSize` circle centred inside that flexible column, **no cell ever receives a width
prop**. Rotation, split-view resize, or a tablet sidebar collapsing changes exactly one shared value
and re-renders zero cells. There is no `Dimensions.get('window')` at module scope (the legacy
`styles.ts` L4 did that and never updated on rotation).

### 3.4 Paging — Reanimated + gesture-handler, never `pager-view`

`react-native-pager-view` is **not** a cpk-ui dependency and adding a native module to a UI kit is a
much larger cost than 120 lines of Reanimated. `react-native-reanimated ~4.1.1` and
`react-native-gesture-handler ~2.28.0` are already dependencies (note 11 §10). Decision:
**Reanimated + gesture-handler, no new native dependency.**

```
container (overflow: hidden, width = W, height = gridHeight)
└─ Animated.View  style={{ transform: [{translateX: pagerX}] }}
   ├─ page[-1]  position:absolute  left: -W   (previous)
   ├─ page[ 0]  position:absolute  left:  0   (current)
   └─ page[+1]  position:absolute  left:  W   (next)
```

`pagerX` rests at `0`. A `Gesture.Pan()` with `activeOffsetX([-12, 12])` and
`failOffsetY([-8, 8])` sets `pagerX = dir * event.translationX` while active. `dir = I18nManager.isRTL ? -1 : 1`.

On end:

```ts
.onEnd((e) => {
  'worklet';
  const w = pageWidth.value;
  const projected = dir * (e.translationX + e.velocityX * 0.15);
  const delta = projected < -w * 0.28 ? 1 : projected > w * 0.28 ? -1 : 0;
  if (delta === 0) {
    pagerX.value = withSpring(0, SPRING);            // controlled `month` didn't change → snap back
    return;
  }
  pagerX.value = withSpring(-dir * delta * w, SPRING, (finished) => {
    if (!finished) return;
    pagerX.value = 0;                                // reset in the SAME frame as the model shift
    runOnJS(commitPage)(delta);
  });
})
```

`commitPage(delta)` calls `onMonthChange(nextFirstDay, nextKey, 'swipe')`. Because `pagerX` is reset
to 0 in the completion callback and the three page models shift by one at the same commit, there is
**no visible jump and no `scrollTo` re-centering** — which is the entire source of the legacy jank
(**D2**: `componentDidUpdate` re-centered on *every* update, including a mere day tap).

Details:

- **Exactly 3 pages mounted** (≤126 cells) instead of legacy's 5 (≤210 connected components) — **D5**.
  With `monthsToShow: 2` the window is 3 *page groups* of 2 months = 6 grids; that is the tablet
  ceiling and it is opt-in.
- **Controlled `month` that doesn't change → spring back.** `commitPage` only *requests* the change;
  the page models are derived from the resolved `month`. If the parent ignores `onMonthChange`, the
  next render re-derives the same three pages and the spring already returned `pagerX` to 0.
- **Reduced motion.** `AccessibilityInfo.isReduceMotionEnabled()` is read once and re-read via
  `addEventListener('reduceMotionChanged')`; when on, `withSpring` is replaced by
  `withTiming(…, {duration: 0})`.
- **Nested-scroll arbitration (fixes D22).** The legacy horizontal `ScrollView` sat inside
  `ParallaxScrollView`'s vertical `ScrollView` with no arbitration. `Gesture.Pan()` with
  `failOffsetY` yields the gesture to the vertical scroller automatically; additionally the pager
  exposes its gesture via `Gesture.Simultaneous`-safe composition so BooKoo's collapsing header can
  use `.blocksExternalGesture(scrollRef)` if needed.
- **`paging: 'none'`** renders exactly one page and mounts **no** `GestureDetector` at all.
- **Web** (`e2e-smoke` bundles `expo export --platform web`, note 11 §9.13): ship
  `CalendarPager.web.tsx` using a plain scroll container with
  `overflow-x: auto; scroll-snap-type: x mandatory;` plus `onScrollEnd` → `commitPage`. Metro picks
  the `.web.tsx` automatically, so the native file may import gesture-handler freely.

### 3.5 The month ⇄ week collapse (BooKoo Tab1's requirement)

Legacy Tab1 wrapped the calendar in a vendored `ParallaxScrollView` (string refs, dead on React 19)
whose header collapsed from a 182 pt title block to a 102 pt sticky bar. The rewrite keeps the
*behaviour* and adds the thing users actually expect in 2026: the calendar itself collapses from a
6-row month to a 1-row week as you scroll the day list.

**Mechanism: the week view is the month grid, clipped.**

```
p = collapseProgress ∈ [0, 1]           // 0 = month, 1 = week
activeRow = weekIndex of (selected ?? today) inside the current month grid   // 0..5

gridHeight  = interpolate(p, [0, 1], [6 * rowHeight, rowHeight])
gridOffsetY = interpolate(p, [0, 1], [0, -activeRow * rowHeight])
rowOpacity(i) = i === activeRow ? 1 : interpolate(p, [0, 0.6], [1, 0], CLAMP)
```

All three are `useAnimatedStyle` outputs on the page container and on each row container. **Zero
React re-renders happen during the whole transition** — the same 42 cells stay mounted, their props
never change, and only three transform/opacity values move on the UI thread.

**Committing the mode.** When `p` settles at 1, a `runOnJS` commits `mode = 'week'`; the pager's page
model swaps from months to weeks, anchored at the week that was showing. Because that week's 7 day
keys are identical to the 7 cells already on screen, and cells are keyed by day key, React reuses all
7 nodes — the swap is visually a no-op. Settling back at 0 commits `mode = 'month'` and restores the
month page containing the anchor week's `selected ?? today`.

While `0 < p < 1` the pager gesture is disabled (`Gesture.Pan().enabled(false)` driven by a derived
value) so a half-collapsed calendar can never be swiped into an inconsistent page model.

**Two ways to drive it:**

```tsx
// (a) caller-driven, continuous — what BooKoo Tab1 does
const scrollY = useSharedValue(0);
const collapse = useDerivedValue(() =>
  interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP),
);
<Calendar collapseProgress={collapse} mode={mode} onModeChange={setMode} … />

// (b) component-driven, discrete — a SegmentedControl month/week toggle
<Calendar mode={mode} onModeChange={setMode} … />   // animates with withTiming(220ms)
```

`COLLAPSE_DISTANCE = 5 * rowHeight` (the five rows that disappear) so the collapse tracks the finger
1:1 — the calendar shrinks exactly as fast as the list scrolls up under it.

**Week-mode paging** steps by 7 days; `onMonthChange` reports the week's first day as a
`CalendarDateKey`. Crossing a month boundary in week mode does **not** fire a month change beyond
that (the caller derives the month from the key if it cares).

### 3.6 Marker contract

`markers` is a plain frozen object, looked up as `markers[dayKey]`. The component:

- never accepts an array of events (legacy's `events: Array<{date}>`, rebuilt into a map on **every
  render** — **D8**, fed by an O(n²) builder — **D9**);
- never calls `format()` on marker input;
- passes the marker object straight through to the cell, so caller-side identity stability translates
  directly into memo bail-outs;
- treats `undefined` and the frozen `EMPTY_MARKERS` identically.

Documented caller contract, repeated in the story docs and the JSDoc:

> `markers` **must** be wrapped in `useMemo`, and individual `CalendarMarker` objects **should** be
> reused when their content is unchanged. §7.3 shows the BooKoo implementation of that.

---

## 4. Date handling

### 4.1 The dependency decision

**cpk-ui's `<Calendar>` has no date library.** Two files cover everything:

- `utils.ts` — ~90 lines of dependency-free integer/`Date` math (below).
- `intl.ts` — cached `Intl.DateTimeFormat` instances for all localized text.

`date-fns@^4.1.0` is added to cpk-ui as a **devDependency only**, used in `Calendar.test.tsx` as an
independent oracle (§4.5). No entry is added to `lib/package.json` `peerDependencies`, so
`scripts/check-peer-deps.js` and the published install line are unchanged.

BooKoo continues to use `date-fns@^4.1.0` app-wide per `DECISIONS.md` §2, and injects date-fns
formatters into the Calendar if it ever wants date-fns' exact wording.

### 4.2 The math (`utils.ts`)

```ts
const MS_PER_DAY = 86_400_000;

/** Every calendar Date in this component is anchored at LOCAL NOON. See §4.3. */
export const localNoon = (y: number, m0: number, d: number): Date =>
  new Date(y, m0, d, 12, 0, 0, 0);

export const toDayKey = (d: Date): CalendarDateKey => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
};

export const toMonthKey = (d: Date): CalendarMonthKey => toDayKey(d).slice(0, 7);

export const fromDayKey = (k: CalendarDateKey): Date =>
  localNoon(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));

export const fromMonthKey = (k: CalendarMonthKey): Date =>
  localNoon(+k.slice(0, 4), +k.slice(5, 7) - 1, 1);

export const addDays = (d: Date, n: number): Date =>
  localNoon(d.getFullYear(), d.getMonth(), d.getDate() + n);      // JS normalizes overflow

export const addMonths = (d: Date, n: number): Date => {
  const target = localNoon(d.getFullYear(), d.getMonth() + n, 1);
  const dim = daysInMonth(target);
  return localNoon(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), dim));
};

export const startOfMonth = (d: Date): Date => localNoon(d.getFullYear(), d.getMonth(), 1);

export const daysInMonth = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export const startOfWeek = (d: Date, weekStart: WeekStart): Date =>
  addDays(d, -(((d.getDay() - weekStart) % 7 + 7) % 7));

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();                       // fixes D1 — the YEAR is compared

/** Safe because both dates are local noon: a DST shift of ±1 h can never cross the 0.5-day mark. */
export const diffInCalendarDays = (a: Date, b: Date): number =>
  Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);

export const weeksInMonth = (d: Date, weekStart: WeekStart): number => {
  const first = startOfMonth(d);
  const offset = diffInCalendarDays(first, startOfWeek(first, weekStart));
  return Math.ceil((offset + daysInMonth(d)) / 7);   // 4, 5 or 6
};
```

Grid builder:

```ts
export function buildMonthGrid(
  month: Date,
  weekStart: WeekStart,
  fixedWeeks: boolean,
): readonly CalendarDayModel[] {
  const gridStart = startOfWeek(startOfMonth(month), weekStart);
  const cellCount = (fixedWeeks ? 6 : weeksInMonth(month, weekStart)) * 7;
  const targetMonth = month.getMonth();
  const cells = new Array<CalendarDayModel>(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const date = addDays(gridStart, i);
    cells[i] = {
      key: toDayKey(date),
      date,
      dayOfMonth: date.getDate(),
      weekday: date.getDay() as CalendarWeekday,
      isOutside: date.getMonth() !== targetMonth,
      weekIndex: (i / 7) | 0,
      weekNumber: 0,          // filled only when showWeekNumbers (§4.6)
    };
  }
  return Object.freeze(cells);
}

export function buildWeekGrid(anchor: Date, weekStart: WeekStart): readonly CalendarDayModel[] {
  const gridStart = startOfWeek(anchor, weekStart);
  const cells = new Array<CalendarDayModel>(7);
  for (let i = 0; i < 7; i++) {
    const date = addDays(gridStart, i);
    cells[i] = {
      key: toDayKey(date), date, dayOfMonth: date.getDate(),
      weekday: date.getDay() as CalendarWeekday, isOutside: false, weekIndex: 0, weekNumber: 0,
    };
  }
  return Object.freeze(cells);
}
```

Range comparison uses **string comparison on keys**, not `Date` comparison: `'yyyy-MM-dd'` is
lexicographically ordered, so `key < minKey` is correct, allocation-free, and timezone-proof.

### 4.3 DST / timezone correctness — the rules

A generic Calendar renders **civil calendar keys**, not instants. It does not choose a timezone.
String props remain in the caller-defined calendar; `Date` props use device-local fields only as an
interop convenience. Six concrete rules, each with the bug it prevents:

1. **Anchor every calendar `Date` at local noon (12:00:00.000).**
   `new Date(y, m, d)` is local *midnight*, which **does not exist** in timezones whose DST
   transition happens at 00:00 (America/Santiago, America/Havana, historically America/Sao_Paulo,
   Australia/Lord_Howe). The engine then silently yields 01:00 of the same day — usually harmless,
   but `addDays` chains and `getTime()` arithmetic around such a day drift. Noon is ≥11 h away from
   any real-world transition, so *no* DST shift can move a noon-anchored date to a different calendar
   day.

2. **Never parse `'2026-08-24'` with `new Date(string)`.** ECMA-262 parses a date-only ISO string as
   **UTC**, so in KST it yields 2026-08-24T09:00 and in UTC−5 it yields 2026-08-23T19:00 → the
   calendar highlights the wrong day west of Greenwich. `fromDayKey` above does field-wise
   construction instead.

3. **Never build a key with `toISOString().slice(0, 10)`.** Same UTC bug in the other direction.
   `toDayKey` reads `getFullYear/getMonth/getDate`.

4. **Never step days with `+ 86_400_000`.** A day is 23 or 25 hours twice a year. `addDays` uses
   field arithmetic (`new Date(y, m, d + n)`), which JS normalizes correctly across month, year and
   DST boundaries. `diffInCalendarDays` *does* divide by `MS_PER_DAY`, but only between two
   noon-anchored dates and with `Math.round`, so a ±1 h DST skew (0.042 days) cannot change the
   result.

5. **The day key is the canonical value; the `Date` is a convenience.**
   `onChange(date, key, source)` hands back the same local-noon interop view used by
   `CalendarDayModel.date`. It is not an instant to persist. Documented in the JSDoc: *"prefer `key`;
   `date` is provided only for APIs that require local civil fields"*.

6. **Jest runs with `TZ='Asia/Seoul'`** (note 11 §7.5). Tests must additionally run a matrix of
   timezones for the DST cases — see §8.

**BooKoo binding.** `SCHEMA.md` P6/§7.2 stores every numeric `dayKey` in `ledgers.timeZone`.
`<LedgerCalendar>` passes ledger-calendar strings for `month`, `value`, `today`, marker keys, and
query bounds, plus `weekStart={ledger.weekStartsOn}`. It never converts a ledger key into the device
timezone. The wrapper converts strings to numeric keys only at the Convex argument boundary and uses
`wallClockToEpochMs(..., ledger.timeZone)` when a chosen civil date must become an instant.

### 4.4 Localized text via `Intl` (`intl.ts`)

```ts
type Shape = 'monthTitle' | 'weekdayNarrow' | 'dayNumber' | 'dayFull';

const OPTIONS: Record<Shape, Intl.DateTimeFormatOptions> = {
  monthTitle:    {year: 'numeric', month: 'long'},
  weekdayNarrow: {weekday: 'narrow'},
  dayNumber:     {day: 'numeric'},
  dayFull:       {dateStyle: 'full'},
};

const cache = new Map<string, Intl.DateTimeFormat>();

export function getFormat(locale: string, shape: Shape): Intl.DateTimeFormat {
  const k = `${locale}|${shape}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, OPTIONS[shape]);
    cache.set(k, f);
  }
  return f;
}
```

Constructing an `Intl.DateTimeFormat` is the expensive part (~100 µs); `format()` on a cached
instance is ~1 µs. With the grid LRU on top, a fully warm calendar does **zero** formatting work per
render. Legacy did up to **420 `moment().format()` calls per render** (note 03 §6.3).

Output check for the five BooKoo locales:

| locale | `monthTitle` | `weekdayNarrow` (Sun-first) | `dayFull` |
|---|---|---|---|
| `en-US` | `August 2026` | `S M T W T F S` | `Monday, August 24, 2026` |
| `ko` | `2026년 8월` | `일 월 화 수 목 금 토` | `2026년 8월 24일 월요일` |
| `ja` | `2026年8月` | `日 月 火 水 木 金 土` | `2026年8月24日月曜日` |
| `zh-CN` | `2026年8月` | `日 一 二 三 四 五 六` | `2026年8月24日星期一` |
| `id` | `Agustus 2026` | `M S S R K J S` | `Senin, 24 Agustus 2026` |

`weekTitle` uses `Intl.DateTimeFormat(locale, {month:'short', day:'numeric'}).formatRange(a, b)`
when available, falling back to `` `${fmt(a)} – ${fmt(b)}` ``.

Hermes ships `Intl.DateTimeFormat` on both platforms (Android delegates to ICU4J, iOS to
`NSDateFormatter`). A defensive `typeof Intl?.DateTimeFormat === 'function'` guard falls back to
English hard-coded arrays so the component can never crash on an exotic runtime; the guard is
exercised by a test.

### 4.5 The date-fns equivalence table (BooKoo side + the cpk-ui test oracle)

This is the complete replacement of every moment call in the legacy calendar path
(`03-legacy-calendar-spec.md` §8, condensed and corrected). BooKoo uses these directly; cpk-ui's
`Calendar.test.tsx` uses them to assert `utils.ts` is identical for a 12-year sweep.

| Legacy moment | date-fns 4 | cpk-ui `utils.ts` |
|---|---|---|
| `moment(m).startOf('month').day()` | `getDay(startOfMonth(m))` | `startOfMonth(m).getDay()` |
| `moment(m).daysInMonth()` | `getDaysInMonth(m)` | `daysInMonth(m)` |
| `moment(m).startOf('month')` | `startOfMonth(m)` | `startOfMonth(m)` |
| `moment(m).startOf('week')` | `startOfWeek(m, {weekStartsOn})` — **must be explicit**; moment's was the process-global locale (**D19**) | `startOfWeek(m, weekStart)` |
| `moment(m).isoWeekday(ws)` | `startOfWeek(m, {weekStartsOn: ws})` | `startOfWeek(m, ws)` |
| `moment(m).add(n, 'day')` | `addDays(m, n)` | `addDays(m, n)` |
| `moment(m).add(n, 'week')` | `addWeeks(m, n)` | `addDays(m, n * 7)` |
| `moment(m).add(n, 'month')` | `addMonths(m, Math.round(n))` | `addMonths(m, n)` |
| `moment(m).subtract(1, 'month')` | `subMonths(m, 1)` | `addMonths(m, -1)` |
| `a.month()===b.month() && a.date()===b.date()` (**D1**) | `isSameDay(a, b)` | `isSameDay(a, b)` |
| `a.format('YYYY-MM-DD') === b.format('YYYY-MM-DD')` | `isSameDay(a, b)` | `isSameDay(a, b)` |
| `res.diff(curr) > 0` | `isAfter(res, curr)` | `res.getTime() > curr.getTime()` |
| `m.format('YYYY-MM-DD')` | `format(m, 'yyyy-MM-dd')` | `toDayKey(m)` |
| `m.format('YYYYMMDD')` | `format(m, 'yyyyMMdd')` | **dropped** — one canonical key |
| `m.format('D')` | `format(m, 'd')` | `getFormat(locale,'dayNumber').format(m)` |
| `m.format('MMMM YYYY')` | `format(m, 'LLLL yyyy', {locale})` — `LLLL` is the **standalone** month name, grammatically correct in more locales than moment's `MMMM` | `getFormat(locale,'monthTitle').format(m)` |
| `m.format()` | `formatISO(m)` | n/a — the component emits keys |
| `moment(props.today)` | `today ?? new Date()` | `useToday()` (§4.7) |
| `moment.locale('ko')` (global mutation, **D19**) | `import {ko} from 'date-fns/locale/ko'` + `{locale}` per call | `locale` prop |
| `moment(a).isSame(moment(b), 'd')` (Tab1 L38/59/114) | `isSameDay(a, b)` | — |
| `new Date(b) - new Date(a)` sort (Tab1 L46/122) | `compareDesc(a, b)` | — |
| `DATE_FORMAT_DAYS: 'MMMM Do (ddd)'` | `format(d, 'MMMM do (EEE)')` — better: `Intl {month:'long', day:'numeric', weekday:'short'}` and drop the English ordinal, which is meaningless in ko/ja/zh/id | — |

**Token traps** (moment → date-fns), worth a lint rule in BooKoo:
`YYYY` → `yyyy` (date-fns `YYYY` is the *week-numbering* year — a classic off-by-one at New Year),
`DD` → `dd` and `D` → `d` (date-fns `D`/`DD` are day-**of-year**),
`ddd`/`dddd` → `EEE`/`EEEE`, `Do` → `do`. `HH/mm/ss/MM/MMM/MMMM` are identical.

### 4.6 Week start and first-week rules per locale

`Intl` does not portably expose week metadata (`Intl.Locale.prototype.getWeekInfo` is not in Hermes).
So `utils.ts` ships a **small CLDR-derived table** and one resolver:

```ts
/** CLDR `weekData/firstDay`, reduced to the regions that differ from Monday. */
const SUNDAY_FIRST = new Set([
  'US','CA','MX','BR','AR','CO','PE','VE','CL','JP','KR','TW','HK','MO','PH','IL','ZA',
  'CN','IN','ID','TH','SG','JM','DO','GT','HN','NI','PA','PR','BO','EC','PY','UY','KE','ZW',
]);
const SATURDAY_FIRST = new Set([
  'AE','AF','BH','DJ','DZ','EG','IQ','IR','JO','KW','LY','OM','QA','SA','SD','SY','YE',
]);

export function resolveWeekStart(locale: string): WeekStart {
  const region = regionOf(locale);            // 'ko' → 'KR' via Intl.Locale#maximize when available
  if (SATURDAY_FIRST.has(region)) return 6;
  if (SUNDAY_FIRST.has(region)) return 0;
  return 1;                                    // ISO 8601 default: Monday
}
```

- BooKoo passes `weekStart={ledger.weekStartsOn}` explicitly. The creator's locale/device calendar
  supplies only the new-ledger default; once created, the ledger-wide value keeps every member's grid
  and rollup labels aligned. The resolver remains the generic cpk-ui default.
- **`firstWeekContainsDate`** only affects week *numbers*, which the component renders only when
  `showWeekNumbers` is true. Rule implemented: ISO 8601 (`weekStart = 1`,
  `firstWeekContainsDate = 4`) whenever `weekStart === 1`; otherwise the "week containing Jan 1 is
  week 1" convention (`firstWeekContainsDate = 1`), which is what US/KR/JP calendars show. The
  distinction is asserted by a test using date-fns `getISOWeek` / `getWeek` as the oracle.
- Weekday header labels are derived, never passed in (legacy's `dayHeadings` was *always* indexed
  Sunday-first regardless of `weekStart` — a trap):

```ts
const weekdayLabels = useMemo(() => {
  const anchor = startOfWeek(todayNoon, weekStart);
  const f = getFormat(locale, 'weekdayNarrow');
  return Object.freeze(Array.from({length: 7}, (_, i) => f.format(addDays(anchor, i))));
}, [locale, weekStart, todayMonthKey]);
```

### 4.7 The "today" clock

Legacy captured `moment()` at render time and never refreshed it; the timer that was presumably meant
to fix that leaked because of a typo (`this.dateTimeer` assigned, `this.dateTimer` cleared, and
`clearInterval` used on a `setTimeout`) — **D4/D18**.

```ts
function useTodayKey(explicit?: Date | CalendarDateKey): CalendarDateKey {
  const explicitKey = typeof explicit === 'string'
    ? explicit
    : explicit ? toDayKey(explicit) : undefined;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (explicitKey) return;
    const next = new Date();
    next.setHours(24, 0, 0, 500);                   // 500 ms past local midnight
    const id = setTimeout(() => setNow(new Date()), next.getTime() - Date.now());
    return () => clearTimeout(id);                  // correct pairing, correct handle name
  }, [explicitKey, now]);
  return explicitKey ?? toDayKey(now);
}

const todayKey = useTodayKey(today);
const todayNoon = useMemo(() => fromDayKey(todayKey), [todayKey]);
```

Only the two affected cells re-render at midnight, because `isToday` is a per-cell primitive prop and
the row comparator sees exactly one row change on each side. An `AppState` `'active'` listener also
recomputes, covering the case where the device slept through midnight and the timer fired late.
BooKoo always supplies an explicit ledger-calendar key and owns its IANA-midnight timer in
`useLedgerTodayKey`; the generic fallback remains device-local for other cpk-ui consumers.

---

## 5. Accessibility

D6 requires an automated a11y render gate with error severity once D7/I4 installs and wires it. Until
that script exists, this document does not claim Storybook runs; the component and manual release tests
below remain mandatory.

| Element | Contract |
|---|---|
| Root | `accessibilityLabel={accessibilityLabel ?? pageTitle}`, no role (it is a container). On web: `role="application"` is *not* used; the pager gets `role="grid"`. |
| Header title | `accessibilityRole="header"`, `accessibilityLiveRegion="polite"` (Android) + `AccessibilityInfo.announceForAccessibility(labels.pageAnnouncement(title))` on page commit (iOS has no live region) |
| Prev / Next | cpk-ui `IconButton` with `accessibilityLabel = labels.previousMonth / nextMonth` (or `previousWeek/nextWeek` in week mode), `accessibilityState={{disabled}}`, `hitSlop` to a 44×44 target. Reuses `getButtonAccessibilityProps` from `cpk-ui/src/utils/accessibility.ts`. |
| Weekday row | `accessibilityElementsHidden` (iOS) + `importantForAccessibility="no-hide-descendants"` (Android) — each cell already announces its weekday, so reading "S M T W T F S" first is pure noise. On web it stays as `role="row"` / `role="columnheader"` with `abbr`. |
| Week-number column | `accessibilityLabel={`${labels.weekNumber} ${n}`}` |
| Day cell | `accessibilityRole="button"`; `accessibilityLabel` = the precomputed `dayFull` string, plus `", " + labels.today` when today, plus `", " + marker.accessibilityHint` when present; `accessibilityState={{selected, disabled}}`; `accessibilityHint` omitted (the role + label already say it) |
| Outside day when `showOutsideDays === false` | rendered as an inert spacer: `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`, not pressable |
| Dots / badge | `importantForAccessibility="no"` — **the dot is never the sole signal**; the count lives in `marker.accessibilityHint`. This is the single biggest a11y gap in the legacy app (**D20**: cells announced a bare number). |
| Motion | `AccessibilityInfo.isReduceMotionEnabled()` collapses every spring/timing to duration 0 |
| Contrast | every default pair clears WCAG AA 4.5:1 in both `light` and `dark`; asserted by a unit test over `cpk-ui/src/utils/colors.ts` |

**Screen-reader traversal.** The reading order is header → (weekday row skipped) → row 0 cells 0–6 →
row 1 … in logical order, which is what a blind user expects from a grid. On page commit the
component calls `AccessibilityInfo.setAccessibilityFocus` on the header title so the user is told
where they landed instead of being dumped at cell 0.

**Keyboard traversal** (web, and external keyboards on iPad/Android). Roving `tabIndex`: exactly one
cell has `tabIndex={0}` — the selected day, else today if it is on the page, else the first enabled
in-month day. Every other cell is `tabIndex={-1}`.

| Key | Action |
|---|---|
| `ArrowLeft` / `ArrowRight` | ∓1 day (**sign flipped under RTL**) |
| `ArrowUp` / `ArrowDown` | ∓7 days |
| `Home` / `End` | first / last day of the visible week |
| `PageUp` / `PageDown` | previous / next page (`onMonthChange` source `'keyboard'`) |
| `Shift+PageUp` / `Shift+PageDown` | ∓1 year |
| `Enter` / `Space` | select the focused day (`onChange` source `'keyboard'`) |
| `Escape` | no-op inside the component; the host sheet handles it |

Moving focus past the page edge auto-pages and keeps focus on the target day. Handled by a single
`onKeyDown` on the grid container (react-native-web forwards it); the native build compiles the same
handler but RN simply never fires it, so there is no `.web.tsx` split needed for keyboard.

**Large fonts.** `fontScale` from `useWindowDimensions()` grows `cellSize` (§3.3, capped at
`maxFontSizeMultiplier`, hard-clamped to 96). All `<Text>` carry
`maxFontSizeMultiplier={props.maxFontSizeMultiplier}` and `numberOfLines={1}`; the day number also
gets `adjustsFontSizeToFit` on iOS with `minimumFontScale={0.8}`. Graceful degradation at large
scales: `fontScale > 1.3` hides `badgeText`; `fontScale > 1.5` clamps `maxDotsPerDay` to 1. A
Storybook story renders the calendar at `fontScale` 1.0 / 1.5 / 2.0 side by side.

---

## 6. Tablet, large screens, and RTL

### 6.1 Sizing and layout

- Read `const {media} = useTheme()` (cpk-ui exposes `isPortrait/isMobile/isTablet/isDesktop`). This is
  the cpk-ui component's own internal density choice, not BooKoo's structural phone/tablet branch —
  that one is `useTabletLayout()` (`app/AGENTS.md`).
  **Test in the order `isDesktop → isTablet → else phone`** — in the default `mobile-first` mode the
  flags are cumulative (`isMobile` is literally `minWidth: 0`), note 11 §5.
- Default `size` when the caller omits it: `isDesktop || isTablet ? 'expanded' : 'regular'`.
  Minimum touch target is 44×44 at every breakpoint (a `compact` 36 px pill still gets `hitSlop: 4`).
- The calendar **fills its parent**: `width: '100%'`, `alignSelf: 'stretch'`, plus a
  `maxWidth: cellSize * 7 * 1.6` guard with `alignSelf: 'center'` so it does not stretch absurdly
  across a 1440 px desktop Storybook frame.
- `monthsToShow: 2` renders two month grids side by side in one page group (`flexDirection: 'row'`,
  `gap: 24`, each `flex: 1`); the pager steps by 2 months. It is **opt-in**, not automatic, because
  the right call depends on the host layout — BooKoo's tablet Tab1 is a master/detail split where the
  calendar occupies a ~420 pt sidebar and a second month would not fit.
- No `Dimensions.get('window')` at module scope; everything reactive comes from
  `useWindowDimensions()` and the pager's single `onLayout`.

### 6.2 BooKoo's tablet composition (app side, note 07 pattern)

```
phone   : [ collapsing header ][ Calendar (collapsible) ][ FlashList of the day's entries ]
tablet  : [ collapsing header                                                            ]
          [ Calendar, fixed month mode, sidebar ~420pt | FlashList of the day's entries   ]
```

On tablet the collapse is disabled (`collapseProgress` omitted, `mode='month'`) because there is
vertical room for six rows and a list at the same time. That is a **component-level branch**, not a
style branch — note 12 §9.3's rule.

### 6.3 RTL

- **Zero physical edge properties.** No `left/right/marginLeft/marginRight/paddingLeft/paddingRight`
  anywhere. Use `start`/`end`. The legacy event dot was `position: absolute; top: 8; right: 8` —
  broken under RTL (**D16**); the final dot row is a centred `flexDirection: 'row'` under the number,
  which needs no edge property at all.
- `flexDirection: 'row'` is kept and allowed to auto-flip, which is correct: in an RTL locale the
  first weekday column belongs on the right.
- Pager translation and swipe-delta signs multiply by `dir = I18nManager.isRTL ? -1 : 1`.
  `ArrowLeft`/`ArrowRight` keyboard deltas flip with the same constant.
- Day numbers come from `Intl {day:'numeric'}`, so Arabic-Indic and Devanagari numbering systems
  render correctly (`ar-EG` → `٢٤`). Never hand-build a number string.
- A test asserts no rendered style object contains `left` or `right` (walks `StyleSheet.flatten` over
  the whole tree).

---

## 7. Landing it: files, gates, interim plan, and the BooKoo wrapper

### 7.1 Exact file list to add to cpk-ui

Repo: `/Users/hyo/Github/crossplatformkorea/cpk-ui`. Precedents (note 11 §7.2) touched exactly four
files; Calendar is bigger than `SegmentedControl`, so it follows the `Accordion` shape (public file +
internal files, none of which are exported from `src/index.tsx`).

```
src/components/uis/Calendar/Calendar.tsx              # PUBLIC: component + `export * from './types'`
src/components/uis/Calendar/types.ts                  # all public types (§2)
src/components/uis/Calendar/utils.ts                  # date math, key codecs, grid builder, LRU, luminance
src/components/uis/Calendar/intl.ts                   # cached Intl.DateTimeFormat + default formatters
src/components/uis/Calendar/palette.ts                # theme tokens → frozen CalendarPalette
src/components/uis/Calendar/useCalendarState.ts       # controllable value/month/mode, useToday, keyboard
src/components/uis/Calendar/CalendarHeader.tsx        # internal, memo
src/components/uis/Calendar/CalendarWeekdayRow.tsx    # internal, memo
src/components/uis/Calendar/CalendarPager.tsx         # internal, reanimated + gesture-handler
src/components/uis/Calendar/CalendarPager.web.tsx     # internal, scroll-snap fallback (CI bundles web)
src/components/uis/Calendar/CalendarPage.tsx          # internal, memo
src/components/uis/Calendar/CalendarWeekRow.tsx       # internal, memo + comparator
src/components/uis/Calendar/CalendarDay.tsx           # internal, memo + comparator
src/components/uis/Calendar/Calendar.stories.tsx      # MANDATORY — storybook:check
src/components/uis/Calendar/Calendar.test.tsx         # MANDATORY — components:check
src/components/uis/Calendar/utils.test.ts             # optional but recommended (pure-math oracle tests)
```

One modified file:

```diff
  // src/index.tsx  — the list is alphabetical: Accordion, Button, Calendar, Card, …
  export * from './components/uis/Button/Button';
+ export * from './components/uis/Calendar/Calendar';
  export * from './components/uis/Card/Card';
```

Plus one line in the repo-root `package.json` `devDependencies`: `"date-fns": "^4.1.0"` (test oracle
only — **not** added to `lib/package.json`).

**No** per-component `index.ts`, **no** `docs/` folder, **no** `__tests__/` directory — none exist
anywhere in `src/components` (note 11 §7.1). `.ondevice/storybook.requires.ts` is auto-generated via
`require.context`, so native Storybook picks the story up with no edit.

### 7.2 The enforced checklist (note 11 §7.3) — what each gate demands

| Gate | Requirement | How Calendar satisfies it |
|---|---|---|
| `bun run components:check` (`scripts/check-component-coverage.js`) | the directory of every `./components/...` export in `src/index.tsx` must contain a `*.test.(js\|jsx\|ts\|tsx)` | `Calendar.test.tsx` colocated |
| `bun run storybook:check` (`scripts/check-story-coverage.js`) | ① a `*.stories.tsx` exists; ② it declares `const meta = {...}`; ③ `meta.title` starts with one of `Actions/ Display/ Feedback/ Foundations/ Inputs/ Media/ System/`; ④ `meta.component` present; ⑤ `meta.decorators` present; ⑥ `meta.parameters.docs.description.component` present; ⑦ `meta.parameters.notes` **absent**; ⑧ ≥2 exported story consts; ⑨ source must not match `/## Features\|\b(A (?:flexible\|versatile\|powerful))\b/i` | `title: 'Inputs/Calendar'`, `component: Calendar`, `decorators: [withThemeProvider]`, a plain-prose description, 10 stories (below) |
| `bun run lint` | eslint, incl. `@typescript-eslint/consistent-type-imports` with `fixStyle: 'inline-type-imports'` | write `import {type ReactNode} from 'react'`, `import type {StyleProp} from 'react-native'` |
| `bun run tsc` | strict compile | no `any` anywhere (BooKoo hard requirement too) |
| `bunx jest --coverage --ci` | `jest-expo`, `TZ='Asia/Seoul'`, fake timers, reanimated mocked | tests construct dates explicitly; the reanimated mock means pager tests assert commit callbacks, not pixel offsets |
| `bun run check-peer-deps` | peer list consistency | unchanged — no new peer dep (§4.1) |
| `bun run e2e-smoke` | resolves every `src/index.tsx` export path, runs `expo export --platform web`, and requires `lib/components/uis/<Name>/` for every `src/components/uis/<Name>/` | `CalendarPager.web.tsx` keeps the web bundle clean |
| Storybook a11y addon | `a11y: {test: 'error'}` | §5 |
| commitlint | Angular conventional commits, imperative lowercase, no trailing period | `feat(calendar): add controlled month and week calendar` |
| cpk-ui `.claude/commands/commit.md` | **never** add `Co-Authored-By` to cpk-ui commits | noted for whoever runs the PR |

Run `bun run test:all` (= lint + components:check + storybook:check + tsc + test) before opening the
PR. The PR body needs a screen recording, a test plan, and the contributor-guide checkbox.

**Stories to ship** (≥2 required; these 10 are the review-worthy set):
`Basic` (uncontrolled), `Controlled`, `WithMarkers` (dots + badges), `WeekMode`,
`CollapsibleMonthToWeek` (a live `collapseProgress` driven by a slider), `DisabledRanges`
(`minDate`/`maxDate`/`disabledDates`), `Localized` (en-US / ko / ja / ar-EG side by side),
`WeekStartMonday`, `TabletTwoMonths` (`monthsToShow: 2`), `CustomRenderDay`.
The `withThemeProvider` decorator plus the `theme` global gives light/dark for free.

### 7.3 Contributor rules that shape the API (note 11 §7.6, CONTRIBUTING.md)

1. **Never expose individual style attributes as props** — hence `colors` (a semantic palette bag)
   and `styles` (a typed slot bag), not `dayTextColor` / `dayCellStyle`.
2. `style` is the parent's style; everything internal goes through `styles`.
3. Accept React elements / render functions for extensibility — hence `renderHeader`,
   `renderWeekdayLabel`, `renderDay`.
4. Keep the public component compact; internals are separate non-exported files.
5. Default colours must come from theme tokens for both themes — §2.4.
6. `export const Calendar = React.memo(forwardRef(CalendarContainer)); export default Calendar;`
   matching every other cpk-ui component.
7. `testID`s are kebab-case and deterministic: `calendar`, `calendar-header`, `calendar-prev`,
   `calendar-next`, `calendar-weekday-{0..6}`, `calendar-day-2026-08-24` (day key, not index — makes
   tests read like the spec).

### 7.4 Interim plan — developing BooKoo against an unpublished Calendar

You **cannot publish cpk-ui locally** (note 11 §8: `scripts/assert-ci-publish.js` rejects it;
publishing only happens from the `publish.yml` workflow on `main`). So the Calendar has to be usable
from BooKoo before it exists on npm. Four phases:

**Phase 0 — vendored, but written as if it were already in cpk-ui.**
Build it at `/Users/hyo/Github/hyodotdev/BooKoo/src/uis/Calendar/` with the **exact same file names
and internal import graph** as §7.1. Two rules make the later move a `git mv`:

- The vendored folder imports *nothing* BooKoo-specific. Enforced, not just documented:

  ```jsonc
  // BooKoo eslint.config.js — overrides entry
  {
    files: ['src/uis/Calendar/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {group: ['@/*', 'convex/*', '../../../convex/*', 'zustand*', 'date-fns*', 'expo-router*'],
           message: 'src/uis/Calendar is a vendored cpk-ui component: no app imports, no date-fns.'},
        ],
      }],
    },
  }
  ```

- Theme access goes through one shim file, `src/uis/Calendar/useTheme.ts`:

  ```ts
  // VENDORED cpk-ui COMPONENT — see .notes/design/calendar-component.md §7.4
  // On promotion this file is deleted and the imports become
  //   import {useTheme} from '../../../providers/ThemeProvider';
  export {useCPK as useTheme} from 'cpk-ui';
  ```

  (`useTheme` is not a cpk-ui root export; `useCPK()` spreads the same `ThemeContext`.)

  A header comment block at the top of `Calendar.tsx` states the destination path, the promotion
  criteria, and forbids app-specific edits.

**Phase 1 — Metro source alias, once the code has moved into the cpk-ui repo.** Fastest inner loop:
edit cpk-ui `src/`, Metro reloads BooKoo instantly, no `bun run build` in between (note 11 §8-C).

```js
// BooKoo metro.config.js
const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const cpkSrc = path.resolve(__dirname, '../../crossplatformkorea/cpk-ui/src');
config.watchFolders = [...(config.watchFolders ?? []), cpkSrc];
config.resolver.unstable_enableSymlinks = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.extraNodeModules = {
  'cpk-ui': cpkSrc,
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  kstyled: path.resolve(__dirname, 'node_modules/kstyled'),
};
module.exports = config;
```

plus `"paths": {"cpk-ui": ["../../crossplatformkorea/cpk-ui/src/index.tsx"]}` in BooKoo's
`tsconfig.json`. Gate this behind an env flag (`CPK_UI_LOCAL=1`) so CI and other machines resolve the
published package. BooKoo's `babel-plugin-kstyled` runs over the aliased folder automatically.

**Phase 2 — `bun link` on the built `lib/`, for pre-release verification.** This is what the
maintainer does (`.claude/settings.local.json` allowlists `Bash(bun link:*)`):

```bash
cd /Users/hyo/Github/crossplatformkorea/cpk-ui && bun run build
cd lib && bun link
cd /Users/hyo/Github/hyodotdev/BooKoo && bun link cpk-ui
```

Point `extraNodeModules['cpk-ui']` at `…/cpk-ui/lib` instead of `src`. This is the configuration that
proves `tsconfigBuild.json` emits usable `.d.ts` and that nothing depends on a file `lib/package.json`'s
`files` array excludes. Equivalent, less global: `"cpk-ui": "link:../../crossplatformkorea/cpk-ui/lib"`
in BooKoo's `package.json` (bun always symlinks `link:`).

**Phase 3 — publish and swap.** PR into cpk-ui → merge to `main` → bump `lib/package.json` to
`0.7.1` → run `publish.yml` with `tag: beta` first, `bun add cpk-ui@beta` in BooKoo, soak one
release, then `tag: latest`. Delete the vendored copy and the eslint override in the same commit that
bumps the dependency.

**Promotion criteria — all must hold before the cpk-ui PR is opened:**

1. Zero imports from BooKoo (the eslint rule passes with the folder still in BooKoo).
2. Zero `any`; `bun run tsc` clean in both repos.
3. `bun run test:all` green in cpk-ui, including the §8 test list.
4. When D7/I4 adds Storybook a11y, `storybook:build` is green for all 10 stories in light and dark; until
   then equivalent render assertions plus the manual VoiceOver/TalkBack matrix are the release gate.
5. `bun run e2e-smoke` green — in particular the web bundle.
6. The perf assertions in §8 pass: selection change → 2 cell renders; unrelated parent render with
   stable `markers` → 0 cell renders; initial month render < 16 ms.
7. Verified on a real device matrix: iPhone (notch), iPad (portrait + landscape + split view),
   a mid-range Android, and web.
8. No new runtime dependency in `lib/package.json`.
9. The BooKoo Tab1 collapse works against the cpk-ui build, not just the vendored copy.

**Known risk to plan for:** cpk-ui 0.7.0 is validated against Expo 54 / RN 0.81.5 / React 19.1.0 /
Reanimated ~4.1.1, while BooKoo targets Expo 57 / RN 0.86.2 / React 19.2.3 / Reanimated 4.5.x
(note 11 §9.1, note 12 §12). The Calendar is the first cpk-ui component to use Reanimated worklets
heavily, so it is also the component most likely to surface that skew. Budget a cpk-ui compat bump
(Expo 57 + Reanimated 4.5 + `react-native-worklets`) as part of the same effort, and note the Babel
ordering difference: cpk-ui uses `react-native-reanimated/plugin` last, BooKoo uses
`react-native-worklets/plugin` last, and `babel-plugin-kstyled` must come **before** either
(note 12 §4.3).

### 7.5 BooKoo-side wrapper — `<LedgerCalendar>`

Path: `/Users/hyo/Github/hyodotdev/BooKoo/src/uis/LedgerCalendar.tsx`.
Consumed by `app/(tabs)/index.tsx` (the Tab1 replacement).

**Data source.** `ledgerDayRollups` (`SCHEMA.md` §3.13):
`{ledgerId, dayKey: number /* YYYYMMDD */, shard, expenseMinor, incomeMinor, itemCount}` with index
`by_ledgerId_dayKey_shard`.

```ts
// convex/rollups.ts
export const daysInRange = query({
  args: {
    ledgerId: v.id('ledgers'),
    fromDayKey: v.number(),   // inclusive, YYYYMMDD — the FIRST cell of the previous page's grid
    toDayKey: v.number(),     // inclusive, YYYYMMDD — the LAST cell of the next page's grid
  },
  returns: v.array(v.object({
    dayKey: v.number(),
    incomeMinor: v.number(),
    expenseMinor: v.number(),
    itemCount: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireLedgerMember(ctx, args.ledgerId);   // O(1) via ledgerMembers.by_ledgerId_userId
    assertDayKeyRange(args.fromDayKey, args.toDayKey, DAY_ROLLUP_RANGE_LIMIT); // max 126 civil days
    const rows = await ctx.db
      .query('ledgerDayRollups')
      .withIndex('by_ledgerId_dayKey_shard', (q) =>
        q.eq('ledgerId', args.ledgerId)
         .gte('dayKey', args.fromDayKey)
         .lte('dayKey', args.toDayKey))
      .take(DAY_ROLLUP_SCAN_LIMIT + 1);
    if (rows.length > DAY_ROLLUP_SCAN_LIMIT) throw invalidInput('error.invalidInput');

    const byDay = new Map<number, {
      dayKey: number; incomeMinor: number; expenseMinor: number; itemCount: number;
    }>();
    for (const row of rows) {
      const total = byDay.get(row.dayKey) ?? {
        dayKey: row.dayKey, incomeMinor: 0, expenseMinor: 0, itemCount: 0,
      };
      total.incomeMinor += row.incomeMinor;
      total.expenseMinor += row.expenseMinor;
      total.itemCount += row.itemCount;
      byDay.set(row.dayKey, total);
    }
    return [...byDay.values()].sort((a, b) => a.dayKey - b.dayKey);
  },
});
```

`assertDayKeyRange` validates both integers as real Gregorian civil dates, rejects `from > to`, and
computes the inclusive span without interpreting either key as a device-timezone instant.

Why this is the cheap shape, point by point:

- **Index-bounded, never `.filter()`.** `by_ledgerId_dayKey_shard` with a range on `dayKey`.
- **The read is capped and range-validated.** Calendar supplies at most 126 civil days; Timeline
  supplies at most 30. `DAY_ROLLUP_SCAN_LIMIT` scales with `ROLLUP_SHARD_COUNT`, so the function is
  bounded by the arguments, not by ledger size. Every unbounded list in BooKoo still paginates.
- **Every shard is summed server-side.** The index range never `.eq()`s `shard`; the wire result has
  one complete total per day even after `ROLLUP_SHARD_COUNT` is raised.
- **One subscription for three pages.** The range spans the mounted pager window, so swiping to an
  adjacent month needs no new query and no loading flash. The range only widens when the user pages
  past the prefetch window.
- **Argument-level cache keys.** `fromDayKey`/`toDayKey` are stable integers derived from ledger-calendar
  grid keys,
  so Convex's per-(query, args) cache hits across users of the same shared ledger, and there is no
  `Date.now()` inside the query (note 13 §1287-1291).
- **Rollups, never items.** This replaces legacy `checkEventDates` — an O(n²) scan of *every* ledger
  item with two `moment()` allocations per comparison (**D9**) — and legacy `handleSelectDate`, a
  full linear scan + sort of all items on **every tap** (**D10**). Both are gone.

**Marker construction with identity reuse** — this is the "stays cheap" part:

```tsx
type DayRollup = {dayKey: number; incomeMinor: number; expenseMinor: number; itemCount: number};

/** Module-level cache so marker OBJECT identity survives every Convex push that
 *  did not actually change that day. This is what makes the memo comparators bail. */
const markerCache = new Map<string, CalendarMarker>();

function markerFor(
  row: DayRollup,
  palette: {income: string; expense: string; neutral: string},
  currency: CurrencyCode,
  locale: string,
  t: (k: string, o: {count: number; net: string}) => string,
): CalendarMarker {
  const net = row.incomeMinor - row.expenseMinor;
  const netLabel = formatMoney({amountMinor: net, currency}, locale);
  const cacheKey = [
    row.dayKey, row.incomeMinor, row.expenseMinor, row.itemCount, netLabel,
    palette.income, palette.expense, palette.neutral,
  ].join('|');
  const hit = markerCache.get(cacheKey);
  if (hit) return hit;

  const dots: CalendarDot[] = [];
  if (row.incomeMinor > 0) dots.push({key: 'in', color: palette.income});
  if (row.expenseMinor > 0) dots.push({key: 'ex', color: palette.expense});
  if (dots.length === 0 && row.itemCount > 0) dots.push({key: 'n', color: palette.neutral});

  const marker: CalendarMarker = Object.freeze({
    dots: Object.freeze(dots),
    badgeText: netLabel,
    badgeColor: net === 0 ? palette.neutral : net > 0 ? palette.income : palette.expense,
    accessibilityHint: t('calendar.dayHint', {count: row.itemCount, net: netLabel}),
  });
  markerCache.set(cacheKey, marker);
  if (markerCache.size > 512) markerCache.delete(markerCache.keys().next().value as string);
  return marker;
}
```

```tsx
export function LedgerCalendar({ledgerId, ledgerColor, ledger}: Props): ReactElement {
  const {theme} = useCPK();
  const {locale} = useLocale();                       // 'ko' | 'en' | 'ja' | 'zh' | 'id'
  const selectedDayKey = useCalendarStore((s) => s.selectedDayKey);   // 'yyyy-MM-dd'
  const monthKey = useCalendarStore((s) => s.monthKey);               // 'yyyy-MM'
  const {setSelectedDayKey, setMonthKey} = useCalendarStore.getState();
  const ledgerTodayKey = useLedgerTodayKey(ledger.timeZone);          // refreshes at ledger midnight

  // The mounted pager window: previous page's first grid cell → next page's last grid cell.
  const {fromCalendarKey, toCalendarKey} = useMemo(
    () => gridRangeForWindow(monthKey, ledger.weekStartsOn),
    [monthKey, ledger.weekStartsOn],
  );
  const fromDayKey = calendarKeyToDayKey(fromCalendarKey);
  const toDayKey = calendarKeyToDayKey(toCalendarKey);

  const rows = useQuery(api.rollups.queries.daysInRange, {ledgerId, fromDayKey, toDayKey});
  const cached = useMmkvCache(
    `markers:${ledgerId}:${ledger.timeZone}:${ledger.weekStartsOn}:${ledger.baseCurrency}:${fromDayKey}:${toDayKey}`,
    rows,
  );                                                                    // cold-start paint

  const dotPalette = useMemo(() => ({
    income: theme.role.info,
    expense: ledgerColor ?? theme.role.danger,
    neutral: theme.text.disabled,
  }), [theme.role.info, theme.role.danger, theme.text.disabled, ledgerColor]);

  const markers = useMemo<CalendarMarkerMap>(() => {
    const out: Record<CalendarDateKey, CalendarMarker> = {};
    for (const row of cached ?? []) {
      out[dayKeyToCalendarKey(row.dayKey)] = markerFor(
        row, dotPalette, ledger.baseCurrency, locale, t,
      );
    }
    return Object.freeze(out);
  }, [cached, dotPalette, ledger.baseCurrency, locale, t]);

  return (
    <Calendar
      value={selectedDayKey}
      onChange={(_, key) => setSelectedDayKey(key)}
      month={monthKey}
      onMonthChange={(_, key) => setMonthKey(key.slice(0, 7))}
      today={ledgerTodayKey}
      markers={markers}
      weekStart={ledger.weekStartsOn}
      locale={locale}
      colors={{selectedBackground: ledgerColor}}
      mode={mode}
      onModeChange={setMode}
      collapseProgress={collapse}
      size={isTablet ? 'expanded' : 'regular'}
      testID="ledger-calendar"
    />
  );
}
```

**Why it stays cheap — the full accounting:**

| Cost | Legacy | New |
|---|---|---|
| Building the marker source | O(n²) over **all** ledger items, 2 `moment()` per comparison, re-run on every `selectedLedger` identity change | O(k) over ≤126 rollup rows, k ≈ 90, no date library, cached objects |
| Marker map rebuild | every render (`prepareEventDates`, D8) | only when the Convex result identity changes |
| Marker object identity | new object every time | reused via `markerCache` → memo comparators bail → **0 cell re-renders** on a no-op push |
| Currency formatting | `<FormattedCurrency>` per row | `formatMoney({amountMinor: net, currency: ledger.baseCurrency}, locale)`; its formatter metadata is module-cached and no exponent is hard-coded |
| Day-tap → entry list | full scan + sort of all items (D10) | a `usePaginatedQuery` on `ledgerItems.by_ledgerId_deletedAt_dayKey_occurredAt` bounded to the selected day |
| Mounted day cells | 5 pages × 42 = 210 `connect()`ed components (D5/D6) | 3 pages × 42 = 126 plain memoized components, zero store subscriptions |
| Cold start | blank until the whole ledger loads | encrypted-MMKV markers paint after device-key unlock, Convex reconciles |
| Theme change | 210 `mapStateToProps` runs | one `chrome` object rebuild → 126 cell renders, once |

**The day-detail list** below the calendar is a separate `usePaginatedQuery` on
`api.items.queries.listByDay({ledgerId, dayKey: calendarKeyToDayKey(selectedDayKey), paginationOpts})`
(index `by_ledgerId_deletedAt_dayKey_occurredAt`), rendered in a `FlashList`. This argument boundary is
the one string→integer conversion; the generic Calendar never sees a database key.

**The collapsing header** (replacing the vendored `ParallaxScrollView`, D22 / note 01 §6.8):
`Animated.ScrollView` (or `FlashList` with `useAnimatedScrollHandler`) → `scrollY` shared value →
two derived values: one drives the ledger-coloured header's height/opacity cross-fade (preserving
the legacy 182→102 pt title collapse), the other is the `collapseProgress` passed to `<Calendar>`.
Both run entirely on the UI thread; the JS thread is untouched while scrolling.

---

## 8. Test plan (`Calendar.test.tsx` + `utils.test.ts`)

Jest environment: `jest-expo`, `TZ='Asia/Seoul'`, fake timers, reanimated mocked, `expo-font` mocked
(note 11 §7.5). Every test injects `today={new Date(2026, 7, 24, 12)}` so nothing depends on the wall
clock.

**Pure math (`utils.test.ts`, date-fns as the oracle):**

1. `buildMonthGrid` vs date-fns for every month from 2020-01 to 2032-12 × `weekStart` 0..6 ×
   `fixedWeeks` true/false — first key, last key, cell count, `isOutside` flags all identical to
   `startOfWeek(startOfMonth(m), {weekStartsOn})` + `addDays`.
2. `weeksInMonth` ≡ the legacy formula `ceil((offset + daysInMonth) / 7)` ≡
   `(differenceInCalendarDays(endOfWeek(endOfMonth(m)), startOfWeek(startOfMonth(m))) + 1) / 7`.
3. `addMonths` clamps: 2026-01-31 + 1 month → 2026-02-28; + 13 months → 2027-02-28.
4. `toDayKey`/`fromDayKey` round-trip for 20 years of days.
5. DST matrix — run the whole grid builder under `TZ` ∈ `{Asia/Seoul, America/New_York,
   America/Santiago, Australia/Lord_Howe, Pacific/Chatham, Europe/Lisbon}` and assert the key
   sequence is strictly consecutive with no duplicate or skipped day. This is the test that would
   have caught a midnight-anchored implementation.
6. `readableTextOn('#EED100', …)` → dark; `readableTextOn('#1B1B1B', …)` → light.
7. `resolveWeekStart('ko')` → 0, `('de-DE')` → 1, `('ar-EG')` → 6, `('en-US')` → 0.
8. ISO week numbers ≡ date-fns `getISOWeek` when `weekStart === 1`; `getWeek` with
   `firstWeekContainsDate: 1` otherwise.

**Behaviour parity (`Calendar.test.tsx`):**

9. Renders without crashing under `createComponent(<Calendar/>)` in both `light` and `dark`.
10. `2026-08`, `weekStart: 0`, `fixedWeeks: false` → 6 rows, first cell `2026-07-26`, last `2026-09-05`.
11. `fixedWeeks: true` → exactly 42 cells for every month of 2024–2027.
12. `weekStart: 1` shifts the grid one column and the weekday labels start at Monday.
13. `mode: 'week'` → exactly 7 cells; paging steps 7 days.
14. Tapping a day fires `onChange(date, 'yyyy-MM-dd', 'press')` exactly once, and **`onChange` is not
    called on mount** (regression for **D3**).
15. `2025-08-24` is **not** highlighted when `value='2026-08-24'` (regression for **D1**).
16. A marker at `'2026-08-24'` renders a dot on that cell only; `testID='calendar-day-2026-08-24'`.
17. **Render count:** changing `value` re-renders exactly 2 `CalendarDay`s (spy injected through
    `renderDay`).
18. **Render count:** re-rendering the parent with unchanged props and a stable `markers` re-renders
    **0** `CalendarDay`s.
19. **Render count:** replacing `markers` with a structurally-identical but freshly-built map
    re-renders 0 cells (`isSameMarker` shallow compare).
20. `minDate`/`maxDate`/`disabledDates`/`isDateDisabled` each block `onChange` and fire
    `onDisabledDayPress`; `marker.disabled` wins over everything.
21. `today` injection is deterministic; the today cell's `accessibilityLabel` ends with `labels.today`.
22. Midnight rollover: advance fake timers past local midnight → the today cell moves, and exactly
    two rows re-render.
23. Swipe left/right calls `onMonthChange` with source `'swipe'` and the correct adjacent key; a
    controlled `month` that does not change leaves the rendered page unchanged (spring-back).
24. Prev/Next buttons fire `onMonthChange` with source `'button'`; both are `accessibilityState`
    disabled at `minDate`/`maxDate` boundaries.
25. Collapse: setting `collapseProgress` to 1 and committing sets `mode='week'`, keeps the same 7 day
    keys mounted, and re-renders **0** cells during the transition.
26. Locale `ko`: header is `2026년 8월`; weekday labels are `일 월 화 수 목 금 토`.
27. RTL: with `I18nManager.isRTL === true`, `StyleSheet.flatten` over the whole tree contains no
    `left` or `right` key.
28. Dark snapshot ≠ light snapshot (proves no hard-coded `#fff`, regression for **D15**).
29. Keyboard: `ArrowRight` moves focus one day; `PageDown` pages; `Enter` selects with source
    `'keyboard'`; `ArrowRight` at the page edge auto-pages.
30. `fontScale: 2.0` → `badgeText` is not rendered and at most 1 dot is rendered.
31. Perf budget: initial month render < 16 ms measured with `performance.now()` (documented in the
    story rather than asserted hard in CI, where timing is noisy — asserted at a lenient 50 ms).

**BooKoo wrapper (`LedgerCalendar.test.tsx`):**

32. Run under `TZ=America/Los_Angeles` with `ledger.timeZone='Asia/Seoul'`; at
    `2026-08-31T15:30:00.000Z`, `today`, the selected cell, marker lookup, and `listByDay` argument are
    all Seoul `2026-09-01` / `20260901`, never Los Angeles `2026-08-31`.
33. Feed two `ledgerDayRollups` shards for the same day and assert `daysInRange` returns one row whose
    income, expense, and item count are the exact sums. Repeat with rows in reverse shard order.
34. KRW `12000`, USD `12000`, and BHD `12000` use their 0/2/3 exponents through `formatMoney`; no
    `/100` expression exists in the wrapper. `weekStart` equals `ledger.weekStartsOn` for all 0..6.
35. A range wider than 126 civil days is rejected before the database read; the exact 126-day mounted
    window remains accepted and complete at the configured `ROLLUP_SHARD_COUNT`.

---

## 9. What this fixes, mapped to the legacy defect list

| Defect (note 03 §9) | Fixed by |
|---|---|
| D1 year ignored in `isSelected` | `isSameDay` / day-key equality (§4.2) |
| D2 re-center on every update | no `scrollTo` at all; shared-value pager (§3.4) |
| D3 `onDateSelect` on mount | `onChange` fires only on interaction (§2.6) |
| D4 leaked timer (typo + wrong clear fn) | `useToday` with a correct `clearTimeout` (§4.7) |
| D5 5 pages / 210 cells | 3 pages / ≤126 cells (§3.4) |
| D6 `connect()` in every `Day` | zero store/context subscriptions in a cell (§3.1) |
| D7 new arrow closure per cell | one stable `chrome.onPress` (§3.1) |
| D8 marker map rebuilt per render | caller-owned frozen map + LRU grid cache (§3.2, §3.6) |
| D9 O(n²) event scan | `ledgerDayRollups` range query (§7.5) |
| D10 full scan + sort per tap | paginated per-day query (§7.5) |
| D11 wrong height for neighbour pages | `fixedWeeks` → constant height (§3.3) |
| D12 5 racing `onLayout` callbacks | zero vertical measurement (§3.3) |
| D13 row height varies with weekend fillers | uniform `rowHeight` from `size` (§3.3) |
| D14 unrounded float page index | integer `delta` from a velocity-projected threshold (§3.4) |
| D15 hard-coded light colours | 13 theme tokens, no hex literals (§2.4) |
| D16 `right: 8` dot | centred dot row, `start`/`end` only (§6.3) |
| D17 fixed `336 * ratio` width | fills parent, `flex: 1` columns (§3.3, §6.1) |
| D18 stale "today" | midnight timer + `AppState` (§4.7) |
| D19 global `moment.locale()` | explicit `locale` prop, no global state (§4.4) |
| D20 no a11y at all | full contract, a11y addon enforced in CI (§5) |
| D21 dead props | dropped (§2.7) |
| D22 nested scroll conflict | `failOffsetY` + `paging: 'none'` + web scroll-snap (§3.4) |
| D23 modal owned by the calendar | removed; `CalendarRef.goToMonth` + app-side sheet (§2.6) |

---

## 10. Open questions

The former ledger-timezone question is resolved by `RECONCILIATION.md` R3: BooKoo always uses
`ledgers.timeZone`; device-local time is only the generic cpk-ui default and a new-ledger suggestion.

1. **`date-fns` as a devDependency of cpk-ui** — is the maintainer comfortable adding a test-only
   dependency purely as a math oracle? If not, the oracle tests can be replaced by hand-written
   fixture tables (larger diff, same coverage).
2. **`collapseProgress` puts a Reanimated `SharedValue<number>` in cpk-ui's public API surface.**
   Reanimated is already a dependency, but this is the first *type* leak into a public prop.
   Alternative: accept `collapse?: {value: number}` structurally typed, decoupling the signature from
   the Reanimated version. Recommend the structural type if the maintainer objects.
3. **`monthsToShow: 2` vs a separate `<CalendarStrip>`** — is two-up worth shipping in v1, given
   BooKoo's tablet layout is a sidebar that fits exactly one month?
4. **Range selection** (`value: {start, end}`) is out of scope for v1. Confirm no BooKoo screen needs
   a date range before shipping (the stats screens filter by month, so probably not).
5. **`badgeText` in the generic component or only in BooKoo's `renderDay`?** Current answer: keep it
   in `CalendarMarker` (it is generic — a task count, a temperature, a total) and let BooKoo pass a
   pre-formatted string. Revisit if the cpk-ui reviewer finds it too app-specific.
6. **cpk-ui Expo 57 compat bump** — does it land as a prerequisite PR, or in the same PR as the
   Calendar? Recommend a separate, earlier PR so the Calendar review is not entangled with a
   dependency upgrade.
