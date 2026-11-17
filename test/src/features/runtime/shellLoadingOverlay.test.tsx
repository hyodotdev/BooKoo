import 'react-native';

import type {ReactElement} from 'react';
import {act, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {orbitPhaseAt} from '../../../../src/components/uis/BookooLoading';
import {useAccessibilityPreferences} from '../../../../src/features/runtime/accessibility';
import {ShellLoadingOverlay} from '../../../../src/features/runtime/shellLoadingOverlay';
import {theme} from '../../../../src/theme';

jest.mock('../../../../src/features/runtime/accessibility', () => ({
  useAccessibilityPreferences: jest.fn(() => ({
    highContrast: false,
    reduceMotion: false,
    screenReaderEnabled: false,
  })),
}));

const withProviders = (child: ReactElement): ReactElement => (
  <SafeAreaProvider
    initialMetrics={{
      frame: {x: 0, y: 0, width: 1024, height: 768},
      insets: {top: 0, left: 0, right: 0, bottom: 0},
    }}
  >
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      {child}
    </CpkProvider>
  </SafeAreaProvider>
);

describe('ShellLoadingOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing when the shell was ready from the first frame', () => {
    const screen = render(
      withProviders(<ShellLoadingOverlay visible={false} />),
    );

    expect(screen.queryByTestId('shell-loading-overlay')).toBeNull();
  });

  it('covers the whole shell with the branded loader, then fades out', () => {
    const screen = render(withProviders(<ShellLoadingOverlay visible />));

    expect(screen.getByTestId('shell-loading-overlay')).toHaveStyle({
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    });
    expect(screen.getByTestId('route-loading')).toBeTruthy();

    screen.rerender(withProviders(<ShellLoadingOverlay visible={false} />));
    // Still on screen while it fades, and no longer catching touches.
    expect(screen.getByTestId('shell-loading-overlay')).toHaveProp(
      'pointerEvents',
      'none',
    );

    act(() => jest.advanceTimersByTime(400));
    expect(screen.queryByTestId('shell-loading-overlay')).toBeNull();
  });

  it('cuts straight to the screen under reduce motion', () => {
    jest.mocked(useAccessibilityPreferences).mockReturnValue({
      highContrast: false,
      reduceMotion: true,
      screenReaderEnabled: false,
    });
    const screen = render(withProviders(<ShellLoadingOverlay visible />));

    screen.rerender(withProviders(<ShellLoadingOverlay visible={false} />));
    expect(screen.queryByTestId('shell-loading-overlay')).toBeNull();
  });
});

describe('orbitPhaseAt', () => {
  it('continues one shared orbit across loaders mounted at different times', () => {
    expect(orbitPhaseAt(0)).toBe(0);
    expect(orbitPhaseAt(675)).toBeCloseTo(0.5);
    expect(orbitPhaseAt(1_350 + 675)).toBeCloseTo(0.5);
    expect(orbitPhaseAt(1_349)).toBeLessThan(1);
  });
});
