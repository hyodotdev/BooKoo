import {v, type Infer} from 'convex/values';
import type {Id} from '../_generated/dataModel';
import {internalQuery} from '../_generated/server';
import {requireActiveProfile, getLiveProfileOf} from '../lib/permissions';
import {
  subscriptionEnvironmentValidator,
  subscriptionStoreValidator,
  subscriptionStatusValidator,
} from '../schema/subscriptions';

const callerValidator = v.object({
  userId: v.id('users'),
  environment: v.optional(subscriptionEnvironmentValidator),
  productId: v.optional(v.string()),
  store: v.optional(subscriptionStoreValidator),
  migrated: v.boolean(),
  hasPurchases: v.boolean(),
  purchaseRevision: v.union(v.number(), v.null()),
  updatedAt: v.optional(v.number()),
  status: v.optional(subscriptionStatusValidator),
  expiresAt: v.optional(v.number()),
  providerSubscriptionId: v.optional(v.string()),
});
export type SubscriptionCaller = Infer<typeof callerValidator>;
export const caller = internalQuery({
  args: {},
  returns: callerValidator,
  handler: async (ctx): Promise<SubscriptionCaller> => {
    const profile = await requireActiveProfile(ctx);
    const row = await ctx.db
      .query('subscribers')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique();
    const purchase = await ctx.db
      .query('subscriptionPurchases')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', profile.userId))
      .first();
    return {
      userId: profile.userId,
      environment: row?.environment,
      productId: row?.productId,
      store: row?.store,
      migrated: row?.provider === 'iapkit',
      hasPurchases: purchase !== null,
      purchaseRevision: row?.purchaseRevision ?? null,
      updatedAt: row?.updatedAt,
      status: row?.status,
      expiresAt: row?.expiresAt,
      providerSubscriptionId: row?.providerSubscriptionId,
    };
  },
});

export const syncState = internalQuery({
  args: {userId: v.id('users')},
  returns: v.object({
    purchaseRevision: v.union(v.number(), v.null()),
    eventId: v.union(v.id('subscriptionEvents'), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    purchaseRevision: number | null;
    eventId: Id<'subscriptionEvents'> | null;
  }> => {
    if (!(await getLiveProfileOf(ctx, args.userId)))
      return {purchaseRevision: null, eventId: null};
    const row = await ctx.db
      .query('subscribers')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const event = await ctx.db
      .query('subscriptionEvents')
      .withIndex('by_userId_outcome_receivedAt', (q) =>
        q.eq('userId', args.userId).eq('outcome', 'RECONCILE_SCHEDULED'),
      )
      .order('desc')
      .first();
    return {
      purchaseRevision: row?.purchaseRevision ?? null,
      eventId: event?._id ?? null,
    };
  },
});

export const revocationState = internalQuery({
  args: {
    userId: v.id('users'),
    store: v.union(v.literal('APP_STORE'), v.literal('PLAY_STORE')),
    environment: subscriptionEnvironmentValidator,
  },
  returns: v.union(v.id('subscriptionEvents'), v.null()),
  handler: async (ctx, args): Promise<Id<'subscriptionEvents'> | null> => {
    if (!(await getLiveProfileOf(ctx, args.userId))) return null;
    const event = await ctx.db
      .query('subscriptionEvents')
      .withIndex('by_userId_store_environment_revokesAccess_receivedAt', (q) =>
        q
          .eq('userId', args.userId)
          .eq('store', args.store)
          .eq('environment', args.environment)
          .eq('revokesAccess', true),
      )
      .order('desc')
      .first();
    return event?._id ?? null;
  },
});

/** Server-owned reconciliation jobs; never resolve an independent public id. */
export const purchaseOwner = internalQuery({
  args: {userId: v.id('users')},
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const profile = await getLiveProfileOf(ctx, args.userId);
    const user = await ctx.db.get('users', args.userId);
    if (!user || !profile || profile.deletedAt !== undefined) return false;
    return (
      (await ctx.db
        .query('subscriptionPurchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', args.userId))
        .first()) !== null
    );
  },
});
