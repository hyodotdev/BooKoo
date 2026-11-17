import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';
import {
  isEntitlementActive,
  PRO_ENTITLEMENT_ID,
  type EntitlementSnapshot,
  type PremiumCapability,
} from '../../shared/entitlements';
import {appError} from './errors';
import type {AppErrorMessageKey} from '../../shared/appErrors';
import {isSubscriptionEnvironmentAllowed} from './subscriptionEnvironment';

/**
 * Server-side enforcement of the Pro ledger entitlement.
 *
 * Contract: `.notes/design/iapkit-entitlements.md` §3–§4.
 *
 * The device never grants anything. OpenIAP decides what to
 * DRAW; this decides what is ALLOWED, from state that only the IAPKit
 * webhook and the authenticated server-side REST refresh can write.
 */

/**
 * Free-tier limits. Deliberately const rather than `appConfig` fields for now:
 * a limit that can be edited live is a limit that can be edited wrongly, and
 * these numbers are load-bearing for revenue. Promote to `appConfig` only
 * with a migration that backfills the current values.
 */
export const FREE_MEMBER_LIMIT = 2;
export const FREE_SHARED_LEDGER_LIMIT = 1;
export const PRO_MEMBER_LIMIT = 5;

export type MemberCapacityPolicy = 'ALLOW' | 'REQUIRE_PRO' | 'FULL';

/** Pure boundary shared by the throwing and non-throwing member paths. */
export function memberCapacityPolicy(
  grandfathered: boolean,
  nextMemberCount: number,
): MemberCapacityPolicy {
  if (grandfathered || nextMemberCount <= FREE_MEMBER_LIMIT) return 'ALLOW';
  if (nextMemberCount > PRO_MEMBER_LIMIT) return 'FULL';
  return 'REQUIRE_PRO';
}

const MESSAGE_KEY_BY_CAPABILITY = {
  MEMBER_LIMIT: 'error.premium.memberLimit',
  SECOND_SHARED_LEDGER: 'error.premium.secondLedger',
} as const satisfies Record<PremiumCapability, AppErrorMessageKey>;

/**
 * A ledger imported from the 2017 app.
 *
 * `legacyKey` is set by the migration and by nothing else, so this predicate
 * cannot be forged and the grandfathered set cannot grow: it is fixed at the
 * 1,785 ledgers that existed in the export. That is what makes the generous
 * rule in `docs/product/MONETIZATION.md` §3 safe — ledgers that were already
 * sharing before BooKoo had a member limit are never told they are over it.
 */
export const isGrandfathered = (ledger: Doc<'ledgers'>): boolean =>
  ledger.legacyKey !== undefined;

/** O(1) indexed read of the entitlement holder's stored state. */
export async function subscriberSnapshot(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<EntitlementSnapshot | null> {
  const row = await ctx.db
    .query('subscribers')
    .withIndex('by_userId', (index) => index.eq('userId', userId))
    .unique();
  if (row === null) return null;
  if (row.entitlementId !== PRO_ENTITLEMENT_ID) return null;
  if (!isSubscriptionEnvironmentAllowed({...row, actual: row.environment}))
    return null;

  return {
    status: row.status,
    provider: row.provider,
    ...(row.expiresAt === undefined ? {} : {expiresAt: row.expiresAt}),
    ...(row.billingIssueDetectedAt === undefined
      ? {}
      : {billingIssueDetectedAt: row.billingIssueDetectedAt}),
  };
}

/** Does this PERSON currently hold BooKoo Pro? */
export async function userHasEntitlement(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  nowMs: number,
): Promise<boolean> {
  const snapshot = await subscriberSnapshot(ctx, userId);
  return isEntitlementActive(snapshot, nowMs);
}

/**
 * Gate a capability that belongs to a person rather than an existing ledger.
 * Creating a second owned ledger is the launch use case: there is no new
 * ledger document yet from which to derive an owner.
 */
export async function requireUserEntitlement(
  ctx: MutationCtx,
  userId: Id<'users'>,
  capability: PremiumCapability,
): Promise<void> {
  if (await userHasEntitlement(ctx, userId, Date.now())) return;

  throw appError('PREMIUM_REQUIRED', MESSAGE_KEY_BY_CAPABILITY[capability], {
    capability,
  });
}

/**
 * Does this LEDGER have Pro? Derived from its OWNER, never from the caller.
 *
 * This is the whole entitlement model in four lines: an invited member is never
 * asked about their own subscription, so accepting an invitation to a paid
 * ledger can never present them with a paywall.
 */
export async function ledgerHasEntitlement(
  ctx: QueryCtx | MutationCtx,
  ledger: Doc<'ledgers'>,
  nowMs: number,
): Promise<boolean> {
  return userHasEntitlement(ctx, ledger.ownerId, nowMs);
}

/**
 * The gate. Call immediately after the membership guard, before any domain read
 * or write.
 *
 * MutationCtx only, on purpose. Expiry is a function of the clock, `Date.now()`
 * is banned inside a Convex query, and — per
 * `docs/product/MONETIZATION.md` §3 — no read path is ever gated by
 * subscription anyway. Enforcement belongs on the write path and nowhere else.
 */
export async function requireLedgerEntitlement(
  ctx: MutationCtx,
  ledger: Doc<'ledgers'>,
  capability: PremiumCapability,
): Promise<void> {
  if (await ledgerHasEntitlement(ctx, ledger, Date.now())) return;

  throw appError('PREMIUM_REQUIRED', MESSAGE_KEY_BY_CAPABILITY[capability], {
    capability,
    ledgerId: ledger._id,
  });
}

/**
 * Can this ledger hold one more member?
 *
 * `nextMemberCount` is the count the ledger would have AFTER the pending add,
 * so a caller cannot be off by one in the direction that leaks a free seat.
 *
 * Non-throwing, because there are two callers with opposite needs: the OWNER
 * expanding the ledger should meet a paywall, and the person ACCEPTING an
 * invitation must never meet one (`docs/product/MONETIZATION.md` §5). The
 * redemption path uses this and reports a ledger state; the invite-creation
 * path uses `requireMemberCapacity` below.
 */
export async function hasMemberCapacity(
  ctx: QueryCtx | MutationCtx,
  ledger: Doc<'ledgers'>,
  nextMemberCount: number,
): Promise<boolean> {
  const policy = memberCapacityPolicy(isGrandfathered(ledger), nextMemberCount);
  if (policy === 'ALLOW') return true;
  if (policy === 'FULL') return false;

  return ledgerHasEntitlement(ctx, ledger, Date.now());
}

/**
 * The member-limit gate for whoever is EXPANDING the ledger.
 *
 * Throws `PREMIUM_REQUIRED`. A non-owner who trips it is shown "ask the owner"
 * rather than a purchase button — the client branches on
 * `subscriptions.forLedger.viewerIsOwner`.
 */
export async function requireMemberCapacity(
  ctx: MutationCtx,
  ledger: Doc<'ledgers'>,
  nextMemberCount: number,
): Promise<void> {
  const policy = memberCapacityPolicy(isGrandfathered(ledger), nextMemberCount);
  if (policy === 'ALLOW') return;
  if (policy === 'FULL')
    throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit', {
      limit: PRO_MEMBER_LIMIT,
    });

  await requireLedgerEntitlement(ctx, ledger, 'MEMBER_LIMIT');
}
