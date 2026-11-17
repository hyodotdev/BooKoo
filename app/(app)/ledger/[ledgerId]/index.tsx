import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerRouteGuard} from '~/features/ledger/screens/ledgerRouteGuard';

export default function LedgerRoute(): ReactElement {
  const {ledgerId = '', joined} = useLocalSearchParams<{
    ledgerId?: string;
    joined?: string;
  }>();
  return (
    <LedgerRouteGuard ledgerId={ledgerId} showJoinedAction={joined === '1'} />
  );
}
