import type {ReactElement} from 'react';
import {memo, useCallback, useMemo, useState} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {Icon, IconButton, Typography, useCPK} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {BookooButton} from '~/components/uis/BookooButton';
import {useLocale} from '~/hooks/useLocale';
import {EntryInvitation} from '../EntryInvitation';
import {useTabletLayout} from '~/hooks/useTabletLayout';

import {BookooSegmentedControl} from '~/components/uis/BookooSegmentedControl';
import {
  ITEM_PAGE_MORE,
  ITEM_PAGE_SIZE,
  MAX_LIVE_ITEM_PAGES,
  MAX_TIMELINE_DAY_KEYS,
} from '@shared/ledgerLimits';
import {
  addMonthsToMonthKey,
  dayKeyToLocalNoon,
  monthDayKeyBounds,
  toMonthKey,
} from '@shared/date';
import {formatAmount, formatDate, t} from '~/utils/i18n';
import {
  LEDGER_ACCENTS,
  brandLedgerSurface,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {useOpenLedgerDrawer} from '../drawer';
import {monthLabel} from '../calendar';
import {LedgerItemDetailScreen} from './entryDetail';
import {useActiveLedger} from '../useActiveLedger';
import {
  AppScreen,
  EntryRow,
  LedgerHeader,
  ListFooter,
  NoLedgerEmptyCanvas,
  ScreenSkeleton,
  ScreenState,
  ScreenScrollFrame,
  TabletSplit,
  statusBarStyleForTheme,
} from '../ui';
import type {ItemRow} from '../types';

type ItemFilter = 'ALL' | 'EXPENSE' | 'INCOME';
export type TimelineListRow =
  | {readonly kind: 'DAY'; readonly dayKey: number}
  | {readonly kind: 'ITEM'; readonly item: ItemRow};
const TIMELINE_LIST_POSITION = {autoscrollToTopThreshold: 80} as const;
export const TIMELINE_STICKY_HEADER_CONFIG = {hideRelatedCell: true} as const;

export const timelineDayKeys = (items: readonly ItemRow[]): number[] =>
  [...new Set(items.map((item) => item.dayKey))]
    // Reactive pagination can temporarily grow beyond the requested window.
    // Keep entries visible; never fabricate totals outside this bounded sidecar.
    .slice(0, MAX_TIMELINE_DAY_KEYS)
    .sort((left, right) => left - right);

export const groupTimelineRows = (
  items: readonly ItemRow[],
): {
  readonly rows: TimelineListRow[];
  readonly stickyHeaderIndices: number[];
} => {
  const rows: TimelineListRow[] = [];
  const stickyHeaderIndices: number[] = [];
  let currentDayKey: number | undefined;

  for (const item of items) {
    if (item.dayKey !== currentDayKey) {
      currentDayKey = item.dayKey;
      stickyHeaderIndices.push(rows.length);
      rows.push({kind: 'DAY', dayKey: item.dayKey});
    }
    rows.push({kind: 'ITEM', item});
  }

  return {rows, stickyHeaderIndices};
};

export const timelineRowType = (
  row: TimelineListRow,
): TimelineListRow['kind'] => row.kind;

export const timelineRowKey = (row: TimelineListRow): string =>
  row.kind === 'DAY' ? `day:${row.dayKey}` : String(row.item.id);

export const timelineRouteKey = (
  activeLedgerId: ItemRow['ledgerId'] | null | undefined,
): string =>
  activeLedgerId === undefined
    ? 'ledger-loading'
    : activeLedgerId === null
      ? 'ledger-empty'
      : String(activeLedgerId);

/** One quiet invitation to add the first entry, composed from cpk-ui primitives. */
export function TimelineEmptyState({onAdd}: {onAdd: () => void}): ReactElement {
  useLocale();
  const {theme} = useCPK();
  const tablet = useTabletLayout();
  const {width, height} = useWindowDimensions();
  return (
    <View style={styles.emptyContent} testID="timeline-empty">
      {tablet && width > height ? (
        <EntryInvitation actionTestID="timeline-empty-add" onAdd={onAdd} />
      ) : (
        <>
          <Icon color={theme.text.placeholder} name="Receipt" size={32} />
          <Typography.Body2 style={{color: theme.text.label}}>
            {t('ledgerItem.empty')}
          </Typography.Body2>
          <BookooButton
            onPress={onAdd}
            testID="timeline-empty-add"
            text={t('a11y.addEntry')}
          />
        </>
      )}
    </View>
  );
}

export const TimelineDayHeader = memo(function TimelineDayHeader({
  backgroundColor,
  currency,
  dayKey,
  netMinor,
}: {
  readonly backgroundColor: string;
  readonly currency: ItemRow['currency'];
  readonly dayKey: number;
  readonly netMinor?: number;
}): ReactElement {
  useLocale();
  const {theme} = useCPK();
  const headerStyle = useMemo(
    () => [styles.sectionHeader, {backgroundColor}],
    [backgroundColor],
  );
  const dateStyle = useMemo(
    () => [styles.sectionDate, {color: theme.text.placeholder}],
    [theme.text.placeholder],
  );
  const totalStyle = useMemo(
    () => [styles.sectionTotal, {color: theme.text.placeholder}],
    [theme.text.placeholder],
  );
  return (
    <View style={headerStyle} testID={`timeline-day-${dayKey}`}>
      <Typography.Body2 accessibilityRole="header" style={dateStyle}>
        {formatDate(dayKeyToLocalNoon(dayKey), 'PPP')}
      </Typography.Body2>
      {netMinor === undefined ? null : (
        <Typography.Body4
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          numberOfLines={1}
          style={totalStyle}
        >
          {formatAmount({amountMinor: netMinor, currency})}
        </Typography.Body4>
      )}
    </View>
  );
});

export interface TimelineScreenProps {
  readonly header: ReactElement | null;
  readonly list: ReactElement;
  readonly detail: ReactElement | null;
  readonly chrome?: {
    readonly backgroundColor: string;
    readonly statusBarBackgroundColor: string;
    readonly statusBarStyle: 'dark-content' | 'light-content';
  };
}

export function useTimelineScreenProps(isTablet: boolean): TimelineScreenProps {
  useLocale();
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const {activeLedger, ledgers} = useActiveLedger();
  const openDrawer = useOpenLedgerDrawer();
  const activeId = activeLedger?.id;
  const [filter, setFilter] = useState<ItemFilter>('ALL');
  const [monthKey, setMonthKey] = useState<number | null>(null);
  const [loadedPages, setLoadedPages] = useState(1);
  const [selected, setSelected] = useState<ItemRow | null>(null);
  const monthBounds = useMemo(
    () => (monthKey === null ? null : monthDayKeyBounds(monthKey)),
    [monthKey],
  );
  const itemArgs = useMemo(
    () =>
      activeId === undefined
        ? null
        : {
            ledgerId: activeId,
            ...(filter === 'ALL' ? {} : {type: filter}),
            ...(monthBounds === null
              ? {}
              : {
                  fromDayKey: monthBounds.first,
                  toDayKey: monthBounds.last,
                }),
          },
    [activeId, filter, monthBounds],
  );
  const items = usePaginatedQuery(
    api.items.queries.list,
    itemArgs === null ? 'skip' : itemArgs,
    {initialNumItems: ITEM_PAGE_SIZE},
  );
  const {loadMore: loadMoreItems, status: itemsStatus} = items;
  const itemRows = useMemo(
    () => (items.status === 'LoadingFirstPage' ? [] : items.results),
    [items.results, items.status],
  );
  const categories = useQuery(
    api.categories.queries.list,
    activeId === undefined ? 'skip' : {ledgerId: activeId},
  );
  const dayKeys = useMemo(() => timelineDayKeys(itemRows), [itemRows]);
  const rollupArgs =
    activeId === undefined || dayKeys.length === 0
      ? null
      : {ledgerId: activeId, dayKeys};
  const liveDayRollups = useQuery(
    api.rollups.queries.daysByKeys,
    rollupArgs === null ? 'skip' : rollupArgs,
  );
  const dayRollups = liveDayRollups;
  const categoryByKey = useMemo(
    () => new Map(categories?.map((category) => [category.key, category])),
    [categories],
  );
  const dayByKey = useMemo(
    () => new Map(dayRollups?.map((rollup) => [rollup.dayKey, rollup])),
    [dayRollups],
  );
  const timeline = useMemo(() => groupTimelineRows(itemRows), [itemRows]);
  const chooseItem = useCallback(
    (item: ItemRow) => {
      if (isTablet) setSelected(item);
      else
        router.navigate({
          pathname: '/ledger/[ledgerId]/item/[itemId]',
          params: {itemId: item.id, ledgerId: item.ledgerId},
        });
    },
    [isTablet, router],
  );
  const renderItem = useCallback(
    ({item: row}: {item: TimelineListRow}) => {
      if (row.kind === 'DAY') {
        const rollup = dayByKey.get(row.dayKey);
        return (
          <TimelineDayHeader
            backgroundColor={theme.bg.basic}
            currency={activeLedger?.baseCurrency ?? 'KRW'}
            dayKey={row.dayKey}
            netMinor={rollup?.netMinor}
          />
        );
      }

      return (
        <EntryRow
          category={categoryByKey.get(row.item.categoryKey)}
          item={row.item}
          onPress={chooseItem}
        />
      );
    },
    [
      activeLedger?.baseCurrency,
      categoryByKey,
      chooseItem,
      dayByKey,
      theme.bg.basic,
    ],
  );
  const loadMore = useCallback(() => {
    if (itemsStatus !== 'CanLoadMore' || loadedPages >= MAX_LIVE_ITEM_PAGES)
      return;
    loadMoreItems(ITEM_PAGE_MORE);
    setLoadedPages((count) => count + 1);
  }, [itemsStatus, loadMoreItems, loadedPages]);
  const changeFilter = useCallback((value: string | number) => {
    if (value === 'ALL' || value === 'EXPENSE' || value === 'INCOME') {
      setFilter(value);
      setMonthKey(null);
      setLoadedPages(1);
      setSelected(null);
    }
  }, []);
  const changeMonth = useCallback((nextMonthKey: number | null) => {
    setMonthKey(nextMonthKey);
    setLoadedPages(1);
    setSelected(null);
  }, []);
  const jumpToPreviousMonth = useCallback(() => {
    const oldestMonth = itemRows.at(-1)?.monthKey;
    const anchor =
      monthKey ??
      oldestMonth ??
      toMonthKey(Date.now(), activeLedger?.timeZone ?? 'UTC');
    changeMonth(addMonthsToMonthKey(anchor, -1));
  }, [activeLedger?.timeZone, changeMonth, itemRows, monthKey]);

  if (ledgers === undefined || activeLedger === undefined)
    return {
      header: null,
      list: <ScreenSkeleton centerOnScreen rows={7} />,
      detail: null,
    };
  if (activeLedger === null)
    return {
      chrome: {
        backgroundColor: theme.bg.paper,
        statusBarBackgroundColor: brandLedgerSurface(
          themeType === 'dark' ? 'dark' : 'light',
        ).background,
        statusBarStyle: statusBarStyleForTheme(themeType),
      },
      header: null,
      list: (
        <NoLedgerEmptyCanvas
          onAdd={() => router.navigate('/ledgers/new')}
          onOpenDrawer={openDrawer}
        />
      ),
      detail: null,
    };
  const list = (
    <View style={styles.flex}>
      <View style={styles.filter}>
        <BookooSegmentedControl
          onValueChange={changeFilter}
          selectedValue={filter}
          values={[
            {text: t('common.all'), value: 'ALL'},
            {text: t('ledgerItem.expense'), value: 'EXPENSE'},
            {text: t('ledgerItem.income'), value: 'INCOME'},
          ]}
        />
        {monthKey === null ? null : (
          <View style={styles.monthJump}>
            <IconButton
              accessibilityLabel={t('calendar.previousMonth')}
              icon="CaretLeft"
              onPress={() => changeMonth(addMonthsToMonthKey(monthKey, -1))}
              type="text"
            />
            <Typography.Body2 $fontWeight="bold">
              {monthLabel(monthKey)}
            </Typography.Body2>
            <IconButton
              accessibilityLabel={t('calendar.nextMonth')}
              icon="CaretRight"
              onPress={() => changeMonth(addMonthsToMonthKey(monthKey, 1))}
              type="text"
            />
            <BookooButton
              onPress={() => changeMonth(null)}
              size="small"
              text={t('common.list')}
              type="text"
            />
          </View>
        )}
      </View>
      {items.status === 'LoadingFirstPage' ? (
        <ScreenSkeleton rows={7} />
      ) : items.status === 'Exhausted' && itemRows.length === 0 ? (
        <TimelineEmptyState
          onAdd={() =>
            router.navigate({
              pathname: '/ledger/[ledgerId]/item/new',
              params: {ledgerId: activeLedger.id},
            })
          }
        />
      ) : (
        <FlashList
          data={timeline.rows}
          getItemType={timelineRowType}
          keyExtractor={timelineRowKey}
          ListEmptyComponent={
            <ScreenState
              action={
                <BookooButton
                  onPress={() =>
                    router.navigate({
                      pathname: '/ledger/[ledgerId]/item/new',
                      params: {ledgerId: activeLedger.id},
                    })
                  }
                  text={t('common.add')}
                />
              }
              icon="Receipt"
              title={t('ledgerItem.empty')}
            />
          }
          ListFooterComponent={
            itemRows.length === 0 ? null : (
              <View>
                {loadedPages >= MAX_LIVE_ITEM_PAGES &&
                items.status !== 'Exhausted' ? (
                  <ScreenState
                    action={
                      <BookooButton
                        onPress={jumpToPreviousMonth}
                        text={t('calendar.previousMonth')}
                        type="outlined"
                      />
                    }
                    body={t('screen.monthJumpBody')}
                    compact
                    icon="CalendarRange"
                    title={t('screen.monthJumpTitle')}
                  />
                ) : (
                  <ListFooter
                    exhausted={items.status === 'Exhausted'}
                    loading={items.status === 'LoadingMore'}
                  />
                )}
              </View>
            )
          }
          maintainVisibleContentPosition={TIMELINE_LIST_POSITION}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={renderItem}
          stickyHeaderConfig={TIMELINE_STICKY_HEADER_CONFIG}
          stickyHeaderIndices={timeline.stickyHeaderIndices}
        />
      )}
    </View>
  );
  const detail =
    itemRows.length === 0 ? null : selected === null ? (
      <ScreenState compact icon="CursorClick" title={t('screen.selectEntry')} />
    ) : (
      // Keyed by the selection: the detail screen keeps the comment draft,
      // the pending attachments and the delete-confirmation state in local
      // state, and React would otherwise reuse this instance when the tablet
      // user picks a different entry — the draft typed against one entry would
      // be sent to the next. Remounting is the intended reset here; the entry
      // query behind it is cached, so switching back costs nothing.
      <LedgerItemDetailScreen
        key={selected.id}
        embedded
        itemId={selected.id}
      />
    );
  return {
    chrome: (() => {
      const mode = themeType === 'dark' ? 'dark' : 'light';
      const accent =
        LEDGER_ACCENTS[activeLedger.colorKey as LedgerColorKey][mode];
      const surface = ledgerAccentSurface(accent, mode);
      return {
        backgroundColor: theme.bg.paper,
        statusBarBackgroundColor: surface.background,
        statusBarStyle: statusBarStyleForTheme(themeType),
      } as const;
    })(),
    header: (
      <LedgerHeader
        ledger={activeLedger}
        onOpenDrawer={openDrawer}
        trailing={{
          accessibilityLabel: t('a11y.addEntry'),
          icon: 'Plus',
          onPress: () =>
            router.navigate({
              pathname: '/ledger/[ledgerId]/item/new',
              params: {ledgerId: activeLedger.id},
            }),
        }}
      />
    ),
    list,
    detail,
  };
}

export function TimelineMobile(props: TimelineScreenProps): ReactElement {
  return (
    <AppScreen {...props.chrome}>
      <ScreenScrollFrame>
        {props.header}
        {props.list}
      </ScreenScrollFrame>
    </AppScreen>
  );
}

export function TimelineTablet(props: TimelineScreenProps): ReactElement {
  const {themeType} = useCPK();
  const {width, height} = useWindowDimensions();
  return (
    <AppScreen
      {...props.chrome}
      statusBarStyle={statusBarStyleForTheme(themeType)}
    >
      <ScreenScrollFrame>
        {props.header}
        {props.detail === null ? (
          props.list
        ) : width > height ? (
          <TabletSplit primary={props.list} secondary={props.detail} />
        ) : (
          <View style={styles.flex} testID="timeline-stacked">
            <View style={styles.flex} testID="timeline-stacked-list">
              {props.list}
            </View>
            <View style={styles.flex} testID="timeline-stacked-detail">
              {props.detail}
            </View>
          </View>
        )}
      </ScreenScrollFrame>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  emptyContent: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
  filter: {gap: 8, padding: 12},
  flex: {flex: 1},
  monthJump: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    borderBottomWidth: 0,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  sectionDate: {flex: 1, fontWeight: '400'},
  sectionTotal: {flexShrink: 1, maxWidth: '40%', textAlign: 'right'},
});
