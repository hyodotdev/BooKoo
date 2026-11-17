import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerDangerScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerDangerRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerDangerScreen ledgerId={ledgerId} />;
}
