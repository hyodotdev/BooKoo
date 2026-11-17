import {v, type Infer} from 'convex/values';
import {decodeJwt} from 'jose';
import {action, internalAction, type ActionCtx} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {internal} from '../_generated/api';
import {
  IAPKIT_ORIGIN,
  isObject,
  isProProduct,
  parseIapkitSnapshot,
  parseIapkitEntitlements,
} from '../lib/iapkit';
import {
  isEntitlementActive,
  STORE_PRODUCT_IDS,
} from '../../shared/entitlements';
import type {SubscriptionCaller} from './internalQueries';
import {
  canReplaceSubscriptionEnvironment,
  isVerificationEnvironmentAllowed,
  isSubscriptionEnvironmentAllowed,
  expectedSubscriptionEnvironment,
} from '../lib/subscriptionEnvironment';
import type {SubscriptionEnvironment} from '../lib/iapkit';
import {enforceRateLimit} from '../lib/rateLimits';

function callerHasAccess(caller: SubscriptionCaller): boolean {
  return (
    caller.environment !== undefined &&
    caller.status !== undefined &&
    isSubscriptionEnvironmentAllowed({
      actual: caller.environment,
      store: caller.store ?? 'UNKNOWN',
      appUserId: caller.userId,
      expiresAt: caller.expiresAt,
    }) &&
    isEntitlementActive(
      {
        provider: caller.migrated ? 'iapkit' : undefined,
        status: caller.status,
        expiresAt: caller.expiresAt,
      },
      Date.now(),
    )
  );
}

function verifiedEnvironment(value: unknown): SubscriptionEnvironment | null {
  if (typeof value !== 'string') return null;
  switch (value.toUpperCase()) {
    case 'SANDBOX':
      return 'SANDBOX';
    case 'PRODUCTION':
      return 'PRODUCTION';
    default:
      return null;
  }
}

/** Decode only after IAPKit verified this exact JWS. This identifies the bound
 * record; no entitlement or environment is inferred from client payloads. */
function verifiedReceiptToken(
  store: 'apple' | 'google',
  proof: string,
): string | null {
  if (store === 'google') return proof;
  const payload = decodeJwt(proof);
  const id = payload.originalTransactionId ?? payload.transactionId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function request(
  path: string,
  key: string,
  body?: object,
): Promise<unknown | null> {
  const response = await fetch(`${IAPKIT_ORIGIN}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || Number(response.headers.get('content-length')) > 65536)
    return null;
  const text = await response.text();
  return new TextEncoder().encode(text).length <= 65536
    ? JSON.parse(text)
    : null;
}

async function reconcileOwned(
  ctx: ActionCtx,
  userId: Id<'users'>,
): Promise<boolean | null> {
  const key = process.env.IAPKIT_SECRET_KEY;
  if (!key || expectedSubscriptionEnvironment() === null) return null;
  try {
    const marker = await ctx.runQuery(
      internal.subscriptions.internalQueries.syncState,
      {userId},
    );
    const body = await request(
      `/v2/subscriptions/entitlements?userId=${encodeURIComponent(userId)}`,
      key,
    );
    const snapshots = parseIapkitEntitlements(body, userId);
    if (snapshots === null) return null;
    const sanitized = {
      userId,
      productIds: [...new Set(snapshots.map((snapshot) => snapshot.productId))],
      subscriptions: snapshots.map((snapshot) => ({
        id: snapshot.providerSubscriptionId,
        userId,
        productId: snapshot.productId,
        store: snapshot.store === 'APP_STORE' ? 'apple' : 'google',
        state: snapshot.hasBillingIssue ? 'InGracePeriod' : 'Active',
        expiresAt: snapshot.expiresAt,
        willRenew: snapshot.willRenew,
        updatedAt: snapshot.updatedAt,
      })),
    };
    const result = await ctx.runMutation(
      internal.subscriptions.internal.applyEntitlementSnapshotPage,
      {
        userId,
        body: JSON.stringify(sanitized),
        expectedPurchaseRevision: marker.purchaseRevision,
        expectedEventId: marker.eventId,
        paginationOpts: {numItems: 32, cursor: null},
      },
    );
    return result.applied;
  } catch {
    return null;
  }
}
async function refreshCaller(ctx: ActionCtx): Promise<boolean> {
  const caller = await ctx.runQuery(
    internal.subscriptions.internalQueries.caller,
    {},
  );
  await enforceRateLimit(ctx, 'subscriptionRefresh', caller.userId);
  if (!caller.hasPurchases) return callerHasAccess(caller);
  const applied = await reconcileOwned(ctx, caller.userId);
  if (applied === null) return callerHasAccess(caller);
  return callerHasAccess(
    await ctx.runQuery(internal.subscriptions.internalQueries.caller, {}),
  );
}
export const refreshUser = internalAction({
  args: {userId: v.id('users'), attempt: v.optional(v.number())},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (
      !(await ctx.runQuery(
        internal.subscriptions.internalQueries.purchaseOwner,
        {userId: args.userId},
      ))
    )
      return null;
    if ((await reconcileOwned(ctx, args.userId)) === true) return null;
    const attempt = args.attempt ?? 0;
    if (attempt >= 5)
      throw new Error(
        'IAPKit entitlement reconciliation requires operational retry',
      );
    await ctx.scheduler.runAfter(
      60000 * 2 ** attempt,
      internal.subscriptions.actions.refreshUser,
      {userId: args.userId, attempt: attempt + 1},
    );
    return null;
  },
});
export const refresh = action({
  args: {},
  returns: v.object({refreshed: v.boolean()}),
  handler: async (ctx): Promise<{refreshed: boolean}> => ({
    refreshed: await refreshCaller(ctx),
  }),
});
const verificationResultValidator = v.object({
  verified: v.boolean(),
  refreshed: v.boolean(),
  blocker: v.optional(
    v.union(
      v.literal('TEST_ACCOUNT_REQUIRED'),
      v.literal('ACCOUNT_LINK_REQUIRED'),
    ),
  ),
});
export type PurchaseVerificationResult = Infer<
  typeof verificationResultValidator
>;

export const verify = action({
  args: {
    expectedUserId: v.id('users'),
    store: v.union(v.literal('apple'), v.literal('google')),
    productId: v.string(),
    proof: v.string(),
  },
  returns: verificationResultValidator,
  handler: async (ctx, args): Promise<PurchaseVerificationResult> => {
    const caller = await ctx.runQuery(
      internal.subscriptions.internalQueries.caller,
      {},
    );
    const key = process.env.IAPKIT_PUBLISHABLE_KEY;
    const serverKey = process.env.IAPKIT_SECRET_KEY;
    if (
      args.expectedUserId !== caller.userId ||
      !key ||
      !serverKey ||
      expectedSubscriptionEnvironment() === null ||
      !isProProduct(args.productId) ||
      (args.store === 'google') !==
        (args.productId === STORE_PRODUCT_IDS.androidSubscription) ||
      !args.proof ||
      args.proof.length > (args.store === 'apple' ? 16384 : 2048)
    )
      return {verified: false, refreshed: false};
    await enforceRateLimit(ctx, 'subscriptionVerify', caller.userId);
    try {
      const result = await request('/v1/purchase/verify', key, {
        store: args.store,
        expectedProductId: args.productId,
        ...(args.store === 'apple'
          ? {jws: args.proof}
          : {purchaseToken: args.proof}),
      });
      if (
        !isObject(result) ||
        result.store !== args.store ||
        result.isValid !== true ||
        result.productId !== args.productId ||
        (result.state !== 'ENTITLED' &&
          result.state !== 'PENDING_ACKNOWLEDGMENT')
      )
        return {verified: false, refreshed: false};
      const environment = verifiedEnvironment(result.environment);
      const store = args.store === 'apple' ? 'APP_STORE' : 'PLAY_STORE';
      if (!environment) return {verified: false, refreshed: false};
      const environmentAllowed = isVerificationEnvironmentAllowed({
        actual: environment,
        store,
        appUserId: caller.userId,
      });
      if (!environmentAllowed) {
        if (environment === 'SANDBOX' && store === 'APP_STORE')
          return {
            verified: false,
            refreshed: false,
            blocker: 'TEST_ACCOUNT_REQUIRED',
          };
        return {verified: false, refreshed: false};
      }
      if (!canReplaceSubscriptionEnvironment(caller.environment, environment))
        return {
          verified: false,
          refreshed: false,
          blocker: 'ACCOUNT_LINK_REQUIRED',
        };
      const token = verifiedReceiptToken(args.store, args.proof);
      if (!token) return {verified: false, refreshed: false};
      const revocation = await ctx.runQuery(
        internal.subscriptions.internalQueries.revocationState,
        {userId: caller.userId, store, environment},
      );
      // User binding is administrative; its credential stays on this backend.
      const binding = await request('/v1/subscriptions/bind-user', serverKey, {
        purchaseToken: args.proof,
        userId: caller.userId,
      });
      if (isObject(binding) && binding.ok === true && binding.bound === false)
        return {
          verified: false,
          refreshed: false,
          blocker: 'ACCOUNT_LINK_REQUIRED',
        };
      if (!isObject(binding) || binding.ok !== true || binding.bound !== true)
        return {verified: false, refreshed: false};
      let observation = caller;
      // Retry this exact receipt after a projection race. The original revocation
      // marker remains fixed so a newer refund cannot be rebased into a grant.
      for (let attempt = 0; attempt < 3; attempt++) {
        // v1 active entitlements expose receipt identifiers. Match this exact
        // verified receipt even when another purchase was updated more recently.
        const body = await request(
          `/v1/subscriptions/entitlements?userId=${encodeURIComponent(caller.userId)}`,
          serverKey,
        );
        if (
          parseIapkitEntitlements(body, caller.userId) === null ||
          !isObject(body) ||
          !Array.isArray(body.subscriptions)
        )
          return {verified: false, refreshed: false};
        const record: unknown = body.subscriptions.find(
          (entry: unknown) =>
            isObject(entry) &&
            entry.purchaseToken === token &&
            entry.userId === caller.userId,
        );
        const snapshot = parseIapkitSnapshot(record);
        if (
          !isObject(record) ||
          !snapshot?.providerSubscriptionId ||
          record.purchaseToken !== token ||
          record.userId !== caller.userId ||
          snapshot.productId !== args.productId ||
          snapshot.store !== store ||
          snapshot.status !== 'ACTIVE' ||
          snapshot.expiresAt <= Date.now()
        )
          return {verified: false, refreshed: false};
        const applied = await ctx.runMutation(
          internal.subscriptions.internal.applySubscriberSnapshot,
          {
            userId: caller.userId,
            environment,
            expectedUpdatedAt: observation.updatedAt,
            expectedPurchaseRevision: observation.purchaseRevision,
            expectedRevocationEventId: revocation,
            // Tokens/prices never reach the database or public result.
            body: JSON.stringify({
              active: true,
              subscription: {
                id: snapshot.providerSubscriptionId,
                userId: caller.userId,
                productId: snapshot.productId,
                store: args.store,
                state: record.state,
                expiresAt: snapshot.expiresAt,
                willRenew: snapshot.willRenew,
                updatedAt: snapshot.updatedAt,
              },
            }),
          },
        );
        if (applied.applied) return {verified: true, refreshed: true};
        observation = await ctx.runQuery(
          internal.subscriptions.internalQueries.caller,
          {},
        );
        if (
          observation.userId !== caller.userId ||
          !canReplaceSubscriptionEnvironment(
            observation.environment,
            environment,
          )
        )
          return {verified: false, refreshed: false};
      }
      return {verified: false, refreshed: false};
    } catch {
      return {verified: false, refreshed: false};
    }
  },
});
