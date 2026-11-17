import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {JoinRequestsScreen} from '~/features/release/ledgerScreens';

export default function RequestsRoute(): ReactElement {
  const {ledgerId = ''} = useLocalSearchParams<{ledgerId?: string}>();
  return <JoinRequestsScreen ledgerId={ledgerId} />;
}
