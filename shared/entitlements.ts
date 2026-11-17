/**
 * The Pro ledger subscription: identifiers, capability vocabulary, and
 * the pure entitlement predicate.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. The Expo bundle, the Convex isolate
 * and jest all import this unchanged, and the predicate must return the same
 * answer in all three. That matters here more than usual: the client uses it to
 * decide what to *draw* and the server uses it to decide what to *allow*, and a
 * disagreement between those two is a support ticket about a paid feature.
 *
 * Design source: `.notes/design/iapkit-entitlements.md`.
 * Product source: `docs/product/MONETIZATION.md`.
 *
 * No price, product identifier, or paywall copy is ever hardcoded in a screen.
 * Screens name a CAPABILITY; native store products own prices and offers.
 */

/** The single entitlement the whole product is gated on. */
export const PRO_ENTITLEMENT_ID = 'bookoo_pro';

/** BooKoo plan identifiers, mapped to native store products below. */
export const MONTHLY_PACKAGE_ID = 'monthly';
export const ANNUAL_PACKAGE_ID = 'annual';

/**
 * Store product identifiers. Present so tests and store-metadata verification
 * share one spelling with the dashboards; the native adapter requests these
 * products and derives eligible plans from the store catalog.
 */
export const STORE_PRODUCT_IDS = {
  iosMonthly: 'dev.hyo.bookoo.pro.monthly',
  iosAnnual: 'dev.hyo.bookoo.pro.annual',
  iosSubscriptionGroup: 'bookoo_pro',
  androidSubscription: 'pro',
  androidMonthlyBasePlan: 'monthly',
  androidAnnualBasePlan: 'annual',
} as const;

/**
 * What a screen asks for. Deliberately about collaboration scale — there is no
 * capability for reading, exporting or deleting your own data, because
 * `docs/product/MONETIZATION.md` §3 forbids gating those and a capability that
 * does not exist cannot be gated by accident.
 */
export const PREMIUM_CAPABILITIES = [
  'MEMBER_LIMIT',
  'SECOND_SHARED_LEDGER',
] as const;

export type PremiumCapability = (typeof PREMIUM_CAPABILITIES)[number];

/** Paywall placement ids. One per moment a paywall may appear. */
export const PAYWALL_PLACEMENT_BY_CAPABILITY = {
  MEMBER_LIMIT: 'member_limit',
  SECOND_SHARED_LEDGER: 'second_ledger',
} as const satisfies Record<PremiumCapability, string>;

export type PaywallPlacement =
  (typeof PAYWALL_PLACEMENT_BY_CAPABILITY)[PremiumCapability];

/**
 * Stored subscription state. `ACTIVE` is a claim about the last event received,
 * not about the clock — `isEntitlementActive` is what reconciles the two.
 */
export const SUBSCRIPTION_STATUSES = [
  'NONE',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'REFUNDED',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STORES = [
  'APP_STORE',
  'PLAY_STORE',
  'STRIPE',
  'PROMOTIONAL',
  'AMAZON',
  'MAC_APP_STORE',
  'UNKNOWN',
] as const;

export type SubscriptionStore = (typeof SUBSCRIPTION_STORES)[number];

export const SUBSCRIPTION_PERIOD_TYPES = [
  'NORMAL',
  'TRIAL',
  'INTRO',
  'PROMOTIONAL',
] as const;

export type SubscriptionPeriodType = (typeof SUBSCRIPTION_PERIOD_TYPES)[number];

/** The subset of a `subscribers` row the predicate needs. */
export interface EntitlementSnapshot {
  readonly status: SubscriptionStatus;
  readonly provider?: 'iapkit';
  /** Epoch ms. Absent for a lifetime or promotional grant that never expires. */
  readonly expiresAt?: number;
  /** Epoch ms the store told us billing is being retried. */
  readonly billingIssueDetectedAt?: number;
}

/** Legacy confirmed rows retain their former grace policy during migration.
 * IAPKit rows use the store's effective expiry and never receive this extension.
 */
export const BILLING_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** One deadline owner for access, projection ordering and the native expiry timer. */
export function entitlementDeadline(
  snapshot: EntitlementSnapshot,
): number | undefined {
  if (snapshot.expiresAt === undefined) return undefined;
  return (
    snapshot.expiresAt +
    (snapshot.provider !== 'iapkit' &&
    snapshot.billingIssueDetectedAt !== undefined
      ? BILLING_GRACE_MS
      : 0)
  );
}

/**
 * THE entitlement predicate. Server-authoritative when called from a mutation
 * with the real clock; presentation-only when called on the client.
 *
 * Note what is NOT here: no network call, no store lookup, no client claim. It
 * reads server state and a timestamp. That is what makes it safe to run in both
 * places and impossible to spoof from a device.
 */
export function isEntitlementActive(
  snapshot: EntitlementSnapshot | null | undefined,
  nowMs: number,
): boolean {
  if (snapshot === undefined || snapshot === null) return false;

  switch (snapshot.status) {
    case 'NONE':
    case 'EXPIRED':
    case 'REFUNDED':
    case 'PAUSED':
      return false;
    case 'ACTIVE':
      break;
  }

  const deadline = entitlementDeadline(snapshot);
  return deadline === undefined || nowMs < deadline;
}

/**
 * True when the subscription is live but will not renew — cancelled and running
 * out, or in billing retry. Drives an honest "ends on <date>" notice rather than
 * a surprise downgrade.
 */
export function isEntitlementEnding(
  snapshot:
    (EntitlementSnapshot & {readonly willRenew?: boolean}) | null | undefined,
  nowMs: number,
): boolean {
  if (!isEntitlementActive(snapshot, nowMs)) return false;
  if (snapshot === undefined || snapshot === null) return false;

  return (
    snapshot.willRenew === false ||
    snapshot.billingIssueDetectedAt !== undefined
  );
}

/** Opaque backend account id only; never send email or display names. */
export function assertUsableAppUserId(appUserId: string): void {
  if (!appUserId || appUserId.includes('@') || /\s/.test(appUserId))
    throw new Error('appUserId must be an opaque account id');
}

const PREMIUM_CAPABILITY_SET: ReadonlySet<string> = new Set(
  PREMIUM_CAPABILITIES,
);

export const isPremiumCapability = (
  value: unknown,
): value is PremiumCapability =>
  typeof value === 'string' && PREMIUM_CAPABILITY_SET.has(value);

export const placementFor = (capability: PremiumCapability): PaywallPlacement =>
  PAYWALL_PLACEMENT_BY_CAPABILITY[capability];
