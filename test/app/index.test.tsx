import 'react-native';

import {render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import Page from '../../app/(app)/index';
import {
  APP_INDEX_OPTIONS,
  APP_STACK_BACK_OPTIONS,
  ENTRY_PAGE_OPTIONS,
  LEDGER_NEW_OPTIONS,
} from '../../app/(app)/_layout';
import {ENTRY_CATEGORY_SHEET_OPTIONS} from '../../src/features/ledger/entryCategoryNavigation';
import {theme} from '../../src/theme';

describe('app/(app)/index', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the route header hidden while replacing into tabs', async () => {
    const testingLib = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <Page />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(APP_INDEX_OPTIONS.headerShown).toBe(false);
    expect(APP_STACK_BACK_OPTIONS).toEqual({
      headerBackButtonDisplayMode: 'minimal',
    });
    expect(ENTRY_PAGE_OPTIONS).toEqual({
      animation: 'slide_from_right',
      headerShown: false,
      presentation: 'card',
    });
    expect(LEDGER_NEW_OPTIONS).toEqual({
      animation: 'slide_from_right',
      headerShown: false,
      presentation: 'card',
    });
    expect(ENTRY_CATEGORY_SHEET_OPTIONS).toEqual({
      headerShown: false,
      presentation: 'formSheet',
      sheetAllowedDetents: [0.62, 0.92],
      sheetGrabberVisible: true,
      sheetInitialDetentIndex: 0,
    });
    expect(testingLib.getByTestId('route-loading')).toBeTruthy();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)'),
    );

    expect(testingLib.toJSON()).toBeTruthy();
  });
});
