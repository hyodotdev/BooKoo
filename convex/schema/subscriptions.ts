import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {timestamps} from './common';

/**
 * The Pro ledger subscription.
 *
 * Contract: `.notes/design/iapkit-entitlements.md`.
 * Product:  `docs/product/MONETIZATION.md`.
 *
 * Deliberately NO `legacyUid` / `legacyKey` here, unlike every other table. The
 * 2017 app had no monetization, so nothing migrates into these two tables and a
 * legacy trailer would be dead weight with a misleading `by_legacyKey` index.
 */

export const subscriptionStatusValidator = v.union(
  v.literal('NONE'),
  v.literal('ACTIVE'),
  v.literal('PAUSED'),
  v.literal('EXPIRED'),
  v.literal('REFUNDED'),
);

export const subscriptionStoreValidator = v.union(
  v.literal('APP_STORE'),
  v.literal('PLAY_STORE'),
  v.literal('STRIPE'),
  v.literal('PROMOTIONAL'),
  v.literal('AMAZON'),
  v.literal('MAC_APP_STORE'),
  v.literal('UNKNOWN'),
);

export const subscriptionPeriodTypeValidator = v.union(
  v.literal('NORMAL'),
  v.literal('TRIAL'),
  v.literal('INTRO'),
  v.literal('PROMOTIONAL'),
);

/**
 * Actual IAPKit receipt environment, never relabeled for App Review.
 * Explicitly enrolled Apple testers retain SANDBOX rows; those rows can never
 * overwrite a real PRODUCTION subscription. See subscriptionEnvironment.ts.
 */
export const subscriptionEnvironmentValidator = v.union(
  v.literal('SANDBOX'),
  v.literal('PRODUCTION'),
);

export const legacyEntitlementValidator = v.object({
  status: subscriptionStatusValidator,
  productId: v.optional(v.string()),
  store: subscriptionStoreValidator,
  periodType: subscriptionPeriodTypeValidator,
  expiresAt: v.optional(v.number()),
  willRenew: v.boolean(),
  unsubscribeDetectedAt: v.optional(v.number()),
  billingIssueDetectedAt: v.optional(v.number()),
  environment: subscriptionEnvironmentValidator,
});
export type LegacyEntitlement = Infer<typeof legacyEntitlementValidator>;

export const subscriptionEventOutcomeValidator = v.union(
  v.literal('APPLIED'),
  v.literal('IGNORED_STALE'), // an out-of-order retry older than lastEventAt
  v.literal('IGNORED_ENVIRONMENT'), // sandbox event reaching production, or vice versa
  v.literal('UNKNOWN_SUBSCRIBER'), // no users row for this appUserId; never create one
  v.literal('UNHANDLED_TYPE'), // IAPKit added an event type we do not model
  v.literal('RECONCILE_SCHEDULED'), // tokenless authoritative read for anchored purchases
);

/**
 * One row per user, holding what the SERVER believes about their subscription.
 * Never written from a device — only by the webhook and by the authenticated
 * server-side REST refresh.
 *
 * Warm, not hot: it changes on purchase, renewal, cancellation and expiry, which
 * is roughly monthly per subscriber. That is why the entitlement is derived from
 * here on demand rather than denormalized onto `ledgers`, which is cold by
 * construction and read by every item mutation.
 */
export const subscribersTable = defineTable({
  userId: v.id('users'),
  /** The IAPKit appUserID. Equals the `users` id string; never an email. */
  appUserId: v.string(),

  status: subscriptionStatusValidator,
  /** Always `bookoo_pro`; stored so another entitlement needs no migration. */
  entitlementId: v.string(),
  productId: v.optional(v.string()),
  store: subscriptionStoreValidator,
  periodType: subscriptionPeriodTypeValidator,

  /** Epoch ms. Absent for a lifetime or promotional grant that never expires. */
  expiresAt: v.optional(v.number()),
  willRenew: v.boolean(),
  /** Set by CANCELLATION. Access continues until `expiresAt` — see the contract §5. */
  unsubscribeDetectedAt: v.optional(v.number()),
  /** Billing-issue observation. Only legacy rows use the fixed local grace. */
  billingIssueDetectedAt: v.optional(v.number()),

  environment: subscriptionEnvironmentValidator,
  /** Absent on pre-migration rows, which retain their confirmed expiry. */
  provider: v.optional(v.literal('iapkit')),
  /** Anchored to a verified, immutably bound store receipt; never a token. */
  providerSubscriptionId: v.optional(v.string()),
  /** Frozen pre-migration grant, consumed by matching restore; never extended. */
  legacyEntitlement: v.optional(legacyEntitlementValidator),
  /** Monotonic purchase-state version, independent of clock precision. */
  purchaseRevision: v.optional(v.number()),

  /** Ordering guard: an older retry must never overwrite newer state. */
  lastEventId: v.optional(v.string()),
  lastEventAt: v.optional(v.number()),

  ...timestamps,
})
  .index('by_userId', ['userId'])
  .index('by_appUserId', ['appUserId'])
  .index('by_status_expiresAt', ['status', 'expiresAt']);

/**
 * Append-only webhook journal. Two jobs: idempotency (IAPKit retries, and a
 * duplicate must be a 200 or it retries forever) and an audit trail for revenue
 * questions that must never be answered by guessing.
 *
 * Stores a digest of the payload, not the payload. The body carries store
 * transaction identifiers and prices; keeping it verbatim would put third-party
 * billing data in the database for no operational gain.
 */
export const subscriptionEventsTable = defineTable({
  /** IAPKit `eventId`. The idempotency key. */
  eventId: v.string(),
  /** IAPKit `eventType`, stored as a free string ON PURPOSE: a literal
   *  union would reject an event type IAPKit adds later and turn a new
   *  product feature into a webhook outage. Unknown types record UNHANDLED_TYPE. */
  type: v.string(),
  appUserId: v.string(),
  /** Absent when the event names an app user with no account here. */
  userId: v.optional(v.id('users')),
  environment: subscriptionEnvironmentValidator,
  outcome: subscriptionEventOutcomeValidator,
  store: v.optional(v.union(v.literal('APP_STORE'), v.literal('PLAY_STORE'))),
  revokesAccess: v.optional(v.boolean()),

  /** IAPKit `event_timestamp_ms`. */
  eventAt: v.number(),
  receivedAt: v.number(),
  /** SHA-256 of the raw body. Enough to prove what was received; not the body. */
  payloadDigest: v.string(),
})
  .index('by_eventId', ['eventId'])
  .index('by_appUserId_receivedAt', ['appUserId', 'receivedAt'])
  .index('by_userId_receivedAt', ['userId', 'receivedAt'])
  .index('by_userId_outcome_receivedAt', ['userId', 'outcome', 'receivedAt'])
  .index('by_userId_store_environment_revokesAccess_receivedAt', [
    'userId',
    'store',
    'environment',
    'revokesAccess',
    'receivedAt',
  ])
  .index('by_receivedAt', ['receivedAt']);
