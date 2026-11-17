import {
  ALL_CATEGORY_ICON_NAMES,
  CATEGORY_COLOR_TOKENS,
} from '../../shared/categories';
import {
  ITEM_PURGE_GRACE_MS,
  RESTORABLE_TRASH_SCAN_LIMIT,
} from '../../convex/lib/constants';
import {archive, create} from '../../convex/categories/mutations';

/**
 * `archive` used to `ctx.db.delete` a CUSTOM category as soon as no LIVE entry
 * used it. A trashed entry is restorable for ITEM_PURGE_GRACE_MS, so restoring
 * it afterwards resolved nothing: the entry fell back to UNCATEGORIZED and the
 * category's name, icon and colour were gone for good. The row is now archived
 * (it still resolves on historical entries) and released only after the trash
 * window, and only when neither a live entry nor a restorable trashed entry
 * still uses it — an entry restored and trashed again keeps an old archivedAt,
 * so the archive time alone cannot prove nothing restorable needs the row.
 */

jest.mock('../../convex/lib/functions', () => ({
  mutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));
jest.mock('../../convex/lib/ledgerPermissions', () => ({
  requireLedgerRole: jest
    .fn()
    .mockResolvedValue({profile: {userId: 'admin'}, ledger: {_id: 'ledger'}}),
  assertLedgerWritable: jest.fn(),
}));
jest.mock('../../convex/lib/categoryMutations', () => ({
  ...jest.requireActual('../../convex/lib/categoryMutations'),
  materializeCategories: jest.fn(),
}));

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

/** Every `gt` lower bound the code under test put on an index range. */
const lowerBounds: [string, unknown][] = [];

const fakeDb = (tables: {
  categories: Row[];
  liveItemKeys: string[];
  restorableTrash?: Row[];
}): {
  db: {
    query: (table: string) => unknown;
    patch: jest.Mock;
    delete: jest.Mock;
    insert: jest.Mock;
  };
} => {
  const query = (table: string) => ({
    withIndex: (
      _name: string,
      build: (index: {
        eq: (field: string, value: unknown) => unknown;
        gt: (field: string, value: unknown) => unknown;
      }) => unknown,
    ) => {
      const filters: Record<string, unknown> = {};
      const range = {
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return range;
        },
        gt: (field: string, value: unknown) => {
          lowerBounds.push([field, value]);
          return range;
        },
      };
      build(range);
      return {
        unique: async () =>
          tables.categories.find((row) => row.key === filters.key) ?? null,
        take: async (limit: number) =>
          (table === 'ledgerItems'
            ? (tables.restorableTrash ?? [])
            : tables.categories
          ).slice(0, limit),
        first: async () =>
          table === 'ledgerItems' &&
          filters.deletedAt === undefined &&
          tables.liveItemKeys.includes(String(filters.categoryKey))
            ? {_id: 'item'}
            : null,
      };
    },
  });
  return {
    db: {query, patch: jest.fn(), delete: jest.fn(), insert: jest.fn()},
  };
};

describe('archiving a custom category', () => {
  it('archives a category only trashed entries use instead of deleting it', async () => {
    const ctx = fakeDb({
      categories: [{_id: 'custom', key: 'c_abc123', source: 'CUSTOM'}],
      liveItemKeys: [],
    });

    await handler(archive)(ctx, {ledgerId: 'ledger', key: 'c_abc123'});

    expect(ctx.db.delete).not.toHaveBeenCalled();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({archivedAt: expect.any(Number)}),
    );
  });

  it('keeps the original archive time when archived again', async () => {
    const ctx = fakeDb({
      categories: [
        {_id: 'custom', key: 'c_abc123', source: 'CUSTOM', archivedAt: 5},
      ],
      liveItemKeys: [],
    });

    await handler(archive)(ctx, {ledgerId: 'ledger', key: 'c_abc123'});

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({archivedAt: 5}),
    );
  });
});

describe('releasing archived custom categories', () => {
  const now = 10 * ITEM_PURGE_GRACE_MS;
  afterEach(() => jest.restoreAllMocks());

  it('frees only CUSTOM rows past the trash window that no live entry uses', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const ctx = fakeDb({
      categories: [
        {
          _id: 'expired',
          key: 'c_old',
          source: 'CUSTOM',
          kind: 'EXPENSE',
          sortOrder: 10,
          archivedAt: now - ITEM_PURGE_GRACE_MS,
        },
        {
          _id: 'recent',
          key: 'c_new',
          source: 'CUSTOM',
          kind: 'EXPENSE',
          sortOrder: 20,
          archivedAt: now - ITEM_PURGE_GRACE_MS + 1,
        },
        {
          _id: 'reused',
          key: 'c_live',
          source: 'CUSTOM',
          kind: 'EXPENSE',
          sortOrder: 30,
          archivedAt: now - 2 * ITEM_PURGE_GRACE_MS,
        },
        {
          _id: 'preset',
          key: 'food',
          source: 'PRESET',
          kind: 'EXPENSE',
          sortOrder: 40,
          archivedAt: now - 2 * ITEM_PURGE_GRACE_MS,
        },
        {
          _id: 'active',
          key: 'c_active',
          source: 'CUSTOM',
          kind: 'EXPENSE',
          sortOrder: 50,
        },
      ],
      liveItemKeys: ['c_live'],
    });

    // `create` releases expired rows before it checks the category cap.
    await handler(create)(ctx, {
      ledgerId: 'ledger',
      kind: 'EXPENSE',
      label: 'Snacks',
      iconKey: ALL_CATEGORY_ICON_NAMES[0],
      colorToken: CATEGORY_COLOR_TOKENS[0],
    });

    expect(ctx.db.delete.mock.calls).toEqual([['expired']]);
  });

  const expiredCategory = {
    _id: 'expired',
    key: 'c_old',
    source: 'CUSTOM',
    kind: 'EXPENSE',
    sortOrder: 10,
    archivedAt: now - 2 * ITEM_PURGE_GRACE_MS,
  };
  const createSnacks = {
    ledgerId: 'ledger',
    kind: 'EXPENSE',
    label: 'Snacks',
    iconKey: ALL_CATEGORY_ICON_NAMES[0],
    colorToken: CATEGORY_COLOR_TOKENS[0],
  };

  it('keeps a row a restorable trashed entry still uses, whatever its archive time', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const ctx = fakeDb({
      categories: [expiredCategory],
      liveItemKeys: [],
      restorableTrash: [{_id: 'retrashed', categoryKey: 'c_old'}],
    });

    await handler(create)(ctx, createSnacks);

    expect(ctx.db.delete).not.toHaveBeenCalled();
    // Restorable means deleted less than ITEM_PURGE_GRACE_MS ago.
    expect(lowerBounds).toContainEqual([
      'deletedAt',
      now - ITEM_PURGE_GRACE_MS,
    ]);
  });

  it('releases nothing when the restorable trash is past its read limit', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const ctx = fakeDb({
      categories: [expiredCategory],
      liveItemKeys: [],
      restorableTrash: Array.from(
        {length: RESTORABLE_TRASH_SCAN_LIMIT + 1},
        (_, i) => ({_id: `trash-${i}`, categoryKey: 'c_other'}),
      ),
    });

    await handler(create)(ctx, createSnacks);

    expect(ctx.db.delete).not.toHaveBeenCalled();
  });
});
