import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const dataExportKindValidator = v.union(
  v.literal('PERSONAL'),
  v.literal('LEDGER'),
);
export const dataExportStateValidator = v.union(
  v.literal('QUEUED'),
  v.literal('RUNNING'),
  v.literal('READY'),
  v.literal('FAILED'),
  v.literal('EXPIRED'),
);

export const dataExportsTable = defineTable({
  requesterUserId: v.id('users'),
  ledgerId: v.optional(v.id('ledgers')),
  kind: dataExportKindValidator,
  state: dataExportStateValidator,
  phase: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  requestedAt: v.number(),
  readyAt: v.optional(v.number()),
  /** Undefined while QUEUED/RUNNING. Set atomically on READY/FAILED to finishedAt + 7 days. */
  expiresAt: v.optional(v.number()),
  failedCode: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_requesterUserId_requestedAt', ['requesterUserId', 'requestedAt'])
  // Exact one-active guard for PERSONAL(undefined ledger) or one specific LEDGER scope.
  .index('by_requesterUserId_kind_ledgerId_state', [
    'requesterUserId',
    'kind',
    'ledgerId',
    'state',
  ])
  .index('by_state_expiresAt', ['state', 'expiresAt'])
  .index('by_ledgerId_requestedAt', ['ledgerId', 'requestedAt']);

export const dataExportFilesTable = defineTable({
  exportId: v.id('dataExports'),
  requesterUserId: v.id('users'),
  order: v.number(),
  fileName: v.string(),
  mediaType: v.string(),
  storageId: v.id('_storage'),
  byteSize: v.number(),
  sha256: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index('by_exportId_order', ['exportId', 'order'])
  .index('by_expiresAt', ['expiresAt']);
