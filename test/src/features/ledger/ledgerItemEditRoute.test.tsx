import 'react-native';

import {render, waitFor} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerItemEditRouteGuard} from '../../../../src/features/ledger/screens/ledgerItemEditRoute';
import type {ItemRow, LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: {userId: 'user-other'}}),
}));

const item = {
  authorId: 'user-author',
  deletedAt: null,
  id: 'item-test',
  ledgerId: 'ledger-test',
} as ItemRow;

const ledger = {
  archivedAt: null,
  itemWritePolicy: 'ANY_MEMBER',
  maintenanceLock: 'NONE',
  role: 'MEMBER',
} as LedgerRow;

function renderGuard(ledgerId = 'ledger-test') {
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
        <LedgerItemEditRouteGuard itemId="item-test" ledgerId={ledgerId} />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger item edit route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  it('returns a non-author member even under ANY_MEMBER creation policy', async () => {
    let queryCall = 0;
    const queryResults = [item, ledger] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(
        () => queryResults[queryCall++ % queryResults.length],
      );

    const screen = renderGuard();

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns a mismatched ledger/item pair before loading its ledger', async () => {
    jest.mocked(useQuery).mockReturnValue(item);

    const screen = renderGuard('ledger-wrong');

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
