# 03 — Legacy Calendar: Behavior Spec + Modern cpk-ui `<Calendar>` Design

> Research phase output. Source of truth for rewriting the BooKoo calendar as a
> dependency-light, controlled, memoised component contributed to
> `crossplatformkorea/cpk-ui`.
>
> Legacy sources are **read-only reference** at `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/`.

---

## 0. Source inventory (exact paths, exact line counts)

| Path | Lines | Role |
|---|---|---|
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/libs/Calendar/index.tsx` | 449 | The calendar. `class Calendar extends Component`, default export is `connect(mapState)(Calendar)` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/libs/Calendar/Day.tsx` | 138 | One day cell. `class Day extends Component`, default export is `connect(mapState)(Day)` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/libs/Calendar/styles.ts` | 149 | `EStyleSheet.create({...})` — all sizes are `'$NNN'` tokens |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/screen/Tab1.tsx` | 277 | **The only consumer.** Renders `<Calendar>` at line 193 |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/actions/index.ts` | 115 | `updateSelectedDate` (L8), `updateCurrentMoment` (L15) |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/reducers/index.ts` | 173 | `initialState.currentMoment` (L8-11), `function currentMoment` (L144-159) |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/BaseStyles.ts` | 398 | `EStyleSheet.build({...})` — defines `$1..$360` = `N * ratio`, colors |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/utils/Styles.ts` | 55 | exports `globalStyles`, `ratio` (= `screenRatio`), `width`, `height` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/utils/Data.ts` | — | `DATE_FORMAT: 'YYYY-MM-DD'` (L17), `DATE_FORMAT_DAYS: 'MMMM Do (ddd)'` (L18) |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/STRINGS.js` | 1000+ | `SUN..SAT`, `JAN..DEC` per language (`en` L44-51, `ko` L309-317, `ja` L573-581, `zh` L837-845, `id`) |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/babel.config.js` | 33 | alias `@libs` → `./src/components/libs` (so `@libs/Calendar` = the file above) |

**Grep result — who renders `<Calendar>`:** exactly one call site,
`src/components/screen/Tab1.tsx:193`. (`src/utils/Icons.ts:76`,
`LedgerItemDetail.tsx:300`, `LedgerItemAddOrUpdate/ConsumeView.tsx:100`,
`IncomeView.tsx:86` only reference the image asset `picCalendar.png`, not the component.)

Legacy deps that must **not** survive: `moment@^2.24.0`, `prop-types@^15.7.2`,
`react-native-extended-stylesheet@^0.12.0`, `react-native-modal-datetime-picker@^8.1.1`,
`react-redux@^7.1.3`.

---

## 1. Full prop table — `<Calendar>` (legacy)

Declared in `static propTypes` (L38-63) and `static defaultProps` (L65-81).
Note: three props are **used but not declared** (`width`, `events`, `dispatch`).

| Prop | Type | Default | Meaning / actual behavior |
|---|---|---|---|
| `currentMonth` | `any` | — | **Dead.** Declared in propTypes, never read anywhere in the file. |
| `customStyle` | `object` | `{}` | Style override bag. Keys consumed: `calendarContainer`, `calendarControls`, `title`, `controlButton`, `calendarHeading`, `dayHeading`, `weekendHeading`, `weekRow`, `monthContainer`; forwarded to `Day` which consumes `day`, `dayButton`, `dayButtonFiller`, `currentDayText`, `selectedDayText`, `weekendDayText`, `hasEventCircle`, `hasEventDaySelectedCircle`, `hasEventText`, `eventIndicator`, `eventIndicatorFiller`. |
| `dayHeadings` | `array` | `['S','M','T','W','T','F','S']` | **Always indexed Sunday-first** (`this.props.dayHeadings[j]` where `j = (i + weekStart) % 7`, L302/L310). So the array is Sun→Sat regardless of `weekStart`. |
| `eventDates` | `array` | `[]` | Fallback marker source: array of date strings. Only used when `events` is falsy. Turned into `{[dateString]: {}}`. |
| `events` | (undeclared) `Array<{date: string, ...styleOverrides}>` | `undefined` | **The real marker source used by BooKoo.** Each entry must carry `date`; the whole event object is stored in the map and its `hasEventCircle` / `hasEventDaySelectedCircle` / `hasEventText` / `eventIndicator` keys are spread as style overrides in `Day`. |
| `monthNames` | `array` | `['Jan'..'Dec']` | Used **only** in the `showControls` branch of `renderTopBar` (L328): `monthNames[currentMoment.current.month()]`. The non-`showControls` branch uses `titleFormat` via moment instead. |
| `nextButtonText` | `string \| object` | — | **Dead.** Declared, passed by Tab1 (`'Next'`), never read. |
| `onDateSelect` | `func` | — | `(isoString: string) => void`. Fired (a) unconditionally on mount with `moment().format()` (L85), (b) on day tap with `thisMoment.format()` (L260), (c) 100 ms after the modal date picker confirms (L144). |
| `onSwipeNext` | `func` | — | `(m: Moment) => void`, fired inside `InteractionManager.runAfterInteractions` when `currentPage > VIEW_INDEX` (L193). |
| `onSwipePrev` | `func` | — | same for `currentPage < VIEW_INDEX` (L191). |
| `onTouchNext` | `func` | — | `(m: Moment) => void`, fired synchronously in `onNext` **before** dispatch (L167). |
| `onTouchPrev` | `func` | — | same in `onPrev` (L159). |
| `prevBtn` | `any` (node) | `<Text style={styles.controlButtonText}>Prev</Text>` | Node rendered inside the left `TouchableOpacity`. |
| `nextBtn` | `any` (node) | `<Text style={styles.controlButtonText}>Next</Text>` | Node rendered inside the right `TouchableOpacity`. |
| `removeClippedSubviews` | `bool` | `true` | Passed straight to the horizontal `ScrollView`. |
| `scrollEnabled` | `bool` | `false` | **Master switch for paging.** `false` → a plain `<View>` with a single page. `true` → horizontal paging `ScrollView` with a 5-page stack. |
| `showControls` | `bool` | `false` | `false` → header is a single `<Text>{format(titleFormat)}</Text>`. `true` → header is `"{year} {localizedMonth}"` + a chevron image + prev/next buttons; tapping the title opens the modal date picker. |
| `showEventIndicators` | `bool` | `false` | If true, every non-filler `Day` renders a 4×4 dot `<View>` (transparent unless the day has an event). |
| `titleFormat` | `string` | `'MMMM YYYY'` | moment format string for the non-`showControls` header. |
| `today` | `any` | `undefined` | Reference "today". Never passed by BooKoo → `moment(undefined)` === now, evaluated **once per render**, never refreshed at midnight. |
| `weekStart` | `number` | `1` (Monday) | First column of the grid. BooKoo passes `0` (Sunday). |
| `calendarFormat` | `string` | `'monthly'` | `'monthly'` \| `'weekly'`. Controls page step (month vs week), start-of-page computation, and row count. |
| `width` | (undeclared) `number` | `336 * ratio` | Page width used for `scrollTo` and for `contentOffset.x / width` page math. Must equal the rendered `monthContainer` width (`'$336'` = `336 * ratio`) or paging breaks. |
| `dispatch` | (injected by `connect`) | — | Used directly: `this.props.dispatch(updateSelectedDate(...))`, `updateCurrentMoment(...)`. |
| `currentMoment` | (injected by `connect`) `{current: Moment, selected: Moment}` | `{current: moment(), selected: moment()}` | **The component's entire state lives here.** `current` = which page/month is centered; `selected` = highlighted day. |

### Internal component state (L33-36)

| Key | Type | Purpose |
|---|---|---|
| `showDatePicker` | `boolean` | Visibility of `react-native-modal-datetime-picker`. |
| `rowHeight` | `number \| null` | Measured height of the first week row; multiplied by `numOfWeeks` to size the paging `ScrollView`. |

Also: `this._calendar` (ScrollView ref), `this.dateTimer` (cleared on unmount but
**never assigned** — the code sets `this.dateTimeer`, a typo at L142 → timer leak).

---

## 2. Full prop table — `<Day>` (legacy `Day.tsx`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `caption` | `any` | — | Day number as a string: `` `${thisMoment.format('D')}` `` (unpadded). |
| `customStyle` | `object` | `{}` | Same override bag, forwarded from `Calendar`. |
| `filler` | `bool` | `false` | Renders an empty non-pressable placeholder cell (`TouchableWithoutFeedback` + sized `View`). |
| `event` | `object` | `undefined` | The matched entry from the events map. Truthiness → "has event". Its keys `hasEventCircle`, `hasEventDaySelectedCircle`, `hasEventText`, `eventIndicator` are spread as per-day style overrides. |
| `isSelected` | `bool` | — | Draws the filled circle in the ledger color. |
| `isToday` | `bool` | — | Red text if not also selected. |
| `isWeekend` | `bool` | — | Grey `#fafafa` cell background + `#cccccc` text (only when neither today nor selected). |
| `onPress` | `func` | — | `() => void` — a **new arrow closure on every render** (L258-261). |
| `showEventIndicators` | `bool` | — | Renders the dot container. |
| `startOfMonth` | (undeclared) `Moment` | — | Passed at L255, **never read**. Dead. |
| `selectedLedger` | (injected by `connect`) | — | `state.selectedLedger`; only `.info.color` (0-5) is read, to pick the selected-circle background. |

---

## 3. Real-world usage — the only call site

`src/components/screen/Tab1.tsx:193-214`, verbatim props:

```tsx
<Calendar
  events={this.state.events}
  scrollEnabled
  showControls
  showEventIndicators
  dayHeadings={customDayHeadings}      // [getString('SUN') .. getString('SAT')]
  monthNames={customMonthNames}        // [getString('JAN') .. getString('DEC')]
  titleFormat={'MMMM YYYY'}
  prevBtn={<Image source={require('@assets/imgs/arrLeft.png')}/>}
  nextBtn={<Image source={require('@assets/imgs/arrRight.png')}/>}
  nextButtonText={'Next'}              // dead prop
  onDateSelect={(date) => this.handleSelectDate(date)}
  onTouchPrev={(e) => console.log('onTouchPrev: ', e)}
  onTouchNext={(e) => console.log('onTouchNext: ', e)}
  onSwipePrev={(e) => console.log('onSwipePrev: ', e)}
  onSwipeNext={(e) => console.log('onSwipeNext', e)}
  weekStart={0}
/>
```

So the production configuration is: **monthly, paging enabled, controls shown,
event dots shown, Sunday-first, `MMMM YYYY` title, i18n strings from `getString`.**

### Where the event dots come from — `checkEventDates` (Tab1.tsx L53-74)

```js
function checkEventDates(propItems) {
  const events = [];
  for (let key in propItems) {
    const item = propItems[key];
    let duplicated = false;
    events.forEach(function(event) {                       //  <-- O(n) inside O(n)
      if (moment(event.date).isSame(moment(item.selectedDate), 'd')) {
        duplicated = true;
      }
    });
    if (!duplicated) {
      events.push({
        date: moment(item.selectedDate).format(DATE_FORMAT),  // 'YYYY-MM-DD'
        hasEventCircle: { backgroundColor: 'transparent' },
      });
    }
  }
  return events;
}
```

- **O(n²) with 2 `moment()` allocations per comparison**, over *every* item in the
  ledger (unbounded). Re-run in `componentDidMount` and again in
  `getDerivedStateFromProps` on every `selectedLedger` identity change.
- Produces a **flat array**, which `Calendar.prepareEventDates` then converts back
  to a map — **on every single render** of the Calendar (L396).
- The only payload is `hasEventCircle: {backgroundColor: 'transparent'}` — a no-op
  override. Practically the dot is drawn purely from `event` truthiness.

### The per-day list — `convertLedgerItemsToArray` / `handleSelectDate`

`Tab1.handleSelectDate(date)` (L108-132) does a **full linear scan of every ledger
item** with `moment(item.selectedDate).isSame(moment(date), 'd')` and an in-place
`Array.sort` on each tap. This, together with `checkEventDates`, is the concrete
reason the legacy app degrades as the ledger grows.

`LedgerItem.selectedDate` is a JS `Date` (`src/models/LedgerItem.ts:13`) but is
stored in Firebase RTDB as whatever `JSON.stringify` produced, so it arrives as an
ISO string.

---

## 4. The rendering algorithm (faithful reconstruction)

### 4.1 `getNumberOfWeeks(month, weekStart)` (L25-30)

```js
const firstDay = moment(month).startOf('month').day();   // 0=Sun .. 6=Sat
const offset   = (firstDay - weekStart + 7) % 7;
const days     = moment(month).daysInMonth();
return Math.ceil((offset + days) / 7);                    // 4, 5 or 6
```

### 4.2 `getStartMoment(calFormat, currMoment)` (L204-223)

- `'monthly'` → `moment(currMoment).startOf('month')`.
- `'weekly'` and `weekStart > 0` → `moment(currMoment).isoWeekday(weekStart)`; if
  that lands **after** `currMoment`, back up a week:
  `moment(currMoment).subtract(7,'day').isoWeekday(weekStart)`.
- `'weekly'` and `weekStart === 0` → `moment(currMoment).startOf('week')`
  (**locale-dependent** — moment's `startOf('week')` follows the active
  `moment.locale()`, which `reducers/index.ts` mutates globally to `ko`/`ja`/`zh-cn`/`id`/`en`).

### 4.3 `renderCalendarView(calFormat, argMoment, eventsMap)` (L225-295)

```
startOfArgMoment = getStartMoment(calFormat, argMoment)
todayMoment      = moment(props.today)                       // = now
argDaysCount     = monthly ? argMoment.daysInMonth() : 7
offset           = monthly ? (startOfArgMoment.isoWeekday() - weekStart + 7) % 7 : 0

renderIndex = 0; days = []; weekRows = []
loop forever:
    dayIndex   = renderIndex - offset
    isoWeekday = (renderIndex + weekStart) % 7      // 0=Sun..6=Sat column index
    thisMoment = startOfArgMoment + dayIndex days

    selectedDay = thisMoment.month() === selected.month()
               && thisMoment.date()  === selected.date()     // <-- YEAR IS IGNORED (bug)

    if 0 <= dayIndex < argDaysCount:
        days.push(<Day
            key={renderIndex}                                // 0..41, NOT date-based
            isWeekend={isoWeekday === 0 || isoWeekday === 6}
            caption={thisMoment.format('D')}
            isToday={today.format('YYYY-MM-DD') === thisMoment.format('YYYY-MM-DD')}
            isSelected={selectedDay}
            event={eventsMap[thisMoment.format('YYYY-MM-DD')]
                || eventsMap[thisMoment.format('YYYYMMDD')]}  // dual-key lookup
            onPress={() => { selectMoment(thisMoment); onDateSelect(thisMoment.format()); }}
            ... />)
    else:
        days.push(<Day key={renderIndex} filler />)

    if renderIndex % 7 === 6:
        weekRows.push(<View key={weekRows.length}
                            onLayout={weekRows.length ? undefined : onWeekRowLayout}>
                        {days}
                      </View>)
        days = []
        if dayIndex + 1 >= argDaysCount: break
    renderIndex += 1

return <View key={`${startOfArgMoment.format('YYYY-MM-DD')}-${calFormat}`}
             style={[styles.monthContainer, customStyle.monthContainer]}>
         {weekRows}
       </View>
```

Consequences worth preserving/rejecting:

- Every row is exactly 7 columns; leading and trailing out-of-month slots are
  **blank fillers**, never adjacent-month day numbers.
- Row count is `getNumberOfWeeks(...)` → **the grid height changes between months**
  (4/5/6 rows), which is why the paging `ScrollView` height is wrong for
  neighbouring pages (see §5.3).
- `isoWeekday` here is a misnomer: it is a 0-6 **column index where 0 = Sunday**;
  weekend = column 0 or 6 in Sunday-anchored terms, and the arithmetic is correct
  for any `weekStart` because moment's `isoWeekday() ≡ day() (mod 7)`.
- `todayIndex = todayMoment.date() - 1` (L233) is computed and **never used**.
- `startOfMonth` is passed to `Day` (L255) and **never used**.

### 4.4 `renderHeading()` (L297-325)

Seven `<Text>` where `j = (i + weekStart) % 7`, label = `dayHeadings[j]`, style =
`weekendHeading` if `j === 0 || j === 6` else `dayHeading`. Container
`styles.calendarHeading` = `flexDirection: 'row'`, `height: '$40'`.
`renderHeading(this.props.titleFormat)` is called with an argument the function ignores.

### 4.5 `renderTopBar()` (L297/L327-392)

- `showControls === false`: one `<Text style={titleText}>{current.format(titleFormat)}</Text>`.
- `showControls === true`:
  - Title `TouchableOpacity` (activeOpacity 0.5) rendering
    `` `${current.year()} ${monthNames[current.month()]}` `` plus an inline
    `<Image source={require('@assets/imgs/btnChoice.png')} style={styles.imgBtnDown}/>`.
    → opens the modal date picker.
  - A `row` `View` with two `TouchableOpacity` wrapping `prevBtn` / `nextBtn`.

### 4.6 `render()` (L394-442)

```
calendarDates = getStack(currentMoment.current)                   // 5 pages or 1
eventDatesMap = prepareEventDates(eventDates, events)             // rebuilt EVERY render
numOfWeeks    = calendarFormat === 'weekly' ? 1
                                            : getNumberOfWeeks(currentMoment.current, weekStart)
<View style={calendarContainer}>
  {renderTopBar()}
  {renderHeading()}
  {scrollEnabled
    ? <ScrollView horizontal pagingEnabled scrollEnabled
                  removeClippedSubviews={removeClippedSubviews}
                  scrollEventThrottle={1000}
                  showsHorizontalScrollIndicator={false}
                  automaticallyAdjustContentInsets={false}
                  onMomentumScrollEnd={scrollEnded}
                  style={{height: rowHeight ? rowHeight * numOfWeeks : null}}>
        {calendarDates.map(d => renderCalendarView(calendarFormat, moment(d), eventDatesMap))}
      </ScrollView>
    : <View>{calendarDates.map(...)}</View>}
  <DateTimePicker mode='date' titleIOS='DATE' isVisible={showDatePicker}
                  onConfirm={selectDate} onCancel={...}/>
</View>
```

---

## 5. The paging model

### 5.1 `VIEW_INDEX = 2` (L23) and `getStack` (L96-111)

```js
getStack(currentMoment) {
  if (this.props.scrollEnabled) {
    const res = [];
    for (let i = -VIEW_INDEX; i <= VIEW_INDEX; i++) {              // -2..+2
      res.push(this.props.calendarFormat === 'monthly'
        ? moment(currentMoment).add(i, 'month')
        : moment(currentMoment).add(i, 'week'));
    }
    return res;                                                    // 5 pages
  }
  return [moment(currentMoment)];                                  // 1 page
}
```

- **5 full grids are mounted at all times**, centre = index 2 = `currentMoment.current`.
- Monthly: 5 × up to 42 `Day` components = **up to 210 connected components mounted**.
- Weekly: 5 × 7 = 35.
- Page width = `this.props.width` (default `336 * ratio`); `monthContainer` width
  is `'$336'` = `336 * ratio`. These are two independent constants that happen to match.

### 5.2 Recentering

```js
componentDidMount()  { this.scrollToItem(VIEW_INDEX); this.props.onDateSelect(moment().format()); }
componentDidUpdate() { this.scrollToItem(VIEW_INDEX); }

scrollToItem(itemIndex) {
  const scrollToX = itemIndex * this.props.width;
  if (this.props.scrollEnabled && this._calendar) {
    InteractionManager.runAfterInteractions(() => {
      this._calendar.scrollTo({y: 0, x: scrollToX, animated: false});
    });
  }
}
```

`componentDidUpdate` re-centers on **every** update — including a mere day
selection — which is the visible jank: tapping a day can yank the horizontal
scroll position.

### 5.3 Swipe → month change

```js
scrollEnded(event) {
  const position    = event.nativeEvent.contentOffset.x;
  const currentPage = position / this.props.width;                 // float in practice
  const newMoment   = this.props.calendarFormat === 'monthly'
    ? moment(this.props.currentMoment.current).add(currentPage - VIEW_INDEX, 'month')
    : moment(this.props.currentMoment.current).add(currentPage - VIEW_INDEX, 'week');
  this.props.dispatch(updateCurrentMoment(newMoment));
  InteractionManager.runAfterInteractions(() => {
    if (currentPage < VIEW_INDEX) this.props.onSwipePrev && this.props.onSwipePrev(newMoment);
    else if (currentPage > VIEW_INDEX) this.props.onSwipeNext && this.props.onSwipeNext(newMoment);
  });
}
```

- `currentPage` is a raw float division, not rounded → sub-pixel offsets feed
  `moment.add(float, 'month')` (moment truncates, but it is unguarded).
- `scrollEventThrottle={1000}` is meaningless here (no `onScroll` handler).
- Dispatch → new stack → `componentDidUpdate` → non-animated `scrollTo(2 * width)`
  → visually continuous.

### 5.4 Button paging

`onPrev` / `onNext` (L155-169) compute `current ∓ 1 month|week`, call
`onTouchPrev`/`onTouchNext` first, then `dispatch(updateCurrentMoment(newMoment))`.
There is **no animation** — the whole stack is re-rendered and re-centered.

### 5.5 `calendarFormat: 'monthly' | 'weekly'`

| Aspect | `'monthly'` | `'weekly'` |
|---|---|---|
| Page step | `add(i, 'month')` | `add(i, 'week')` |
| Page start | `startOf('month')` | `isoWeekday(weekStart)` (or locale `startOf('week')` if `weekStart===0`) |
| Cells per page | `daysInMonth()` + leading/trailing fillers → 28/35/42 | exactly 7, `offset = 0`, no fillers |
| `numOfWeeks` for height | `getNumberOfWeeks(current, weekStart)` | hard-coded `1` |

BooKoo never uses `'weekly'`, but the mode is part of the component's contract.

### 5.6 Row height measurement (`onWeekRowLayout`, L198-202)

```js
onWeekRowLayout = (event) => {
  if (this.state.rowHeight !== event.nativeEvent.layout.height) {
    this.setState({ rowHeight: event.nativeEvent.layout.height });
  }
}
```

Attached via `onLayout={weekRows.length ? undefined : this.onWeekRowLayout}` — i.e.
to the **first** week row of **each** of the 5 rendered pages, because `weekRows` is
a per-page local. So on mount there are up to 5 layout callbacks racing into one
shared `rowHeight` number, each `setState` triggering a re-render + a re-center.

The `ScrollView`'s height is `rowHeight * numOfWeeks` where `numOfWeeks` is computed
**only for the centre month**. A 5-row May next to a 6-row June is therefore clipped
or padded. Nominal geometry from `styles.ts` (all in `ratio` units):

- `dayButton`: `40×40`, `margin: 4` → occupies `48×48`
- `weekendDayButton`: `40×44`, `margin: 4` → occupies `48×52`
- `dayButtonFiller`: `40×40`, `margin: 4` → `48×48`

→ a week row containing at least one real weekend day measures `52 * ratio`;
a row whose weekend slots are all fillers measures `48 * ratio`. **The measured
row height is therefore month-dependent** — a latent 4 px × `ratio` error.

`ratio` itself (`src/utils/Styles.ts`):

```js
const {width, height} = Dimensions.get('window');
const ratio       = 16 * (width / height);
const screenRatio = (ratio < 9 ? width / 9 : height / 16) / (360 / 9);   // exported as `ratio`
```

On a 390×844 phone → `1.0833`; on an 820×1180 iPad → `1.84`. So "tablet support"
in the legacy app is nothing but uniform up-scaling of a fixed `336`-unit-wide
calendar. **There is no tablet layout.**

---

## 6. How selected / today / event-dot states are computed

### 6.1 `isSelected` (Calendar L246-251)

```js
const selectedMomentMonth = this.props.currentMoment.selected.month();
const selectedMomentDate  = this.props.currentMoment.selected.date();
let selectedDay = false;
if (thisMomentMonth === selectedMomentMonth && thisMomentDate === selectedMomentDate) {
  selectedDay = true;
}
```

**Bug: the year is not compared.** With the 5-page stack, 2025-08-24 and 2026-08-24
both render as selected. Must be `isSameDay(a, b)` in the rewrite.

### 6.2 `isToday` (Calendar L263)

```js
isToday={todayMoment.format('YYYY-MM-DD') === thisMoment.format('YYYY-MM-DD')}
```

Correct (string compare of full date), but `todayMoment` is recomputed per render
and never invalidated at midnight.

### 6.3 Event lookup (Calendar L265-266, `prepareEventDates` L113-129)

```js
prepareEventDates(eventDates, events) {
  const parsedDates = {};
  if (events) { events.forEach(e => { if (e.date) parsedDates[e.date] = e; }); }
  else        { eventDates.forEach(d => { parsedDates[d] = {}; }); }
  return parsedDates;
}
// lookup:
event={eventsMap[thisMoment.format('YYYY-MM-DD')] || eventsMap[thisMoment.format('YYYYMMDD')]}
```

The **map itself is O(1)** — but it is rebuilt from an array on **every render**, and
the array upstream was built in O(n²). Two `moment().format()` allocations per cell
per render (up to 420 format calls per render for a 5-page monthly stack).

### 6.4 Visual resolution in `Day`

`dayCircleStyle(isWeekend, isSelected, isToday, event)` (Day L31-72):

```
base: styles.dayCircleFiller        // 40×40, radius 20, transparent
if isSelected:  push styles.selectedDayCircle          // radius 20, bg rgb(29,211,168)
                push globalStyles.back{selectedLedger.info.color}   // 0..5, default back3
if event:       push isSelected ? [styles.hasEventDaySelectedCircle, customStyle..., event.hasEventDaySelectedCircle]
                               : [styles.hasEventCircle,           customStyle..., event.hasEventCircle]
```

`styles.currentDayCircle` (green `rgb(29,211,168)`) exists but its call site is
commented out (Day L36-41) → **today never gets a circle**, only red text.

`dayTextStyle` (Day L74-90) — strict if/else-if chain:

```
base: styles.day (16 * ratio, color rgb(65,77,107))
if (isToday && !isSelected)      -> styles.currentDayText   // color 'red'
else if (isToday || isSelected)  -> styles.selectedDayText  // white, bold
else if (isWeekend)              -> styles.weekendDayText   // '#cccccc'
if (event)                       -> styles.hasEventText (empty {}) + overrides
```

Ledger colour map (`globalStyles` in `src/utils/Styles.ts` + tokens in `BaseStyles.ts`):

| `selectedLedger.info.color` | style | value |
|---|---|---|
| 0 | `back0` | `$red` = `rgb(255,114,141)` |
| 1 | `back1` | `$orange` = `rgb(246,166,35)` |
| 2 | `back2` | `$yellow` = `rgb(238,209,0)` |
| 3 | `back3` | `$green` = `rgb(29,211,168)` |
| 4 | `back4` | `$blue` = `rgb(103,158,255)` |
| 5 | `back5` | `$purple` = `rgb(182,105,249)` |
| other | `back3` | green (fallback) |

Event dot (Day L117-127 + styles L90-101), rendered only when `showEventIndicators`:

```
<View style={[ styles.eventIndicatorFiller,      // 4×4, radius 2, transparent border
               customStyle.eventIndicatorFiller,
               event && styles.eventIndicator,   // bg $mediumGrey '#869ab7',
                                                 // position absolute, top 8, right 8
               event && customStyle.eventIndicator,
               event && event.eventIndicator ]}/>
```

Note: the dot is a sibling of the circle inside `dayButton` (which is
`justifyContent/alignItems: center`), absolutely positioned `top: '$8' right: '$8'`
— **`right` is not RTL-safe**.

Hard-coded colours with no dark-mode story: `calendarContainer` `#fff`,
`titleText`/`day` `rgb(65,77,107)`, `dayHeading` `rgb(175,194,219)`,
`weekendHeading` `rgb(219,177,175)`, `weekendDayButton` bg `#fafafa`,
`weekendDayText` `#cccccc`, `currentDayText` `red`, `selectedDayText` `white`.

---

## 7. Redux integration — and how it becomes a controlled component

### 7.1 Legacy wiring

```
Calendar  = connect(state => ({currentMoment: state.currentMoment}))(Calendar)   // index.tsx L445-449
Day       = connect(state => ({selectedLedger: state.selectedLedger}))(Day)      // Day.tsx L134-138
```

`src/reducers/index.ts`:

```js
const initialState = { currentMoment: { current: moment(), selected: moment() }, ... };

function currentMoment(state = initialState.currentMoment, action) {
  switch (action.type) {
    case 'MOMENT_SELECT_SELECTED': return {...state, selected: action.value};
    case 'MOMENT_SELECT_CURRENT':  return {...state, current:  action.value};
    default: return state;
  }
}
```

`src/actions/index.ts`:

```js
export function updateSelectedDate(input)  { return {type: 'MOMENT_SELECT_SELECTED', value: input}; }
export function updateCurrentMoment(input) { return {type: 'MOMENT_SELECT_CURRENT',  value: input}; }
```

**Moment objects are stored directly in the Redux store** — non-serializable,
mutable, and `Tab3.tsx` even mutates them in place (`this.state.currentMoment.subtract(1,'month')`
at Tab3 L330/L346).

Other readers of `state.currentMoment.current`: `Tab2.tsx` L39-40 (month filter),
`Tab3.tsx` L69/88-89/105-106/219 (charts), `LedgerLineGraph.tsx` L45-46/94/130/171.
So `current` is a **global "visible month"** shared across four screens, while
`selected` is only consumed inside the Calendar.

### 7.2 Data flow on a day tap

```
Day.onPress (new closure per render)
  └─ Calendar.selectMoment(thisMoment)
       └─ dispatch(updateSelectedDate(moment))        → store.currentMoment.selected
  └─ props.onDateSelect(thisMoment.format())
       └─ Tab1.handleSelectDate(isoString)
            └─ full O(n) scan of selectedLedger.items + sort  → setState
store change
  └─ Calendar re-renders 5 pages × 42 Day
  └─ each connected Day re-runs its own mapStateToProps
  └─ componentDidUpdate → scrollToItem(2)             ← scroll yank
```

### 7.3 Target: fully controlled, zero global state

The cpk-ui `<Calendar>` must own **no** application state and must not know about
Redux/zustand/Convex.

| Legacy concept | Controlled replacement |
|---|---|
| `state.currentMoment.selected` (Moment) | `value?: Date \| 'yyyy-MM-dd' \| null` + `onChange(date, key)` |
| `state.currentMoment.current` (Moment) | `visibleMonth?: Date \| 'yyyy-MM'` + `onVisibleMonthChange(date, key)` |
| `dispatch(updateSelectedDate(m))` | caller's `onChange` handler |
| `dispatch(updateCurrentMoment(m))` | caller's `onVisibleMonthChange` handler |
| `connect()` inside `Day` for ledger colour | `theme` / `selectedColor` prop, resolved once in the parent |
| `props.onDateSelect(isoString)` fired on mount | **removed** — mounting must not select anything; the caller sets `defaultValue` |
| `events: Array<{date}>` rebuilt each render | `markers: Readonly<Record<'yyyy-MM-dd', CalendarMarker>>` built once by the caller |

Uncontrolled convenience is still supported (`defaultValue` / `defaultVisibleMonth`)
via an internal `useControllableState`, but the controlled path is canonical.

**BooKoo app side (outside cpk-ui):** a `useCalendarStore` (zustand) holds
`{selectedDateKey: string; visibleMonthKey: string}` as **plain `yyyy-MM-dd` /
`yyyy-MM` strings** (serializable, MMKV-persistable). Markers come from a Convex
query scoped to the visible month
(`api.ledgerStats.dayMarkers({ledgerId, month: 'yyyy-MM'})`) backed by a rollup
table / `@convex-dev/aggregate`, never from scanning `items` on the client.

---

## 8. moment.js → date-fns migration table (every call in the legacy calendar path)

Target: **`date-fns@^4.1.0`** + `date-fns/locale` (`enUS`, `ko`, `ja`, `zhCN`, `id`).
Never import `moment`. All keys/formats use date-fns tokens (`yyyy`, not `YYYY`).

### 8.1 `Calendar/index.tsx`

| Line | moment | date-fns |
|---|---|---|
| L26 | `moment(month).startOf('month').day()` | `getDay(startOfMonth(month))` |
| L28 | `moment(month).daysInMonth()` | `getDaysInMonth(month)` |
| L85 | `moment().format()` | `formatISO(new Date())` (both emit `yyyy-MM-dd'T'HH:mm:ssXXX`) |
| L103 | `moment(m).add(i, 'month')` | `addMonths(m, i)` |
| L105 | `moment(m).add(i, 'week')` | `addWeeks(m, i)` |
| L110, L426, L429 | `moment(x)` (clone) | `new Date(x)` — or nothing; `Date` is copied by `addX` anyway |
| L139 | `moment(date)` (from picker) | `new Date(date)` |
| L144 | `newMoment.format()` | `formatISO(d)` |
| L157 | `moment(x).subtract(1, 'month')` | `subMonths(x, 1)` |
| L158 | `moment(x).subtract(1, 'week')` | `subWeeks(x, 1)` |
| L165 | `moment(x).add(1, 'month')` | `addMonths(x, 1)` |
| L166 | `moment(x).add(1, 'week')` | `addWeeks(x, 1)` |
| L184 | `moment(x).add(delta, 'month')` | `addMonths(x, Math.round(delta))` |
| L185 | `moment(x).add(delta, 'week')` | `addWeeks(x, Math.round(delta))` |
| L209 | `moment(x).startOf('month')` | `startOfMonth(x)` |
| L212 | `moment(x).startOf('week')` | `startOfWeek(x, {weekStartsOn: 0})` — **must be explicit**; moment's was locale-global |
| L214 | `moment(x).isoWeekday(weekStart)` | `startOfWeek(x, {weekStartsOn: weekStart as Day})` (equivalent for the `weekStart>0` branch) |
| L215 | `res.diff(currMoment) > 0` | `isAfter(res, curr)` |
| L216 | `moment(x).subtract(7,'day').isoWeekday(ws)` | `startOfWeek(subDays(x, 7), {weekStartsOn: ws})` |
| L232 | `moment(this.props.today)` | `today ?? new Date()` |
| L233 | `todayMoment.date() - 1` | `getDate(today) - 1` *(dead code — delete)* |
| L234 | `argMoment.daysInMonth()` | `getDaysInMonth(argDate)` |
| L236 | `startOfArgMoment.isoWeekday()` | `getISODay(d)` (1=Mon..7=Sun); or `getDay(d)` (0=Sun..6=Sat) — the `% 7` makes them interchangeable |
| L242 | `moment(start).add(dayIndex, 'day')` | `addDays(start, dayIndex)` |
| L244 | `thisMoment.month()` | `getMonth(d)` (0-based, same as moment) |
| L245, L247 | `.date()` | `getDate(d)` |
| L246 | `selected.month()` | `getMonth(selected)` |
| L249 | `m1.month()===m2.month() && m1.date()===m2.date()` | **replace with `isSameDay(d1, d2)`** (fixes the missing-year bug) |
| L262 | `thisMoment.format('D')` | `format(d, 'd')` — or, cheaper, `String(getDate(d))` |
| L263 | `a.format('YYYY-MM-DD') === b.format('YYYY-MM-DD')` | `isSameDay(a, b)` |
| L265 | `thisMoment.format('YYYY-MM-DD')` | `format(d, 'yyyy-MM-dd')` |
| L266 | `thisMoment.format('YYYYMMDD')` | `format(d, 'yyyyMMdd')` *(drop — single canonical key)* |
| L294 | `startOfArgMoment.format('YYYY-MM-DD')` | `format(d, 'yyyy-MM-dd')` |
| L328 | `currentMoment.current.month()` | `getMonth(d)` |
| L347 | `currentMoment.current.year()` | `getFullYear(d)` |
| L388 | `current.format('MMMM YYYY')` | `format(d, 'MMMM yyyy', {locale})` |

### 8.2 `Tab1.tsx`

| Line | moment | date-fns |
|---|---|---|
| L38, L59, L114 | `moment(a).isSame(moment(b), 'd')` | `isSameDay(a, b)` |
| L46, L122 | `new Date(b.selectedDate) - new Date(a.selectedDate)` | `compareDesc(a.selectedDate, b.selectedDate)` |
| L65 | `moment(d).format(DATE_FORMAT)` where `DATE_FORMAT='YYYY-MM-DD'` | `format(d, 'yyyy-MM-dd')` |

### 8.3 `reducers/index.ts`

| Line | moment | date-fns |
|---|---|---|
| L9, L10 | `moment()` (initial `current`/`selected`) | `format(new Date(), 'yyyy-MM-dd')` — store **strings**, not Date objects |
| L47-59 | `moment.locale('ja'\|'ko'\|'zh-cn'\|'id'\|'en')` (global mutation) | `import {ja, ko, zhCN, id, enUS} from 'date-fns/locale'` and pass `{locale}` per call; resolve once in a `useDateLocale()` hook |

### 8.4 Format-token cheat sheet (moment → date-fns)

| moment | date-fns | note |
|---|---|---|
| `YYYY` | `yyyy` | calendar year (`YYYY` in date-fns is *week-numbering* year — a classic bug) |
| `YY` | `yy` | |
| `MM` / `MMM` / `MMMM` | `MM` / `MMM` / `MMMM` | identical |
| `DD` | `dd` | `DD` in date-fns is day-of-year |
| `D` | `d` | `D` in date-fns is day-of-year |
| `Do` | `do` | ordinal |
| `ddd` / `dddd` | `EEE` / `EEEE` | weekday name |
| `A` / `a` | `a` | AM/PM |
| `HH`,`mm`,`ss` | `HH`,`mm`,`ss` | identical |
| `.format()` (no args) | `formatISO(d)` | |
| — | `'PPPP'` | localized full date, ideal for a11y labels |

Concretely: `DATE_FORMAT: 'YYYY-MM-DD'` → `'yyyy-MM-dd'`;
`DATE_FORMAT_DAYS: 'MMMM Do (ddd)'` → `'MMMM do (EEE)'`;
`titleFormat: 'MMMM YYYY'` → `'MMMM yyyy'`.

---

## 9. Defect / perf inventory of the legacy component (what the rewrite must fix)

| # | Location | Defect |
|---|---|---|
| D1 | index.tsx L249 | `isSelected` ignores the **year** — same day in a different year highlights. |
| D2 | index.tsx L88-90 | `componentDidUpdate` re-centers the scroll on *every* update, including selection. |
| D3 | index.tsx L83-86 | `componentDidMount` fires `onDateSelect(now)` unconditionally — a mount-time side effect the caller cannot opt out of. |
| D4 | index.tsx L142 vs L93 | `this.dateTimeer` (typo) is assigned; `clearInterval(this.dateTimer)` clears nothing → 100 ms timer survives unmount and calls `setState` on an unmounted component. Also `clearInterval` for a `setTimeout`. |
| D5 | index.tsx L96-111 | 5 pages always mounted (`VIEW_INDEX = 2`) — up to **210 `Day` components**; a 3-page window is sufficient. |
| D6 | Day.tsx L134-138 | Every `Day` is `connect()`ed → up to 210 individual store subscriptions, all re-running `mapStateToProps` on any store change. |
| D7 | index.tsx L258-261 | `onPress` is a fresh arrow closure per cell per render → no `React.memo` can ever bail out. |
| D8 | index.tsx L396 | `prepareEventDates` rebuilds the whole map on every render. |
| D9 | Tab1.tsx L53-74 | `checkEventDates` is O(n²) with 2 `moment()` per comparison over **all** ledger items. |
| D10 | Tab1.tsx L108-132 | `handleSelectDate` linearly scans + sorts all items on every tap. |
| D11 | index.tsx L397-399 + L423 | `numOfWeeks` is computed for the centre month only, but the height applies to all 5 pages → clipped/padded neighbours. |
| D12 | index.tsx L278 | `onLayout` attaches to the first row of **each** page (5 racing `setState`s into one `rowHeight`). |
| D13 | styles.ts | Row height varies (48 vs 52 `ratio` units) depending on whether the row's weekend slots are fillers. |
| D14 | index.tsx L182 | `currentPage = position / width` is an unrounded float fed into `add(n, 'month')`. |
| D15 | styles.ts + Day.tsx | Entirely hard-coded light-mode colours; no theme, no dark mode. |
| D16 | styles.ts L99 | `eventIndicator` uses `right: '$8'` — breaks under RTL. |
| D17 | styles.ts L8/L13 | Fixed `336 * ratio` width; no tablet/landscape layout, only uniform scaling. |
| D18 | index.tsx L232 | "Today" is captured at render time and never refreshed at midnight (the dead `dateTimer` was presumably meant for this). |
| D19 | index.tsx L212 | `startOf('week')` depends on the process-global `moment.locale()` mutated by the reducer. |
| D20 | Day.tsx L92-131 | No `accessibilityRole`/`accessibilityLabel`/`accessibilityState` anywhere; screen readers announce a bare number. |
| D21 | index.tsx L39, L44-47 | `currentMonth` and `nextButtonText` are declared/passed but never read; `startOfMonth` and `todayIndex` are dead. |
| D22 | index.tsx L412-427 | A horizontal `ScrollView` nested inside `ParallaxScrollView`'s vertical `ScrollView` (Tab1 L180) — no gesture arbitration. |
| D23 | index.tsx L432-439 | `DateTimePicker` is mounted inside the calendar and coupled to `showControls`; a UI-library calendar should not own a modal. |

---

## 10. Proposed modern API — `cpk-ui` `<Calendar>`

Target home:
`/Users/hyo/Github/crossplatformkorea/cpk-ui/src/components/uis/Calendar/`
(`Calendar.tsx`, `Calendar.test.tsx`, `Calendar.stories.tsx`, plus internal
`CalendarDay.tsx`, `CalendarGrid.tsx`, `CalendarHeader.tsx`, `utils.ts`, `types.ts`),
exported from `src/index.tsx` as `export * from './components/uis/Calendar/Calendar';`.

Repo conventions observed and to be followed
(`/Users/hyo/Github/crossplatformkorea/cpk-ui`):
- Styling with `import {styled, css} from 'kstyled'` (kstyled `0.4.1`).
- Theme via `import {useTheme} from '../../../providers/ThemeProvider'` →
  `{theme, themeType, media: {isPortrait, isMobile, isTablet, isDesktop}, changeThemeType}`.
- Theme tokens: `theme.bg.{basic,paper,disabled}`,
  `theme.role.{primary,secondary,success,warning,danger,info,accent,link,border,underlay,underlayContrast}`,
  `theme.text.{basic,label,placeholder,disabled,validation,contrast}`,
  `theme.button.<variant>.{bg,text}`.
- Public components **must** ship a colocated `*.test.tsx` (enforced by
  `scripts/check-component-coverage.js`) and a `*.stories.tsx`
  (`scripts/check-story-coverage.js`). `bun run test:all` before PR.
- Conventional commits: `feat(calendar): add controlled month calendar`.
- Available peers already in `package.json`: `react-native-reanimated ~4.1.1`,
  `react-native-gesture-handler ~2.28.0`, `react-native-svg 15.12.1`,
  `react-responsive ^10.0.1`. **`react-native-pager-view` is not a dependency** →
  build paging on reanimated + gesture-handler, add `date-fns` as the only new
  (peer) dependency.

### 10.1 Types

```ts
// types.ts
import type {Locale} from 'date-fns';
import type {StyleProp, TextStyle, ViewStyle} from 'react-native';

/** Canonical day key. ALWAYS `yyyy-MM-dd`, local time, zero-padded. */
export type CalendarDateKey = string;
/** Canonical month key. ALWAYS `yyyy-MM`. */
export type CalendarMonthKey = string;

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type CalendarViewMode = 'month' | 'week';

export type CalendarDot = {
  /** stable identity for the dot within a day (used as React key) */
  key: string;
  /** defaults to theme.role.primary */
  color?: string;
};

/** Everything a single day cell can be decorated with. Looked up O(1) by key. */
export type CalendarMarker = {
  dots?: readonly CalendarDot[];
  /** overrides the selected-pill background for this day */
  selectedColor?: string;
  /** overrides the day-number color */
  textColor?: string;
  /** small text under the number (e.g. a daily total). Keep it <= 6 chars. */
  badgeText?: string;
  badgeColor?: string;
  disabled?: boolean;
  /** appended to the cell's accessibilityLabel, e.g. "3 entries, 42,000 KRW" */
  accessibilityHint?: string;
};

export type CalendarMarkerMap = Readonly<Record<CalendarDateKey, CalendarMarker>>;

export type CalendarDayModel = {
  key: CalendarDateKey;
  date: Date;
  dayOfMonth: number;      // 1..31
  /** 0 = Sunday .. 6 = Saturday, independent of weekStartsOn */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** true when the cell belongs to the previous/next month */
  isOutside: boolean;
};

export type CalendarLabels = {
  previousMonth?: string;      // default 'Previous month'
  nextMonth?: string;          // default 'Next month'
  previousWeek?: string;
  nextWeek?: string;
  today?: string;              // default 'Today'
  /** announced by the live region when the page changes */
  monthAnnouncement?: (monthLabel: string) => string;
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
  dot?: StyleProp<ViewStyle>;
};

/** Palette overrides that sit on top of the cpk-ui theme. */
export type CalendarColors = {
  selectedBackground?: string;   // default theme.role.primary
  selectedText?: string;         // default theme.text.contrast
  todayText?: string;            // default theme.role.secondary
  todayRing?: string;            // default theme.role.secondary
  dayText?: string;              // default theme.text.basic
  outsideText?: string;          // default theme.text.disabled
  disabledText?: string;         // default theme.text.disabled
  weekendText?: string;          // default theme.text.label
  sundayText?: string;           // default theme.role.danger  (KR/JP convention)
  saturdayText?: string;         // default theme.role.info
  weekdayLabel?: string;         // default theme.text.label
  headerText?: string;           // default theme.text.basic
  background?: string;           // default 'transparent'
  dot?: string;                  // default theme.role.primary
};

export type CalendarRef = {
  goToMonth: (month: Date | CalendarMonthKey, animated?: boolean) => void;
  goToToday: (animated?: boolean) => void;
  next: (animated?: boolean) => void;
  previous: (animated?: boolean) => void;
};
```

### 10.2 Props

```ts
export type CalendarProps = {
  // ── selection (controlled / uncontrolled) ────────────────────────────────
  /** Controlled selected day. `null` clears selection. */
  value?: Date | CalendarDateKey | null;
  /** Uncontrolled initial selection. Ignored when `value` is provided. */
  defaultValue?: Date | CalendarDateKey | null;
  /** Fired only on user interaction. Never fired on mount. */
  onChange?: (date: Date, key: CalendarDateKey) => void;

  // ── paging (controlled / uncontrolled) ───────────────────────────────────
  /** Controlled visible page. Any date inside the month/week. */
  visibleMonth?: Date | CalendarMonthKey;
  defaultVisibleMonth?: Date | CalendarMonthKey;
  onVisibleMonthChange?: (
    firstDayOfPage: Date,
    key: CalendarMonthKey,
    source: 'swipe' | 'button' | 'imperative',
  ) => void;

  // ── calendar math ────────────────────────────────────────────────────────
  mode?: CalendarViewMode;             // default 'month'   (legacy calendarFormat)
  weekStartsOn?: WeekStart;            // default 0
  locale?: Locale;                     // date-fns Locale, default enUS
  /** Injectable "now" — makes tests deterministic. Default: an internal clock that
   *  re-evaluates at local midnight (see §11.5). */
  today?: Date;

  // ── decorations ──────────────────────────────────────────────────────────
  /** O(1) lookup by 'yyyy-MM-dd'. MUST be referentially stable (useMemo). */
  markers?: CalendarMarkerMap;
  maxDotsPerDay?: number;              // default 3
  showDots?: boolean;                  // default true (legacy showEventIndicators)

  // ── constraints ──────────────────────────────────────────────────────────
  minDate?: Date | CalendarDateKey;
  maxDate?: Date | CalendarDateKey;
  /** Called only for dates inside the rendered window. Keep it pure and cheap. */
  isDateDisabled?: (date: Date, key: CalendarDateKey) => boolean;

  // ── layout / chrome ──────────────────────────────────────────────────────
  showHeader?: boolean;                // default true
  showNavigationButtons?: boolean;     // default true  (legacy showControls)
  showWeekdayRow?: boolean;            // default true
  /** false → blank filler cells like legacy. true → grey adjacent-month numbers. */
  showOutsideDays?: boolean;           // default true
  /** Always render 6 rows so the height never jumps between months. */
  fixedWeeks?: boolean;                // default true
  paging?: 'swipe' | 'none';           // default 'swipe'
  /** Number of pages rendered side by side. 1 on phones, 2 on tablet landscape. */
  monthsToShow?: 1 | 2 | 3;            // default: 1, auto-2 when `media.isTablet && !isPortrait`
  size?: 'compact' | 'regular' | 'expanded' | number; // day-cell edge in px; default responsive

  // ── theming / escape hatches ─────────────────────────────────────────────
  colors?: CalendarColors;
  styles?: CalendarStyles;
  style?: StyleProp<ViewStyle>;

  // ── render props (all optional, all must be stable refs) ─────────────────
  renderHeader?: (ctx: {monthLabel: string; date: Date; goNext: () => void; goPrev: () => void}) => React.ReactNode;
  renderWeekdayLabel?: (ctx: {weekday: 0|1|2|3|4|5|6; label: string}) => React.ReactNode;
  renderDay?: (ctx: {
    day: CalendarDayModel;
    isSelected: boolean;
    isToday: boolean;
    isDisabled: boolean;
    marker?: CalendarMarker;
  }) => React.ReactNode;

  // ── interaction ──────────────────────────────────────────────────────────
  onDayLongPress?: (date: Date, key: CalendarDateKey) => void;
  /** Fired when the user taps a disabled/out-of-range day (for toasts). */
  onDisabledDayPress?: (date: Date, key: CalendarDateKey) => void;

  // ── a11y / testing ───────────────────────────────────────────────────────
  labels?: CalendarLabels;
  accessibilityLabel?: string;
  testID?: string;
};

export declare const Calendar: React.ForwardRefExoticComponent<
  CalendarProps & React.RefAttributes<CalendarRef>
>;
```

### 10.3 Legacy → modern prop mapping

| Legacy | Modern |
|---|---|
| `currentMoment.selected` (redux) | `value` / `onChange` |
| `currentMoment.current` (redux) | `visibleMonth` / `onVisibleMonthChange` |
| `onDateSelect(isoString)` | `onChange(date, 'yyyy-MM-dd')` |
| `onSwipePrev` / `onSwipeNext` | `onVisibleMonthChange(d, k, 'swipe')` |
| `onTouchPrev` / `onTouchNext` | `onVisibleMonthChange(d, k, 'button')` |
| `calendarFormat: 'monthly'\|'weekly'` | `mode: 'month'\|'week'` |
| `scrollEnabled` | `paging: 'swipe' \| 'none'` |
| `showControls` | `showNavigationButtons` |
| `showEventIndicators` | `showDots` |
| `events: [{date, ...}]` | `markers: Record<'yyyy-MM-dd', CalendarMarker>` |
| `eventDates: string[]` | removed — build a `markers` map instead |
| `dayHeadings` | removed — derived from `locale` + `weekStartsOn`; override via `renderWeekdayLabel` |
| `monthNames` | removed — `format(d, 'LLLL yyyy', {locale})`; override via `renderHeader` |
| `titleFormat` | removed — `renderHeader` (or a `headerFormat?: string` escape hatch) |
| `prevBtn` / `nextBtn` | `renderHeader` |
| `nextButtonText`, `currentMonth` | dropped (dead) |
| `customStyle` (flat bag) | `styles` (typed) + `colors` |
| `width` | removed — the calendar fills its parent; `size` controls cell size |
| `removeClippedSubviews` | removed — internal windowing handles it |
| built-in `DateTimePicker` | removed — the app composes its own month picker and drives `visibleMonth` |

### 10.4 Usage in the new BooKoo

```tsx
const markers = useMemo<CalendarMarkerMap>(
  () => Object.fromEntries(
    dayStats.map((s) => [s.dateKey, {
      dots: [{key: 'x', color: theme.role.danger}],
      badgeText: s.netLabel,
      accessibilityHint: t('calendar.entryCount', {count: s.count}),
    }]),
  ),
  [dayStats, theme.role.danger, t],
);

<Calendar
  value={selectedDateKey}
  onChange={(_, key) => setSelectedDateKey(key)}
  visibleMonth={visibleMonthKey}
  onVisibleMonthChange={(_, key) => setVisibleMonthKey(key)}
  markers={markers}
  weekStartsOn={0}
  locale={dateLocale}
  colors={{selectedBackground: ledgerColor}}
/>
```

`dayStats` comes from a Convex query keyed by `('ledgerId', 'yyyy-MM')` reading a
rollup table — **never** from scanning ledger items on the device.

---

## 11. Internal architecture & performance requirements

### 11.1 Hard requirements (acceptance criteria)

1. **Selection change must not re-render the whole grid.** Changing `value` from
   `2026-08-10` to `2026-08-11` must produce **exactly 2** `CalendarDay` renders
   (the deselected cell and the selected cell). All other 40 cells must bail out of
   `React.memo`. Verified by a test that counts renders via a spy passed through
   `renderDay`, or by a `__DEV__` render counter.
2. **Marker lookup is O(1)** — a plain frozen object / `Map` keyed by `yyyy-MM-dd`.
   No array scans, no `.find`, no `filter`, no per-cell `format()` of the marker
   source. The component never accepts an array of events.
3. **At most 3 pages mounted** (previous / current / next), recycled on page change.
   Never 5, never the whole year.
4. **No `Date`/string formatting inside a day cell's render.** Every cell receives
   pre-computed primitives (`key`, `dayOfMonth`, `weekday`, `isOutside`) from a
   `useMemo`d grid model.
5. **Grid model is memoised** on `(monthKey, weekStartsOn, mode, fixedWeeks)` and
   cached in a module-level LRU (≤ 24 entries) so re-visiting a month is free.
6. **Stable callbacks.** `onPress` on a cell is `useCallback((key: string) => …)`
   created once and shared; the cell calls `onPress(day.key)`. No inline arrows.
7. **Fixed row height** — no `onLayout` measurement in the paging path. Height is
   `rowCount * (cellSize + rowGap)`, and with `fixedWeeks` (default) `rowCount === 6`
   so the container height is constant across months → no layout thrash, no
   clipped neighbour page.
8. **Zero context/store subscriptions inside a day cell.** Theme-derived colours are
   resolved once in the grid and passed down as a single frozen `palette` object.
9. Rendering the initial month must complete in **< 16 ms** on a mid-range Android
   (measure with `performance.now()` in the story; budget documented in the story docs).
10. `markers` identity change re-renders only the cells whose marker object identity
    changed (shallow compare inside the memo comparator).

### 11.2 Component tree

```
<Calendar>                        // resolves controlled state, locale, palette, ref API
 └─ <CalendarHeader/>             // memo; props: monthLabel, canGoPrev/Next, callbacks
 └─ <CalendarWeekdayRow/>         // memo on (locale, weekStartsOn, palette); a11y-hidden
 └─ <CalendarPager/>              // reanimated translateX, 3 recycled pages
     ├─ <CalendarPage monthKey='2026-07'/>   // memo
     ├─ <CalendarPage monthKey='2026-08'/>
     └─ <CalendarPage monthKey='2026-09'/>
          └─ <CalendarWeekRow/> ×6           // memo
               └─ <CalendarDay/> ×7          // memo with explicit comparator
```

`CalendarDay` props (all primitives or stable refs):

```ts
type CalendarDayProps = {
  dayKey: CalendarDateKey;
  dayOfMonth: number;
  weekday: 0|1|2|3|4|5|6;
  isOutside: boolean;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  marker?: CalendarMarker;      // stable object from the caller's map
  palette: CalendarPalette;     // frozen, created once per theme change
  cellSize: number;
  showDots: boolean;
  maxDots: number;
  onPress: (key: CalendarDateKey) => void;       // stable
  onLongPress?: (key: CalendarDateKey) => void;  // stable
  accessibilityLabel: string;   // precomputed in the grid memo
};

export const CalendarDay = React.memo(CalendarDayBase); // default shallow compare is enough
```

### 11.3 Grid builder (date-fns, no moment)

```ts
import {
  addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format,
  getDay, getDaysInMonth, startOfMonth, startOfWeek,
} from 'date-fns';

export const toDayKey   = (d: Date): CalendarDateKey   => format(d, 'yyyy-MM-dd');
export const toMonthKey = (d: Date): CalendarMonthKey  => format(d, 'yyyy-MM');
export const fromDayKey = (k: CalendarDateKey): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);           // local midnight; never `new Date('yyyy-MM-dd')` (UTC!)
};

export function buildMonthGrid(
  month: Date,
  weekStartsOn: WeekStart,
  fixedWeeks: boolean,
): readonly CalendarDayModel[] {
  const gridStart = startOfWeek(startOfMonth(month), {weekStartsOn});
  const cellCount = fixedWeeks
    ? 42
    : differenceInCalendarDays(endOfWeek(endOfMonth(month), {weekStartsOn}), gridStart) + 1;

  const targetMonth = month.getMonth();
  const cells: CalendarDayModel[] = new Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const date = addDays(gridStart, i);
    cells[i] = {
      key: toDayKey(date),
      date,
      dayOfMonth: date.getDate(),
      weekday: date.getDay() as CalendarDayModel['weekday'],
      isOutside: date.getMonth() !== targetMonth,
    };
  }
  return Object.freeze(cells);
}

export function buildWeekGrid(anchor: Date, weekStartsOn: WeekStart) {
  const gridStart = startOfWeek(anchor, {weekStartsOn});
  return Object.freeze(
    Array.from({length: 7}, (_, i) => { /* same shape, isOutside: false */ }),
  );
}
```

Equivalences with the legacy math (verify in tests):

- legacy `offset = (getISODay(startOfMonth) - weekStart + 7) % 7`
  ≡ `differenceInCalendarDays(startOfMonth(m), startOfWeek(startOfMonth(m), {weekStartsOn}))`.
- legacy `getNumberOfWeeks(m, ws) = ceil((offset + getDaysInMonth(m)) / 7)`
  ≡ `(differenceInCalendarDays(endOfWeek(endOfMonth(m), {weekStartsOn: ws}), startOfWeek(startOfMonth(m), {weekStartsOn: ws})) + 1) / 7`.

Weekday labels:

```ts
const weekdayLabels = useMemo(
  () => Array.from({length: 7}, (_, i) =>
    format(addDays(startOfWeek(new Date(), {weekStartsOn}), i), 'EEEEE', {locale})), // narrow
  [locale, weekStartsOn],
);
```

(`'EEEEE'` = narrow "M", `'EEEEEE'` = short "Mo", `'EEE'` = "Mon", `'ccc'` for
standalone form — Korean gives 월/화/수… with `'EEEEE'`.)

Header label: `format(pageDate, 'LLLL yyyy', {locale})` (`LLLL` = standalone month
name, which is the grammatically correct form in several locales; moment's `MMMM`
was the formatting form).

### 11.4 Paging implementation

- Dependency-light: `react-native-gesture-handler` `Gesture.Pan()` +
  `react-native-reanimated` `useSharedValue` / `useAnimatedStyle` — both are already
  cpk-ui dependencies. **Do not add `react-native-pager-view`.**
- Three absolutely-positioned pages inside a `View` of fixed width `W`
  (`onLayout` on the pager container only — once, not per row);
  `translateX = -W + gesture.x`. On release, `withSpring`/`withTiming` to
  `{-2W, -W, 0}` and `runOnJS(commitPage)(delta)`.
- `commitPage(delta)` calls `onVisibleMonthChange(addMonths(page, delta), key, 'swipe')`
  and then resets `translateX` to `-W` **in the same frame** while the page models
  shift — no visible jump, no `scrollTo` re-centering hack.
- RTL: `const dir = I18nManager.isRTL ? -1 : 1;` and multiply every translation and
  every `delta` sign by `dir`.
- Reduced motion: if `AccessibilityInfo.isReduceMotionEnabled()` → snap with
  `withTiming(…, {duration: 0})`.
- Web (`react-native-web`, cpk-ui ships a web build): fall back to
  `overflow-x: scroll; scroll-snap-type: x mandatory` when
  `Platform.OS === 'web'`, plus keyboard `ArrowLeft`/`ArrowRight` handlers.
- `paging: 'none'` → render exactly one page, no gesture detector at all
  (avoids the legacy nested-scroll conflict of D22).

### 11.5 "Today" clock

```ts
function useToday(explicit?: Date): Date {
  const [now, setNow] = useState(() => explicit ?? new Date());
  useEffect(() => {
    if (explicit) return;
    const msToMidnight = +endOfDay(new Date()) - Date.now() + 1000;
    const id = setTimeout(() => setNow(new Date()), msToMidnight);
    return () => clearTimeout(id);
  }, [explicit, now]);
  return explicit ?? now;
}
```

Only the two affected cells re-render because `isToday` is a memoised per-cell prop.
(Also fixes D4/D18 — a real `clearTimeout` on a correctly-named handle.)

### 11.6 Tablet / large-screen behavior

- Read `const {media} = useTheme();` (cpk-ui `ThemeProvider` already exposes
  `isPortrait / isMobile / isTablet / isDesktop` via `react-responsive`,
  breakpoints 767 / 992 in mobile-first mode).
- Default `size`: `compact` 36 px → `regular` 44 px (phone) → `expanded` 56 px
  (tablet/desktop). Minimum tappable size **44×44** at all breakpoints.
- Default `monthsToShow`: `media.isTablet && !media.isPortrait ? 2 : 1`; the pager
  steps by `monthsToShow` pages.
- Width: the calendar **fills its parent** (`width: '100%'`, `maxWidth` guard of
  `size * 7 * 1.6` so it does not stretch absurdly on desktop, `alignSelf: 'center'`).
  Cell width is `flex: 1` inside a `flexDirection: 'row'` week row — no fixed
  `336 * ratio`.
- No `Dimensions.get('window')` at module scope (legacy `styles.ts` L4 does this and
  never updates on rotation/split-view).

### 11.7 Theming

- All colours resolve from `useTheme().theme` and are merged with the `colors` prop
  into a single frozen `palette` object built in `useMemo([theme, colors])`.
- Defaults:
  | Slot | Token |
  |---|---|
  | day text | `theme.text.basic` |
  | outside/disabled text | `theme.text.disabled` |
  | weekday header text | `theme.text.label` |
  | selected pill bg | `theme.role.primary` |
  | selected pill text | `theme.text.contrast` |
  | today ring / text | `theme.role.secondary` |
  | Sunday text | `theme.role.danger` |
  | Saturday text | `theme.role.info` |
  | separator / border | `theme.role.border` |
  | pressed underlay | `theme.role.underlay` |
  | dot | `theme.role.primary` |
- Dark mode is automatic: `light`/`dark` palettes already exist in
  `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/utils/colors.ts`.
- Contrast rule: when `colors.selectedBackground` is supplied by the app (the BooKoo
  ledger colour), compute the label colour with a relative-luminance check rather
  than hard-coding white (legacy `selectedDayText` is always `white`, unreadable on
  `$yellow rgb(238,209,0)`).

### 11.8 RTL safety

- Never use `left` / `right` / `marginLeft` / `marginRight` / `paddingLeft` /
  `paddingRight`. Use `start` / `end` (the legacy dot at `top: 8, right: 8` becomes
  `top: 8, end: 8`).
- Keep `flexDirection: 'row'` — RN auto-flips it under RTL, which is the correct
  behavior for a calendar grid (first weekday column moves to the right edge).
- Invert the pager translation sign with `I18nManager.isRTL`.
- Day numbers must render with the locale's numbering; do not hand-build strings —
  use `format(date, 'd', {locale})` at grid-build time (cached), not per render.

### 11.9 Accessibility

| Element | Contract |
|---|---|
| Root | `accessibilityRole="none"`, `accessibilityLabel={accessibilityLabel ?? monthLabel}` |
| Header title | `accessibilityRole="header"`, `accessibilityLiveRegion="polite"` so page changes are announced |
| Prev/Next buttons | `accessibilityRole="button"`, `accessibilityLabel={labels.previousMonth ?? 'Previous month'}`, `accessibilityState={{disabled}}`, hit slop to 44×44 |
| Weekday row | `importantForAccessibility="no-hide-descendants"` / `accessibilityElementsHidden` (each day cell already announces its weekday) |
| Day cell | `accessibilityRole="button"`; `accessibilityLabel = format(date, 'PPPP', {locale})` (e.g. `2026년 8월 24일 월요일`), plus `marker.accessibilityHint`; `accessibilityState={{selected: isSelected, disabled: isDisabled}}`; `accessibilityHint` describes the action (`labels.selectDayHint`) |
| Today cell | append `labels.today` to the label (`"… , Today"`) — do not rely on colour alone |
| Marked cell | the dot must never be the sole signal — the hint carries the count |
| Filler / outside day when `showOutsideDays === false` | `accessibilityElementsHidden`, not focusable |
| Motion | honour `AccessibilityInfo.isReduceMotionEnabled()` |
| Contrast | all default pairs must clear WCAG AA 4.5:1 in both `light` and `dark`; add a unit test over `utils/colors.ts` pairs |

Reuse `/Users/hyo/Github/crossplatformkorea/cpk-ui/src/utils/accessibility.ts`
(`getButtonAccessibilityProps(label, disabled, pressed)`) for the nav buttons and
consider adding `getCalendarDayAccessibilityProps` there.

---

## 12. Behavior parity checklist (tests to write in `Calendar.test.tsx`)

1. Month grid for `2026-08` with `weekStartsOn: 0`, `fixedWeeks: false` → 6 rows,
   first cell `2026-07-26`, last `2026-09-05`.
2. `fixedWeeks: true` → always 42 cells for every month of 2024-2027.
3. `weekStartsOn: 1` shifts the grid by one column; weekday labels start at Monday.
4. `mode: 'week'` → exactly 7 cells, page step is 7 days.
5. Selecting a day calls `onChange(date, 'yyyy-MM-dd')` exactly once; the component
   does **not** call `onChange` on mount (legacy D3 regression).
6. Same day-of-month in a different year is **not** highlighted (legacy D1 regression).
7. `markers` lookup: a marker at `'2026-08-24'` renders a dot only on that cell.
8. Render-count test: changing `value` re-renders exactly 2 day cells.
9. Render-count test: changing an unrelated parent prop with stable `markers`
   re-renders **0** day cells.
10. Disabled: `minDate`/`maxDate`/`isDateDisabled` block `onChange` and fire
    `onDisabledDayPress`.
11. `today` injection makes "today" deterministic; the today cell carries the
    `labels.today` suffix in its `accessibilityLabel`.
12. Swiping right/left calls `onVisibleMonthChange` with source `'swipe'` and the
    correct adjacent month key; controlled `visibleMonth` that does not change means
    the pager springs back.
13. Locale: with `ko`, the header reads `2026년 8월` and weekday labels are
    `일 월 화 수 목 금 토`.
14. RTL: with `I18nManager.isRTL === true`, no style object contains `left`/`right`.
15. Dark theme snapshot differs from light theme snapshot (no hard-coded `#fff`).
16. `Calendar.stories.tsx` must cover: default, week mode, markers/dots, disabled
    ranges, Korean locale, dark theme, tablet (`monthsToShow: 2`), custom
    `renderDay`, controlled vs uncontrolled.

---

## 13. Open items for the implementation phase

- Decide whether `date-fns` becomes a **peer** dependency of cpk-ui (preferred, so
  the app owns the version and the locale bundles) or a direct dependency.
  BooKoo already commits to date-fns (`.notes/DECISIONS.md` §2).
- Whether `badgeText` (daily total under the number) belongs in the generic cpk-ui
  component or stays a BooKoo `renderDay`. Recommendation: keep `badgeText` in the
  marker type (it is generic enough) but let BooKoo use `renderDay` for currency
  formatting.
- Whether to also contribute a `<CalendarStrip>` (the `mode: 'week'` variant with a
  collapse/expand gesture) — legacy never used weekly mode, but the BooKoo redesign
  may want the Google-Calendar-style collapse.
- Month/year jump UI: legacy used `react-native-modal-datetime-picker` inside the
  calendar. New plan: cpk-ui exposes only `renderHeader` + the `CalendarRef`
  (`goToMonth`), and BooKoo builds a month picker sheet with `@gorhom/bottom-sheet`
  (already a cpk-ui dependency).
