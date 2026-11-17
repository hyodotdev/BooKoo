import 'react-native';

import {render, waitFor} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerItemCreateRouteGuard} from '../../../../src/features/ledger/screens/ledgerItemCreateRoute';
import {theme} from '../../../../src/theme';

function renderGuard() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <LedgerItemCreateRouteGuard ledgerId="ledger-unavailable" />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger item create route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  it('leaves immediately when the route ledger is unavailable', async () => {
    jest.mocked(useQuery).mockReturnValue(null);

    const screen = renderGuard();

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
