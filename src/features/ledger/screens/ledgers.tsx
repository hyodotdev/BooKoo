import {LEGAL_ACKNOWLEDGEMENT} from '@shared/legal';
import type {ReactElement} from 'react';
import {memo, useCallback, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useMutation} from 'convex/react';
import {CustomPressable, Icon, Typography, useCPK} from 'cpk-ui';
import {Redirect, useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {shouldFinishLedgerOnboarding} from '~/features/auth/onboardingNavigation';
import {useSession} from '~/features/auth/session';
import {useLocale} from '~/hooks/useLocale';
import {premiumRefusalOf} from '~/features/subscription/errors';
import {LedgerMark, ScreenSkeleton} from '../ui';
import {LEDGER_ACCENTS, type LedgerColorKey} from '~/theme/ledgerAccent';
import {t, tCount} from '~/utils/i18n';
import {leaveCurrentScreen} from '~/utils/navigation';
import {useActiveLedger} from '../useActiveLedger';
import type {LedgerRow} from '../types';
import {LedgerForm} from '../ledgerForm';

export const LedgerListRow = memo(function LedgerListRow({
  active,
  item,
  onPress,
}: {
  readonly active: boolean;
  readonly item: LedgerRow;
  readonly onPress: (ledgerId: LedgerRow['id']) => void;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const accent =
    LEDGER_ACCENTS[item.colorKey as LedgerColorKey][
      themeType === 'dark' ? 'dark' : 'light'
    ];
  const metadata = `${tCount('ledger.memberCount', item.memberCount)} · ${
    item.baseCurrency
  }${item.archivedAt === null ? '' : ` · ${t('screen.archived')}`}`;

  return (
    <CustomPressable
      accessibilityLabel={`${item.title}, ${metadata}`}
      accessibilityRole="radio"
      accessibilityState={{checked: active}}
      onPress={() => onPress(item.id)}
      testID={`ledger-list-row-${item.title}`}
      style={[
        styles.ledgerRow,
        {
          backgroundColor: active ? accent.subtle : theme.bg.basic,
        },
      ]}
    >
      <View
        style={[
          styles.activeRail,
          {backgroundColor: active ? accent.base : 'transparent'},
        ]}
      />
      <LedgerMark colorKey={item.colorKey} iconKey={item.iconKey} />
      <View style={styles.ledgerCopy}>
        <Typography.Body2
          $fontWeight="bold"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {item.title}
        </Typography.Body2>
        <Typography.Body4 numberOfLines={1} style={{color: theme.text.label}}>
          {metadata}
        </Typography.Body4>
      </View>
      <Icon
        color={active ? accent.text : theme.text.placeholder}
        name={active ? 'CheckCircleFill' : 'CaretRight'}
        size={active ? 22 : 18}
      />
    </CustomPressable>
  );
});

export function LedgersScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
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
      router.replace('/(app)/(tabs)/(root)');
    },
    [router, setActiveLedgerId],
  );
  const renderItem = useCallback(
    ({item}: {item: LedgerRow}) => (
      <LedgerListRow
        active={item.id === activeLedger?.id}
        item={item}
        onPress={selectLedger}
      />
    ),
    [activeLedger?.id, selectLedger],
  );
  if (ledgers === undefined)
    return (
      <View style={[styles.screen, {backgroundColor: theme.bg.paper}]}>
        <ScreenSkeleton rows={6} />
      </View>
    );
  if (ledgers.length === 0) return <Redirect href="/(app)/(tabs)/(root)" />;
  return (
    <View style={[styles.screen, {backgroundColor: theme.bg.paper}]}>
      <View
        style={[
          styles.listFrame,
          {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
        ]}
      >
        <FlashList
          contentInsetAdjustmentBehavior="never"
          data={ledgers}
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, {backgroundColor: theme.role.divider}]}
            />
          )}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (ledgerPaginationStatus === 'CanLoadMore') loadMoreLedgers();
          }}
          onEndReachedThreshold={0.6}
          renderItem={renderItem}
        />
      </View>
    </View>
  );
}

export function NewLedgerScreen(): ReactElement {
  const router = useRouter();
  const {onboardingStep} = useSession();
  const {locale} = useLocale();
  const {setActiveLedgerId} = useActiveLedger();
  const createLedger = useMutation(api.ledgers.mutations.create);
  const completeLedgerStep = useMutation(api.user.mutations.completeLedgerStep);
  const createdLedgerId = useRef<string | null>(null);
  return (
    <LedgerForm
      onBack={() => void leaveCurrentScreen(router, '/ledgers')}
      onSubmit={async (draft) => {
        try {
          let ledgerId = createdLedgerId.current;
          if (ledgerId === null) {
            const result = await createLedger({
              title: draft.title,
              description: draft.description,
              colorKey: draft.colorKey,
              iconKey: draft.iconKey,
              baseCurrency: draft.baseCurrency,
            });
            ledgerId = result.ledgerId;
            createdLedgerId.current = ledgerId;
            setActiveLedgerId(ledgerId);
          }
          if (shouldFinishLedgerOnboarding(onboardingStep)) {
            await completeLedgerStep({
              ...LEGAL_ACKNOWLEDGEMENT,
              skipped: false,
              termsAccepted: true,
              privacyAcknowledged: true,
              age14Plus: true,
              locale,
            });
          }
          router.replace('/(app)/(tabs)/(root)');
        } catch (error) {
          const refusal = premiumRefusalOf(error);
          if (refusal === null) throw error;
          router.replace({
            pathname: '/pro',
            params: {capability: refusal.capability},
          });
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  activeRail: {
    borderRadius: 2,
    bottom: 12,
    left: 0,
    position: 'absolute',
    top: 12,
    width: 3,
  },
  ledgerCopy: {flex: 1, gap: 3},
  ledgerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    position: 'relative',
  },
  listFrame: {
    alignSelf: 'center',
    backgroundColor: '#00000000',
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    marginVertical: 16,
    maxWidth: 720,
    overflow: 'hidden',
    width: '100%',
  },
  screen: {flex: 1, paddingHorizontal: 16},
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
  },
});
