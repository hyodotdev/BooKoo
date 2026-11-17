import * as queries from '../../convex/rollups/queries';
import {rosterPaginated} from '../../convex/ledgers/queries';
import {requireLedgerMember} from '../../convex/lib/ledgerPermissions';
import {MAX_TIMELINE_DAY_KEYS} from '../../shared/ledgerLimits';

jest.mock('../../convex/lib/ledgerPermissions', () => ({
  requireLedgerMember: jest
    .fn()
    .mockResolvedValue({profile: {userId: 'viewer'}}),
}));
jest.mock('../../convex/lib/permissions', () => ({
  requireOnboarded: jest.fn(),
}));

function handler(
  query: unknown,
): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (typeof query !== 'function') throw new Error('Missing query');
  const registered: unknown = Reflect.get(query, '_handler');
  if (typeof registered !== 'function')
    throw new Error('Missing query handler');
  return (ctx, args) => registered(ctx, args);
}

function dayContext() {
  const days: number[] = [];
  const ctx = {
    db: {
      query: jest.fn((table: string) => {
        expect(table).toBe('ledgerDayRollups');
        let selectedDay = 0;
        interface DayIndex {
          eq(field: string, value: unknown): DayIndex;
        }
        const index: DayIndex = {
          eq: jest.fn((field: string, value: unknown): DayIndex => {
            if (field === 'ledgerId') expect(value).toBe('ledger');
            if (field === 'dayKey' && typeof value === 'number') {
              selectedDay = value;
              days.push(value);
            }
            return index;
          }),
        };
        return {
          withIndex: (name: string, select: (value: typeof index) => void) => {
            expect(name).toBe('by_ledgerId_dayKey_shard');
            select(index);
            return {
              take: async (limit: number) => {
                expect(limit).toBe(2);
                return [
                  {
                    dayKey: selectedDay,
                    expenseMinor: 100,
                    incomeMinor: 300,
                    itemCount: 2,
                  },
                ];
              },
            };
          },
        };
      }),
    },
  };
  return {ctx, days};
}

describe('sparse timeline rollup sidecar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads only requested days even when one page spans several years', async () => {
    const {ctx, days} = dayContext();
    const query: unknown = Reflect.get(queries, 'daysByKeys');
    const result = await handler(query)(ctx, {
      ledgerId: 'ledger',
      dayKeys: [20260906, 20170101, 20260906],
    });
    expect(days).toEqual([20170101, 20260906]);
    expect(result).toEqual([
      {
        dayKey: 20170101,
        expenseMinor: 100,
        incomeMinor: 300,
        netMinor: 200,
        itemCount: 2,
      },
      {
        dayKey: 20260906,
        expenseMinor: 100,
        incomeMinor: 300,
        netMinor: 200,
        itemCount: 2,
      },
    ]);
    expect(requireLedgerMember).toHaveBeenCalledWith(ctx, 'ledger');
  });

  it.each([
    {name: 'invalid', dayKeys: [20260230]},
    {
      name: 'excessive',
      dayKeys: Array.from({length: MAX_TIMELINE_DAY_KEYS + 1}, () => 20260906),
    },
  ])('rejects $name keys before reading rollups', async ({dayKeys}) => {
    const {ctx} = dayContext();
    const query: unknown = Reflect.get(queries, 'daysByKeys');
    await expect(
      handler(query)(ctx, {ledgerId: 'ledger', dayKeys}),
    ).rejects.toMatchObject({
      data: {code: 'INVALID_INPUT'},
    });
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('accepts the client member continuation size of fifty', async () => {
    const index = {eq: jest.fn().mockImplementation(() => index)};
    const paginate = jest
      .fn()
      .mockResolvedValue({page: [], isDone: true, continueCursor: ''});
    const ctx = {
      db: {
        query: jest.fn(() => ({
          withIndex: (name: string, select: (value: typeof index) => void) => {
            expect(name).toBe('by_ledgerId_deletedAt_role');
            select(index);
            return {paginate};
          },
        })),
      },
    };
    const paginationOpts = {cursor: null, numItems: 50};
    await handler(rosterPaginated)(ctx, {ledgerId: 'ledger', paginationOpts});
    expect(paginate).toHaveBeenCalledWith(paginationOpts);
  });
});
