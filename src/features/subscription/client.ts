import {Platform} from 'react-native';
import * as IAP from 'expo-iap';

import {STORE_PRODUCT_IDS} from '@shared/entitlements';
import {subscriptionPlans, type SubscriptionPlan} from './plans';

export const isPurchasesConfigured = (): boolean =>
  Platform.OS === 'ios' || Platform.OS === 'android';

let connectionTail: Promise<void> = Promise.resolve();
function enqueueConnection<T>(operation: () => Promise<T>): Promise<T> {
  const result = connectionTail.catch(() => undefined).then(operation);
  connectionTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export const openStoreConnection = (): Promise<boolean> =>
  enqueueConnection(() => IAP.initConnection());
export const closeStoreConnection = (): Promise<void> =>
  enqueueConnection(async () => {
    await IAP.endConnection();
  });

/** Active ownership only: restore must not replay expired StoreKit history. */
export const getStorePurchases = (): Promise<IAP.Purchase[]> =>
  IAP.getAvailablePurchases({
    onlyIncludeActiveItemsIOS: true,
    alsoPublishToEventListenerIOS: false,
  });

/** Crash recovery is unfinished transactions, never the complete restore list. */
export const getPendingStorePurchases = (): Promise<IAP.Purchase[]> =>
  Platform.OS === 'ios'
    ? IAP.getPendingTransactionsIOS()
    : getStorePurchases().then((purchases) =>
        purchases.filter(
          (purchase) =>
            'isAcknowledgedAndroid' in purchase &&
            purchase.isAcknowledgedAndroid === false,
        ),
      );

export async function loadStorePlans(): Promise<SubscriptionPlan[]> {
  const products = await IAP.fetchProducts({
    skus:
      Platform.OS === 'ios'
        ? [STORE_PRODUCT_IDS.iosMonthly, STORE_PRODUCT_IDS.iosAnnual]
        : [STORE_PRODUCT_IDS.androidSubscription],
    type: 'subs',
  });
  const eligibility = new Map<string, boolean>();
  if (Platform.OS === 'ios') {
    const groups = new Set(
      (products ?? []).flatMap((product) =>
        product.platform === 'ios' &&
        product.type === 'subs' &&
        product.subscriptionGroupIdIOS
          ? [product.subscriptionGroupIdIOS]
          : [],
      ),
    );
    await Promise.all(
      [...groups].map(async (group) => {
        try {
          eligibility.set(group, await IAP.isEligibleForIntroOfferIOS(group));
        } catch {
          /* Unknown eligibility renders the conditional store terms. */
        }
      }),
    );
  }
  return subscriptionPlans(products ?? [], eligibility);
}

/** A returned receipt and listener receipt share the provider's verification. */
export async function requestPlan(
  plan: SubscriptionPlan,
): Promise<IAP.Purchase | IAP.Purchase[] | null> {
  return IAP.requestPurchase({
    type: 'subs',
    request:
      Platform.OS === 'ios'
        ? {
            apple: {
              sku: plan.product.identifier,
              andDangerouslyFinishTransactionAutomatically: false,
            },
          }
        : {
            google: {
              skus: [plan.product.identifier],
              subscriptionOffers: plan.offerToken
                ? [{sku: plan.product.identifier, offerToken: plan.offerToken}]
                : [],
            },
          },
  });
}

export {IAP};
