import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerItemDetailScreen} from '~/features/ledger/screens/entryDetail';

export default function LedgerItemDetailRoute(): ReactElement {
  const {itemId, ledgerId} = useLocalSearchParams<{
    itemId: string;
    ledgerId: string;
  }>();
  return <LedgerItemDetailScreen itemId={itemId} ledgerId={ledgerId} />;
}
