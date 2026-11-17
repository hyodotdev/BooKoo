import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerItemEditRouteGuard} from '~/features/ledger/screens/ledgerItemEditRoute';

export default function LedgerItemEditRoute(): ReactElement {
  const {itemId, ledgerId} = useLocalSearchParams<{
    itemId: string;
    ledgerId: string;
  }>();
  return <LedgerItemEditRouteGuard itemId={itemId} ledgerId={ledgerId} />;
}
