import type {Doc, Id} from '../_generated/dataModel';
import type {ActionCtx, MutationCtx, QueryCtx} from '../_generated/server';
import {internal} from '../_generated/api';

export async function requireExportJob(
  ctx: QueryCtx | MutationCtx,
  exportId: Id<'dataExports'>,
): Promise<{
  readonly dataExport: Doc<'dataExports'>;
  readonly job: Doc<'maintenanceJobs'>;
}> {
  const dataExport = await ctx.db.get('dataExports', exportId);
  const job = await ctx.db
    .query('maintenanceJobs')
    .withIndex('by_jobKey', (index) =>
      index.eq(
        'jobKey',
        `${dataExport?.kind === 'LEDGER' ? 'LEDGER_EXPORT' : 'USER_EXPORT'}:${exportId}`,
      ),
    )
    .unique();
  if (
    dataExport === null ||
    job === null ||
    job.requestedByUserId !== dataExport.requesterUserId ||
    (job.kind !== 'USER_EXPORT' && job.kind !== 'LEDGER_EXPORT')
  )
    throw new Error('Export job not found');
  return {dataExport, job};
}

export async function requireScheduledExportAction(
  ctx: ActionCtx,
  exportId: Id<'dataExports'>,
): Promise<void> {
  await ctx.runQuery(internal.exports.internal.authorizeWorker, {exportId});
}

export async function requireExportCleanupSource(
  ctx: MutationCtx,
  exportId: Id<'dataExports'>,
  now: number,
): Promise<Doc<'dataExports'>> {
  const dataExport = await ctx.db.get('dataExports', exportId);
  if (
    dataExport === null ||
    dataExport.expiresAt === undefined ||
    dataExport.expiresAt > now ||
    (dataExport.state !== 'READY' &&
      dataExport.state !== 'FAILED' &&
      dataExport.state !== 'EXPIRED')
  )
    throw new Error('Export cleanup source invalid');
  return dataExport;
}
