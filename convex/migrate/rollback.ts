import {v} from 'convex/values';

import {migrationMutation} from '../lib/functions';

/**
 * Clear run receipts only after Convex has atomically restored the snapshot.
 * The frozen target tables do not carry runId, so deleting target rows from a
 * receipt alone cannot be made exact; see RECONCILIATION.md M1.
 */
export const deleteRun = migrationMutation({
  args: {runId: v.string(), snapshotRestored: v.boolean()},
  returns: v.object({deleted: v.number(), done: v.boolean()}),
  handler: async (ctx, args) => {
    if (!args.snapshotRestored)
      throw new Error('restore the pass snapshot before deleting run receipts');
    const receipts = await ctx.db
      .query('migrationRuns')
      .withIndex('by_runId_table_batchIndex', (index) =>
        index.eq('runId', args.runId),
      )
      .take(201);
    const page = receipts.slice(0, 200);
    for (const receipt of page) await ctx.db.delete(receipt._id);
    return {deleted: page.length, done: receipts.length <= 200};
  },
});
