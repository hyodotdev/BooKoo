import {getAuthUserId} from '@convex-dev/auth/server';

import type {Doc, Id} from '../_generated/dataModel';
import type {ActionCtx, MutationCtx, QueryCtx} from '../_generated/server';
import {PERF_SEED_JOB_KEY, PERF_SEED_LEDGER_PREFIX} from './constants';
import {appError} from './errors';

type ReadCtx = QueryCtx | MutationCtx;

async function profileOf(
  ctx: ReadCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'> | null> {
  return await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

/** Server-owned background work may stop quietly after account deletion. */
export async function getLiveProfileOf(
  ctx: ReadCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'> | null> {
  const profile = await profileOf(ctx, userId);
  return profile &&
    profile.purgedAt === undefined &&
    profile.deletedAt === undefined
    ? profile
    : null;
}

export async function getCurrentProfile(
  ctx: ReadCtx,
): Promise<Doc<'userProfiles'> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const profile = await profileOf(ctx, userId);
  return profile?.purgedAt === undefined ? profile : null;
}

export async function requireProfile(
  ctx: ReadCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await getCurrentProfile(ctx);
  if (profile === null) throw appError('UNAUTHENTICATED', 'error.unauthorized');
  return profile;
}

export async function requireActiveProfile(
  ctx: ReadCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await requireProfile(ctx);
  if (profile.appRole === 'SUSPENDED')
    throw appError('ACCOUNT_SUSPENDED', 'error.account.suspended');
  if (profile.deletedAt !== undefined)
    throw appError('ACCOUNT_DELETED', 'error.account.deleted');
  return profile;
}

export async function requireOnboarded(
  ctx: ReadCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await requireActiveProfile(ctx);
  if (profile.onboardingStep !== 'done')
    throw appError('ONBOARDING_REQUIRED', 'error.onboardingRequired');
  if (profile.handleKey === undefined)
    throw appError('HANDLE_REQUIRED', 'error.handle.required');
  return profile;
}

export async function requireAppAdmin(
  ctx: ReadCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await requireOnboarded(ctx);
  if (profile.appRole !== 'ADMIN')
    throw appError('FORBIDDEN', 'error.forbidden');
  return profile;
}

export async function requireActionUserId(
  ctx: ActionCtx,
): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw appError('UNAUTHENTICATED', 'error.unauthorized');
  return userId;
}

export async function requireProfileOf(
  ctx: ReadCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'>> {
  const profile = await profileOf(ctx, userId);
  if (profile === null || profile.purgedAt !== undefined)
    throw appError('UNAUTHENTICATED', 'error.unauthorized');
  if (profile.appRole === 'SUSPENDED')
    throw appError('ACCOUNT_SUSPENDED', 'error.account.suspended');
  if (profile.deletedAt !== undefined)
    throw appError('ACCOUNT_DELETED', 'error.account.deleted');
  return profile;
}

/** Internal profile lookup that deliberately allows the deletion grace state. */
export async function requireStoredProfileOf(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'>> {
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique();
  if (profile === null || profile.purgedAt !== undefined)
    throw appError('ACCOUNT_DELETED', 'error.auth.accountPurged');
  return profile;
}

/**
 * Internal-only gate for the destructive synthetic scale fixture. A first run
 * is accepted only on an empty deployment; retries must resolve the one
 * reserved job. This keeps an accidental call away from any deployment that
 * already carries application data while still allowing fresh CI previews.
 */
export async function requirePerformanceSeedAccess(
  ctx: ReadCtx,
): Promise<Doc<'maintenanceJobs'> | null> {
  const existing = await ctx.db
    .query('maintenanceJobs')
    .withIndex('by_jobKey', (index) => index.eq('jobKey', PERF_SEED_JOB_KEY))
    .unique();
  if (existing !== null) return existing;
  const anyUser = await ctx.db.query('users').withIndex('email').first();
  const anyLegacyUser = await ctx.db
    .query('legacyUsers')
    .withIndex('by_legacyUid')
    .first();
  const anyLedger = await ctx.db
    .query('ledgers')
    .withIndex('by_rollupVersion')
    .first();
  if (anyUser !== null || anyLegacyUser !== null || anyLedger !== null)
    throw new Error('Performance seed requires an empty deployment');
  return null;
}

export async function requirePerformanceSeedJob(
  ctx: MutationCtx,
  jobId: Id<'maintenanceJobs'>,
): Promise<{
  job: Doc<'maintenanceJobs'>;
  profile: Doc<'userProfiles'>;
}> {
  const job = await ctx.db.get('maintenanceJobs', jobId);
  if (
    job === null ||
    job.jobKey !== PERF_SEED_JOB_KEY ||
    job.kind !== 'LEGACY_IMPORT' ||
    job.requestedByUserId === undefined
  )
    throw new Error('Performance seed job not found');
  const profile = await requireStoredProfileOf(ctx, job.requestedByUserId);
  return {job, profile};
}

export async function requirePerformanceFixture(
  ctx: ReadCtx,
  ledgerId: Id<'ledgers'>,
): Promise<{
  ledger: Doc<'ledgers'>;
  job: Doc<'maintenanceJobs'>;
}> {
  const ledger = await ctx.db.get('ledgers', ledgerId);
  if (ledger === null || !ledger.legacyKey?.startsWith(PERF_SEED_LEDGER_PREFIX))
    throw new Error('Performance fixture ledger not found');
  const job = await ctx.db
    .query('maintenanceJobs')
    .withIndex('by_jobKey', (index) => index.eq('jobKey', PERF_SEED_JOB_KEY))
    .unique();
  if (job === null || job.state !== 'DONE')
    throw new Error('Performance fixture is not ready');
  return {ledger, job};
}
