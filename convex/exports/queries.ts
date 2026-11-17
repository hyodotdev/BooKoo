import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {
  DATA_EXPORT_FILE_PAGE_SIZE,
  DATA_EXPORT_HISTORY_PAGE_SIZE,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';
import {
  dataExportKindValidator,
  dataExportStateValidator,
} from '../schema/dataExports';

const rowValidator = v.object({
  id: v.id('dataExports'),
  kind: dataExportKindValidator,
  ledgerId: v.union(v.id('ledgers'), v.null()),
  state: dataExportStateValidator,
  phase: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  requestedAt: v.number(),
  readyAt: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  failedCode: v.union(v.string(), v.null()),
});

export const listMine = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > DATA_EXPORT_HISTORY_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('dataExports')
      .withIndex('by_requesterUserId_requestedAt', (index) =>
        index.eq('requesterUserId', profile.userId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        kind: row.kind,
        ledgerId: row.ledgerId ?? null,
        state: row.state,
        phase: row.phase,
        fileCount: row.fileCount,
        totalBytes: row.totalBytes,
        requestedAt: row.requestedAt,
        readyAt: row.readyAt ?? null,
        expiresAt: row.expiresAt ?? null,
        failedCode: row.failedCode ?? null,
      })),
    };
  },
});

export const files = query({
  args: {
    exportId: v.id('dataExports'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id('dataExportFiles'),
      fileName: v.string(),
      mediaType: v.string(),
      byteSize: v.number(),
      sha256: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    const dataExport = await ctx.db.get('dataExports', args.exportId);
    if (
      dataExport === null ||
      dataExport.requesterUserId !== profile.userId ||
      dataExport.state !== 'READY'
    )
      throw appError('NOT_FOUND', 'error.notFound');
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > DATA_EXPORT_FILE_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('dataExportFiles')
      .withIndex('by_exportId_order', (index) =>
        index.eq('exportId', dataExport._id),
      )
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        fileName: row.fileName,
        mediaType: row.mediaType,
        byteSize: row.byteSize,
        sha256: row.sha256,
        expiresAt: row.expiresAt,
      })),
    };
  },
});
