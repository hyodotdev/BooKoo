import type {ReactElement} from 'react';
import {useCallback, useMemo, useState} from 'react';
import {
  Image,
  type LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {FlashList, type FlashListProps} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {
  Calendar,
  CustomPressable,
  Icon,
  ParallaxHeader,
  Typography,
  useCPK,
  useParallaxHeader,
  type CalendarFormatters,
  type CalendarHeaderContext,
  type CalendarMarkerMap,
  type CalendarRenderDay,
} from 'cpk-ui';
import {useRouter} from 'expo-router';
import Animated from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {BookooButton} from '~/components/uis/BookooButton';

import {api} from '@convex/_generated/api';

import {toDayKey, toMonthKey, type WeekDay} from '@shared/date';
import {ITEM_PAGE_MORE, ITEM_PAGE_SIZE} from '@shared/ledgerLimits';
import {getLocale, t} from '~/utils/i18n';
import {
  LEDGER_ACCENTS,
  brandLedgerSurface,
  ledgerAccentSurface,
  type AccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {useTabletLayout} from '~/hooks/useTabletLayout';
import {useLocale} from '~/hooks/useLocale';
import {EntryInvitation} from '../EntryInvitation';
import {EXACT_HIT_SLOP, MOBILE_TAB_BAR_BASE_HEIGHT} from '~/theme/layout';
import {useOpenLedgerDrawer} from '../drawer';
import {
  fromCalendarDayKey,
  fromCalendarMonthKey,
  monthLabel,
  selectedDayForMonth,
  threeMonthWindow,
  toCalendarDayKey,
  toCalendarMonthKey,
} from '../calendar';
import {useActiveLedger} from '../useActiveLedger';
import {
  AppScreen,
  EntryRow,
  LedgerHeader,
  ListFooter,
  NoLedgerEmptyCanvas,
  ScreenSkeleton,
  ScreenScrollFrame,
  TabletSplit,
  statusBarStyleForTheme,
} from '../ui';
import type {ItemRow} from '../types';

const itemKeyExtractor = (item: ItemRow): string => item.id;

interface CalendarScreenBaseProps {
  readonly header: ReactElement | null;
  readonly calendar: ReactElement;
  readonly parallax?: CalendarParallaxHeaderProps;
  readonly chrome?: {
    readonly backgroundColor: string;
    readonly statusBarBackgroundColor: string;
    readonly statusBarStyle: 'dark-content' | 'light-content';
  };
}

interface CalendarFallbackScreenProps extends CalendarScreenBaseProps {
  readonly kind: 'fallback';
  readonly dayList: ReactElement;
}

interface CalendarReadyScreenProps extends CalendarScreenBaseProps {
  readonly kind: 'ready';
  readonly list: CalendarEntriesListProps;
}

export type CalendarScreenProps =
  CalendarFallbackScreenProps | CalendarReadyScreenProps;

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export const MONTHLY_CALENDAR_CELL_SIZE = 48;
export const MONTHLY_CALENDAR_DAY_FONT_SIZE = 18;
export const MONTHLY_CALENDAR_WEEKDAY_FONT_SIZE = 14;
export const MONTHLY_CALENDAR_MIN_CELL_SIZE = 44;
export const MONTHLY_CALENDAR_WEEKDAY_ROW_HEIGHT = 30;
export const TABLET_CALENDAR_WEEKDAY_ROW_HEIGHT = 40;
export const TABLET_CALENDAR_WEEKDAY_ROW_GAP = 12;
export const CALENDAR_DAY_PILL_RATIO = 0.88;
export const CALENDAR_DAY_PILL_MIN_SIZE = 40;
export const CALENDAR_DAY_DOT_SIZE = 5;
export const CALENDAR_DAY_DOT_GAP = 4;
/** The cpk-ui cell underlay is rectangular; BooKoo commits only the circular selected state. */
export const CALENDAR_DAY_UNDERLAY = 'transparent';
const CALENDAR_LIST_POSITION = {autoscrollToTopThreshold: 80} as const;
/** Long enough to skip a warm first page, short enough to show a slow one. */
export const FIRST_PAGE_LOADER_DELAY_MS = 400;
const CALENDAR_PANEL_HORIZONTAL_PADDING = 16;

export function calendarCellSizeForWidth(width: number): number {
  if (width <= 0) return MONTHLY_CALENDAR_CELL_SIZE;

  return Math.max(
    MONTHLY_CALENDAR_MIN_CELL_SIZE,
    Math.min(
      MONTHLY_CALENDAR_CELL_SIZE,
      Math.floor((width - CALENDAR_PANEL_HORIZONTAL_PADDING) / 7),
    ),
  );
}

export function calendarDayPillSizeForCell(cellSize: number): number {
  return Math.min(
    cellSize - 4,
    Math.max(
      CALENDAR_DAY_PILL_MIN_SIZE,
      Math.round(cellSize * CALENDAR_DAY_PILL_RATIO),
    ),
  );
}

export function calendarWeekdayRowStyleForLayout(isTablet: boolean): {
  height: number;
  marginBottom: number;
} {
  return isTablet
    ? {
        height: TABLET_CALENDAR_WEEKDAY_ROW_HEIGHT,
        marginBottom: TABLET_CALENDAR_WEEKDAY_ROW_GAP,
      }
    : {height: MONTHLY_CALENDAR_WEEKDAY_ROW_HEIGHT, marginBottom: 0};
}

interface CalendarEntriesListProps {
  readonly emptyState: ReactElement;
  readonly itemRows: readonly ItemRow[];
  readonly itemsStatus: PaginationStatus;
  /** Undefined until the selected day's bounded rollup query resolves. */
  readonly selectedDayItemCount?: number;
  readonly loadMore: () => void;
  readonly listHeader?: ReactElement;
  readonly renderItem: ({item}: {item: ItemRow}) => ReactElement;
}

interface CalendarParallaxHeaderProps {
  readonly accentSurface: AccentSurface;
  readonly ledgerTitle: string;
  readonly onAdd: () => void;
  readonly onOpenDrawer: () => void;
}

const PARALLAX_HEADER_COLLAPSED_HEIGHT = 56;
const PARALLAX_TITLE_LINE_HEIGHT = 34;

export function calendarExpandedHeaderHeight(contentHeight = 0): number {
  return PARALLAX_HEADER_COLLAPSED_HEIGHT + Math.ceil(contentHeight);
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<ItemRow>);

export const calendarFormatters: Partial<CalendarFormatters> = {
  // `Intl` renders Korean dates as `4일`, `5일`, … by default. Calendar
  // cells are intentionally locale-neutral numerals; the full localized date
  // remains available through the accessibility label.
  dayNumber: (date) => String(date.getDate()),
  monthTitle: (date) =>
    monthLabel(date.getFullYear() * 100 + date.getMonth() + 1),
};

function calendarDayTextColor({
  day,
  isDisabled,
  isSelected,
  isToday,
  marker,
  palette,
}: Parameters<CalendarRenderDay>[0]): string {
  if (isSelected) return palette.selectedText;
  if (isDisabled) return palette.disabledText;
  if (day.isOutside) return palette.outsideText;
  if (marker?.textColor !== undefined) return marker.textColor;
  if (isToday) return palette.todayText;
  if (day.weekday === 0) return palette.sundayText;
  if (day.weekday === 6) return palette.saturdayText;
  return palette.dayText;
}

/**
 * Keeps the entry marker inside the same circular pill as the day number.
 * cpk-ui's default decoration row belongs to the cell bottom, which makes a
 * marker look detached from a selected date on tall monthly calendars.
 */
export const renderLedgerCalendarDay: CalendarRenderDay = (context) => {
  const {cellSize, day, isDisabled, isSelected, isToday, marker, palette} =
    context;
  const pillSize = Math.min(
    calendarDayPillSizeForCell(cellSize),
    context.contentMaxSize ?? Number.POSITIVE_INFINITY,
  );
  const dots = marker?.dots ?? [];
  const dotColor =
    dots[0]?.color ?? (isSelected ? palette.selectedText : palette.dot);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.calendarDayPill,
        {
          backgroundColor: isSelected
            ? (marker?.selectedColor ?? palette.selectedBackground)
            : 'transparent',
          borderColor: palette.todayRing,
          borderRadius: pillSize / 2,
          height: pillSize,
          opacity: isDisabled ? 0.55 : 1,
          width: pillSize,
        },
        isToday && !isSelected ? styles.calendarTodayPill : null,
      ]}
    >
      <Typography.Body2
        maxFontSizeMultiplier={1.25}
        numberOfLines={1}
        style={[
          styles.calendarDayNumber,
          {
            color: calendarDayTextColor(context),
            transform: [{translateY: dots.length > 0 ? -3 : 0}],
            fontSize: Math.min(
              MONTHLY_CALENDAR_DAY_FONT_SIZE,
              Math.round(cellSize * 0.34),
            ),
            lineHeight: Math.min(20, Math.round(cellSize * 0.38)),
          },
        ]}
      >
        {day.dayOfMonth}
      </Typography.Body2>
      {dots.length > 0 ? (
        <View
          style={[styles.calendarDayDot, {backgroundColor: dotColor}]}
          testID={`calendar-day-dot-${day.key}`}
        />
      ) : null}
    </View>
  );
};

export function useCalendarScreenProps(): CalendarScreenProps {
  useLocale();
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const {activeLedger, ledgers} = useActiveLedger();
  const openDrawer = useOpenLedgerDrawer();
  const activeId = activeLedger?.id;
  const [now] = useState(Date.now);
  const timeZone = activeLedger?.timeZone ?? 'UTC';
  const today = toDayKey(now, timeZone);
  const [selection, setSelection] = useState({
    ledgerId: '',
    monthKey: toMonthKey(now, 'UTC'),
    selectedDayKey: toDayKey(now, 'UTC'),
  });
  const monthKey =
    selection.ledgerId === activeId
      ? selection.monthKey
      : Math.floor(today / 100);
  const selectedDayKey =
    selection.ledgerId === activeId ? selection.selectedDayKey : today;
  const setMonthKey = useCallback(
    (nextMonthKey: number) =>
      setSelection({
        ledgerId: activeId ?? '',
        monthKey: nextMonthKey,
        selectedDayKey: selectedDayForMonth(nextMonthKey, today),
      }),
    [activeId, today],
  );
  const setSelectedDayKey = useCallback(
    (nextDayKey: number) =>
      setSelection({
        ledgerId: activeId ?? '',
        monthKey: Math.floor(nextDayKey / 100),
        selectedDayKey: nextDayKey,
      }),
    [activeId],
  );

  const weekStartsOn = (activeLedger?.weekStartsOn ?? 0) as WeekDay;
  const window = useMemo(
    () => threeMonthWindow(monthKey, weekStartsOn),
    [monthKey, weekStartsOn],
  );
  const rollupArgs =
    activeId === undefined ? null : {ledgerId: activeId, ...window};
  const liveDayRollups = useQuery(
    api.rollups.queries.daysInRange,
    rollupArgs === null ? 'skip' : rollupArgs,
  );
  const dayRollups = liveDayRollups;
  const categories = useQuery(
    api.categories.queries.list,
    activeId === undefined ? 'skip' : {ledgerId: activeId},
  );
  const refreshItemCount = liveDayRollups?.find(
    (rollup) => rollup.dayKey === selectedDayKey,
  )?.itemCount;
  const selectedDayItemCount =
    liveDayRollups === undefined ? undefined : (refreshItemCount ?? 0);
  const items = usePaginatedQuery(
    api.items.queries.listByDay,
    activeId === undefined
      ? 'skip'
      : {ledgerId: activeId, dayKey: selectedDayKey, refreshItemCount},
    {initialNumItems: ITEM_PAGE_SIZE},
  );
  const {loadMore: loadMoreItems, status: itemsStatus} = items;
  const itemRows = items.status === 'LoadingFirstPage' ? [] : items.results;
  const categoryByKey = useMemo(
    () => new Map(categories?.map((category) => [category.key, category])),
    [categories],
  );
  const rollupByDay = useMemo(
    () => new Map(dayRollups?.map((rollup) => [rollup.dayKey, rollup])),
    [dayRollups],
  );
  const openItem = useCallback(
    (item: ItemRow) =>
      router.navigate({
        pathname: '/ledger/[ledgerId]/item/[itemId]',
        params: {itemId: item.id, ledgerId: item.ledgerId},
      }),
    [router],
  );
  const renderItem = useCallback(
    ({item}: {item: ItemRow}) => (
      <EntryRow
        category={categoryByKey.get(item.categoryKey)}
        item={item}
        onPress={openItem}
      />
    ),
    [categoryByKey, openItem],
  );
  const loadMore = useCallback(() => {
    if (itemsStatus === 'CanLoadMore') loadMoreItems(ITEM_PAGE_MORE);
  }, [itemsStatus, loadMoreItems]);
  const openNew = useCallback(
    () =>
      activeId === undefined
        ? undefined
        : router.navigate({
            pathname: '/ledger/[ledgerId]/item/new',
            params: {dayKey: selectedDayKey, ledgerId: activeId},
          }),
    [activeId, router, selectedDayKey],
  );

  if (ledgers === undefined || activeLedger === undefined)
    return {
      kind: 'fallback',
      header: null,
      calendar: <ScreenSkeleton centerOnScreen rows={4} />,
      dayList: <View />,
    };
  if (activeLedger === null)
    return {
      kind: 'fallback',
      chrome: {
        backgroundColor: theme.bg.paper,
        statusBarBackgroundColor: brandLedgerSurface(mode).background,
        statusBarStyle: statusBarStyleForTheme(themeType),
      },
      header: null,
      calendar: (
        <NoLedgerEmptyCanvas
          onAdd={() => router.navigate('/ledgers/new')}
          onOpenDrawer={openDrawer}
        />
      ),
      dayList: <View />,
    };

  const accent = LEDGER_ACCENTS[activeLedger.colorKey as LedgerColorKey][mode];
  const accentSurface = ledgerAccentSurface(accent, mode);
  const calendarView = (
    <CalendarPanel
      accentSurface={accentSurface}
      monthKey={monthKey}
      onChangeMonth={setMonthKey}
      onSelectDay={setSelectedDayKey}
      rollupByDay={rollupByDay}
      selectedDayKey={selectedDayKey}
      today={today}
      weekStartsOn={weekStartsOn}
    />
  );
  return {
    kind: 'ready',
    chrome: (() => {
      return {
        backgroundColor: theme.bg.basic,
        statusBarBackgroundColor: accentSurface.background,
        statusBarStyle: statusBarStyleForTheme(themeType),
      } as const;
    })(),
    header: (
      <LedgerHeader
        ledger={activeLedger}
        onOpenDrawer={openDrawer}
        trailing={{
          accessibilityLabel: t('a11y.addEntry'),
          icon: 'Plus',
          onPress: openNew,
        }}
      />
    ),
    parallax: {
      accentSurface,
      ledgerTitle:
        activeLedger.emoji === null
          ? activeLedger.title
          : `${activeLedger.emoji} ${activeLedger.title}`,
      onAdd: openNew,
      onOpenDrawer: openDrawer,
    },
    calendar: calendarView,
    list: {
      emptyState: <CalendarDayEmptyState onAdd={openNew} />,
      itemRows,
      itemsStatus: items.status,
      selectedDayItemCount,
      loadMore,
      renderItem,
    },
  };
}

export function CalendarDayEmptyState({
  onAdd,
}: {
  readonly onAdd: () => void;
}): ReactElement {
  const tablet = useTabletLayout();
  const {width, height} = useWindowDimensions();
  if (tablet && width > height) {
    return <EntryInvitation actionTestID="calendar-empty-add" onAdd={onAdd} />;
  }
  return (
    <View style={styles.emptyDay} testID="calendar-day-empty-state">
      <BookooButton
        borderRadius={16}
        onPress={onAdd}
        size="small"
        style={styles.emptyDayAction}
        styles={{container: styles.emptyDayActionContainer}}
        testID="calendar-empty-add"
        text={t('a11y.addEntry')}
        type="outlined"
      />
    </View>
  );
}

function CalendarPanel({
  accentSurface,
  monthKey,
  onChangeMonth,
  onSelectDay,
  rollupByDay,
  selectedDayKey,
  today,
  weekStartsOn,
}: {
  accentSurface: AccentSurface;
  monthKey: number;
  onChangeMonth: (monthKey: number) => void;
  onSelectDay: (dayKey: number) => void;
  rollupByDay: ReadonlyMap<number, {netMinor: number; itemCount: number}>;
  selectedDayKey: number;
  today: number;
  weekStartsOn: WeekDay;
}): ReactElement {
  const {theme} = useCPK();
  const tabletLayout = useTabletLayout();
  const [panelWidth, setPanelWidth] = useState(0);
  const calendarCellSize = calendarCellSizeForWidth(panelWidth);
  const handlePanelLayout = useCallback((event: LayoutChangeEvent): void => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setPanelWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  }, []);
  const markers = useMemo<CalendarMarkerMap>(() => {
    const entries = [...rollupByDay.entries()]
      .filter(([, rollup]) => rollup.itemCount > 0)
      .map(
        ([dayKey, rollup]) =>
          [
            toCalendarDayKey(dayKey),
            {
              accessibilityHint: String(rollup.itemCount),
              dots: [{key: 'entries'}],
              selectedColor: accentSurface.background,
            },
          ] as const,
      );

    return Object.fromEntries(entries);
  }, [accentSurface.background, rollupByDay]);
  const openCalendarDatePicker = useCalendarDatePickerDialog();
  const openDatePicker = useCallback((): void => {
    openCalendarDatePicker({
      accentSurface,
      initialDayKey: selectedDayKey,
      onSelect: onSelectDay,
      today,
      weekStartsOn,
    });
  }, [
    accentSurface,
    onSelectDay,
    openCalendarDatePicker,
    selectedDayKey,
    today,
    weekStartsOn,
  ]);
  const renderHeader = useCallback(
    (context: CalendarHeaderContext) => (
      <LedgerCalendarHeader
        context={context}
        onOpenDatePicker={openDatePicker}
      />
    ),
    [openDatePicker],
  );

  return (
    <View
      onLayout={handlePanelLayout}
      style={[styles.calendarPanel, {backgroundColor: theme.bg.basic}]}
    >
      <Calendar
        accessibilityLabel={t('calendar.selectDate')}
        colors={{
          background: theme.bg.basic,
          dot: theme.text.label,
          selectedBackground: accentSurface.background,
          selectedText: accentSurface.foreground,
          underlay: CALENDAR_DAY_UNDERLAY,
        }}
        fixedWeeks
        selectionAnimation
        formatters={calendarFormatters}
        labels={{
          nextMonth: t('calendar.nextMonth'),
          previousMonth: t('calendar.previousMonth'),
          selected: t('calendar.selectDate'),
          today: t('calendar.today'),
        }}
        locale={getLocale()}
        markers={markers}
        maxFontSizeMultiplier={1.25}
        month={toCalendarMonthKey(monthKey)}
        onChange={(_date, key) => onSelectDay(fromCalendarDayKey(key))}
        onMonthChange={(_date, key) => onChangeMonth(fromCalendarMonthKey(key))}
        paging="swipe"
        renderHeader={renderHeader}
        renderDay={renderLedgerCalendarDay}
        showNavigationButtons={false}
        size={calendarCellSize}
        styles={{
          container: styles.calendar,
          dayCell: styles.calendarDayPressTarget,
          weekdayLabel: styles.calendarWeekdayLabel,
          weekdayRow: [
            styles.calendarWeekdayRow,
            calendarWeekdayRowStyleForLayout(tabletLayout),
          ],
        }}
        today={toCalendarDayKey(today)}
        value={toCalendarDayKey(selectedDayKey)}
        weekStart={weekStartsOn}
      />
    </View>
  );
}

export interface CalendarDatePickerOptions {
  readonly accentSurface: AccentSurface;
  readonly initialDayKey: number;
  readonly onSelect: (dayKey: number) => void;
  readonly today: number;
  readonly weekStartsOn: WeekDay;
}

/**
 * The one ledger date dialog: the calendar title and the Android entry editor
 * both pick a day through it, so it reads in the app language everywhere.
 */
export function useCalendarDatePickerDialog(): (
  options: CalendarDatePickerOptions,
) => void {
  const {alertDialog, theme} = useCPK();

  return useCallback(
    ({
      accentSurface,
      initialDayKey,
      onSelect,
      today,
      weekStartsOn,
    }: CalendarDatePickerOptions): void => {
      alertDialog.open({
        renderBody: () => (
          <CalendarDatePicker
            accentSurface={accentSurface}
            initialDayKey={initialDayKey}
            onSelect={(dayKey) => {
              alertDialog.close();
              onSelect(dayKey);
            }}
            today={today}
            weekStartsOn={weekStartsOn}
          />
        ),
        closeOnTouchOutside: true,
        showCloseButton: true,
        size: 'large',
        styles: {
          container: [
            styles.calendarPickerDialog,
            {backgroundColor: theme.bg.basic},
          ],
          bodyContainer: styles.calendarPickerBody,
        },
        title: t('calendar.selectDate'),
        renderHeader: () => (
          <Typography.Heading4
            $fontWeight="bold"
            maxFontSizeMultiplier={1.25}
            style={{color: theme.text.basic}}
          >
            {t('calendar.selectDate')}
          </Typography.Heading4>
        ),
      });
    },
    [alertDialog, theme.bg.basic, theme.text.basic],
  );
}

function CalendarDatePicker({
  accentSurface,
  initialDayKey,
  onSelect,
  today,
  weekStartsOn,
}: {
  readonly accentSurface: AccentSurface;
  readonly initialDayKey: number;
  readonly onSelect: (dayKey: number) => void;
  readonly today: number;
  readonly weekStartsOn: WeekDay;
}): ReactElement {
  const {theme} = useCPK();

  return (
    <Calendar
      accessibilityLabel={t('calendar.selectDate')}
      colors={{
        background: theme.bg.basic,
        dot: theme.text.label,
        selectedBackground: accentSurface.background,
        selectedText: accentSurface.foreground,
        underlay: CALENDAR_DAY_UNDERLAY,
      }}
      defaultMonth={toCalendarMonthKey(Math.floor(initialDayKey / 100))}
      defaultValue={toCalendarDayKey(initialDayKey)}
      fixedWeeks
      selectionAnimation
      formatters={calendarFormatters}
      labels={{
        nextMonth: t('calendar.nextMonth'),
        previousMonth: t('calendar.previousMonth'),
        selected: t('calendar.selectDate'),
        today: t('calendar.today'),
      }}
      locale={getLocale()}
      maxFontSizeMultiplier={1.25}
      onChange={(_date, key) => onSelect(fromCalendarDayKey(key))}
      paging="none"
      renderDay={renderLedgerCalendarDay}
      size="regular"
      styles={{
        container: styles.calendarPicker,
        dayCell: styles.calendarDayPressTarget,
        weekdayRow: styles.calendarPickerWeekdayRow,
      }}
      today={toCalendarDayKey(today)}
      weekStart={weekStartsOn}
    />
  );
}

export function LedgerCalendarHeader({
  context,
  onOpenDatePicker,
}: {
  readonly context: CalendarHeaderContext;
  readonly onOpenDatePicker: () => void;
}): ReactElement {
  const {theme} = useCPK();

  return (
    <View style={styles.calendarHeader} testID="ledger-calendar-header">
      <CustomPressable
        accessibilityLabel={t('calendar.selectDate')}
        accessibilityRole="button"
        accessibilityValue={{text: context.title}}
        onPress={onOpenDatePicker}
        style={styles.calendarTitleButton}
        testID="calendar-open-picker"
      >
        <Typography.Heading1
          $fontWeight="bold"
          maxFontSizeMultiplier={1.25}
          numberOfLines={1}
          style={[styles.calendarTitle, {color: theme.text.basic}]}
        >
          {context.title}
        </Typography.Heading1>
        <Icon color={theme.text.label} name="CaretDown" size={18} />
      </CustomPressable>
      <View style={styles.calendarNavigation}>
        <CustomPressable
          accessibilityLabel={t('calendar.previousMonth')}
          accessibilityRole="button"
          accessibilityState={{disabled: !context.canGoPrevious}}
          disabled={!context.canGoPrevious}
          onPress={context.goPrevious}
          style={[
            styles.calendarNavigationButton,
            {
              backgroundColor: theme.bg.paper,
              borderColor: theme.role.border,
            },
            !context.canGoPrevious && styles.calendarNavigationButtonDisabled,
          ]}
          testID="calendar-prev"
        >
          <Icon color={theme.text.label} name="CaretLeft" size={20} />
        </CustomPressable>
        <CustomPressable
          accessibilityLabel={t('calendar.nextMonth')}
          accessibilityRole="button"
          accessibilityState={{disabled: !context.canGoNext}}
          disabled={!context.canGoNext}
          onPress={context.goNext}
          style={[
            styles.calendarNavigationButton,
            {
              backgroundColor: theme.bg.paper,
              borderColor: theme.role.border,
            },
            !context.canGoNext && styles.calendarNavigationButtonDisabled,
          ]}
          testID="calendar-next"
        >
          <Icon color={theme.text.label} name="CaretRight" size={20} />
        </CustomPressable>
      </View>
    </View>
  );
}

function CalendarEntriesList({
  bottomInset = 0,
  collapseDistance = 0,
  emptyState,
  fillEmptyViewport = false,
  itemRows,
  itemsStatus,
  selectedDayItemCount,
  loadMore,
  listHeader,
  onScroll,
  topInset = 0,
  renderItem,
}: CalendarEntriesListProps & {
  readonly fillEmptyViewport?: boolean;
  readonly bottomInset?: number;
  readonly collapseDistance?: number;
  readonly onScroll?: FlashListProps<ItemRow>['onScroll'];
  readonly topInset?: number;
}): ReactElement {
  const {theme} = useCPK();
  const [viewportHeight, setViewportHeight] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);
  const contentContainerStyle = useMemo(
    () => ({
      flexGrow: 1,
      // Android has no overscroll: short content must still consume the whole
      // expanded-to-sticky distance. Measure the list, not the device window.
      minHeight: viewportHeight + collapseDistance,
      paddingBottom: bottomInset,
      paddingTop: topInset,
    }),
    [bottomInset, collapseDistance, topInset, viewportHeight],
  );
  const listStyle = useMemo(
    () => ({backgroundColor: theme.bg.basic, flex: 1}),
    [theme.bg.basic],
  );

  return (
    <AnimatedFlashList
      contentContainerStyle={contentContainerStyle}
      data={itemRows}
      keyExtractor={itemKeyExtractor}
      ListEmptyComponent={
        itemsStatus === 'LoadingFirstPage' && selectedDayItemCount !== 0 ? (
          // The first screen after launch: a fast first page must not flash
          // a second "Loading…" right after the launch loader fades.
          <ScreenSkeleton delayMs={FIRST_PAGE_LOADER_DELAY_MS} rows={3} />
        ) : (
          // The rollups already confirm an empty day. Keep the same action
          // mounted while its paginated query changes, without retaining
          // another day's rows or showing false emptiness for a populated day.
          <View
            style={
              fillEmptyViewport
                ? [styles.emptyPane, {minHeight: viewportHeight}]
                : undefined
            }
            testID="calendar-empty-pane"
          >
            {emptyState}
          </View>
        )
      }
      ListFooterComponent={
        itemRows.length === 0 ? null : (
          <ListFooter
            exhausted={itemsStatus === 'Exhausted'}
            loading={itemsStatus === 'LoadingMore'}
          />
        )
      }
      ListHeaderComponent={listHeader}
      maintainVisibleContentPosition={CALENDAR_LIST_POSITION}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      onLayout={onLayout}
      onScroll={onScroll}
      renderItem={renderItem}
      scrollEventThrottle={16}
      style={listStyle}
      testID="calendar-entries-list"
    />
  );
}

export function CalendarParallaxHeader({
  accentSurface,
  ledgerTitle,
  onAdd,
  onOpenDrawer,
  scrollOffset,
  expandedHeight,
  onContentLayout,
}: CalendarParallaxHeaderProps & {
  readonly scrollOffset: ReturnType<typeof useParallaxHeader>['scrollOffset'];
  readonly expandedHeight: number;
  readonly onContentLayout: (event: LayoutChangeEvent) => void;
}): ReactElement {
  return (
    <ParallaxHeader
      backgroundColor={accentSurface.background}
      collapsedContent={
        <View style={styles.parallaxCollapsedTitle}>
          <Typography.Heading5
            maxFontSizeMultiplier={1.35}
            numberOfLines={1}
            ellipsizeMode="tail"
            accessibilityLabel={ledgerTitle}
            style={{color: accentSurface.foreground}}
            testID="calendar-parallax-collapsed-title"
          >
            {ledgerTitle}
          </Typography.Heading5>
        </View>
      }
      collapsedHeight={PARALLAX_HEADER_COLLAPSED_HEIGHT}
      expandedContent={
        <View
          onLayout={onContentLayout}
          style={styles.parallaxExpandedTitle}
          testID="calendar-parallax-title-content"
        >
          <Typography.Heading3
            maxFontSizeMultiplier={1.35}
            numberOfLines={2}
            ellipsizeMode="tail"
            accessibilityLabel={ledgerTitle}
            style={{
              color: accentSurface.foreground,
              lineHeight: PARALLAX_TITLE_LINE_HEIGHT,
            }}
            testID="calendar-parallax-expanded-title"
          >
            {ledgerTitle}
          </Typography.Heading3>
        </View>
      }
      expandedHeight={expandedHeight}
      scrollOffset={scrollOffset}
      styles={{expandedContent: styles.parallaxIntrinsicContent}}
      testID="calendar-parallax-header"
    >
      <View style={styles.parallaxNavigation}>
        <CustomPressable
          accessibilityLabel={t('a11y.openDashboard')}
          accessibilityRole="button"
          hitSlop={EXACT_HIT_SLOP}
          onPress={onOpenDrawer}
          style={styles.parallaxAction}
          testID="calendar-parallax-menu"
        >
          <Image
            resizeMode="contain"
            source={require('../../../../assets/navigation/btnMenu.png')}
            style={[
              styles.parallaxMenuIcon,
              {tintColor: accentSurface.foreground},
            ]}
          />
        </CustomPressable>
        <CustomPressable
          accessibilityLabel={t('a11y.addEntry')}
          accessibilityRole="button"
          hitSlop={EXACT_HIT_SLOP}
          onPress={onAdd}
          style={styles.parallaxAction}
          testID="calendar-parallax-add"
        >
          <Icon color={accentSurface.foreground} name="Plus" size={26} />
        </CustomPressable>
      </View>
    </ParallaxHeader>
  );
}

export function CalendarMobile(props: CalendarScreenProps): ReactElement {
  const insets = useSafeAreaInsets();
  const {fontScale, width} = useWindowDimensions();
  const {onScroll, scrollOffset} = useParallaxHeader();
  // Text wraps intrinsically. Measure its content, not an estimated line count,
  // so the overlaid header and the list consume exactly the same space.
  const layoutKey = `${width}:${fontScale}:${props.parallax?.ledgerTitle ?? ''}`;
  const [titleLayout, setTitleLayout] = useState({key: '', height: 0});
  const expandedHeight = calendarExpandedHeaderHeight(
    titleLayout.key === layoutKey ? titleLayout.height : 0,
  );
  const onTitleLayout = useCallback(
    ({nativeEvent: {layout}}: LayoutChangeEvent): void => {
      const height = Math.ceil(layout.height);
      setTitleLayout((previous) =>
        previous.key === layoutKey && previous.height === height
          ? previous
          : {key: layoutKey, height},
      );
    },
    [layoutKey],
  );

  return (
    <AppScreen {...props.chrome}>
      <ScreenScrollFrame surface={props.kind === 'ready' ? 'basic' : 'paper'}>
        {props.kind === 'ready' ? (
          <>
            <CalendarEntriesList
              {...props.list}
              bottomInset={MOBILE_TAB_BAR_BASE_HEIGHT + insets.bottom}
              collapseDistance={
                props.parallax === undefined
                  ? 0
                  : expandedHeight - PARALLAX_HEADER_COLLAPSED_HEIGHT
              }
              listHeader={props.calendar}
              onScroll={onScroll}
              topInset={props.parallax === undefined ? 0 : expandedHeight}
            />
            {props.parallax === undefined ? (
              props.header
            ) : (
              <CalendarParallaxHeader
                {...props.parallax}
                key={layoutKey}
                expandedHeight={expandedHeight}
                onContentLayout={onTitleLayout}
                scrollOffset={scrollOffset}
              />
            )}
          </>
        ) : (
          <>
            {props.header}
            {props.calendar}
            {props.dayList}
          </>
        )}
      </ScreenScrollFrame>
    </AppScreen>
  );
}

export function CalendarTablet(props: CalendarScreenProps): ReactElement {
  const {themeType} = useCPK();
  const {width, height} = useWindowDimensions();
  return (
    <AppScreen
      {...props.chrome}
      statusBarStyle={statusBarStyleForTheme(themeType)}
    >
      <ScreenScrollFrame surface={props.kind === 'ready' ? 'basic' : 'paper'}>
        {props.header}
        {props.kind !== 'ready' ? (
          <>
            {props.calendar}
            {props.dayList}
          </>
        ) : width > height ? (
          <TabletSplit
            primary={props.calendar}
            secondary={
              <CalendarEntriesList {...props.list} fillEmptyViewport />
            }
          />
        ) : (
          <CalendarEntriesList {...props.list} listHeader={props.calendar} />
        )}
      </ScreenScrollFrame>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  emptyPane: {justifyContent: 'center'},
  calendar: {paddingHorizontal: 8},
  calendarDayDot: {
    borderRadius: CALENDAR_DAY_DOT_SIZE / 2,
    bottom: CALENDAR_DAY_DOT_GAP,
    height: CALENDAR_DAY_DOT_SIZE,
    position: 'absolute',
    width: CALENDAR_DAY_DOT_SIZE,
  },
  calendarDayNumber: {
    fontWeight: '500',
    textAlign: 'center',
  },
  calendarDayPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayPressTarget: {
    borderRadius: 999,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: 0,
  },
  calendarTodayPill: {borderWidth: 1.5},
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 68,
    paddingHorizontal: 4,
  },
  calendarNavigation: {flexDirection: 'row', gap: 6},
  calendarNavigationButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  calendarNavigationButtonDisabled: {opacity: 0.4},
  calendarPanel: {
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  calendarPicker: {paddingHorizontal: 0},
  calendarPickerBody: {marginHorizontal: -8},
  calendarPickerDialog: {
    borderCurve: 'continuous',
    borderRadius: 28,
    maxWidth: 480,
  },
  calendarPickerWeekdayRow: {
    flexShrink: 0,
    minHeight: 40,
    marginBottom: 12,
  },
  calendarTitle: {flexShrink: 1},
  calendarTitleButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
  calendarWeekdayLabel: {fontSize: MONTHLY_CALENDAR_WEEKDAY_FONT_SIZE},
  calendarWeekdayRow: {
    height: MONTHLY_CALENDAR_WEEKDAY_ROW_HEIGHT,
    paddingBottom: 0,
  },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: 20,
    width: '100%',
  },
  emptyDayAction: {
    alignSelf: 'center',
  },
  emptyDayActionContainer: {
    minHeight: 44,
    paddingHorizontal: 18,
  },
  parallaxAction: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: PARALLAX_HEADER_COLLAPSED_HEIGHT / 2,
    height: PARALLAX_HEADER_COLLAPSED_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  parallaxCollapsedTitle: {
    alignItems: 'flex-start',
    height: PARALLAX_HEADER_COLLAPSED_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 64,
  },
  parallaxExpandedTitle: {
    flexShrink: 0,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  // No bottom/height constraint: content can measure itself even before the
  // outer absolute header has received its first intrinsic-height measurement.
  parallaxIntrinsicContent: {
    flex: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  parallaxMenuIcon: {height: 56, width: 56},
  parallaxNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
