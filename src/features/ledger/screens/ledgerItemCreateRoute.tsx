import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {useQuery} from 'convex-helpers/react/cache';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {AppScreen, ScreenSkeleton} from '../ui';
import {LedgerItemFormScreen} from './entryEditor';

export function LedgerItemCreateRouteGuard({
  dayKey,
  fromInvite,
  ledgerId,
}: {
  readonly dayKey?: number;
  readonly fromInvite?: boolean;
  readonly ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});

  useEffect(() => {
    if (ledger !== null) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/timeline');
  }, [ledger, router]);

  if (ledger === undefined || ledger === null)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );

  return (
    <LedgerItemFormScreen
      dayKey={dayKey}
      fromInvite={fromInvite}
      ledger={ledger}
    />
  );
}
