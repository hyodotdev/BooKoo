import type {PropsWithChildren, ReactElement, ReactNode} from 'react';
import {useLocale} from '~/hooks/useLocale';
import {memo, useContext, useEffect, useState} from 'react';
import {shallow} from 'zustand/shallow';
import {HeaderShownContext} from 'expo-router/react-navigation';
import {Image, StatusBar, StyleSheet, View, type ViewStyle} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  CustomPressable,
  Icon,
  Typography,
  iconList,
  useCPK,
  type IconName,
} from 'cpk-ui';

import {formatAmount, formatDate, t} from '~/utils/i18n';
import {entryCashFlowMinor} from '@shared/money';
import {BookooButton} from '~/components/uis/BookooButton';
import {BookooLoading} from '~/components/uis/BookooLoading';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {ledgerIconSource} from '~/theme/ledgerAssets';
import {
  LEDGER_ACCENTS,
  brandLedgerSurface,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {CATEGORY_COLORS, type CategoryColorToken} from '~/theme/chartPalette';
import {
  CIRCULAR_ICON_TARGET,
  DETAIL_CONTENT_TOP,
  EXACT_HIT_SLOP,
  circularIconRipple,
} from '~/theme/layout';
import {statusBarStyleForTheme} from '~/theme/statusBar';
import {categoryDisplayName} from './categories';
import type {CategoryRow, ItemRow, LedgerRow} from './types';
import {occurredAtToLocalWallClock} from '@shared/date';

const iconNames: ReadonlySet<string> = new Set(iconList);

export {statusBarStyleForTheme} from '~/theme/statusBar';

export const safeIconName = (
  value: string,
  fallback: IconName = 'Question',
): IconName => (iconNames.has(value) ? (value as IconName) : fallback);

export function LedgerMark({
  colorKey,
  filled = true,
  iconKey,
  size = 44,
}: {
  readonly colorKey: string;
  readonly filled?: boolean;
  readonly iconKey: string | null;
  readonly size?: number;
}): ReactElement {
  const {themeType} = useCPK();
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const accent =
    LEDGER_ACCENTS[
      colorKey in LEDGER_ACCENTS ? (colorKey as LedgerColorKey) : 'TEAL'
    ][mode];
  const surface = ledgerAccentSurface(accent, mode);
  if (iconKey === null) {
    return (
      <Image
        resizeMode="contain"
        source={ledgerIconSource(colorKey)}
        style={{height: size, width: size}}
      />
    );
  }
  return (
    <View
      style={[
        styles.ledgerMark,
        {
          backgroundColor: filled ? surface.background : 'transparent',
          borderColor: surface.foreground,
          borderRadius: size / 2,
          borderWidth: filled ? 0 : 2,
          height: size,
          width: size,
        },
      ]}
    >
      <Icon
        color={surface.foreground}
        name={safeIconName(iconKey)}
        size={Math.round(size * 0.5)}
      />
    </View>
  );
}

export function AppScreen({
  backgroundColor,
  bottomInsetColor,
  children,
  insetTop,
  statusBarBackgroundColor,
  statusBarStyle,
}: PropsWithChildren<{
  backgroundColor?: string;
  bottomInsetColor?: string;
  /** Override for native sheets; otherwise the visible header owns the top inset. */
  insetTop?: boolean;
  statusBarBackgroundColor?: string;
  statusBarStyle?: 'dark-content' | 'light-content';
}>): ReactElement {
  const {theme, themeType} = useCPK();
  const insets = useSafeAreaInsets();
  const headerShown = useContext(HeaderShownContext);
  const ownsTopInset = insetTop ?? !headerShown;
  const background = backgroundColor ?? theme.bg.paper;
  const statusBackground = statusBarBackgroundColor ?? background;
  const barStyle = statusBarStyle ?? statusBarStyleForTheme(themeType);

  if (statusBarBackgroundColor !== undefined || bottomInsetColor !== undefined)
    return (
      <View style={[styles.flex, {backgroundColor: statusBackground}]}>
        <StatusBar
          backgroundColor={statusBackground}
          barStyle={barStyle}
          hidden={false}
        />
        <View
          style={{
            backgroundColor: statusBackground,
            height: ownsTopInset ? insets.top : 0,
          }}
          testID="app-screen-top-inset"
        />
        <SafeAreaView
          edges={['left', 'right']}
          style={[
            styles.flex,
            {
              backgroundColor: background,
            },
          ]}
        >
          <View style={[styles.flex, {backgroundColor: background}]}>
            {children}
          </View>
        </SafeAreaView>
        {bottomInsetColor === undefined ? null : (
          <View
            pointerEvents="none"
            style={{
              backgroundColor: bottomInsetColor,
              bottom: 0,
              height: insets.bottom,
              left: 0,
              position: 'absolute',
              right: 0,
            }}
            testID="app-screen-bottom-inset"
          />
        )}
      </View>
    );

  return (
    <SafeAreaView
      edges={ownsTopInset ? undefined : ['left', 'right', 'bottom']}
      style={[styles.flex, {backgroundColor: background}]}
    >
      <StatusBar
        backgroundColor={background}
        barStyle={barStyle}
        hidden={false}
      />
      {children}
    </SafeAreaView>
  );
}

export function ScreenScrollFrame({
  children,
  surface = 'paper',
}: PropsWithChildren<{
  readonly surface?: 'basic' | 'paper';
}>): ReactElement {
  const {theme} = useCPK();
  return (
    <View
      style={[styles.screenFrame, {backgroundColor: theme.bg[surface]}]}
      testID="screen-scroll-frame"
    >
      {children}
    </View>
  );
}

export function ScreenState({
  title,
  body,
  icon = 'QuestBox',
  action,
  compact = false,
}: {
  title: string;
  body?: string;
  icon?: IconName;
  action?: ReactNode;
  compact?: boolean;
}): ReactElement {
  const {theme} = useCPK();
  if (compact)
    return (
      <View accessibilityLiveRegion="polite" style={styles.stateCompact}>
        <View
          style={[
            styles.stateCompactIcon,
            {backgroundColor: theme.role.underlay},
          ]}
        >
          <Icon color={theme.role.primary} name={icon} size={24} />
        </View>
        <View style={styles.stateCompactCopy}>
          <Typography.Body2
            $fontWeight="bold"
            style={{color: theme.text.basic}}
          >
            {title}
          </Typography.Body2>
          {body === undefined ? null : (
            <Typography.Body3 style={{color: theme.text.label}}>
              {body}
            </Typography.Body3>
          )}
          {action}
        </View>
      </View>
    );
  return (
    <View accessibilityLiveRegion="polite" style={styles.state}>
      <View style={styles.stateVisual}>
        <View
          style={[styles.stateIcon, {backgroundColor: theme.role.underlay}]}
        >
          <Icon color={theme.role.primary} name={icon} size={30} />
        </View>
        <View accessibilityElementsHidden style={styles.stateLedgerLines}>
          <View
            style={[
              styles.stateLedgerLine,
              {backgroundColor: theme.role.divider},
            ]}
          />
          <View
            style={[
              styles.stateLedgerLineShort,
              {backgroundColor: theme.role.divider},
            ]}
          />
        </View>
      </View>
      <View style={styles.stateCopy}>
        <Typography.Heading3
          $fontWeight="bold"
          accessibilityRole="header"
          style={{color: theme.text.basic}}
        >
          {title}
        </Typography.Heading3>
        {body === undefined ? null : (
          <Typography.Body3 style={{color: theme.text.label}}>
            {body}
          </Typography.Body3>
        )}
      </View>
      {action === undefined ? null : (
        <View style={styles.stateAction}>{action}</View>
      )}
    </View>
  );
}

/**
 * Compatibility surface: every former skeleton now renders branded loading.
 *
 * `delayMs` holds the loader back for a grace period, so a load that finishes
 * quickly never flashes a second "Loading…" straight after the launch loader.
 *
 * `centerOnScreen` is for a tab's fallback while the ledger is unknown. The
 * shell's loading overlay centers its loader on the whole screen, but this one
 * sits inside the safe area, so it rests half the inset difference lower. The
 * overlay fades out over it, and without this shift the loader jumps and
 * doubles for a moment.
 */
export function ScreenSkeleton({
  centerOnScreen = false,
  delayMs = 0,
  rows = 5,
}: {
  centerOnScreen?: boolean;
  delayMs?: number;
  rows?: number;
}): ReactElement {
  void rows;
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!shown)
    return <View style={styles.skeletonGrace} testID="screen-skeleton-grace" />;
  if (!centerOnScreen) return <BookooLoading variant="screen" />;
  return (
    <View
      style={[
        styles.flex,
        {transform: [{translateY: (insets.bottom - insets.top) / 2}]},
      ]}
      testID="screen-skeleton-centered"
    >
      <BookooLoading variant="screen" />
    </View>
  );
}

/** Empty-ledger canvas: mint hamburger, sad-face mark, solid add. */
export function NoLedgerEmptyCanvas({
  onAdd,
  onOpenDrawer,
}: {
  onAdd: () => void;
  onOpenDrawer: () => void;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const surface = brandLedgerSurface(mode);
  return (
    <View style={styles.noLedgerRoot} testID="no-ledger-empty">
      <View
        style={[styles.noLedgerHeader, {backgroundColor: surface.background}]}
        testID="no-ledger-header"
      >
        <CustomPressable
          accessibilityLabel={t('a11y.openDashboard')}
          accessibilityRole="button"
          android_ripple={circularIconRipple(theme.role.underlay)}
          hitSlop={EXACT_HIT_SLOP}
          onPress={onOpenDrawer}
          style={styles.noLedgerMenu}
          testID="ledger-header-menu"
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../../assets/navigation/btnMenu.png')}
            style={styles.noLedgerMenuIcon}
          />
        </CustomPressable>
      </View>
      <View style={styles.noLedgerContent}>
        <View
          style={[styles.noLedgerMark, {backgroundColor: BOOKOO_PALETTE.white}]}
          testID="no-ledger-mark"
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../../assets/empty/icNoLedger.png')}
            style={styles.noLedgerImage}
          />
        </View>
        <Typography.Heading4
          style={[styles.noLedgerText, {color: theme.text.placeholder}]}
        >
          {t('ledger.empty')}
        </Typography.Heading4>
        <BookooButton
          accessibilityLabel={t('ledger.add')}
          accent={LEDGER_ACCENTS.TEAL[mode]}
          borderRadius={32}
          onPress={onAdd}
          style={styles.noLedgerAddPlacement}
          styles={{
            container: styles.noLedgerAdd,
            text: [styles.noLedgerAddText, {color: BOOKOO_PALETTE.white}],
          }}
          testID="no-ledger-add"
          text={t('ledger.add')}
          type="solid"
        />
      </View>
    </View>
  );
}

export function LedgerHeader({
  ledger,
  onOpenDrawer,
  trailing,
}: {
  ledger: LedgerRow;
  onOpenDrawer: () => void;
  trailing?: {
    readonly accessibilityLabel: string;
    readonly icon: IconName;
    readonly onPress: () => void;
  };
}): ReactElement {
  const {theme, themeType} = useCPK();
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const accent = LEDGER_ACCENTS[ledger.colorKey as LedgerColorKey][mode];
  const surface = ledgerAccentSurface(accent, mode);
  return (
    <View
      style={[styles.ledgerHeader, {backgroundColor: surface.background}]}
      testID="ledger-header"
    >
      <CustomPressable
        accessibilityLabel={t('a11y.openDashboard')}
        accessibilityRole="button"
        android_ripple={circularIconRipple(theme.role.underlay)}
        hitSlop={EXACT_HIT_SLOP}
        onPress={onOpenDrawer}
        style={styles.ledgerMenu}
        testID="ledger-header-menu"
      >
        <Image
          resizeMode="contain"
          source={require('../../../assets/navigation/btnMenu.png')}
          style={styles.ledgerMenuIcon}
        />
      </CustomPressable>
      <CustomPressable
        accessibilityLabel={ledger.title}
        accessibilityRole="button"
        onPress={onOpenDrawer}
        style={styles.ledgerTitleButton}
      >
        <Typography.Body2
          $fontWeight="bold"
          maxFontSizeMultiplier={1.35}
          numberOfLines={2}
          style={[styles.ledgerTitle, {color: surface.foreground}]}
        >
          {ledger.emoji === null ? '' : `${ledger.emoji} `}
          {ledger.title}
        </Typography.Body2>
      </CustomPressable>
      {trailing === undefined ? null : (
        <CustomPressable
          accessibilityLabel={trailing.accessibilityLabel}
          accessibilityRole="button"
          android_ripple={circularIconRipple(theme.role.underlay)}
          hitSlop={EXACT_HIT_SLOP}
          onPress={trailing.onPress}
          style={styles.ledgerAction}
          testID="ledger-header-action"
        >
          <Icon color={surface.foreground} name={trailing.icon} size={24} />
        </CustomPressable>
      )}
    </View>
  );
}

export interface EntryRowProps {
  item: ItemRow;
  category?: CategoryRow;
  onPress: (item: ItemRow) => void;
  /** Lists without day headers (search, stats, deleted) always show the date. */
  dated?: boolean;
}

/** Convex reserializes a changed page. Equal DTOs must not redraw every row;
 * compare all scalar fields and the single flat place object, including fields
 * used by the press callback. This keeps changed money/counts/metadata live. */
export function entryRowPropsEqual(
  previous: EntryRowProps,
  next: EntryRowProps,
): boolean {
  const {place: previousPlace, ...previousItem} = previous.item;
  const {place: nextPlace, ...nextItem} = next.item;
  return (
    previous.onPress === next.onPress &&
    previous.dated === next.dated &&
    shallow(previous.category, next.category) &&
    shallow(previousItem, nextItem) &&
    shallow(previousPlace, nextPlace)
  );
}

export const EntryRow = memo(function EntryRow({
  item,
  category,
  onPress,
  dated = false,
}: EntryRowProps): ReactElement {
  useLocale();
  const {theme, themeType} = useCPK();
  const amount = formatAmount(
    {
      amountMinor: entryCashFlowMinor(item.type, item.amountMinor),
      currency: item.currency,
    },
    {alwaysSign: true},
  );
  const color = item.type === 'INCOME' ? theme.text.income : theme.text.expense;
  const categoryLabel =
    category === undefined ? item.categoryKey : categoryDisplayName(category);
  const date = formatDate(
    occurredAtToLocalWallClock(item.occurredAt, item.occurredOffsetMinutes),
    'MMM d · p',
  );
  const subtitle =
    item.memo.length === 0
      ? date
      : dated
        ? `${date} · ${item.memo}`
        : item.memo;
  const amountLabel =
    item.type === 'INCOME'
      ? t('a11y.incomeAmount', {amount, category: categoryLabel})
      : t('a11y.expenseAmount', {amount, category: categoryLabel});
  const categoryColor =
    category === undefined || !(category.colorToken in CATEGORY_COLORS)
      ? theme.text.label
      : CATEGORY_COLORS[category.colorToken as CategoryColorToken][
          themeType === 'dark' ? 'dark' : 'light'
        ];
  return (
    <CustomPressable
      accessibilityLabel={`${amountLabel}, ${subtitle}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={[
        styles.entryRow,
        {
          backgroundColor: theme.bg.basic,
          borderBottomColor: theme.role.divider,
        },
      ]}
    >
      <View style={[styles.entryIcon, {backgroundColor: theme.bg.paper}]}>
        <Icon
          color={categoryColor}
          name={safeIconName(category?.iconKey ?? 'Question')}
          size={22}
        />
      </View>
      <View style={styles.flex}>
        <Typography.Body2
          $fontWeight="bold"
          numberOfLines={1}
          style={{color: theme.text.basic}}
        >
          {categoryLabel}
        </Typography.Body2>
        <Typography.Body4 numberOfLines={1} style={{color: theme.text.label}}>
          {subtitle}
        </Typography.Body4>
      </View>
      {/* At the largest text sizes the amount took the whole row and left
          the category one letter; it now keeps to half and fits one line. */}
      <Typography.Body2
        $fontWeight="bold"
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[styles.entryAmount, {color}]}
      >
        {amount}
      </Typography.Body2>
    </CustomPressable>
  );
}, entryRowPropsEqual);

export function ListFooter({
  loading,
}: {
  loading: boolean;
  exhausted: boolean;
}): ReactElement {
  if (loading)
    return (
      <View style={styles.listFooterLoading}>
        <BookooLoading testID="list-loading-more" variant="inline" />
      </View>
    );
  return <View style={styles.footerSpace} />;
}

export function TabletSplit({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary: ReactNode;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <View style={styles.tabletSplit}>
      <View
        style={[styles.tabletPrimary, {borderRightColor: theme.role.divider}]}
      >
        {primary}
      </View>
      <View style={styles.tabletSecondary}>{secondary}</View>
    </View>
  );
}

export function FormFrame({
  children,
  style,
}: PropsWithChildren<{style?: ViewStyle}>): ReactElement {
  return <View style={[styles.formFrame, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  skeletonGrace: {flex: 1},
  center: {textAlign: 'center'},
  flex: {flex: 1},
  entryIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  entryAmount: {flexShrink: 1, maxWidth: '50%'},
  entryRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerSpace: {height: 20},
  listFooterLoading: {alignItems: 'center', minHeight: 56, paddingVertical: 10},
  formFrame: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 680,
    padding: 20,
    paddingTop: DETAIL_CONTENT_TOP,
    width: '100%',
  },
  ledgerAction: {
    ...CIRCULAR_ICON_TARGET,
  },
  ledgerMark: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ledgerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
  },
  ledgerMenu: {
    ...CIRCULAR_ICON_TARGET,
  },
  ledgerMenuIcon: {height: 56, width: 56},
  noLedgerAdd: {
    height: 56,
    minWidth: 160,
    paddingHorizontal: 28,
  },
  noLedgerAddPlacement: {alignSelf: 'center', marginTop: 24},
  noLedgerAddText: {fontSize: 20},
  noLedgerContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  noLedgerHeader: {
    height: 56,
    justifyContent: 'center',
  },
  noLedgerImage: {height: 56, width: 56},
  noLedgerMark: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 80,
  },
  noLedgerMenu: {
    ...CIRCULAR_ICON_TARGET,
  },
  noLedgerMenuIcon: {height: 56, width: 56},
  noLedgerRoot: {flex: 1},
  noLedgerText: {
    fontSize: 20,
    lineHeight: 28,
    marginTop: 20,
    textAlign: 'center',
  },
  ledgerTitle: {flexShrink: 1},
  ledgerTitleButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingVertical: 10,
  },
  screenFrame: {flex: 1, width: '100%'},
  state: {
    alignSelf: 'center',
    gap: 22,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 40,
    width: '100%',
  },
  stateAction: {alignItems: 'flex-start', maxWidth: 360, width: '100%'},
  stateCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 112,
    paddingHorizontal: 20,
    paddingVertical: 22,
    width: '100%',
  },
  stateCompactCopy: {flex: 1, gap: 5},
  stateCompactIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stateCopy: {gap: 8, maxWidth: 520},
  stateIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  stateLedgerLine: {borderRadius: 2, height: 3, width: 92},
  stateLedgerLines: {gap: 9},
  stateLedgerLineShort: {borderRadius: 2, height: 3, width: 58},
  stateVisual: {alignItems: 'center', flexDirection: 'row', gap: 18},
  tabletPrimary: {borderRightWidth: StyleSheet.hairlineWidth, flex: 0.44},
  tabletSecondary: {flex: 0.56},
  tabletSplit: {flex: 1, flexDirection: 'row'},
});
