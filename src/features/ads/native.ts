import {adAppKey, isAdDebugEnabled} from './config';

// UMP is retained only for consent. AdMob initialization and ad requests are
// deliberately absent from this app-facing module contract.
export type GoogleConsentModule = Pick<
  typeof import('react-native-google-mobile-ads'),
  'AdsConsent' | 'AdsConsentPrivacyOptionsRequirementStatus'
>;
export type LevelPlayModule = typeof import('unity-levelplay-mediation');

let cachedConsent: GoogleConsentModule | null | undefined;
let cachedLevelPlay: LevelPlayModule | null | undefined;
let initialization: Promise<void> | null = null;

/**
 * Older development clients may predate the required native modules.
 * Treat that mismatch exactly like an unavailable ad runtime so an ad can
 * never prevent the ledger itself from opening.
 */
export function googleConsentModule(): GoogleConsentModule | null {
  if (cachedConsent !== undefined) return cachedConsent;

  try {
    // Metro still bundles this dependency for current native builds; the
    // runtime guard only catches a stale development binary.
    /* eslint-disable @typescript-eslint/no-require-imports */
    cachedConsent =
      require('react-native-google-mobile-ads') as GoogleConsentModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    cachedConsent = null;
  }

  return cachedConsent;
}

export function levelPlayModule(): LevelPlayModule | null {
  if (cachedLevelPlay !== undefined) return cachedLevelPlay;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    cachedLevelPlay = require('unity-levelplay-mediation') as LevelPlayModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    cachedLevelPlay = null;
  }
  return cachedLevelPlay;
}

/** Called only after UMP allows requests; concurrent callers share one init. */
export function initializeAdRuntime(): Promise<void> {
  if (initialization !== null) return initialization;
  const sdk = levelPlayModule();
  const appKey = adAppKey();
  if (sdk === null || appKey === null)
    return Promise.reject(new Error('LevelPlay runtime is unavailable'));

  initialization = (async (): Promise<void> => {
    // Preserve BooKoo's contextual-only policy. Unity documents this legacy
    // adapter key as its user.nonbehavioral flag, including adult opt-outs.
    await sdk.LevelPlay.setMetaData('UnityAds_coppa', ['true']);
    await sdk.LevelPlay.setMetaData('is_deviceid_optout', ['true']);
    await sdk.LevelPlayPrivacySettings.setCCPA(true);
    // Play's existing target audience is 13–15, 16–17 and 18+; do not copy
    // Martie's child-directed classification to this different product.
    await sdk.LevelPlayPrivacySettings.setCOPPA(false);
    // SDK 9.6.1 reads UMP's stored TCF/Additional Consent signals itself.
    // canRequestAds is never converted to a positive GDPR consent signal.
    if (isAdDebugEnabled()) {
      await sdk.LevelPlay.setAdaptersDebug(true);
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('LevelPlay initialization timed out')),
        30_000,
      );
      void sdk.LevelPlay.init(
        sdk.LevelPlayInitRequest.builder(appKey).build(),
        {
          onInitSuccess: () => {
            clearTimeout(timer);
            resolve();
          },
          onInitFailed: (error) => {
            clearTimeout(timer);
            reject(
              new Error(`LevelPlay initialization failed: ${error.errorCode}`),
            );
          },
        },
      ).catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  })().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
