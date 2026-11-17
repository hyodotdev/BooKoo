import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerDetailsScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerDetailsRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerDetailsScreen ledgerId={ledgerId} />;
}
