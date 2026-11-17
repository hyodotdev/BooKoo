import 'react-native';

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fireEvent, render} from '@testing-library/react-native';
import {
  CpkProvider,
  type CalendarHeaderContext,
  useParallaxHeader,
} from 'cpk-ui';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  CALENDAR_DAY_UNDERLAY,
  CALENDAR_DAY_DOT_GAP,
  CALENDAR_DAY_DOT_SIZE,
  CALENDAR_DAY_PILL_MIN_SIZE,
  CALENDAR_DAY_PILL_RATIO,
  CalendarParallaxHeader,
  LedgerCalendarHeader,
  MONTHLY_CALENDAR_DAY_FONT_SIZE,
  MONTHLY_CALENDAR_CELL_SIZE,
  MONTHLY_CALENDAR_MIN_CELL_SIZE,
  MONTHLY_CALENDAR_WEEKDAY_ROW_HEIGHT,
  MONTHLY_CALENDAR_WEEKDAY_FONT_SIZE,
  TABLET_CALENDAR_WEEKDAY_ROW_GAP,
  TABLET_CALENDAR_WEEKDAY_ROW_HEIGHT,
  calendarCellSizeForWidth,
  calendarExpandedHeaderHeight,
  calendarDayPillSizeForCell,
  calendarFormatters,
  calendarWeekdayRowStyleForLayout,
} from '../../../../src/features/ledger/screens/calendar';
import {ScreenScrollFrame} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';
import {EXACT_HIT_SLOP} from '../../../../src/theme/layout';

const renderHeader = ({
  goNext = jest.fn(),
  goPrevious = jest.fn(),
  onOpenDatePicker = jest.fn(),
}: {
  goNext?: jest.Mock;
  goPrevious?: jest.Mock;
  onOpenDatePicker?: jest.Mock;
} = {}) => {
  const context: CalendarHeaderContext = {
    canGoNext: true,
    canGoPrevious: true,
    date: new Date(2026, 7, 1),
    goNext,
    goPrevious,
    mode: 'month',
    title: '2026.08',
  };

  return {
    goNext,
    goPrevious,
    onOpenDatePicker,
    screen: render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <LedgerCalendarHeader
            context={context}
            onOpenDatePicker={onOpenDatePicker}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    ),
  };
};

function ParallaxHeaderFixture() {
  const {scrollOffset} = useParallaxHeader();

  return (
    <CalendarParallaxHeader
      accentSurface={{background: '#1FD0A9', foreground: '#FFFFFF'}}
      ledgerTitle="Storyboard Ledger"
      expandedHeight={calendarExpandedHeaderHeight(56)}
      onContentLayout={jest.fn()}
      onAdd={jest.fn()}
      onOpenDrawer={jest.fn()}
      scrollOffset={scrollOffset}
    />
  );
}

describe('Monthly calendar header', () => {
  it('connects the previous and next controls to calendar paging', () => {
    const {goNext, goPrevious, screen} = renderHeader();

    fireEvent.press(screen.getByTestId('calendar-prev'));
    fireEvent.press(screen.getByTestId('calendar-next'));

    expect(goPrevious).toHaveBeenCalledTimes(1);
    expect(goNext).toHaveBeenCalledTimes(1);
  });

  it('opens the date picker from the enlarged month title', () => {
    const {onOpenDatePicker, screen} = renderHeader();
    const titleStyle = StyleSheet.flatten(
      screen.getByText('2026.08').props.style,
    );

    expect(titleStyle.fontSize).toBe(28);
    fireEvent.press(screen.getByTestId('calendar-open-picker'));

    expect(onOpenDatePicker).toHaveBeenCalledTimes(1);
  });

  it('keeps the primary calendar geometry visibly larger than a default control', () => {
    expect(MONTHLY_CALENDAR_CELL_SIZE).toBe(48);
    expect(MONTHLY_CALENDAR_MIN_CELL_SIZE).toBe(44);
    expect(MONTHLY_CALENDAR_WEEKDAY_ROW_HEIGHT).toBe(30);
    expect(TABLET_CALENDAR_WEEKDAY_ROW_HEIGHT).toBe(40);
    expect(TABLET_CALENDAR_WEEKDAY_ROW_GAP).toBe(12);
    expect(calendarWeekdayRowStyleForLayout(false)).toEqual({
      height: 30,
      marginBottom: 0,
    });
    expect(calendarWeekdayRowStyleForLayout(true)).toEqual({
      height: 40,
      marginBottom: 12,
    });
    expect(MONTHLY_CALENDAR_DAY_FONT_SIZE).toBe(18);
    expect(MONTHLY_CALENDAR_WEEKDAY_FONT_SIZE).toBe(14);
    expect(CALENDAR_DAY_UNDERLAY).toBe('transparent');
    expect(CALENDAR_DAY_PILL_RATIO).toBe(0.88);
    expect(CALENDAR_DAY_PILL_MIN_SIZE).toBe(40);
    expect(CALENDAR_DAY_DOT_SIZE).toBeLessThan(
      MONTHLY_CALENDAR_CELL_SIZE * CALENDAR_DAY_PILL_RATIO,
    );
    expect(CALENDAR_DAY_DOT_GAP).toBe(4);
    expect(calendarDayPillSizeForCell(44)).toBe(40);
    expect(calendarDayPillSizeForCell(48)).toBe(42);
    expect(calendarCellSizeForWidth(0)).toBe(48);
    expect(calendarCellSizeForWidth(282)).toBe(44);
    expect(calendarCellSizeForWidth(420)).toBe(48);
  });

  it('renders calendar cells as bare numerals in every locale', () => {
    const dayNumber = calendarFormatters.dayNumber;

    expect(dayNumber?.(new Date(2026, 7, 4), 'ko-KR')).toBe('4');
    expect(dayNumber?.(new Date(2026, 7, 25), 'en-US')).toBe('25');
  });

  it('lets a single-month weekday row reserve layout height directly', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'node_modules/cpk-ui/components/uis/Calendar/Calendar.js',
      ),
      'utf8',
    );

    expect(source).toContain('monthsToShow === 1');
    expect(source).toContain('? (_jsx(CalendarWeekdayRow');
    expect(source).not.toContain(
      'style: monthsToShow > 1 ? TWO_UP_ROW : undefined',
    );
  });

  it('keeps the expanded title larger and the collapsed title bold', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <ParallaxHeaderFixture />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    const expandedStyle = StyleSheet.flatten(
      screen.getByTestId('calendar-parallax-expanded-title').props.style,
    );
    const collapsedStyle = StyleSheet.flatten(
      screen.getByTestId('calendar-parallax-collapsed-title').props.style,
    );

    expect(expandedStyle.fontSize).toBe(24);
    expect(expandedStyle.fontFamily).toBe('Pretendard-Bold');
    expect(collapsedStyle.fontSize).toBe(20);
    expect(collapsedStyle.fontFamily).toBe('Pretendard-Bold');
    expect(
      screen.getByTestId('calendar-parallax-expanded-title').props
        .numberOfLines,
    ).toBe(2);
    expect(
      screen.getByTestId('calendar-parallax-collapsed-title').props
        .numberOfLines,
    ).toBe(1);
    expect(calendarExpandedHeaderHeight()).toBe(56);
    expect(calendarExpandedHeaderHeight(56)).toBe(112);
    expect(calendarExpandedHeaderHeight(90)).toBe(146);
    expect(calendarExpandedHeaderHeight(70.5)).toBe(127);
    expect(screen.getByTestId('calendar-parallax-title-content')).toHaveStyle({
      flexShrink: 0,
      paddingTop: 8,
      paddingBottom: 14,
    });
    expect(screen.getByTestId('calendar-parallax-header-expanded')).toHaveStyle(
      {
        flex: 0,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
      },
    );
    expect(screen.getByTestId('calendar-parallax-menu')).toHaveStyle({
      borderRadius: 28,
      height: 56,
      overflow: 'hidden',
      width: 56,
    });
    expect(screen.getByTestId('calendar-parallax-add')).toHaveStyle({
      borderRadius: 28,
      height: 56,
      overflow: 'hidden',
      width: 56,
    });
    expect(screen.getByTestId('calendar-parallax-menu').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );
    expect(screen.getByTestId('calendar-parallax-add').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );
  });

  it('can fill the short-list tail with the basic surface', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <ScreenScrollFrame surface="basic">
            <View />
          </ScreenScrollFrame>
        </CpkProvider>
      </SafeAreaProvider>,
    );
    const frameStyle = StyleSheet.flatten(
      screen.getByTestId('screen-scroll-frame').props.style,
    );

    expect(frameStyle.backgroundColor).toBe(theme.light.bg.basic);
  });
});
