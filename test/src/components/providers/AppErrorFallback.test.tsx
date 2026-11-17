import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AppErrorFallback} from '../../../../src/components/providers/AppErrorFallback';
import {theme} from '../../../../src/theme';
import {setActiveLocale, t} from '../../../../src/utils/i18n';

function renderFallback(resetError = jest.fn()) {
  return {
    resetError,
    screen: render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <AppErrorFallback
            error={new Error('private backend details')}
            resetError={resetError}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    ),
  };
}

describe('AppErrorFallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('leaves the failed screen without exposing the raw error', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);
    const {resetError, screen} = renderFallback();

    expect(screen.queryByText(/private backend details/)).toBeNull();
    expect(screen.getByTestId('app-error-fallback')).toBeTruthy();
    expect(screen.getByTestId('app-error-fallback-mark')).toBeTruthy();
    expect(screen.getByText(t('error.generic'))).toBeTruthy();
    fireEvent.press(screen.getByText(t('a11y.back')));

    expect(resetError).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('falls back to More and offers an in-place retry', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    const {resetError, screen} = renderFallback();

    fireEvent.press(screen.getByText(t('a11y.back')));
    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)/me');

    fireEvent.press(screen.getByText(t('common.tryAgain')));
    expect(resetError).toHaveBeenCalledTimes(2);
  });
});
