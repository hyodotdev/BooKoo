import type {ReactElement} from 'react';
import {Appearance, Text} from 'react-native';
import {render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  CpkReadySplashBoundary,
  NativeRootBackground,
} from '~/components/providers';
import {dark, light, theme} from '~/theme';

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

describe('CpkReadySplashBoundary', () => {
  it('syncs native surfaces and releases the override for System', async () => {
    const setColorScheme = jest
      .spyOn(Appearance, 'setColorScheme')
      .mockImplementation(() => undefined);
    const content = (nativeThemeType?: 'light' | 'dark'): ReactElement => (
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider themeConfig={{customTheme: theme}}>
          <NativeRootBackground nativeThemeType={nativeThemeType}>
            <Text>content</Text>
          </NativeRootBackground>
        </CpkProvider>
      </SafeAreaProvider>
    );
    const view = render(content('dark'));
    await waitFor(() =>
      expect(setColorScheme).toHaveBeenLastCalledWith('dark'),
    );
    view.rerender(content('light'));
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    view.rerender(content());
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    expect(view.getByText('content')).toBeTruthy();
    setColorScheme.mockRestore();
  });

  it('reveals provider recovery screens as soon as cpk assets are ready', async () => {
    const hideAsync = SplashScreen.hideAsync as jest.MockedFunction<
      typeof SplashScreen.hideAsync
    >;
    hideAsync.mockClear();

    const child: ReactElement = <Text>recovery</Text>;
    const view = render(
      <CpkReadySplashBoundary>{child}</CpkReadySplashBoundary>,
    );

    expect(view.getByText('recovery')).toBeTruthy();
    await waitFor(() => expect(hideAsync).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['light', light.bg.basic],
    ['dark', dark.bg.basic],
  ] as const)(
    'keeps the native root background in sync with the %s theme',
    async (initialThemeType, expectedBackground) => {
      const setBackgroundColorAsync =
        SystemUI.setBackgroundColorAsync as jest.MockedFunction<
          typeof SystemUI.setBackgroundColorAsync
        >;
      setBackgroundColorAsync.mockClear();

      render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 390, height: 844},
            insets: {top: 47, left: 0, right: 0, bottom: 34},
          }}
        >
          <CpkProvider themeConfig={{customTheme: theme, initialThemeType}}>
            <NativeRootBackground>
              <Text>content</Text>
            </NativeRootBackground>
          </CpkProvider>
        </SafeAreaProvider>,
      );

      await waitFor(() =>
        expect(setBackgroundColorAsync).toHaveBeenCalledWith(
          expectedBackground,
        ),
      );
    },
  );
});
