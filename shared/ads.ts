/**
 * Pure advertising decisions shared by the app and tests.
 *
 * BooKoo never guesses while subscription state is loading: a paid ledger
 * briefly seeing an ad is worse than a free ledger briefly seeing none.
 */

export function shouldShowFreeAd({
  adsReady,
  ledgerPro,
  viewerPro,
  viewerSubscriptionLoading,
}: {
  readonly adsReady: boolean;
  readonly ledgerPro: boolean | undefined;
  readonly viewerPro: boolean;
  readonly viewerSubscriptionLoading: boolean;
}): boolean {
  return (
    adsReady && !viewerSubscriptionLoading && !viewerPro && ledgerPro === false
  );
}
