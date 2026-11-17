import {v, type Infer} from 'convex/values';

import {query} from '../_generated/server';
import {requireActiveProfile} from '../lib/permissions';
import {requireLedgerMember} from '../lib/ledgerPermissions';
import {
  expectedSubscriptionEnvironment,
  isSubscriptionEnvironmentAllowed,
} from '../lib/subscriptionEnvironment';
import {
  FREE_MEMBER_LIMIT,
  FREE_SHARED_LEDGER_LIMIT,
  isGrandfathered,
  subscriberSnapshot,
} from '../lib/entitlements';
import {
  subscriptionPeriodTypeValidator,
  subscriptionStatusValidator,
  subscriptionStoreValidator,
} from '../schema/subscriptions';

/**
 * Subscription READ paths.
 *
 * These return stored state and let the client decide what to draw. They
 * deliberately do NOT evaluate whether the entitlement is live: `Date.now()` is
 * banned inside a Convex query, and — per `docs/product/MONETIZATION.md` §3 —
 * no read is ever gated by subscription anyway. Enforcement lives on the write
 * path in `convex/lib/entitlements.ts`.
 */

const mySubscriptionValidator = v.object({
  billingReady: v.boolean(),
  status: subscriptionStatusValidator,
  provider: v.optional(v.literal('iapkit')),
  productId: v.optional(v.string()),
  store: subscriptionStoreValidator,
  periodType: subscriptionPeriodTypeValidator,
  expiresAt: v.optional(v.number()),
  willRenew: v.boolean(),
  billingIssueDetectedAt: v.optional(v.number()),
  unsubscribeDetectedAt: v.optional(v.number()),
});

/** Derived from the validator, so the wire contract has exactly one spelling. */
export type MySubscription = Infer<typeof mySubscriptionValidator>;

const NONE: Omit<MySubscription, 'billingReady'> = {
  status: 'NONE',
  store: 'UNKNOWN',
  periodType: 'NORMAL',
  willRenew: false,
};

/**
 * The signed-in user's own subscription, for the manage/restore screen.
 *
 * Guarded with `requireActiveProfile`, NOT `requireOnboarded`. Onboarding is
 * not a precondition for having a subscription, and this query is mounted in
 * the root provider — so throwing ONBOARDING_REQUIRED here meant every new user
 * tripped the provider's error boundary during onboarding, exactly the group
 * least able to recover from it.
 */
export const mine = query({
  args: {},
  returns: mySubscriptionValidator,
  handler: async (ctx): Promise<MySubscription> => {
    const profile = await requireActiveProfile(ctx);
    const row = await ctx.db
      .query('subscribers')
      .withIndex('by_userId', (index) => index.eq('userId', profile.userId))
      .unique();
    const billingReady = Boolean(
      process.env.IAPKIT_PUBLISHABLE_KEY &&
      process.env.IAPKIT_SECRET_KEY &&
      process.env.IAPKIT_PROJECT_ID &&
      process.env.IAPKIT_WEBHOOK_SECRET &&
      expectedSubscriptionEnvironment(),
    );
    if (row === null) return {...NONE, billingReady};
    if (!isSubscriptionEnvironmentAllowed({...row, actual: row.environment}))
      return {...NONE, billingReady};

    return {
      billingReady,
      status: row.status,
      provider: row.provider,
      ...(row.productId === undefined ? {} : {productId: row.productId}),
      store: row.store,
      periodType: row.periodType,
      ...(row.expiresAt === undefined ? {} : {expiresAt: row.expiresAt}),
      willRenew: row.willRenew,
      ...(row.billingIssueDetectedAt === undefined
        ? {}
        : {billingIssueDetectedAt: row.billingIssueDetectedAt}),
      ...(row.unsubscribeDetectedAt === undefined
        ? {}
        : {unsubscribeDetectedAt: row.unsubscribeDetectedAt}),
    };
  },
});

const ledgerEntitlementValidator = v.object({
  status: subscriptionStatusValidator,
  provider: v.optional(v.literal('iapkit')),
  expiresAt: v.optional(v.number()),
  billingIssueDetectedAt: v.optional(v.number()),
  /** True when the caller is the person whose subscription funds this ledger. */
  viewerIsOwner: v.boolean(),
  grandfathered: v.boolean(),
  freeMemberLimit: v.number(),
  freeSharedLedgerLimit: v.number(),
  memberCount: v.number(),
});

export type LedgerEntitlement = Infer<typeof ledgerEntitlementValidator>;

/**
 * The entitlement state of a ledger, for any member.
 *
 * Returns the OWNER's status to every member on purpose: a shared ledger needs to
 * know whether it is on Pro, and hiding that from the non-paying members would
 * make "why can't I invite another member" unanswerable. It exposes no billing
 * detail — no price, no product, no store account, no renewal amount.
 *
 * A non-owner sees `viewerIsOwner: false` and the client shows "ask <owner>"
 * instead of a purchase button, per §5 of the monetization decision.
 */
export const forLedger = query({
  args: {ledgerId: v.id('ledgers')},
  returns: ledgerEntitlementValidator,
  handler: async (ctx, {ledgerId}): Promise<LedgerEntitlement> => {
    const {ledger, profile} = await requireLedgerMember(ctx, ledgerId);
    const snapshot = await subscriberSnapshot(ctx, ledger.ownerId);

    return {
      status: snapshot?.status ?? 'NONE',
      provider: snapshot?.provider,
      ...(snapshot?.expiresAt === undefined
        ? {}
        : {expiresAt: snapshot.expiresAt}),
      ...(snapshot?.billingIssueDetectedAt === undefined
        ? {}
        : {billingIssueDetectedAt: snapshot.billingIssueDetectedAt}),
      viewerIsOwner: ledger.ownerId === profile.userId,
      grandfathered: isGrandfathered(ledger),
      freeMemberLimit: FREE_MEMBER_LIMIT,
      freeSharedLedgerLimit: FREE_SHARED_LEDGER_LIMIT,
      memberCount: ledger.memberCount,
    };
  },
});
