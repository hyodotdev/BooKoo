import {v, type Infer} from 'convex/values';

import {internal} from '../_generated/api';
import type {Doc, Id, TableNames} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {
  CASCADE_BATCH,
  ITEM_PURGE_GRACE_MS,
  LEDGER_PURGE_ITEM_BATCH,
  LEDGER_PURGE_STALL_MS,
  PURGE_BATCH,
  TRASH_LEDGER_PAGE,
} from '../lib/constants';
import {internalMutation} from '../lib/functions';
import {ledgerIsReachable} from '../lib/ledgerPermissions';

/**
 * The privacy policy destroys trashed entries and ledgers 30 days after
 * deletion; restore already refuses past that point. Hard deletes cannot be
 * undone, so every job here is inert until the deployment opts in:
 *
 *   TRASH_PURGE_MODE unset/off  return immediately
 *   TRASH_PURGE_MODE=dry_run    walk the same ranges, delete nothing, log totals
 *   TRASH_PURGE_MODE=enforce    delete
 *
 * Rollout and review steps: `.notes/design/trash-purge.md`.
 */
export type PurgeMode = 'off' | 'dry_run' | 'enforce';

/** Every purge switch reads `off` unless set to exactly `dry_run` or `enforce`. */
export const purgeModeOf = (value: string | undefined): PurgeMode =>
  value === 'dry_run' || value === 'enforce' ? value : 'off';

export const trashPurgeMode = (): PurgeMode =>
  purgeModeOf(process.env.TRASH_PURGE_MODE);

const itemTotalsValidator = v.object({
  scanned: v.number(),
  ledgers: v.number(),
  cappedLedgers: v.number(),
  items: v.number(),
  photos: v.number(),
  comments: v.number(),
});
type ItemTotals = Infer<typeof itemTotalsValidator>;

const EMPTY_ITEM_TOTALS: ItemTotals = {
  scanned: 0,
  ledgers: 0,
  cappedLedgers: 0,
  items: 0,
  photos: 0,
  comments: 0,
};

/** Upload row first, then the blob; a blob already gone is not an error. */
const freeBlob = async (
  ctx: MutationCtx,
  storageId: Id<'_storage'>,
): Promise<void> => {
  const upload = await ctx.db
    .query('uploads')
    .withIndex('by_storageId', (index) => index.eq('storageId', storageId))
    .unique();
  if (upload !== null) await ctx.db.delete(upload._id);
  if ((await ctx.db.system.get('_storage', storageId)) !== null)
    await ctx.storage.delete(storageId);
};

const deletePhoto = async (
  ctx: MutationCtx,
  photo: Doc<'itemPhotos'>,
): Promise<void> => {
  for (const storageId of [photo.storageId, photo.thumbStorageId])
    if (storageId !== undefined) await freeBlob(ctx, storageId);
  await ctx.db.delete(photo._id);
};

/**
 * One trashed entry: its photos (blobs first), its comments, then the entry.
 * Returns the rows deleted; the entry itself goes only once both children are
 * empty, so a run that stops early resumes on the same entry.
 */
const purgeTrashedItem = async (
  ctx: MutationCtx,
  item: Doc<'ledgerItems'>,
  budget: number,
  totals: ItemTotals,
): Promise<number> => {
  const photos = await ctx.db
    .query('itemPhotos')
    .withIndex('by_itemId_deletedAt_order', (index) =>
      index.eq('itemId', item._id),
    )
    .take(budget);
  for (const photo of photos) await deletePhoto(ctx, photo);
  totals.photos += photos.length;
  if (photos.length === budget) return photos.length;
  const comments = await ctx.db
    .query('itemComments')
    .withIndex('by_itemId_deletedAt_createdAt', (index) =>
      index.eq('itemId', item._id),
    )
    .take(budget - photos.length);
  for (const comment of comments) await ctx.db.delete(comment._id);
  totals.comments += comments.length;
  const used = photos.length + comments.length;
  if (used === budget) return used;
  // Already soft-deleted, so the rollup trigger has nothing to subtract.
  await ctx.db.delete(item._id);
  totals.items += 1;
  return used + 1;
};

/**
 * Nightly: trashed entries of live ledgers. Deleted ledgers are left to
 * `purgeDeletedLedgers`; ledgers under a maintenance lock wait a night.
 */
export const purgeSoftDeleted = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    totals: v.optional(itemTotalsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const mode = trashPurgeMode();
    if (mode === 'off') return null;
    const cutoff = Date.now() - ITEM_PURGE_GRACE_MS;
    const totals = {...(args.totals ?? EMPTY_ITEM_TOTALS)};
    const page = await ctx.db
      .query('ledgers')
      .withIndex('by_creation_time')
      .paginate({cursor: args.cursor ?? null, numItems: TRASH_LEDGER_PAGE});
    let budget = CASCADE_BATCH;
    for (const ledger of page.page) {
      // Deleted ledgers go whole through `purgeDeletedLedgers`; orphaned ones
      // wait for a claim-window decision (`.notes/design/trash-purge.md`).
      if (!ledgerIsReachable(ledger) || ledger.maintenanceLock !== 'NONE')
        continue;
      // `undefined` sorts below every number, so the lower bound keeps live
      // entries out of the range.
      const expired = await ctx.db
        .query('ledgerItems')
        .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
          index
            .eq('ledgerId', ledger._id)
            .gte('deletedAt', 0)
            .lte('deletedAt', cutoff),
        )
        .take(mode === 'enforce' ? budget : CASCADE_BATCH + 1);
      if (expired.length === 0) continue;
      if (mode === 'dry_run') {
        totals.ledgers += 1;
        totals.items += Math.min(expired.length, CASCADE_BATCH);
        if (expired.length > CASCADE_BATCH) totals.cappedLedgers += 1;
        continue;
      }
      for (const item of expired) {
        budget -= await purgeTrashedItem(ctx, item, budget, totals);
        if (budget === 0) break;
      }
      if (budget === 0) {
        // Rerun this page: the ledger may still hold expired entries.
        await ctx.scheduler.runAfter(
          0,
          internal.maintenance.purge.purgeSoftDeleted,
          {cursor: args.cursor, totals},
        );
        return null;
      }
      totals.ledgers += 1;
    }
    totals.scanned += page.page.length;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.purge.purgeSoftDeleted,
        {cursor: page.continueCursor, totals},
      );
      return null;
    }
    console.log(
      JSON.stringify({event: 'trash_purge.items', mode, cutoff, ...totals}),
    );
    return null;
  },
});

/**
 * Nightly: ledgers whose restore window has closed. Each one is locked
 * `DELETING` and handed to a resumable LEDGER_PURGE job.
 */
export const purgeDeletedLedgers = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const mode = trashPurgeMode();
    if (mode === 'off') return null;
    const now = Date.now();
    // Without the lower bound every ledger with no `purgeAfter` — every live
    // ledger — would sort into this range.
    const due = await ctx.db
      .query('ledgers')
      .withIndex('by_purgeAfter', (index) =>
        index.gte('purgeAfter', 0).lte('purgeAfter', now),
      )
      .take(PURGE_BATCH);
    let started = 0;
    let running = 0;
    for (const ledger of due) {
      if (ledger.deletedAt === undefined) continue;
      const jobKey = `LEDGER_PURGE:${ledger._id}`;
      const job = await ctx.db
        .query('maintenanceJobs')
        .withIndex('by_jobKey', (index) => index.eq('jobKey', jobKey))
        .unique();
      if (
        job !== null &&
        job.state !== 'DONE' &&
        now - job.updatedAt < LEDGER_PURGE_STALL_MS
      ) {
        running += 1;
        continue;
      }
      started += 1;
      if (mode === 'dry_run') continue;
      await ctx.db.patch(ledger._id, {
        maintenanceLock: 'DELETING',
        updatedAt: now,
      });
      const jobId =
        job === null
          ? await ctx.db.insert('maintenanceJobs', {
              kind: 'LEDGER_PURGE',
              jobKey,
              ledgerId: ledger._id,
              state: 'RUNNING',
              phase: LEDGER_PURGE_PHASES[0],
              processed: 0,
              startedAt: now,
              updatedAt: now,
            })
          : job._id;
      if (job !== null)
        await ctx.db.patch(job._id, {state: 'RUNNING', updatedAt: now});
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.purge.purgeLedgerBatch,
        {jobId},
      );
    }
    console.log(
      JSON.stringify({
        event: 'trash_purge.ledgers',
        mode,
        due: due.length,
        started,
        running,
      }),
    );
    return null;
  },
});

/**
 * Children before parents: blobs before the rows that name them, comments and
 * photos before entries, entries (whose trigger still adjusts rollups) before
 * the rollup tables, invites before nothing references them.
 */
const LEDGER_PURGE_PHASES = [
  'photos',
  'uploads',
  'comments',
  'items',
  'receipts',
  'categories',
  'dayRollups',
  'monthRollups',
  'categoryRollups',
  'memberState',
  'members',
  'invites',
  'joinRequests',
  'notifications',
  'auditLog',
  'finalize',
] as const;
type LedgerPurgePhase = (typeof LEDGER_PURGE_PHASES)[number];

const isLedgerPurgePhase = (value: string): value is LedgerPurgePhase =>
  LEDGER_PURGE_PHASES.some((phase) => phase === value);

type PhaseStep = {deleted: number; done: boolean};

/** `limit` is what the caller asked for: a short page means the phase is done. */
const deleteAll = async (
  ctx: MutationCtx,
  rows: readonly {_id: Id<TableNames>}[],
  limit: number,
): Promise<PhaseStep> => {
  for (const row of rows) await ctx.db.delete(row._id);
  return {deleted: rows.length, done: rows.length < limit};
};

/** Deletes up to `budget` rows of one phase. */
const purgeLedgerPhase = async (
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  phase: Exclude<LedgerPurgePhase, 'finalize'>,
  budget: number,
): Promise<PhaseStep> => {
  switch (phase) {
    case 'photos': {
      const photos = await ctx.db
        .query('itemPhotos')
        .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
          index.eq('ledgerId', ledgerId),
        )
        .take(budget);
      for (const photo of photos) await deletePhoto(ctx, photo);
      return {deleted: photos.length, done: photos.length < budget};
    }
    case 'uploads': {
      const uploads = await ctx.db
        .query('uploads')
        .withIndex('by_ledgerId_createdAt', (index) =>
          index.eq('ledgerId', ledgerId),
        )
        .take(budget);
      for (const upload of uploads) {
        if ((await ctx.db.system.get('_storage', upload.storageId)) !== null)
          await ctx.storage.delete(upload.storageId);
        await ctx.db.delete(upload._id);
      }
      return {deleted: uploads.length, done: uploads.length < budget};
    }
    case 'comments':
      return deleteAll(
        ctx,
        await ctx.db
          .query('itemComments')
          .withIndex('by_ledgerId_deletedAt_authorId_createdAt', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'items': {
      const limit = Math.min(budget, LEDGER_PURGE_ITEM_BATCH);
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerItems')
          .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(limit),
        limit,
      );
    }
    case 'receipts':
      return deleteAll(
        ctx,
        await ctx.db
          .query('clientMutationReceipts')
          .withIndex('by_ledgerId_createdAt', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'categories':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerCategories')
          .withIndex('by_ledgerId_sortOrder', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'dayRollups':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerDayRollups')
          .withIndex('by_ledgerId_dayKey_shard', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'monthRollups':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerMonthRollups')
          .withIndex('by_ledgerId_monthKey_shard', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'categoryRollups':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerCategoryMonthRollups')
          .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'memberState':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerMemberState')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'members':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_deletedAt_role', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'invites': {
      // Redemptions are keyed by invite, so each invite clears its own first.
      const invites = await ctx.db
        .query('ledgerInvites')
        .withIndex('by_ledgerId_revokedAt_createdAt', (index) =>
          index.eq('ledgerId', ledgerId),
        )
        .take(budget);
      let used = 0;
      for (const invite of invites) {
        const redemptions = await ctx.db
          .query('ledgerInviteRedemptions')
          .withIndex('by_inviteId_redeemedAt', (index) =>
            index.eq('inviteId', invite._id),
          )
          .take(budget - used);
        used += (await deleteAll(ctx, redemptions, budget - used)).deleted;
        if (used === budget) return {deleted: used, done: false};
        await ctx.db.delete(invite._id);
        used += 1;
      }
      return {deleted: used, done: invites.length < budget && used < budget};
    }
    case 'joinRequests':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerJoinRequests')
          .withIndex('by_ledgerId_userId', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'notifications':
      return deleteAll(
        ctx,
        await ctx.db
          .query('notifications')
          .withIndex('by_ledgerId_createdAt', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
    case 'auditLog':
      return deleteAll(
        ctx,
        await ctx.db
          .query('ledgerAuditLog')
          .withIndex('by_ledgerId_createdAt', (index) =>
            index.eq('ledgerId', ledgerId),
          )
          .take(budget),
        budget,
      );
  }
};

/** One transaction of a LEDGER_PURGE job; reschedules itself until finalize. */
export const purgeLedgerBatch = internalMutation({
  args: {jobId: v.id('maintenanceJobs')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get('maintenanceJobs', args.jobId);
    if (job === null || job.kind !== 'LEDGER_PURGE' || job.state === 'DONE')
      return null;
    if (trashPurgeMode() !== 'enforce' || job.ledgerId === undefined)
      return null;
    const ledgerId = job.ledgerId;
    const ledger = await ctx.db.get('ledgers', ledgerId);
    const now = Date.now();
    const refusal =
      ledger === null || ledger.deletedAt === undefined
        ? 'target is not a deleted ledger'
        : ledger.purgeAfter === undefined || now < ledger.purgeAfter
          ? 'target is still restorable'
          : !isLedgerPurgePhase(job.phase)
            ? 'unknown phase'
            : null;
    if (refusal !== null || !isLedgerPurgePhase(job.phase)) {
      await ctx.db.patch(job._id, {
        state: 'FAILED',
        lastError: refusal ?? 'unknown phase',
        updatedAt: now,
      });
      console.error(
        JSON.stringify({event: 'trash_purge.ledger_failed', ledgerId, refusal}),
      );
      return null;
    }
    let phase: LedgerPurgePhase = job.phase;
    let budget = CASCADE_BATCH;
    let processed = job.processed;
    while (phase !== 'finalize' && budget > 0) {
      const step = await purgeLedgerPhase(ctx, ledgerId, phase, budget);
      processed += step.deleted;
      budget -= step.deleted;
      if (!step.done) break;
      phase = LEDGER_PURGE_PHASES[LEDGER_PURGE_PHASES.indexOf(phase) + 1];
    }
    if (phase !== 'finalize') {
      await ctx.db.patch(job._id, {phase, processed, updatedAt: now});
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.purge.purgeLedgerBatch,
        {jobId: job._id},
      );
      return null;
    }
    // A stripped tombstone keeps `legacyKey`, so a migration rerun cannot
    // re-import the ledger, and stays `DELETING`, so every gate refuses it.
    await ctx.db.patch(ledgerId, {
      title: '',
      description: '',
      emoji: undefined,
      iconKey: undefined,
      legacyRaw: undefined,
      memberCount: 0,
      purgeAfter: undefined,
      maintenanceLock: 'DELETING',
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      phase,
      processed,
      state: 'DONE',
      finishedAt: now,
      updatedAt: now,
    });
    console.log(
      JSON.stringify({event: 'trash_purge.ledger_done', ledgerId, processed}),
    );
    return null;
  },
});
