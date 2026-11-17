import 'react-native';

import type {ReactElement} from 'react';
import {act, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ScreenSkeleton} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';

const withProviders = (
  child: ReactElement,
  insets = {top: 0, left: 0, right: 0, bottom: 0},
): ReactElement => (
  <SafeAreaProvider
    initialMetrics={{
      frame: {x: 0, y: 0, width: 390, height: 844},
      insets,
    }}
  >
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      {child}
    </CpkProvider>
  </SafeAreaProvider>
);

describe('ScreenSkeleton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the branded loader at once by default', () => {
    const screen = render(withProviders(<ScreenSkeleton />));

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
  });

  it('holds the loader back for its grace period, so a fast load never flashes it', () => {
    const screen = render(withProviders(<ScreenSkeleton delayMs={400} />));

    expect(screen.queryByTestId('bookoo-loading')).toBeNull();
    expect(screen.getByTestId('screen-skeleton-grace')).toHaveStyle({flex: 1});

    act(() => jest.advanceTimersByTime(399));
    expect(screen.queryByTestId('bookoo-loading')).toBeNull();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
  });

  it('never shows a loader for a load that ends inside the grace period', () => {
    const screen = render(withProviders(<ScreenSkeleton delayMs={400} />));

    act(() => jest.advanceTimersByTime(200));
    screen.unmount();
    // No timer is left behind to set state on an unmounted component.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rests half the inset difference lower for a tab fallback, where the shell overlay centers its own loader', () => {
    // The overlay is centered on the whole screen; a screen's skeleton is
    // centered inside the safe area, so it lands (top - bottom) / 2 lower.
    const screen = render(
      withProviders(<ScreenSkeleton centerOnScreen />, {
        top: 60,
        left: 0,
        right: 0,
        bottom: 30,
      }),
    );

    expect(screen.getByTestId('screen-skeleton-centered')).toHaveStyle({
      flex: 1,
      transform: [{translateY: -15}],
    });
    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
  });

  it('leaves every other skeleton where its screen puts it', () => {
    const screen = render(
      withProviders(<ScreenSkeleton />, {
        top: 60,
        left: 0,
        right: 0,
        bottom: 30,
      }),
    );

    expect(screen.queryByTestId('screen-skeleton-centered')).toBeNull();
    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
  });

  it('still waits out its grace period before showing the centered loader', () => {
    const screen = render(
      withProviders(<ScreenSkeleton centerOnScreen delayMs={400} />),
    );

    expect(screen.queryByTestId('screen-skeleton-centered')).toBeNull();
    expect(screen.getByTestId('screen-skeleton-grace')).toBeTruthy();

    act(() => jest.advanceTimersByTime(400));
    expect(screen.getByTestId('screen-skeleton-centered')).toBeTruthy();
  });
});
