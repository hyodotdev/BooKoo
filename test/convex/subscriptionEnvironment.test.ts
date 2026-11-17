import {
  acceptsSubscriptionEnvironment,
  canReplaceSubscriptionEnvironment,
  isSubscriptionEnvironmentAllowed,
  isVerificationEnvironmentAllowed,
  expectedSubscriptionEnvironment,
} from '../../convex/lib/subscriptionEnvironment';

const policy = {
  expected: 'PRODUCTION',
  actual: 'SANDBOX',
  store: 'APP_STORE',
  appUserId: 'review-user',
  expiresAt: 1_800_000_000_000,
  sandboxAppUserIds: 'review-user,test-user',
} as const;

describe('server-enrolled Apple review receipts', () => {
  it.each([undefined, '', 'PROD', 'production'])(
    'fails closed for invalid deployment configuration %s',
    (expected) => {
      const before = process.env.IAPKIT_EXPECTED_ENVIRONMENT;
      try {
        if (expected === undefined)
          delete process.env.IAPKIT_EXPECTED_ENVIRONMENT;
        else process.env.IAPKIT_EXPECTED_ENVIRONMENT = expected;
        expect(expectedSubscriptionEnvironment()).toBeNull();
        for (const actual of ['SANDBOX', 'PRODUCTION'] as const) {
          expect(isVerificationEnvironmentAllowed({...policy, actual})).toBe(
            false,
          );
          expect(isSubscriptionEnvironmentAllowed({...policy, actual})).toBe(
            false,
          );
        }
      } finally {
        if (before === undefined)
          delete process.env.IAPKIT_EXPECTED_ENVIRONMENT;
        else process.env.IAPKIT_EXPECTED_ENVIRONMENT = before;
      }
    },
  );
  it('accepts the deployment environment without test enrollment', () => {
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        actual: 'PRODUCTION',
        sandboxAppUserIds: undefined,
      }),
    ).toBe(true);
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        expected: 'SANDBOX',
        sandboxAppUserIds: undefined,
      }),
    ).toBe(true);
  });

  it('allows only an exact enrolled account with a dated Apple receipt', () => {
    expect(acceptsSubscriptionEnvironment(policy)).toBe(true);
    for (const appUserId of ['', 'review', 'review-user-extra', 'other-user']) {
      expect(acceptsSubscriptionEnvironment({...policy, appUserId})).toBe(
        false,
      );
    }
    expect(
      acceptsSubscriptionEnvironment({...policy, sandboxAppUserIds: undefined}),
    ).toBe(false);
    expect(
      acceptsSubscriptionEnvironment({...policy, sandboxAppUserIds: '*'}),
    ).toBe(false);
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        sandboxAppUserIds: ' review-user ',
      }),
    ).toBe(true);
  });

  it('does not open Google, promotional or unknown-store access', () => {
    for (const store of [
      'PLAY_STORE',
      'PROMOTIONAL',
      'UNKNOWN',
      'STRIPE',
      'MAC_APP_STORE',
      'AMAZON',
    ] as const) {
      expect(acceptsSubscriptionEnvironment({...policy, store})).toBe(false);
    }
  });

  it('never treats a test receipt as lifetime access', () => {
    for (const expiresAt of [undefined, 0, -1, NaN, Infinity]) {
      expect(acceptsSubscriptionEnvironment({...policy, expiresAt})).toBe(
        false,
      );
    }
  });

  it('fails closed when the bounded enrollment configuration overflows', () => {
    const ids = [
      'review-user',
      ...Array.from({length: 32}, (_, i) => `test-${i}`),
    ];
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        sandboxAppUserIds: ids.join(','),
      }),
    ).toBe(false);
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        sandboxAppUserIds: ids.slice(0, 32).join(','),
      }),
    ).toBe(true);
  });

  it('does not admit production receipts to a sandbox deployment', () => {
    expect(
      acceptsSubscriptionEnvironment({
        ...policy,
        expected: 'SANDBOX',
        actual: 'PRODUCTION',
      }),
    ).toBe(false);
  });

  it('protects every real subscription from sandbox events and REST refresh', () => {
    expect(canReplaceSubscriptionEnvironment('PRODUCTION', 'SANDBOX')).toBe(
      false,
    );
    expect(canReplaceSubscriptionEnvironment('SANDBOX', 'PRODUCTION')).toBe(
      true,
    );
    expect(canReplaceSubscriptionEnvironment('PRODUCTION', 'PRODUCTION')).toBe(
      true,
    );
    expect(canReplaceSubscriptionEnvironment('SANDBOX', 'SANDBOX')).toBe(true);
    expect(canReplaceSubscriptionEnvironment(undefined, 'SANDBOX')).toBe(true);
  });

  it('withdraws test access on reads when server enrollment is removed', () => {
    const savedEnvironment = process.env.IAPKIT_EXPECTED_ENVIRONMENT;
    const savedAccounts = process.env.IAPKIT_SANDBOX_APP_USER_IDS;
    try {
      process.env.IAPKIT_EXPECTED_ENVIRONMENT = 'PRODUCTION';
      process.env.IAPKIT_SANDBOX_APP_USER_IDS = 'review-user';
      expect(isSubscriptionEnvironmentAllowed(policy)).toBe(true);
      delete process.env.IAPKIT_SANDBOX_APP_USER_IDS;
      expect(isSubscriptionEnvironmentAllowed(policy)).toBe(false);
      expect(
        isSubscriptionEnvironmentAllowed({...policy, actual: 'PRODUCTION'}),
      ).toBe(true);
    } finally {
      if (savedEnvironment === undefined)
        delete process.env.IAPKIT_EXPECTED_ENVIRONMENT;
      else process.env.IAPKIT_EXPECTED_ENVIRONMENT = savedEnvironment;
      if (savedAccounts === undefined)
        delete process.env.IAPKIT_SANDBOX_APP_USER_IDS;
      else process.env.IAPKIT_SANDBOX_APP_USER_IDS = savedAccounts;
    }
  });
});
