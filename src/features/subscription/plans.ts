import type {ProductOrSubscription, SubscriptionOffer} from 'expo-iap';

import {
  ANNUAL_PACKAGE_ID,
  MONTHLY_PACKAGE_ID,
  STORE_PRODUCT_IDS,
} from '@shared/entitlements';

export interface SubscriptionPlan {
  readonly identifier: 'monthly' | 'annual';
  readonly product: {
    readonly identifier: string;
    readonly priceString: string;
  };
  readonly offerToken?: string;
  readonly introductoryPhases?: readonly OfferPhase[];
  readonly conditionalIntro?: boolean;
}

export interface OfferPhase {
  readonly priceString: string;
  readonly cycles?: number;
  readonly duration: {
    readonly count: number;
    readonly unit: 'day' | 'week' | 'month' | 'year';
  };
}

function introductoryPhases(offer: SubscriptionOffer): OfferPhase[] | null {
  const result: OfferPhase[] = [];
  for (const phase of offer.pricingPhasesAndroid?.pricingPhaseList.slice(
    0,
    -1,
  ) ?? []) {
    const period = /^P([1-9]\d*)([DWMY])$/.exec(phase.billingPeriod);
    const count = period ? Number(period[1]) : 0;
    if (
      !period ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      !Number.isSafeInteger(phase.billingCycleCount) ||
      phase.billingCycleCount <= 0 ||
      !phase.formattedPrice
    )
      return null;
    const unit =
      period[2] === 'D'
        ? 'day'
        : period[2] === 'W'
          ? 'week'
          : period[2] === 'M'
            ? 'month'
            : 'year';
    result.push({
      priceString: phase.formattedPrice,
      duration: {count, unit},
      ...(phase.billingCycleCount > 1 ? {cycles: phase.billingCycleCount} : {}),
    });
  }
  return result;
}

function appleIntroductoryPhases(
  offer: SubscriptionOffer,
): OfferPhase[] | null {
  const period = offer.period;
  const periods = offer.periodCount;
  if (
    !period ||
    period.unit === 'unknown' ||
    !Number.isSafeInteger(period.value) ||
    period.value <= 0 ||
    periods === undefined ||
    periods === null ||
    !Number.isSafeInteger(periods) ||
    periods <= 0 ||
    !offer.displayPrice ||
    !['free-trial', 'pay-as-you-go', 'pay-up-front'].includes(
      offer.paymentMode ?? '',
    )
  )
    return null;
  const count =
    offer.paymentMode === 'pay-as-you-go'
      ? period.value
      : period.value * periods;
  if (!Number.isSafeInteger(count)) return null;
  return [
    {
      priceString: offer.displayPrice,
      duration: {unit: period.unit, count},
      ...(offer.paymentMode === 'pay-as-you-go' && periods > 1
        ? {cycles: periods}
        : {}),
    },
  ];
}

/** Prices and eligible offers come from the store, never a remote paywall. */
export function subscriptionPlans(
  products: readonly ProductOrSubscription[],
  appleIntroEligibility: ReadonlyMap<string, boolean> = new Map(),
): SubscriptionPlan[] {
  return products.flatMap((product): SubscriptionPlan[] => {
    if (product.type !== 'subs') return [];
    if (product.platform === 'ios') {
      const identifier =
        product.id === STORE_PRODUCT_IDS.iosAnnual
          ? ANNUAL_PACKAGE_ID
          : product.id === STORE_PRODUCT_IDS.iosMonthly
            ? MONTHLY_PACKAGE_ID
            : null;
      const intro = product.subscriptionOffers?.find(
        (offer) => offer.type === 'introductory',
      );
      const eligibility = product.subscriptionGroupIdIOS
        ? appleIntroEligibility.get(product.subscriptionGroupIdIOS)
        : undefined;
      const phases =
        intro && eligibility !== false ? appleIntroductoryPhases(intro) : [];
      if (phases === null) return [];
      return identifier === null
        ? []
        : [
            {
              identifier,
              product: {
                identifier: product.id,
                priceString: product.displayPrice,
              },
              ...(phases.length > 0
                ? {
                    introductoryPhases: phases,
                    ...(eligibility === undefined
                      ? {conditionalIntro: true}
                      : {}),
                  }
                : {}),
            },
          ];
    }
    if (product.id !== STORE_PRODUCT_IDS.androidSubscription) return [];
    return ([MONTHLY_PACKAGE_ID, ANNUAL_PACKAGE_ID] as const).flatMap(
      (identifier): SubscriptionPlan[] => {
        const basePlanId =
          identifier === MONTHLY_PACKAGE_ID
            ? STORE_PRODUCT_IDS.androidMonthlyBasePlan
            : STORE_PRODUCT_IDS.androidAnnualBasePlan;
        const offers = product.subscriptionOffers.flatMap((offer) => {
          if (offer.basePlanIdAndroid !== basePlanId) return [];
          const phases = introductoryPhases(offer);
          return phases === null ? [] : [{offer, phases}];
        });
        const selected =
          offers.find(
            (candidate) =>
              candidate.offer.pricingPhasesAndroid?.pricingPhaseList[0]
                ?.priceAmountMicros === '0',
          ) ??
          offers.find((candidate) => candidate.offer.id === basePlanId) ??
          offers[0];
        const offer = selected?.offer;
        if (!offer?.offerTokenAndroid) return [];
        const phases = offer.pricingPhasesAndroid?.pricingPhaseList;
        const price =
          phases?.[phases.length - 1]?.formattedPrice ?? offer.displayPrice;
        return [
          {
            identifier,
            product: {identifier: product.id, priceString: price},
            offerToken: offer.offerTokenAndroid,
            ...(selected && selected.phases.length > 0
              ? {introductoryPhases: selected.phases}
              : {}),
          },
        ];
      },
    );
  });
}
