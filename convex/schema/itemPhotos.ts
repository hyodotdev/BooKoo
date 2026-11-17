import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {blobMigrationStateValidator} from './userProfiles';
import {legacyTrailer, softDelete, timestamps} from './common';

/**
 * Legacy `item.picture[]` was an ARRAY INSIDE THE ITEM (`02` §7.3). Four reasons it is a table:
 *  1. Every attach rewrote the whole item document — including, in the legacy code, the nested
 *     `reviews` map, silently destroying any comment added between load and save (`02` S12).
 *  2. Convex caps arrays at 8,192 elements and documents at 1 MiB.
 *  3. The migration needs a PER-PHOTO retry state machine (`14` D8/§5.3) and must be able to hold a
 *     row BEFORE the blob is copied — which is why storageId and every dimension field is optional.
 *  4. A ledger-wide receipt gallery becomes one indexed range instead of a fan-out, and receipt OCR
 *     becomes additive optional columns.
 *
 * TWO storage ids per photo: a ~320px thumb generated client-side with expo-image-manipulator before
 * upload, and the original. ~20x less timeline bandwidth, and bandwidth is billed (`13` §9). Neither
 * id nor a `ctx.storage.getUrl()` result crosses the wire. D4's authenticated HTTP action checks the
 * caller and current ledger membership on every network request.
 */
export const itemPhotosTable = defineTable({
  itemId: v.id('ledgerItems'),
  /** Denormalized tenant key: the permission gate, the ledger-wide gallery and the purge cascade all
   *  need it without loading the parent item. */
  ledgerId: v.id('ledgers'),
  /** Present only when this photo belongs to a comment rather than the entry gallery. */
  commentId: v.optional(v.id('itemComments')),
  /** Position in the legacy picture[] array; the display order in the grid. */
  order: v.number(),

  storageId: v.optional(v.id('_storage')),
  thumbStorageId: v.optional(v.id('_storage')),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  byteSize: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  blurhash: v.optional(v.string()),
  capturedAt: v.optional(v.number()), // EXIF DateTimeOriginal, when present

  uploadedByUserId: v.optional(v.id('users')),

  // ---- migration (`14` §5.3) ----
  migrationState: blobMigrationStateValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  /** picture[i].path — ABSENT on cloud-function-era rows, which is exactly why legacy `deletePhoto`
   *  could never clean them up and the bucket has orphans (`02` §11.2). */
  legacyPath: v.optional(v.string()),
  /** picture[i].url — migration-only source. NEVER projected or rendered; cleared after verified copy. */
  legacyUrl: v.optional(v.string()),
  /** picture[i].base64 === true — the deprecated putString path; the "blob" is a data: URI whose
   *  prefix is `data:image/png;base64, ` WITH A SPACE after the comma. */
  legacyIsBase64: v.boolean(),
  /** GCS md5Hash (base64) from the storage manifest, for byte-level verification. */
  legacySourceMd5: v.optional(v.string()),

  ...timestamps,
  ...softDelete,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${itemKey}/${order}`
})
  // Five new uploads; historical detail stays readable up to ITEM_PHOTO_READ_LIMIT (20).
  .index('by_itemId_deletedAt_order', ['itemId', 'deletedAt', 'order'])
  .index('by_itemId_deletedAt_commentId_order', [
    'itemId',
    'deletedAt',
    'commentId',
    'order',
  ])
  // Ledger-wide receipt gallery, newest first, paginated 40; also the purge cascade cursor.
  .index('by_ledgerId_deletedAt_createdAt', [
    'ledgerId',
    'deletedAt',
    'createdAt',
  ])
  .index('by_ledgerId_deletedAt_commentId_createdAt', [
    'ledgerId',
    'deletedAt',
    'commentId',
    'createdAt',
  ])
  // THE blob-copy worker: `.eq('PENDING').lt('attempts', 6)` — ascending attempts, so repeated
  // failures deprioritize themselves. Also the cutover gate: PENDING + FAILED must reach 0.
  .index('by_migrationState_attempts', ['migrationState', 'attempts'])
  // Orphan-blob GC cross-check against `uploads`.
  .index('by_storageId', ['storageId'])
  .index('by_legacyKey', ['legacyKey']);
