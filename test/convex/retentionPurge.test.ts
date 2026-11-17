import {
  AUDIT_FEED_RETENTION_MS,
  CASCADE_BATCH,
  NOTIFICATION_RETENTION_MS,
  SECURITY_RECORD_RETENTION_MS,
  UPLOAD_CLAIM_TTL_MS,
  UPLOAD_REFERRER_SCAN_LIMIT,
} from '../../convex/lib/constants';
import {
  purgeRetention,
  sweepOrphanUploads,
} from '../../convex/maintenance/retention';

/**
 * The privacy policy's retention periods beyond the trash: FEED audit rows,
 * notifications, account security records and superseded consent records
 * after 180 days, offline update receipts at their 30-day expiry, and claimed
 * uploads nothing references. Each is an irreversible
 * delete of production rows or blobs, so the suite pins the guards: each job
 * is inert without its own switch, dry_run writes nothing, AUDIT rows and
 * referenced blobs are never touched, and the fake index below orders
 * `undefined` below every number exactly as Convex does — a range missing its
 * lower bound would select rows it must not.
 */

jest.mock('../../convex/lib/functions', () => ({
  internalMutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));
// `purge.ts` reaches the auth layer through `ledgerPermissions`.
jest.mock('../../convex/lib/permissions', () => ({}));

function handler(
  fn: unknown,
): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (fn === null || (typeof fn !== 'function' && typeof fn !== 'object'))
    throw new Error('Missing convex function');
  const registered: unknown = Reflect.get(fn, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}

type Row = Record<string, unknown> & {_id: string};
type RangeCall = [string, string, unknown];

/** Convex index order for the values used here: `undefined` first. */
const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return Number(a) < Number(b) ? -1 : 1;
};

const inRange = (row: Row, [op, field, value]: RangeCall): boolean => {
  const order = compare(row[field], value);
  switch (op) {
    case 'eq':
      return order === 0;
    case 'gt':
      return order > 0;
    case 'gte':
      return order >= 0;
    case 'lt':
      return order < 0;
    case 'lte':
      return order <= 0;
    default:
      throw new Error(`unexpected range op ${op}`);
  }
};

/**
 * A fake ctx whose index ranges are evaluated, not just recorded, and whose
 * `paginate` honours `numItems` with an offset cursor.
 */
const fakeCtx = (tables: Record<string, Row[]>) => {
  const ranges: {table: string; index: string; calls: RangeCall[]}[] = [];
  const deleted: string[] = [];
  const patched: {id: string; fields: Record<string, unknown>}[] = [];
  const freedBlobs: string[] = [];
  const scheduled: Record<string, unknown>[] = [];
  const query = jest.fn((table: string) => ({
    withIndex: (
      index: string,
      build?: (
        range: Record<string, (field: string, value: unknown) => unknown>,
      ) => unknown,
    ) => {
      const calls: RangeCall[] = [];
      const range: Record<string, (field: string, value: unknown) => unknown> =
        {};
      for (const op of ['eq', 'gt', 'gte', 'lt', 'lte'])
        range[op] = (field, value) => {
          calls.push([op, field, value]);
          return range;
        };
      build?.(range);
      ranges.push({table, index, calls});
      const rows = () =>
        (tables[table] ?? []).filter(
          (row) =>
            !deleted.includes(row._id) &&
            calls.every((call) => inRange(row, call)),
        );
      return {
        take: async (limit: number) => rows().slice(0, limit),
        first: async () => rows()[0] ?? null,
        order: (direction: 'asc' | 'desc') => {
          const sorted = () =>
            [...rows()].sort(
              (a, b) =>
                compare(a.createdAt, b.createdAt) *
                (direction === 'desc' ? -1 : 1),
            );
          return {first: async () => sorted()[0] ?? null};
        },
        unique: async () => rows()[0] ?? null,
        paginate: async ({
          cursor,
          numItems,
        }: {
          cursor: string | null;
          numItems: number;
        }) => {
          const start = cursor === null ? 0 : Number(cursor);
          const all = rows();
          return {
            page: all.slice(start, start + numItems),
            isDone: start + numItems >= all.length,
            continueCursor: String(start + numItems),
          };
        },
      };
    },
  }));
  const ctx = {
    db: {
      query,
      delete: jest.fn(async (id: string) => {
        deleted.push(id);
      }),
      patch: jest.fn(async (id: string, fields: Record<string, unknown>) => {
        patched.push({id, fields});
      }),
      system: {get: jest.fn(async (_table: string, id: string) => ({_id: id}))},
    },
    storage: {
      delete: jest.fn(async (id: string) => {
        freedBlobs.push(id);
      }),
    },
    scheduler: {
      runAfter: jest.fn(
        async (_delay: number, _fn: unknown, args: Record<string, unknown>) => {
          scheduled.push(args);
        },
      ),
    },
  };
  return {ctx, ranges, deleted, patched, freedBlobs, scheduled};
};

type Fake = ReturnType<typeof fakeCtx>;

/** Runs a job and every continuation it schedules, like the scheduler would. */
const drive = async (fn: unknown, fake: Fake, args: unknown = {}) => {
  let next: unknown = args;
  let runs = 0;
  while (next !== undefined) {
    runs += 1;
    if (runs > 50) throw new Error('chain did not terminate');
    const before = fake.scheduled.length;
    await handler(fn)(fake.ctx, next);
    next =
      fake.scheduled.length > before
        ? fake.scheduled[fake.scheduled.length - 1]
        : undefined;
  }
  return runs;
};

const NOW = 10 * AUDIT_FEED_RETENTION_MS;
const OLD = NOW - AUDIT_FEED_RETENTION_MS - 1;
const RECENT = NOW - AUDIT_FEED_RETENTION_MS + 1;

let logged: string[] = [];

beforeEach(() => {
  logged = [];
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(console, 'log').mockImplementation((line: string) => {
    logged.push(line);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.RETENTION_PURGE_MODE;
  delete process.env.UPLOAD_SWEEP_MODE;
  delete process.env.TRASH_PURGE_MODE;
});

const lastLog = (): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(logged[logged.length - 1] ?? '{}');
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('no log line');
  return Object.fromEntries(Object.entries(parsed));
};

const retentionTables = (): Record<string, Row[]> => ({
  ledgers: [
    {_id: 'live'},
    {_id: 'deleted', deletedAt: 1},
    {_id: 'orphaned', orphanedAt: 1},
  ],
  ledgerAuditLog: [
    {_id: 'feed-old', ledgerId: 'live', retention: 'FEED', createdAt: OLD},
    {
      _id: 'feed-recent',
      ledgerId: 'live',
      retention: 'FEED',
      createdAt: RECENT,
    },
    {_id: 'audit-old', ledgerId: 'live', retention: 'AUDIT', createdAt: 1},
  ],
  notifications: [
    {_id: 'note-old', ledgerId: 'live', createdAt: OLD},
    {_id: 'note-recent', ledgerId: 'live', createdAt: RECENT},
    {_id: 'note-deleted-ledger', ledgerId: 'deleted', createdAt: OLD},
    {_id: 'note-orphaned-ledger', ledgerId: 'orphaned', createdAt: OLD},
    {_id: 'note-unscoped-old', createdAt: OLD},
    {_id: 'note-unscoped-recent', createdAt: RECENT},
  ],
  clientMutationReceipts: [
    {_id: 'receipt-expired', expiresAt: NOW - 1},
    {_id: 'receipt-due-now', expiresAt: NOW},
    {_id: 'receipt-live', expiresAt: NOW + 1},
  ],
});

describe('the retention switch', () => {
  it.each([undefined, '', 'on', 'ENFORCE'])(
    'does nothing unless RETENTION_PURGE_MODE is dry_run or enforce: %s',
    async (mode) => {
      if (mode !== undefined) process.env.RETENTION_PURGE_MODE = mode;
      const fake = fakeCtx(retentionTables());
      await handler(purgeRetention)(fake.ctx, {});
      expect(fake.ctx.db.query).not.toHaveBeenCalled();
    },
  );

  it('is not enabled by the trash or upload sweep switch', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const fake = fakeCtx(retentionTables());
    await handler(purgeRetention)(fake.ctx, {});
    expect(fake.ctx.db.query).not.toHaveBeenCalled();
  });
});

describe('the retention purge', () => {
  it('deletes only what is past its period, across every ledger and none', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx(retentionTables());
    await drive(purgeRetention, fake);
    expect([...fake.deleted].sort()).toEqual(
      [
        'feed-old',
        'note-deleted-ledger',
        'note-old',
        'note-orphaned-ledger',
        'note-unscoped-old',
        'receipt-due-now',
        'receipt-expired',
      ].sort(),
    );
    expect(lastLog()).toMatchObject({
      event: 'retention_purge.done',
      mode: 'enforce',
      ledgers: 3,
      feed: 1,
      notifications: 4,
      receipts: 2,
    });
  });

  it('never ranges over AUDIT rows', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx(retentionTables());
    await drive(purgeRetention, fake);
    const auditRanges = fake.ranges.filter(
      (range) => range.table === 'ledgerAuditLog',
    );
    expect(auditRanges.length).toBeGreaterThan(0);
    for (const range of auditRanges)
      expect(range.calls).toContainEqual(['eq', 'retention', 'FEED']);
    expect(fake.deleted).not.toContain('audit-old');
  });

  it('puts a numeric lower bound on every range', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx(retentionTables());
    await drive(purgeRetention, fake);
    const bounded = fake.ranges.filter((range) =>
      range.calls.some(([op]) => op === 'lte' || op === 'lt'),
    );
    expect(
      [
        ...new Set(bounded.map((range) => `${range.table}.${range.index}`)),
      ].sort(),
    ).toEqual(
      [
        'authAudit.by_event_createdAt',
        'clientMutationReceipts.by_expiresAt',
        'ledgerAuditLog.by_ledgerId_retention_createdAt',
        'legalEvents.by_createdAt',
        'notifications.by_ledgerId_createdAt',
      ].sort(),
    );
    expect(
      bounded.some((range) => range.calls.some(([op]) => op === 'lt')),
    ).toBe(false);
    for (const range of bounded) {
      const field = range.calls.find(([op]) => op === 'lte')?.[1];
      expect(range.calls).toContainEqual(['gte', field, 0]);
    }
    expect(
      fake.ranges.find((range) => range.index === 'by_expiresAt')?.calls,
    ).toEqual([
      ['gte', 'expiresAt', 0],
      ['lte', 'expiresAt', NOW],
    ]);
  });

  it('cuts notifications at NOTIFICATION_RETENTION_MS', async () => {
    process.env.RETENTION_PURGE_MODE = 'dry_run';
    const fake = fakeCtx(retentionTables());
    await drive(purgeRetention, fake);
    const unscoped = fake.ranges.find((range) =>
      range.calls.some(
        ([op, field, value]) =>
          op === 'eq' && field === 'ledgerId' && value === undefined,
      ),
    );
    expect(unscoped?.calls).toEqual([
      ['eq', 'ledgerId', undefined],
      ['gte', 'createdAt', 0],
      ['lte', 'createdAt', NOW - NOTIFICATION_RETENTION_MS],
    ]);
  });

  it('counts but deletes nothing in dry_run', async () => {
    process.env.RETENTION_PURGE_MODE = 'dry_run';
    const fake = fakeCtx(retentionTables());
    await drive(purgeRetention, fake);
    expect(fake.ctx.db.delete).not.toHaveBeenCalled();
    expect(fake.ctx.db.patch).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({
      mode: 'dry_run',
      feed: 1,
      notifications: 4,
      receipts: 2,
    });
  });

  it('never deletes more than one cascade batch per transaction', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const notifications = Array.from(
      {length: CASCADE_BATCH * 2 + 5},
      (_, i) => ({_id: `note-${i}`, ledgerId: 'live', createdAt: OLD}),
    );
    const fake = fakeCtx({ledgers: [{_id: 'live'}], notifications});
    await handler(purgeRetention)(fake.ctx, {});
    expect(fake.deleted).toHaveLength(CASCADE_BATCH);
    // The same page again, not the next one.
    expect(fake.scheduled).toEqual([
      expect.objectContaining({stage: 'ledgers', cursor: undefined}),
    ]);
    await drive(purgeRetention, fake, fake.scheduled[0]);
    expect(fake.deleted).toHaveLength(CASCADE_BATCH * 2 + 5);
  });

  it('reruns the page when FEED rows alone fill the batch', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const ledgerAuditLog = Array.from({length: CASCADE_BATCH}, (_, i) => ({
      _id: `feed-${i}`,
      ledgerId: 'live',
      retention: 'FEED',
      createdAt: OLD,
    }));
    const fake = fakeCtx({
      ledgers: [{_id: 'live'}],
      ledgerAuditLog,
      notifications: [{_id: 'note', ledgerId: 'live', createdAt: OLD}],
    });
    await handler(purgeRetention)(fake.ctx, {});
    expect(fake.deleted).toHaveLength(CASCADE_BATCH);
    expect(fake.deleted).not.toContain('note');
    expect(fake.scheduled).toEqual([
      expect.objectContaining({stage: 'ledgers', cursor: undefined}),
    ]);
    await drive(purgeRetention, fake, fake.scheduled[0]);
    expect(fake.deleted).toContain('note');
    expect(lastLog()).toMatchObject({feed: CASCADE_BATCH, notifications: 1});
  });

  it('caps a dry_run count at one batch and flags the range', async () => {
    process.env.RETENTION_PURGE_MODE = 'dry_run';
    const receipts = Array.from({length: CASCADE_BATCH + 10}, (_, i) => ({
      _id: `receipt-${i}`,
      expiresAt: 1,
    }));
    const fake = fakeCtx({clientMutationReceipts: receipts});
    await drive(purgeRetention, fake);
    expect(lastLog()).toMatchObject({
      receipts: CASCADE_BATCH,
      cappedRanges: 1,
    });
  });
});

const SECURITY_OLD = NOW - SECURITY_RECORD_RETENTION_MS - 1;
const SECURITY_RECENT = NOW - SECURITY_RECORD_RETENTION_MS + 1;

describe('account security records', () => {
  it('deletes authAudit rows past 180 days for every event', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx({
      authAudit: [
        {_id: 'claimed-old', event: 'handle_claimed', createdAt: SECURITY_OLD},
        {
          _id: 'claimed-recent',
          event: 'handle_claimed',
          createdAt: SECURITY_RECENT,
        },
        {_id: 'purged-old', event: 'deletion_purged', createdAt: SECURITY_OLD},
        {
          _id: 'reinstated-old',
          event: 'account_reinstated',
          createdAt: SECURITY_OLD,
        },
      ],
    });
    await drive(purgeRetention, fake);
    expect([...fake.deleted].sort()).toEqual(
      ['claimed-old', 'purged-old', 'reinstated-old'].sort(),
    );
    const eventRanges = fake.ranges.filter(
      (range) => range.index === 'by_event_createdAt',
    );
    expect(eventRanges).toHaveLength(17);
    expect(eventRanges[0].calls).toEqual([
      ['eq', 'event', 'handle_claimed'],
      ['gte', 'createdAt', 0],
      ['lte', 'createdAt', NOW - SECURITY_RECORD_RETENTION_MS],
    ]);
    expect(lastLog()).toMatchObject({authAudit: 3});
  });

  it('resumes on the same event after a full batch', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const authAudit = [
      ...Array.from({length: CASCADE_BATCH + 5}, (_, i) => ({
        _id: `linked-${i}`,
        event: 'account_linked',
        createdAt: SECURITY_OLD,
      })),
      {_id: 'merged', event: 'accounts_merged', createdAt: SECURITY_OLD},
    ];
    const fake = fakeCtx({authAudit});
    await handler(purgeRetention)(fake.ctx, {stage: 'authAudit'});
    expect(fake.deleted).toHaveLength(CASCADE_BATCH);
    expect(fake.scheduled).toEqual([
      expect.objectContaining({stage: 'authAudit', cursor: 'account_linked'}),
    ]);
    await drive(purgeRetention, fake, fake.scheduled[0]);
    expect(fake.deleted).toHaveLength(CASCADE_BATCH + 6);
  });
});

describe('consent records', () => {
  const consentTables = (): Record<string, Row[]> => ({
    userProfiles: [
      {_id: 'p-live', userId: 'live'},
      {_id: 'p-purged', userId: 'purged', purgedAt: 1},
    ],
    legalEvents: [
      // Live account: v1 superseded by v2, both aged.
      {
        _id: 'live-terms-v1',
        userId: 'live',
        kind: 'TERMS_ACCEPTED',
        createdAt: SECURITY_OLD - 10,
      },
      {
        _id: 'live-terms-v2',
        userId: 'live',
        kind: 'TERMS_ACCEPTED',
        createdAt: SECURITY_OLD,
      },
      // Live account: aged, but superseded by a recent acceptance.
      {
        _id: 'live-privacy-old',
        userId: 'live',
        kind: 'PRIVACY_NOTICE_ACKNOWLEDGED',
        createdAt: SECURITY_OLD,
      },
      {
        _id: 'live-privacy-recent',
        userId: 'live',
        kind: 'PRIVACY_NOTICE_ACKNOWLEDGED',
        createdAt: SECURITY_RECENT,
      },
      // Purged account: even its newest consent goes.
      {
        _id: 'purged-terms',
        userId: 'purged',
        kind: 'TERMS_ACCEPTED',
        createdAt: SECURITY_OLD,
      },
      // No profile at all.
      {
        _id: 'ghost-terms',
        userId: 'ghost',
        kind: 'TERMS_ACCEPTED',
        createdAt: SECURITY_OLD,
      },
    ],
  });

  it('keeps only the newest consent of each kind for a live account', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx(consentTables());
    await drive(purgeRetention, fake);
    expect([...fake.deleted].sort()).toEqual(
      [
        'ghost-terms',
        'live-privacy-old',
        'live-terms-v1',
        'purged-terms',
      ].sort(),
    );
    expect(lastLog()).toMatchObject({legalEvents: 4, consentKept: 1});
  });

  it('keeps exactly one of two consents written at the same moment', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    const fake = fakeCtx({
      userProfiles: [{_id: 'p-live', userId: 'live'}],
      legalEvents: [
        {
          _id: 'tie-a',
          userId: 'live',
          kind: 'TERMS_ACCEPTED',
          createdAt: SECURITY_OLD,
        },
        {
          _id: 'tie-b',
          userId: 'live',
          kind: 'TERMS_ACCEPTED',
          createdAt: SECURITY_OLD,
        },
      ],
    });
    await drive(purgeRetention, fake);
    expect(fake.deleted).toHaveLength(1);
    expect(lastLog()).toMatchObject({legalEvents: 1, consentKept: 1});
  });

  it('ranges consent records by age with a lower bound', async () => {
    process.env.RETENTION_PURGE_MODE = 'dry_run';
    const fake = fakeCtx(consentTables());
    await drive(purgeRetention, fake);
    expect(
      fake.ranges.find((range) => range.index === 'by_createdAt')?.calls,
    ).toEqual([
      ['gte', 'createdAt', 0],
      ['lte', 'createdAt', NOW - SECURITY_RECORD_RETENTION_MS],
    ]);
    expect(fake.ctx.db.delete).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({legalEvents: 4, consentKept: 1});
  });
});

const CLAIMED_LONG_AGO = NOW - UPLOAD_CLAIM_TTL_MS - 1;

const uploadTables = (): Record<string, Row[]> => ({
  uploads: [
    // Current avatar: referenced.
    {
      _id: 'u-avatar',
      storageId: 'avatar',
      userId: 'user',
      purpose: 'AVATAR',
      byteSize: 10,
      createdAt: CLAIMED_LONG_AGO,
    },
    // Replaced avatar: orphaned.
    {
      _id: 'u-old-avatar',
      storageId: 'old-avatar',
      userId: 'user',
      purpose: 'AVATAR',
      byteSize: 20,
      createdAt: CLAIMED_LONG_AGO,
    },
    // Photo pair attached by an older path that never stamped them.
    {
      _id: 'u-original',
      storageId: 'original',
      userId: 'user',
      purpose: 'ITEM_PHOTO',
      itemId: 'item',
      byteSize: 30,
      createdAt: CLAIMED_LONG_AGO,
    },
    {
      _id: 'u-thumb',
      storageId: 'thumb',
      userId: 'user',
      purpose: 'ITEM_PHOTO',
      itemId: 'item',
      byteSize: 3,
      createdAt: CLAIMED_LONG_AGO,
    },
    // Claimed, never attached.
    {
      _id: 'u-unattached',
      storageId: 'unattached',
      userId: 'user',
      purpose: 'COMMENT_ATTACHMENT',
      itemId: 'item',
      byteSize: 40,
      createdAt: CLAIMED_LONG_AGO,
    },
    // Claimed a minute ago, attach may still be on its way.
    {
      _id: 'u-young',
      storageId: 'young',
      userId: 'user',
      purpose: 'ITEM_PHOTO',
      itemId: 'item',
      byteSize: 50,
      createdAt: NOW - 60_000,
    },
    // Already confirmed: outside the unchecked set.
    {
      _id: 'u-checked',
      storageId: 'checked',
      userId: 'user',
      purpose: 'ITEM_PHOTO',
      itemId: 'item',
      byteSize: 60,
      createdAt: 1,
      referencedCheckedAt: 1,
    },
  ],
  userProfiles: [{_id: 'profile', userId: 'user', avatarStorageId: 'avatar'}],
  itemPhotos: [
    {
      _id: 'photo',
      itemId: 'item',
      storageId: 'original',
      thumbStorageId: 'thumb',
    },
  ],
});

describe('the upload sweep switch', () => {
  it.each([undefined, '', 'on', 'ENFORCE'])(
    'does nothing unless UPLOAD_SWEEP_MODE is dry_run or enforce: %s',
    async (mode) => {
      if (mode !== undefined) process.env.UPLOAD_SWEEP_MODE = mode;
      const fake = fakeCtx(uploadTables());
      await handler(sweepOrphanUploads)(fake.ctx, {});
      expect(fake.ctx.db.query).not.toHaveBeenCalled();
    },
  );

  it('is not enabled by the retention or trash switch', async () => {
    process.env.RETENTION_PURGE_MODE = 'enforce';
    process.env.TRASH_PURGE_MODE = 'enforce';
    const fake = fakeCtx(uploadTables());
    await handler(sweepOrphanUploads)(fake.ctx, {});
    expect(fake.ctx.db.query).not.toHaveBeenCalled();
  });
});

describe('the upload sweep', () => {
  it('frees orphans blob first and stamps referenced uploads', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const fake = fakeCtx(uploadTables());
    await drive(sweepOrphanUploads, fake);
    expect(fake.freedBlobs).toEqual(['old-avatar', 'unattached']);
    expect(fake.deleted).toEqual(['u-old-avatar', 'u-unattached']);
    expect(fake.patched).toEqual([
      {id: 'u-avatar', fields: {referencedCheckedAt: NOW}},
      {id: 'u-original', fields: {referencedCheckedAt: NOW}},
      {id: 'u-thumb', fields: {referencedCheckedAt: NOW}},
    ]);
    expect(lastLog()).toMatchObject({
      event: 'upload_sweep.done',
      scanned: 6,
      young: 1,
      referenced: 3,
      orphans: 2,
      orphanBytes: 60,
    });
  });

  it('reads only the unchecked set', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const fake = fakeCtx(uploadTables());
    await drive(sweepOrphanUploads, fake);
    expect(
      fake.ranges.find((range) => range.table === 'uploads')?.calls,
    ).toEqual([['eq', 'referencedCheckedAt', undefined]]);
    expect(fake.deleted).not.toContain('u-checked');
    expect(fake.patched.map((patch) => patch.id)).not.toContain('u-checked');
  });

  it('leaves an upload inside the claim window alone', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const fake = fakeCtx(uploadTables());
    await drive(sweepOrphanUploads, fake);
    expect(fake.freedBlobs).not.toContain('young');
    expect(fake.patched.map((patch) => patch.id)).not.toContain('u-young');
  });

  it('keeps an upload it cannot prove unreferenced', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const photos = Array.from(
      {length: UPLOAD_REFERRER_SCAN_LIMIT + 1},
      (_, i) => ({_id: `photo-${i}`, itemId: 'busy', thumbStorageId: `t-${i}`}),
    );
    const fake = fakeCtx({
      uploads: [
        {
          _id: 'u-thumb-of-busy-entry',
          storageId: 'late-thumb',
          userId: 'user',
          purpose: 'ITEM_PHOTO',
          itemId: 'busy',
          byteSize: 1,
          createdAt: CLAIMED_LONG_AGO,
        },
        {
          _id: 'u-no-item',
          storageId: 'no-item',
          userId: 'user',
          purpose: 'ITEM_PHOTO',
          byteSize: 1,
          createdAt: CLAIMED_LONG_AGO,
        },
      ],
      itemPhotos: photos,
    });
    await drive(sweepOrphanUploads, fake);
    expect(fake.freedBlobs).toEqual([]);
    expect(fake.deleted).toEqual([]);
    expect(lastLog()).toMatchObject({undecided: 2, orphans: 0});
  });

  it('treats an avatar whose owner has no profile as orphaned', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'enforce';
    const fake = fakeCtx({
      uploads: [
        {
          _id: 'u-ownerless',
          storageId: 'ownerless',
          userId: 'gone',
          purpose: 'AVATAR',
          byteSize: 5,
          createdAt: CLAIMED_LONG_AGO,
        },
      ],
      userProfiles: [],
    });
    await drive(sweepOrphanUploads, fake);
    expect(fake.freedBlobs).toEqual(['ownerless']);
    expect(fake.deleted).toEqual(['u-ownerless']);
  });

  it('writes nothing in dry_run', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'dry_run';
    const fake = fakeCtx(uploadTables());
    await drive(sweepOrphanUploads, fake);
    expect(fake.ctx.db.delete).not.toHaveBeenCalled();
    expect(fake.ctx.db.patch).not.toHaveBeenCalled();
    expect(fake.ctx.storage.delete).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({mode: 'dry_run', orphans: 2});
  });

  it('pages through the unchecked set', async () => {
    process.env.UPLOAD_SWEEP_MODE = 'dry_run';
    const uploads = Array.from({length: 120}, (_, i) => ({
      _id: `u-${i}`,
      storageId: `s-${i}`,
      userId: 'user',
      purpose: 'AVATAR',
      byteSize: 1,
      createdAt: CLAIMED_LONG_AGO,
    }));
    const fake = fakeCtx({uploads, userProfiles: []});
    const runs = await drive(sweepOrphanUploads, fake);
    expect(runs).toBe(3);
    expect(lastLog()).toMatchObject({scanned: 120, orphans: 120});
  });
});
