import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {DeletedEntriesScreen} from '~/features/ledger/screens/deletedEntries';

export default function DeletedEntriesRoute(): ReactElement {
  const {ledgerId} = useLocalSearchParams<{ledgerId: string}>();
  return <DeletedEntriesScreen ledgerId={ledgerId} />;
}
