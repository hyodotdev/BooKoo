import {v, type Infer} from 'convex/values';

import {internal} from '../_generated/api';
import type {Doc, Id, TableNames} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {
  AUDIT_FEED_RETENTION_MS,
  CASCADE_BATCH,
  LEGAL_EVENT_PAGE,
  NOTIFICATION_RETENTION_MS,
  SECURITY_RECORD_RETENTION_MS,
  TRASH_LEDGER_PAGE,
  UPLOAD_CLAIM_TTL_MS,
  UPLOAD_REFERRER_SCAN_LIMIT,
  UPLOAD_SWEEP_PAGE,
} from '../lib/constants';
import {internalMutation} from '../lib/functions';
import {authAuditEventValidator} from '../schema/authSupport';
import {purgeModeOf, type PurgeMode} from './purge';

/**
 * Retention periods other than the trash. Each has its own switch, separate
 * from TRASH_PURGE_MODE, so enforcing one purge never enforces another:
 *
 *   RETENTION_PURGE_MODE  FEED audit rows, notifications, `authAudit` and
 *                         superseded consent records after 180 days; offline
 *                         update receipts at their 30-day `expiresAt`
 *   UPLOAD_SWEEP_MODE     claimed uploads nothing references, once
 *                         UPLOAD_CLAIM_TTL_MS has passed
 *
 * Mapping, open owner questions and rollout: `.notes/design/retention-purge.md`.
 */
export const retentionPurgeMode = (): PurgeMode =>
  purgeModeOf(process.env.RETENTION_PURGE_MODE);

export const uploadSweepMode = (): PurgeMode =>
  purgeModeOf(process.env.UPLOAD_SWEEP_MODE);

const retentionStageValidator = v.union(
  v.literal('ledgers'),
  v.literal('unscoped'),
  v.literal('receipts'),
  v.literal('authAudit'),
  v.literal('legalEvents'),
);

const AUTH_AUDIT_EVENTS = authAuditEventValidator.members.map(
  (member) => member.value,
);

const retentionTotalsValidator = v.object({
  ledgers: v.number(),
  feed: v.number(),
  notifications: v.number(),
  receipts: v.number(),
  authAudit: v.number(),
  legalEvents: v.number(),
  consentKept: v.number(),
  cappedRanges: v.number(),
});
type RetentionTotals = Infer<typeof retentionTotalsValidator>;

const EMPTY_RETENTION_TOTALS: RetentionTotals = {
  ledgers: 0,
  feed: 0,
  notifications: 0,
  receipts: 0,
  authAudit: 0,
  legalEvents: 0,
  consentKept: 0,
  cappedRanges: 0,
};

/**
 * Deletes `rows` in enforce and returns how many. dry_run deletes nothing,
 * counts at most one batch and flags a range that held more.
 */
const settle = async (
  ctx: MutationCtx,
  mode: Exclude<PurgeMode, 'off'>,
  rows: readonly {_id: Id<TableNames>}[],
  totals: RetentionTotals,
  key: 'feed' | 'notifications' | 'receipts' | 'authAudit' | 'legalEvents',
): Promise<number> => {
  if (mode === 'dry_run') {
    totals[key] += Math.min(rows.length, CASCADE_BATCH);
    if (rows.length > CASCADE_BATCH) totals.cappedRanges += 1;
    return 0;
  }
  for (const row of rows) await ctx.db.delete(row._id);
  totals[key] += rows.length;
  return rows.length;
};

/**
 * Nightly, one resumable chain: per ledger, FEED audit rows and notifications
 * past 180 days; then notifications with no ledger; expired receipts;
 * `authAudit` past 180 days; then consent records past 180 days except the
 * newest of each kind for a live account. AUDIT rows are outside every range
 * here: they live and die with their ledger (`retention-purge.md`, Q2).
 */
export const purgeRetention = internalMutation({
  args: {
    stage: v.optional(retentionStageValidator),
    cursor: v.optional(v.string()),
    totals: v.optional(retentionTotalsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const mode = retentionPurgeMode();
    if (mode === 'off') return null;
    const now = Date.now();
    const feedCutoff = now - AUDIT_FEED_RETENTION_MS;
    const notificationCutoff = now - NOTIFICATION_RETENTION_MS;
    const securityCutoff = now - SECURITY_RECORD_RETENTION_MS;
    const totals = {...(args.totals ?? EMPTY_RETENTION_TOTALS)};
    const stage = args.stage ?? 'ledgers';
    const next = async (
      nextStage: Infer<typeof retentionStageValidator>,
      cursor?: string,
    ): Promise<null> => {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.retention.purgeRetention,
        {stage: nextStage, cursor, totals},
      );
      return null;
    };
    // Every range below carries a numeric lower bound: Convex sorts
    // `undefined` below every number, so `lte(cutoff)` alone is not a bound.
    if (stage === 'ledgers') {
      const page = await ctx.db
        .query('ledgers')
        .withIndex('by_creation_time')
        .paginate({cursor: args.cursor ?? null, numItems: TRASH_LEDGER_PAGE});
      let budget = CASCADE_BATCH;
      const limit = (): number =>
        mode === 'enforce' ? budget : CASCADE_BATCH + 1;
      // Deleted, orphaned and locked ledgers too: no restore window applies.
      for (const ledger of page.page) {
        const feed = await ctx.db
          .query('ledgerAuditLog')
          .withIndex('by_ledgerId_retention_createdAt', (index) =>
            index
              .eq('ledgerId', ledger._id)
              .eq('retention', 'FEED')
              .gte('createdAt', 0)
              .lte('createdAt', feedCutoff),
          )
          .take(limit());
        budget -= await settle(ctx, mode, feed, totals, 'feed');
        if (budget > 0) {
          const notifications = await ctx.db
            .query('notifications')
            .withIndex('by_ledgerId_createdAt', (index) =>
              index
                .eq('ledgerId', ledger._id)
                .gte('createdAt', 0)
                .lte('createdAt', notificationCutoff),
            )
            .take(limit());
          budget -= await settle(
            ctx,
            mode,
            notifications,
            totals,
            'notifications',
          );
        }
        // Rerun this page: the ledger may hold more expired rows.
        if (budget === 0) return next('ledgers', args.cursor);
      }
      totals.ledgers += page.page.length;
      return page.isDone
        ? next('unscoped')
        : next('ledgers', page.continueCursor);
    }
    if (stage === 'authAudit') {
      let budget = CASCADE_BATCH;
      const start = Math.max(
        0,
        AUTH_AUDIT_EVENTS.findIndex((event) => event === args.cursor),
      );
      for (const event of AUTH_AUDIT_EVENTS.slice(start)) {
        const rows = await ctx.db
          .query('authAudit')
          .withIndex('by_event_createdAt', (index) =>
            index
              .eq('event', event)
              .gte('createdAt', 0)
              .lte('createdAt', securityCutoff),
          )
          .take(mode === 'enforce' ? budget : CASCADE_BATCH + 1);
        budget -= await settle(ctx, mode, rows, totals, 'authAudit');
        // Rerun this event: it may hold more.
        if (budget === 0) return next('authAudit', event);
      }
      return next('legalEvents');
    }
    if (stage === 'legalEvents') {
      // Kept rows stay in this range, so it pages with a cursor.
      const page = await ctx.db
        .query('legalEvents')
        .withIndex('by_createdAt', (index) =>
          index.gte('createdAt', 0).lte('createdAt', securityCutoff),
        )
        .paginate({cursor: args.cursor ?? null, numItems: LEGAL_EVENT_PAGE});
      const live = new Map<Id<'users'>, boolean>();
      const expired: Doc<'legalEvents'>[] = [];
      for (const event of page.page) {
        if (!live.has(event.userId)) {
          const profile = await ctx.db
            .query('userProfiles')
            .withIndex('by_userId', (index) => index.eq('userId', event.userId))
            .unique();
          live.set(
            event.userId,
            profile !== null && profile.purgedAt === undefined,
          );
        }
        if (live.get(event.userId) === true) {
          const newest = await ctx.db
            .query('legalEvents')
            .withIndex('by_userId_kind_createdAt', (index) =>
              index.eq('userId', event.userId).eq('kind', event.kind),
            )
            .order('desc')
            .first();
          // The consent a live account runs under is kept while it lives.
          if (newest?._id === event._id) {
            totals.consentKept += 1;
            continue;
          }
        }
        expired.push(event);
      }
      await settle(ctx, mode, expired, totals, 'legalEvents');
      if (!page.isDone) return next('legalEvents', page.continueCursor);
      console.log(
        JSON.stringify({
          event: 'retention_purge.done',
          mode,
          feedCutoff,
          notificationCutoff,
          securityCutoff,
          ...totals,
        }),
      );
      return null;
    }
    const limit = mode === 'enforce' ? CASCADE_BATCH : CASCADE_BATCH + 1;
    const deleted =
      stage === 'unscoped'
        ? await settle(
            ctx,
            mode,
            await ctx.db
              .query('notifications')
              .withIndex('by_ledgerId_createdAt', (index) =>
                index
                  .eq('ledgerId', undefined)
                  .gte('createdAt', 0)
                  .lte('createdAt', notificationCutoff),
              )
              .take(limit),
            totals,
            'notifications',
          )
        : await settle(
            ctx,
            mode,
            await ctx.db
              .query('clientMutationReceipts')
              .withIndex('by_expiresAt', (index) =>
                index.gte('expiresAt', 0).lte('expiresAt', now),
              )
              .take(limit),
            totals,
            'receipts',
          );
    if (deleted === CASCADE_BATCH) return next(stage);
    return next(stage === 'unscoped' ? 'receipts' : 'authAudit');
  },
});

type Referrer = 'referenced' | 'orphan' | 'undecided';

/**
 * Whether anything still names this blob. Anything short of proof that
 * nothing does is `undecided`, and an undecided upload is left alone.
 */
const uploadReferrer = async (
  ctx: MutationCtx,
  upload: Doc<'uploads'>,
): Promise<Referrer> => {
  if (upload.purpose === 'AVATAR') {
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (index) => index.eq('userId', upload.userId))
      .unique();
    return profile?.avatarStorageId === upload.storageId
      ? 'referenced'
      : 'orphan';
  }
  const original = await ctx.db
    .query('itemPhotos')
    .withIndex('by_storageId', (index) =>
      index.eq('storageId', upload.storageId),
    )
    .first();
  if (original !== null) return 'referenced';
  // A thumbnail has no index of its own; it sits on its entry's photo rows,
  // comment attachments included.
  const itemId = upload.itemId;
  if (itemId === undefined) return 'undecided';
  const photos = await ctx.db
    .query('itemPhotos')
    .withIndex('by_itemId_deletedAt_order', (index) =>
      index.eq('itemId', itemId),
    )
    .take(UPLOAD_REFERRER_SCAN_LIMIT + 1);
  if (photos.some((photo) => photo.thumbStorageId === upload.storageId))
    return 'referenced';
  return photos.length > UPLOAD_REFERRER_SCAN_LIMIT ? 'undecided' : 'orphan';
};

const uploadTotalsValidator = v.object({
  scanned: v.number(),
  young: v.number(),
  referenced: v.number(),
  undecided: v.number(),
  orphans: v.number(),
  orphanBytes: v.number(),
});
type UploadTotals = Infer<typeof uploadTotalsValidator>;

const EMPTY_UPLOAD_TOTALS: UploadTotals = {
  scanned: 0,
  young: 0,
  referenced: 0,
  undecided: 0,
  orphans: 0,
  orphanBytes: 0,
};

/**
 * Every six hours: claimed uploads never confirmed as referenced. A referenced
 * one is stamped `referencedCheckedAt` and leaves the unchecked set; an orphan
 * past UPLOAD_CLAIM_TTL_MS loses its blob, then its row.
 *
 * Blobs with no `uploads` row (migrated photos and avatars, export files) are
 * never read here, which is why there is no `_storage` pass
 * (`retention-purge.md`).
 */
export const sweepOrphanUploads = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    totals: v.optional(uploadTotalsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const mode = uploadSweepMode();
    if (mode === 'off') return null;
    const now = Date.now();
    const claimCutoff = now - UPLOAD_CLAIM_TTL_MS;
    const totals = {...(args.totals ?? EMPTY_UPLOAD_TOTALS)};
    // An equality on `undefined`, not a range: the exact unchecked set.
    const page = await ctx.db
      .query('uploads')
      .withIndex('by_referencedCheckedAt', (index) =>
        index.eq('referencedCheckedAt', undefined),
      )
      .paginate({cursor: args.cursor ?? null, numItems: UPLOAD_SWEEP_PAGE});
    for (const upload of page.page) {
      totals.scanned += 1;
      // Still inside the claim → attach window.
      if (upload.createdAt > claimCutoff) {
        totals.young += 1;
        continue;
      }
      const referrer = await uploadReferrer(ctx, upload);
      if (referrer === 'undecided') {
        totals.undecided += 1;
        continue;
      }
      if (referrer === 'referenced') {
        totals.referenced += 1;
        if (mode === 'enforce')
          await ctx.db.patch(upload._id, {referencedCheckedAt: now});
        continue;
      }
      totals.orphans += 1;
      totals.orphanBytes += upload.byteSize;
      if (mode === 'dry_run') continue;
      if ((await ctx.db.system.get('_storage', upload.storageId)) !== null)
        await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.retention.sweepOrphanUploads,
        {cursor: page.continueCursor, totals},
      );
      return null;
    }
    console.log(
      JSON.stringify({
        event: 'upload_sweep.done',
        mode,
        claimCutoff,
        ...totals,
      }),
    );
    return null;
  },
});
