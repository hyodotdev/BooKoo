import 'react-native';

import type {ReactElement, ReactNode} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {useMutation, usePaginatedQuery, useQuery} from 'convex/react';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerInvitesScreen} from '../../../../src/features/release/ledgerScreens';
import {theme} from '../../../../src/theme';

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: null}),
}));

jest.mock('convex/react', () => ({
  useMutation: jest.fn(),
  usePaginatedQuery: jest.fn(),
  useQuery: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      ListEmptyComponent,
      ListHeaderComponent,
      data,
      onEndReached,
    }: {
      readonly ListEmptyComponent?: ReactNode;
      readonly ListHeaderComponent?: ReactNode;
      readonly data: readonly unknown[];
      readonly onEndReached?: () => void;
    }) =>
      React.createElement(
        View,
        {onTouchEnd: onEndReached, testID: 'invite-list'},
        ListHeaderComponent,
        data.length === 0 ? ListEmptyComponent : null,
      ),
  };
});

const invite = {
  createdAt: 1,
  expiresAt: null,
  id: 'invite-1',
  maxUses: null,
  note: null,
  role: 'MEMBER' as const,
  useCount: 0,
};

function wrap(screen: ReactElement): ReactElement {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: {height: 844, width: 390, x: 0, y: 0},
        insets: {bottom: 0, left: 0, right: 0, top: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        {screen}
      </CpkProvider>
    </SafeAreaProvider>
  );
}

describe('ledger invite pagination', () => {
  it('advances past a filtered empty page without bulk-loading visible pages', () => {
    const loadMore = jest.fn();
    let page: {
      isLoading: boolean;
      loadMore: typeof loadMore;
      results: (typeof invite)[];
      status: 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
    } = {
      isLoading: false,
      loadMore,
      results: [invite],
      status: 'CanLoadMore' as const,
    };
    jest.mocked(useQuery).mockReturnValue({
      id: 'ledger-1',
      role: 'OWNER',
    } as never);
    jest
      .mocked(useMutation)
      .mockReturnValue(
        Object.assign(jest.fn(), {withOptimisticUpdate: jest.fn()}) as never,
      );
    jest.mocked(usePaginatedQuery).mockImplementation(() => page as never);

    const view = render(wrap(<LedgerInvitesScreen ledgerId="ledger-1" />));

    fireEvent(view.getByTestId('invite-list'), 'touchEnd');
    expect(loadMore).toHaveBeenCalledTimes(1);

    page = {...page, status: 'LoadingMore' as const};
    view.rerender(wrap(<LedgerInvitesScreen ledgerId="ledger-1" />));
    page = {...page, status: 'CanLoadMore' as const};
    view.rerender(wrap(<LedgerInvitesScreen ledgerId="ledger-1" />));

    expect(loadMore).toHaveBeenCalledTimes(2);

    page = {...page, results: [invite, {...invite, id: 'invite-2'}]};
    view.rerender(wrap(<LedgerInvitesScreen ledgerId="ledger-1" />));

    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it('keeps the ledger title whole at the largest text size', () => {
    // Uncapped, the hero split the title inside words ("Weeken / d Clim...").
    jest.mocked(useQuery).mockReturnValue({
      id: 'ledger-1',
      role: 'OWNER',
      title: 'Household',
    } as never);
    jest
      .mocked(useMutation)
      .mockReturnValue(
        Object.assign(jest.fn(), {withOptimisticUpdate: jest.fn()}) as never,
      );
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [],
      status: 'Exhausted',
    } as never);

    const view = render(wrap(<LedgerInvitesScreen ledgerId="ledger-1" />));

    expect(view.getByText('Household')).toHaveProp(
      'maxFontSizeMultiplier',
      1.35,
    );
  });
});
