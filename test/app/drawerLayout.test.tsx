import 'react-native';

import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import LedgerDrawerLayout from '../../app/(app)/(tabs)/_layout';
import {theme} from '../../src/theme';

describe('authenticated drawer layout', () => {
  it('uses the native Expo Router drawer with gestures and square edges', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <LedgerDrawerLayout />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    const drawer = screen.getByTestId('Drawer');
    expect(drawer.props.drawerContent).toEqual(expect.any(Function));
    expect(drawer.props.screenOptions).toEqual(
      expect.objectContaining({
        drawerType: 'slide',
        headerShown: false,
        keyboardDismissMode: 'on-drag',
        swipeEdgeWidth: 56,
        swipeEnabled: true,
      }),
    );
    expect(drawer.props.screenOptions.drawerStyle).toEqual(
      expect.objectContaining({
        borderRadius: 0,
        borderBottomRightRadius: 0,
        borderTopRightRadius: 0,
      }),
    );
  });
});
