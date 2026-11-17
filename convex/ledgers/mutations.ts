import {v} from 'convex/values';

import {isLedgerIconName} from '../../shared/ledgerIcons';
import {
  isValidLedgerTitle,
  isValidPeriodStartDay,
  isValidWeekStartsOn,
  normalizeNewCurrency,
} from '../../shared/ledgerCore';
import {isValidTimeZone} from '../../shared/date';
import {internal} from '../_generated/api';
import {mutation} from '../lib/functions';
import type {Id} from '../_generated/dataModel';
import {
  CURRENT_ROLLUP_VERSION,
  LEDGER_PURGE_GRACE_MS,
  MEMBER_SCAN_LIMIT,
} from '../lib/constants';
import {appError} from '../lib/errors';
import {notifyLedgerMembers} from '../lib/notifications';
import {
  FREE_SHARED_LEDGER_LIMIT,
  requireUserEntitlement,
} from '../lib/entitlements';
import {
  requireDeletedLedgerOwner,
  requireLedgerRole,
} from '../lib/ledgerPermissions';
import {requireActiveProfile} from '../lib/permissions';
import {
  invitePolicyValidator,
  itemWritePolicyValidator,
  ledgerColorValidator,
} from '../schema/ledgers';

const ledgerIdResultValidator = v.object({ledgerId: v.id('ledgers')});

const validateTitle = (value: string): string => {
  const title = value.trim();
  if (!isValidLedgerTitle(title))
    throw appError('INVALID_INPUT', 'error.invalidInput');
  return title;
};

const normalizeLedgerIcon = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  if (!isLedgerIconName(value))
    throw appError('INVALID_INPUT', 'error.invalidInput');
  return value;
};

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    colorKey: ledgerColorValidator,
    iconKey: v.optional(v.string()),
    baseCurrency: v.string(),
  },
  returns: ledgerIdResultValidator,
  handler: async (ctx, args): Promise<{ledgerId: Id<'ledgers'>}> => {
    const profile = await requireActiveProfile(ctx);
    if (profile.handleKey === undefined)
      throw appError('HANDLE_REQUIRED', 'error.handle.required');
    // Bounded: O(1) — only the first owned ledger decides the Free gate.
    // `.notes/research/13-convex-scale.md` §11.2.
    const ownedLedgers = await ctx.db
      .query('ledgers')
      .withIndex('by_ownerId_deletedAt', (index) =>
        index.eq('ownerId', profile.userId).eq('deletedAt', undefined),
      )
      .take(FREE_SHARED_LEDGER_LIMIT);
    if (ownedLedgers.length >= FREE_SHARED_LEDGER_LIMIT)
      await requireUserEntitlement(
        ctx,
        profile.userId,
        'SECOND_SHARED_LEDGER',
      );
    const currency = normalizeNewCurrency(args.baseCurrency);
    if (currency === null)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const title = validateTitle(args.title);
    const iconKey = normalizeLedgerIcon(args.iconKey);
    const now = Date.now();
    const ledgerId = await ctx.db.insert('ledgers', {
      title,
      description: args.description.trim(),
      colorKey: args.colorKey,
      ...(iconKey === undefined ? {} : {iconKey}),
      ownerId: profile.userId,
      baseCurrency: currency,
      currencyIsAssumed: false,
      timeZone: profile.preferredTimeZone,
      timeZoneIsAssumed: false,
      weekStartsOn: profile.preferredWeekStartsOn,
      periodStartDay: 1,
      itemWritePolicy: 'ANY_MEMBER',
      invitePolicy: 'ANY_MEMBER',
      memberCount: 1,
      maintenanceLock: 'NONE',
      rollupVersion: CURRENT_ROLLUP_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert('ledgerMembers', {
      ledgerId,
      userId: profile.userId,
      role: 'OWNER',
      joinedAt: now,
      joinedVia: 'CREATED',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerMemberState', {
      ledgerId,
      userId: profile.userId,
      lastReadAt: now,
      lastOpenedAt: now,
      muted: false,
      notifyNewItem: true,
      notifyComment: true,
      sortOrder: 0,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId,
      action: 'LEDGER_CREATED',
      retention: 'AUDIT',
      actorUserId: profile.userId,
      createdAt: now,
    });
    const owner = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index
          .eq('ledgerId', ledgerId)
          .eq('deletedAt', undefined)
          .eq('role', 'OWNER'),
      )
      .unique();
    if (owner?._id !== membershipId || owner.userId !== profile.userId)
      throw new Error('Ledger owner invariant failed');
    return {ledgerId};
  },
});

export const update = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    colorKey: v.optional(ledgerColorValidator),
    iconKey: v.optional(v.string()),
    itemWritePolicy: v.optional(itemWritePolicyValidator),
    invitePolicy: v.optional(invitePolicyValidator),
    baseCurrency: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const patch: {
      title?: string;
      description?: string;
      colorKey?: typeof context.ledger.colorKey;
      iconKey?: string;
      itemWritePolicy?: typeof context.ledger.itemWritePolicy;
      invitePolicy?: typeof context.ledger.invitePolicy;
      baseCurrency?: string;
      updatedAt?: number;
    } = {};
    const changed: string[] = [];
    if (args.title !== undefined) {
      patch.title = validateTitle(args.title);
      if (patch.title !== context.ledger.title) changed.push('title');
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim();
      if (patch.description !== context.ledger.description)
        changed.push('description');
    }
    if (args.colorKey !== undefined) {
      patch.colorKey = args.colorKey;
      if (args.colorKey !== context.ledger.colorKey) changed.push('colorKey');
    }
    if (args.iconKey !== undefined) {
      const iconKey = normalizeLedgerIcon(args.iconKey);
      if (iconKey === undefined)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      patch.iconKey = iconKey;
      if (iconKey !== context.ledger.iconKey) changed.push('iconKey');
    }
    if (args.itemWritePolicy !== undefined) {
      patch.itemWritePolicy = args.itemWritePolicy;
      if (args.itemWritePolicy !== context.ledger.itemWritePolicy)
        changed.push('itemWritePolicy');
    }
    if (args.invitePolicy !== undefined) {
      patch.invitePolicy = args.invitePolicy;
      if (args.invitePolicy !== context.ledger.invitePolicy)
        changed.push('invitePolicy');
    }
    if (args.baseCurrency !== undefined) {
      if (context.role !== 'OWNER')
        throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
      const currency = normalizeNewCurrency(args.baseCurrency);
      if (currency === null)
        throw appError('INVALID_INPUT', 'error.invalidInput');
      if (currency !== context.ledger.baseCurrency) {
        const item = await ctx.db
          .query('ledgerItems')
          .withIndex('by_ledgerId_deletedAt_dayKey_occurredAt', (index) =>
            index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
          )
          .first();
        if (item !== null)
          throw appError('INVALID_INPUT', 'error.invalidInput');
        patch.baseCurrency = currency;
        changed.push('baseCurrency');
      }
    }
    if (changed.length === 0) return null;
    const now = Date.now();
    patch.updatedAt = now;
    await ctx.db.patch(context.ledger._id, patch);
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: changed.some(
        (key) => key === 'itemWritePolicy' || key === 'invitePolicy',
      )
        ? 'POLICY_CHANGED'
        : 'LEDGER_UPDATED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      meta: {changed: changed.join(',')},
      createdAt: now,
    });
    return null;
  },
});

export const setTimeZone = mutation({
  args: {
    ledgerId: v.id('ledgers'),
    timeZone: v.string(),
    weekStartsOn: v.number(),
    periodStartDay: v.number(),
  },
  returns: v.object({scheduled: v.boolean()}),
  handler: async (ctx, args): Promise<{scheduled: boolean}> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'ADMIN');
    if (
      !isValidTimeZone(args.timeZone) ||
      !isValidWeekStartsOn(args.weekStartsOn) ||
      !isValidPeriodStartDay(args.periodStartDay)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const timeZoneChanged = args.timeZone !== context.ledger.timeZone;
    const settingsChanged =
      timeZoneChanged ||
      args.weekStartsOn !== context.ledger.weekStartsOn ||
      args.periodStartDay !== context.ledger.periodStartDay;
    if (!settingsChanged) return {scheduled: false};
    const now = Date.now();
    let jobId: Id<'maintenanceJobs'> | null = null;
    if (timeZoneChanged) {
      const jobKey = `TIMEZONE_REBUCKET:${args.ledgerId}`;
      const previous = await ctx.db
        .query('maintenanceJobs')
        .withIndex('by_jobKey', (index) => index.eq('jobKey', jobKey))
        .unique();
      if (previous !== null && previous.state !== 'DONE')
        throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
      const jobArgs = JSON.stringify({
        from: context.ledger.timeZone,
        to: args.timeZone,
      });
      if (previous === null)
        jobId = await ctx.db.insert('maintenanceJobs', {
          kind: 'TIMEZONE_REBUCKET',
          jobKey,
          ledgerId: args.ledgerId,
          state: 'QUEUED',
          phase: 'items',
          processed: 0,
          argsJson: jobArgs,
          startedAt: now,
          updatedAt: now,
          requestedByUserId: context.profile.userId,
        });
      else {
        jobId = previous._id;
        await ctx.db.patch(previous._id, {
          state: 'QUEUED',
          phase: 'items',
          cursor: undefined,
          processed: 0,
          argsJson: jobArgs,
          startedAt: now,
          updatedAt: now,
          finishedAt: undefined,
          lastError: undefined,
          requestedByUserId: context.profile.userId,
        });
      }
    }
    await ctx.db.patch(context.ledger._id, {
      timeZone: args.timeZone,
      timeZoneIsAssumed: false,
      weekStartsOn: args.weekStartsOn,
      periodStartDay: args.periodStartDay,
      maintenanceLock: timeZoneChanged ? 'TIMEZONE' : 'NONE',
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'TIMEZONE_CHANGED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      meta: {
        from: context.ledger.timeZone,
        to: args.timeZone,
        weekStartsOn: args.weekStartsOn,
        periodStartDay: args.periodStartDay,
      },
      createdAt: now,
    });
    if (jobId !== null)
      await ctx.scheduler.runAfter(
        0,
        internal.ledgers.internal.rebucketTimeZone,
        {jobId},
      );
    return {scheduled: jobId !== null};
  },
});

export const confirmCurrency = mutation({
  args: {ledgerId: v.id('ledgers'), baseCurrency: v.string()},
  returns: v.object({scheduled: v.boolean()}),
  handler: async (ctx, args): Promise<{scheduled: boolean}> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'OWNER');
    if (!context.ledger.currencyIsAssumed)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const currency = normalizeNewCurrency(args.baseCurrency);
    if (currency === null)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const now = Date.now();
    const jobKey = `CURRENCY_REBASE:${args.ledgerId}`;
    const previous = await ctx.db
      .query('maintenanceJobs')
      .withIndex('by_jobKey', (index) => index.eq('jobKey', jobKey))
      .unique();
    if (
      previous !== null &&
      previous.state !== 'DONE' &&
      previous.state !== 'FAILED'
    )
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const jobArgs = JSON.stringify({
      from: context.ledger.baseCurrency,
      to: currency,
    });
    let jobId: Id<'maintenanceJobs'>;
    if (previous === null)
      jobId = await ctx.db.insert('maintenanceJobs', {
        kind: 'CURRENCY_REBASE',
        jobKey,
        ledgerId: args.ledgerId,
        state: 'QUEUED',
        phase: 'preflight',
        processed: 0,
        argsJson: jobArgs,
        startedAt: now,
        updatedAt: now,
        requestedByUserId: context.profile.userId,
      });
    else {
      jobId = previous._id;
      await ctx.db.patch(previous._id, {
        state: 'QUEUED',
        phase: 'preflight',
        cursor: undefined,
        processed: 0,
        argsJson: jobArgs,
        startedAt: now,
        updatedAt: now,
        finishedAt: undefined,
        lastError: undefined,
        requestedByUserId: context.profile.userId,
      });
    }
    await ctx.db.patch(context.ledger._id, {
      maintenanceLock: 'CURRENCY',
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.ledgers.currencyInternal.rebaseCurrency,
      {jobId},
    );
    return {scheduled: true};
  },
});

export const archive = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'OWNER', {
      allowArchived: true,
    });
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    if (context.ledger.archivedAt !== undefined) return null;
    const now = Date.now();
    const invites = await ctx.db
      .query('ledgerInvites')
      .withIndex('by_ledgerId_revokedAt_createdAt', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('revokedAt', undefined),
      )
      .take(101);
    if (invites.length > 100)
      throw appError('INVALID_INPUT', 'error.invalidInput');
    for (const invite of invites)
      await ctx.db.patch(invite._id, {
        revokedAt: now,
        revokedByUserId: context.profile.userId,
        updatedAt: now,
      });
    await ctx.db.patch(context.ledger._id, {archivedAt: now, updatedAt: now});
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'LEDGER_ARCHIVED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      createdAt: now,
    });
    await notifyLedgerMembers(ctx, {
      ledgerId: args.ledgerId,
      kind: 'LEDGER_ARCHIVED',
      titleKey: 'notification.ledgerArchived.title',
      bodyKey: 'notification.ledgerArchived.body',
      fallbackTitle: 'Ledger archived',
      fallbackBody: 'A ledger was archived.',
      route: '/',
      actorUserId: context.profile.userId,
      excludeUserIds: [context.profile.userId],
      now,
    });
    return null;
  },
});

export const unarchive = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'OWNER', {
      allowArchived: true,
    });
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    if (context.ledger.archivedAt === undefined) return null;
    const now = Date.now();
    await ctx.db.patch(context.ledger._id, {
      archivedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'LEDGER_RESTORED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      createdAt: now,
    });
    return null;
  },
});

export const scheduleDelete = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await requireLedgerRole(ctx, args.ledgerId, 'OWNER', {
      allowArchived: true,
    });
    if (context.ledger.maintenanceLock !== 'NONE')
      throw appError('LEDGER_MAINTENANCE', 'error.ledger.maintenance');
    const members = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
      )
      .take(MEMBER_SCAN_LIMIT + 1);
    if (members.length > MEMBER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    const now = Date.now();
    await notifyLedgerMembers(ctx, {
      ledgerId: args.ledgerId,
      kind: 'LEDGER_ARCHIVED',
      titleKey: 'notification.ledgerArchived.title',
      bodyKey: 'notification.ledgerArchived.body',
      fallbackTitle: 'Ledger unavailable',
      fallbackBody: 'A ledger was scheduled for deletion.',
      route: '/',
      actorUserId: context.profile.userId,
      excludeUserIds: [context.profile.userId],
      now,
    });
    for (const member of members)
      await ctx.db.patch(member._id, {
        deletedAt: now,
        deletedByUserId: context.profile.userId,
        endReason: 'LEDGER_DELETED',
        updatedAt: now,
      });
    await ctx.db.patch(context.ledger._id, {
      deletedAt: now,
      deletedByUserId: context.profile.userId,
      purgeAfter: now + LEDGER_PURGE_GRACE_MS,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'LEDGER_DELETE_SCHEDULED',
      retention: 'AUDIT',
      actorUserId: context.profile.userId,
      createdAt: now,
    });
    return null;
  },
});

export const restore = mutation({
  args: {ledgerId: v.id('ledgers')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const {profile, ledger} = await requireDeletedLedgerOwner(
      ctx,
      args.ledgerId,
    );
    const deletedAt = ledger.deletedAt;
    if (deletedAt === undefined || ledger.purgeAfter === undefined)
      throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
    if (Date.now() >= ledger.purgeAfter)
      throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
    const members = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', deletedAt),
      )
      .take(MEMBER_SCAN_LIMIT + 1);
    if (members.length > MEMBER_SCAN_LIMIT)
      throw appError('MEMBER_LIMIT_REACHED', 'error.ledger.memberLimit');
    const now = Date.now();
    for (const member of members) {
      if (member.endReason !== 'LEDGER_DELETED') continue;
      await ctx.db.patch(member._id, {
        deletedAt: undefined,
        deletedByUserId: undefined,
        endReason: undefined,
        updatedAt: now,
      });
    }
    await ctx.db.patch(ledger._id, {
      deletedAt: undefined,
      deletedByUserId: undefined,
      purgeAfter: undefined,
      updatedAt: now,
    });
    await ctx.db.insert('ledgerAuditLog', {
      ledgerId: args.ledgerId,
      action: 'LEDGER_DELETE_CANCELLED',
      retention: 'AUDIT',
      actorUserId: profile.userId,
      createdAt: now,
    });
    return null;
  },
});
