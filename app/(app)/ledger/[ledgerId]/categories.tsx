import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerCategoriesScreen} from '~/features/ledger/screens/ledgerAdmin';

export default function LedgerCategoriesRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerCategoriesScreen ledgerId={ledgerId} />;
}
