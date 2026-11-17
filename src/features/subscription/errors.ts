import {appErrorPayloadOf, type AppErrorMessageKey} from '@shared/appErrors';
import {
  isPremiumCapability,
  type PremiumCapability,
} from '@shared/entitlements';
import {t} from '~/utils/i18n';

/**
 * Turn a thrown Convex error into a paywall decision.
 *
 * This is the seam between server enforcement and the UI: the server refuses a
 * premium write with `PREMIUM_REQUIRED` plus the capability, and the screen
 * needs to know which paywall to open and what to say — without ever guessing,
 * and without a cast.
 */

export interface PremiumRefusal {
  readonly capability: PremiumCapability;
  readonly messageKey: AppErrorMessageKey;
  readonly ledgerId: string | undefined;
}

/** `null` for anything that is not a paywall refusal. */
export function premiumRefusalOf(error: unknown): PremiumRefusal | null {
  const payload = appErrorPayloadOf(error);
  if (payload === null || payload.code !== 'PREMIUM_REQUIRED') return null;

  const capability = payload.params?.capability;
  if (!isPremiumCapability(capability)) return null;

  if (
    (capability === 'MEMBER_LIMIT' &&
      payload.messageKey !== 'error.premium.memberLimit') ||
    (capability === 'SECOND_SHARED_LEDGER' &&
      payload.messageKey !== 'error.premium.secondLedger')
  )
    return null;

  const ledgerId = payload.params?.ledgerId;

  return {
    capability,
    messageKey: payload.messageKey,
    ledgerId: typeof ledgerId === 'string' ? ledgerId : undefined,
  };
}

/**
 * Localize a refusal.
 *
 * A `switch` to reach a literal key, not `t(payload.messageKey)`: i18n keys are
 * static literals so the catalog can be verified, and a dynamic key would let a
 * server value select an arbitrary string.
 */
export function premiumMessage(refusal: PremiumRefusal): string {
  switch (refusal.messageKey) {
    case 'error.premium.memberLimit':
      return t('error.premium.memberLimit');
    case 'error.premium.secondLedger':
      return t('error.premium.secondLedger');
    default:
      return t('error.generic');
  }
}

/**
 * Who should see a purchase button.
 *
 * Only the ledger's owner. A member who trips a limit on somebody else's
 * ledger is told to ask them, never offered a subscription for a ledger they
 * do not own — `docs/product/MONETIZATION.md` §5.
 */
export const canPurchaseForLedger = (viewerIsOwner: boolean): boolean =>
  viewerIsOwner;

/**
 * The message to show for a refusal, given who is looking.
 *
 * An ADMIN who is not the owner gets the same server refusal as the owner, but
 * showing them upgrade wording would be telling them to buy something for a
 * ledger that is not theirs. They are pointed at the owner instead.
 */
export function premiumMessageFor(
  refusal: PremiumRefusal,
  viewerIsOwner: boolean,
): string {
  return viewerIsOwner ? premiumMessage(refusal) : t('subscription.askOwner');
}

/**
 * User-facing result for attempts to expand a ledger.
 *
 * The Free boundary opens Pro; the absolute five-member boundary is a plain
 * limit and must never look like a purchase failure or imply that another
 * subscription could raise it.
 */
export function ledgerExpansionMessageFor(
  error: unknown,
  viewerIsOwner: boolean,
): string | null {
  const refusal = premiumRefusalOf(error);
  if (refusal !== null) return premiumMessageFor(refusal, viewerIsOwner);

  const payload = appErrorPayloadOf(error);
  return payload?.code === 'MEMBER_LIMIT_REACHED'
    ? t('error.ledger.memberLimit')
    : null;
}
