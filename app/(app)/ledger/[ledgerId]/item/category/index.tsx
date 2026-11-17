import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {EntryCategoryPickerScreen} from '~/features/ledger/screens/entryCategoryPicker';

export default function LedgerItemCategoryRoute(): ReactElement {
  const {kind, ledgerId, selectedKey} = useLocalSearchParams<{
    kind: 'EXPENSE' | 'INCOME';
    ledgerId: string;
    selectedKey?: string;
  }>();

  return (
    <EntryCategoryPickerScreen
      kind={kind === 'INCOME' ? 'INCOME' : 'EXPENSE'}
      ledgerId={ledgerId}
      selectedKey={selectedKey ?? ''}
    />
  );
}
