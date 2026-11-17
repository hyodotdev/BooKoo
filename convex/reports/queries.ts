import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {REPORT_PAGE_SIZE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireAppAdmin, requireOnboarded} from '../lib/permissions';
import {
  reportReasonValidator,
  reportStatusValidator,
} from '../schema/moderation';

const subjectValidator = v.union(
  v.object({kind: v.literal('USER'), userId: v.id('users')}),
  v.object({kind: v.literal('LEDGER'), ledgerId: v.id('ledgers')}),
  v.object({kind: v.literal('ITEM'), itemId: v.id('ledgerItems')}),
  v.object({kind: v.literal('COMMENT'), commentId: v.id('itemComments')}),
);
const rowValidator = v.object({
  id: v.id('contentReports'),
  subject: subjectValidator,
  contextLedgerId: v.union(v.id('ledgers'), v.null()),
  reason: reportReasonValidator,
  note: v.union(v.string(), v.null()),
  status: reportStatusValidator,
  createdAt: v.number(),
});

export const open = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireAppAdmin(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPORT_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('contentReports')
      .withIndex('by_status_createdAt', (index) => index.eq('status', 'OPEN'))
      .order('asc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        subject: row.subject,
        contextLedgerId: row.contextLedgerId ?? null,
        reason: row.reason,
        note: row.note ?? null,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  },
});

export const reviewing = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireAppAdmin(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPORT_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('contentReports')
      .withIndex('by_status_createdAt', (index) =>
        index.eq('status', 'REVIEWING'),
      )
      .order('asc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        subject: row.subject,
        contextLedgerId: row.contextLedgerId ?? null,
        reason: row.reason,
        note: row.note ?? null,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  },
});

const mineRowValidator = v.object({
  id: v.id('contentReports'),
  reason: reportReasonValidator,
  status: reportStatusValidator,
  createdAt: v.number(),
});

/** Legacy bounded contract kept for deployed clients. */
export const mine = query({
  args: {},
  returns: v.array(mineRowValidator),
  handler: async (ctx) => {
    const profile = await requireOnboarded(ctx);
    const rows = await ctx.db
      .query('contentReports')
      .withIndex('by_reporterUserId_createdAt', (index) =>
        index.eq('reporterUserId', profile.userId),
      )
      .order('desc')
      .take(REPORT_PAGE_SIZE);
    return rows.map((row) => ({
      id: row._id,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
    }));
  },
});

export const minePaginated = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(mineRowValidator),
  handler: async (ctx, args) => {
    const profile = await requireOnboarded(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPORT_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const rows = await ctx.db
      .query('contentReports')
      .withIndex('by_reporterUserId_createdAt', (index) =>
        index.eq('reporterUserId', profile.userId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...rows,
      page: rows.page.map((row) => ({
        id: row._id,
        reason: row.reason,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  },
});
