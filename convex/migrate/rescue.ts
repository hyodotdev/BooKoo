import {v} from 'convex/values';

import type {Doc} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {migrationMutation} from '../lib/functions';
import {MEMBER_SCAN_LIMIT} from '../lib/constants';

const planRowValidator = v.object({
  legacyLedgerKey: v.string(),
  action: v.union(v.literal('TRANSFER'), v.literal('ARCHIVE')),
  successorLegacyUid: v.optional(v.string()),
});

const liveMembers = async (
  ctx: MutationCtx,
  ledger: Doc<'ledgers'>,
): Promise<Doc<'ledgerMembers'>[]> => {
  const members = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_deletedAt_role', (index) =>
      index.eq('ledgerId', ledger._id).eq('deletedAt', undefined),
    )
    .take(MEMBER_SCAN_LIMIT + 1);
  if (members.length > MEMBER_SCAN_LIMIT)
    throw new Error('member scan limit exceeded');
  return members;
};

const chooseSuccessor = (
  members: readonly Doc<'ledgerMembers'>[],
  ownerId: Doc<'ledgers'>['ownerId'],
): Doc<'ledgerMembers'> | undefined =>
  members
    .filter((member) => member.userId !== ownerId)
    .sort(
      (left, right) =>
        left.joinedAt - right.joinedAt ||
        (left.legacyUid ?? '').localeCompare(right.legacyUid ?? ''),
    )[0];

export const planOrphanLedgers = migrationMutation({
  args: {legacyUids: v.array(v.string())},
  returns: v.array(planRowValidator),
  handler: async (ctx, args) => {
    if (args.legacyUids.length > 50) throw new Error('owner batch too large');
    const plan: {
      legacyLedgerKey: string;
      action: 'TRANSFER' | 'ARCHIVE';
      successorLegacyUid?: string;
    }[] = [];
    for (const legacyUid of args.legacyUids) {
      const legacy = await ctx.db
        .query('legacyUsers')
        .withIndex('by_legacyUid', (index) => index.eq('legacyUid', legacyUid))
        .unique();
      if (
        legacy === null ||
        legacy.claimState !== 'orphan_no_email' ||
        legacy.placeholderUserId === undefined
      )
        continue;
      const placeholderUserId = legacy.placeholderUserId;
      const ledgers = await ctx.db
        .query('ledgers')
        .withIndex('by_ownerId_deletedAt', (index) =>
          index.eq('ownerId', placeholderUserId).eq('deletedAt', undefined),
        )
        .take(101);
      if (ledgers.length > 100) throw new Error('orphan ledger bound exceeded');
      for (const ledger of ledgers) {
        if (ledger.legacyKey === undefined || ledger.orphanedAt !== undefined)
          continue;
        const successor = chooseSuccessor(
          await liveMembers(ctx, ledger),
          ledger.ownerId,
        );
        plan.push({
          legacyLedgerKey: ledger.legacyKey,
          action: successor === undefined ? 'ARCHIVE' : 'TRANSFER',
          successorLegacyUid: successor?.legacyUid,
        });
      }
    }
    return plan;
  },
});

export const rescueOrphanLedgers = migrationMutation({
  args: {legacyLedgerKeys: v.array(v.string()), importedAt: v.number()},
  returns: v.object({
    transferred: v.number(),
    archived: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.legacyLedgerKeys.length > 50)
      throw new Error('ledger batch too large');
    let transferred = 0;
    let archived = 0;
    let skipped = 0;
    for (const legacyKey of args.legacyLedgerKeys) {
      const ledger = await ctx.db
        .query('ledgers')
        .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
        .unique();
      if (ledger === null || ledger.orphanedAt !== undefined) {
        skipped += 1;
        continue;
      }
      const ownerProfile = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', (index) => index.eq('userId', ledger.ownerId))
        .unique();
      const legacy =
        ownerProfile?.legacyUid === undefined
          ? null
          : await ctx.db
              .query('legacyUsers')
              .withIndex('by_legacyUid', (index) =>
                index.eq('legacyUid', ownerProfile.legacyUid!),
              )
              .unique();
      if (legacy?.claimState !== 'orphan_no_email') {
        skipped += 1;
        continue;
      }
      const members = await liveMembers(ctx, ledger);
      const successor = chooseSuccessor(members, ledger.ownerId);
      const now = args.importedAt;
      if (successor === undefined) {
        await ctx.db.patch(ledger._id, {
          orphanedAt: now,
          archivedAt: now,
          updatedAt: now,
        });
        await ctx.db.insert('ledgerAuditLog', {
          ledgerId: ledger._id,
          action: 'LEDGER_ARCHIVED',
          retention: 'AUDIT',
          createdAt: now,
        });
        await ctx.db.insert('migrationAnomalies', {
          kind: 'ORPHAN_SOLE_MEMBER_LEDGER',
          sourcePath: '',
          legacyKey,
          table: 'ledgers',
          producedRow: true,
          detailJson: JSON.stringify({resolution: 'ARCHIVED'}),
          createdAt: now,
        });
        archived += 1;
        continue;
      }
      const oldMembership = members.find(
        (member) => member.userId === ledger.ownerId,
      );
      if (oldMembership === undefined)
        throw new Error('owner membership missing');
      await ctx.db.patch(oldMembership._id, {role: 'MEMBER', updatedAt: now});
      await ctx.db.patch(successor._id, {role: 'OWNER', updatedAt: now});
      await ctx.db.patch(ledger._id, {
        ownerId: successor.userId,
        ownershipTransferredFromUserId: ledger.ownerId,
        ownershipTransferredAt: now,
        ownershipRescuedFromLegacyUid: legacy.legacyUid,
        updatedAt: now,
      });
      await ctx.db.insert('ledgerAuditLog', {
        ledgerId: ledger._id,
        action: 'MIGRATION_OWNERSHIP_RESCUED',
        retention: 'AUDIT',
        targetUserId: successor.userId,
        beforeRole: successor.role,
        afterRole: 'OWNER',
        createdAt: now,
      });
      await ctx.db.insert('notifications', {
        userId: successor.userId,
        kind: 'OWNERSHIP_TRANSFERRED',
        titleKey: 'notification.ownershipTransferred.title',
        bodyKey: 'notification.ownershipTransferred.body',
        params: {},
        fallbackTitle: 'Ownership transferred',
        fallbackBody: 'You are now the owner of a recovered ledger.',
        route: `/ledger/${ledger._id}`,
        ledgerId: ledger._id,
        createdAt: now,
        updatedAt: now,
      });
      transferred += 1;
    }
    return {transferred, archived, skipped};
  },
});
