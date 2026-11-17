import type {ReactElement} from 'react';
import {useCallback, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {LineChart, Typography, useCPK} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {ITEM_PAGE_MORE, ITEM_PAGE_SIZE} from '@shared/ledgerLimits';
import type {CategoryKind} from '@shared/categories';
import {addMonthsToMonthKey, monthDayKeyBounds, toMonthKey} from '@shared/date';
import {formatAmount, t} from '~/utils/i18n';
import {CATEGORY_COLORS, type CategoryColorToken} from '~/theme/chartPalette';
import {monthLabel} from '../calendar';
import {categoryDisplayName} from '../categories';
import {useActiveLedger} from '../useActiveLedger';
import {
  AppScreen,
  EntryRow,
  ListFooter,
  ScreenSkeleton,
  ScreenState,
} from '../ui';
import type {ItemRow} from '../types';

const itemKeyExtractor = (item: ItemRow): string => item.id;

export function categoryTrendMagnitude(
  row: {readonly expenseMinor: number; readonly incomeMinor: number},
  kind?: CategoryKind,
): number {
  if (kind === 'EXPENSE') return Math.abs(row.expenseMinor);
  if (kind === 'INCOME') return Math.abs(row.incomeMinor);
  return Math.max(Math.abs(row.expenseMinor), Math.abs(row.incomeMinor));
}

export function CategoryStatsScreen({
  categoryKey,
  initialMonthKey,
}: {
  categoryKey: string;
  initialMonthKey?: number;
}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const {activeLedger} = useActiveLedger();
  const [now] = useState(Date.now);
  const [selection, setSelection] = useState({
    ledgerId: '',
    monthKey: initialMonthKey ?? toMonthKey(now, 'UTC'),
  });
  const monthKey =
    selection.ledgerId === activeLedger?.id
      ? selection.monthKey
      : (initialMonthKey ?? toMonthKey(now, activeLedger?.timeZone ?? 'UTC'));
  const setMonthKey = useCallback(
    (nextMonthKey: number) =>
      setSelection({
        ledgerId: activeLedger?.id ?? '',
        monthKey: nextMonthKey,
      }),
    [activeLedger?.id],
  );
  const fromMonth = addMonthsToMonthKey(monthKey, -11);
  const trend = useQuery(
    api.rollups.queries.categoryTrend,
    activeLedger === undefined || activeLedger === null
      ? 'skip'
      : {
          ledgerId: activeLedger.id,
          categoryKey,
          fromMonth,
          toMonth: monthKey,
        },
  );
  const category = useQuery(
    api.categories.queries.list,
    activeLedger === undefined || activeLedger === null
      ? 'skip'
      : {ledgerId: activeLedger.id},
  )?.find((row) => row.key === categoryKey);
  const bounds = useMemo(() => monthDayKeyBounds(monthKey), [monthKey]);
  const items = usePaginatedQuery(
    api.items.queries.listByCategory,
    activeLedger === undefined || activeLedger === null
      ? 'skip'
      : {
          ledgerId: activeLedger.id,
          categoryKey,
          fromDayKey: bounds.first,
          toDayKey: bounds.last,
        },
    {initialNumItems: ITEM_PAGE_SIZE},
  );
  const {loadMore: loadMoreItems, status: itemsStatus} = items;
  const openItem = useCallback(
    (row: ItemRow): void => {
      router.navigate({
        pathname: '/ledger/[ledgerId]/item/[itemId]',
        params: {itemId: row.id, ledgerId: row.ledgerId},
      });
    },
    [router],
  );
  const renderItem = useCallback(
    ({item}: {item: ItemRow}) => (
      <EntryRow category={category} dated item={item} onPress={openItem} />
    ),
    [category, openItem],
  );
  const loadMore = useCallback((): void => {
    if (itemsStatus === 'CanLoadMore') loadMoreItems(ITEM_PAGE_MORE);
  }, [itemsStatus, loadMoreItems]);
  if (activeLedger === undefined || trend === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={7} />
      </AppScreen>
    );
  if (activeLedger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('ledger.empty')} />
      </AppScreen>
    );
  const categoryName =
    category === undefined ? categoryKey : categoryDisplayName(category);
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const categoryColor =
    category !== undefined && category.colorToken in CATEGORY_COLORS
      ? CATEGORY_COLORS[category.colorToken as CategoryColorToken][mode]
      : theme.role.success;
  const chartData = trend.map((row) => {
    const value = categoryTrendMagnitude(row, category?.kind);
    return {
      key: String(row.monthKey),
      label: String(row.monthKey % 100),
      value,
      accessibilityLabel: `${monthLabel(row.monthKey)} ${formatAmount({amountMinor: value, currency: activeLedger.baseCurrency})}`,
    };
  });
  const trendHeader = (
    <View style={styles.trend}>
      <Typography.Heading3 $fontWeight="bold">
        {categoryName}
      </Typography.Heading3>
      <LineChart
        accessibilityLabel={`${categoryName} ${t('tabs.graph')}`}
        data={chartData}
        formatValue={(value) =>
          formatAmount({
            amountMinor: value,
            currency: activeLedger.baseCurrency,
          })
        }
        onSelect={(datum) => setMonthKey(Number(datum.key))}
        palette={{
          grid: theme.role.divider,
          line: categoryColor,
          point: theme.bg.basic,
          selectedPoint: categoryColor,
          tooltipBackground: categoryColor,
          tooltipText: theme.text.contrast,
        }}
        selectedKey={String(monthKey)}
      />
      <Typography.Heading4 $fontWeight="bold" style={styles.monthHeading}>
        {monthLabel(monthKey)}
      </Typography.Heading4>
    </View>
  );
  return (
    <AppScreen>
      <FlashList
        data={items.status === 'LoadingFirstPage' ? [] : items.results}
        keyExtractor={itemKeyExtractor}
        ListHeaderComponent={trendHeader}
        ListEmptyComponent={
          items.status === 'LoadingFirstPage' ? (
            <ScreenSkeleton rows={5} />
          ) : (
            <ScreenState compact icon="ChartLine" title={t('screen.noStats')} />
          )
        }
        ListFooterComponent={
          <ListFooter
            exhausted={items.status === 'Exhausted'}
            loading={items.status === 'LoadingMore'}
          />
        }
        onEndReached={loadMore}
        renderItem={renderItem}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  monthHeading: {paddingTop: 4},
  trend: {gap: 12, paddingHorizontal: 20, paddingVertical: 18},
});
