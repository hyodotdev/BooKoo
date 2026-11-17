import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from 'convex/server';
import {v} from 'convex/values';

import {query} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {
  LEDGER_PAGE_SIZE,
  LEDGER_SCAN_LIMIT,
  MEMBER_PAGE_SIZE,
  MEMBER_SCAN_LIMIT,
  UNSEEN_TARGET_LIMIT,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {
  ledgerIsReachable,
  requireLedgerMember,
} from '../lib/ledgerPermissions';
import {requireOnboarded} from '../lib/permissions';
import {
  ledgerRowValidator,
  publicMemberValidator,
  toLedgerRow,
  toPublicMember,
  type LedgerRow,
  type PublicMember,
} from '../lib/serializers';

/**
 * Legacy bounded contract kept for deployed clients. New clients must use
 * listMinePaginated so growing membership lists never load in bulk.
 */
export const listMine = query({
  args: {},
  returns: v.array(ledgerRowValidator),
  handler: async (ctx): Promise<LedgerRow[]> => {
    const profile = await requireOnboarded(ctx);
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(LEDGER_SCAN_LIMIT + 1);
    if (memberships.length > LEDGER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    const states = await ctx.db
      .query('ledgerMemberState')
      .withIndex('by_userId_ledgerId', (index) =>
        index.eq('userId', profile.userId),
      )
      .take(LEDGER_SCAN_LIMIT + 1);
    if (states.length > LEDGER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    const stateByLedger = new Map(
      states.map((state) => [state.ledgerId, state] as const),
    );
    const output: LedgerRow[] = [];
    for (const membership of memberships) {
      const ledger = await ctx.db.get('ledgers', membership.ledgerId);
      if (
        !ledgerIsReachable(ledger)
      )
        continue;
      output.push(
        toLedgerRow(ledger, membership, stateByLedger.get(ledger._id) ?? null),
      );
    }
    return output.sort((left, right) => {
      if (left.pinnedAt !== null || right.pinnedAt !== null)
        return (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0);
      if (left.sortOrder !== right.sortOrder)
        return left.sortOrder - right.sortOrder;
      return right.updatedAt - left.updatedAt;
    });
  },
});

export const listMinePaginated = query({
  args: {paginationOpts: paginationOptsValidator},
  returns: paginationResultValidator(ledgerRowValidator),
  handler: async (ctx, args): Promise<PaginationResult<LedgerRow>> => {
    const profile = await requireOnboarded(ctx);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > LEDGER_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: LEDGER_SCAN_LIMIT,
      });
    const page = await Promise.all(
      memberships.page.map(async (membership): Promise<LedgerRow | null> => {
        const [ledger, state] = await Promise.all([
          ctx.db.get('ledgers', membership.ledgerId),
          ctx.db
            .query('ledgerMemberState')
            .withIndex('by_ledgerId_userId', (index) =>
              index
                .eq('ledgerId', membership.ledgerId)
                .eq('userId', profile.userId),
            )
            .unique(),
        ]);
        if (
          !ledgerIsReachable(ledger)
        )
          return null;
        return toLedgerRow(ledger, membership, state);
      }),
    );
    const visiblePage: LedgerRow[] = [];
    for (const row of page) if (row !== null) visiblePage.push(row);
    return {...memberships, page: visiblePage};
  },
});

export const get = query({
  args: {ledgerId: v.id('ledgers')},
  returns: ledgerRowValidator,
  handler: async (ctx, args): Promise<LedgerRow> => {
    const context = await requireLedgerMember(ctx, args.ledgerId);
    const state = await ctx.db
      .query('ledgerMemberState')
      .withIndex('by_ledgerId_userId', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('userId', context.profile.userId),
      )
      .unique();
    return toLedgerRow(context.ledger, context.membership, state);
  },
});

/**
 * Legacy deep-link boundary kept for deployed clients.
 *
 * Expected invalid, missing, orphaned, and non-member outcomes resolve to null
 * so a stale link cannot flash a global error boundary or reveal whether an
 * inaccessible ledger exists.
 */
export const getByRoute = query({
  args: {ledgerId: v.string()},
  returns: v.union(v.null(), ledgerRowValidator),
  handler: async (ctx, args): Promise<LedgerRow | null> => {
    const profile = await requireOnboarded(ctx);
    const ledgerId = ctx.db.normalizeId('ledgers', args.ledgerId);
    if (ledgerId === null) return null;
    const [ledger, membership, state] = await Promise.all([
      ctx.db.get('ledgers', ledgerId),
      ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', ledgerId).eq('userId', profile.userId),
        )
        .unique(),
      ctx.db
        .query('ledgerMemberState')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', ledgerId).eq('userId', profile.userId),
        )
        .unique(),
    ]);
    if (
      !ledgerIsReachable(ledger) ||
      membership === null ||
      membership.deletedAt !== undefined
    )
      return null;
    return toLedgerRow(ledger, membership, state);
  },
});

/**
 * Persisted active-ledger ids may outlive a membership. Unlike a deep-link
 * boundary, the switcher must fall back quietly instead of surfacing a
 * permission error while the paginated membership list catches up.
 */
export const getMineByRoute = query({
  args: {ledgerId: v.string()},
  returns: v.union(v.null(), ledgerRowValidator),
  handler: async (ctx, args): Promise<LedgerRow | null> => {
    const profile = await requireOnboarded(ctx);
    const ledgerId = ctx.db.normalizeId('ledgers', args.ledgerId);
    if (ledgerId === null) return null;
    const [ledger, membership, state] = await Promise.all([
      ctx.db.get('ledgers', ledgerId),
      ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', ledgerId).eq('userId', profile.userId),
        )
        .unique(),
      ctx.db
        .query('ledgerMemberState')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', ledgerId).eq('userId', profile.userId),
        )
        .unique(),
    ]);
    if (
      !ledgerIsReachable(ledger) ||
      membership === null ||
      membership.deletedAt !== undefined
    )
      return null;
    return toLedgerRow(ledger, membership, state);
  },
});

/** Legacy bounded contract kept for deployed clients. */
export const roster = query({
  args: {ledgerId: v.id('ledgers')},
  returns: v.array(publicMemberValidator),
  handler: async (ctx, args): Promise<PublicMember[]> => {
    const context = await requireLedgerMember(ctx, args.ledgerId);
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
      )
      .take(MEMBER_SCAN_LIMIT + 1);
    if (memberships.length > MEMBER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');

    const output: PublicMember[] = [];
    for (const membership of memberships) {
      const [profile, blockedByViewer, viewerBlocked] = await Promise.all([
        ctx.db
          .query('userProfiles')
          .withIndex('by_userId', (index) =>
            index.eq('userId', membership.userId),
          )
          .unique(),
        ctx.db
          .query('userBlocks')
          .withIndex('by_blockerUserId_blockedUserId', (index) =>
            index
              .eq('blockerUserId', context.profile.userId)
              .eq('blockedUserId', membership.userId),
          )
          .unique(),
        ctx.db
          .query('userBlocks')
          .withIndex('by_blockerUserId_blockedUserId', (index) =>
            index
              .eq('blockerUserId', membership.userId)
              .eq('blockedUserId', context.profile.userId),
          )
          .unique(),
      ]);
      output.push(
        toPublicMember(
          profile?.purgedAt === undefined ? profile : null,
          membership,
          blockedByViewer !== null || viewerBlocked !== null,
        ),
      );
    }
    return output.sort((left, right) => left.joinedAt - right.joinedAt);
  },
});

export const rosterPaginated = query({
  args: {
    ledgerId: v.id('ledgers'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(publicMemberValidator),
  handler: async (ctx, args): Promise<PaginationResult<PublicMember>> => {
    const context = await requireLedgerMember(ctx, args.ledgerId);
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MEMBER_PAGE_SIZE
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
      )
      .paginate(args.paginationOpts);
    return {
      ...memberships,
      page: await Promise.all(
        memberships.page.map(async (membership): Promise<PublicMember> => {
          const [profile, blockedByViewer, viewerBlocked] = await Promise.all([
            ctx.db
              .query('userProfiles')
              .withIndex('by_userId', (index) =>
                index.eq('userId', membership.userId),
              )
              .unique(),
            ctx.db
              .query('userBlocks')
              .withIndex('by_blockerUserId_blockedUserId', (index) =>
                index
                  .eq('blockerUserId', context.profile.userId)
                  .eq('blockedUserId', membership.userId),
              )
              .unique(),
            ctx.db
              .query('userBlocks')
              .withIndex('by_blockerUserId_blockedUserId', (index) =>
                index
                  .eq('blockerUserId', membership.userId)
                  .eq('blockedUserId', context.profile.userId),
              )
              .unique(),
          ]);
          return toPublicMember(
            profile?.purgedAt === undefined ? profile : null,
            membership,
            blockedByViewer !== null || viewerBlocked !== null,
          );
        }),
      ),
    };
  },
});

const unseenResultValidator = v.object({
  ledgerId: v.id('ledgers'),
  hasUnseen: v.boolean(),
  latestItemAt: v.union(v.number(), v.null()),
});

export const unseen = query({
  args: {
    targets: v.array(
      v.object({ledgerId: v.id('ledgers'), lastReadAt: v.number()}),
    ),
  },
  returns: v.array(unseenResultValidator),
  handler: async (
    ctx,
    args,
  ): Promise<
    {ledgerId: Id<'ledgers'>; hasUnseen: boolean; latestItemAt: number | null}[]
  > => {
    const profile = await requireOnboarded(ctx);
    if (args.targets.length > UNSEEN_TARGET_LIMIT)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const seen = new Set<Id<'ledgers'>>();
    const output: {
      ledgerId: Id<'ledgers'>;
      hasUnseen: boolean;
      latestItemAt: number | null;
    }[] = [];
    for (const target of args.targets) {
      if (seen.has(target.ledgerId))
        throw appError('INVALID_INPUT', 'error.invalidInput');
      seen.add(target.ledgerId);
      const membership = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index.eq('ledgerId', target.ledgerId).eq('userId', profile.userId),
        )
        .unique();
      const ledger = await ctx.db.get('ledgers', target.ledgerId);
      if (
        membership === null ||
        membership.deletedAt !== undefined ||
        !ledgerIsReachable(ledger) ||
        ledger.archivedAt !== undefined
      )
        throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
      const latest = await ctx.db
        .query('ledgerItems')
        .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
          index.eq('ledgerId', target.ledgerId).eq('deletedAt', undefined),
        )
        .order('desc')
        .first();
      output.push({
        ledgerId: target.ledgerId,
        hasUnseen: latest !== null && latest.createdAt > target.lastReadAt,
        latestItemAt: latest?.createdAt ?? null,
      });
    }
    return output;
  },
});
