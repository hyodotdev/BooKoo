import {listByItem} from '../../convex/photos/queries';
import {requireItemMember} from '../../convex/lib/ledgerPermissions';
import {MAX_ITEM_PHOTOS} from '../../shared/ledgerLimits';

jest.mock('../../convex/lib/ledgerPermissions', () => ({
  requireItemMember: jest.fn().mockResolvedValue(undefined),
}));

async function readPhotos(count: number): Promise<unknown> {
  const registered: unknown = Reflect.get(listByItem, '_handler');
  if (typeof registered !== 'function')
    throw new Error('Missing query handler');
  const rows = Array.from({length: count}, (_, order) => ({
    _id: `photo-${order}`,
    itemId: 'item',
    ledgerId: 'ledger',
    order,
    createdAt: 1,
    updatedAt: 1,
  }));
  const index = {
    eq: jest.fn().mockImplementation(() => index),
  };
  const take = jest.fn(async (limit: number) => rows.slice(0, limit));
  const ctx = {
    db: {
      query: jest.fn(() => ({
        withIndex: jest.fn(
          (name: string, select: (value: typeof index) => void) => {
            expect(name).toBe('by_itemId_deletedAt_commentId_order');
            select(index);
            return {take};
          },
        ),
      })),
    },
  };
  const result: unknown = await registered(ctx, {itemId: 'item'});
  expect(requireItemMember).toHaveBeenCalledWith(ctx, 'item', {
    allowDeleted: true,
  });
  expect(take).toHaveBeenCalledWith(21);
  return result;
}

describe('existing item photo compatibility', () => {
  it.each([0, 5, 6, 20])('keeps %i existing photos readable', async (count) => {
    expect(await readPhotos(count)).toHaveLength(count);
  });

  it('retains the five-photo upload limit', () => {
    expect(MAX_ITEM_PHOTOS).toBe(5);
  });

  it('rejects an overflow instead of returning silently truncated data', async () => {
    await expect(readPhotos(21)).rejects.toMatchObject({
      data: {code: 'PHOTO_LIMIT_REACHED'},
    });
  });
});
