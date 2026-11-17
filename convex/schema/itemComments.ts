import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * Legacy `reviews` — the comment thread on a transaction, which is "the social in social ledger".
 * Legacy read it with `.limitToLast(100).on('value')` plus ONE `users/{writer}/info` fetch PER
 * REVIEW, sorting inside each callback: O(n^2 log n), and it refetched all 100 on any change (S10).
 *
 * FLAT — no threading in v1. Legacy had none, a ledger comment thread is short, and threading costs
 * another index whose page can come back short unless `parentId` is in the tuple. The seam is one
 * optional field plus a `staged: true` index (§10); every existing row correctly reads as a root.
 *
 * `createdAt` is EXPLICIT and is what the thread index sorts on. This is the exact rule proposal C
 * broke: `itemComments` is a reference-carrying table, so it must be imported by batch mutation,
 * which cannot set `_creationTime` — a 2019 thread would render in import order (`14` D7).
 */
export const itemCommentsTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized tenant key: the membership gate resolves without loading the parent item. */
  ledgerId: v.id('ledgers'),
  /** REQUIRED for the same reason as ledgerItems.authorId — P0.5 guarantees a placeholder. */
  authorId: v.id('users'),
  body: v.string(), // legacy `text`
  /** Private photos uploaded with this comment. Bounded to four by the create mutation. */
  attachmentPhotoIds: v.optional(v.array(v.id('itemPhotos'))),
  editedAt: v.optional(v.number()),

  /** Durable create replay. Both are required for new-app rows and absent only on migrated comments. */
  clientRequestId: v.optional(v.string()),
  clientRequestHash: v.optional(v.string()),

  legacyWriterUid: v.optional(v.string()),
  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${itemKey}/${reviewKey}`
})
  // The thread on the item detail screen, oldest-first, paginated 20. `deletedAt` inside the index,
  // so a page of 20 is 20.
  .index('by_itemId_deletedAt_createdAt', ['itemId', 'deletedAt', 'createdAt'])
  // "My comments in this ledger", AND the claim re-parenting cursor (.eq(authorId, placeholder)),
  // tenant-scoped so no cross-tenant index is needed.
  .index('by_ledgerId_deletedAt_authorId_createdAt', [
    'ledgerId',
    'deletedAt',
    'authorId',
    'createdAt',
  ])
  .index('by_itemId_authorId_clientRequestId', [
    'itemId',
    'authorId',
    'clientRequestId',
  ])
  .index('by_legacyKey', ['legacyKey']);
