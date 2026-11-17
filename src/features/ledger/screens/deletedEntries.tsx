import type {ReactElement} from 'react';
import {useCallback, useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {Typography, useCPK} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {ITEM_PAGE_MORE, ITEM_PAGE_SIZE} from '@shared/ledgerLimits';
import {t} from '~/utils/i18n';
import {
  AppScreen,
  EntryRow,
  ListFooter,
  ScreenSkeleton,
  ScreenState,
} from '../ui';
import type {ItemRow} from '../types';

const itemKeyExtractor = (item: ItemRow): string => item.id;

export function DeletedEntriesScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const items = usePaginatedQuery(
    api.items.queries.listDeleted,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    {initialNumItems: ITEM_PAGE_SIZE},
  );
  const {loadMore: loadMoreItems, status: itemsStatus} = items;
  const categories = useQuery(
    api.categories.queries.list,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
  );
  const categoryByKey = useMemo(
    () => new Map(categories?.map((category) => [category.key, category])),
    [categories],
  );
  const openItem = useCallback(
    (item: ItemRow) =>
      router.navigate({
        pathname: '/ledger/[ledgerId]/item/[itemId]',
        params: {itemId: item.id, ledgerId: item.ledgerId},
      }),
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
    if (itemsStatus === 'CanLoadMore') loadMoreItems(ITEM_PAGE_MORE);
  }, [itemsStatus, loadMoreItems]);

  if (
    ledger === undefined ||
    categories === undefined ||
    items.status === 'LoadingFirstPage'
  )
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );

  return (
    <AppScreen>
      <FlashList
        data={items.results}
        keyExtractor={itemKeyExtractor}
        ListEmptyComponent={
          <ScreenState icon="Trash" title={t('screen.noDeletedEntries')} />
        }
        ListFooterComponent={
          items.results.length === 0 ? null : (
            <ListFooter
              exhausted={items.status === 'Exhausted'}
              loading={items.status === 'LoadingMore'}
            />
          )
        }
        ListHeaderComponent={
          <View
            style={[styles.header, {borderBottomColor: theme.role.divider}]}
          >
            <Typography.Heading4 $fontWeight="bold">
              {ledger.title}
            </Typography.Heading4>
            <Typography.Body3 style={{color: theme.text.label}}>
              {t('screen.deletedEntriesHint')}
            </Typography.Body3>
          </View>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        renderItem={renderItem}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
});
