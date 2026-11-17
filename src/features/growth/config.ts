import Constants from 'expo-constants';

/**
 * Layers growth analytics configuration.
 *
 * RootProvider includes GrowthAnalyticsProvider. A configured app id mounts the
 * SDK for route attribution and bounded paywall exposure; an absent id leaves
 * it inactive. No trial/paid conversion funnel is claimed after the RevenueCat
 * bridge retirement. Enabling new collection remains an explicit product and
 * privacy decision, not a side effect of this billing migration.
 *
 * What is never sent: ledger titles, amounts, memos, categories, photos,
 * locations and member lists — the same rule `docs/product/MONETIZATION.md`
 * sets for ad event payloads.
 *
 * Explicit app events contain bounded paywall placement identifiers. The former
 * subscription-account bridge is removed; account binding stays on the
 * authenticated Convex/IAPKit path.
 *
 * Screens are recorded by expo-router *pattern* only. That is not the SDK's
 * default — see `usePatternPath` in `./provider`, which exists because the
 * default sends the resolved path. An earlier version of this comment claimed
 * the pattern was automatic; it was not, and BooKoo 1.0.2 shipped resolved
 * paths to Layers because of it.
 */

const APP_ID = process.env.EXPO_PUBLIC_LAYERS_APP_ID ?? '';

type LayersEnvironment = 'development' | 'staging' | 'production';

const stage = (): unknown => Constants.expoConfig?.extra?.stage;

/**
 * The Layers app id for this build, or null when none was configured.
 *
 * Returning null is what keeps the provider unmounted; initialising the SDK
 * with an empty id would leave it retrying an ingest call that can never
 * succeed.
 */
export function layersAppId(): string | null {
  return APP_ID.length === 0 ? null : APP_ID;
}

/**
 * Which Layers environment this build reports into.
 *
 * `preview` maps to `staging` so internal QA installs never land in the
 * production attribution numbers the Growth Loop is read from.
 */
export function layersEnvironment(): LayersEnvironment {
  if (__DEV__ || stage() === 'development') return 'development';
  if (stage() === 'preview') return 'staging';

  return 'production';
}

export function isGrowthAnalyticsConfigured(): boolean {
  return layersAppId() !== null;
}
