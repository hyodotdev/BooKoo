import {
  entitlementDeadline,
  assertUsableAppUserId,
  BILLING_GRACE_MS,
  isEntitlementActive,
  isEntitlementEnding,
  isPremiumCapability,
  PAYWALL_PLACEMENT_BY_CAPABILITY,
  placementFor,
  PREMIUM_CAPABILITIES,
  type EntitlementSnapshot,
} from '../../shared/entitlements';

const NOW = 1_800_000_000_000;

describe('Pro entitlement predicate', () => {
  it('denies with no subscription at all', () => {
    expect(isEntitlementActive(null, NOW)).toBe(false);
    expect(isEntitlementActive(undefined, NOW)).toBe(false);
    expect(isEntitlementActive({status: 'NONE'}, NOW)).toBe(false);
  });

  it('grants while active and not yet expired', () => {
    expect(
      isEntitlementActive({status: 'ACTIVE', expiresAt: NOW + 1}, NOW),
    ).toBe(true);
  });

  it('treats an active row with no expiry as a lifetime grant', () => {
    expect(isEntitlementActive({status: 'ACTIVE'}, NOW)).toBe(true);
  });

  it('denies at the exact expiry instant with no billing retry', () => {
    expect(isEntitlementActive({status: 'ACTIVE', expiresAt: NOW}, NOW)).toBe(
      false,
    );
  });

  it('keeps access past expiry while the store is retrying the card', () => {
    const retrying: EntitlementSnapshot = {
      status: 'ACTIVE',
      expiresAt: NOW - 1,
      billingIssueDetectedAt: NOW - 1000,
    };
    expect(isEntitlementActive(retrying, NOW)).toBe(true);
    expect(isEntitlementActive(retrying, NOW - 1 + BILLING_GRACE_MS - 1)).toBe(
      true,
    );
  });

  it('ends access once the billing grace window closes', () => {
    const retrying: EntitlementSnapshot = {
      status: 'ACTIVE',
      expiresAt: NOW,
      billingIssueDetectedAt: NOW,
    };
    expect(isEntitlementActive(retrying, NOW + BILLING_GRACE_MS)).toBe(false);
  });

  it('denies for paused, expired and refunded regardless of the clock', () => {
    for (const status of ['PAUSED', 'EXPIRED', 'REFUNDED'] as const)
      expect(isEntitlementActive({status, expiresAt: NOW + 999_999}, NOW)).toBe(
        false,
      );
  });

  it('flags a live subscription that will not renew', () => {
    expect(
      isEntitlementEnding(
        {status: 'ACTIVE', expiresAt: NOW + 1000, willRenew: false},
        NOW,
      ),
    ).toBe(true);
    expect(
      isEntitlementEnding(
        {status: 'ACTIVE', expiresAt: NOW + 1000, willRenew: true},
        NOW,
      ),
    ).toBe(false);
    // Already gone is not "ending".
    expect(
      isEntitlementEnding({status: 'EXPIRED', willRenew: false}, NOW),
    ).toBe(false);
  });
});

it('does not extend IAPKit effective store expiry with legacy grace', () => {
  expect(
    isEntitlementActive(
      {
        provider: 'iapkit',
        status: 'ACTIVE',
        expiresAt: NOW,
        billingIssueDetectedAt: NOW - 1000,
      },
      NOW,
    ),
  ).toBe(false);
});

describe('appUserID safety', () => {
  it('accepts a Convex user id', () => {
    expect(() =>
      assertUsableAppUserId('k5712abcd1234efgh5678ijkl'),
    ).not.toThrow();
  });

  it('refuses an email address', () => {
    expect(() => assertUsableAppUserId('hyo@hyo.dev')).toThrow(/opaque/);
  });

  it('refuses empty and whitespace-bearing ids', () => {
    expect(() => assertUsableAppUserId('')).toThrow();
    expect(() => assertUsableAppUserId('user id')).toThrow(/opaque/);
  });
});

describe('capability vocabulary', () => {
  it('maps every capability to a distinct placement', () => {
    const placements = PREMIUM_CAPABILITIES.map(placementFor);
    expect(new Set(placements).size).toBe(PREMIUM_CAPABILITIES.length);
    expect(Object.keys(PAYWALL_PLACEMENT_BY_CAPABILITY).sort()).toEqual(
      [...PREMIUM_CAPABILITIES].sort(),
    );
  });

  it('has no capability for reading, exporting or deleting your own data', () => {
    // docs/product/MONETIZATION.md §3: a capability that does not exist cannot
    // be gated by accident.
    const forbidden = ['READ', 'EXPORT_OWN', 'DELETE', 'ACCOUNT_DELETE'];
    for (const name of forbidden) expect(isPremiumCapability(name)).toBe(false);
  });

  it('narrows unknown strings', () => {
    expect(isPremiumCapability('SECOND_SHARED_LEDGER')).toBe(true);
    expect(isPremiumCapability('REPEATING_ENTRY')).toBe(false);
    expect(isPremiumCapability('WHATEVER')).toBe(false);
    expect(isPremiumCapability(42)).toBe(false);
  });
});

it('uses the same effective deadline for access and native expiry timers', () => {
  expect(
    entitlementDeadline({
      status: 'ACTIVE',
      expiresAt: 100,
      provider: 'iapkit',
      billingIssueDetectedAt: 1,
    }),
  ).toBe(100);
  expect(
    entitlementDeadline({
      status: 'ACTIVE',
      expiresAt: 100,
      billingIssueDetectedAt: 1,
    }),
  ).toBe(100 + BILLING_GRACE_MS);
  expect(entitlementDeadline({status: 'ACTIVE'})).toBeUndefined();
});
