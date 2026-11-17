import 'react-native';

import type {ReactElement} from 'react';
import {Text} from 'react-native';
import {DarkTheme, DefaultTheme, useTheme} from 'expo-router';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  AppNavigationTheme,
  buildNavigationTheme,
} from '../../../src/theme/navigationTheme';
import {theme} from '../../../src/theme';

// The global test setup replaces expo-router with a stub. This file needs the
// real theme objects and the real provider, which pull in an ESM-only package
// that the navigation tests stub out the same way.
jest.unmock('expo-router');
jest.mock('standard-navigation', () => ({}));

function Probe(): ReactElement {
  const {colors, dark} = useTheme();
  return (
    <Text testID="probe">{`${dark ? 'dark' : 'light'}:${String(colors.background)}`}</Text>
  );
}

const withCpk = (
  child: ReactElement,
  themeType: 'light' | 'dark',
): ReactElement => (
  <SafeAreaProvider
    initialMetrics={{
      frame: {x: 0, y: 0, width: 390, height: 844},
      insets: {top: 0, left: 0, right: 0, bottom: 0},
    }}
  >
    <CpkProvider
      themeConfig={{customTheme: theme, initialThemeType: themeType}}
    >
      {child}
    </CpkProvider>
  </SafeAreaProvider>
);

describe('navigation theme', () => {
  it('replaces only the background of the base theme', () => {
    const light = buildNavigationTheme('light', 'paper-color');

    expect(light.colors.background).toBe('paper-color');
    expect(light.dark).toBe(false);
    expect({
      ...light.colors,
      background: DefaultTheme.colors.background,
    }).toEqual(DefaultTheme.colors);
  });

  it('starts from the dark theme in dark mode, and leaves both bases untouched', () => {
    const dark = buildNavigationTheme('dark', 'dark-paper');

    expect(dark.dark).toBe(true);
    expect(dark.colors.background).toBe('dark-paper');
    expect({...dark.colors, background: DarkTheme.colors.background}).toEqual(
      DarkTheme.colors,
    );
    // React Navigation's own light gray is what showed through before.
    expect(DefaultTheme.colors.background).toBe('rgb(242, 242, 242)');
    expect(DarkTheme.colors.background).not.toBe('dark-paper');
  });

  it('gives every navigator underneath the app background', () => {
    const screen = render(
      withCpk(
        <AppNavigationTheme background="app-paper">
          <Probe />
        </AppNavigationTheme>,
        'light',
      ),
    );

    expect(screen.getByTestId('probe').props.children).toBe('light:app-paper');
  });

  it('follows dark mode', () => {
    const screen = render(
      withCpk(
        <AppNavigationTheme background="app-paper">
          <Probe />
        </AppNavigationTheme>,
        'dark',
      ),
    );

    expect(screen.getByTestId('probe').props.children).toBe('dark:app-paper');
  });
});
