import {v} from 'convex/values';

import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireLedgerRole} from '../lib/ledgerPermissions';
import {requireActiveProfile} from '../lib/permissions';
import {enforceRateLimit} from '../lib/rateLimits';

async function createExport(
  ctx: MutationCtx,
  requesterUserId: Id<'users'>,
  kind: 'PERSONAL' | 'LEDGER',
  ledgerId?: Id<'ledgers'>,
): Promise<Id<'dataExports'>> {
  const states = ['QUEUED', 'RUNNING'] as const;
  for (const state of states) {
    const active = await ctx.db
      .query('dataExports')
      .withIndex('by_requesterUserId_kind_ledgerId_state', (index) =>
        index
          .eq('requesterUserId', requesterUserId)
          .eq('kind', kind)
          .eq('ledgerId', ledgerId)
          .eq('state', state),
      )
      .first();
    if (active !== null) throw appError('INVALID_INPUT', 'error.invalidInput');
  }
  const now = Date.now();
  const exportId = await ctx.db.insert('dataExports', {
    requesterUserId,
    ...(ledgerId === undefined ? {} : {ledgerId}),
    kind,
    state: 'QUEUED',
    phase: 'queued',
    fileCount: 0,
    totalBytes: 0,
    requestedAt: now,
    updatedAt: now,
  });
  const jobKind = kind === 'PERSONAL' ? 'USER_EXPORT' : 'LEDGER_EXPORT';
  const jobId = await ctx.db.insert('maintenanceJobs', {
    kind: jobKind,
    jobKey: `${jobKind}:${exportId}`,
    ...(ledgerId === undefined ? {} : {ledgerId}),
    state: 'QUEUED',
    phase: 'snapshot',
    processed: 0,
    startedAt: now,
    updatedAt: now,
    requestedByUserId: requesterUserId,
  });
  await ctx.scheduler.runAfter(0, internal.exports.actions.build, {
    exportId,
    jobId,
  });
  return exportId;
}

export const requestPersonal = mutation({
  args: {},
  returns: v.object({exportId: v.id('dataExports')}),
  handler: async (ctx) => {
    const profile = await requireActiveProfile(ctx);
    await enforceRateLimit(ctx, 'dataExportRequest', String(profile.userId));
    return {
      exportId: await createExport(ctx, profile.userId, 'PERSONAL'),
    };
  },
});

export const requestLedger = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.object({exportId: v.id('dataExports')}),
  handler: async (ctx, args) => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN', {
      allowArchived: true,
    });
    await enforceRateLimit(
      ctx,
      'dataExportRequest',
      String(context.profile.userId),
    );
    const exportId = await createExport(
      ctx,
      context.profile.userId,
      'LEDGER',
      args.ledgerId,
    );
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'EXPORT_REQUESTED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      createdAt: Date.now(),
    });
    return {exportId};
  },
});

export const deleteExport = mutation({
  args: {exportId: v.id('dataExports')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const dataExport = await ctx.db.get('dataExports', args.exportId);
    if (dataExport === null || dataExport.requesterUserId !== profile.userId)
      throw appError('NOT_FOUND', 'error.notFound');
    const now = Date.now();
    await ctx.db.patch(dataExport._id, {
      state: 'EXPIRED',
      phase: 'deleting',
      expiresAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.exports.worker.cleanup, {
      exportId: dataExport._id,
    });
    return null;
  },
});
