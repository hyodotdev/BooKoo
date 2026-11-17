import type {
  ProductSubscriptionAndroid,
  ProductSubscriptionIOS,
  SubscriptionOffer,
} from 'expo-iap';
import {subscriptionPlans} from '~/features/subscription/plans';

const ios: ProductSubscriptionIOS = {
  id: 'dev.hyo.bookoo.pro.annual',
  type: 'subs',
  platform: 'ios',
  title: 'Annual',
  description: '',
  displayNameIOS: 'Annual',
  displayPrice: '₩39,000',
  currency: 'KRW',
  introductoryPricePaymentModeIOS: 'free-trial',
  isFamilyShareableIOS: false,
  jsonRepresentationIOS: '{}',
  typeIOS: 'auto-renewable-subscription',
};
function offer(
  basePlan: string,
  token: string,
  trial = false,
): SubscriptionOffer {
  return {
    id: trial ? 'trial-7d' : basePlan,
    type: 'introductory',
    price: 29.99,
    displayPrice: trial ? 'Free' : '$29.99',
    basePlanIdAndroid: basePlan,
    offerTokenAndroid: token,
    pricingPhasesAndroid: {
      pricingPhaseList: [
        ...(trial
          ? [
              {
                billingCycleCount: 1,
                billingPeriod: 'P7D',
                formattedPrice: 'Free',
                priceAmountMicros: '0',
                priceCurrencyCode: 'USD',
                recurrenceMode: 2,
              },
            ]
          : []),
        {
          billingCycleCount: 0,
          billingPeriod: 'P1Y',
          formattedPrice: '$29.99',
          priceAmountMicros: '29990000',
          priceCurrencyCode: 'USD',
          recurrenceMode: 1,
        },
      ],
    },
  };
}
const android: ProductSubscriptionAndroid = {
  id: 'pro',
  type: 'subs',
  platform: 'android',
  title: 'Pro',
  description: '',
  nameAndroid: 'Pro',
  displayPrice: '$29.99',
  currency: 'USD',
  subscriptionOffers: [
    offer('annual', 'base'),
    offer('annual', 'trial', true),
    offer('monthly', 'monthly'),
  ],
};
it('uses native localized Apple price and rejects unknown products', () => {
  expect(subscriptionPlans([ios, {...ios, id: 'foreign'}])).toEqual([
    {
      identifier: 'annual',
      product: {identifier: ios.id, priceString: '₩39,000'},
    },
  ]);
});
it('selects an eligible Play trial token while displaying its recurring price', () => {
  expect(
    subscriptionPlans([android]).find((plan) => plan.identifier === 'annual'),
  ).toEqual({
    identifier: 'annual',
    product: {identifier: 'pro', priceString: '$29.99'},
    offerToken: 'trial',
    introductoryPhases: [
      {priceString: 'Free', duration: {count: 7, unit: 'day'}},
    ],
  });
});
it('uses the base offer for returning users and omits plans without purchase tokens', () => {
  expect(
    subscriptionPlans([
      {
        ...android,
        subscriptionOffers: [offer('annual', 'base'), offer('monthly', '')],
      },
    ]),
  ).toEqual([
    {
      identifier: 'annual',
      product: {identifier: 'pro', priceString: '$29.99'},
      offerToken: 'base',
    },
  ]);
});

it('does not select an introductory offer whose duration cannot be disclosed', () => {
  const invalid = offer('annual', 'trial', true);
  invalid.pricingPhasesAndroid!.pricingPhaseList[0].billingPeriod = 'invalid';
  expect(
    subscriptionPlans([
      {...android, subscriptionOffers: [invalid, offer('annual', 'base')]},
    ])[0].offerToken,
  ).toBe('base');
});

it('keeps a repeated introductory price per cycle rather than as a total price', () => {
  const discounted = offer('annual', 'discount', true);
  Object.assign(discounted.pricingPhasesAndroid!.pricingPhaseList[0], {
    billingPeriod: 'P1M',
    billingCycleCount: 3,
    formattedPrice: '$5.00',
    priceAmountMicros: '5000000',
  });
  expect(
    subscriptionPlans([{...android, subscriptionOffers: [discounted]}])[0]
      .introductoryPhases,
  ).toEqual([
    {priceString: '$5.00', duration: {count: 1, unit: 'month'}, cycles: 3},
  ]);
});

const appleOffer: SubscriptionOffer = {
  id: 'intro',
  type: 'introductory',
  price: 0,
  displayPrice: '$0.00',
  paymentMode: 'free-trial',
  period: {unit: 'week', value: 1},
  periodCount: 1,
};
const appleTrial: ProductSubscriptionIOS = {
  ...ios,
  subscriptionGroupIdIOS: 'store-group',
  subscriptionOffers: [appleOffer],
};
it('discloses Apple StoreKit automatic trial and suppresses it for ineligible accounts', () => {
  expect(
    subscriptionPlans([appleTrial], new Map([['store-group', true]]))[0]
      .introductoryPhases,
  ).toEqual([{priceString: '$0.00', duration: {unit: 'week', count: 1}}]);
  expect(
    subscriptionPlans([appleTrial], new Map([['store-group', false]]))[0]
      .introductoryPhases,
  ).toBeUndefined();
  expect(subscriptionPlans([appleTrial])[0].conditionalIntro).toBe(true);
});
it('keeps Apple repeated and up-front prices faithful to native payment mode', () => {
  const paid = {
    ...appleOffer,
    price: 5,
    displayPrice: '$5.00',
    period: {unit: 'month' as const, value: 1},
    periodCount: 3,
  };
  expect(
    subscriptionPlans([
      {
        ...appleTrial,
        subscriptionOffers: [{...paid, paymentMode: 'pay-as-you-go'}],
      },
    ])[0].introductoryPhases,
  ).toEqual([
    {priceString: '$5.00', duration: {unit: 'month', count: 1}, cycles: 3},
  ]);
  expect(
    subscriptionPlans([
      {
        ...appleTrial,
        subscriptionOffers: [{...paid, paymentMode: 'pay-up-front'}],
      },
    ])[0].introductoryPhases,
  ).toEqual([{priceString: '$5.00', duration: {unit: 'month', count: 3}}]);
});
it('cannot launch an automatic Apple intro whose period is malformed', () => {
  expect(
    subscriptionPlans([
      {
        ...appleTrial,
        subscriptionOffers: [
          {...appleOffer, period: {unit: 'unknown', value: 1}},
        ],
      },
    ]),
  ).toEqual([]);
});
