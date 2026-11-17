/**
 * Ledger limits that must be identical in the Convex backend and app bundle.
 *
 * Keep this module dependency-free so both the Convex and Metro bundlers can
 * consume it without pulling server-only code into the mobile app.
 */
export const ITEM_PAGE_SIZE = 30;
export const ITEM_PAGE_MORE = 50;
export const MAX_LIVE_ITEM_PAGES = 8;
export const MAX_TIMELINE_DAY_KEYS =
  ITEM_PAGE_SIZE + (MAX_LIVE_ITEM_PAGES - 1) * ITEM_PAGE_MORE;
export const MAX_ITEM_PHOTOS = 5;
