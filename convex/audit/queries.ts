import {paginationOptsValidator, paginationResultValidator} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import {AUDIT_PAGE_SIZE} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireLedgerRole} from '../lib/ledgerPermissions';
import {ledgerAuditActionValidator} from '../schema/ledgerAuditLog';

const rowValidator = v.object({
  id: v.id('ledgerAuditLog'),
  action: ledgerAuditActionValidator,
  actorUserId: v.union(v.id('users'), v.null()),
  targetUserId: v.union(v.id('users'), v.null()),
  targetItemId: v.union(v.id('ledgerItems'), v.null()),
  meta: v.union(v.record(v.string(), v.union(v.string(), v.number(), v.boolean())), v.null()),
  createdAt: v.number(),
});

export const list = query({
  args: {ledgerId: v.id('ledgers'), paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireLedgerRole(ctx, args.ledgerId, 'ADMIN', {allowArchived: true});
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > AUDIT_PAGE_SIZE)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const page = await ctx.db
      .query('ledgerAuditLog')
      .withIndex('by_ledgerId_createdAt', (index) => index.eq('ledgerId', args.ledgerId))
      .order('desc')
      .paginate(args.paginationOpts);
    return {...page, page: page.page.map((row) => ({
      id: row._id,
      action: row.action,
      actorUserId: row.actorUserId ?? null,
      targetUserId: row.targetUserId ?? null,
      targetItemId: row.targetItemId ?? null,
      meta: row.meta ?? null,
      createdAt: row.createdAt,
    }))};
  },
});
