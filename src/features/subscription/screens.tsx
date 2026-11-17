import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {StyleSheet, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {CustomPressable, Typography, useCPK} from 'cpk-ui';
import type {OfferPhase, SubscriptionPlan} from './plans';

import {
  ANNUAL_PACKAGE_ID,
  isPremiumCapability,
  placementFor,
  type PremiumCapability,
} from '@shared/entitlements';
import {BookooLoading} from '~/components/uis/BookooLoading';
import {SelectionRadio} from '~/components/uis/SelectionRadio';
import {
  SettingsBottomAction,
  SettingsDivider,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsStatus,
} from '~/features/settings/ui';
import {t, tCount} from '~/utils/i18n';
import {type PurchaseOutcome, useSubscription} from './provider';
import {trackPaywallShown} from '~/features/growth/events';

const DEFAULT_CAPABILITY: PremiumCapability = 'SECOND_SHARED_LEDGER';

function offerDuration({count, unit}: OfferPhase['duration']): string {
  switch (unit) {
    case 'day':
      return tCount('subscription.offerDays', count);
    case 'week':
      return tCount('subscription.offerWeeks', count);
    case 'month':
      return tCount('subscription.offerMonths', count);
    case 'year':
      return tCount('subscription.offerYears', count);
  }
}

function offerCopy(plan: SubscriptionPlan): string | null {
  if (!plan.introductoryPhases?.length) return null;
  const phases = plan.introductoryPhases
    .map((phase) =>
      (phase.cycles ?? 1) > 1
        ? t('subscription.offerRepeatedPhase', {
            price: phase.priceString,
            duration: offerDuration(phase.duration),
            cycles: phase.cycles ?? 1,
          })
        : t('subscription.offerPhase', {
            price: phase.priceString,
            duration: offerDuration(phase.duration),
          }),
    )
    .join(', ');
  const copy = t('subscription.offerRenewal', {
    phases,
    price: plan.product.priceString,
    period:
      plan.identifier === ANNUAL_PACKAGE_ID
        ? t('subscription.perYear')
        : t('subscription.perMonth'),
  });
  return plan.conditionalIntro
    ? t('subscription.offerEligibility', {offer: copy})
    : copy;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function outcomeCopy(outcome: PurchaseOutcome): string | null {
  switch (outcome.kind) {
    case 'PURCHASED':
      return t('subscription.purchaseSuccess');
    case 'ALREADY_SUBSCRIBED':
      return t('subscription.alreadyOwned');
    case 'PENDING':
      return t('subscription.purchasePending');
    case 'CONFIRMATION_BLOCKED':
      return outcome.blocker === 'TEST_ACCOUNT_REQUIRED'
        ? t('subscription.testAccountRequired')
        : t('subscription.accountLinkRequired');
    case 'NOTHING_TO_RESTORE':
      return t('subscription.nothingToRestore');
    case 'FAILED':
    case 'UNAVAILABLE':
      return t('subscription.purchaseFailed');
    case 'CANCELLED':
      return null;
  }
}

function PlanRow({
  disabled,
  onSelect,
  pkg,
  selected,
}: {
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly pkg: SubscriptionPlan;
  readonly selected: boolean;
}): ReactElement {
  const {theme} = useCPK();
  const annual = pkg.identifier === ANNUAL_PACKAGE_ID;
  const title = annual ? t('subscription.annual') : t('subscription.monthly');

  return (
    <CustomPressable
      accessibilityLabel={`${title}, ${pkg.product.priceString}`}
      accessibilityRole="radio"
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={onSelect}
      style={[
        styles.plan,
        {
          backgroundColor: selected ? theme.bg.highlight : theme.bg.basic,
        },
      ]}
    >
      <SelectionRadio selected={selected} />
      <View style={styles.planCopy}>
        <Typography.Body2 $fontWeight="bold">{title}</Typography.Body2>
        <Typography.Body4 style={{color: theme.text.placeholder}}>
          {annual ? t('subscription.perYear') : t('subscription.perMonth')}
        </Typography.Body4>
      </View>
      <Typography.Heading4 $fontWeight="bold">
        {pkg.product.priceString}
      </Typography.Heading4>
    </CustomPressable>
  );
}

export function ProScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{capability?: string | string[]}>();
  const subscription = useSubscription();
  const {loadPackages} = subscription;
  const {theme} = useCPK();
  const mountedRef = useRef(false);
  const [phase, setPhase] = useState<
    | {kind: 'fallback'}
    | Extract<PurchaseOutcome, {kind: 'PENDING' | 'CONFIRMATION_BLOCKED'}>
  >({kind: 'fallback'});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const requested = first(params.capability);
  const capability = isPremiumCapability(requested)
    ? requested
    : DEFAULT_CAPABILITY;

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFallback = useCallback(
    async (outcome?: PurchaseOutcome): Promise<void> => {
      if (!mountedRef.current) return;
      if (outcome?.kind === 'PENDING') {
        setMessage(null);
        setPhase(outcome);
        return;
      }
      setPhase({kind: 'fallback'});
      setMessage(outcome === undefined ? null : outcomeCopy(outcome));
      setCatalogLoading(true);
      await loadPackages(capability);
      if (mountedRef.current) setCatalogLoading(false);
    },
    [capability, loadPackages],
  );

  const exposureRecorded = useRef(false);

  useEffect(() => {
    if (
      !subscription.canPurchase ||
      subscription.isActive ||
      subscription.isLoading
    )
      return;
    if (!exposureRecorded.current) {
      exposureRecorded.current = true;
      trackPaywallShown(placementFor(capability));
    }
    void loadPackages(capability).finally(() => {
      if (mountedRef.current) setCatalogLoading(false);
    });
  }, [
    capability,
    loadPackages,
    subscription.canPurchase,
    subscription.isActive,
    subscription.isLoading,
  ]);

  useEffect(() => {
    if (phase.kind !== 'fallback' && subscription.isActive) close();
  }, [close, phase, subscription.isActive]);

  const packages = useMemo(
    () =>
      [...subscription.packages].sort((left, right) =>
        left.identifier === ANNUAL_PACKAGE_ID
          ? -1
          : right.identifier === ANNUAL_PACKAGE_ID
            ? 1
            : 0,
      ),
    [subscription.packages],
  );

  const effectiveSelectedId = packages.some(
    (pkg) => pkg.identifier === selectedId,
  )
    ? selectedId
    : (packages.find((pkg) => pkg.identifier === ANNUAL_PACKAGE_ID)
        ?.identifier ?? packages[0]?.identifier);
  const selectedPackage = packages.find(
    (pkg) => pkg.identifier === effectiveSelectedId,
  );
  const annualSelected = selectedPackage?.identifier === ANNUAL_PACKAGE_ID;
  const selectedOfferCopy = selectedPackage ? offerCopy(selectedPackage) : null;

  const handleOutcome = useCallback(
    (outcome: PurchaseOutcome): void => {
      if (!mountedRef.current) return;
      setMessage(
        outcome.kind === 'PENDING' || outcome.kind === 'CONFIRMATION_BLOCKED'
          ? null
          : outcomeCopy(outcome),
      );
      if (outcome.kind === 'PENDING' || outcome.kind === 'CONFIRMATION_BLOCKED')
        setPhase(outcome);
      else if (outcome.kind === 'NOTHING_TO_RESTORE')
        setPhase({kind: 'fallback'});
      if (outcome.kind === 'PURCHASED') close();
    },
    [close],
  );

  const purchase = (): void => {
    if (busy || selectedPackage === undefined) return;
    setBusy(true);
    setMessage(null);
    void subscription
      .purchase(selectedPackage)
      .then(handleOutcome)
      .finally(() => {
        if (mountedRef.current) setBusy(false);
      });
  };

  const restore = (): void => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    void subscription
      .restore()
      .then(handleOutcome)
      .finally(() => {
        if (mountedRef.current) setBusy(false);
      });
  };

  const manage = (): void => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    void subscription
      .manage()
      .then((outcome) => {
        if (!mountedRef.current) return;
        if (outcome.kind !== 'CLOSED')
          setMessage(t('subscription.managementUnavailable'));
      })
      .finally(() => {
        if (mountedRef.current) setBusy(false);
      });
  };

  if (subscription.isLoading) {
    return (
      <View style={[styles.opening, {backgroundColor: theme.bg.basic}]}>
        <BookooLoading testID="pro-paywall-loading" variant="screen" />
      </View>
    );
  }

  const management = (
    <SettingsSection>
      <SettingsRow
        disabled={!subscription.canManage || busy}
        icon="CreditCard"
        loading={busy}
        onPress={manage}
        title={t('subscription.manage')}
      />
    </SettingsSection>
  );
  const restoreRow = (
    <SettingsRow
      disabled={!subscription.canPurchase || busy}
      icon="ArrowCounterClockwise"
      loading={busy}
      onPress={restore}
      title={t('subscription.restore')}
    />
  );

  if (subscription.isActive) {
    return (
      <SettingsPage>
        <SettingsSection>
          <SettingsStatus
            icon="CheckCircleFill"
            title={t('subscription.purchaseSuccess')}
            tone="success"
          />
        </SettingsSection>
        {management}
        <SettingsSection>{restoreRow}</SettingsSection>
        {message === null ? null : (
          <Typography.Body3
            accessibilityLiveRegion="polite"
            style={styles.message}
          >
            {message}
          </Typography.Body3>
        )}
      </SettingsPage>
    );
  }

  if (phase.kind !== 'fallback') {
    return (
      <SettingsPage>
        {subscription.hasStoreSubscription ||
        phase.kind === 'CONFIRMATION_BLOCKED'
          ? management
          : null}
        <SettingsSection>
          <SettingsStatus
            icon="Clock"
            title={
              phase.kind === 'CONFIRMATION_BLOCKED'
                ? (outcomeCopy(phase) ?? t('subscription.purchasePending'))
                : t('subscription.purchasePending')
            }
          />
          <SettingsDivider />
          {restoreRow}
        </SettingsSection>
        {message === null ? null : (
          <Typography.Body3
            accessibilityLiveRegion="polite"
            style={styles.message}
          >
            {message}
          </Typography.Body3>
        )}
      </SettingsPage>
    );
  }

  const footer =
    selectedPackage === undefined ? undefined : (
      <View>
        {selectedOfferCopy ? (
          <Typography.Body4 style={[styles.legal, {color: theme.text.label}]}>
            {selectedOfferCopy}
          </Typography.Body4>
        ) : null}
        <SettingsBottomAction
          disabled={!subscription.canPurchase || busy || catalogLoading}
          loading={busy}
          onPress={purchase}
          text={
            annualSelected
              ? t('subscription.continueAnnual')
              : t('subscription.continueMonthly')
          }
        />
      </View>
    );

  return (
    <SettingsPage footer={footer}>
      {subscription.hasStoreSubscription ? management : null}
      {catalogLoading && subscription.canPurchase ? (
        <SettingsSection>
          <BookooLoading testID="pro-catalog-loading" variant="section" />
        </SettingsSection>
      ) : packages.length > 0 ? (
        <SettingsSection>
          <View accessibilityRole="radiogroup">
            {packages.map((pkg, index) => (
              <View key={pkg.identifier}>
                <PlanRow
                  disabled={busy}
                  onSelect={() => {
                    setMessage(null);
                    setSelectedId(pkg.identifier);
                  }}
                  pkg={pkg}
                  selected={pkg.identifier === effectiveSelectedId}
                />
                {index === packages.length - 1 ? null : <SettingsDivider />}
              </View>
            ))}
          </View>
        </SettingsSection>
      ) : (
        <SettingsSection>
          <SettingsStatus
            icon="WifiSlash"
            title={t('subscription.plansUnavailableTitle')}
          />
          <SettingsDivider />
          <SettingsRow
            disabled={!subscription.canPurchase || busy || catalogLoading}
            icon="ArrowClockwise"
            onPress={() => void loadFallback()}
            title={t('subscription.reloadPlans')}
          />
        </SettingsSection>
      )}

      {message === null ? null : (
        <Typography.Body3
          accessibilityLiveRegion="polite"
          style={[styles.message, {color: theme.text.label}]}
        >
          {message}
        </Typography.Body3>
      )}

      <SettingsSection>{restoreRow}</SettingsSection>

      <Typography.Body4 style={[styles.legal, {color: theme.text.placeholder}]}>
        {t('subscription.renewalDisclosure')}
      </Typography.Body4>
      <View style={styles.legalLinks}>
        <CustomPressable
          accessibilityRole="link"
          onPress={() => router.navigate('/settings/legal/terms')}
          style={styles.legalLink}
        >
          <Typography.Body4 style={{color: theme.role.link}}>
            {t('subscription.terms')}
          </Typography.Body4>
        </CustomPressable>
        <CustomPressable
          accessibilityRole="link"
          onPress={() => router.navigate('/settings/legal/privacy')}
          style={styles.legalLink}
        >
          <Typography.Body4 style={{color: theme.role.link}}>
            {t('subscription.privacy')}
          </Typography.Body4>
        </CustomPressable>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  legal: {lineHeight: 18, paddingHorizontal: 10, textAlign: 'center'},
  legalLink: {flexShrink: 1, maxWidth: '100%'},
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  message: {paddingHorizontal: 8, textAlign: 'center'},
  opening: {flex: 1},
  plan: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  planCopy: {flex: 1, gap: 2},
});
