import 'react-native';

import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerRouteGuard} from '../../../../src/features/ledger/screens/ledgerRouteGuard';
import {useLedgerStore} from '../../../../src/features/ledger/store';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';

const ledger = {
  id: 'ledger-authorized',
  title: 'Trip',
  archivedAt: null,
  maintenanceLock: 'NONE',
  role: 'MEMBER',
} as LedgerRow;

function renderGuard(showJoinedAction = false) {
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
        <LedgerRouteGuard
          ledgerId="ledger-untrusted"
          showJoinedAction={showJoinedAction}
        />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger route membership guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLedgerStore.setState({activeLedgerId: 'ledger-current'});
  });

  it('renders only loading while membership is unresolved', () => {
    jest.mocked(useQuery).mockReturnValue(undefined);

    const screen = renderGuard();

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
    expect(useLedgerStore.getState().activeLedgerId).toBe('ledger-current');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns immediately without changing state when membership is absent', async () => {
    jest.mocked(useQuery).mockReturnValue(null);
    jest.mocked(router.canGoBack).mockReturnValue(true);

    renderGuard();

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
    expect(useLedgerStore.getState().activeLedgerId).toBe('ledger-current');
  });

  it('replaces a history-free deep link with the safe ledger home', async () => {
    jest.mocked(useQuery).mockReturnValue(null);
    jest.mocked(router.canGoBack).mockReturnValue(false);

    renderGuard();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)'),
    );
    expect(router.back).not.toHaveBeenCalled();
    expect(useLedgerStore.getState().activeLedgerId).toBe('ledger-current');
  });

  it('activates and opens only a ledger confirmed for this account', async () => {
    jest.mocked(useQuery).mockReturnValue(ledger);

    renderGuard();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)'),
    );
    expect(useLedgerStore.getState().activeLedgerId).toBe(ledger.id);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('offers an optional first entry and opens the confirmed ledger editor once', () => {
    jest.mocked(useQuery).mockReturnValue(ledger);

    const screen = renderGuard(true);
    expect(router.replace).not.toHaveBeenCalled();

    const add = screen.getByTestId('joined-invite-add-entry');
    fireEvent.press(add);
    fireEvent.press(add);
    expect(useLedgerStore.getState().activeLedgerId).toBe(ledger.id);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/ledger/[ledgerId]/item/new',
      params: {ledgerId: ledger.id, fromInvite: '1'},
    });
  });

  it('keeps the joined ledger selected if the confirmation closes without a choice', () => {
    jest.mocked(useQuery).mockReturnValue(ledger);

    const screen = renderGuard(true);
    screen.unmount();

    expect(useLedgerStore.getState().activeLedgerId).toBe(ledger.id);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the joined ledger without an entry when the member skips the offer', () => {
    jest.mocked(useQuery).mockReturnValue(ledger);

    const screen = renderGuard(true);
    fireEvent.press(screen.getByTestId('joined-invite-open-ledger'));

    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)');
    expect(useLedgerStore.getState().activeLedgerId).toBe(ledger.id);
  });

  it.each([{role: 'VIEWER'}, {archivedAt: 1}, {maintenanceLock: 'CURRENCY'}])(
    'does not offer an entry when the joined ledger cannot be written: %o',
    (restriction) => {
      jest.mocked(useQuery).mockReturnValue({...ledger, ...restriction});
      const screen = renderGuard(true);
      expect(screen.queryByTestId('joined-invite-add-entry')).toBeNull();
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)');
    },
  );
});
