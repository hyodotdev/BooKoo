import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import type {LegacyEntitlement} from '../schema/subscriptions';
import {
  expectedSubscriptionEnvironment,
  canReplaceSubscriptionEnvironment,
  isSubscriptionEnvironmentAllowed,
  isVerificationEnvironmentAllowed,
} from './subscriptionEnvironment';
import {
  entitlementDeadline,
  isEntitlementActive,
  PRO_ENTITLEMENT_ID,
} from '../../shared/entitlements';

export function legacyBridge(
  row: Doc<'subscribers'> | null,
): LegacyEntitlement | undefined {
  if (row?.legacyEntitlement) return row.legacyEntitlement;
  if (!row || row.provider === 'iapkit') return undefined;
  return {
    status: row.status,
    productId: row.productId,
    store: row.store,
    periodType: row.periodType,
    expiresAt: row.expiresAt,
    willRenew: row.willRenew,
    unsubscribeDetectedAt: row.unsubscribeDetectedAt,
    billingIssueDetectedAt: row.billingIssueDetectedAt,
    environment: row.environment,
  };
}

/** Constant read set: at most two stores × two environments, one indexed winner
 * each. subscribers is the projection; subscriptionPurchases owns native state. */
export async function projectSubscription(
  ctx: MutationCtx,
  userId: Id<'users'>,
  bridgeOverride?: LegacyEntitlement | null,
): Promise<number> {
  const row = await ctx.db
    .query('subscribers')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
  const expected = expectedSubscriptionEnvironment();
  if (expected === null) return row?.purchaseRevision ?? 0;
  const now = Date.now();
  const candidates: Doc<'subscriptionPurchases'>[] = [];
  for (const environment of ['PRODUCTION', 'SANDBOX'] as const) {
    if (row?.environment === 'PRODUCTION' && environment === 'SANDBOX')
      continue;
    for (const store of ['APP_STORE', 'PLAY_STORE'] as const) {
      if (
        !isVerificationEnvironmentAllowed({
          actual: environment,
          store,
          appUserId: userId,
        })
      )
        continue;
      const purchase = await ctx.db
        .query('subscriptionPurchases')
        .withIndex('by_userId_environment_store_status_expiresAt', (q) =>
          q
            .eq('userId', userId)
            .eq('environment', environment)
            .eq('store', store)
            .eq('status', 'ACTIVE')
            .gt('expiresAt', now),
        )
        .order('desc')
        .first();
      if (purchase) candidates.push(purchase);
    }
  }
  const native = candidates.sort((a, b) =>
    a.environment === b.environment
      ? b.expiresAt - a.expiresAt
      : a.environment === 'PRODUCTION'
        ? -1
        : 1,
  )[0];
  const bridge =
    bridgeOverride === undefined
      ? legacyBridge(row)
      : (bridgeOverride ?? undefined);
  const legacyActive =
    bridge !== undefined &&
    canReplaceSubscriptionEnvironment(row?.environment, bridge.environment) &&
    isSubscriptionEnvironmentAllowed({
      ...bridge,
      actual: bridge.environment,
      appUserId: userId,
    }) &&
    isEntitlementActive(bridge, now);
  const legacyWins =
    legacyActive &&
    !(
      bridge.environment === 'SANDBOX' && native?.environment === 'PRODUCTION'
    ) &&
    (!native || (entitlementDeadline(bridge) ?? Infinity) > native.expiresAt);
  const fields = legacyWins
    ? {
        ...bridge,
        provider: undefined,
        providerSubscriptionId: undefined,
      }
    : native
      ? {
          status: native.status,
          productId: native.productId,
          store: native.store,
          expiresAt: native.expiresAt,
          willRenew: native.willRenew,
          environment: native.environment,
          periodType: 'NORMAL' as const,
          provider: 'iapkit' as const,
          providerSubscriptionId: native.providerSubscriptionId,
          billingIssueDetectedAt: native.hasBillingIssue ? now : undefined,
          unsubscribeDetectedAt: native.willRenew ? undefined : now,
        }
      : {
          status: 'EXPIRED' as const,
          productId: row?.productId,
          store: row?.store ?? ('UNKNOWN' as const),
          expiresAt: row?.expiresAt ?? now,
          willRenew: false,
          environment: row?.environment ?? expected,
          periodType: row?.periodType ?? ('NORMAL' as const),
          provider: 'iapkit' as const,
          providerSubscriptionId: undefined,
          billingIssueDetectedAt: undefined,
          unsubscribeDetectedAt: row?.unsubscribeDetectedAt,
        };
  const purchaseRevision = (row?.purchaseRevision ?? 0) + 1;
  const value = {
    ...fields,
    userId,
    appUserId: userId,
    entitlementId: PRO_ENTITLEMENT_ID,
    legacyEntitlement: legacyActive ? bridge : undefined,
    lastEventId: undefined,
    lastEventAt: undefined,
    updatedAt: now,
    purchaseRevision,
  };
  if (row) await ctx.db.patch('subscribers', row._id, value);
  else await ctx.db.insert('subscribers', {...value, createdAt: now});
  return purchaseRevision;
}
