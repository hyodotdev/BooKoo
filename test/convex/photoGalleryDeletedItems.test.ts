import {listByLedger} from '../../convex/photos/queries';
import {PHOTO_GALLERY_PAGE_SIZE} from '../../convex/lib/constants';

/**
 * `items.softDelete` patches the entry row only — nothing cascades to
 * `itemPhotos`, and no trigger does it either. The ledger-wide gallery filters
 * on the *photo's* own `deletedAt`, so before this suite a receipt whose entry
 * had been deleted kept its tile in the grid.
 *
 * The bytes were never served: `photos/internal.ts` gates on the parent item's
 * `deletedAt` before handing over a storage id. What the gallery leaked was a
 * tile that could never resolve, plus the deleted receipt's capture time and
 * uploader. `listByItem` deliberately keeps `allowDeleted` — its detail screen
 * still offers a restore — which is why this fix belongs here and not there.
 */

jest.mock('../../convex/lib/ledgerPermissions', () => ({
  requireLedgerMember: jest.fn().mockResolvedValue({profile: {userId: 'a'}}),
}));
jest.mock('../../convex/lib/permissions', () => ({
  requireOnboarded: jest.fn(),
  getCurrentProfile: jest.fn(),
}));

function handler(fn: unknown): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (typeof fn !== 'function') throw new Error('Missing convex function');
  const registered: unknown = Reflect.get(fn, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}

const photo = (id: string, itemId: string) => ({
  _id: id,
  itemId,
  ledgerId: 'ledger',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  capturedAt: 1_700_000_000_000,
  uploadedByUserId: 'uploader',
});

function ctxWith(items: Record<string, {deletedAt?: number} | null>) {
  return {
    db: {
      get: jest.fn(async (_table: string, id: string) => items[id] ?? null),
      query: jest.fn(() => ({
        withIndex: () => ({
          order: () => ({
            paginate: async () => ({
              page: [photo('live', 'item-live'), photo('dead', 'item-dead')],
              isDone: true,
              continueCursor: '',
            }),
          }),
        }),
      })),
    },
  };
}

describe('the ledger photo gallery', () => {
  it('drops receipts whose entry was deleted, and keeps the rest', async () => {
    const result = (await handler(listByLedger)(
      ctxWith({
        'item-live': {},
        'item-dead': {deletedAt: 1_700_000_000_001},
      }),
      {ledgerId: 'ledger', paginationOpts: {numItems: 20, cursor: null}},
    )) as {page: {id: string}[]; isDone: boolean};

    expect(result.page.map((row) => row.id)).toEqual(['live']);
    // The cursor is untouched: a filtered page is still a complete page.
    expect(result.isDone).toBe(true);
  });

  it('drops a receipt whose entry is gone entirely', async () => {
    const result = (await handler(listByLedger)(
      ctxWith({'item-live': {}, 'item-dead': null}),
      {ledgerId: 'ledger', paginationOpts: {numItems: 20, cursor: null}},
    )) as {page: {id: string}[]};

    expect(result.page.map((row) => row.id)).toEqual(['live']);
  });

  it('still refuses a page size above the gallery cap', async () => {
    await expect(
      handler(listByLedger)(ctxWith({}), {
        ledgerId: 'ledger',
        paginationOpts: {numItems: PHOTO_GALLERY_PAGE_SIZE + 1, cursor: null},
      }),
    ).rejects.toMatchObject({data: {code: 'INVALID_INPUT'}});
  });
});
