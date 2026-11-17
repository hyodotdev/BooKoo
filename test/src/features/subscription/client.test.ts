import * as IAP from 'expo-iap';
import {Platform} from 'react-native';
import {
  isPurchasesConfigured,
  requestPlan,
  getStorePurchases,
  getPendingStorePurchases,
  loadStorePlans,
} from '~/features/subscription/client';
jest.mock('expo-iap');
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
it('checks the native subscription group and retains conditional terms if eligibility fails', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(IAP.fetchProducts).mockResolvedValueOnce([
    {
      id: 'dev.hyo.bookoo.pro.annual',
      platform: 'ios',
      type: 'subs',
      title: 'Annual',
      description: '',
      currency: 'USD',
      displayPrice: '$29.99',
      displayNameIOS: 'Annual',
      isFamilyShareableIOS: false,
      jsonRepresentationIOS: '{}',
      introductoryPricePaymentModeIOS: 'free-trial',
      typeIOS: 'auto-renewable-subscription',
      subscriptionGroupIdIOS: 'actual-store-group',
      subscriptionOffers: [
        {
          id: 'intro',
          type: 'introductory',
          price: 0,
          displayPrice: '$0.00',
          paymentMode: 'free-trial',
          periodCount: 1,
          period: {unit: 'week', value: 1},
        },
      ],
    },
  ]);
  jest
    .mocked(IAP.isEligibleForIntroOfferIOS)
    .mockRejectedValueOnce(new Error('StoreKit unavailable'));
  const plans = await loadStorePlans();
  expect(IAP.isEligibleForIntroOfferIOS).toHaveBeenCalledWith(
    'actual-store-group',
  );
  expect(plans[0].conditionalIntro).toBe(true);
  expect(plans[0].introductoryPhases).toHaveLength(1);
});
it('passes the selected Play offer to OpenIAP', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await requestPlan({
    identifier: 'annual',
    product: {identifier: 'pro', priceString: '$29.99'},
    offerToken: 'annual-offer',
  });
  expect(IAP.requestPurchase).toHaveBeenCalledWith({
    type: 'subs',
    request: {
      google: {
        skus: ['pro'],
        subscriptionOffers: [{sku: 'pro', offerToken: 'annual-offer'}],
      },
    },
  });
});
it('leaves StoreKit transactions unfinished until backend verification', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await requestPlan({
    identifier: 'monthly',
    product: {identifier: 'dev.hyo.bookoo.pro.monthly', priceString: '$3.99'},
  });
  expect(IAP.requestPurchase).toHaveBeenCalledWith({
    type: 'subs',
    request: {
      apple: {
        sku: 'dev.hyo.bookoo.pro.monthly',
        andDangerouslyFinishTransactionAutomatically: false,
      },
    },
  });
});
it('keeps web available without enabling native purchases', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  expect(isPurchasesConfigured()).toBe(false);
});

it('restores active StoreKit ownership without re-emitting history callbacks', async () => {
  await getStorePurchases();
  expect(IAP.getAvailablePurchases).toHaveBeenCalledWith({
    onlyIncludeActiveItemsIOS: true,
    alsoPublishToEventListenerIOS: false,
  });
});
it('uses unfinished StoreKit transactions for automatic crash recovery', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await getPendingStorePurchases();
  expect(IAP.getPendingTransactionsIOS).toHaveBeenCalled();
  expect(IAP.getAvailablePurchases).not.toHaveBeenCalled();
});
