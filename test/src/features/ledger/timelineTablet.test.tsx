import type {ReactElement} from 'react';
import * as ReactNative from 'react-native';
import {View} from 'react-native';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {TimelineTablet} from '../../../../src/features/ledger/screens/timeline';
import {TabletSplit} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 820, height: 1180, fontScale: 1, scale: 2})),
}));

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

const props = {
  header: <View testID="header" />,
  list: <View testID="entries" />,
  detail: <View testID="selected-entry" />,
};

describe('tablet timeline orientation', () => {
  it.each([
    [820, 1180],
    [820, 820],
  ])('stacks at %s x %s and preserves detail on rotation', (width, height) => {
    const dimensions = jest.mocked(ReactNative.useWindowDimensions);
    dimensions.mockReturnValue({width, height, fontScale: 1, scale: 2});
    const screen = render(<TimelineTablet {...props} />, {wrapper: Wrapper});
    expect(screen.UNSAFE_queryByType(TabletSplit)).toBeNull();
    expect(screen.getByTestId('timeline-stacked-list').children).toHaveLength(
      1,
    );
    expect(screen.getByTestId('timeline-stacked-detail').children).toHaveLength(
      1,
    );

    dimensions.mockReturnValue({
      width: 1180,
      height: 820,
      fontScale: 1,
      scale: 2,
    });
    screen.rerender(<TimelineTablet {...props} />);
    expect(screen.UNSAFE_getByType(TabletSplit).props.secondary).toBe(
      props.detail,
    );
    expect(screen.queryByTestId('timeline-stacked')).toBeNull();
  });

  it.each([
    [820, 1180],
    [1180, 820],
  ])(
    'uses the entire empty/loading content area at %s x %s',
    (width, height) => {
      jest
        .mocked(ReactNative.useWindowDimensions)
        .mockReturnValue({width, height, fontScale: 1, scale: 2});
      const screen = render(<TimelineTablet {...props} detail={null} />, {
        wrapper: Wrapper,
      });
      expect(screen.UNSAFE_queryByType(TabletSplit)).toBeNull();
      expect(screen.queryByTestId('timeline-stacked-detail')).toBeNull();
      expect(screen.getByTestId('entries')).toBeTruthy();
    },
  );
});
