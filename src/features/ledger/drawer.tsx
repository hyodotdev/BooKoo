import type {ReactElement} from 'react';
import {memo, useCallback} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useNavigation, useRouter} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CustomPressable, Icon, Typography, useCPK} from 'cpk-ui';

import {useSession} from '~/features/auth/session';
import {useLocale} from '~/hooks/useLocale';
import {
  LEDGER_ACCENTS,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {t, tCount} from '~/utils/i18n';
import {LedgerMark, ScreenSkeleton} from './ui';
import {
  CIRCULAR_ICON_TARGET,
  EXACT_HIT_SLOP,
  circularIconRipple,
} from '~/theme/layout';
import type {LedgerRow} from './types';
import {useActiveLedger} from './useActiveLedger';

type NativeDrawerNavigation = {
  openDrawer: () => void;
};

export function useOpenLedgerDrawer(): () => void {
  const navigation = useNavigation<NativeDrawerNavigation>('/(app)/(tabs)');
  return useCallback(() => navigation.openDrawer(), [navigation]);
}

function DrawerSeparator(): ReactElement {
  const {theme} = useCPK();

  return (
    <View style={styles.separatorInset}>
      <View style={[styles.separator, {backgroundColor: theme.role.divider}]} />
    </View>
  );
}

const DrawerLedgerRow = memo(function DrawerLedgerRow({
  active,
  item,
  onSelect,
}: {
  readonly active: boolean;
  readonly item: LedgerRow;
  readonly onSelect: (ledgerId: LedgerRow['id']) => void;
}): ReactElement {
  useLocale();
  const {theme, themeType} = useCPK();
  const metadata = tCount('ledger.memberCount', item.memberCount);
  const accent =
    LEDGER_ACCENTS[item.colorKey as LedgerColorKey][
      themeType === 'dark' ? 'dark' : 'light'
    ];
  const surface = ledgerAccentSurface(
    accent,
    themeType === 'dark' ? 'dark' : 'light',
  );

  return (
    <CustomPressable
      accessibilityLabel={`${item.title}, ${metadata}`}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      hitSlop={EXACT_HIT_SLOP}
      onPress={() => onSelect(item.id)}
      style={[styles.ledgerRow, active && {backgroundColor: accent.subtle}]}
      testID={`ledger-row-${item.title}-select`}
    >
      <View>
        <LedgerMark colorKey={item.colorKey} iconKey={item.iconKey} />
        {active ? (
          <View
            style={[
              styles.activeMark,
              {
                backgroundColor: surface.background,
                borderColor: theme.bg.sheet,
              },
            ]}
          >
            <Icon color={surface.foreground} name="Check" size={10} />
          </View>
        ) : null}
      </View>
      <View style={styles.ledgerCopy}>
        <Typography.Body2 numberOfLines={1}>{item.title}</Typography.Body2>
        <Typography.Body4
          numberOfLines={1}
          style={{color: theme.text.placeholder}}
        >
          {metadata}
        </Typography.Body4>
      </View>
    </CustomPressable>
  );
});

export function LedgerDrawerContent({
  onClose,
}: {
  readonly onClose: () => void;
}): ReactElement {
  useLocale();
  const router = useRouter();
  const {theme} = useCPK();
  const {user} = useSession();
  const {
    activeLedger,
    ledgerPaginationStatus,
    ledgers,
    loadMoreLedgers,
    setActiveLedgerId,
  } = useActiveLedger();
  const selectLedger = useCallback(
    (ledgerId: LedgerRow['id']) => {
      setActiveLedgerId(ledgerId);
      onClose();
    },
    [onClose, setActiveLedgerId],
  );
  const renderItem = useCallback(
    ({item}: {item: LedgerRow}) => (
      <DrawerLedgerRow
        active={item.id === activeLedger?.id}
        item={item}
        onSelect={selectLedger}
      />
    ),
    [activeLedger?.id, selectLedger],
  );
  const addLedger = useCallback(() => {
    onClose();
    router.navigate('/ledgers/new');
  }, [onClose, router]);
  const openSettings = useCallback(() => {
    onClose();
    router.navigate('/settings');
  }, [onClose, router]);
  const openProfile = useCallback(() => {
    if (user === null) return;
    onClose();
    router.navigate('/profile/me');
  }, [onClose, router, user]);

  return (
    <SafeAreaView
      edges={['top', 'left', 'bottom']}
      style={[styles.root, {backgroundColor: theme.bg.sheet}]}
    >
      <View style={styles.header}>
        <CustomPressable
          accessibilityLabel={t('a11y.close')}
          accessibilityRole="button"
          android_ripple={circularIconRipple(theme.role.underlay)}
          hitSlop={EXACT_HIT_SLOP}
          onPress={onClose}
          style={styles.headerButton}
          testID="ledger-drawer-close"
        >
          <Icon color={theme.text.basic} name="X" size={24} />
        </CustomPressable>
        <CustomPressable
          accessibilityLabel={t('permission.openSettings')}
          accessibilityRole="button"
          android_ripple={circularIconRipple(theme.role.underlay)}
          hitSlop={EXACT_HIT_SLOP}
          onPress={openSettings}
          style={styles.headerButton}
          testID="ledger-drawer-settings"
        >
          <Icon color={theme.text.basic} name="Gear" size={24} />
        </CustomPressable>
      </View>
      {user === null ? null : (
        <CustomPressable
          accessibilityLabel={t('settings.profileSection')}
          accessibilityRole="button"
          onPress={openProfile}
          style={styles.profile}
          testID="ledger-drawer-profile"
        >
          <Image
            source={
              user.avatar === null
                ? require('../../../assets/profile/mask.png')
                : {uri: user.avatar}
            }
            style={styles.avatar}
          />
          <View style={styles.profileCopy}>
            <Typography.Heading4 $fontWeight="bold" numberOfLines={1}>
              {user.displayName}
            </Typography.Heading4>
            <Typography.Body4
              numberOfLines={1}
              style={{color: theme.text.placeholder}}
            >
              {user.handle === null ? '' : `@${user.handle}`}
            </Typography.Body4>
          </View>
          <Icon color={theme.text.placeholder} name="CaretRight" size={20} />
        </CustomPressable>
      )}
      <Typography.Body2
        $fontWeight="bold"
        style={[styles.sectionTitle, {color: theme.text.label}]}
      >
        {t('ledger.myLedgers')}
      </Typography.Body2>
      <View style={styles.listFrame}>
        {ledgers === undefined ? (
          <ScreenSkeleton rows={4} />
        ) : (
          <FlashList
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="never"
            data={ledgers}
            ItemSeparatorComponent={DrawerSeparator}
            keyExtractor={(item) => item.id}
            ListFooterComponent={
              <CustomPressable
                accessibilityLabel={t('ledger.add')}
                accessibilityRole="button"
                hitSlop={EXACT_HIT_SLOP}
                onPress={addLedger}
                style={styles.addRow}
                testID="ledger-drawer-add"
              >
                <View
                  style={[
                    styles.addMark,
                    {backgroundColor: theme.bg.highlight},
                  ]}
                  testID="ledger-drawer-add-mark"
                >
                  <Icon color={theme.text.placeholder} name="Plus" size={22} />
                </View>
                <Typography.Body2
                  style={[styles.addLabel, {color: theme.text.placeholder}]}
                >
                  {t('ledger.add')}
                </Typography.Body2>
              </CustomPressable>
            }
            onEndReached={() => {
              if (ledgerPaginationStatus === 'CanLoadMore') loadMoreLedgers();
            }}
            onEndReachedThreshold={0.6}
            renderItem={renderItem}
            testID="ledger-drawer-list"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeMark: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 2,
    bottom: -1,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 18,
  },
  addMark: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  addRow: {
    borderRadius: 16,
    marginHorizontal: 24,
    marginVertical: 12,
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 14,
    minHeight: 56,
    paddingVertical: 6,
  },
  addLabel: {flex: 1},
  avatar: {borderRadius: 34, height: 68, width: 68},
  header: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 4,
    width: '100%',
  },
  headerButton: {
    ...CIRCULAR_ICON_TARGET,
  },
  ledgerCopy: {flex: 1, gap: 4},
  ledgerRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 14,
    minHeight: 80,
    paddingHorizontal: 24,
    width: '100%',
  },
  listContent: {paddingHorizontal: 0},
  listFrame: {flex: 1},
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 112,
    paddingHorizontal: 24,
  },
  profileCopy: {flex: 1, gap: 4},
  root: {flex: 1},
  sectionTitle: {paddingBottom: 8, paddingHorizontal: 24, paddingTop: 12},
  separator: {height: StyleSheet.hairlineWidth},
  separatorInset: {paddingLeft: 82},
});
