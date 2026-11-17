import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerAuditScreen} from '~/features/release/ledgerScreens';

export default function AuditRoute(): ReactElement {
  const {ledgerId = ''} = useLocalSearchParams<{ledgerId?: string}>();
  return <LedgerAuditScreen ledgerId={ledgerId} />;
}
