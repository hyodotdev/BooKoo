import 'react-native';

import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {useMutation, useQuery} from 'convex/react';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  LedgerDangerScreen,
  LedgerDetailsScreen,
  LedgerTimezoneScreen,
} from '../../../../src/features/ledger/screens/ledgerAdmin';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {LEDGER_ACCENTS} from '../../../../src/theme/ledgerAccent';
import {setActiveLocale} from '../../../../src/utils/i18n';

function createMutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<
  typeof useMutation
> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

jest.mock('../../../../src/features/release/ReportControl', () => ({
  ReportControl: () => null,
}));

const ledger: LedgerRow = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: 'Shared household expenses',
  emoji: null,
  iconKey: null,
  id: 'ledger-test' as LedgerRow['id'],
  invitePolicy: 'MANAGERS_ONLY',
  itemWritePolicy: 'ANY_MEMBER',
  lastOpenedAt: null,
  lastReadAt: null,
  maintenanceLock: 'NONE',
  memberCount: 2,
  muted: false,
  notifyComment: true,
  notifyNewItem: true,
  ownerId: 'user-owner' as LedgerRow['ownerId'],
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Household',
  updatedAt: 1,
  weekStartsOn: 0,
};

function renderScreen() {
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
        <LedgerDetailsScreen ledgerId="ledger-test" />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger details', () => {
  const updateImplementation = jest.fn(() => Promise.resolve());
  const update = createMutationMock(updateImplementation);

  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useQuery).mockReturnValue(ledger);
    jest.mocked(useMutation).mockReturnValue(update);
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  it.each([
    [null, 'Warning', 'Archive keeps the ledger read-only'],
    [1, 'Archived', 'This ledger is archived and is read-only.'],
  ] as const)(
    'explains archive and delete before either is pressed (archivedAt %s)',
    (archivedAt, title, body) => {
      jest.mocked(useQuery).mockReturnValue({...ledger, archivedAt});
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
            <LedgerDangerScreen ledgerId="ledger-test" />
          </CpkProvider>
        </SafeAreaProvider>,
      );

      // It asked "Are you sure you want to delete?" before any action, and an
      // archived ledger looked the same except for its button.
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(new RegExp(body))).toBeTruthy();
      expect(screen.queryByText('Are you sure you want to delete?')).toBeNull();
    },
  );

  it('labels the week-start choice on the time zone page', () => {
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
          <LedgerTimezoneScreen ledgerId="ledger-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    // "Sunday | Monday | Saturday" stood alone between two labelled fields.
    expect(screen.getByText('Start of week')).toBeTruthy();
    expect(screen.getByText('Sunday')).toBeTruthy();
  });

  it('labels the title field as a field, not with the empty-form prompt', () => {
    const screen = renderScreen();

    // The label read "Title for ledger." — the new-ledger placeholder.
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.queryByText('Title for ledger.')).toBeNull();
  });

  it('previews the selected ledger colour and returns after update', async () => {
    const screen = renderScreen();

    expect(screen.getByTestId('button-container')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.dark.base,
    });

    fireEvent.press(screen.getByRole('radio', {name: 'YELLOW'}));

    expect(screen.getByTestId('button-container')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.YELLOW.dark.base,
    });

    fireEvent.press(screen.getByTestId('ledger-details-update'));

    await waitFor(() => {
      expect(updateImplementation).toHaveBeenCalledWith({
        colorKey: 'YELLOW',
        description: ledger.description,
        iconKey: expect.any(String),
        ledgerId: ledger.id,
        title: ledger.title,
      });
      expect(router.back).toHaveBeenCalledTimes(1);
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns to ledger More after a deep-linked update', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('ledger-details-update'));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)/me');
    });
    expect(router.back).not.toHaveBeenCalled();
  });
});
