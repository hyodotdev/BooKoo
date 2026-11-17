import type {PropsWithChildren, ReactElement} from 'react';
import {useMemo} from 'react';
import {DarkTheme, DefaultTheme, ThemeProvider, type Theme} from 'expo-router';
import {useCPK} from 'cpk-ui';

/**
 * React Navigation paints its own background under every navigator: behind a
 * native stack's screens, which shows for a frame or two while one screen
 * replaces another, and behind tab and drawer scenes. Left at its default that
 * is a light gray, in dark mode too, and `contentStyle` cannot reach it. The
 * app hands it the background its screens actually use.
 */
export function buildNavigationTheme(
  mode: 'dark' | 'light',
  background: string,
): Theme {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return {...base, colors: {...base.colors, background}};
}

export function AppNavigationTheme({
  background,
  children,
}: PropsWithChildren<{readonly background: string}>): ReactElement {
  const {themeType} = useCPK();
  const value = useMemo(
    () =>
      buildNavigationTheme(themeType === 'dark' ? 'dark' : 'light', background),
    [background, themeType],
  );
  return <ThemeProvider value={value}>{children}</ThemeProvider>;
}
