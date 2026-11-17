import {v} from 'convex/values';

import {internal} from '../_generated/api';
import {internalMutation} from '../lib/functions';
import {
  DATA_EXPORT_CLEANUP_BATCH,
  DATA_EXPORT_FILE_MAX_BYTES,
  DATA_EXPORT_RETENTION_MS,
} from '../lib/constants';
import {
  requireExportCleanupSource,
  requireExportJob,
} from '../lib/exportPermissions';
import {scheduleInboxPush} from '../lib/notifications';

export const start = internalMutation({
  args: {
    exportId: v.id('dataExports'),
    jobId: v.id('maintenanceJobs'),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {dataExport, job} = await requireExportJob(ctx, args.exportId);
    if (job._id !== args.jobId || dataExport.state !== 'QUEUED') return null;
    const now = Date.now();
    await ctx.db.patch(dataExport._id, {
      state: 'RUNNING',
      phase: 'snapshot',
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      state: 'RUNNING',
      phase: 'snapshot',
      updatedAt: now,
    });
    return null;
  },
});

export const recordFile = internalMutation({
  args: {
    exportId: v.id('dataExports'),
    jobId: v.id('maintenanceJobs'),
    fileName: v.string(),
    mediaType: v.string(),
    storageId: v.id('_storage'),
    byteSize: v.number(),
    sha256: v.string(),
    phase: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {dataExport, job} = await requireExportJob(ctx, args.exportId);
    if (
      job._id !== args.jobId ||
      dataExport.state !== 'RUNNING' ||
      args.byteSize < 1 ||
      args.byteSize > DATA_EXPORT_FILE_MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(args.sha256) ||
      !/^[A-Za-z0-9._-]{1,180}$/.test(args.fileName)
    )
      throw new Error('Invalid export part');
    const now = Date.now();
    const expiresAt = now + DATA_EXPORT_RETENTION_MS;
    await ctx.db.insert('dataExportFiles', {
      exportId: dataExport._id,
      requesterUserId: dataExport.requesterUserId,
      order: dataExport.fileCount,
      fileName: args.fileName,
      mediaType: args.mediaType,
      storageId: args.storageId,
      byteSize: args.byteSize,
      sha256: args.sha256,
      expiresAt,
      createdAt: now,
    });
    await ctx.db.patch(dataExport._id, {
      phase: args.phase,
      fileCount: dataExport.fileCount + 1,
      totalBytes: dataExport.totalBytes + args.byteSize,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      phase: args.phase,
      processed: job.processed + 1,
      updatedAt: now,
    });
    return null;
  },
});

export const complete = internalMutation({
  args: {
    exportId: v.id('dataExports'),
    jobId: v.id('maintenanceJobs'),
    cursor: v.optional(v.string()),
    terminalAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {dataExport, job} = await requireExportJob(ctx, args.exportId);
    if (job._id !== args.jobId || dataExport.state !== 'RUNNING') return null;
    const terminalAt = args.terminalAt ?? Date.now();
    const expiresAt = terminalAt + DATA_EXPORT_RETENTION_MS;
    const files = await ctx.db
      .query('dataExportFiles')
      .withIndex('by_exportId_order', (index) =>
        index.eq('exportId', dataExport._id),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: DATA_EXPORT_CLEANUP_BATCH,
      });
    for (const file of files.page)
      await ctx.db.patch(file._id, {expiresAt});
    if (!files.isDone) {
      await ctx.db.patch(job._id, {
        phase: 'finalizing',
        cursor: files.continueCursor,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.exports.worker.complete, {
        exportId: dataExport._id,
        jobId: job._id,
        cursor: files.continueCursor,
        terminalAt,
      });
      return null;
    }
    await ctx.db.patch(dataExport._id, {
      state: 'READY',
      phase: 'ready',
      readyAt: terminalAt,
      expiresAt,
      updatedAt: terminalAt,
    });
    await ctx.db.patch(job._id, {
      state: 'DONE',
      phase: 'ready',
      cursor: undefined,
      finishedAt: terminalAt,
      updatedAt: terminalAt,
    });
    const notificationId = await ctx.db.insert('notifications', {
      userId: dataExport.requesterUserId,
      kind: 'SYSTEM',
      titleKey: 'notification.exportReady.title',
      bodyKey: 'notification.exportReady.body',
      params: {exportId: String(dataExport._id)},
      fallbackTitle: 'Export ready',
      fallbackBody: 'Your data export is ready to download.',
      route: '/settings/privacy',
      createdAt: terminalAt,
      updatedAt: terminalAt,
    });
    await scheduleInboxPush(ctx, notificationId);
    await ctx.scheduler.runAfter(
      Math.max(0, expiresAt - Date.now()),
      internal.exports.worker.cleanup,
      {exportId: dataExport._id},
    );
    return null;
  },
});

export const fail = internalMutation({
  args: {
    exportId: v.id('dataExports'),
    jobId: v.id('maintenanceJobs'),
    failedCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {dataExport, job} = await requireExportJob(ctx, args.exportId);
    if (
      job._id !== args.jobId ||
      dataExport.state === 'READY' ||
      dataExport.state === 'EXPIRED'
    )
      return null;
    const now = Date.now();
    const failedCode = /^[A-Z0-9_]{1,64}$/.test(args.failedCode)
      ? args.failedCode
      : 'EXPORT_FAILED';
    await ctx.db.patch(dataExport._id, {
      state: 'FAILED',
      phase: 'failed',
      failedCode,
      expiresAt: now + DATA_EXPORT_RETENTION_MS,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      state: 'FAILED',
      phase: 'failed',
      lastError: failedCode,
      finishedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      DATA_EXPORT_RETENTION_MS,
      internal.exports.worker.cleanup,
      {exportId: dataExport._id},
    );
    return null;
  },
});

export const cleanup = internalMutation({
  args: {exportId: v.id('dataExports')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const dataExport = await requireExportCleanupSource(
      ctx,
      args.exportId,
      now,
    );
    if (dataExport.state !== 'EXPIRED')
      await ctx.db.patch(dataExport._id, {
        state: 'EXPIRED',
        phase: 'deleting',
        updatedAt: now,
      });
    const files = await ctx.db
      .query('dataExportFiles')
      .withIndex('by_exportId_order', (index) =>
        index.eq('exportId', dataExport._id),
      )
      .take(DATA_EXPORT_CLEANUP_BATCH);
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }
    if (files.length === DATA_EXPORT_CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.exports.worker.cleanup, args);
      return null;
    }
    const job = await ctx.db
      .query('maintenanceJobs')
      .withIndex('by_jobKey', (index) =>
        index.eq(
          'jobKey',
          `${dataExport.kind === 'LEDGER' ? 'LEDGER_EXPORT' : 'USER_EXPORT'}:${dataExport._id}`,
        ),
      )
      .unique();
    if (job !== null) await ctx.db.delete(job._id);
    await ctx.db.delete(dataExport._id);
    return null;
  },
});
