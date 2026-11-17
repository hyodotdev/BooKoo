import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerItemEditRouteGuard} from '~/features/ledger/screens/ledgerItemEditRoute';

export default function EditEntryRoute(): ReactElement {
  const {itemId} = useLocalSearchParams<{itemId: string}>();
  return <LedgerItemEditRouteGuard itemId={itemId} />;
}
