import {rebaseCurrency} from '../../convex/ledgers/currencyInternal';

/**
 * `legacyRealAmount` is the signed legacy figure, stored verbatim so migration
 * verification can join on it — `migrate/verify.ts:299` defines a row as still
 * matching its source by exactly one identity:
 *
 *     legacyRealAmount * scaleOf(currency) === signedMinor
 *
 * The rebase preferred `legacyRealAmount` whenever it was present. But
 * `items.update` writes `amountMinor` and never clears `legacyRealAmount`
 * (deliberately — verification needs it), so once an owner had edited a
 * migrated entry, confirming the ledger currency reverted their amount to the
 * 2019 figure. `ROLLUP_REBUILD` then rebuilt every month, day and category
 * total from the reverted number.
 */

jest.mock('../../convex/lib/functions', () => ({
  internalMutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));

const mockJob = {
  _id: 'job',
  state: 'RUNNING' as const,
  phase: 'rebase' as const,
  ledgerId: 'ledger',
  processed: 0,
  requestedByUserId: 'owner',
  // Rewritten per test: the scales have to differ for the two branches to
  // produce different numbers. KRW is scale 1, USD scale 100.
  argsJson: '',
};
jest.mock('../../convex/lib/maintenancePermissions', () => ({
  requireRequestedMaintenanceJob: jest.fn(async () => ({job: mockJob})),
}));

function handler(fn: unknown): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (fn === null || (typeof fn !== 'function' && typeof fn !== 'object'))
    throw new Error('Missing convex function');
  const registered: unknown = Reflect.get(fn, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}

/** A migrated expense of ₩12,000, exactly as imported. KRW has scale 1. */
const imported = {
  _id: 'item',
  type: 'EXPENSE' as const,
  amountMinor: 12_000,
  legacyRealAmount: -12_000,
  updatedAt: 1,
  monthKey: 202401,
};

async function rebase(
  item: Record<string, unknown>,
  {from, to}: {from: string; to: string},
) {
  mockJob.argsJson = JSON.stringify({from, to, currentMonth: 202401});
  const patches: Record<string, unknown>[] = [];
  const ctx = {
    db: {
      get: jest.fn().mockResolvedValue({_id: 'ledger', baseCurrency: 'KRW'}),
      patch: jest.fn(async (id: string, fields: Record<string, unknown>) => {
        if (id === 'item') patches.push(fields);
      }),
      insert: jest.fn(),
      query: jest.fn(() => ({
        withIndex: () => ({
          paginate: async () => ({
            page: [item],
            isDone: true,
            continueCursor: '',
          }),
          // `firstMonth` runs again after the page to find the next month to
          // rebase; null ends the job.
          first: async () => null,
        }),
      })),
    },
    scheduler: {runAfter: jest.fn()},
  };
  await handler(rebaseCurrency)(ctx, {jobId: 'job'});
  return patches[0];
}

const KRW_TO_USD = {from: 'KRW', to: 'USD'};

describe('confirming a ledger currency', () => {
  it('re-derives an untouched migrated row from its verbatim legacy amount', async () => {
    // 12,000 was never edited, so the exact legacy number is the better
    // source: |-12000| * 100.
    expect(await rebase({...imported}, KRW_TO_USD)).toMatchObject({
      amountMinor: 1_200_000,
    });
  });

  it('keeps an amount the owner edited after migration', async () => {
    // The owner corrected 12,000 to 8,000 through `items.update`, which leaves
    // `legacyRealAmount` at the 2019 value. Rebasing must carry the correction
    // across (8000 * 100), not resurrect 12,000.
    expect(
      await rebase({...imported, amountMinor: 8_000}, KRW_TO_USD),
    ).toMatchObject({amountMinor: 800_000});
  });

  it('carries an edit across a rebase that divides rather than multiplies', async () => {
    // $120.50 imported, corrected to $80.00, then confirmed as KRW.
    const usdItem = {
      ...imported,
      amountMinor: 8_000,
      legacyRealAmount: -120.5,
    };
    expect(await rebase(usdItem, {from: 'USD', to: 'KRW'})).toMatchObject({
      amountMinor: 80,
    });
  });

  it('still converts a row that carries no legacy amount at all', async () => {
    const patch = await rebase(
      {
        _id: 'item',
        type: 'EXPENSE',
        amountMinor: 5_000,
        updatedAt: 1,
        monthKey: 202401,
      },
      KRW_TO_USD,
    );
    expect(patch).toMatchObject({amountMinor: 500_000});
  });
});
