import {act, renderHook} from '@testing-library/react-native';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';

import {useSession} from '../../../../src/features/auth/session';
import {useLedgerStore} from '../../../../src/features/ledger/store';
import {useActiveLedger} from '../../../../src/features/ledger/useActiveLedger';

jest.mock('convex-helpers/react/cache', () => ({
  usePaginatedQuery: jest.fn(),
  useQuery: jest.fn(),
}));
jest.mock('../../../../src/features/auth/session', () => ({
  useSession: jest.fn(),
}));
jest.mock('../../../../src/features/ledger/store', () => ({
  useLedgerStore: jest.fn(),
}));

const ledger = {
  archivedAt: null,
  id: 'ledger-1',
  pinnedAt: null,
  sortOrder: 0,
  updatedAt: 1,
};

describe('active ledger pagination', () => {
  it('advances past a filtered middle page and stops at a visible row', () => {
    const loadMorePage = jest.fn();
    const setActiveLedgerId = jest.fn();
    let page = {
      loadMore: loadMorePage,
      results: [ledger],
      status: 'CanLoadMore' as 'CanLoadMore' | 'LoadingMore' | 'Exhausted',
    };
    jest.mocked(useSession).mockReturnValue({
      onboardingStep: 'done',
    } as never);
    jest.mocked(usePaginatedQuery).mockImplementation(() => page as never);
    jest.mocked(useQuery).mockReturnValue(undefined);
    jest
      .mocked(useLedgerStore)
      .mockImplementation((selector) =>
        selector({activeLedgerId: null, setActiveLedgerId}),
      );

    const view = renderHook(() => useActiveLedger());

    act(() => view.result.current.loadMoreLedgers());
    expect(loadMorePage).toHaveBeenCalledTimes(1);

    page = {...page, status: 'LoadingMore'};
    view.rerender(undefined);
    page = {...page, status: 'CanLoadMore'};
    view.rerender(undefined);
    expect(loadMorePage).toHaveBeenCalledTimes(2);

    page = {
      ...page,
      results: [ledger, {...ledger, id: 'ledger-2', updatedAt: 2}],
    };
    view.rerender(undefined);
    expect(loadMorePage).toHaveBeenCalledTimes(2);
  });

  it('skips ledger pagination until onboarding is done', () => {
    jest.mocked(useSession).mockReturnValue({
      onboardingStep: 'handle',
    } as never);
    jest.mocked(usePaginatedQuery).mockReturnValue({
      loadMore: jest.fn(),
      results: [],
      status: 'LoadingFirstPage',
    } as never);
    jest.mocked(useQuery).mockReturnValue(undefined);
    jest
      .mocked(useLedgerStore)
      .mockImplementation((selector) =>
        selector({activeLedgerId: null, setActiveLedgerId: jest.fn()}),
      );

    const view = renderHook(() => useActiveLedger());
    expect(usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      'skip',
      expect.anything(),
    );
    expect(view.result.current.ledgers).toEqual([]);
    expect(view.result.current.activeLedger).toBeNull();
  });

  it('never waits on a stored ledger id while the ledger step is pending', () => {
    // Reproduces the stuck tablet launch: an account still on the ledger step,
    // on a device that kept another session's active ledger id. The route
    // query is skipped, so waiting on it left the tab shell loading forever.
    const setActiveLedgerId = jest.fn();
    jest.mocked(useSession).mockReturnValue({
      onboardingStep: 'ledger',
    } as never);
    jest.mocked(usePaginatedQuery).mockReturnValue({
      loadMore: jest.fn(),
      results: [],
      status: 'LoadingFirstPage',
    } as never);
    jest.mocked(useQuery).mockReturnValue(undefined);
    jest
      .mocked(useLedgerStore)
      .mockImplementation((selector) =>
        selector({activeLedgerId: 'stale-ledger', setActiveLedgerId}),
      );

    const view = renderHook(() => useActiveLedger());

    expect(useQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
    expect(view.result.current.activeLedger).toBeNull();
    expect(setActiveLedgerId).toHaveBeenCalledWith(null);
  });
});
