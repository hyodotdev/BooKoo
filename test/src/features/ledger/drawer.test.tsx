import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerDrawerContent} from '../../../../src/features/ledger/drawer';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {useActiveLedger} from '../../../../src/features/ledger/useActiveLedger';
import {theme} from '../../../../src/theme';
import {LEDGER_ACCENTS} from '../../../../src/theme/ledgerAccent';
import {
  CIRCULAR_ICON_TARGET,
  EXACT_HIT_SLOP,
} from '../../../../src/theme/layout';
import {setActiveLocale, t} from '../../../../src/utils/i18n';

jest.mock('../../../../src/features/ledger/useActiveLedger', () => ({
  useActiveLedger: jest.fn(),
}));
jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    user: {avatar: null, displayName: 'BooKoo QA', handle: 'user26'},
  }),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    FlashList: ({
      data,
      contentContainerStyle,
      ItemSeparatorComponent,
      ListFooterComponent,
      renderItem,
      testID,
    }: {
      data: readonly {id: string}[];
      contentContainerStyle?: import('react-native').ViewStyle;
      ItemSeparatorComponent?: import('react').ComponentType;
      ListFooterComponent?: import('react').ReactNode;
      renderItem: (info: {item: {id: string}}) => import('react').ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        View,
        {style: contentContainerStyle, testID},
        data.map((item, index) =>
          React.createElement(
            View,
            {key: item.id},
            renderItem({item}),
            index < data.length - 1 && ItemSeparatorComponent
              ? React.createElement(ItemSeparatorComponent)
              : null,
          ),
        ),
        ListFooterComponent,
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
  memberCount: 1,
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

describe('ledger drawer content', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('uses each full ledger row for selection and keeps settings global', () => {
    const onClose = jest.fn();
    const loadMoreLedgers = jest.fn();
    const setActiveLedgerId = jest.fn();
    mockUseActiveLedger.mockReturnValue({
      activeLedger: ledger,
      ledgerPaginationStatus: 'CanLoadMore',
      ledgers: [ledger],
      loadMoreLedgers,
      setActiveLedgerId,
    });
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
          <LedgerDrawerContent onClose={onClose} />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('My ledgers')).toBeTruthy();
    expect(screen.getByText('BooKoo QA')).toBeTruthy();

    expect(screen.getByTestId(`ledger-row-${ledger.title}-select`)).toHaveStyle(
      {
        alignSelf: 'stretch',
        backgroundColor: LEDGER_ACCENTS.TEAL.light.subtle,
        minHeight: 80,
        paddingHorizontal: 24,
        width: '100%',
      },
    );
    expect(
      screen.getByTestId(`ledger-row-${ledger.title}-select`).props.hitSlop,
    ).toEqual(EXACT_HIT_SLOP);
    expect(screen.queryByTestId(`ledger-row-${ledger.id}-more`)).toBeNull();
    expect(screen.queryByText(t('common.more'))).toBeNull();
    expect(screen.getByTestId('ledger-drawer-list')).toHaveStyle({
      paddingHorizontal: 0,
    });
    fireEvent(screen.getByTestId('ledger-drawer-list'), 'onEndReached');
    expect(loadMoreLedgers).toHaveBeenCalledWith();

    fireEvent.press(screen.getByLabelText('Storyboard Ledger, 1 member'));
    expect(setActiveLedgerId).toHaveBeenCalledWith(ledger.id);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('ledger-drawer-close')).toHaveStyle(
      CIRCULAR_ICON_TARGET,
    );
    expect(screen.getByTestId('ledger-drawer-settings')).toHaveStyle(
      CIRCULAR_ICON_TARGET,
    );

    fireEvent.press(screen.getByTestId('ledger-drawer-close'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.press(screen.getByTestId('ledger-drawer-profile'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(router.navigate).toHaveBeenCalledWith('/profile/me');

    fireEvent.press(screen.getByTestId('ledger-drawer-settings'));
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(router.navigate).toHaveBeenCalledWith('/settings');

    fireEvent.press(screen.getByTestId('ledger-drawer-add'));
    expect(onClose).toHaveBeenCalledTimes(5);
    expect(router.navigate).toHaveBeenCalledWith('/ledgers/new');
    expect(screen.getAllByLabelText('Add ledger')).toHaveLength(1);
  });

  it('keeps one bounded add button when the ledger list is empty', () => {
    mockUseActiveLedger.mockReturnValue({
      activeLedger: undefined,
      ledgerPaginationStatus: 'Exhausted',
      ledgers: [],
      loadMoreLedgers: jest.fn(),
      setActiveLedgerId: jest.fn(),
    });
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
          <LedgerDrawerContent onClose={jest.fn()} />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getAllByLabelText('Add ledger')).toHaveLength(1);
    expect(screen.queryByText(t('ledger.empty'))).toBeNull();
    expect(screen.getByTestId('ledger-drawer-add-mark')).toHaveStyle({
      backgroundColor: theme.light.bg.highlight,
      height: 44,
      width: 44,
    });
    expect(screen.getByTestId('ledger-drawer-add')).not.toHaveStyle({
      backgroundColor: theme.light.bg.highlight,
    });
    expect(screen.getByTestId('ledger-drawer-add')).toHaveStyle({
      minHeight: 56,
      marginHorizontal: 24,
      borderRadius: 16,
    });
  });
});
