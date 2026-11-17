import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {LedgerPhotosScreen} from '~/features/media/screens';

export default function LedgerPhotosRoute(): ReactElement {
  const {ledgerId = ''} = useLocalSearchParams<{ledgerId?: string}>();
  return <LedgerPhotosScreen ledgerId={ledgerId} />;
}
