import {runInNewContext} from 'node:vm';

import {
  buildActivityQuery,
  validateInternalAccountPolicy,
} from '../../../scripts/growth/activity-query';

const asOf = Date.UTC(2026, 10, 4, 0);
const day = 86400000;
const policy = {
  version: 1 as const,
  approvedAt: '2026-11-04T00:00:00Z',
  emails: ['owner@example.invalid'],
  emailLocalParts: ['synthetic-tester'],
  handles: ['qa-example'],
};
type Row = Record<string, unknown>;
function context(tables: Record<string, Row[]>): {
  db: {
    query: (table: string) => object;
    get: (table: string, id: string) => Promise<Row | null>;
  };
} {
  return {
    db: {
      get: async (table, id) =>
        (tables[table] ?? []).find((row) => row._id === id) ?? null,
      query: (table) => {
        let rows = tables[table] ?? [];
        const chain = {
          withIndex: (
            _name: string,
            select?: (q: {
              eq: (key: string, value: unknown) => object;
            }) => unknown,
          ) => {
            const index = {
              eq: (key: string, value: unknown) => {
                rows = rows.filter((row) => row[key] === value);
                return index;
              },
            };
            select?.(index);
            return chain;
          },
          take: async (limit: number) => rows.slice(0, limit),
          unique: async () => {
            if (rows.length > 1) throw new Error('duplicate');
            return rows[0] ?? null;
          },
        };
        return chain;
      },
    },
  };
}
async function run(
  tables: Record<string, Row[]>,
  sharing = false,
): Promise<unknown> {
  const execute: (ctx: ReturnType<typeof context>) => Promise<unknown> =
    runInNewContext(
      `(async (ctx) => {${buildActivityQuery(policy, asOf, sharing)}})`,
    );
  return execute(context(tables));
}
function member(userId: string, extra: Row = {}): Row {
  return {
    userId,
    appRole: 'USER',
    onboardingStep: 'done',
    isPlaceholder: false,
    ...extra,
  };
}

it('excludes primary/linked test emails, exact local parts, handles and staff without substring matches', async () => {
  const ids = ['primary', 'linked', 'alias', 'handle', 'staff', 'customer'];
  const result = await run({
    userPresence: ids.map((userId) => ({userId, lastSeenAt: asOf})),
    userProfiles: [
      member('primary', {emailNormalized: 'OWNER@example.invalid'}),
      member('linked'),
      member('alias', {emailNormalized: 'synthetic-tester@other.invalid'}),
      member('handle', {handleKey: 'qa-example'}),
      member('staff', {appRole: 'ADMIN'}),
      member('customer', {
        emailNormalized: 'not-synthetic-tester@example.invalid',
        handleKey: 'qa-example-fan',
      }),
    ],
    userEmails: [{userId: 'linked', emailNormalized: 'owner@example.invalid'}],
  });
  expect(result).toMatchObject({
    externalActiveAccounts: [1, 1, 1],
    excludedInternalAccounts: [5, 5, 5],
    complete: true,
  });
  expect(JSON.stringify(result)).not.toContain('example.invalid');
  expect(JSON.stringify(result)).not.toContain('customer');
});

it('counts rolling windows inclusively and never fabricates historical daily DAU', async () => {
  const ages = [day, 7 * day, 28 * day, 28 * day + 1];
  const result = await run({
    userPresence: ages.map((age, index) => ({
      userId: String(index),
      lastSeenAt: asOf - age,
    })),
    userProfiles: ages.map((_, index) => member(String(index))),
  });
  expect(result).toMatchObject({
    externalActiveAccounts: [1, 2, 3],
    metric: 'authenticated_accounts_by_latest_operational_presence',
  });
});

it('separates missing, deleted, suspended, placeholder and unfinished profiles', async () => {
  const profiles = [
    member('deleted', {deletedAt: 1}),
    member('suspended', {appRole: 'SUSPENDED'}),
    member('placeholder', {isPlaceholder: true}),
    member('unfinished', {onboardingStep: 'handle'}),
  ];
  const result = await run({
    userPresence: [...profiles.map((p) => p.userId), 'missing'].map(
      (userId) => ({userId, lastSeenAt: asOf}),
    ),
    userProfiles: profiles,
  });
  expect(result).toMatchObject({
    externalActiveAccounts: [0, 0, 0],
    excludedIneligibleAccounts: [5, 5, 5],
  });
});

it('rejects a scan sentinel rather than silently returning a partial population', async () => {
  await expect(
    run({
      userPresence: Array.from({length: 501}, (_, i) => ({
        userId: String(i),
        lastSeenAt: asOf,
      })),
    }),
  ).rejects.toThrow('PRESENCE_SCAN_LIMIT');
});

it('rejects future presence and excessive linked addresses', async () => {
  await expect(
    run({userPresence: [{userId: 'one', lastSeenAt: asOf + 300001}]}),
  ).rejects.toThrow('INVALID_PRESENCE_TIMESTAMP');
  await expect(
    run({
      userPresence: [{userId: 'one', lastSeenAt: asOf}],
      userProfiles: [member('one')],
      userEmails: Array.from({length: 11}, () => ({
        userId: 'one',
        emailNormalized: 'x@example.invalid',
      })),
    }),
  ).rejects.toThrow('LINKED_EMAIL_LIMIT');
});

it('uses a consistent snapshot when a heartbeat arrives during CLI authentication', async () => {
  const result = await run({
    userPresence: [{userId: 'one', lastSeenAt: asOf + 1000}],
    userProfiles: [member('one')],
  });
  expect(result).toMatchObject({
    asOf: asOf + 1000,
    externalActiveAccounts: [1, 1, 1],
  });
});

it('requires reviewed nonempty exact selectors and normalizes them', () => {
  expect(
    validateInternalAccountPolicy({
      ...policy,
      emails: [' Owner@Example.Invalid '],
    }).emails,
  ).toEqual(['owner@example.invalid']);
  expect(() =>
    validateInternalAccountPolicy({
      ...policy,
      emails: [],
      emailLocalParts: [],
      handles: [],
    }),
  ).toThrow('empty');
  expect(() =>
    validateInternalAccountPolicy({...policy, handles: ['qa*']}),
  ).toThrow('wildcard');
  expect(() =>
    validateInternalAccountPolicy({...policy, approvedAt: ''}),
  ).toThrow('approval');
});

it('distinguishes invited sharing, legacy sharing and two shared members being active in the app', async () => {
  const members = (
    ledgerId: string,
    userId: string,
    joinedVia = 'CREATED',
  ): Row => ({ledgerId, userId, joinedVia});
  const result = await run(
    {
      userPresence: ['owner', 'guest', 'solo', 'tester'].map((userId) => ({
        userId,
        lastSeenAt: asOf,
      })),
      userProfiles: [
        member('owner'),
        member('guest'),
        member('solo'),
        member('tester', {emailNormalized: 'owner@example.invalid'}),
        member('legacy-other'),
      ],
      ledgers: [
        {_id: 'invited'},
        {_id: 'test-only'},
        {_id: 'legacy'},
        {_id: 'deleted', deletedAt: 1},
      ],
      ledgerMembers: [
        members('invited', 'owner'),
        members('invited', 'guest', 'INVITE_LINK'),
        members('test-only', 'solo'),
        members('test-only', 'tester', 'INVITE_EMAIL'),
        members('legacy', 'owner', 'LEGACY_IMPORT'),
        members('legacy', 'legacy-other', 'LEGACY_IMPORT'),
        members('deleted', 'owner'),
        members('deleted', 'solo', 'INVITE_EMAIL'),
      ],
      ledgerMemberState: [
        {ledgerId: 'invited', userId: 'owner', lastOpenedAt: asOf},
        {ledgerId: 'invited', userId: 'guest', lastOpenedAt: asOf},
        {ledgerId: 'legacy', userId: 'owner', lastOpenedAt: asOf},
        {
          ledgerId: 'legacy',
          userId: 'legacy-other',
          lastOpenedAt: asOf - 30 * day,
        },
      ],
    },
    true,
  );
  expect(result).toMatchObject({
    sharing: {
      sharedMembership: [
        {accounts: 2, denominator: 3, percent: 66.67},
        {accounts: 2, denominator: 3, percent: 66.67},
        {accounts: 2, denominator: 3, percent: 66.67},
      ],
      invitationBackedSharedMembership: [
        {accounts: 2},
        {accounts: 2},
        {accounts: 2},
      ],
      coActiveSharedMembership: [{accounts: 2}, {accounts: 2}, {accounts: 2}],
      sharedLedgers: 2,
      invitationBackedLedgers: 1,
    },
  });
  expect(JSON.stringify(result)).not.toContain('legacy-other');
  expect(JSON.stringify(result)).not.toContain('test-only');
});

it('does not turn a zero denominator into a zero-percent conversion claim', async () => {
  expect(await run({}, true)).toMatchObject({
    sharing: {
      sharedMembership: [
        {accounts: 0, denominator: 0, percent: null},
        {accounts: 0, denominator: 0, percent: null},
        {accounts: 0, denominator: 0, percent: null},
      ],
    },
  });
});

it('does not mistake a seeded ledger-open timestamp for actual joint use', async () => {
  const result = await run(
    {
      userPresence: [
        {userId: 'one', lastSeenAt: asOf},
        {userId: 'two', lastSeenAt: asOf - 8 * day},
      ],
      userProfiles: [member('one'), member('two')],
      ledgers: [{_id: 'shared'}],
      ledgerMembers: [
        {userId: 'one', ledgerId: 'shared', joinedVia: 'CREATED'},
        {userId: 'two', ledgerId: 'shared', joinedVia: 'INVITE_EMAIL'},
      ],
      ledgerMemberState: [
        {ledgerId: 'shared', userId: 'one', lastOpenedAt: asOf},
        {ledgerId: 'shared', userId: 'two', lastOpenedAt: asOf},
      ],
    },
    true,
  );
  expect(result).toMatchObject({
    sharing: {
      sharedLedgerActivity: null,
      coActiveSharedMembership: [{accounts: 0}, {accounts: 0}, {accounts: 2}],
    },
  });
});

it('rejects an incomplete membership cohort rather than reporting partial sharing', async () => {
  await expect(
    run(
      {
        userPresence: [{userId: 'one', lastSeenAt: asOf}],
        userProfiles: [member('one')],
        ledgerMembers: Array.from({length: 51}, (_, i) => ({
          userId: 'one',
          ledgerId: String(i),
        })),
      },
      true,
    ),
  ).rejects.toThrow('MEMBERSHIP_LIMIT');
});

it('groups countries only with consent, preserves unknown coverage and excludes internal accounts', async () => {
  const ids = ['vn-a', 'vn-b', 'us', 'old', 'withdrawn', 'test'];
  const result = await run({
    userPresence: ids.map((userId) => ({
      userId,
      lastSeenAt: asOf,
      ipCountryCodeAtLastSeen:
        userId === 'us' ? 'US' : userId === 'old' ? undefined : 'VN',
    })),
    userProfiles: ids.map((userId) =>
      member(userId, {
        countryAnalyticsEnabled: userId !== 'withdrawn',
        ...(userId === 'test'
          ? {emailNormalized: 'owner@example.invalid'}
          : {}),
      }),
    ),
  });
  expect(result).toMatchObject({
    countries: expect.arrayContaining([
      {
        denominator: 5,
        knownAccounts: 3,
        unknownAccounts: 2,
        coveragePercent: 60,
        byCountry: [
          {countryCode: 'VN', accounts: 2, percentOfAllActive: 40},
          {countryCode: 'US', accounts: 1, percentOfAllActive: 20},
        ],
      },
    ]),
  });
  expect(JSON.stringify(result)).not.toContain('vn-a');
});

it('keeps zero-population country coverage unavailable rather than claiming zero percent', async () => {
  expect(await run({})).toMatchObject({
    countries: expect.arrayContaining([
      {
        denominator: 0,
        knownAccounts: 0,
        unknownAccounts: 0,
        coveragePercent: null,
        byCountry: [],
      },
    ]),
  });
});

it('keeps malformed stored country codes unknown without serializing function source', async () => {
  const codes = ['VN', 'vn', 'ZZ', 'AA', '203.0.113.1', 'en-US'];
  const result = await run({
    userPresence: codes.map((code, index) => ({
      userId: String(index),
      lastSeenAt: asOf,
      ipCountryCodeAtLastSeen: code,
    })),
    userProfiles: codes.map((_, index) =>
      member(String(index), {countryAnalyticsEnabled: true}),
    ),
  });
  expect(result).toMatchObject({
    countries: expect.arrayContaining([
      {
        denominator: 6,
        knownAccounts: 1,
        unknownAccounts: 5,
        coveragePercent: 16.67,
        byCountry: [
          {countryCode: 'VN', accounts: 1, percentOfAllActive: 16.67},
        ],
      },
    ]),
  });
});
