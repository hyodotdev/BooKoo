import {v} from 'convex/values';

import {offsetMinutesAt, toDayKey, toMonthKey} from '../../shared/date';
import {internal} from '../_generated/api';
import type {Doc} from '../_generated/dataModel';
import {internalMutation} from '../lib/functions';
import {requireRequestedMaintenanceJob} from '../lib/maintenancePermissions';

interface TimeZoneJobArgs {
  readonly from: string;
  readonly to: string;
  readonly currentMonth?: number;
}

const parseJobArgs = (value: string | undefined): TimeZoneJobArgs => {
  if (value === undefined) throw new Error('Missing timezone job args');
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('from' in parsed) ||
    !('to' in parsed) ||
    typeof parsed.from !== 'string' ||
    typeof parsed.to !== 'string' ||
    ('currentMonth' in parsed &&
      parsed.currentMonth !== undefined &&
      typeof parsed.currentMonth !== 'number')
  )
    throw new Error('Invalid timezone job args');
  return {
    from: parsed.from,
    to: parsed.to,
    ...('currentMonth' in parsed && typeof parsed.currentMonth === 'number'
      ? {currentMonth: parsed.currentMonth}
      : {}),
  };
};

const firstMonth = async (
  ctx: Parameters<typeof requireRequestedMaintenanceJob>[0],
  ledgerId: Doc<'ledgers'>['_id'],
  after?: number,
): Promise<number | null> => {
  const item = await ctx.db
    .query('ledgerItems')
    .withIndex('by_ledgerId_monthKey', (index) => {
      const range = index.eq('ledgerId', ledgerId);
      return after === undefined ? range : range.gt('monthKey', after);
    })
    .first();
  return item?.monthKey ?? null;
};

export const rebucketTimeZone = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {job} = await requireRequestedMaintenanceJob(ctx, args.jobId, [
      'TIMEZONE_REBUCKET',
    ]);
    if (job.state === 'DONE') return null;
    if (job.phase === 'rebuild') {
      await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
        jobId: job._id,
      });
      return null;
    }
    if (job.ledgerId === undefined)
      throw new Error('Timezone job ledger missing');
    const ledgerId = job.ledgerId;
    const jobArgs = parseJobArgs(job.argsJson);
    const currentMonth =
      jobArgs.currentMonth ?? (await firstMonth(ctx, ledgerId));
    if (currentMonth === null) {
      const now = Date.now();
      await ctx.db.patch(job._id, {
        phase: 'rebuild',
        cursor: undefined,
        argsJson: undefined,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
        jobId: job._id,
      });
      return null;
    }
    const page = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_monthKey', (index) =>
        index.eq('ledgerId', ledgerId).eq('monthKey', currentMonth),
      )
      .paginate({cursor: job.cursor ?? null, numItems: 200});
    const now = Date.now();
    for (const item of page.page) {
      const dayKey = toDayKey(item.occurredAt, jobArgs.to);
      const monthKey = toMonthKey(item.occurredAt, jobArgs.to);
      const occurredOffsetMinutes = offsetMinutesAt(
        item.occurredAt,
        jobArgs.to,
      );
      if (
        dayKey !== item.dayKey ||
        monthKey !== item.monthKey ||
        occurredOffsetMinutes !== item.occurredOffsetMinutes
      )
        await ctx.db.patch(item._id, {
          dayKey,
          monthKey,
          occurredOffsetMinutes,
          updatedAt: Math.max(now, item.updatedAt + 1),
        });
    }
    if (!page.isDone) {
      await ctx.db.patch(job._id, {
        state: 'RUNNING',
        cursor: page.continueCursor,
        processed: job.processed + page.page.length,
        argsJson: JSON.stringify({...jobArgs, currentMonth}),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.ledgers.internal.rebucketTimeZone,
        {jobId: job._id},
      );
      return null;
    }
    const nextMonth = await firstMonth(ctx, ledgerId, currentMonth);
    if (nextMonth !== null) {
      await ctx.db.patch(job._id, {
        state: 'RUNNING',
        cursor: undefined,
        processed: job.processed + page.page.length,
        argsJson: JSON.stringify({...jobArgs, currentMonth: nextMonth}),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.ledgers.internal.rebucketTimeZone,
        {jobId: job._id},
      );
      return null;
    }
    await ctx.db.patch(job._id, {
      phase: 'rebuild',
      cursor: undefined,
      processed: job.processed + page.page.length,
      argsJson: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.rollups.internal.rebuildBatch, {
      jobId: job._id,
    });
    return null;
  },
});
