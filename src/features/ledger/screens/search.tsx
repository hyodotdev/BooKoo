import type {ReactElement} from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {EditText} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {BookooSegmentedControl} from '~/components/uis/BookooSegmentedControl';
import {ITEM_PAGE_MORE, ITEM_PAGE_SIZE} from '@shared/ledgerLimits';
import {parseMoneyInput} from '@shared/money';
import {getLocale, t} from '~/utils/i18n';
import {useActiveLedger} from '../useActiveLedger';
import {AppScreen, EntryRow, ScreenSkeleton, ScreenState} from '../ui';
import type {ItemRow} from '../types';

type SearchMode = 'MEMO' | 'AMOUNT';
const searchItemKey = (item: ItemRow): string => item.id;

export function SearchScreen(): ReactElement {
  const router = useRouter();
  const {activeLedger} = useActiveLedger();
  const [mode, setMode] = useState<SearchMode>('MEMO');
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  const parsedAmount = useMemo(
    () =>
      activeLedger === null || activeLedger === undefined
        ? null
        : parseMoneyInput(debounced, activeLedger.baseCurrency, getLocale()),
    [activeLedger, debounced],
  );
  const memoResult = usePaginatedQuery(
    api.items.queries.searchMemo,
    activeLedger === null ||
      activeLedger === undefined ||
      mode !== 'MEMO' ||
      debounced.length < 2
      ? 'skip'
      : {ledgerId: activeLedger.id, term: debounced},
    {initialNumItems: ITEM_PAGE_SIZE},
  );
  const amountResult = usePaginatedQuery(
    api.items.queries.searchAmount,
    activeLedger === null ||
      activeLedger === undefined ||
      mode !== 'AMOUNT' ||
      parsedAmount === null ||
      !parsedAmount.ok ||
      parsedAmount.minor === 0
      ? 'skip'
      : {ledgerId: activeLedger.id, amountMinor: Math.abs(parsedAmount.minor)},
    {initialNumItems: ITEM_PAGE_SIZE, customPagination: true},
  );
  const categories = useQuery(
    api.categories.queries.list,
    activeLedger === null || activeLedger === undefined
      ? 'skip'
      : {ledgerId: activeLedger.id},
  );
  const categoryByKey = useMemo(
    () => new Map(categories?.map((category) => [category.key, category])),
    [categories],
  );
  const result = mode === 'MEMO' ? memoResult : amountResult;
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
      <EntryRow
        category={categoryByKey.get(item.categoryKey)}
        dated
        item={item}
        onPress={openItem}
      />
    ),
    [categoryByKey, openItem],
  );
  const loadMore = useCallback((): void => {
    if (result.status === 'CanLoadMore') result.loadMore(ITEM_PAGE_MORE);
  }, [result]);
  if (activeLedger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (activeLedger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('ledger.empty')} />
      </AppScreen>
    );
  const hint =
    mode === 'MEMO'
      ? t('ledger.searchMemoHint')
      : t('ledger.searchAmountHint');
  const queryReady =
    mode === 'MEMO'
      ? debounced.length >= 2
      : parsedAmount?.ok === true && parsedAmount.minor !== 0;
  return (
    <AppScreen>
      <View style={styles.searchHeader}>
        <BookooSegmentedControl
          onValueChange={(value) => {
            if (value === 'MEMO' || value === 'AMOUNT') setMode(value);
          }}
          selectedValue={mode}
          values={[
            {text: t('common.memo'), value: 'MEMO'},
            {text: t('common.amount'), value: 'AMOUNT'},
          ]}
        />
        <EditText
          accessibilityLabel={hint}
          autoCapitalize="none"
          decoration="boxed"
          hideCounter
          onChangeText={setInput}
          placeholder={hint}
          value={input}
        />
      </View>
      {/* The header already says Search; before a query the field's hint is
          the only prompt, not a third copy of the same word. */}
      {!queryReady ? null : result.status === 'LoadingFirstPage' ? (
        <ScreenSkeleton rows={5} />
      ) : (
        <FlashList
          data={result.results}
          keyExtractor={searchItemKey}
          ListEmptyComponent={
            <ScreenState
              icon="MagnifyingGlass"
              title={t('ledger.noSearchResult')}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.55}
          renderItem={renderItem}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  searchHeader: {gap: 12, padding: 16},
});
