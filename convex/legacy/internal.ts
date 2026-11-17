import {v} from 'convex/values';

import {internal} from '../_generated/api';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {internalMutation} from '../lib/functions';
import {normalizeEmail} from '../../shared/email';

const REPARENT_BATCH_SIZE = 100;

type ReparentStage =
  'members' | 'ledgers' | 'items' | 'comments' | 'requests' | 'feedback';

function roleRank(role: Doc<'ledgerMembers'>['role']): number {
  if (role === 'OWNER') return 4;
  if (role === 'ADMIN') return 3;
  if (role === 'MEMBER') return 2;
  return 1;
}

async function finishClaim(
  ctx: MutationCtx,
  legacy: Doc<'legacyUsers'>,
  userId: Id<'users'>,
): Promise<void> {
  await ctx.db.patch(legacy._id, {
    reparentCursor: undefined,
    reparentTable: undefined,
  });
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique();
  if (profile?.legacyClaimState === 'pending')
    await ctx.db.patch(profile._id, {
      legacyClaimState: 'claimed',
      updatedAt: Date.now(),
    });
}

async function scheduleNext(
  ctx: MutationCtx,
  args: {
    legacyUserId: Id<'legacyUsers'>;
    userId: Id<'users'>;
    stage: ReparentStage;
    ledgerIndex: number;
    cursor?: string;
  },
): Promise<void> {
  await ctx.db.patch(args.legacyUserId, {
    reparentTable: args.stage,
    reparentCursor: args.cursor,
  });
  await ctx.scheduler.runAfter(0, internal.legacy.internal.reparentBatch, args);
}

/**
 * Start a verified-email legacy claim without ever trusting an unverified
 * provider field. The read is capped at three because only 0/1/many matters.
 */
export async function maybeStartLegacyClaim(
  ctx: MutationCtx,
  userId: Id<'users'>,
  rawEmail: string | undefined,
  verifiedAt: number | undefined,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (email === undefined || verifiedAt === undefined) return false;
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique();
  if (
    profile === null ||
    profile.legacyClaimState === 'claimed' ||
    profile.legacyClaimState === 'skipped'
  )
    return false;

  const candidates = await ctx.db
    .query('legacyUsers')
    .withIndex('by_emailNormalized_claimState', (query) =>
      query.eq('emailNormalized', email).eq('claimState', 'unclaimed'),
    )
    .take(3);
  if (candidates.length === 0) return false;

  const now = Date.now();
  if (candidates.length === 1) {
    const candidate = candidates[0]!;
    await ctx.db.patch(candidate._id, {claimState: 'claiming'});
    await ctx.db.patch(profile._id, {
      legacyClaimState: 'pending',
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.legacy.internal.runClaim, {
      legacyUserId: candidate._id,
      userId,
    });
    return true;
  }

  for (const candidate of candidates)
    await ctx.db.patch(candidate._id, {claimState: 'ambiguous'});
  await ctx.db.patch(profile._id, {
    legacyClaimState: 'ambiguous',
    ...(profile.onboardingStep === 'done' ? {onboardingStep: 'legacy'} : {}),
    updatedAt: now,
  });
  await ctx.db.insert('authAudit', {
    userId,
    event: 'legacy_ambiguous',
    detail: {email, count: candidates.length},
    createdAt: now,
  });
  return true;
}

export const probeVerifiedEmail = internalMutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    verifiedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    maybeStartLegacyClaim(ctx, args.userId, args.email, args.verifiedAt),
});

export const runClaim = internalMutation({
  args: {legacyUserId: v.id('legacyUsers'), userId: v.id('users')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const legacy = await ctx.db.get('legacyUsers', args.legacyUserId);
    if (
      legacy === null ||
      (legacy.claimState !== 'unclaimed' &&
        legacy.claimState !== 'claiming' &&
        legacy.claimState !== 'ambiguous')
    )
      return null;
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (query) => query.eq('userId', args.userId))
      .unique();
    if (profile === null) return null;

    const now = Date.now();
    await ctx.db.patch(legacy._id, {
      claimState: 'claimed',
      claimedByUserId: args.userId,
      claimedAt: now,
      reparentTable: 'members',
      reparentCursor: undefined,
    });
    await ctx.db.patch(profile._id, {
      legacyUid: profile.legacyUid ?? legacy.legacyUid,
      legacyClaimState: 'pending',
      legacyClaimedAt: now,
      ...(profile.displayName === '' && legacy.displayName !== undefined
        ? {displayName: legacy.displayName}
        : {}),
      ...(profile.avatarUrl === undefined && legacy.photoURL !== undefined
        ? {avatarLegacyUrl: legacy.photoURL}
        : {}),
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: args.userId,
      event: 'legacy_claimed',
      detail: {legacyUid: legacy.legacyUid},
      createdAt: now,
    });
    await scheduleNext(ctx, {
      legacyUserId: legacy._id,
      userId: args.userId,
      stage: 'members',
      ledgerIndex: 0,
    });
    return null;
  },
});

export const reparentBatch = internalMutation({
  args: {
    legacyUserId: v.id('legacyUsers'),
    userId: v.id('users'),
    stage: v.union(
      v.literal('members'),
      v.literal('ledgers'),
      v.literal('items'),
      v.literal('comments'),
      v.literal('requests'),
      v.literal('feedback'),
    ),
    ledgerIndex: v.number(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const legacy = await ctx.db.get('legacyUsers', args.legacyUserId);
    if (legacy === null || legacy.claimedByUserId !== args.userId) return null;
    const placeholderUserId = legacy.placeholderUserId;
    if (placeholderUserId === undefined) {
      await finishClaim(ctx, legacy, args.userId);
      return null;
    }

    if (args.stage === 'members') {
      const page = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_legacyUid', (query) =>
          query.eq('legacyUid', legacy.legacyUid),
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: REPARENT_BATCH_SIZE,
        });
      for (const membership of page.page) {
        const existing = await ctx.db
          .query('ledgerMembers')
          .withIndex('by_ledgerId_userId', (query) =>
            query.eq('ledgerId', membership.ledgerId).eq('userId', args.userId),
          )
          .unique();
        if (existing === null)
          await ctx.db.patch(membership._id, {userId: args.userId});
        else {
          await ctx.db.patch(existing._id, {
            role:
              roleRank(membership.role) > roleRank(existing.role)
                ? membership.role
                : existing.role,
            joinedAt: Math.min(existing.joinedAt, membership.joinedAt),
            updatedAt: Date.now(),
          });
          await ctx.db.delete(membership._id);
        }
        const placeholderState = await ctx.db
          .query('ledgerMemberState')
          .withIndex('by_ledgerId_userId', (query) =>
            query
              .eq('ledgerId', membership.ledgerId)
              .eq('userId', placeholderUserId),
          )
          .unique();
        if (placeholderState !== null) {
          const realState = await ctx.db
            .query('ledgerMemberState')
            .withIndex('by_ledgerId_userId', (query) =>
              query
                .eq('ledgerId', membership.ledgerId)
                .eq('userId', args.userId),
            )
            .unique();
          if (realState === null)
            await ctx.db.patch(placeholderState._id, {userId: args.userId});
          else {
            await ctx.db.patch(realState._id, {
              lastReadAt: Math.max(
                realState.lastReadAt,
                placeholderState.lastReadAt,
              ),
              lastOpenedAt: Math.max(
                realState.lastOpenedAt,
                placeholderState.lastOpenedAt,
              ),
              updatedAt: Date.now(),
            });
            await ctx.db.delete(placeholderState._id);
          }
        }
      }
      if (!page.isDone)
        await scheduleNext(ctx, {
          ...args,
          cursor: page.continueCursor,
        });
      else
        await scheduleNext(ctx, {
          legacyUserId: legacy._id,
          userId: args.userId,
          stage: 'ledgers',
          ledgerIndex: 0,
        });
      return null;
    }

    if (args.stage === 'ledgers') {
      const page = await ctx.db
        .query('ledgers')
        .withIndex('by_ownerId_deletedAt', (query) =>
          query.eq('ownerId', placeholderUserId).eq('deletedAt', undefined),
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: REPARENT_BATCH_SIZE,
        });
      for (const ledger of page.page)
        await ctx.db.patch(ledger._id, {ownerId: args.userId});
      if (!page.isDone)
        await scheduleNext(ctx, {
          ...args,
          cursor: page.continueCursor,
        });
      else
        await scheduleNext(ctx, {
          legacyUserId: legacy._id,
          userId: args.userId,
          stage: 'items',
          ledgerIndex: 0,
        });
      return null;
    }

    if (args.stage === 'requests') {
      const page = await ctx.db
        .query('ledgerJoinRequests')
        .withIndex('by_userId_status', (query) =>
          query.eq('userId', placeholderUserId),
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: REPARENT_BATCH_SIZE,
        });
      for (const request of page.page)
        await ctx.db.patch(request._id, {userId: args.userId});
      if (!page.isDone)
        await scheduleNext(ctx, {...args, cursor: page.continueCursor});
      else
        await scheduleNext(ctx, {
          legacyUserId: legacy._id,
          userId: args.userId,
          stage: 'feedback',
          ledgerIndex: 0,
        });
      return null;
    }

    if (args.stage === 'feedback') {
      const page = await ctx.db
        .query('feedback')
        .withIndex('by_userId_createdAt', (query) =>
          query.eq('userId', placeholderUserId),
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: REPARENT_BATCH_SIZE,
        });
      for (const feedback of page.page)
        await ctx.db.patch(feedback._id, {userId: args.userId});
      if (!page.isDone)
        await scheduleNext(ctx, {...args, cursor: page.continueCursor});
      else await finishClaim(ctx, legacy, args.userId);
      return null;
    }

    const ledgerKey = legacy.authoredLedgerKeys[args.ledgerIndex];
    if (ledgerKey === undefined) {
      if (args.stage === 'items')
        await scheduleNext(ctx, {
          legacyUserId: legacy._id,
          userId: args.userId,
          stage: 'comments',
          ledgerIndex: 0,
        });
      else
        await scheduleNext(ctx, {
          legacyUserId: legacy._id,
          userId: args.userId,
          stage: 'requests',
          ledgerIndex: 0,
        });
      return null;
    }
    const ledger = await ctx.db
      .query('ledgers')
      .withIndex('by_legacyKey', (query) => query.eq('legacyKey', ledgerKey))
      .unique();
    if (ledger === null) {
      await scheduleNext(ctx, {
        ...args,
        ledgerIndex: args.ledgerIndex + 1,
        cursor: undefined,
      });
      return null;
    }

    const page =
      args.stage === 'items'
        ? await ctx.db
            .query('ledgerItems')
            .withIndex(
              'by_ledgerId_deletedAt_authorId_dayKey_occurredAt',
              (query) =>
                query
                  .eq('ledgerId', ledger._id)
                  .eq('deletedAt', undefined)
                  .eq('authorId', placeholderUserId),
            )
            .paginate({
              cursor: args.cursor ?? null,
              numItems: REPARENT_BATCH_SIZE,
            })
        : await ctx.db
            .query('itemComments')
            .withIndex('by_ledgerId_deletedAt_authorId_createdAt', (query) =>
              query
                .eq('ledgerId', ledger._id)
                .eq('deletedAt', undefined)
                .eq('authorId', placeholderUserId),
            )
            .paginate({
              cursor: args.cursor ?? null,
              numItems: REPARENT_BATCH_SIZE,
            });
    for (const row of page.page)
      await ctx.db.patch(row._id, {authorId: args.userId});
    await scheduleNext(ctx, {
      ...args,
      ledgerIndex: page.isDone ? args.ledgerIndex + 1 : args.ledgerIndex,
      cursor: page.isDone ? undefined : page.continueCursor,
    });
    return null;
  },
});
