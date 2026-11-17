import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerMembersScreen} from '~/features/ledger/screens/memberManagement';

export default function LedgerMembersRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <LedgerMembersScreen ledgerId={ledgerId} />;
}
