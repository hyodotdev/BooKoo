import 'react-native';

import type {ReactElement} from 'react';
import {StyleSheet} from 'react-native';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {HeaderShownContext} from 'expo-router/react-navigation';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {AppScreen} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';

const renderScreen = (child: ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 412, height: 924},
        insets: {top: 60, left: 0, right: 0, bottom: 24},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        {child}
      </CpkProvider>
    </SafeAreaProvider>,
  );

describe('AppScreen inset ownership', () => {
  it('keeps the normal full-screen safe area by default', () => {
    const screen = renderScreen(<AppScreen />);
    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toBeUndefined();
  });

  it('does not add a status-bar gap inside a native Android sheet', () => {
    const screen = renderScreen(<AppScreen insetTop={false} />);
    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toEqual([
      'left',
      'right',
      'bottom',
    ]);
  });

  it('lets a visible native header own the top inset on detail routes', () => {
    const screen = renderScreen(
      <HeaderShownContext.Provider value={true}>
        <AppScreen />
      </HeaderShownContext.Provider>,
    );
    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toEqual([
      'left',
      'right',
      'bottom',
    ]);
  });

  it('also omits the colored top spacer below a native header', () => {
    const screen = renderScreen(
      <HeaderShownContext.Provider value={true}>
        <AppScreen bottomInsetColor={theme.light.bg.basic} />
      </HeaderShownContext.Provider>,
    );
    expect(screen.getByTestId('app-screen-top-inset')).toHaveStyle({height: 0});
  });

  it('keeps the top safe area for custom-header and parallax routes', () => {
    const screen = renderScreen(
      <HeaderShownContext.Provider value={false}>
        <AppScreen statusBarBackgroundColor={theme.light.bg.basic} />
      </HeaderShownContext.Provider>,
    );
    expect(screen.getByTestId('app-screen-top-inset')).toHaveStyle({
      height: 60,
    });
  });

  it('also removes the explicit top spacer with a colored bottom action', () => {
    const screen = renderScreen(
      <AppScreen bottomInsetColor={theme.light.bg.basic} insetTop={false} />,
    );
    expect(screen.getByTestId('app-screen-top-inset')).toHaveStyle({height: 0});
  });

  it('keeps side safe areas neutral when the bottom action has an accent', () => {
    const screen = renderScreen(
      <AppScreen
        backgroundColor={theme.light.bg.basic}
        bottomInsetColor={theme.light.button.primary.bg}
      />,
    );
    expect(
      StyleSheet.flatten(screen.UNSAFE_getByType(SafeAreaView).props.style)
        .backgroundColor,
    ).toBe(theme.light.bg.basic);
    expect(screen.getByTestId('app-screen-bottom-inset')).toHaveStyle({
      backgroundColor: theme.light.button.primary.bg,
      bottom: 0,
      height: 24,
      left: 0,
      right: 0,
    });
  });
});
