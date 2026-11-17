import 'react-native';

import type {ReactNode} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {usePaginatedQuery, useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import type {LedgerRow, ItemRow} from '../../../../src/features/ledger/types';
import {SearchScreen} from '../../../../src/features/ledger/screens/search';
import {useActiveLedger} from '../../../../src/features/ledger/useActiveLedger';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('../../../../src/features/ledger/useActiveLedger', () => ({
  useActiveLedger: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {Pressable, View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      onEndReached,
      renderItem,
    }: {
      data: readonly ItemRow[];
      onEndReached: () => void;
      renderItem: (info: {item: ItemRow}) => ReactNode;
    }) =>
      React.createElement(
        Pressable,
        {onPress: onEndReached, testID: 'search-results'},
        data.map((item) =>
          React.createElement(View, {key: item.id}, renderItem({item})),
        ),
      ),
  };
});

const ledger = {
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  id: 'ledger-search',
  role: 'OWNER',
  timeZone: 'Asia/Seoul',
  title: '민지의 생활비',
} as LedgerRow;

const item = {
  amountMinor: -6800,
  authorId: 'user-minji',
  baseAmountMinor: -6800,
  baseCurrency: 'KRW',
  categoryKey: 'cafe',
  commentCount: 0,
  coverPhotoId: null,
  createdAt: 1,
  currency: 'KRW',
  dayKey: 20260830,
  deletedAt: null,
  id: 'item-search',
  ledgerId: 'ledger-search',
  memo: '퇴근 후 카페',
  monthKey: 202608,
  needsReview: false,
  occurredAt: 1,
  occurredOffsetMinutes: 540,
  paidByUserId: null,
  photoCount: 0,
  place: null,
  type: 'EXPENSE',
  updatedAt: 1,
  updatedByUserId: null,
} as ItemRow;

describe('ledger search', () => {
  const loadMore = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useActiveLedger).mockReturnValue({
      activeLedger: ledger,
      ledgerPaginationStatus: 'Exhausted',
      ledgers: [ledger],
      loadMoreLedgers: jest.fn(),
      setActiveLedgerId: jest.fn(),
    });
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore,
      results: [item],
      status: 'CanLoadMore',
    });
    jest.mocked(useQuery).mockReturnValue([
      {
        archived: false,
        colorToken: 'brown',
        hidden: false,
        iconKey: 'Coffee',
        i18nKey: null,
        key: 'cafe',
        kind: 'EXPENSE',
        label: 'Cafe',
        reassigning: false,
        sortOrder: 0,
        source: 'PRESET',
      },
    ]);
  });
  it('prompts once with a hint for the selected search mode', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <SearchScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    // The header, placeholder and idle state all used to read "Please search...".
    expect(
      screen.getByPlaceholderText('At least two letters of a memo'),
    ).toBeTruthy();
    expect(screen.queryByText('Search')).toBeNull();
    fireEvent.press(screen.getByText('Amount'));
    expect(screen.getByPlaceholderText('Exact amount')).toBeTruthy();
  });

  it('keeps loading indexed search pages instead of truncating at 30 rows', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <SearchScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('At least two letters of a memo'),
      'cafe',
    );
    await waitFor(() =>
      expect(screen.getByTestId('search-results')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('search-results'));
    expect(loadMore).toHaveBeenCalledWith(50);

    fireEvent.press(screen.getByText(/ · 퇴근 후 카페$/));
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/ledger/[ledgerId]/item/[itemId]',
      params: {itemId: item.id, ledgerId: item.ledgerId},
    });
  });
});
