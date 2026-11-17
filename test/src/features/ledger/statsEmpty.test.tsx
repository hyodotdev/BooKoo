import type {ReactElement} from 'react';
import * as ReactNative from 'react-native';
import {View} from 'react-native';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  StatsMobile,
  StatsTablet,
} from '../../../../src/features/ledger/screens/stats';
import {
  NoLedgerEmptyCanvas,
  TabletSplit,
} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 820, height: 1180, fontScale: 1, scale: 2})),
}));

const renderStats = (ui: ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        {ui}
      </CpkProvider>
    </SafeAreaProvider>,
  );

describe('stats empty ledger layout', () => {
  it('stacks the chart above rows in portrait and splits only in landscape', () => {
    const dimensions = jest.mocked(ReactNative.useWindowDimensions);
    const props = {
      kind: 'ready' as const,
      header: null,
      chart: <View testID="chart" />,
      list: <View testID="rows" />,
    };
    dimensions.mockReturnValue({
      width: 820,
      height: 1180,
      fontScale: 1,
      scale: 2,
    });
    const screen = renderStats(<StatsTablet {...props} />);
    expect(screen.UNSAFE_queryByType(TabletSplit)).toBeNull();
    expect(screen.getByTestId('stats-chart')).toBeTruthy();
    dimensions.mockReturnValue({
      width: 1180,
      height: 820,
      fontScale: 1,
      scale: 2,
    });
    screen.unmount();
    const landscape = renderStats(<StatsTablet {...props} />);
    expect(landscape.UNSAFE_getByType(TabletSplit)).toBeTruthy();
  });
  it('fills the tab with the empty canvas instead of squeezing it into the chart slot', () => {
    const screen = renderStats(
      <StatsMobile
        chart={
          <NoLedgerEmptyCanvas onAdd={jest.fn()} onOpenDrawer={jest.fn()} />
        }
        header={null}
        kind="empty"
        list={<View />}
      />,
    );

    expect(screen.getByTestId('no-ledger-empty')).toBeTruthy();
    expect(screen.queryByTestId('stats-chart')).toBeNull();
    expect(screen.queryByTestId('screen-scroll-frame')).toBeNull();
  });

  it('keeps the chart slot only when a ledger is ready', () => {
    const screen = renderStats(
      <StatsMobile
        chart={<View testID="ready-chart" />}
        header={<View testID="ready-header" />}
        kind="ready"
        list={<View testID="ready-list" />}
      />,
    );

    expect(screen.getByTestId('stats-chart')).toBeTruthy();
    expect(screen.getByTestId('ready-chart')).toBeTruthy();
    expect(screen.getByTestId('ready-header')).toBeTruthy();
  });

  it.each([StatsMobile, StatsTablet])(
    'gives a pending month the full content area in %p',
    (Screen) => {
      const screen = renderStats(
        <Screen
          chart={<View testID="pending-month" style={{flex: 1}} />}
          header={<View testID="ledger-header" />}
          kind="loading"
          list={<View testID="category-list" />}
        />,
      );

      expect(screen.getByTestId('ledger-header')).toBeTruthy();
      expect(screen.getByTestId('pending-month')).toBeTruthy();
      expect(screen.queryByTestId('stats-chart')).toBeNull();
      expect(screen.queryByTestId('category-list')).toBeNull();
      expect(screen.queryByTestId('screen-scroll-frame')).toBeNull();
    },
  );
});
