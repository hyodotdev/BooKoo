import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {EntryLocationPickerScreen} from '~/features/ledger/screens/entryLocationPicker';

export default function LedgerItemLocationRoute(): ReactElement {
  const {address, label, lat, ledgerId, lng} = useLocalSearchParams<{
    address?: string;
    label?: string;
    lat?: string;
    ledgerId: string;
    lng?: string;
  }>();

  return (
    <EntryLocationPickerScreen
      address={address ?? ''}
      label={label ?? ''}
      lat={lat ?? ''}
      ledgerId={ledgerId}
      lng={lng ?? ''}
    />
  );
}
