import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerTimezoneScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerTimezoneRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerTimezoneScreen ledgerId={ledgerId} />;
}
