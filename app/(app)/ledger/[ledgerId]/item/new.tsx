import type {ReactElement} from 'react';
import {Stack, useLocalSearchParams} from 'expo-router';

import {LedgerItemCreateRouteGuard} from '~/features/ledger/screens/ledgerItemCreateRoute';

export default function LedgerItemCreateRoute(): ReactElement {
  const {dayKey, fromInvite, ledgerId} = useLocalSearchParams<{
    dayKey?: string;
    fromInvite?: string;
    ledgerId: string;
  }>();
  const parsedDayKey = Number(dayKey);
  return (
    <>
      {fromInvite === '1' ? (
        <Stack.Screen options={{gestureEnabled: false}} />
      ) : null}
      <LedgerItemCreateRouteGuard
        dayKey={Number.isSafeInteger(parsedDayKey) ? parsedDayKey : undefined}
        fromInvite={fromInvite === '1'}
        ledgerId={ledgerId}
      />
    </>
  );
}
