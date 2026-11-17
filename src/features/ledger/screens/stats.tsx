import type {ReactElement} from 'react';
import {useLocale} from '~/hooks/useLocale';
import {memo, useCallback, useMemo, useState} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useQuery} from 'convex-helpers/react/cache';
import {
  CustomPressable,
  DonutChart,
  Icon,
  IconButton,
  Typography,
  useCPK,
} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {BookooSegmentedControl} from '~/components/uis/BookooSegmentedControl';
import {addMonthsToMonthKey, toMonthKey} from '@shared/date';
import {formatAmount, formatRatio, t} from '~/utils/i18n';
import {statsSeriesColor} from '~/theme/chartPalette';
import {
  LEDGER_ACCENTS,
  brandLedgerSurface,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {monthLabel} from '../calendar';
import {categoryDisplayName} from '../categories';
import {useOpenLedgerDrawer} from '../drawer';
import {
  statsCenterAmount,
  statsMagnitude,
  statsShare,
  statsSignedAmount,
  type StatsPresentationMode,
} from '../statsPresentation';
import {useActiveLedger} from '../useActiveLedger';
import {
  AppScreen,
  LedgerHeader,
  NoLedgerEmptyCanvas,
  ScreenSkeleton,
  ScreenState,
  ScreenScrollFrame,
  TabletSplit,
  safeIconName,
  statusBarStyleForTheme,
} from '../ui';
import type {CategoryRollup, CategoryRow} from '../types';

type StatsMode = StatsPresentationMode;

interface StatsDatum extends Record<string, string | number> {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

export interface StatsScreenProps {
  readonly kind: 'empty' | 'loading' | 'ready';
  readonly header: ReactElement | null;
  readonly chart: ReactElement;
  readonly list: ReactElement;
  readonly chrome?: {
    readonly backgroundColor: string;
    readonly statusBarBackgroundColor: string;
    readonly statusBarStyle: 'dark-content' | 'light-content';
  };
}

export function useStatsScreenProps(): StatsScreenProps {
  useLocale();
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const {activeLedger, ledgers} = useActiveLedger();
  const openDrawer = useOpenLedgerDrawer();
  const activeId = activeLedger?.id;
  const themeMode = themeType === 'dark' ? 'dark' : 'light';
  const optionalLedgerAccent =
    activeLedger === undefined || activeLedger === null
      ? LEDGER_ACCENTS.TEAL[themeMode]
      : LEDGER_ACCENTS[activeLedger.colorKey as LedgerColorKey][themeMode];
  const seriesAccent =
    themeMode === 'dark'
      ? optionalLedgerAccent.text
      : optionalLedgerAccent.base;
  const [now] = useState(Date.now);
  const [selection, setSelection] = useState({
    ledgerId: '',
    monthKey: toMonthKey(now, 'UTC'),
  });
  const monthKey =
    selection.ledgerId === activeId
      ? selection.monthKey
      : toMonthKey(now, activeLedger?.timeZone ?? 'UTC');
  const setMonthKey = useCallback(
    (nextMonthKey: number) =>
      setSelection({ledgerId: activeId ?? '', monthKey: nextMonthKey}),
    [activeId],
  );
  const [mode, setMode] = useState<StatsMode>('ALL');
  const month = useQuery(
    api.rollups.queries.month,
    activeId === undefined ? 'skip' : {ledgerId: activeId, monthKey},
  );
  const rollups = useQuery(
    api.rollups.queries.categoriesOfMonth,
    activeId === undefined ? 'skip' : {ledgerId: activeId, monthKey},
  );
  const categories = useQuery(
    api.categories.queries.list,
    activeId === undefined ? 'skip' : {ledgerId: activeId},
  );
  const categoryByKey = useMemo(
    () => new Map(categories?.map((category) => [category.key, category])),
    [categories],
  );
  const sorted = useMemo(
    () =>
      [...(rollups ?? [])]
        .filter((row) => statsMagnitude(row, mode) !== 0)
        .sort(
          (left, right) =>
            statsMagnitude(right, mode) - statsMagnitude(left, mode),
        ),
    [mode, rollups],
  );
  const data = useMemo<readonly StatsDatum[]>(() => {
    const top = sorted.slice(0, 7).map((row, index) => {
      const category = categoryByKey.get(row.categoryKey);
      return {
        key: row.categoryKey,
        label:
          category === undefined
            ? row.categoryKey
            : categoryDisplayName(category),
        value: statsMagnitude(row, mode),
        color: statsSeriesColor(index, themeMode, seriesAccent),
      };
    });
    if (sorted.length <= 7) return top;
    return [
      ...top,
      {
        key: 'other',
        label: t('icon.groupOther'),
        value: sorted
          .slice(7)
          .reduce((sum, row) => sum + statsMagnitude(row, mode), 0),
        color: statsSeriesColor(7, themeMode, seriesAccent),
      },
    ];
  }, [categoryByKey, mode, seriesAccent, sorted, themeMode]);
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const openCategory = useCallback(
    (row: CategoryRollup) =>
      router.navigate({
        pathname: '/stats/category/[categoryKey]',
        params: {categoryKey: row.categoryKey, monthKey},
      }),
    [monthKey, router],
  );

  if (ledgers === undefined || activeLedger === undefined)
    return {
      kind: 'loading',
      header: null,
      chart: <ScreenSkeleton centerOnScreen rows={4} />,
      list: <View />,
    };
  if (activeLedger === null)
    return {
      kind: 'empty',
      chrome: {
        backgroundColor: theme.bg.paper,
        statusBarBackgroundColor: brandLedgerSurface(themeMode).background,
        statusBarStyle: statusBarStyleForTheme(themeType),
      },
      header: null,
      chart: (
        <NoLedgerEmptyCanvas
          onAdd={() => router.navigate('/ledgers/new')}
          onOpenDrawer={openDrawer}
        />
      ),
      list: <View />,
    };
  const loading =
    month === undefined || rollups === undefined || categories === undefined;
  const ledgerAccent =
    LEDGER_ACCENTS[activeLedger.colorKey as LedgerColorKey][themeMode];
  const accentSurface = ledgerAccentSurface(ledgerAccent, themeMode);
  const chart = loading ? (
    <ScreenSkeleton rows={4} />
  ) : (
    <StatsChart
      centerMinor={statsCenterAmount({...month, mode})}
      currency={activeLedger.baseCurrency}
      data={data}
      mode={mode}
      monthKey={monthKey}
      onChangeMode={setMode}
      onChangeMonth={setMonthKey}
      selectedBackgroundColor={accentSurface.background}
      selectedTextColor={accentSurface.foreground}
    />
  );
  const list = loading ? (
    <View />
  ) : (
    <StatsList
      categoryByKey={categoryByKey}
      currency={activeLedger.baseCurrency}
      ledgerAccent={seriesAccent}
      mode={mode}
      onOpen={openCategory}
      rows={sorted}
      total={total}
    />
  );
  return {
    kind: loading ? 'loading' : 'ready',
    chrome: {
      backgroundColor: theme.bg.paper,
      statusBarBackgroundColor: accentSurface.background,
      statusBarStyle: statusBarStyleForTheme(themeType),
    },
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
    chart,
    list,
  };
}

function StatsChart({
  centerMinor,
  currency,
  data,
  mode,
  monthKey,
  onChangeMode,
  onChangeMonth,
  selectedBackgroundColor,
  selectedTextColor,
}: {
  centerMinor: number;
  currency: string;
  data: readonly StatsDatum[];
  mode: StatsMode;
  monthKey: number;
  onChangeMode: (mode: StatsMode) => void;
  onChangeMonth: (monthKey: number) => void;
  selectedBackgroundColor: string;
  selectedTextColor: string;
}): ReactElement {
  const {theme} = useCPK();
  const modeLabel =
    mode === 'ALL'
      ? t('common.all')
      : mode === 'EXPENSE'
        ? t('ledgerItem.expense')
        : t('ledgerItem.income');
  const totalAmount = formatAmount(
    {amountMinor: centerMinor, currency},
    {alwaysSign: true},
  );
  return (
    <View style={styles.chartPanel}>
      <View style={styles.monthHeader}>
        <IconButton
          accessibilityLabel={t('calendar.previousMonth')}
          icon="CaretLeft"
          onPress={() => onChangeMonth(addMonthsToMonthKey(monthKey, -1))}
          size={20}
          styles={{container: styles.monthArrow}}
          testID="stats-previous-month"
          type="text"
        />
        <Typography.Heading4 $fontWeight="bold">
          {monthLabel(monthKey)}
        </Typography.Heading4>
        <IconButton
          accessibilityLabel={t('calendar.nextMonth')}
          icon="CaretRight"
          onPress={() => onChangeMonth(addMonthsToMonthKey(monthKey, 1))}
          size={20}
          styles={{container: styles.monthArrow}}
          testID="stats-next-month"
          type="text"
        />
      </View>
      <BookooSegmentedControl
        onValueChange={(value) => {
          if (value === 'ALL' || value === 'EXPENSE' || value === 'INCOME')
            onChangeMode(value);
        }}
        selectedBackgroundColor={selectedBackgroundColor}
        selectedTextColor={selectedTextColor}
        selectedValue={mode}
        values={[
          {text: t('common.all'), value: 'ALL'},
          {text: t('ledgerItem.expense'), value: 'EXPENSE'},
          {text: t('ledgerItem.income'), value: 'INCOME'},
        ]}
      />
      {data.length === 0 ? null : (
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: theme.bg.basic,
              borderColor: theme.role.border,
            },
          ]}
        >
          <View style={styles.donutWrap}>
            <DonutChart
              accessibilityLabel={`${modeLabel}. ${t('money.total')} ${totalAmount}.`}
              data={data}
              innerRadiusRatio={0.78}
              size={218}
              startAngle={12}
              style={styles.donut}
              trackColor={theme.role.chartGrid}
            >
              <View pointerEvents="none" style={styles.donutCenterContent}>
                <Typography.Body4
                  $fontWeight="bold"
                  style={[styles.metricLabel, {color: theme.text.label}]}
                >
                  {t('money.total')}
                </Typography.Body4>
                <Typography.Heading3
                  $fontWeight="bold"
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  numberOfLines={1}
                  style={[styles.metricAmount, {color: theme.text.basic}]}
                >
                  {totalAmount}
                </Typography.Heading3>
              </View>
            </DonutChart>
          </View>
        </View>
      )}
    </View>
  );
}

const StatsCategoryRow = memo(function StatsCategoryRow({
  category,
  currency,
  index,
  item,
  ledgerAccent,
  mode,
  onOpen,
  total,
}: {
  readonly category: CategoryRow | undefined;
  readonly currency: string;
  readonly index: number;
  readonly item: CategoryRollup;
  readonly ledgerAccent: string;
  readonly mode: StatsMode;
  readonly onOpen: (row: CategoryRollup) => void;
  readonly total: number;
}): ReactElement {
  useLocale();
  const {theme, themeType} = useCPK();
  const magnitude = statsMagnitude(item, mode);
  const amount = statsSignedAmount(item, mode);
  const share = statsShare(magnitude, total);
  const shareLabel = formatRatio(share);
  const color = statsSeriesColor(
    index,
    themeType === 'dark' ? 'dark' : 'light',
    ledgerAccent,
  );
  const label =
    category === undefined ? item.categoryKey : categoryDisplayName(category);
  const formattedAmount = formatAmount(
    {amountMinor: amount, currency},
    {alwaysSign: true},
  );
  const amountColor =
    amount > 0
      ? theme.text.income
      : amount < 0
        ? theme.text.expense
        : theme.text.basic;
  return (
    <CustomPressable
      accessibilityLabel={`${label}, ${formattedAmount}, ${shareLabel}`}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={[styles.categoryRow, {backgroundColor: theme.bg.basic}]}
    >
      <View
        style={[
          styles.categoryIcon,
          {backgroundColor: theme.bg.paper, borderColor: color},
        ]}
      >
        <Icon
          color={color}
          name={safeIconName(category?.iconKey ?? 'Question')}
          size={22}
        />
      </View>
      <View style={styles.categoryContent}>
        <View style={styles.categoryMeta}>
          <View style={styles.flex}>
            <Typography.Body2 $fontWeight="bold" numberOfLines={1}>
              {label}
            </Typography.Body2>
            <Typography.Body4 style={{color: theme.text.label}}>
              {shareLabel}
            </Typography.Body4>
          </View>
          <Typography.Body2 $fontWeight="bold" style={{color: amountColor}}>
            {formattedAmount}
          </Typography.Body2>
          <Icon color={theme.text.placeholder} name="CaretRight" size={16} />
        </View>
        <View
          style={[
            styles.progressTrack,
            {backgroundColor: theme.role.chartGrid},
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {backgroundColor: color, width: `${share * 100}%`},
            ]}
          />
        </View>
      </View>
    </CustomPressable>
  );
});

const statsCategoryKey = (item: CategoryRollup): string => item.categoryKey;

function StatsList({
  categoryByKey,
  currency,
  ledgerAccent,
  mode,
  onOpen,
  rows,
  total,
}: {
  categoryByKey: ReadonlyMap<string, CategoryRow>;
  currency: string;
  ledgerAccent: string;
  mode: StatsMode;
  onOpen: (row: CategoryRollup) => void;
  rows: readonly CategoryRollup[];
  total: number;
}): ReactElement {
  const renderItem = useCallback(
    ({index, item}: {index: number; item: CategoryRollup}) => (
      <StatsCategoryRow
        category={categoryByKey.get(item.categoryKey)}
        currency={currency}
        index={index}
        item={item}
        ledgerAccent={ledgerAccent}
        mode={mode}
        onOpen={onOpen}
        total={total}
      />
    ),
    [categoryByKey, currency, ledgerAccent, mode, onOpen, total],
  );
  return (
    <FlashList
      data={rows}
      key={mode}
      keyExtractor={statsCategoryKey}
      ListEmptyComponent={
        <ScreenState compact icon="ChartDonut" title={t('screen.noStats')} />
      }
      renderItem={renderItem}
    />
  );
}

export function StatsMobile(props: StatsScreenProps): ReactElement {
  if (props.kind !== 'ready')
    return (
      <AppScreen {...props.chrome}>
        {props.header}
        {props.chart}
      </AppScreen>
    );
  return (
    <AppScreen {...props.chrome}>
      <ScreenScrollFrame>
        {props.header}
        <View style={styles.mobileChart} testID="stats-chart">
          {props.chart}
        </View>
        <View style={styles.flex}>{props.list}</View>
      </ScreenScrollFrame>
    </AppScreen>
  );
}

export function StatsTablet(props: StatsScreenProps): ReactElement {
  const {themeType} = useCPK();
  const {width, height} = useWindowDimensions();
  if (width <= height) return <StatsMobile {...props} />;
  if (props.kind !== 'ready')
    return (
      <AppScreen
        {...props.chrome}
        statusBarStyle={statusBarStyleForTheme(themeType)}
      >
        {props.header}
        {props.chart}
      </AppScreen>
    );
  return (
    <AppScreen
      {...props.chrome}
      statusBarStyle={statusBarStyleForTheme(themeType)}
    >
      <ScreenScrollFrame>
        {props.header}
        <TabletSplit primary={props.chart} secondary={props.list} />
      </ScreenScrollFrame>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  categoryContent: {flex: 1, gap: 8},
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  categoryMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chartCard: {
    borderCurve: 'continuous',
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chartPanel: {gap: 14, padding: 16},
  donut: {alignSelf: 'center'},
  donutCenterContent: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    width: '70%',
  },
  donutWrap: {
    alignItems: 'center',
    height: 236,
    justifyContent: 'center',
    position: 'relative',
  },
  flex: {flex: 1},
  metricAmount: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    width: '100%',
  },
  metricLabel: {letterSpacing: 1.1},
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthArrow: {padding: 6},
  mobileChart: {flexShrink: 0},
  progressFill: {borderRadius: 3, height: 5},
  progressTrack: {
    borderRadius: 3,
    height: 5,
    overflow: 'hidden',
  },
});
