import {defineTable} from 'convex/server';
import {v} from 'convex/values';

export const clientMutationReceiptsTable = defineTable({
  userId: v.id('users'),
  ledgerId: v.id('ledgers'),
  itemId: v.id('ledgerItems'),
  clientRequestId: v.string(),
  /** Server-computed canonical update-args hash. Same id with a different hash is always an error. */
  requestHash: v.string(),
  resultUpdatedAt: v.number(),
  createdAt: v.number(),
  expiresAt: v.number(), // createdAt + CLIENT_RECEIPT_TTL_MS (30 days)
})
  .index('by_userId_clientRequestId', ['userId', 'clientRequestId'])
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  .index('by_expiresAt', ['expiresAt']);
