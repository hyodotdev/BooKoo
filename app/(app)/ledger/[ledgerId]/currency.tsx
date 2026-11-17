import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerCurrencyScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerCurrencyRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerCurrencyScreen ledgerId={ledgerId} />;
}
