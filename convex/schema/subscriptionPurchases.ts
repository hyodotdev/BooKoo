import {defineTable} from 'convex/server';
import {v} from 'convex/values';
import {timestamps} from './common';
import {
  subscriptionEnvironmentValidator,
  subscriptionStatusValidator,
} from './subscriptions';

// Billing did not exist in the 2017 app; no legacy data enters this table.
// Receipt tokens are never stored. The verified provider id owns one purchase.
export const subscriptionPurchasesTable = defineTable({
  userId: v.id('users'),
  providerSubscriptionId: v.string(),
  environment: subscriptionEnvironmentValidator,
  store: v.union(v.literal('APP_STORE'), v.literal('PLAY_STORE')),
  productId: v.string(),
  status: subscriptionStatusValidator,
  expiresAt: v.number(),
  willRenew: v.boolean(),
  hasBillingIssue: v.boolean(),
  ...timestamps,
})
  .index('by_providerSubscriptionId', ['providerSubscriptionId'])
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  .index('by_userId_environment_store_status_expiresAt', [
    'userId',
    'environment',
    'store',
    'status',
    'expiresAt',
  ]);
