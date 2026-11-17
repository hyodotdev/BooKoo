import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {EntryCategoryCreateScreen} from '~/features/ledger/screens/entryCategoryPicker';

export default function EntryCategoryNewRoute(): ReactElement {
  // A link can arrive without its ledger: query by '' (resolves to "not
  // found") instead of letting Convex reject a missing argument mid-render.
  const {kind, ledgerId} = useLocalSearchParams<{
    kind: 'EXPENSE' | 'INCOME';
    ledgerId?: string;
  }>();
  return (
    <EntryCategoryCreateScreen
      kind={kind === 'INCOME' ? 'INCOME' : 'EXPENSE'}
      ledgerId={ledgerId ?? ''}
    />
  );
}
