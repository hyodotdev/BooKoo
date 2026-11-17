import {
  setCountryAnalytics,
  touchPresence,
  completeLedgerStep,
} from '../../convex/user/mutations';
import {enforceRateLimit} from '../../convex/lib/rateLimits';
import {
  LEGAL_ACKNOWLEDGEMENT,
  LEGACY_LEGAL_ACKNOWLEDGEMENT,
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_DOCUMENT_SHA256,
} from '../../shared/legal';

const mockProfile: Record<string, unknown> = {
  _id: 'profile-example',
  userId: 'user-example',
  locale: 'en',
};
jest.mock('../../convex/lib/functions', () => ({
  mutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));
jest.mock('../../convex/lib/permissions', () => ({
  requireOnboarded: jest.fn(async () => mockProfile),
  requireActiveProfile: jest.fn(async () => mockProfile),
}));
jest.mock('../../convex/lib/rateLimits', () => ({
  enforceRateLimit: jest.fn(async () => undefined),
}));
function handler(
  fn: unknown,
): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (fn === null || (typeof fn !== 'function' && typeof fn !== 'object'))
    throw Error('Missing handler');
  const target: unknown = Reflect.get(fn, '_handler');
  if (typeof target !== 'function') throw Error('Missing handler');
  return (ctx, args) => target(ctx, args);
}
function context(presence: Record<string, unknown> | null = null) {
  type Index = {eq: (field: string, value: unknown) => Index};
  const index: Index = {eq: () => index};
  return {
    db: {
      query: jest.fn(() => ({
        withIndex: jest.fn(
          (_name: string, build: (q: typeof index) => unknown) => {
            build(index);
            return {
              unique: async () => presence,
              order: () => ({first: async () => null}),
            };
          },
        ),
      })),
      insert: jest.fn(async () => 'insert-example'),
      patch: jest.fn(async () => undefined),
      replace: jest.fn(async () => undefined),
    },
  };
}
const payload = {
  platform: 'android',
  appVersion: '1.3.1',
  buildNumber: 55,
  locale: 'en',
};
const notice = {
  documentVersion: LEGAL_DOCUMENT_VERSION,
  documentSha256: PRIVACY_DOCUMENT_SHA256,
};
beforeEach(() => {
  delete mockProfile.countryAnalyticsEnabled;
  jest.clearAllMocks();
});
it('keeps old clients valid and stores no country without explicit consent', async () => {
  const ctx = context();
  await handler(touchPresence)(ctx, {...payload, ipCountryCode: 'VN'});
  expect(ctx.db.insert).toHaveBeenCalledWith(
    'userPresence',
    expect.objectContaining({ipCountryCodeAtLastSeen: undefined}),
  );
  const old = context();
  await handler(touchPresence)(old, payload);
  expect(old.db.insert).toHaveBeenCalledWith(
    'userPresence',
    expect.objectContaining({localeAtLastSeen: 'en'}),
  );
});
it('stores only normalized country code on a consenting ordinary presence record', async () => {
  mockProfile.countryAnalyticsEnabled = true;
  const ctx = context();
  await handler(touchPresence)(ctx, {...payload, ipCountryCode: 'vn'});
  const value = ctx.db.insert.mock.calls[0];
  expect(value).toEqual([
    'userPresence',
    expect.objectContaining({ipCountryCodeAtLastSeen: 'VN'}),
  ]);
  expect(JSON.stringify(value)).not.toMatch(
    /ipAddress|latitude|longitude|countryAnalyticsEnabled/,
  );
});
it('rejects malformed country values before writing any presence', async () => {
  const ctx = context();
  await expect(
    handler(touchPresence)(ctx, {...payload, ipCountryCode: '203.0.113.1'}),
  ).rejects.toThrow();
  expect(ctx.db.insert).not.toHaveBeenCalled();
});
it('records explicit consent against the exact notice and is idempotent', async () => {
  const ctx = context();
  await handler(setCountryAnalytics)(ctx, {enabled: true, ...notice});
  expect(ctx.db.patch).toHaveBeenCalledWith(
    'userProfiles',
    'profile-example',
    expect.objectContaining({countryAnalyticsEnabled: true}),
  );
  expect(ctx.db.insert).toHaveBeenCalledWith(
    'legalEvents',
    expect.objectContaining({
      kind: 'OPTIONAL_COUNTRY_ANALYTICS_GRANTED',
      ...notice,
    }),
  );
  mockProfile.countryAnalyticsEnabled = true;
  const repeated = context();
  await handler(setCountryAnalytics)(repeated, {enabled: true, ...notice});
  expect(repeated.db.insert).not.toHaveBeenCalled();
});
it('refuses opt-in without the current displayed notice', async () => {
  const ctx = context();
  await expect(
    handler(setCountryAnalytics)(ctx, {
      enabled: true,
      documentVersion: 'old',
      documentSha256: 'old',
    }),
  ).rejects.toThrow();
  expect(ctx.db.patch).not.toHaveBeenCalled();
  expect(ctx.db.insert).not.toHaveBeenCalled();
});
it('withdraws without rate limits, immediately erases country, and blocks a late in-flight report', async () => {
  mockProfile.countryAnalyticsEnabled = true;
  const ctx = context({_id: 'presence-example', ipCountryCodeAtLastSeen: 'VN'});
  await handler(setCountryAnalytics)(ctx, {enabled: false});
  expect(enforceRateLimit).not.toHaveBeenCalled();
  expect(ctx.db.patch).toHaveBeenCalledWith(
    'userPresence',
    'presence-example',
    {ipCountryCodeAtLastSeen: undefined},
  );
  expect(ctx.db.insert).toHaveBeenCalledWith(
    'legalEvents',
    expect.objectContaining({kind: 'OPTIONAL_COUNTRY_ANALYTICS_WITHDRAWN'}),
  );
  mockProfile.countryAnalyticsEnabled = false;
  const late = context();
  await handler(touchPresence)(late, {...payload, ipCountryCode: 'VN'});
  expect(late.db.insert).toHaveBeenCalledWith(
    'userPresence',
    expect.objectContaining({ipCountryCodeAtLastSeen: undefined}),
  );
});
it('fills a country once without advancing the five-minute ordinary presence timestamp', async () => {
  mockProfile.countryAnalyticsEnabled = true;
  const ctx = context({_id: 'presence-example', lastSeenAt: Date.now()});
  await handler(touchPresence)(ctx, {...payload, ipCountryCode: 'VN'});
  expect(ctx.db.insert).not.toHaveBeenCalled();
  expect(ctx.db.replace).not.toHaveBeenCalled();
  expect(ctx.db.patch).toHaveBeenCalledWith(
    'userPresence',
    'presence-example',
    {ipCountryCodeAtLastSeen: 'VN'},
  );
  const filled = context({
    _id: 'presence-example',
    lastSeenAt: Date.now(),
    ipCountryCodeAtLastSeen: 'VN',
  });
  await handler(touchPresence)(filled, {...payload, ipCountryCode: 'US'});
  expect(filled.db.patch).not.toHaveBeenCalled();
  expect(filled.db.replace).not.toHaveBeenCalled();
});

it('keeps old-client notice acknowledgements on their actual legacy documents', async () => {
  const ctx = context();
  await handler(completeLedgerStep)(ctx, {
    skipped: true,
    termsAccepted: true,
    privacyAcknowledged: true,
    age14Plus: true,
    locale: 'en',
  });
  expect(ctx.db.insert).toHaveBeenCalledWith(
    'legalEvents',
    expect.objectContaining({
      documentVersion: LEGACY_LEGAL_ACKNOWLEDGEMENT.legalDocumentVersion,
      documentSha256: LEGACY_LEGAL_ACKNOWLEDGEMENT.privacyDocumentSha256,
    }),
  );
});
it('records the current notice only when the new client supplies all exact hashes', async () => {
  const ctx = context();
  await handler(completeLedgerStep)(ctx, {
    skipped: true,
    termsAccepted: true,
    privacyAcknowledged: true,
    age14Plus: true,
    locale: 'en',
    ...LEGAL_ACKNOWLEDGEMENT,
  });
  expect(ctx.db.insert).toHaveBeenCalledWith(
    'legalEvents',
    expect.objectContaining({
      documentVersion: LEGAL_DOCUMENT_VERSION,
      documentSha256: PRIVACY_DOCUMENT_SHA256,
    }),
  );
  const partial = context();
  await expect(
    handler(completeLedgerStep)(partial, {
      skipped: true,
      termsAccepted: true,
      privacyAcknowledged: true,
      age14Plus: true,
      locale: 'en',
      legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
    }),
  ).rejects.toThrow();
  expect(partial.db.insert).not.toHaveBeenCalled();
});
