/* eslint-env jest */

import {forwardRef, useImperativeHandle} from 'react';
import {View} from 'react-native';

export const AdsConsentPrivacyOptionsRequirementStatus = {
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
  UNKNOWN: 'UNKNOWN',
} as const;
export const MaxAdContentRating = {G: 'G'} as const;
export const BannerAdSize = {
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
  FULL_BANNER: 'FULL_BANNER',
} as const;
export const TestIds = {
  ADAPTIVE_BANNER: 'jest-adaptive-banner',
  BANNER: 'jest-banner',
} as const;
export const RevenuePrecisions = {
  UNKNOWN: 0,
  ESTIMATED: 1,
  PUBLISHER_PROVIDED: 2,
  PRECISE: 3,
} as const;

export const AdsConsent = {
  gatherConsent: jest.fn(async () => ({
    canRequestAds: true,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  })),
  showPrivacyOptionsForm: jest.fn(async () => ({
    canRequestAds: true,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  })),
};

const instance = {
  initialize: jest.fn(async () => []),
  setRequestConfiguration: jest.fn(async () => undefined),
};

export default jest.fn(() => instance);
export const bannerLoad = jest.fn();
export const BannerAd = forwardRef(function MockBannerAd(
  props: Record<string, unknown>,
  ref,
) {
  useImperativeHandle(ref, () => ({load: bannerLoad}));
  return <View {...props} testID="mock-banner-ad" />;
});
export const useForeground = jest.fn();

export interface PaidEvent {
  readonly currency: string;
  readonly precision: number;
  readonly value: number;
}
