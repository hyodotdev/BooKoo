import {useLocalSearchParams} from 'expo-router';
import {CategoryEditorScreen} from '~/features/ledger/screens/categoryEditor';

export default function CategoryEditRoute() {
  const {ledgerId, categoryKey} = useLocalSearchParams<{
    ledgerId: string;
    categoryKey: string;
  }>();
  return <CategoryEditorScreen categoryKey={categoryKey} ledgerId={ledgerId} />;
}
