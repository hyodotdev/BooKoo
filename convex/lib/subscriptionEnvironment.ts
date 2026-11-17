import type {SubscriptionStore} from '../../shared/entitlements';
import type {SubscriptionEnvironment} from './iapkit';

interface EnvironmentPolicy {
  readonly expected: SubscriptionEnvironment;
  readonly actual: SubscriptionEnvironment;
  readonly store: SubscriptionStore;
  readonly appUserId: string;
  readonly expiresAt?: number;
  readonly sandboxAppUserIds?: string;
}

/** Server-owned, exact account IDs only. Never accept a device's test flag. */
export function permitsSubscriptionEnvironment(
  policy: EnvironmentPolicy,
): boolean {
  if (policy.expected === policy.actual) return true;
  if (
    policy.expected !== 'PRODUCTION' ||
    policy.actual !== 'SANDBOX' ||
    policy.store !== 'APP_STORE'
  )
    return false;

  // Bounded: at most 32 explicitly enrolled review/test accounts, not user data.
  const ids = (policy.sandboxAppUserIds ?? '')
    .split(',', 33)
    .map((id) => id.trim());
  return (
    ids.length <= 32 &&
    policy.appUserId.length > 0 &&
    ids.includes(policy.appUserId)
  );
}

export function acceptsSubscriptionEnvironment(
  policy: EnvironmentPolicy,
): boolean {
  return (
    permitsSubscriptionEnvironment(policy) &&
    (policy.expected === policy.actual ||
      (policy.expiresAt !== undefined &&
        Number.isFinite(policy.expiresAt) &&
        policy.expiresAt > 0))
  );
}

/** Binding is allowed only for the same environment or an exact Apple reviewer.
 * Granting the resulting row still requires its verified finite expiry. */
export function isVerificationEnvironmentAllowed(
  row: Pick<EnvironmentPolicy, 'actual' | 'store' | 'appUserId'>,
): boolean {
  const expected = expectedSubscriptionEnvironment();
  if (expected === null) return false;
  return permitsSubscriptionEnvironment({
    ...row,
    expected,
    sandboxAppUserIds: process.env.IAPKIT_SANDBOX_APP_USER_IDS,
  });
}

/** Sandbox must never overwrite a real purchase, even after its expiration. */
export function canReplaceSubscriptionEnvironment(
  existing: SubscriptionEnvironment | undefined,
  incoming: SubscriptionEnvironment,
): boolean {
  return (
    existing === undefined || existing === incoming || incoming === 'PRODUCTION'
  );
}

export function expectedSubscriptionEnvironment(): SubscriptionEnvironment | null {
  const expected = process.env.IAPKIT_EXPECTED_ENVIRONMENT;
  return expected === 'PRODUCTION' || expected === 'SANDBOX' ? expected : null;
}

export function isSubscriptionEnvironmentAllowed(
  row: Pick<EnvironmentPolicy, 'actual' | 'store' | 'appUserId' | 'expiresAt'>,
): boolean {
  const expected = expectedSubscriptionEnvironment();
  if (expected === null) return false;
  return acceptsSubscriptionEnvironment({
    ...row,
    expected,
    sandboxAppUserIds: process.env.IAPKIT_SANDBOX_APP_USER_IDS,
  });
}
