import {
  applySubscriberSnapshot,
  applyWebhookEvent,
  applyEntitlementSnapshotPage,
} from '../../convex/subscriptions/internal';
import {mine} from '../../convex/subscriptions/queries';
import {getAuthUserId} from '@convex-dev/auth/server';
import type {Id} from '../../convex/_generated/dataModel';

jest.mock('@convex-dev/auth/server', () => ({getAuthUserId: jest.fn()}), {
  virtual: true,
});

type Row = Record<string, unknown>;
function handler(
  value: object,
): (ctx: object, args: object) => Promise<unknown> {
  const candidate: unknown = Reflect.get(value, '_handler');
  if (typeof candidate !== 'function') throw new Error('Missing handler');
  return (ctx, args) => candidate(ctx, args);
}

/** Small indexed fixture; the registered mutations/trigger wrappers actually run. */
function database() {
  const tables = new Map<string, Map<string, Row>>();
  let sequence = 0;
  const table = (name: string): Map<string, Row> => {
    const rows = tables.get(name) ?? new Map<string, Row>();
    tables.set(name, rows);
    return rows;
  };
  const db = {
    get: async (name: string, id: string): Promise<Row | null> =>
      table(name).get(id) ?? null,
    normalizeId: (name: string, id: string): string | null =>
      id.startsWith(`${name}:`) ? id : null,
    query: (name: string) => ({
      withIndex: (index: string, select: (q: object) => unknown) => {
        const eq = new Map<string, unknown>();
        const gt = new Map<string, number>();
        const q = {
          eq: (field: string, value: unknown): object => {
            eq.set(field, value);
            return q;
          },
          gt: (field: string, value: number): object => {
            gt.set(field, value);
            return q;
          },
        };
        select(q);
        let descending = false;
        const rows = (): Row[] => {
          const field = index.split('_').at(-1)!;
          return [...table(name).values()]
            .filter(
              (row) =>
                [...eq].every(([key, value]) => row[key] === value) &&
                [...gt].every(([key, value]) => Number(row[key]) > value),
            )
            .sort(
              (a, b) =>
                (Number(a[field] ?? 0) - Number(b[field] ?? 0)) *
                (descending ? -1 : 1),
            );
        };
        const result = {
          unique: async (): Promise<Row | null> => {
            const found = rows();
            if (found.length > 1) throw new Error('Duplicate indexed row');
            return found[0] ?? null;
          },
          first: async (): Promise<Row | null> => rows()[0] ?? null,
          order: (direction: string) => {
            descending = direction === 'desc';
            return result;
          },
          paginate: async (opts: {numItems: number; cursor: string | null}) => {
            const found = rows();
            const offset = Number(opts.cursor ?? 0);
            const end = offset + opts.numItems;
            return {
              page: found.slice(offset, end),
              isDone: end >= found.length,
              continueCursor: String(end),
            };
          },
        };
        return result;
      },
    }),
    insert: async (name: string, value: Row): Promise<string> => {
      const id = `${name}:${++sequence}`;
      table(name).set(id, {...value, _id: id, _creationTime: Date.now()});
      return id;
    },
    patch: async (name: string, id: string, value: Row): Promise<void> => {
      const row = table(name).get(id);
      if (!row) throw new Error('Missing patch target');
      for (const [key, next] of Object.entries(value)) {
        if (next === undefined) delete row[key];
        else row[key] = next;
      }
    },
  };
  const runAfter = jest.fn(
    async (_delay: number, _reference: unknown, _args: object) => undefined,
  );
  return {ctx: {db, scheduler: {runAfter}}, table, runAfter};
}
const AT = 1_800_000_000_000;
const USER = 'users:review' as Id<'users'>;
const apple = {
  id: 'apple-1',
  userId: USER,
  productId: 'dev.hyo.bookoo.pro.monthly',
  platform: 'IOS',
  state: 'Active',
  expiresAt: AT + 300000,
  updatedAt: AT,
  willRenew: true,
};
const google = {
  ...apple,
  id: 'google-1',
  productId: 'pro',
  platform: 'Android',
  expiresAt: AT + 600000,
};
function event(overrides: Row = {}): Row {
  return {
    eventId: 'event-1',
    eventType: 'subscription.refunded',
    eventVersion: '1.0',
    projectId: 'kit-project',
    applicationId: 'dev.hyo.bookoo',
    userId: USER,
    store: 'apple',
    environment: 'production',
    occurredAt: AT,
    subscription: {
      state: 'Refunded',
      active: false,
      productId: apple.productId,
      updatedAt: AT,
    },
    ...overrides,
  };
}
const webhookArgs = (value: Row) => ({
  body: JSON.stringify(value),
  payloadDigest: 'digest',
});
describe('purchase-owned subscription projection', () => {
  const environment = process.env.IAPKIT_EXPECTED_ENVIRONMENT;
  const accounts = process.env.IAPKIT_SANDBOX_APP_USER_IDS;
  const project = process.env.IAPKIT_PROJECT_ID;
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AT);
    process.env.IAPKIT_EXPECTED_ENVIRONMENT = 'PRODUCTION';
    process.env.IAPKIT_SANDBOX_APP_USER_IDS = USER;
    process.env.IAPKIT_PROJECT_ID = 'kit-project';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of [
      ['IAPKIT_EXPECTED_ENVIRONMENT', environment],
      ['IAPKIT_SANDBOX_APP_USER_IDS', accounts],
      ['IAPKIT_PROJECT_ID', project],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  });
  const setup = () => {
    const test = database();
    test.table('users').set(USER, {_id: USER});
    test.table('userProfiles').set('profile', {userId: USER});
    return test;
  };
  const projected = (test: ReturnType<typeof setup>): Row =>
    [...test.table('subscribers').values()][0];
  const bootstrap = async (
    test: ReturnType<typeof setup>,
    purchase: Row = apple,
    environment = 'PRODUCTION',
  ) =>
    handler(applySubscriberSnapshot)(test.ctx, {
      userId: USER,
      environment,
      expectedPurchaseRevision: projected(test)?.purchaseRevision ?? null,
      expectedRevocationEventId: null,
      expectedUpdatedAt: projected(test)?.updatedAt,
      body: JSON.stringify({active: true, subscription: purchase}),
    });
  const reconcile = async (
    test: ReturnType<typeof setup>,
    purchases: Row[],
    observedAt = AT,
  ) =>
    handler(applyEntitlementSnapshotPage)(test.ctx, {
      userId: USER,
      expectedPurchaseRevision: projected(test)?.purchaseRevision ?? null,
      expectedEventId:
        observedAt < Date.now()
          ? null
          : ([...test.table('subscriptionEvents').values()]
              .filter((e) => e.outcome === 'RECONCILE_SCHEDULED')
              .at(-1)?._id ?? null),
      body: JSON.stringify({
        userId: USER,
        productIds: [...new Set(purchases.map((p) => p.productId))],
        subscriptions: purchases,
      }),
      paginationOpts: {numItems: 32, cursor: null},
    });
  it('bootstraps the first verified purchase without a webhook and stores no token', async () => {
    expect(await bootstrap(setup(), {...apple, userId: 'other'})).toEqual({
      applied: false,
    });
    const test = setup();
    expect(
      await bootstrap(test, {...apple, purchaseToken: 'never-stored'}),
    ).toEqual({applied: true});
    expect(projected(test)).toMatchObject({
      provider: 'iapkit',
      status: 'ACTIVE',
      providerSubscriptionId: 'apple-1',
    });
    expect(
      [...test.table('subscriptionPurchases').values()][0].purchaseToken,
    ).toBeUndefined();
  });
  it('preserves another active store when the projected purchase expires', async () => {
    const test = setup();
    await bootstrap(test);
    await bootstrap(test, google);
    expect(projected(test).providerSubscriptionId).toBe('google-1');
    await reconcile(test, [apple]);
    expect(projected(test)).toMatchObject({
      status: 'ACTIVE',
      providerSubscriptionId: 'apple-1',
      expiresAt: apple.expiresAt,
    });
  });
  it('does not let a same-SKU resubscription refund erase another active receipt', async () => {
    const test = setup();
    const other = {...apple, id: 'apple-2', expiresAt: AT + 900000};
    await bootstrap(test);
    await bootstrap(test, other);
    await handler(applyWebhookEvent)(test.ctx, webhookArgs(event()));
    expect(projected(test).status).toBe('ACTIVE');
    await reconcile(test, [apple]);
    expect(projected(test)).toMatchObject({
      status: 'ACTIVE',
      providerSubscriptionId: 'apple-1',
    });
    expect(
      [...test.table('subscriptionPurchases').values()].find(
        (p) => p.providerSubscriptionId === 'apple-2',
      )?.status,
    ).toBe('EXPIRED');
  });
  it('selects the longest access rather than the most recently updated purchase', async () => {
    const test = setup();
    await bootstrap(test, {...apple, expiresAt: AT + 900000});
    await bootstrap(test, google);
    expect(projected(test)).toMatchObject({
      providerSubscriptionId: 'apple-1',
      expiresAt: AT + 900000,
    });
  });
  it('cannot grant an unverified same-SKU sandbox provider id', async () => {
    const test = setup();
    await bootstrap(test);
    await reconcile(test, [
      {...apple, id: 'sandbox-record', expiresAt: AT + 900000},
    ]);
    expect(projected(test).status).toBe('EXPIRED');
    expect(test.table('subscriptionPurchases').size).toBe(1);
  });
  it('a real production purchase takes priority over a longer review sandbox purchase', async () => {
    const test = setup();
    await bootstrap(test, {...apple, expiresAt: AT + 900000}, 'SANDBOX');
    await bootstrap(test, google);
    expect(projected(test)).toMatchObject({
      environment: 'PRODUCTION',
      providerSubscriptionId: 'google-1',
    });
    await reconcile(test, [apple]);
    expect(projected(test).status).toBe('EXPIRED');
    expect(await bootstrap(test, apple, 'SANDBOX')).toEqual({applied: false});
  });
  it('keeps cancellation access to effective expiry and revokes only when no purchase remains', async () => {
    const test = setup();
    await bootstrap(test);
    await reconcile(test, [{...apple, willRenew: false}]);
    expect(projected(test)).toMatchObject({
      status: 'ACTIVE',
      willRenew: false,
      expiresAt: apple.expiresAt,
    });
    await reconcile(test, []);
    expect(projected(test).status).toBe('EXPIRED');
  });
  it.each(['Paused', 'InBillingRetry'])(
    'removes access after %s through the providers active-only response',
    async (state) => {
      const test = setup();
      await bootstrap(test);
      await handler(applyWebhookEvent)(
        test.ctx,
        webhookArgs(
          event({
            eventType:
              state === 'Paused'
                ? 'subscription.paused'
                : 'subscription.entered_billing_retry',
            subscription: {...apple, state, active: false},
          }),
        ),
      );
      // IAPKit entitlementsV2 filters isEntitledAt: Active/InGracePeriod only.
      // The paused/retry record is absent even while its stored expiry is future.
      expect(await reconcile(test, [])).toEqual({applied: true});
      expect(projected(test).status).toBe('EXPIRED');
      expect([...test.table('subscriptionPurchases').values()][0].status).toBe(
        'EXPIRED',
      );
    },
  );
  it('never revives a deleted account', async () => {
    const test = setup();
    test.table('userProfiles').get('profile')!.deletedAt = AT;
    expect(await bootstrap(test)).toEqual({applied: false});
    expect(await reconcile(test, [apple])).toEqual({applied: false});
    expect(test.table('subscribers').size).toBe(0);
  });
  it.each(['deleted', 'purged', 'missing-profile'])(
    'does not recreate a billing journal for a %s account',
    async (state) => {
      const test = setup();
      if (state === 'missing-profile') test.table('userProfiles').clear();
      else
        test.table('userProfiles').get('profile')![
          state === 'deleted' ? 'deletedAt' : 'purgedAt'
        ] = AT;
      const args = webhookArgs(event());
      expect(await handler(applyWebhookEvent)(test.ctx, args)).toEqual({
        outcome: 'UNKNOWN_SUBSCRIBER',
      });
      await handler(applyWebhookEvent)(test.ctx, args);
      expect(test.table('subscriptionEvents').size).toBe(0);
      expect(test.table('subscriptionPurchases').size).toBe(0);
      expect(test.runAfter).not.toHaveBeenCalled();
    },
  );
  it('disables checkout when all keys exist but the environment is not configured', async () => {
    const test = setup();
    jest.mocked(getAuthUserId).mockResolvedValue(USER);
    const names = [
      'IAPKIT_PUBLISHABLE_KEY',
      'IAPKIT_SECRET_KEY',
      'IAPKIT_PROJECT_ID',
      'IAPKIT_WEBHOOK_SECRET',
    ];
    const saved = names.map((name) => process.env[name]);
    try {
      for (const name of names) process.env[name] = 'synthetic';
      delete process.env.IAPKIT_EXPECTED_ENVIRONMENT;
      expect(await handler(mine)(test.ctx, {})).toMatchObject({
        billingReady: false,
        status: 'NONE',
      });
      process.env.IAPKIT_EXPECTED_ENVIRONMENT = 'SANDBOX';
      expect(await handler(mine)(test.ctx, {})).toMatchObject({
        billingReady: true,
      });
    } finally {
      names.forEach((name, i) => {
        if (saved[i] === undefined) delete process.env[name];
        else process.env[name] = saved[i];
      });
    }
  });
  it('refuses a provider id already owned by another account', async () => {
    const test = setup();
    test.table('subscriptionPurchases').set('foreign', {
      _id: 'foreign',
      userId: 'users:other',
      providerSubscriptionId: apple.id,
      environment: 'PRODUCTION',
    });
    expect(await bootstrap(test)).toEqual({applied: false});
    expect(test.table('subscribers').size).toBe(0);
  });
  it('a malformed authoritative response cannot erase confirmed access', async () => {
    const test = setup();
    await bootstrap(test);
    expect(await reconcile(test, [{...apple, userId: 'other'}])).toEqual({
      applied: false,
    });
    expect(projected(test).status).toBe('ACTIVE');
  });
  it('an incomplete empty envelope cannot revoke confirmed access', async () => {
    const test = setup();
    await bootstrap(test);
    const before = {...projected(test)};
    expect(
      await handler(applyEntitlementSnapshotPage)(test.ctx, {
        userId: USER,
        body: JSON.stringify({userId: USER, subscriptions: []}),
        expectedPurchaseRevision: projected(test).purchaseRevision,
        expectedEventId: null,
        paginationOpts: {numItems: 32, cursor: null},
      }),
    ).toEqual({applied: false});
    expect(projected(test)).toEqual(before);
    expect([...test.table('subscriptionPurchases').values()][0].status).toBe(
      'ACTIVE',
    );
  });
  it('accepts an account-scoped active response with no duplicated nested user id', async () => {
    const test = setup();
    await bootstrap(test);
    const {userId: _userId, ...tokenless} = apple;
    expect(await reconcile(test, [{...tokenless, willRenew: false}])).toEqual({
      applied: true,
    });
    expect(projected(test)).toMatchObject({status: 'ACTIVE', willRenew: false});
  });
  it('a response captured before a new purchase cannot erase it within the same millisecond', async () => {
    const test = setup();
    await bootstrap(test);
    expect(
      await handler(applyEntitlementSnapshotPage)(test.ctx, {
        userId: USER,
        body: JSON.stringify({userId: USER, productIds: [], subscriptions: []}),
        expectedPurchaseRevision: null,
        expectedEventId: null,
        paginationOpts: {numItems: 32, cursor: null},
      }),
    ).toEqual({applied: false});
    expect(projected(test).status).toBe('ACTIVE');
  });
  it('journals and schedules a signed lifecycle once, without an arbitrary direct grant', async () => {
    const test = setup();
    const args = webhookArgs(event());
    expect(await handler(applyWebhookEvent)(test.ctx, args)).toEqual({
      outcome: 'RECONCILE_SCHEDULED',
    });
    await handler(applyWebhookEvent)(test.ctx, args);
    expect(test.runAfter).toHaveBeenCalledTimes(1);
    expect(test.table('subscribers').size).toBe(0);
    expect(
      [...test.table('subscriptionEvents').values()][0].body,
    ).toBeUndefined();
  });
  it('journals the signed occurrence time independently from a refreshed snapshot', async () => {
    const test = setup();
    const delayed = event();
    const subscription = delayed.subscription;
    if (typeof subscription !== 'object' || subscription === null)
      throw new Error('Missing fixture subscription');
    await handler(applyWebhookEvent)(
      test.ctx,
      webhookArgs({
        ...delayed,
        subscription: {...subscription, updatedAt: AT + 10000},
      }),
    );
    expect([...test.table('subscriptionEvents').values()][0]).toMatchObject({
      eventAt: AT,
      receivedAt: AT,
    });
  });
  it('acknowledges a valid unknown state without changing existing access', async () => {
    const test = setup();
    await bootstrap(test);
    const before = {...projected(test)};
    expect(
      await handler(applyWebhookEvent)(
        test.ctx,
        webhookArgs(
          event({
            subscription: {
              state: 'Unknown',
              active: false,
              productId: apple.productId,
            },
          }),
        ),
      ),
    ).toEqual({outcome: 'UNHANDLED_TYPE'});
    expect(projected(test)).toEqual(before);
    expect(test.runAfter).not.toHaveBeenCalled();
  });
  it('journals a future event type without reconciling its otherwise valid active snapshot', async () => {
    const test = setup();
    await bootstrap(test);
    const before = {...projected(test)};
    expect(
      await handler(applyWebhookEvent)(
        test.ctx,
        webhookArgs(
          event({
            eventType: 'subscription.future_transition',
            subscription: {...apple, active: true},
          }),
        ),
      ),
    ).toEqual({outcome: 'UNHANDLED_TYPE'});
    expect(projected(test)).toEqual(before);
    expect([...test.table('subscriptionEvents').values()][0].outcome).toBe(
      'UNHANDLED_TYPE',
    );
    expect(test.runAfter).not.toHaveBeenCalled();
  });
  it('rejects unapproved sandbox and unknown users before scheduling', async () => {
    const test = setup();
    process.env.IAPKIT_SANDBOX_APP_USER_IDS = '';
    expect(
      await handler(applyWebhookEvent)(
        test.ctx,
        webhookArgs(event({environment: 'sandbox'})),
      ),
    ).toEqual({outcome: 'IGNORED_ENVIRONMENT'});
    expect(
      await handler(applyWebhookEvent)(
        test.ctx,
        webhookArgs(event({eventId: 'other', userId: 'users:missing'})),
      ),
    ).toEqual({outcome: 'UNKNOWN_SUBSCRIBER'});
    expect(test.runAfter).not.toHaveBeenCalled();
  });
  it('a first bind replay does not block verified bootstrap but a newer refund does', async () => {
    const test = setup();
    await handler(applyWebhookEvent)(
      test.ctx,
      webhookArgs(
        event({
          subscription: {
            state: 'Active',
            active: true,
            productId: apple.productId,
            expiresAt: apple.expiresAt,
            updatedAt: AT + 10,
          },
        }),
      ),
    );
    expect(await bootstrap(test)).toEqual({applied: true});
    await handler(applyWebhookEvent)(
      test.ctx,
      webhookArgs(
        event({
          eventId: 'newer',
          subscription: {
            state: 'Refunded',
            active: false,
            productId: apple.productId,
            updatedAt: AT + 20,
          },
        }),
      ),
    );
    expect(await bootstrap(test)).toEqual({applied: false});
  });
  it('a stale in-flight entitlement read cannot reverse a newer received event', async () => {
    const test = setup();
    await bootstrap(test);
    jest.spyOn(Date, 'now').mockReturnValue(AT + 20);
    await handler(applyWebhookEvent)(test.ctx, webhookArgs(event()));
    expect(await reconcile(test, [], AT)).toEqual({applied: false});
    expect(projected(test).status).toBe('ACTIVE');
  });
  it('preserves a legacy other-store grant until confirmed expiry and consumes matching restore', async () => {
    const test = setup();
    test.table('subscribers').set('old', {
      _id: 'old',
      userId: USER,
      appUserId: USER,
      entitlementId: 'bookoo_pro',
      status: 'ACTIVE',
      environment: 'PRODUCTION',
      productId: 'pro:annual',
      store: 'PLAY_STORE',
      periodType: 'NORMAL',
      expiresAt: AT + 900000,
      willRenew: true,
      createdAt: AT - 1,
      updatedAt: AT - 1,
    });
    await bootstrap(test);
    expect(projected(test)).toMatchObject({
      status: 'ACTIVE',
      expiresAt: AT + 900000,
      legacyEntitlement: {store: 'PLAY_STORE'},
    });
    await bootstrap(test, google);
    expect(projected(test).legacyEntitlement).toBeUndefined();
    await reconcile(test, []);
    expect(projected(test).status).toBe('EXPIRED');
  });
  it('reconciles history in bounded pages while retaining the last live purchase', async () => {
    const test = setup();
    for (let index = 1; index <= 35; index++)
      test.table('subscriptionPurchases').set(`p:${index}`, {
        _id: `p:${index}`,
        userId: USER,
        providerSubscriptionId: `id-${index}`,
        environment: 'PRODUCTION',
        store: 'APP_STORE',
        productId: apple.productId,
        status: 'ACTIVE',
        expiresAt: AT + 600000,
        willRenew: true,
        hasBillingIssue: false,
        createdAt: index,
        updatedAt: AT - 1,
      });
    const live = {...apple, id: 'id-35'};
    await reconcile(test, [live]);
    expect(test.runAfter).toHaveBeenCalledTimes(1);
    const next = test.runAfter.mock.calls[0][2];
    await handler(applyEntitlementSnapshotPage)(test.ctx, next);
    expect(
      [...test.table('subscriptionPurchases').values()].filter(
        (p) => p.status === 'ACTIVE',
      ),
    ).toHaveLength(1);
    expect(projected(test).providerSubscriptionId).toBe('id-35');
  });
  it('finishes unchanged paginated history without purchase or projection writes', async () => {
    const test = setup();
    await bootstrap(test);
    for (let index = 1; index <= 35; index++)
      test.table('subscriptionPurchases').set(`p:${index}`, {
        _id: `p:${index}`,
        userId: USER,
        providerSubscriptionId: `old-${index}`,
        environment: 'PRODUCTION',
        store: 'APP_STORE',
        productId: apple.productId,
        status: 'EXPIRED',
        expiresAt: AT - 1,
        willRenew: false,
        hasBillingIssue: false,
        createdAt: index,
        updatedAt: AT - 2,
      });
    const before = {...projected(test)};
    jest.mocked(Date.now).mockReturnValue(AT + 1);
    const patch = jest.spyOn(test.ctx.db, 'patch');
    expect(await reconcile(test, [apple])).toEqual({applied: true});
    expect(test.runAfter).toHaveBeenCalledTimes(1);
    expect(
      await handler(applyEntitlementSnapshotPage)(
        test.ctx,
        test.runAfter.mock.calls[0][2],
      ),
    ).toEqual({applied: true});
    expect(patch).not.toHaveBeenCalled();
    expect(projected(test)).toEqual(before);
  });
  it('restarts a stale scheduled continuation instead of dropping its lifecycle refresh', async () => {
    const test = setup();
    await bootstrap(test);
    expect(
      await handler(applyEntitlementSnapshotPage)(test.ctx, {
        userId: USER,
        body: JSON.stringify({userId: USER, productIds: [], subscriptions: []}),
        expectedPurchaseRevision: null,
        expectedEventId: null,
        paginationOpts: {numItems: 32, cursor: '32'},
      }),
    ).toEqual({applied: false});
    expect(test.runAfter).toHaveBeenCalledWith(0, expect.anything(), {
      userId: USER,
    });
    expect(projected(test).status).toBe('ACTIVE');
  });
});
