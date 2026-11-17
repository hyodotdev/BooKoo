import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerItemDetailScreen} from '~/features/ledger/screens/entryDetail';

export default function EntryDetailRoute(): ReactElement {
  const {itemId} = useLocalSearchParams<{itemId: string}>();
  return <LedgerItemDetailScreen itemId={itemId} />;
}
