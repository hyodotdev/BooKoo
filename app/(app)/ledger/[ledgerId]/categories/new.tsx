import {useLocalSearchParams} from 'expo-router';
import {CategoryEditorScreen} from '~/features/ledger/screens/categoryEditor';

export default function CategoryCreateRoute() {
  const {ledgerId, kind} = useLocalSearchParams<{
    ledgerId: string;
    kind?: string;
  }>();
  return (
    <CategoryEditorScreen
      kind={kind === 'INCOME' ? 'INCOME' : 'EXPENSE'}
      ledgerId={ledgerId}
    />
  );
}
