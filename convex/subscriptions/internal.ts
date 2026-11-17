import {paginationOptsValidator} from 'convex/server';
import {v} from 'convex/values';
import {internal} from '../_generated/api';
import type {Doc} from '../_generated/dataModel';
import {internalMutation} from '../lib/functions';
import {
  isObject,
  isModeledIapkitEventType,
  parseIapkitEntitlements,
  parseIapkitEvent,
  parseIapkitSnapshot,
} from '../lib/iapkit';
import {
  canReplaceSubscriptionEnvironment,
  expectedSubscriptionEnvironment,
  isSubscriptionEnvironmentAllowed,
  isVerificationEnvironmentAllowed,
} from '../lib/subscriptionEnvironment';
import {legacyBridge, projectSubscription} from '../lib/subscriptionProjection';
import {subscriptionEnvironmentValidator} from '../schema/subscriptions';
import {getLiveProfileOf} from '../lib/permissions';

export const applyWebhookEvent = internalMutation({
  args: {body: v.string(), payloadDigest: v.string()},
  returns: v.object({outcome: v.string()}),
  handler: async (ctx, args): Promise<{outcome: string}> => {
    const event = parseIapkitEvent(JSON.parse(args.body));
    if (!event || event.projectId !== process.env.IAPKIT_PROJECT_ID)
      return {outcome: 'UNHANDLED_TYPE'};
    const prior = await ctx.db
      .query('subscriptionEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', event.eventId))
      .unique();
    if (prior) return {outcome: prior.outcome};
    const userId = ctx.db.normalizeId('users', event.appUserId);
    const user = userId ? await ctx.db.get('users', userId) : null;
    const profile = userId
      ? await ctx.db
          .query('userProfiles')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .unique()
      : null;
    // The user tombstone survives purge. Late upstream retries must not recreate
    // the personal billing journal after its deletion phase has finished.
    if (
      user &&
      (!profile ||
        profile.deletedAt !== undefined ||
        profile.purgedAt !== undefined)
    )
      return {outcome: 'UNKNOWN_SUBSCRIBER'};
    let outcome: Doc<'subscriptionEvents'>['outcome'] = 'UNKNOWN_SUBSCRIBER';
    if (userId && user && profile && profile.deletedAt === undefined) {
      if (event.status === 'NONE' || !isModeledIapkitEventType(event.type))
        outcome = 'UNHANDLED_TYPE';
      else if (
        !isVerificationEnvironmentAllowed({
          actual: event.environment,
          store: event.store,
          appUserId: userId,
        })
      )
        outcome = 'IGNORED_ENVIRONMENT';
      else {
        // Public events omit the stable Google/provider purchase id. Never let
        // one purchase's refund overwrite a different active purchase.
        await ctx.scheduler.runAfter(
          0,
          internal.subscriptions.actions.refreshUser,
          {userId},
        );
        outcome = 'RECONCILE_SCHEDULED';
      }
    }
    await ctx.db.insert('subscriptionEvents', {
      eventId: event.eventId,
      type: event.type,
      appUserId: event.appUserId,
      ...(userId && user ? {userId} : {}),
      environment: event.environment,
      outcome,
      store: event.store,
      revokesAccess:
        outcome === 'RECONCILE_SCHEDULED' && event.status !== 'ACTIVE',
      eventAt: event.occurredAt,
      receivedAt: Date.now(),
      payloadDigest: args.payloadDigest,
    });
    return {outcome};
  },
});

/** Only after verified environment, immutable binding and exact receipt match. */
export const applySubscriberSnapshot = internalMutation({
  args: {
    userId: v.id('users'),
    body: v.string(),
    environment: subscriptionEnvironmentValidator,
    expectedUpdatedAt: v.optional(v.number()),
    expectedPurchaseRevision: v.union(v.number(), v.null()),
    expectedRevocationEventId: v.union(v.id('subscriptionEvents'), v.null()),
  },
  returns: v.object({applied: v.boolean()}),
  handler: async (ctx, args): Promise<{applied: boolean}> => {
    const profile = await getLiveProfileOf(ctx, args.userId);
    const user = await ctx.db.get('users', args.userId);
    if (!user || !profile || profile.deletedAt !== undefined)
      return {applied: false};
    const row = await ctx.db
      .query('subscribers')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (
      row?.updatedAt !== args.expectedUpdatedAt ||
      (row?.purchaseRevision ?? null) !== args.expectedPurchaseRevision ||
      !canReplaceSubscriptionEnvironment(row?.environment, args.environment)
    )
      return {applied: false};
    const body: unknown = JSON.parse(args.body);
    const snapshot = isObject(body)
      ? parseIapkitSnapshot(body.subscription)
      : null;
    if (
      !isObject(body) ||
      body.active !== true ||
      !snapshot?.providerSubscriptionId ||
      snapshot.status !== 'ACTIVE' ||
      !isObject(body.subscription) ||
      body.subscription.userId !== args.userId ||
      snapshot.expiresAt <= Date.now() ||
      !isSubscriptionEnvironmentAllowed({
        actual: args.environment,
        store: snapshot.store,
        appUserId: args.userId,
        expiresAt: snapshot.expiresAt,
      })
    )
      return {applied: false};
    const providerId = snapshot.providerSubscriptionId;
    const latest = await ctx.db
      .query('subscriptionEvents')
      .withIndex('by_userId_store_environment_revokesAccess_receivedAt', (q) =>
        q
          .eq('userId', args.userId)
          .eq('store', snapshot.store)
          .eq('environment', args.environment)
          .eq('revokesAccess', true),
      )
      .order('desc')
      .first();
    if ((latest?._id ?? null) !== args.expectedRevocationEventId)
      return {applied: false};
    const purchase = await ctx.db
      .query('subscriptionPurchases')
      .withIndex('by_providerSubscriptionId', (q) =>
        q.eq('providerSubscriptionId', providerId),
      )
      .unique();
    if (
      purchase &&
      (purchase.userId !== args.userId ||
        !canReplaceSubscriptionEnvironment(
          purchase.environment,
          args.environment,
        ))
    )
      return {applied: false};
    const now = Date.now();
    const fields = {
      userId: args.userId,
      providerSubscriptionId: providerId,
      environment: args.environment,
      productId: snapshot.productId,
      store: snapshot.store,
      status: snapshot.status,
      expiresAt: snapshot.expiresAt,
      willRenew: snapshot.willRenew,
      hasBillingIssue: snapshot.hasBillingIssue,
      updatedAt: now,
    };
    if (purchase)
      await ctx.db.patch('subscriptionPurchases', purchase._id, fields);
    else
      await ctx.db.insert('subscriptionPurchases', {...fields, createdAt: now});
    const bridge = legacyBridge(row);
    const restoredLegacy =
      bridge &&
      bridge.store === snapshot.store &&
      (bridge.productId === snapshot.productId ||
        (snapshot.store === 'PLAY_STORE' &&
          bridge.productId?.startsWith(`${snapshot.productId}:`)));
    await projectSubscription(ctx, args.userId, restoredLegacy ? null : bridge);
    return {applied: true};
  },
});

export const applyEntitlementSnapshotPage = internalMutation({
  args: {
    userId: v.id('users'),
    body: v.string(),
    paginationOpts: paginationOptsValidator,
    expectedPurchaseRevision: v.union(v.number(), v.null()),
    expectedEventId: v.union(v.id('subscriptionEvents'), v.null()),
  },
  returns: v.object({applied: v.boolean()}),
  handler: async (ctx, args): Promise<{applied: boolean}> => {
    if (expectedSubscriptionEnvironment() === null) return {applied: false};
    const profile = await getLiveProfileOf(ctx, args.userId);
    const user = await ctx.db.get('users', args.userId);
    if (!user || !profile || profile.deletedAt !== undefined)
      return {applied: false};
    const latest = await ctx.db
      .query('subscriptionEvents')
      .withIndex('by_userId_outcome_receivedAt', (q) =>
        q.eq('userId', args.userId).eq('outcome', 'RECONCILE_SCHEDULED'),
      )
      .order('desc')
      .first();
    const row = await ctx.db
      .query('subscribers')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (
      (latest?._id ?? null) !== args.expectedEventId ||
      (row?.purchaseRevision ?? null) !== args.expectedPurchaseRevision
    ) {
      // Initial-page conflicts are retried by the calling action. A scheduled
      // continuation has no action waiting for its result, so restart there.
      if (args.paginationOpts.cursor !== null)
        await ctx.scheduler.runAfter(
          0,
          internal.subscriptions.actions.refreshUser,
          {userId: args.userId},
        );
      return {applied: false};
    }
    const snapshots = parseIapkitEntitlements(
      JSON.parse(args.body),
      args.userId,
    );
    if (!snapshots) return {applied: false};
    const byId = new Map(
      snapshots.map((snapshot) => [snapshot.providerSubscriptionId, snapshot]),
    );
    const page = await ctx.db
      .query('subscriptionPurchases')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', args.userId))
      .paginate({...args.paginationOpts, numItems: 32, maximumRowsRead: 32});
    let changed = false;
    for (const purchase of page.page) {
      const snapshot = byId.get(purchase.providerSubscriptionId);
      if (snapshot && snapshot.store !== purchase.store) continue;
      const active = snapshot !== undefined && snapshot.expiresAt > Date.now();
      const status = active ? 'ACTIVE' : 'EXPIRED';
      const expiresAt = snapshot?.expiresAt ?? purchase.expiresAt;
      const productId = snapshot?.productId ?? purchase.productId;
      const willRenew = active && snapshot.willRenew;
      const hasBillingIssue = active && snapshot.hasBillingIssue;
      if (
        purchase.status === status &&
        purchase.expiresAt === expiresAt &&
        purchase.productId === productId &&
        purchase.willRenew === willRenew &&
        purchase.hasBillingIssue === hasBillingIssue
      )
        continue;
      await ctx.db.patch('subscriptionPurchases', purchase._id, {
        status,
        expiresAt,
        productId,
        willRenew,
        hasBillingIssue,
        updatedAt: Date.now(),
      });
      changed = true;
    }
    const revision = changed
      ? await projectSubscription(ctx, args.userId)
      : args.expectedPurchaseRevision;
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.subscriptions.internal.applyEntitlementSnapshotPage,
        {
          ...args,
          expectedPurchaseRevision: revision,
          paginationOpts: {numItems: 32, cursor: page.continueCursor},
        },
      );
    // A guarded, valid no-op snapshot is complete, not a retryable conflict.
    return {applied: true};
  },
});
