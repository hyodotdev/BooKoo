import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {requireStoredProfileOf} from './permissions';

export async function requireRequestedMaintenanceJob(
  ctx: MutationCtx,
  jobId: Id<'maintenanceJobs'>,
  allowedKinds: readonly Doc<'maintenanceJobs'>['kind'][],
): Promise<{
  job: Doc<'maintenanceJobs'>;
  profile: Doc<'userProfiles'>;
}> {
  const job = await ctx.db.get('maintenanceJobs', jobId);
  if (
    job === null ||
    job.requestedByUserId === undefined ||
    !allowedKinds.includes(job.kind)
  )
    throw new Error('Maintenance job not found');
  const profile = await requireStoredProfileOf(ctx, job.requestedByUserId);
  return {job, profile};
}

/**
 * The migration may enqueue only ROLLUP_REBUILD and marks it with an
 * unforgeable-by-app job-key namespace. Its public entry point is separately
 * protected by MIGRATION_SECRET. All ordinary jobs still require a requester.
 */
export async function requireRequestedOrMigrationRollupJob(
  ctx: MutationCtx,
  jobId: Id<'maintenanceJobs'>,
): Promise<{job: Doc<'maintenanceJobs'>}> {
  const job = await ctx.db.get('maintenanceJobs', jobId);
  if (
    job === null ||
    !['ROLLUP_REBUILD', 'TIMEZONE_REBUCKET', 'CURRENCY_REBASE'].includes(
      job.kind,
    )
  )
    throw new Error('Rollup rebuild job not found');
  if (job.requestedByUserId === undefined) {
    if (
      job.kind !== 'ROLLUP_REBUILD' ||
      !job.jobKey.startsWith('ROLLUP_REBUILD:migration:')
    )
      throw new Error('Migration rollup job not found');
    return {job};
  }
  await requireStoredProfileOf(ctx, job.requestedByUserId);
  return {job};
}
