import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const uploadPurposeValidator = v.union(
  v.literal('AVATAR'),
  v.literal('ITEM_PHOTO'),
  v.literal('COMMENT_ATTACHMENT'),
);

/**
 * Convex records no uploader on `_storage` metadata, so a mutation handed a storage id cannot tell a
 * member's own blob from one they guessed (`09` §7). Ownership is first-claim-wins, recorded here,
 * and every delete path checks it. A receipt photo is financial data and a Convex storage URL
 * carries no auth and no expiry, so BooKoo must DELETE blobs, not just references.
 */
export const uploadsTable = defineTable({
  storageId: v.id('_storage'),
  userId: v.id('users'),
  purpose: uploadPurposeValidator,
  /** Set once the blob is attached, so the ledger purge frees its blobs with no scan. */
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  byteSize: v.number(),
  contentType: v.optional(v.string()),
  createdAt: v.number(),
  /** Set by the GC cron once it has confirmed a referrer exists. `.eq(undefined)` is the EXACT
   *  unchecked set — better than a high-water-mark table, which restarts from zero forever. */
  referencedCheckedAt: v.optional(v.number()),
})
  // Protected media lookup, dedupe, and the itemPhotos ownership cross-check.
  .index('by_storageId', ['storageId'])
  // Account deletion: enumerate a user's blobs.
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  // Ledger purge cascade: free every blob of one ledger.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  // Nightly orphan sweep: `.eq('referencedCheckedAt', undefined).take(200)`.
  .index('by_referencedCheckedAt', ['referencedCheckedAt']);
