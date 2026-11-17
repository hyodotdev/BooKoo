import {v} from 'convex/values';

import {internal} from '../_generated/api';
import {migrationMutation} from '../lib/functions';

export const startRollupRebuild = migrationMutation({
  args: {runId: v.string(), legacyLedgerKeys: v.array(v.string())},
  returns: v.object({queued: v.number(), skipped: v.number()}),
  handler: async (ctx, args) => {
    if (args.legacyLedgerKeys.length < 1 || args.legacyLedgerKeys.length > 200)
      throw new Error('ledger batch size must be between 1 and 200');
    let queued = 0;
    let skipped = 0;
    for (const legacyKey of args.legacyLedgerKeys) {
      const ledger = await ctx.db
        .query('ledgers')
        .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
        .unique();
      if (ledger === null) throw new Error('ledger not found');
      const jobKey = `ROLLUP_REBUILD:migration:${args.runId}:${legacyKey}`;
      const existing = await ctx.db
        .query('maintenanceJobs')
        .withIndex('by_jobKey', (index) => index.eq('jobKey', jobKey))
        .unique();
      if (existing !== null) {
        skipped += 1;
        continue;
      }
      const now = Date.now();
      const jobId = await ctx.db.insert('maintenanceJobs', {
        kind: 'ROLLUP_REBUILD',
        jobKey,
        ledgerId: ledger._id,
        state: 'QUEUED',
        phase: 'rebuild',
        processed: 0,
        startedAt: now,
        updatedAt: now,
      });
      // A rebuild accumulates one month's totals across several COMMITTED
      // transactions (`rollups/internal.ts` carries the running state in
      // `job.argsJson` between pages), then replaces the row with that
      // snapshot. A member write landing on an already-scanned page is
      // invisible to the remaining pages, so the trigger's correction is
      // overwritten and the dashboard disagrees with the entries for good.
      // OCC cannot catch it: the scanned documents are not in the last page's
      // read set. TIMEZONE_REBUCKET and CURRENCY_REBASE take the lock for
      // exactly this reason; this job walks the same rows and needs it too.
      //
      // Only when the ledger is otherwise idle: a rebuild queued while another
      // job holds the lock is already protected by that job's lock, and
      // stomping it would release it early in `finishJob`.
      if (ledger.maintenanceLock === 'NONE')
        await ctx.db.patch(ledger._id, {
          maintenanceLock: 'ROLLUP',
          updatedAt: now,
        });
      await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
        jobId,
      });
      queued += 1;
    }
    return {queued, skipped};
  },
});

export const rollupProgress = migrationMutation({
  args: {runId: v.string(), state: v.optional(v.string())},
  returns: v.object({
    queued: v.number(),
    running: v.number(),
    done: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const prefix = `ROLLUP_REBUILD:migration:${args.runId}:`;
    const totals = {queued: 0, running: 0, done: 0, failed: 0};
    for (const state of ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const) {
      const rows = await ctx.db
        .query('maintenanceJobs')
        .withIndex('by_state_updatedAt', (index) => index.eq('state', state))
        .take(2001);
      if (rows.length > 2000)
        throw new Error('migration rollup job bound exceeded');
      const count = rows.filter((row) => row.jobKey.startsWith(prefix)).length;
      if (state === 'QUEUED') totals.queued = count;
      if (state === 'RUNNING') totals.running = count;
      if (state === 'DONE') totals.done = count;
      if (state === 'FAILED') totals.failed = count;
    }
    return totals;
  },
});
