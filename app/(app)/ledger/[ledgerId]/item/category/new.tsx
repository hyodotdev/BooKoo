import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {EntryCategoryCreateScreen} from '~/features/ledger/screens/entryCategoryPicker';

export default function LedgerItemCategoryNewRoute(): ReactElement {
  const {kind, ledgerId} = useLocalSearchParams<{
    kind: 'EXPENSE' | 'INCOME';
    ledgerId: string;
  }>();

  return (
    <EntryCategoryCreateScreen
      kind={kind === 'INCOME' ? 'INCOME' : 'EXPENSE'}
      ledgerId={ledgerId}
    />
  );
}
