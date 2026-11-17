import {useCallback, useEffect, useMemo, useRef} from 'react';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';

import {api} from '@convex/_generated/api';
import {useSession} from '~/features/auth/session';
import {useLedgerStore} from './store';

export function useActiveLedger() {
  const {onboardingStep} = useSession();
  const onboarded = onboardingStep === 'done';
  const {
    loadMore: loadMoreLedgerPage,
    results: liveLedgerResults,
    status: ledgerPaginationStatus,
  } = usePaginatedQuery(
    api.ledgers.queries.listMinePaginated,
    onboarded ? {} : 'skip',
    {initialNumItems: 20},
  );
  const ledgerCountBeforeLoad = useRef<number | null>(null);
  const loadMoreLedgers = useCallback((): void => {
    if (
      ledgerPaginationStatus !== 'CanLoadMore' ||
      ledgerCountBeforeLoad.current !== null
    )
      return;
    ledgerCountBeforeLoad.current = liveLedgerResults.length;
    loadMoreLedgerPage(20);
  }, [ledgerPaginationStatus, liveLedgerResults.length, loadMoreLedgerPage]);
  const sortedLiveLedgers = useMemo(
    () =>
      [...liveLedgerResults].sort((left, right) => {
        if (left.pinnedAt !== null || right.pinnedAt !== null)
          return (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0);
        if (left.sortOrder !== right.sortOrder)
          return left.sortOrder - right.sortOrder;
        return right.updatedAt - left.updatedAt;
      }),
    [liveLedgerResults],
  );
  useEffect(() => {
    if (!onboarded) return;
    if (ledgerPaginationStatus === 'LoadingMore') return;
    if (ledgerPaginationStatus === 'Exhausted') {
      ledgerCountBeforeLoad.current = null;
      return;
    }
    if (ledgerPaginationStatus !== 'CanLoadMore') return;
    const countBeforeLoad = ledgerCountBeforeLoad.current;
    if (countBeforeLoad === null) {
      if (liveLedgerResults.length === 0) loadMoreLedgers();
      return;
    }
    if (liveLedgerResults.length !== countBeforeLoad) {
      ledgerCountBeforeLoad.current = null;
      return;
    }
    // Pagination occurs before deleted/orphaned ledgers are filtered. Advance
    // only across a requested page that added no visible ledger so an invalid
    // middle page cannot hide later memberships from the drawer.
    loadMoreLedgerPage(20);
  }, [
    ledgerPaginationStatus,
    liveLedgerResults.length,
    loadMoreLedgerPage,
    loadMoreLedgers,
    onboarded,
  ]);
  const ledgers = useMemo(() => {
    if (!onboarded) return [];
    if (ledgerPaginationStatus === 'LoadingFirstPage') return undefined;
    return sortedLiveLedgers;
  }, [ledgerPaginationStatus, onboarded, sortedLiveLedgers]);
  const activeLedgerId = useLedgerStore((state) => state.activeLedgerId);
  const activeLedgerFromRoute = useQuery(
    api.ledgers.queries.getMineByRoute,
    !onboarded || activeLedgerId === null ? 'skip' : {ledgerId: activeLedgerId},
  );
  const setActiveLedgerId = useLedgerStore((state) => state.setActiveLedgerId);
  const activeLedger = useMemo(() => {
    // Before onboarding is done there is no visible ledger: the list and route
    // queries are both skipped. A stored id then comes from an earlier session
    // on this device, so waiting for it would never resolve.
    if (!onboarded) return null;
    if (ledgers === undefined) return undefined;
    const pageMatch = ledgers.find((ledger) => ledger.id === activeLedgerId);
    if (pageMatch !== undefined) return pageMatch;
    if (activeLedgerId !== null && activeLedgerFromRoute === undefined)
      return undefined;
    return (
      activeLedgerFromRoute ??
      ledgers.find((ledger) => ledger.archivedAt === null) ??
      ledgers[0] ??
      null
    );
  }, [activeLedgerFromRoute, activeLedgerId, ledgers, onboarded]);

  useEffect(() => {
    if (
      activeLedger !== undefined &&
      (activeLedger?.id ?? null) !== activeLedgerId
    )
      setActiveLedgerId(activeLedger?.id ?? null);
  }, [activeLedger, activeLedgerId, setActiveLedgerId]);

  return {
    activeLedger,
    ledgerPaginationStatus,
    ledgers,
    loadMoreLedgers,
    setActiveLedgerId,
  };
}
