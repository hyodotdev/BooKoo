import {
  ITEM_PAGE_MORE,
  ITEM_PAGE_SIZE,
  MAX_LIVE_ITEM_PAGES,
  MAX_ITEM_PHOTOS,
} from '@shared/ledgerLimits';

describe('ledger limits', () => {
  it('keeps pagination and photo bounds positive and ordered', () => {
    expect(ITEM_PAGE_SIZE).toBeGreaterThan(0);
    expect(ITEM_PAGE_MORE).toBeGreaterThanOrEqual(ITEM_PAGE_SIZE);
    expect(MAX_LIVE_ITEM_PAGES).toBeGreaterThan(0);
    expect(MAX_ITEM_PHOTOS).toBe(5);
  });
});
