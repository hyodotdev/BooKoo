import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {useQuery} from 'convex-helpers/react/cache';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {useSession} from '~/features/auth/session';
import {canEditEntry} from '../permissions';
import {AppScreen, ScreenSkeleton} from '../ui';
import {LedgerItemFormScreen} from './entryEditor';

export function LedgerItemEditRouteGuard({
  itemId,
  ledgerId: routeLedgerId,
}: {
  readonly itemId: string;
  readonly ledgerId?: string;
}): ReactElement {
  const router = useRouter();
  const {user} = useSession();
  const item = useQuery(api.items.queries.getMineByRoute, {itemId});
  const routeLedgerMismatch =
    item !== undefined &&
    item !== null &&
    routeLedgerId !== undefined &&
    String(item.ledgerId) !== routeLedgerId;
  const ledger = useQuery(
    api.ledgers.queries.get,
    item === undefined || item === null || routeLedgerMismatch
      ? 'skip'
      : {ledgerId: item.ledgerId},
  );
  const cannotEdit =
    item !== undefined &&
    item !== null &&
    ledger !== undefined &&
    (item.deletedAt !== null || !canEditEntry(ledger, item, user?.userId));
  const unavailableRoute = item === null;

  useEffect(() => {
    if (!routeLedgerMismatch && !unavailableRoute && !cannotEdit) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/timeline');
  }, [cannotEdit, routeLedgerMismatch, router, unavailableRoute]);

  if (
    item === undefined ||
    ledger === undefined ||
    routeLedgerMismatch ||
    unavailableRoute ||
    cannotEdit
  )
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  return <LedgerItemFormScreen item={item} ledger={ledger} />;
}
