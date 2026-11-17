import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {CategoryStatsScreen} from '~/features/ledger/screens/categoryStats';

export default function CategoryStatsRoute(): ReactElement {
  const {categoryKey, monthKey} = useLocalSearchParams<{
    categoryKey: string;
    monthKey?: string;
  }>();
  const parsed = Number(monthKey);
  return (
    <CategoryStatsScreen
      key={JSON.stringify([categoryKey, monthKey])}
      categoryKey={categoryKey}
      initialMonthKey={Number.isSafeInteger(parsed) ? parsed : undefined}
    />
  );
}
