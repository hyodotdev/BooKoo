import {v} from 'convex/values';

import {internal} from '../_generated/api';
import {internalMutation} from '../lib/functions';
import {requireRequestedMaintenanceJob} from '../lib/maintenancePermissions';

const parseArgs = (value: string | undefined): {from: string; to: string} => {
  if (value === undefined)
    throw new Error('Missing category reassignment args');
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('from' in parsed) ||
    !('to' in parsed) ||
    typeof parsed.from !== 'string' ||
    typeof parsed.to !== 'string'
  )
    throw new Error('Invalid category reassignment args');
  return {from: parsed.from, to: parsed.to};
};

export const reassignBatch = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {job} = await requireRequestedMaintenanceJob(ctx, args.jobId, [
      'CATEGORY_REASSIGN',
    ]);
    if (job.state === 'DONE') return null;
    if (job.ledgerId === undefined || job.requestedByUserId === undefined)
      throw new Error('Category reassignment job not found');
    const ledgerId = job.ledgerId;
    const requestedByUserId = job.requestedByUserId;
    const jobArgs = parseArgs(job.argsJson);
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex(
        'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
        (index) =>
          index
            .eq('ledgerId', ledgerId)
            .eq('deletedAt', undefined)
            .eq('categoryKey', jobArgs.from),
      )
      .paginate({
        cursor: job.cursor ?? null,
        numItems: 200,
      });
    const now = Date.now();
    for (const item of page.page)
      await ctx.db.patch(item._id, {
        categoryKey: jobArgs.to,
        updatedByUserId: requestedByUserId,
        updatedAt: Math.max(now, item.updatedAt + 1),
      });
    await ctx.db.patch(job._id, {
      state: page.isDone ? 'DONE' : 'RUNNING',
      cursor: page.isDone ? undefined : page.continueCursor,
      processed: job.processed + page.page.length,
      updatedAt: now,
      ...(page.isDone ? {finishedAt: now} : {}),
    });
    if (page.isDone) {
      const source = await ctx.db
        .query('ledgerCategories')
        .withIndex('by_ledgerId_key', (index) =>
          index.eq('ledgerId', ledgerId).eq('key', jobArgs.from),
        )
        .unique();
      if (source !== null)
        await ctx.db.patch(source._id, {
          reassignJobKey: undefined,
          archivedAt: now,
          hiddenAt: now,
          updatedAt: now,
        });
      await ctx.db.insert('ledgerAuditLog', {
        ledgerId,
        action: 'CATEGORY_REASSIGNED',
        retention: 'AUDIT',
        actorUserId: requestedByUserId,
        meta: {from: jobArgs.from, to: jobArgs.to},
        createdAt: now,
      });
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.categories.internal.reassignBatch,
        {jobId: job._id},
      );
    }
    return null;
  },
});
