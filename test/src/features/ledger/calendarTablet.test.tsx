import type {ReactElement} from 'react';
import * as ReactNative from 'react-native';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  CalendarTablet,
  CalendarMobile,
  calendarExpandedHeaderHeight,
  type CalendarScreenProps,
} from '../../../../src/features/ledger/screens/calendar';
import {TabletSplit} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 820, height: 1180, fontScale: 1, scale: 2})),
}));

const props: CalendarScreenProps = {
  kind: 'ready',
  header: <View testID="ledger-header" />,
  calendar: <View testID="selected-calendar" />,
  list: {
    emptyState: <View testID="empty-day" />,
    itemRows: [],
    itemsStatus: 'Exhausted',
    loadMore: jest.fn(),
    renderItem: () => <View />,
  },
};

function Wrapper({children}: {children: ReactElement}): ReactElement {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 820, height: 1180},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        {children}
      </CpkProvider>
    </SafeAreaProvider>
  );
}

describe('tablet calendar orientation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stacks the calendar inside the paginated list in portrait and splits only in landscape', () => {
    const dimensions = jest.mocked(ReactNative.useWindowDimensions);
    dimensions.mockReturnValue({
      width: 820,
      height: 1180,
      fontScale: 1,
      scale: 2,
    });
    const screen = render(
      <Wrapper>
        <CalendarTablet {...props} />
      </Wrapper>,
    );

    expect(screen.UNSAFE_queryByType(TabletSplit)).toBeNull();
    expect(screen.UNSAFE_getByType(FlashList).props.ListHeaderComponent).toBe(
      props.calendar,
    );

    dimensions.mockReturnValue({
      width: 1180,
      height: 820,
      fontScale: 1,
      scale: 2,
    });
    screen.rerender(
      <Wrapper>
        <CalendarTablet {...props} key="landscape" />
      </Wrapper>,
    );

    expect(screen.UNSAFE_getByType(TabletSplit).props.primary).toBe(
      props.calendar,
    );
    expect(
      screen.UNSAFE_getByType(FlashList).props.ListHeaderComponent,
    ).toBeUndefined();
    const landscapeList = screen.UNSAFE_getByType(FlashList);
    fireEvent(landscapeList, 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 600, height: 540}},
    });
    expect(
      StyleSheet.flatten(landscapeList.props.ListEmptyComponent.props.style),
    ).toEqual({
      minHeight: 540,
      justifyContent: 'center',
    });
    fireEvent(landscapeList, 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 600, height: 420}},
    });
    expect(
      StyleSheet.flatten(landscapeList.props.ListEmptyComponent.props.style),
    ).toEqual({
      minHeight: 420,
      justifyContent: 'center',
    });
  });

  it('does not confine a pending calendar to a half-width panel', () => {
    jest
      .mocked(ReactNative.useWindowDimensions)
      .mockReturnValue({width: 1180, height: 820, fontScale: 1, scale: 2});
    const screen = render(
      <Wrapper>
        <CalendarTablet
          kind="fallback"
          header={null}
          calendar={<View testID="loading" />}
          dayList={<View />}
        />
      </Wrapper>,
    );

    expect(screen.UNSAFE_queryByType(TabletSplit)).toBeNull();
    expect(screen.getByTestId('loading')).toBeTruthy();
  });
});

describe('short mobile calendar scroll extent', () => {
  it.each([CalendarMobile, CalendarTablet])(
    'keeps a confirmed empty day action during the next page query (%p)',
    (CalendarScreen) => {
      const content = (itemsStatus: 'Exhausted' | 'LoadingFirstPage'): ReactElement => (
        <Wrapper>
          <CalendarScreen
            {...props}
            list={{...props.list, itemsStatus, selectedDayItemCount: 0}}
          />
        </Wrapper>
      );
      const screen = render(content('Exhausted'));
      const empty = screen.UNSAFE_getByType(FlashList).props.ListEmptyComponent;
      const action = render(<Wrapper>{empty}</Wrapper>);
      const mounted = action.getByTestId('empty-day');
      screen.rerender(content('LoadingFirstPage'));
      action.rerender(
        <Wrapper>
          {screen.UNSAFE_getByType(FlashList).props.ListEmptyComponent}
        </Wrapper>,
      );
      expect(action.getByTestId('empty-day')).toBe(mounted);
      screen.rerender(content('Exhausted'));
      action.rerender(
        <Wrapper>
          {screen.UNSAFE_getByType(FlashList).props.ListEmptyComponent}
        </Wrapper>,
      );
      expect(action.getByTestId('empty-day')).toBe(mounted);
    },
  );

  it.each([undefined, 2])(
    'does not show a false empty action while count %p is pending',
    (selectedDayItemCount) => {
      const screen = render(
        <Wrapper>
          <CalendarMobile
            {...props}
            list={{...props.list, itemsStatus: 'LoadingFirstPage', selectedDayItemCount}}
          />
        </Wrapper>,
      );
      const empty = render(
        <Wrapper>
          {screen.UNSAFE_getByType(FlashList).props.ListEmptyComponent}
        </Wrapper>,
      );
      expect(empty.queryByTestId('empty-day')).toBeNull();
    },
  );

  it('remeasures changed titles and widths instead of retaining a two-line reservation', () => {
    const dimensions = jest.mocked(ReactNative.useWindowDimensions);
    dimensions.mockReturnValue({
      width: 390,
      height: 844,
      fontScale: 1,
      scale: 3,
    });
    const content = (ledgerTitle: string): ReactElement => (
      <Wrapper>
        <CalendarMobile
          {...props}
          parallax={{
            accentSurface: {
              background: theme.light.role.primary,
              foreground: '#fff',
            },
            ledgerTitle,
            onAdd: jest.fn(),
            onOpenDrawer: jest.fn(),
          }}
        />
      </Wrapper>
    );
    const screen = render(content('A longer ledger title'));
    const measure = (height: number): void =>
      fireEvent(
        screen.getByTestId('calendar-parallax-title-content'),
        'layout',
        {nativeEvent: {layout: {x: 0, y: 0, width: 350, height}}},
      );
    measure(90);
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 146,
    });
    screen.rerender(content('Short'));
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 56,
    });
    measure(56);
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 112,
    });
    dimensions.mockReturnValue({
      width: 320,
      height: 700,
      fontScale: 1.5,
      scale: 3,
    });
    screen.rerender(content('Short'));
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 56,
    });
    measure(68);
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 124,
    });
  });

  it('uses measured wrapped content for the header, list inset and scroll extent', () => {
    jest
      .mocked(ReactNative.useWindowDimensions)
      .mockReturnValue({width: 390, height: 844, fontScale: 1, scale: 3});
    const screen = render(
      <Wrapper>
        <CalendarMobile
          {...props}
          parallax={{
            accentSurface: {
              background: theme.light.role.primary,
              foreground: '#fff',
            },
            ledgerTitle: 'A long two-line ledger title',
            onAdd: jest.fn(),
            onOpenDrawer: jest.fn(),
          }}
        />
      </Wrapper>,
    );
    const list = screen.UNSAFE_getByType(FlashList);
    const measureTitle = (height: number): void => {
      fireEvent(
        screen.getByTestId('calendar-parallax-title-content'),
        'layout',
        {
          nativeEvent: {layout: {x: 0, y: 0, width: 350, height}},
        },
      );
    };
    measureTitle(56);
    fireEvent(list, 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 720}},
    });
    expect(list.props.contentContainerStyle.minHeight).toBe(
      720 + calendarExpandedHeaderHeight(56) - 56,
    );
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 112,
    });
    expect(list.props.contentContainerStyle.paddingTop).toBe(112);
    measureTitle(90);
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 146,
    });
    expect(list.props.contentContainerStyle.paddingTop).toBe(146);
    expect(list.props.contentContainerStyle.minHeight).toBe(810);
    measureTitle(56);
    expect(screen.getByTestId('calendar-parallax-header')).toHaveStyle({
      height: 112,
    });
    fireEvent(list, 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 600}},
    });
    expect(list.props.contentContainerStyle.minHeight).toBe(
      600 + calendarExpandedHeaderHeight(56) - 56,
    );
  });
});
