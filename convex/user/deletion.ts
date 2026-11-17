import {v} from 'convex/values';

import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {internalMutation} from '../lib/functions';
import {
  getDueDeletingProfile,
  requireDeletingProfile,
} from '../lib/deletionPermissions';
import {
  ACTIVE_INVITES_PER_LEDGER,
  DATA_EXPORT_CLEANUP_BATCH,
  MEMBER_SCAN_LIMIT,
} from '../lib/constants';
import {scheduleInboxPush} from '../lib/notifications';

const DELETE_BATCH = 40;

const purgePhaseValidator = v.union(
  v.literal('EXPORTS'),
  v.literal('AUTH_SESSIONS'),
  v.literal('AUTH_ACCOUNTS'),
  v.literal('APPLE_TOKENS'),
  v.literal('PUSH_TOKENS'),
  v.literal('EMAIL_CODES'),
  v.literal('EMAILS'),
  v.literal('RECEIPTS'),
  v.literal('NOTIFICATIONS'),
  v.literal('BLOCKS_OUT'),
  v.literal('BLOCKS_IN'),
  v.literal('COMMENTS'),
  v.literal('PHOTOS'),
  v.literal('SUBSCRIPTION_EVENTS'),
  v.literal('SUBSCRIPTION_PURCHASES'),
  v.literal('SUBSCRIBERS'),
  v.literal('FINALIZE'),
);

type PurgePhase =
  | 'EXPORTS'
  | 'AUTH_SESSIONS'
  | 'AUTH_ACCOUNTS'
  | 'APPLE_TOKENS'
  | 'PUSH_TOKENS'
  | 'EMAIL_CODES'
  | 'EMAILS'
  | 'RECEIPTS'
  | 'NOTIFICATIONS'
  | 'BLOCKS_OUT'
  | 'BLOCKS_IN'
  | 'COMMENTS'
  | 'PHOTOS'
  | 'SUBSCRIPTION_EVENTS'
  | 'SUBSCRIPTION_PURCHASES'
  | 'SUBSCRIBERS'
  | 'FINALIZE';

const nextPhase: Record<PurgePhase, PurgePhase | null> = {
  EXPORTS: 'AUTH_SESSIONS',
  AUTH_SESSIONS: 'AUTH_ACCOUNTS',
  AUTH_ACCOUNTS: 'APPLE_TOKENS',
  APPLE_TOKENS: 'PUSH_TOKENS',
  PUSH_TOKENS: 'EMAIL_CODES',
  EMAIL_CODES: 'EMAILS',
  EMAILS: 'RECEIPTS',
  RECEIPTS: 'NOTIFICATIONS',
  NOTIFICATIONS: 'BLOCKS_OUT',
  BLOCKS_OUT: 'BLOCKS_IN',
  BLOCKS_IN: 'COMMENTS',
  COMMENTS: 'PHOTOS',
  PHOTOS: 'SUBSCRIPTION_EVENTS',
  SUBSCRIPTION_EVENTS: 'SUBSCRIPTION_PURCHASES',
  SUBSCRIPTION_PURCHASES: 'SUBSCRIBERS',
  SUBSCRIBERS: 'FINALIZE',
  FINALIZE: null,
};

const schedulePurge = async (
  ctx: MutationCtx,
  input: {
    readonly userId: Id<'users'>;
    readonly phase: PurgePhase;
    readonly ledgerCursor?: string;
    readonly rowCursor?: string;
  },
): Promise<void> => {
  await ctx.scheduler.runAfter(0, internal.user.deletion.purgeUser, input);
};

export const handOffLedgers = internalMutation({
  args: {
    userId: v.id('users'),
    phase: v.optional(v.union(v.literal('OWNED'), v.literal('MEMBERS'))),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireDeletingProfile(ctx, args.userId);
    const phase = args.phase ?? 'OWNED';
    if (phase === 'OWNED') {
      const page = await ctx.db
        .query('ledgers')
        .withIndex('by_ownerId_deletedAt', (index) =>
          index.eq('ownerId', args.userId).eq('deletedAt', undefined),
        )
        .paginate({cursor: args.cursor ?? null, numItems: 25});
      const now = Date.now();
      for (const ledger of page.page) {
        const members = await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_deletedAt_role', (index) =>
            index.eq('ledgerId', ledger._id).eq('deletedAt', undefined),
          )
          .take(MEMBER_SCAN_LIMIT + 1);
        if (members.length > MEMBER_SCAN_LIMIT)
          throw new Error('Ledger handoff recipient overflow');
        const remaining = members
          .flatMap((member) => (member.userId === args.userId ? [] : [member]))
          .sort(
            (left, right) =>
              left.joinedAt - right.joinedAt ||
              String(left._id).localeCompare(String(right._id)),
          );
        const successor = remaining[0];
        if (successor === undefined) {
          // Nobody is left to hand this ledger to. Its live invites are bearer
          // tokens for a ledger that no longer has a member to answer for
          // it, so they die with the account instead of waiting for a stranger
          // to tap one. Bounded by the cap `invites.create` already enforces.
          const invites = await ctx.db
            .query('ledgerInvites')
            .withIndex('by_ledgerId_revokedAt_createdAt', (index) =>
              index.eq('ledgerId', ledger._id).eq('revokedAt', undefined),
            )
            .take(ACTIVE_INVITES_PER_LEDGER + 1);
          for (const invite of invites)
            await ctx.db.patch(invite._id, {
              revokedAt: now,
              revokedByUserId: args.userId,
              updatedAt: now,
            });
          await ctx.db.patch(ledger._id, {orphanedAt: now, updatedAt: now});
          continue;
        }
        const deletingMember = members.find(
          (member) => member.userId === args.userId,
        );
        await ctx.db.patch(successor._id, {role: 'OWNER', updatedAt: now});
        if (deletingMember !== undefined)
          await ctx.db.patch(deletingMember._id, {
            role: 'MEMBER',
            updatedAt: now,
          });
        await ctx.db.patch(ledger._id, {
          ownerId: successor.userId,
          ownershipTransferredFromUserId: args.userId,
          ownershipTransferredAt: now,
          updatedAt: now,
        });
        await ctx.db.insert('authAudit', {
          userId: args.userId,
          event: 'ledger_ownership_transferred',
          detail: {
            ledgerId: String(ledger._id),
            to: String(successor.userId),
          },
          createdAt: now,
        });
        await ctx.db.insert('ledgerAuditLog', {
          ledgerId: ledger._id,
          action: 'OWNERSHIP_TRANSFERRED',
          retention: 'AUDIT',
          actorUserId: args.userId,
          targetUserId: successor.userId,
          beforeRole: successor.role,
          afterRole: 'OWNER',
          createdAt: now,
        });
        const notificationId = await ctx.db.insert('notifications', {
          userId: successor.userId,
          kind: 'OWNERSHIP_TRANSFERRED',
          titleKey: 'notification.ownershipTransferred.title',
          bodyKey: 'notification.ownershipTransferred.body',
          params: {},
          fallbackTitle: 'Ownership transferred',
          fallbackBody: 'You are now the owner of a shared ledger.',
          route: `/ledger/${ledger._id}`,
          ledgerId: ledger._id,
          actorUserId: profile.userId,
          createdAt: now,
          updatedAt: now,
        });
        await scheduleInboxPush(ctx, notificationId);
      }
      if (!page.isDone)
        await ctx.scheduler.runAfter(0, internal.user.deletion.handOffLedgers, {
          userId: args.userId,
          phase: 'OWNED',
          cursor: page.continueCursor,
        });
      else
        await ctx.scheduler.runAfter(0, internal.user.deletion.handOffLedgers, {
          userId: args.userId,
          phase: 'MEMBERS',
        });
      return null;
    }
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', args.userId).eq('deletedAt', undefined),
      )
      .take(25);
    const now = Date.now();
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        deletedAt: now,
        endReason: 'LEFT',
        updatedAt: now,
      });
      const ledger = await ctx.db.get('ledgers', membership.ledgerId);
      if (ledger !== null && ledger.deletedAt === undefined) {
        await ctx.db.patch(ledger._id, {
          memberCount: Math.max(
            ledger.orphanedAt === undefined ? 1 : 0,
            ledger.memberCount - 1,
          ),
          updatedAt: now,
        });
        await ctx.db.insert('ledgerAuditLog', {
          ledgerId: ledger._id,
          action: 'MEMBER_LEFT',
          retention: 'AUDIT',
          actorUserId: args.userId,
          targetUserId: args.userId,
          createdAt: now,
        });
      }
    }
    if (memberships.length === 25)
      await ctx.scheduler.runAfter(0, internal.user.deletion.handOffLedgers, {
        userId: args.userId,
        phase: 'MEMBERS',
      });
    return null;
  },
});

export const purgeUser = internalMutation({
  args: {
    userId: v.id('users'),
    phase: v.optional(purgePhaseValidator),
    ledgerCursor: v.optional(v.string()),
    rowCursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await getDueDeletingProfile(ctx, args.userId, Date.now());
    if (profile === null) return null;
    const now = Date.now();
    const phase: PurgePhase = args.phase ?? 'EXPORTS';
    const advance = async (): Promise<null> => {
      const next = nextPhase[phase];
      if (next !== null)
        await schedulePurge(ctx, {userId: args.userId, phase: next});
      return null;
    };

    if (phase === 'EXPORTS') {
      const rows = await ctx.db
        .query('dataExports')
        .withIndex('by_requesterUserId_requestedAt', (index) =>
          index.eq('requesterUserId', args.userId),
        )
        .take(DATA_EXPORT_CLEANUP_BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          state: 'EXPIRED',
          phase: 'deleting',
          expiresAt: now,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.exports.worker.cleanup, {
          exportId: row._id,
        });
      }
      if (rows.length === DATA_EXPORT_CLEANUP_BATCH)
        await schedulePurge(ctx, {userId: args.userId, phase});
      else await advance();
      return null;
    }
    if (phase === 'AUTH_SESSIONS') {
      const session = await ctx.db
        .query('authSessions')
        .withIndex('userId', (index) => index.eq('userId', args.userId))
        .first();
      if (session === null) return advance();
      const tokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (index) => index.eq('sessionId', session._id))
        .take(DELETE_BATCH);
      for (const token of tokens) await ctx.db.delete(token._id);
      if (tokens.length < DELETE_BATCH) await ctx.db.delete(session._id);
      await schedulePurge(ctx, {userId: args.userId, phase});
      return null;
    }
    if (phase === 'AUTH_ACCOUNTS') {
      const rows = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (index) =>
          index.eq('userId', args.userId),
        )
        .take(DELETE_BATCH);
      for (const row of rows) await ctx.db.delete('authAccounts', row._id);
      if (rows.length === DELETE_BATCH)
        await schedulePurge(ctx, {userId: args.userId, phase});
      else await advance();
      return null;
    }
    const deleteIndexed = async (
      table:
        | 'appleRefreshTokens'
        | 'pushTokens'
        | 'emailLinkCodes'
        | 'userEmails'
        | 'clientMutationReceipts'
        | 'notifications'
        | 'userBlocks'
        | 'subscribers'
        | 'subscriptionPurchases'
        | 'subscriptionEvents',
      rows: readonly {_id: Id<typeof table>}[],
    ): Promise<null> => {
      for (const row of rows) await ctx.db.delete(table, row._id);
      if (rows.length === DELETE_BATCH)
        await schedulePurge(ctx, {userId: args.userId, phase});
      else await advance();
      return null;
    };
    if (phase === 'APPLE_TOKENS')
      return deleteIndexed(
        'appleRefreshTokens',
        await ctx.db
          .query('appleRefreshTokens')
          .withIndex('by_userId_clientId', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'PUSH_TOKENS')
      return deleteIndexed(
        'pushTokens',
        await ctx.db
          .query('pushTokens')
          .withIndex('by_userId_disabledAt', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'EMAIL_CODES')
      return deleteIndexed(
        'emailLinkCodes',
        await ctx.db
          .query('emailLinkCodes')
          .withIndex('by_userId', (index) => index.eq('userId', args.userId))
          .take(DELETE_BATCH),
      );
    if (phase === 'EMAILS')
      return deleteIndexed(
        'userEmails',
        await ctx.db
          .query('userEmails')
          .withIndex('by_userId_deletedAt', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'RECEIPTS')
      return deleteIndexed(
        'clientMutationReceipts',
        await ctx.db
          .query('clientMutationReceipts')
          .withIndex('by_userId_clientRequestId', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'NOTIFICATIONS')
      return deleteIndexed(
        'notifications',
        await ctx.db
          .query('notifications')
          .withIndex('by_userId_deletedAt_createdAt', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'BLOCKS_OUT')
      return deleteIndexed(
        'userBlocks',
        await ctx.db
          .query('userBlocks')
          .withIndex('by_blockerUserId_createdAt', (index) =>
            index.eq('blockerUserId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'BLOCKS_IN')
      return deleteIndexed(
        'userBlocks',
        await ctx.db
          .query('userBlocks')
          .withIndex('by_blockedUserId', (index) =>
            index.eq('blockedUserId', args.userId),
          )
          .take(DELETE_BATCH),
      );

    /**
     * Subscription rows are personal data: `subscribers.appUserId` IS the user
     * id, and `subscriptionEvents` records their purchase history. The privacy
     * notice promises erasure after the recovery period.
     *
     * Two phases, one table each, because `deleteIndexed` advances the moment
     * it deletes a partial batch — a single phase covering both tables silently
     * skipped the second for any user with a non-multiple-of-DELETE_BATCH event
     * count.
     *
     * They hold no card details and no payload, only a digest, and the store
     * keeps the authoritative billing record, so no statutory record is lost.
     */
    if (phase === 'SUBSCRIPTION_EVENTS')
      return deleteIndexed(
        'subscriptionEvents',
        await ctx.db
          .query('subscriptionEvents')
          .withIndex('by_userId_receivedAt', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'SUBSCRIBERS')
      return deleteIndexed(
        'subscribers',
        await ctx.db
          .query('subscribers')
          .withIndex('by_userId', (index) => index.eq('userId', args.userId))
          .take(DELETE_BATCH),
      );
    if (phase === 'SUBSCRIPTION_PURCHASES')
      return deleteIndexed(
        'subscriptionPurchases',
        await ctx.db
          .query('subscriptionPurchases')
          .withIndex('by_userId_createdAt', (index) =>
            index.eq('userId', args.userId),
          )
          .take(DELETE_BATCH),
      );
    if (phase === 'COMMENTS' || phase === 'PHOTOS') {
      const membershipPage = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_userId_deletedAt', (index) =>
          index.eq('userId', args.userId),
        )
        .paginate({cursor: args.ledgerCursor ?? null, numItems: 1});
      const membership = membershipPage.page[0];
      if (membership === undefined) return advance();
      if (phase === 'COMMENTS') {
        const page = await ctx.db
          .query('itemComments')
          .withIndex('by_ledgerId_deletedAt_authorId_createdAt', (index) =>
            index.eq('ledgerId', membership.ledgerId),
          )
          .paginate({cursor: args.rowCursor ?? null, numItems: DELETE_BATCH});
        for (const comment of page.page) {
          if (comment.authorId !== args.userId) continue;
          if (comment.deletedAt === undefined) {
            const item = await ctx.db.get('ledgerItems', comment.itemId);
            if (item !== null)
              await ctx.db.patch(item._id, {
                commentCount: Math.max(0, item.commentCount - 1),
                updatedAt: Math.max(now, item.updatedAt + 1),
              });
          }
          await ctx.db.delete(comment._id);
        }
        if (!page.isDone)
          await schedulePurge(ctx, {
            userId: args.userId,
            phase,
            ledgerCursor: args.ledgerCursor,
            rowCursor: page.continueCursor,
          });
        else
          await schedulePurge(ctx, {
            userId: args.userId,
            phase,
            ledgerCursor: membershipPage.continueCursor,
          });
        return null;
      }
      const page = await ctx.db
        .query('itemPhotos')
        .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
          index.eq('ledgerId', membership.ledgerId),
        )
        .paginate({cursor: args.rowCursor ?? null, numItems: DELETE_BATCH});
      for (const photo of page.page) {
        if (photo.uploadedByUserId !== args.userId) continue;
        if (photo.storageId !== undefined)
          await ctx.storage.delete(photo.storageId);
        if (photo.thumbStorageId !== undefined)
          await ctx.storage.delete(photo.thumbStorageId);
        if (photo.deletedAt === undefined) {
          const item = await ctx.db.get('ledgerItems', photo.itemId);
          if (item !== null)
            await ctx.db.patch(item._id, {
              photoCount: Math.max(0, item.photoCount - 1),
              ...(item.coverPhotoId === photo._id
                ? {coverPhotoId: undefined}
                : {}),
              updatedAt: Math.max(now, item.updatedAt + 1),
            });
        }
        await ctx.db.delete(photo._id);
      }
      if (!page.isDone)
        await schedulePurge(ctx, {
          userId: args.userId,
          phase,
          ledgerCursor: args.ledgerCursor,
          rowCursor: page.continueCursor,
        });
      else
        await schedulePurge(ctx, {
          userId: args.userId,
          phase,
          ledgerCursor: membershipPage.continueCursor,
        });
      return null;
    }

    // The recovery window has ended; anonymize the provider binding as part of
    // the same server-owned purge, without cancelling the store subscription.
    await ctx.scheduler.runAfter(0, internal.subscriptions.erasure.eraseUser, {
      userId: args.userId,
    });
    if (profile.avatarStorageId !== undefined)
      await ctx.storage.delete(profile.avatarStorageId);
    const presence = await ctx.db
      .query('userPresence')
      .withIndex('by_userId', (index) => index.eq('userId', args.userId))
      .unique();
    if (presence !== null) await ctx.db.delete(presence._id);
    const user = await ctx.db.get('users', args.userId);
    if (user !== null)
      await ctx.db.patch(user._id, {
        name: undefined,
        image: undefined,
        email: undefined,
        emailVerificationTime: undefined,
      });
    await ctx.db.patch(profile._id, {
      emailNormalized: undefined,
      handle: undefined,
      handleKey: undefined,
      displayName: '',
      bio: '',
      phone: '',
      avatarStorageId: undefined,
      avatarUrl: undefined,
      avatarThumbUrl: undefined,
      avatarLegacyUrl: undefined,
      avatarLegacySourcePath: undefined,
      legacyUid: undefined,
      legacyRaw: undefined,
      deletionReason: undefined,
      purgeAfter: undefined,
      purgedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: args.userId,
      event: 'deletion_purged',
      createdAt: now,
    });
    return null;
  },
});

export const purgeExpiredAccounts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    const due = await ctx.db
      .query('userProfiles')
      .withIndex('by_purgeAfter', (index) => index.lt('purgeAfter', now))
      .take(20);
    for (const profile of due)
      await ctx.scheduler.runAfter(0, internal.user.deletion.purgeUser, {
        userId: profile.userId,
        phase: 'EXPORTS',
      });
    return null;
  },
});
