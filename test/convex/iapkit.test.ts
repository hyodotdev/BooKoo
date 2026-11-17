import {webcrypto} from 'node:crypto';
import {handleIapkitWebhook} from '../../convex/subscriptions/http';
import {
  parseIapkitEvent,
  parseIapkitSnapshot,
  parseIapkitEntitlements,
  verifyIapkitSignature,
} from '../../convex/lib/iapkit';
const event = {
  eventId: 'synthetic',
  eventType: 'subscription.renewed',
  eventVersion: '1.0',
  occurredAt: 1800000000000,
  applicationId: 'dev.hyo.bookoo',
  userId: 'opaque-user',
  projectId: 'project',
  store: 'google',
  environment: 'production',
  subscription: {
    state: 'Active',
    active: true,
    productId: 'pro',
    expiresAt: 1800000300000,
  },
};
it('requires authoritative product, application and environment', () => {
  expect(parseIapkitEvent(event)).toMatchObject({
    status: 'ACTIVE',
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
  });
  expect(parseIapkitEvent({...event, applicationId: 'other'})).toBeNull();
  expect(parseIapkitEvent({...event, environment: 'unknown'})).toBeNull();
  expect(
    parseIapkitEvent({
      ...event,
      subscription: {...event.subscription, productId: 'unknown'},
    }),
  ).toBeNull();
});
it('preserves event occurrence separately from subscription update time', () => {
  expect(
    parseIapkitEvent({
      ...event,
      subscription: {
        ...event.subscription,
        updatedAt: event.occurredAt + 10000,
      },
    }),
  ).toMatchObject({
    occurredAt: event.occurredAt,
    updatedAt: event.occurredAt + 10000,
  });
});
it('accepts tokenless rows without the optional nested account id, but rejects mismatches', () => {
  const subscription = {
    id: 'verified-record',
    productId: 'pro',
    platform: 'Android',
    state: 'Active',
    startedAt: event.occurredAt,
    updatedAt: event.occurredAt,
    expiresAt: event.occurredAt + 300000,
  };
  const body = {
    userId: 'account',
    productIds: ['pro'],
    subscriptions: [subscription],
  };
  expect(parseIapkitEntitlements(body, 'account')).toHaveLength(1);
  expect(
    parseIapkitEntitlements({...body, userId: 'foreign'}, 'account'),
  ).toBeNull();
  expect(
    parseIapkitEntitlements(
      {
        ...body,
        subscriptions: [{...subscription, userId: 'foreign'}],
      },
      'account',
    ),
  ).toBeNull();
});
it.each([undefined, null, {}, ['pro', 1]])(
  'rejects an incomplete product envelope %p',
  (productIds) => {
    expect(
      parseIapkitEntitlements(
        {userId: 'account', productIds, subscriptions: []},
        'account',
      ),
    ).toBeNull();
    expect(
      parseIapkitEntitlements(
        {userId: 'account', productIds: [], subscriptions: []},
        'account',
      ),
    ).toEqual([]);
  },
);
it('rejects a declared active product whose subscription set is incomplete', () => {
  expect(
    parseIapkitEntitlements(
      {userId: 'account', productIds: ['pro'], subscriptions: []},
      'account',
    ),
  ).toBeNull();
  expect(
    parseIapkitEntitlements(
      {userId: 'account', productIds: ['unmodeled'], subscriptions: []},
      'account',
    ),
  ).toEqual([]);
});

it('acknowledges a correctly signed Unknown state through the real HTTP parser', async () => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  const secretBefore = process.env.IAPKIT_WEBHOOK_SECRET;
  const projectBefore = process.env.IAPKIT_PROJECT_ID;
  process.env.IAPKIT_WEBHOOK_SECRET = 'synthetic-secret';
  process.env.IAPKIT_PROJECT_ID = event.projectId;
  jest.spyOn(Date, 'now').mockReturnValue(event.occurredAt);
  try {
    const raw = JSON.stringify({
      ...event,
      subscription: {state: 'Unknown', active: false, productId: 'pro'},
    });
    const timestamp = String(event.occurredAt / 1000);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('synthetic-secret'),
      {name: 'HMAC', hash: 'SHA-256'},
      false,
      ['sign'],
    );
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    );
    const runMutation = jest.fn(async () => ({outcome: 'UNHANDLED_TYPE'}));
    const registered: unknown = Reflect.get(handleIapkitWebhook, '_handler');
    if (typeof registered !== 'function')
      throw new Error('HTTP handler missing');
    const response: Response = await registered(
      {runMutation},
      new Request('https://example.test/iapkit/webhook', {
        method: 'POST',
        body: raw,
        headers: {
          'openiap-event-id': event.eventId,
          'openiap-timestamp': timestamp,
          'openiap-signature': 'v1=' + Buffer.from(bytes).toString('hex'),
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({outcome: 'UNHANDLED_TYPE'});
    expect(runMutation).toHaveBeenCalledTimes(1);
  } finally {
    jest.restoreAllMocks();
    if (secretBefore === undefined) delete process.env.IAPKIT_WEBHOOK_SECRET;
    else process.env.IAPKIT_WEBHOOK_SECRET = secretBefore;
    if (projectBefore === undefined) delete process.env.IAPKIT_PROJECT_ID;
    else process.env.IAPKIT_PROJECT_ID = projectBefore;
  }
});
it('does not grant undated subscriptions or a paused state', () => {
  expect(
    parseIapkitSnapshot({
      state: 'Active',
      productId: 'pro',
      platform: 'Android',
      updatedAt: 1,
    }),
  ).toBeNull();
  expect(
    parseIapkitSnapshot({
      state: 'InBillingRetry',
      productId: 'pro',
      platform: 'Android',
      updatedAt: 1,
    }),
  ).toMatchObject({status: 'PAUSED'});
});
it('honors a false provider access decision even when the state is Active', () => {
  expect(
    parseIapkitEvent({
      ...event,
      subscription: {...event.subscription, active: false},
    }),
  ).toMatchObject({status: 'EXPIRED'});
});
it('authenticates raw bytes, rotating signatures, and both timestamp directions', async () => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  const secret = 'synthetic-webhook-secret';
  const timestamp = '1800000000';
  const raw = JSON.stringify(event);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${raw}`),
  );
  const signature = 'v1=' + Buffer.from(bytes).toString('hex');
  expect(
    await verifyIapkitSignature(
      raw,
      timestamp,
      signature,
      secret,
      1800000000000,
    ),
  ).toBe(true);
  expect(
    await verifyIapkitSignature(
      raw,
      timestamp,
      'v1=' + '0'.repeat(64) + ',' + signature,
      secret,
      1800000000000,
    ),
  ).toBe(true);
  expect(
    await verifyIapkitSignature(
      raw + ' ',
      timestamp,
      signature,
      secret,
      1800000000000,
    ),
  ).toBe(false);
  expect(
    await verifyIapkitSignature(
      raw,
      timestamp,
      signature,
      secret,
      1800000400000,
    ),
  ).toBe(false);
  expect(
    await verifyIapkitSignature(
      raw,
      timestamp,
      signature,
      secret,
      1799999600000,
    ),
  ).toBe(false);
});
