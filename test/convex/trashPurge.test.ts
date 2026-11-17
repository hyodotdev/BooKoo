import {
  CASCADE_BATCH,
  ITEM_PURGE_GRACE_MS,
  LEDGER_PURGE_ITEM_BATCH,
} from '../../convex/lib/constants';
import {
  purgeDeletedLedgers,
  purgeLedgerBatch,
  purgeSoftDeleted,
} from '../../convex/maintenance/purge';

/**
 * The privacy policy promises that trashed entries and ledgers are destroyed
 * 30 days after deletion, and before this suite nothing ever deleted them.
 * These are irreversible deletes of production rows and blobs, so the suite
 * pins the guards as hard as the deletes: the jobs are inert without
 * TRASH_PURGE_MODE, dry_run writes nothing, and every range carries the lower
 * bound that keeps `undefined` (live rows) out — Convex sorts `undefined`
 * below every number.
 */

jest.mock('../../convex/lib/functions', () => ({
  internalMutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));
// `ledgerIsReachable` is pure; its module only imports the auth layer.
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

/**
 * A fake ctx whose queries answer from `tables`, honouring `.eq` filters and
 * the requested `take` size, and recording every range operator per index.
 */
const fakeCtx = (
  tables: Record<string, Row[]>,
  docs: Record<string, Row> = {},
) => {
  const ranges: {index: string; calls: RangeCall[]}[] = [];
  const deleted: string[] = [];
  const patched: {id: string; fields: Record<string, unknown>}[] = [];
  const freedBlobs: string[] = [];
  const scheduled: unknown[] = [];
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
      ranges.push({index, calls});
      const rows = () =>
        (tables[table] ?? []).filter(
          (row) =>
            !deleted.includes(row._id) &&
            calls.every(
              ([op, field, value]) => op !== 'eq' || row[field] === value,
            ),
        );
      return {
        take: async (limit: number) => rows().slice(0, limit),
        unique: async () => rows()[0] ?? null,
        paginate: async () => ({
          page: rows(),
          isDone: true,
          continueCursor: 'end',
        }),
      };
    },
  }));
  const ctx = {
    db: {
      query,
      get: jest.fn(async (_table: string, id: string) => docs[id] ?? null),
      delete: jest.fn(async (id: string) => {
        deleted.push(id);
      }),
      patch: jest.fn(async (id: string, fields: Record<string, unknown>) => {
        patched.push({id, fields});
      }),
      insert: jest.fn(async () => 'job'),
      system: {get: jest.fn(async (_table: string, id: string) => ({_id: id}))},
    },
    storage: {
      delete: jest.fn(async (id: string) => {
        freedBlobs.push(id);
      }),
    },
    scheduler: {
      runAfter: jest.fn(async (_delay: number, _fn: unknown, args: unknown) => {
        scheduled.push(args);
      }),
    },
  };
  return {ctx, ranges, deleted, patched, freedBlobs, scheduled};
};

const NOW = 100 * ITEM_PURGE_GRACE_MS;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.TRASH_PURGE_MODE;
});

describe('the trash purge switch', () => {
  it.each([undefined, '', 'on', 'ENFORCE'])(
    'does nothing unless TRASH_PURGE_MODE is dry_run or enforce: %s',
    async (mode) => {
      if (mode !== undefined) process.env.TRASH_PURGE_MODE = mode;
      const {ctx} = fakeCtx({});
      await handler(purgeSoftDeleted)(ctx, {});
      await handler(purgeDeletedLedgers)(ctx, {});
      expect(ctx.db.query).not.toHaveBeenCalled();
    },
  );
});

const ledgerWithTrash = () => ({
  ledgers: [
    {_id: 'live', maintenanceLock: 'NONE'},
    {_id: 'deleted', maintenanceLock: 'NONE', deletedAt: 1},
    {_id: 'locked', maintenanceLock: 'TIMEZONE'},
  ],
  ledgerItems: [{_id: 'item', ledgerId: 'live', deletedAt: 1}],
  itemPhotos: [
    {_id: 'photo', itemId: 'item', storageId: 'blob', thumbStorageId: 'thumb'},
  ],
  itemComments: [{_id: 'comment', itemId: 'item'}],
  uploads: [
    {_id: 'upload-blob', storageId: 'blob'},
    {_id: 'upload-thumb', storageId: 'thumb'},
  ],
});

describe('purging trashed entries', () => {
  it('only ranges over entries deleted at least ITEM_PURGE_GRACE_MS ago', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, ranges} = fakeCtx(ledgerWithTrash());
    await handler(purgeSoftDeleted)(ctx, {});
    const itemRanges = ranges.filter(
      (range) => range.index === 'by_ledgerId_deletedAt_createdAt',
    );
    expect(itemRanges).toHaveLength(1);
    expect(itemRanges[0].calls).toEqual([
      ['eq', 'ledgerId', 'live'],
      ['gte', 'deletedAt', 0],
      ['lte', 'deletedAt', NOW - ITEM_PURGE_GRACE_MS],
    ]);
  });

  it('frees blobs and upload rows, then photos, comments and the entry', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, deleted, freedBlobs} = fakeCtx(ledgerWithTrash());
    await handler(purgeSoftDeleted)(ctx, {});
    expect(freedBlobs).toEqual(['blob', 'thumb']);
    expect(deleted).toEqual([
      'upload-blob',
      'upload-thumb',
      'photo',
      'comment',
      'item',
    ]);
  });

  it('skips deleted and locked ledgers', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, ranges} = fakeCtx(ledgerWithTrash());
    await handler(purgeSoftDeleted)(ctx, {});
    const ledgerIds = ranges
      .flatMap((range) => range.calls)
      .filter(([op, field]) => op === 'eq' && field === 'ledgerId')
      .map(([, , value]) => value);
    expect(ledgerIds).not.toContain('deleted');
    expect(ledgerIds).not.toContain('locked');
  });

  it('deletes nothing in dry_run', async () => {
    process.env.TRASH_PURGE_MODE = 'dry_run';
    const {ctx, deleted, freedBlobs} = fakeCtx(ledgerWithTrash());
    await handler(purgeSoftDeleted)(ctx, {});
    expect(deleted).toEqual([]);
    expect(freedBlobs).toEqual([]);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe('scheduling deleted ledgers', () => {
  const due = {
    ledgers: [{_id: 'gone', deletedAt: 1, purgeAfter: NOW - 1}],
    maintenanceJobs: [],
  };

  it('keeps ledgers without purgeAfter out of the due range', async () => {
    process.env.TRASH_PURGE_MODE = 'dry_run';
    const {ctx, ranges} = fakeCtx(due);
    await handler(purgeDeletedLedgers)(ctx, {});
    expect(
      ranges.find((range) => range.index === 'by_purgeAfter')?.calls,
    ).toEqual([
      ['gte', 'purgeAfter', 0],
      ['lte', 'purgeAfter', NOW],
    ]);
  });

  it('starts nothing in dry_run', async () => {
    process.env.TRASH_PURGE_MODE = 'dry_run';
    const {ctx, scheduled} = fakeCtx(due);
    await handler(purgeDeletedLedgers)(ctx, {});
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(scheduled).toEqual([]);
  });

  it('locks the ledger and starts one LEDGER_PURGE job in enforce', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, patched, scheduled} = fakeCtx(due);
    await handler(purgeDeletedLedgers)(ctx, {});
    expect(patched).toEqual([
      {id: 'gone', fields: {maintenanceLock: 'DELETING', updatedAt: NOW}},
    ]);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'maintenanceJobs',
      expect.objectContaining({
        kind: 'LEDGER_PURGE',
        jobKey: 'LEDGER_PURGE:gone',
      }),
    );
    expect(scheduled).toEqual([{jobId: 'job'}]);
  });

  it('leaves a recently advanced job to its own chain', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, scheduled} = fakeCtx({
      ...due,
      maintenanceJobs: [
        {
          _id: 'job',
          jobKey: 'LEDGER_PURGE:gone',
          state: 'RUNNING',
          updatedAt: NOW,
        },
      ],
    });
    await handler(purgeDeletedLedgers)(ctx, {});
    expect(scheduled).toEqual([]);
  });
});

describe('the LEDGER_PURGE cascade', () => {
  const ledger = {
    _id: 'gone',
    deletedAt: 1,
    purgeAfter: NOW - 1,
    legacyKey: '/bookoo/ledgers/-L1',
  };
  const job = (phase: string) => ({
    _id: 'job',
    kind: 'LEDGER_PURGE',
    state: 'RUNNING',
    ledgerId: 'gone',
    phase,
    processed: 0,
  });

  it('refuses a ledger that is still restorable and deletes nothing', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, deleted, patched} = fakeCtx(
      {},
      {job: job('photos'), gone: {...ledger, purgeAfter: NOW + 1}},
    );
    await handler(purgeLedgerBatch)(ctx, {jobId: 'job'});
    expect(deleted).toEqual([]);
    expect(patched).toEqual([
      expect.objectContaining({
        id: 'job',
        fields: expect.objectContaining({state: 'FAILED'}),
      }),
    ]);
  });

  it('pauses without deleting when the switch leaves enforce', async () => {
    process.env.TRASH_PURGE_MODE = 'dry_run';
    const {ctx, deleted} = fakeCtx(
      {ledgerItems: [{_id: 'item', ledgerId: 'gone'}]},
      {job: job('items'), gone: ledger},
    );
    await handler(purgeLedgerBatch)(ctx, {jobId: 'job'});
    expect(deleted).toEqual([]);
  });

  it('stays on the items phase while a full item batch came back', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const items = Array.from({length: LEDGER_PURGE_ITEM_BATCH + 1}, (_, i) => ({
      _id: `item-${i}`,
      ledgerId: 'gone',
    }));
    const {ctx, deleted, patched, scheduled} = fakeCtx(
      {ledgerItems: items},
      {job: job('items'), gone: ledger},
    );
    await handler(purgeLedgerBatch)(ctx, {jobId: 'job'});
    expect(deleted).toHaveLength(LEDGER_PURGE_ITEM_BATCH);
    expect(patched).toEqual([
      {
        id: 'job',
        fields: {
          phase: 'items',
          processed: LEDGER_PURGE_ITEM_BATCH,
          updatedAt: NOW,
        },
      },
    ]);
    expect(scheduled).toEqual([{jobId: 'job'}]);
  });

  it('walks every remaining phase and leaves a stripped, locked tombstone', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const {ctx, deleted, patched} = fakeCtx(
      {
        ledgerDayRollups: [{_id: 'day', ledgerId: 'gone'}],
        ledgerInvites: [{_id: 'invite', ledgerId: 'gone'}],
        ledgerInviteRedemptions: [{_id: 'redemption', inviteId: 'invite'}],
        ledgerAuditLog: [{_id: 'audit', ledgerId: 'gone'}],
      },
      {job: job('receipts'), gone: ledger},
    );
    await handler(purgeLedgerBatch)(ctx, {jobId: 'job'});
    expect(deleted).toEqual(['day', 'redemption', 'invite', 'audit']);
    const tombstone = patched.find((patch) => patch.id === 'gone');
    expect(tombstone?.fields).toMatchObject({
      title: '',
      description: '',
      legacyRaw: undefined,
      purgeAfter: undefined,
      maintenanceLock: 'DELETING',
    });
    expect(tombstone?.fields).not.toHaveProperty('legacyKey');
    expect(patched.find((patch) => patch.id === 'job')?.fields).toMatchObject({
      state: 'DONE',
      phase: 'finalize',
    });
  });

  it('never deletes more than one cascade batch per transaction', async () => {
    process.env.TRASH_PURGE_MODE = 'enforce';
    const comments = Array.from({length: CASCADE_BATCH * 2}, (_, i) => ({
      _id: `comment-${i}`,
      ledgerId: 'gone',
    }));
    const {ctx, deleted} = fakeCtx(
      {itemComments: comments},
      {job: job('comments'), gone: ledger},
    );
    await handler(purgeLedgerBatch)(ctx, {jobId: 'job'});
    expect(deleted).toHaveLength(CASCADE_BATCH);
  });
});
