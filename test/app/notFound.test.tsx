import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import NotFoundScreen from '../../app/+not-found';
import {NOT_FOUND_OPTIONS} from '../../src/features/runtime/navigation';
import {theme} from '../../src/theme';
import {t} from '../../src/utils/i18n';

describe('app/+not-found', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses branded chrome and returns to the app root', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <NotFoundScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(NOT_FOUND_OPTIONS.headerShown).toBe(false);
    expect(screen.getByTestId('not-found-screen')).toBeTruthy();
    expect(screen.getByTestId('not-found-screen-mark')).toBeTruthy();
    expect(screen.getByLabelText('404')).toBeTruthy();
    expect(screen.getByText(t('error.pageNotFoundBody'))).toBeTruthy();

    fireEvent.press(screen.getByText(t('common.goHome')));

    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('returns to the previous screen when possible', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'dark'}}
        >
          <NotFoundScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText(t('a11y.back')));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
