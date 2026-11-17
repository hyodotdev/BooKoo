import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerSettingsScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerSettingsRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerSettingsScreen ledgerId={ledgerId} />;
}
