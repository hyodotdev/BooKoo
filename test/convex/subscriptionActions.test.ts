import {refresh, refreshUser, verify} from '../../convex/subscriptions/actions';
import {enforceRateLimit} from '../../convex/lib/rateLimits';

jest.mock('../../convex/lib/rateLimits', () => ({
  enforceRateLimit: jest.fn(async () => undefined),
}));

function handler(
  value: object,
): (ctx: object, args: object) => Promise<unknown> {
  const registered: unknown = Reflect.get(value, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}
const caller = {
  userId: 'caller',
  migrated: true,
  hasPurchases: true,
  purchaseRevision: null,
  eventId: null,
  environment: 'PRODUCTION',
  updatedAt: 123,
  providerSubscriptionId: 'subscription-1',
  productId: 'dev.hyo.bookoo.pro.monthly',
  store: 'APP_STORE',
  status: 'EXPIRED',
  expiresAt: 1,
};
// Only the provider stub authenticates this fixture; production never trusts
// the decoded transaction identifier until verify reports a valid receipt.
const jws = `e30.${Buffer.from(JSON.stringify({originalTransactionId: 'transaction-1'})).toString('base64url')}.signature`;
const proof = {
  expectedUserId: 'caller',
  store: 'apple',
  productId: 'dev.hyo.bookoo.pro.monthly',
  proof: jws,
};
const valid = {
  store: 'apple',
  isValid: true,
  productId: proof.productId,
  state: 'ENTITLED',
  environment: 'Production',
};
const record = {
  id: 'subscription-1',
  purchaseToken: 'transaction-1',
  userId: 'caller',
  platform: 'IOS',
  productId: proof.productId,
  state: 'Active',
  updatedAt: 456,
  expiresAt: 1_900_000_000_000,
};
const status = {
  userId: 'caller',
  productIds: [record.productId],
  subscriptions: [record],
};

describe('authenticated IAPKit purchase actions', () => {
  const original = process.env.IAPKIT_PUBLISHABLE_KEY;
  const originalSecret = process.env.IAPKIT_SECRET_KEY;
  const originalEnvironment = process.env.IAPKIT_EXPECTED_ENVIRONMENT;
  const originalReviewers = process.env.IAPKIT_SANDBOX_APP_USER_IDS;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(enforceRateLimit).mockResolvedValue(undefined);
    process.env.IAPKIT_PUBLISHABLE_KEY = 'public-test';
    process.env.IAPKIT_SECRET_KEY = 'secret-test';
    process.env.IAPKIT_EXPECTED_ENVIRONMENT = 'PRODUCTION';
    process.env.IAPKIT_SANDBOX_APP_USER_IDS = 'caller';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) delete process.env.IAPKIT_PUBLISHABLE_KEY;
    else process.env.IAPKIT_PUBLISHABLE_KEY = original;
    if (originalSecret === undefined) delete process.env.IAPKIT_SECRET_KEY;
    else process.env.IAPKIT_SECRET_KEY = originalSecret;
    for (const [name, value] of [
      ['IAPKIT_EXPECTED_ENVIRONMENT', originalEnvironment],
      ['IAPKIT_SANDBOX_APP_USER_IDS', originalReviewers],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  });
  function setup(bodies: unknown[]) {
    const runQuery = jest.fn(async (reference: unknown): Promise<unknown> => {
      if (
        typeof reference === 'object' &&
        reference !== null &&
        Reflect.get(reference, Symbol.for('functionName')) ===
          'subscriptions/internalQueries:revocationState'
      )
        return null;
      return caller;
    });
    const runMutation = jest.fn(async (_reference: unknown, _args: object) => ({
      applied: true,
    }));
    const requests = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(bodies.shift()), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
    );
    return {ctx: {runQuery, runMutation}, runQuery, runMutation, requests};
  }
  it('authenticates before sending purchase proof', async () => {
    const test = setup([]);
    test.runQuery.mockRejectedValueOnce(new Error('Unauthorized'));
    await expect(handler(verify)(test.ctx, proof)).rejects.toThrow(
      'Unauthorized',
    );
    expect(test.requests).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
  it('limits the authenticated account before any provider verification', async () => {
    const test = setup([valid]);
    jest
      .mocked(enforceRateLimit)
      .mockRejectedValueOnce(new Error('RATE_LIMITED'));
    await expect(handler(verify)(test.ctx, proof)).rejects.toThrow(
      'RATE_LIMITED',
    );
    expect(enforceRateLimit).toHaveBeenCalledWith(
      test.ctx,
      'subscriptionVerify',
      'caller',
    );
    expect(test.requests).not.toHaveBeenCalled();
    expect(test.runMutation).not.toHaveBeenCalled();
  });
  it('also limits public refresh without limiting trusted lifecycle jobs', async () => {
    const test = setup([]);
    jest
      .mocked(enforceRateLimit)
      .mockRejectedValueOnce(new Error('RATE_LIMITED'));
    await expect(handler(refresh)(test.ctx, {})).rejects.toThrow(
      'RATE_LIMITED',
    );
    expect(enforceRateLimit).toHaveBeenCalledWith(
      test.ctx,
      'subscriptionRefresh',
      'caller',
    );
    expect(test.requests).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'PROD', 'production'])(
    'refuses checkout with invalid deployment environment %s',
    async (environment) => {
      const test = setup([valid]);
      if (environment === undefined)
        delete process.env.IAPKIT_EXPECTED_ENVIRONMENT;
      else process.env.IAPKIT_EXPECTED_ENVIRONMENT = environment;
      expect(await handler(verify)(test.ctx, proof)).toEqual({
        verified: false,
        refreshed: false,
      });
      expect(test.requests).not.toHaveBeenCalled();
      expect(enforceRateLimit).not.toHaveBeenCalled();
    },
  );
  it('rejects a foreign product and does not bind or finish it', async () => {
    const test = setup([{...valid, productId: 'foreign-product'}]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
    expect(test.requests).toHaveBeenCalledTimes(1);
    expect(test.runMutation).not.toHaveBeenCalled();
  });
  it('binds only to the authenticated caller and refreshes with a revision guard', async () => {
    const test = setup([valid, {ok: true, bound: true}, status]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: true,
      refreshed: true,
    });
    expect(test.requests.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer public-test',
    });
    // Linking a verified receipt is an administrative backend operation.
    expect(test.requests.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer secret-test',
    });
    expect(test.requests.mock.calls[1][1]?.body).toBe(
      JSON.stringify({purchaseToken: jws, userId: 'caller'}),
    );
    expect(test.runMutation.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({userId: 'caller', expectedUpdatedAt: 123}),
      ]),
    );
    expect(test.requests.mock.calls[2][0]).toContain(
      '/v1/subscriptions/entitlements?',
    );
    expect(test.requests.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer secret-test',
    });
    const mutationBody = test.runMutation.mock.calls[0][1];
    expect(JSON.stringify(mutationBody)).not.toContain('transaction-1');
    expect(JSON.stringify(mutationBody)).not.toContain(jws);
  });
  it('does not report a purchased entitlement for an inactive successful refresh', async () => {
    const test = setup([
      valid,
      {ok: true, bound: true},
      {userId: 'caller', productIds: [], subscriptions: []},
    ]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
  });
  it('refuses an immutable foreign binding', async () => {
    const test = setup([valid, {ok: false, bound: false}]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
    expect(test.requests).toHaveBeenCalledTimes(2);
  });
  it('reports a verified receipt that cannot link without moving its owner', async () => {
    const test = setup([valid, {ok: true, bound: false}]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
      blocker: 'ACCOUNT_LINK_REQUIRED',
    });
    expect(test.requests).toHaveBeenCalledTimes(2);
    expect(test.runMutation).not.toHaveBeenCalled();
  });
  it('explains a valid Apple test purchase for an unenrolled account', async () => {
    process.env.IAPKIT_SANDBOX_APP_USER_IDS = 'other-reviewer';
    const test = setup([{...valid, environment: 'Sandbox'}]);
    test.runQuery.mockResolvedValue({...caller, environment: undefined});
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
      blocker: 'TEST_ACCOUNT_REQUIRED',
    });
    expect(test.requests).toHaveBeenCalledTimes(1);
    expect(test.runMutation).not.toHaveBeenCalled();
  });
  it('retries the exact receipt with a fresh revision after another purchase wins', async () => {
    const test = setup([valid, {ok: true, bound: true}, status, status]);
    test.runMutation.mockResolvedValueOnce({applied: false});
    test.runQuery
      .mockResolvedValueOnce(caller)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({...caller, purchaseRevision: 1, updatedAt: 456});
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: true,
      refreshed: true,
    });
    expect(test.runMutation).toHaveBeenCalledTimes(2);
    expect(test.runMutation.mock.calls[1][1]).toMatchObject({
      expectedPurchaseRevision: 1,
      expectedUpdatedAt: 456,
      expectedRevocationEventId: null,
    });
    expect(test.runMutation.mock.calls[1][1]).toMatchObject({
      body: Reflect.get(test.runMutation.mock.calls[0][1], 'body'),
    });
    expect(test.requests).toHaveBeenCalledTimes(4);
  });
  it('does not finish an unrecorded receipt just because another purchase grants access', async () => {
    const test = setup([
      valid,
      {ok: true, bound: true},
      status,
      status,
      status,
    ]);
    const activeCaller = {
      ...caller,
      status: 'ACTIVE',
      expiresAt: Date.now() + 60000,
      providerSubscriptionId: 'other-purchase',
    };
    test.runQuery.mockImplementation(async (reference: unknown) =>
      typeof reference === 'object' &&
      reference !== null &&
      Reflect.get(reference, Symbol.for('functionName')) ===
        'subscriptions/internalQueries:revocationState'
        ? null
        : activeCaller,
    );
    test.runMutation.mockResolvedValue({applied: false});
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
    expect(test.runMutation).toHaveBeenCalledTimes(3);
    for (const [, args] of test.runMutation.mock.calls)
      expect(args).toMatchObject({expectedRevocationEventId: null});
    expect(
      test.requests.mock.calls.every(([url]) => !String(url).includes('/v2/')),
    ).toBe(true);
  });
  it('stops a receipt retry if the authenticated account changes', async () => {
    const test = setup([valid, {ok: true, bound: true}, status]);
    test.runMutation.mockResolvedValue({applied: false});
    test.runQuery
      .mockResolvedValueOnce(caller)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({...caller, userId: 'new-account'});
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
    expect(test.requests).toHaveBeenCalledTimes(3);
    expect(test.runMutation).toHaveBeenCalledTimes(1);
  });
  it('does not erase legacy access from an empty new project', async () => {
    const test = setup([]);
    test.runQuery.mockResolvedValueOnce({
      ...caller,
      migrated: false,
      hasPurchases: false,
    });
    expect(await handler(refresh)(test.ctx, {})).toEqual({refreshed: false});
    expect(test.requests).not.toHaveBeenCalled();
  });
  it.each([
    {...caller, migrated: false, environment: undefined, updatedAt: undefined},
    {...caller, migrated: false, environment: undefined},
  ])(
    'restores a verified purchase without waiting for its first webhook',
    async (existing) => {
      const test = setup([valid, {ok: true, bound: true}, status]);
      test.runQuery.mockResolvedValueOnce(existing);
      expect(await handler(verify)(test.ctx, proof)).toEqual({
        verified: true,
        refreshed: true,
      });
      expect(test.runMutation.mock.calls[0][1]).toMatchObject({
        expectedUpdatedAt:
          'updatedAt' in existing ? existing.updatedAt : undefined,
        environment: 'PRODUCTION',
        expectedRevocationEventId: null,
      });
    },
  );
  it.each(['Sandbox', undefined, 'unknown'])(
    'rejects an untrusted or weaker environment before binding: %s',
    async (environment) => {
      const test = setup([{...valid, environment}]);
      expect(await handler(verify)(test.ctx, proof)).toEqual({
        verified: false,
        refreshed: false,
        ...(environment === 'Sandbox'
          ? {blocker: 'ACCOUNT_LINK_REQUIRED'}
          : {}),
      });
      expect(test.requests).toHaveBeenCalledTimes(1);
      expect(test.runMutation).not.toHaveBeenCalled();
    },
  );
  it('never binds Google sandbox purchases in production', async () => {
    const test = setup([
      {...valid, store: 'google', productId: 'pro', environment: 'Sandbox'},
    ]);
    test.runQuery.mockResolvedValueOnce({...caller, environment: undefined});
    expect(
      await handler(verify)(test.ctx, {
        store: 'google',
        expectedUserId: 'caller',
        productId: 'pro',
        proof: 'opaque-token',
      }),
    ).toEqual({verified: false, refreshed: false});
    expect(test.requests).toHaveBeenCalledTimes(1);
  });
  it('bootstraps only an enrolled Apple reviewer from its verified sandbox receipt', async () => {
    const test = setup([
      {...valid, environment: 'Sandbox'},
      {ok: true, bound: true},
      status,
    ]);
    test.runQuery.mockResolvedValue({
      ...caller,
      migrated: false,
      environment: undefined,
    });
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: true,
      refreshed: true,
    });
    expect(test.runMutation.mock.calls[0][1]).toMatchObject({
      environment: 'SANDBOX',
    });
  });
  it('rejects a queued purchase after the authenticated account changes', async () => {
    const test = setup([valid]);
    test.runQuery.mockResolvedValue({...caller, userId: 'next-account'});
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: false,
      refreshed: false,
    });
    expect(test.requests).not.toHaveBeenCalled();
    expect(test.runMutation).not.toHaveBeenCalled();
  });
  it.each([
    {purchaseToken: 'another-receipt'},
    {userId: 'another-user'},
    {productId: 'dev.hyo.bookoo.pro.annual'},
    {id: undefined},
    {platform: 'Android'},
    {expiresAt: 1},
  ])(
    'never bootstraps from an unrelated or expired provider record: %j',
    async (other) => {
      const test = setup([
        valid,
        {ok: true, bound: true},
        {...status, subscriptions: [{...record, ...other}]},
      ]);
      test.runQuery.mockResolvedValue({
        ...caller,
        migrated: false,
        hasPurchases: false,
      });
      expect(await handler(verify)(test.ctx, proof)).toEqual({
        verified: false,
        refreshed: false,
      });
      expect(test.runMutation).not.toHaveBeenCalled();
    },
  );
  it('keeps trusted live access when a different record cannot refresh its anchor', async () => {
    const test = setup([
      {...status, subscriptions: [{...record, id: 'sandbox-record'}]},
    ]);
    test.runQuery.mockResolvedValue({
      ...caller,
      status: 'ACTIVE',
      expiresAt: Date.now() + 60000,
    });
    test.runMutation.mockResolvedValue({applied: false});
    expect(await handler(refresh)(test.ctx, {})).toEqual({refreshed: true});
  });
  it('matches an older active receipt while another store record was updated most recently', async () => {
    const other = {
      ...record,
      id: 'other-store',
      platform: 'Android',
      productId: 'pro',
      purchaseToken: 'other-token',
      updatedAt: 999,
    };
    const test = setup([
      valid,
      {ok: true, bound: true},
      {
        userId: 'caller',
        productIds: [other.productId, record.productId],
        subscriptions: [other, record],
      },
    ]);
    expect(await handler(verify)(test.ctx, proof)).toEqual({
      verified: true,
      refreshed: true,
    });
    expect(test.runMutation.mock.calls[0][1]).toMatchObject({
      body: expect.stringContaining('subscription-1'),
    });
    expect(JSON.stringify(test.runMutation.mock.calls[0][1])).not.toContain(
      'other-token',
    );
  });
  it('retries a guarded lifecycle race with a fresh marker and provider snapshot', async () => {
    const test = setup([
      status,
      {userId: 'caller', productIds: [], subscriptions: []},
    ]);
    let revision = 7;
    const runQuery = jest.fn(async () => ({
      purchaseRevision: revision,
      eventId: 'event',
    }));
    const runAfter = jest.fn(async () => undefined);
    test.runMutation.mockResolvedValueOnce({applied: false});
    const ctx = {...test.ctx, runQuery, scheduler: {runAfter}};
    await handler(refreshUser)(ctx, {userId: 'caller'});
    expect(runAfter).toHaveBeenCalledWith(60000, expect.anything(), {
      userId: 'caller',
      attempt: 1,
    });
    revision = 8;
    await handler(refreshUser)(ctx, {userId: 'caller', attempt: 1});
    expect(test.requests).toHaveBeenCalledTimes(2);
    expect(test.runMutation.mock.calls[1][1]).toMatchObject({
      expectedPurchaseRevision: 8,
      body: JSON.stringify({
        userId: 'caller',
        productIds: [],
        subscriptions: [],
      }),
    });
    expect(runAfter).toHaveBeenCalledTimes(1);
  });
  it('retries a failed scheduled entitlement lookup instead of losing the acknowledged event', async () => {
    const test = setup([]);
    const runQuery = jest.fn(async () => true);
    const runAfter = jest.fn(async () => undefined);
    expect(
      await handler(refreshUser)(
        {...test.ctx, runQuery, scheduler: {runAfter}},
        {userId: 'caller'},
      ),
    ).toBeNull();
    expect(runAfter).toHaveBeenCalledWith(60000, expect.anything(), {
      userId: 'caller',
      attempt: 1,
    });
    await expect(
      handler(refreshUser)(
        {...test.ctx, runQuery, scheduler: {runAfter}},
        {userId: 'caller', attempt: 5},
      ),
    ).rejects.toThrow('operational retry');
  });
  it('retries an incomplete provider envelope without applying its empty set', async () => {
    const test = setup([{userId: 'caller', subscriptions: []}]);
    const runAfter = jest.fn(async () => undefined);
    await handler(refreshUser)(
      {...test.ctx, scheduler: {runAfter}},
      {userId: 'caller'},
    );
    expect(test.runMutation).not.toHaveBeenCalled();
    expect(runAfter).toHaveBeenCalledWith(60000, expect.anything(), {
      userId: 'caller',
      attempt: 1,
    });
  });
});
