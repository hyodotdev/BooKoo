import {shouldShowFreeAd} from '@shared/ads';

describe('free-tier advertising', () => {
  it('shows only after both subscription checks resolve as free', () => {
    const free = {
      adsReady: true,
      ledgerPro: false,
      viewerPro: false,
      viewerSubscriptionLoading: false,
    } as const;

    expect(shouldShowFreeAd(free)).toBe(true);
    expect(shouldShowFreeAd({...free, adsReady: false})).toBe(false);
    expect(shouldShowFreeAd({...free, ledgerPro: true})).toBe(false);
    expect(shouldShowFreeAd({...free, ledgerPro: undefined})).toBe(false);
    expect(shouldShowFreeAd({...free, viewerPro: true})).toBe(false);
    expect(
      shouldShowFreeAd({...free, viewerSubscriptionLoading: true}),
    ).toBe(false);
  });

});
