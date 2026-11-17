import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerInvitesScreen} from '~/features/release/ledgerScreens';

export default function InvitesRoute(): ReactElement {
  const {ledgerId = ''} = useLocalSearchParams<{ledgerId?: string}>();
  return <LedgerInvitesScreen ledgerId={ledgerId} />;
}
