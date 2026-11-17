import 'react-native';

import type {ReactElement, ReactNode} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import MeRoute from '../../../../app/(app)/(tabs)/(root)/me';
import {useOpenLedgerDrawer} from '../../../../src/features/ledger/drawer';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {useActiveLedger} from '../../../../src/features/ledger/useActiveLedger';
import {LedgerSettingsScreen} from '../../../../src/features/ledger/screens/ledgerAdmin';
import {ReportControl} from '../../../../src/features/release/ReportControl';
import {theme} from '../../../../src/theme';
import {setActiveLocale, t} from '../../../../src/utils/i18n';

jest.mock('../../../../src/features/ledger/drawer', () => ({
  useOpenLedgerDrawer: jest.fn(),
}));
jest.mock('../../../../src/features/ledger/useActiveLedger', () => ({
  useActiveLedger: jest.fn(),
}));
jest.mock('../../../../src/features/release/ReportControl', () => ({
  ReportControl: jest.fn(() => null),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      ListEmptyComponent,
      ListHeaderComponent,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      ListEmptyComponent?: ReactNode;
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: unknown}) => ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        View,
        {testID},
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement(View, {key: index}, renderItem({item})),
            ),
      ),
  };
});

const ledger: LedgerRow = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: '',
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
  ownerId: 'user-test' as LedgerRow['ownerId'],
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Storyboard Ledger',
  updatedAt: 1,
  weekStartsOn: 0,
};

const mockUseActiveLedger = jest.mocked(useActiveLedger);
const mockUseOpenLedgerDrawer = jest.mocked(useOpenLedgerDrawer);

function renderRoute(content: ReactElement = <MeRoute />) {
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
        {content}
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger More tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('shows only secondary actions on Manage without repeating More', () => {
    const screen = renderRoute(
      <LedgerSettingsScreen ledgerId={ledger.id} initialLedger={ledger} />,
    );

    expect(screen.getAllByText(t('settings.advancedSection'))).toHaveLength(1);
    expect(screen.getByTestId('settings-section-advanced')).not.toHaveStyle({
      marginTop: 24,
    });
    for (const key of ['export', 'deleted', 'requests', 'audit', 'danger']) {
      expect(screen.getByTestId(`ledger-settings-row-${key}`)).toBeTruthy();
    }
    for (const key of [
      'details', 'members', 'invites', 'categories', 'photos',
      'pro', 'currency', 'timezone', 'manage',
    ]) {
      expect(screen.queryByTestId(`ledger-settings-row-${key}`)).toBeNull();
    }
  });

  it('lists Report as a Manage row that opens the report sheet', () => {
    const screen = renderRoute(
      <LedgerSettingsScreen ledgerId={ledger.id} initialLedger={ledger} />,
    );
    const report = jest.mocked(ReportControl);
    const lastProps = () => report.mock.calls.at(-1)?.[0];

    expect(lastProps()).toMatchObject({showTrigger: false, visible: false});
    fireEvent.press(screen.getByTestId('ledger-settings-row-report'));
    expect(lastProps()).toMatchObject({visible: true});
  });

  it('preserves non-admin restrictions in the concise Manage screen', () => {
    const screen = renderRoute(
      <LedgerSettingsScreen
        ledgerId={ledger.id}
        initialLedger={{...ledger, role: 'MEMBER'}}
      />,
    );

    expect(screen.getByTestId('ledger-settings-row-export')).toBeDisabled();
    expect(screen.getByTestId('ledger-settings-row-deleted')).toBeTruthy();
    for (const key of ['requests', 'audit', 'danger']) {
      expect(screen.queryByTestId(`ledger-settings-row-${key}`)).toBeNull();
    }
  });

  it('owns the active ledger settings while app settings stay in the drawer', () => {
    const openDrawer = jest.fn();
    mockUseOpenLedgerDrawer.mockReturnValue(openDrawer);
    mockUseActiveLedger.mockReturnValue({
      activeLedger: ledger,
      ledgerPaginationStatus: 'Exhausted',
      ledgers: [ledger],
      loadMoreLedgers: jest.fn(),
      setActiveLedgerId: jest.fn(),
    });

    const screen = renderRoute();
    expect(screen.getByTestId('ledger-settings-list')).toBeTruthy();
    expect(screen.getByTestId('ledger-header')).toBeTruthy();
    expect(screen.getAllByText('Storyboard Ledger')).toHaveLength(1);
    expect(screen.getByText(t('settings.currency'))).toBeTruthy();
    expect(screen.getByText(t('settings.members'))).toBeTruthy();
    expect(screen.getByTestId('ledger-settings-row-manage')).toBeTruthy();
    expect(screen.getByTestId('settings-section-advanced')).toHaveStyle({
      marginTop: 24,
    });
    expect(screen.queryByTestId('settings-profile')).toBeNull();
    expect(screen.queryByText(t('settings.theme'))).toBeNull();
    expect(screen.queryByText(t('settings.language'))).toBeNull();
    expect(screen.queryByText(t('release.exportLedger'))).toBeNull();

    fireEvent.press(screen.getByLabelText(t('a11y.openDashboard')));
    expect(openDrawer).toHaveBeenCalledTimes(1);
  });

  it('opens primary ledger destinations from concise rows', () => {
    mockUseOpenLedgerDrawer.mockReturnValue(jest.fn());
    mockUseActiveLedger.mockReturnValue({
      activeLedger: ledger,
      ledgerPaginationStatus: 'Exhausted',
      ledgers: [ledger],
      loadMoreLedgers: jest.fn(),
      setActiveLedgerId: jest.fn(),
    });

    const screen = renderRoute();
    const destinations = [
      {
        label: t('settings.ledgerDetails'),
        path: `/ledger/${ledger.id}/details`,
      },
      {
        label: t('settings.members'),
        path: `/ledger/${ledger.id}/members`,
      },
      {
        label: t('settings.inviteLinks'),
        path: `/ledger/${ledger.id}/invites`,
      },
      {
        label: t('settings.ledgerCategories'),
        path: `/ledger/${ledger.id}/categories`,
      },
      {
        label: t('settings.ledgerPhotos'),
        path: `/ledger/${ledger.id}/photos`,
      },
      {
        label: t('settings.currency'),
        path: `/ledger/${ledger.id}/currency`,
      },
      {
        label: t('settings.timezone'),
        path: `/ledger/${ledger.id}/timezone`,
      },
      {
        label: t('settings.advancedSection'),
        path: `/ledger/${ledger.id}/settings`,
      },
    ] as const;

    for (const destination of destinations) {
      fireEvent.press(screen.getByLabelText(destination.label));
    }

    expect(router.navigate).toHaveBeenCalledTimes(destinations.length);
    destinations.forEach((destination, index) => {
      expect(router.navigate).toHaveBeenNthCalledWith(index + 1, destination.path);
    });
  });
});
