import {purgeUser} from '../../convex/user/deletion';

jest.mock('../../convex/lib/deletionPermissions', () => ({
  getDueDeletingProfile: jest.fn(async () => ({
    userId: 'users:delete',
    deletionDueAt: 1,
  })),
  requireDeletingProfile: jest.fn(),
}));

it.each([1, 41])(
  'purges only the due user purchase anchors in resumable batches: %i',
  async (count) => {
    const rows = new Map<string, {userId: string; _id: string}>();
    for (let index = 0; index < count; index++)
      rows.set(`owned-${index}`, {
        _id: `owned-${index}`,
        userId: 'users:delete',
      });
    rows.set('other-user', {_id: 'other-user', userId: 'users:other'});
    const runAfter = jest.fn(
      async (_delay: number, _reference: unknown, _args: object) => undefined,
    );
    const remove = jest.fn(async (table: string, id: string) => {
      expect(table).toBe('subscriptionPurchases');
      rows.delete(id);
    });
    const ctx = {
      scheduler: {runAfter},
      db: {
        get: async (_table: string, id: string) => rows.get(id) ?? null,
        normalizeId: (_table: string, _id: string) => null,
        delete: remove,
        query: (name: string) => {
          expect(name).toBe('subscriptionPurchases');
          return {
            withIndex: (
              index: string,
              select: (q: {
                eq: (key: string, value: string) => object;
              }) => unknown,
            ) => {
              expect(index).toBe('by_userId_createdAt');
              let userId = '';
              const q = {
                eq: (key: string, value: string): object => {
                  expect(key).toBe('userId');
                  userId = value;
                  return q;
                },
              };
              select(q);
              return {
                take: async (limit: number) => {
                  expect(limit).toBe(40);
                  return [...rows.values()]
                    .filter((row) => row.userId === userId)
                    .slice(0, limit);
                },
              };
            },
          };
        },
      },
    };
    const registered: unknown = Reflect.get(purgeUser, '_handler');
    if (typeof registered !== 'function')
      throw new Error('Purge handler missing');
    await registered(ctx, {
      userId: 'users:delete',
      phase: 'SUBSCRIPTION_PURCHASES',
    });
    expect(remove).toHaveBeenCalledTimes(Math.min(count, 40));
    if (count > 40) {
      expect(runAfter.mock.calls[0][2]).toMatchObject({
        phase: 'SUBSCRIPTION_PURCHASES',
      });
      await registered(ctx, runAfter.mock.calls[0][2]);
    }
    expect(rows.size).toBe(1);
    expect(rows.has('other-user')).toBe(true);
    expect(runAfter.mock.calls.at(-1)?.[2]).toMatchObject({
      phase: 'SUBSCRIBERS',
    });
  },
);
