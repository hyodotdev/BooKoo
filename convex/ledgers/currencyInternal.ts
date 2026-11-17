import {v} from 'convex/values';

import {scaleOf} from '../../shared/currency';
import {roundHalfAwayFromZero} from '../../shared/money';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {internalMutation} from '../lib/functions';
import {requireRequestedMaintenanceJob} from '../lib/maintenancePermissions';

interface CurrencyJobArgs {
  readonly from: string;
  readonly to: string;
  readonly currentMonth?: number;
}

const parseJobArgs = (value: string | undefined): CurrencyJobArgs => {
  if (value === undefined) throw new Error('Missing currency job args');
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
    throw new Error('Invalid currency job args');
  return {
    from: parsed.from,
    to: parsed.to,
    ...('currentMonth' in parsed && typeof parsed.currentMonth === 'number'
      ? {currentMonth: parsed.currentMonth}
      : {}),
  };
};

const firstMonth = async (
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
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

const contradictsEvidence = (
  evidence: string | undefined,
  currency: string,
): boolean =>
  evidence !== undefined &&
  evidence !== 'UNKNOWN' &&
  evidence !== 'OTHER' &&
  evidence !== currency;

const failEvidence = async (
  ctx: MutationCtx,
  args: {
    jobId: Id<'maintenanceJobs'>;
    ledgerId: Id<'ledgers'>;
    itemId: Id<'ledgerItems'>;
    legacyKey: string | undefined;
    evidence: string;
    target: string;
  },
): Promise<void> => {
  const now = Date.now();
  await ctx.db.patch(args.itemId, {needsReview: true, updatedAt: now});
  await ctx.db.insert('migrationAnomalies', {
    kind: 'CURRENCY_EVIDENCE_MISMATCH',
    sourcePath: `item:${args.itemId}`,
    legacyKey: args.legacyKey ?? '',
    table: 'ledgerItems',
    producedRow: true,
    detailJson: JSON.stringify({
      evidence: args.evidence,
      target: args.target,
    }),
    createdAt: now,
  });
  await ctx.db.patch(args.jobId, {
    state: 'FAILED',
    lastError: 'CURRENCY_EVIDENCE_MISMATCH',
    updatedAt: now,
    finishedAt: now,
  });
  const ledger = await ctx.db.get('ledgers', args.ledgerId);
  if (ledger !== null)
    await ctx.db.patch(ledger._id, {
      maintenanceLock: 'NONE',
      updatedAt: now,
    });
};

export const rebaseCurrency = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {job} = await requireRequestedMaintenanceJob(ctx, args.jobId, [
      'CURRENCY_REBASE',
    ]);
    if (job.state === 'DONE' || job.state === 'FAILED') return null;
    if (job.ledgerId === undefined)
      throw new Error('Currency job ledger missing');
    const ledgerId = job.ledgerId;
    const jobArgs = parseJobArgs(job.argsJson);
    const currentMonth =
      jobArgs.currentMonth ?? (await firstMonth(ctx, ledgerId));
    if (currentMonth === null) {
      const ledger = await ctx.db.get('ledgers', ledgerId);
      if (ledger === null) throw new Error('Currency job ledger not found');
      const now = Date.now();
      await ctx.db.patch(ledger._id, {
        baseCurrency: jobArgs.to,
        currencyIsAssumed: false,
        updatedAt: now,
      });
      await ctx.db.insert('ledgerAuditLog', {
        ledgerId,
        action: 'CURRENCY_CONFIRMED',
        retention: 'AUDIT',
        actorUserId: job.requestedByUserId,
        meta: {from: jobArgs.from, to: jobArgs.to},
        createdAt: now,
      });
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
    if (job.phase === 'preflight') {
      const mismatch = page.page.find((item) =>
        contradictsEvidence(item.legacyCurrencyEvidence, jobArgs.to),
      );
      if (mismatch !== undefined) {
        await failEvidence(ctx, {
          jobId: job._id,
          ledgerId,
          itemId: mismatch._id,
          legacyKey: mismatch.legacyKey,
          evidence: mismatch.legacyCurrencyEvidence ?? 'UNKNOWN',
          target: jobArgs.to,
        });
        return null;
      }
    } else {
      const fromScale = scaleOf(jobArgs.from);
      const toScale = scaleOf(jobArgs.to);
      const now = Date.now();
      for (const item of page.page) {
        // `legacyRealAmount` is provenance, not a live value. `migrate/verify.ts`
        // defines a row as still matching its legacy source by exactly one
        // identity — `legacyRealAmount * scaleOf(currency) === signedMinor` —
        // and counts anything else as lossy. While it holds, re-deriving the
        // amount from the verbatim legacy number is exact, which is why this
        // branch exists: it avoids compounding the rounding of a scale
        // division across repeated rebases.
        //
        // Once the owner has edited the amount or flipped the type, it no
        // longer holds. `items.update` writes `amountMinor` and never clears
        // `legacyRealAmount` — deliberately, because verification joins on it —
        // so preferring it unconditionally reverted the edit to the 2019 figure
        // and then `ROLLUP_REBUILD` rebuilt every month, day and category total
        // from the reverted number. Silently, on migrated production rows.
        // Compared on magnitude because `amountMinor` is unsigned — the type
        // carries the sign. Checking the signed identity instead is equivalent
        // here: when the magnitudes agree, both branches produce
        // `|legacyRealAmount| * toScale`.
        const legacy = item.legacyRealAmount;
        const amountMinor =
          legacy !== undefined &&
          Math.abs(Math.abs(legacy) * fromScale - item.amountMinor) <= 1e-9
            ? roundHalfAwayFromZero(Math.abs(legacy) * toScale)
            : roundHalfAwayFromZero((item.amountMinor * toScale) / fromScale);
        if (amountMinor === 0 || !Number.isSafeInteger(amountMinor))
          throw new Error('Invalid rebased amount');
        await ctx.db.patch(item._id, {
          amountMinor,
          currency: jobArgs.to,
          baseCurrency: jobArgs.to,
          baseAmountMinor: amountMinor,
          fxRateMicros: undefined,
          fxAt: undefined,
          fxSource: undefined,
          updatedAt: Math.max(now, item.updatedAt + 1),
        });
      }
    }
    const now = Date.now();
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
        internal.ledgers.currencyInternal.rebaseCurrency,
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
        internal.ledgers.currencyInternal.rebaseCurrency,
        {jobId: job._id},
      );
      return null;
    }
    if (job.phase === 'preflight') {
      await ctx.db.patch(job._id, {
        state: 'RUNNING',
        phase: 'items',
        cursor: undefined,
        processed: 0,
        argsJson: JSON.stringify({from: jobArgs.from, to: jobArgs.to}),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.ledgers.currencyInternal.rebaseCurrency,
        {jobId: job._id},
      );
      return null;
    }
    const ledger = await ctx.db.get('ledgers', ledgerId);
    if (ledger === null) throw new Error('Currency job ledger not found');
    await ctx.db.patch(ledger._id, {
      baseCurrency: jobArgs.to,
      currencyIsAssumed: false,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId,
      action: 'CURRENCY_CONFIRMED',
      retention: 'AUDIT',
      actorUserId: job.requestedByUserId,
      meta: {from: jobArgs.from, to: jobArgs.to},
      createdAt: now,
    });
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
  },
});
