import {paginationOptsValidator} from 'convex/server';
import {v} from 'convex/values';

import type {Doc} from '../_generated/dataModel';
import {internalQuery} from '../_generated/server';
import {
  LEDGER_SCAN_LIMIT,
  MEMBER_SCAN_LIMIT,
  MAX_CATEGORIES_PER_LEDGER,
  USER_EMAIL_LIMIT,
} from '../lib/constants';
import {requireExportJob} from '../lib/exportPermissions';
import {requireActiveProfile} from '../lib/permissions';
import {legalEventKindValidator} from '../schema/legalEvents';
import {ledgerIsReachable} from '../lib/ledgerPermissions';

const sourceKindValidator = v.union(
  v.literal('items'),
  v.literal('comments'),
  v.literal('photos'),
  v.literal('categories'),
  v.literal('members'),
);

const personalSourceKindValidator = v.union(
  v.literal('accounts'),
  v.literal('legal'),
  v.literal('authAudit'),
  v.literal('notifications'),
  v.literal('feedback'),
);

const safeNotificationParams = (
  params: Readonly<Record<string, string | number>>,
): Record<string, string | number> => {
  const safe: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params))
    if (!/(?:code|token|storage|secret|url)/i.test(key)) safe[key] = value;
  return safe;
};

const safeItem = (row: Doc<'ledgerItems'>) => ({
  id: String(row._id),
  ledgerId: String(row.ledgerId),
  type: row.type,
  amountMinor: row.amountMinor,
  currency: row.currency,
  baseCurrency: row.baseCurrency,
  baseAmountMinor: row.baseAmountMinor,
  occurredAt: row.occurredAt,
  dayKey: row.dayKey,
  monthKey: row.monthKey,
  categoryKey: row.categoryKey,
  authorId: String(row.authorId),
  memo: row.memo,
  place: row.place,
  photoCount: row.photoCount,
  commentCount: row.commentCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});

export const authorizeWorker = internalQuery({
  args: {exportId: v.id('dataExports')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireExportJob(ctx, args.exportId);
    return null;
  },
});

export const header = internalQuery({
  args: {exportId: v.id('dataExports')},
  returns: v.object({
    json: v.string(),
    ledgerIds: v.array(v.id('ledgers')),
    kind: v.union(v.literal('PERSONAL'), v.literal('LEDGER')),
  }),
  handler: async (ctx, args) => {
    const {dataExport} = await requireExportJob(ctx, args.exportId);
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (index) =>
        index.eq('userId', dataExport.requesterUserId),
      )
      .unique();
    if (profile === null) throw new Error('Export requester not found');
    const emails = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(USER_EMAIL_LIMIT + 1);
    const memberships = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_userId_deletedAt', (index) =>
        index.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(LEDGER_SCAN_LIMIT + 1);
    if (emails.length > USER_EMAIL_LIMIT)
      throw new Error('Export email limit exceeded');
    if (memberships.length > LEDGER_SCAN_LIMIT)
      throw new Error('Export ledger limit exceeded');
    const ledgerIds =
      dataExport.kind === 'LEDGER' && dataExport.ledgerId !== undefined
        ? [dataExport.ledgerId]
        : memberships.map((row) => row.ledgerId);
    const ledgers = [];
    for (const ledgerId of ledgerIds) {
      const ledger = await ctx.db.get('ledgers', ledgerId);
      const member = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_ledgerId_userId', (index) =>
          index
            .eq('ledgerId', ledgerId)
            .eq('userId', dataExport.requesterUserId),
        )
        .unique();
      if (
        !ledgerIsReachable(ledger) ||
        member === null ||
        member.deletedAt !== undefined ||
        (dataExport.kind === 'LEDGER' &&
          member.role !== 'OWNER' &&
          member.role !== 'ADMIN')
      )
        throw new Error('Export access changed');
      ledgers.push({
        id: String(ledger._id),
        title: ledger.title,
        description: ledger.description,
        colorKey: ledger.colorKey,
        baseCurrency: ledger.baseCurrency,
        timeZone: ledger.timeZone,
        role: member.role,
        joinedAt: member.joinedAt,
      });
    }
    const latestPresence =
      dataExport.kind === 'PERSONAL'
        ? await ctx.db
            .query('userPresence')
            .withIndex('by_userId', (index) =>
              index.eq('userId', profile.userId),
            )
            .unique()
        : null;
    return {
      ledgerIds,
      kind: dataExport.kind,
      json: JSON.stringify({
        schemaVersion: 1,
        generatedFor: String(profile.userId),
        kind: dataExport.kind,
        profile:
          dataExport.kind === 'PERSONAL'
            ? {
                handle: profile.handle,
                displayName: profile.displayName,
                bio: profile.bio,
                locale: profile.locale,
                appearance: profile.appearance,
                preferredCurrency: profile.preferredCurrency,
                countryAnalyticsEnabled:
                  profile.countryAnalyticsEnabled ?? false,
                latestIpCountryCode:
                  profile.countryAnalyticsEnabled === true
                    ? (latestPresence?.ipCountryCodeAtLastSeen ?? null)
                    : null,
                createdAt: profile.createdAt,
                updatedAt: profile.updatedAt,
              }
            : undefined,
        emails:
          dataExport.kind === 'PERSONAL'
            ? emails.map((email) => ({
                email: email.emailRaw,
                isPrimary: email.isPrimary,
                source: email.source,
                verifiedAt: email.verifiedAt,
              }))
            : undefined,
        ledgers,
      }),
    };
  },
});

export const sourcePage = internalQuery({
  args: {
    exportId: v.id('dataExports'),
    ledgerId: v.id('ledgers'),
    source: sourceKindValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    json: v.string(),
    count: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    photos: v.array(
      v.object({
        id: v.id('itemPhotos'),
        storageId: v.id('_storage'),
        mediaType: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const {dataExport} = await requireExportJob(ctx, args.exportId);
    if (dataExport.kind === 'LEDGER' && dataExport.ledgerId !== args.ledgerId)
      throw new Error('Wrong export ledger');
    const membership = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_userId', (index) =>
        index
          .eq('ledgerId', args.ledgerId)
          .eq('userId', dataExport.requesterUserId),
      )
      .unique();
    // `header` gates the ledger once, at the start of the job. Every page after
    // it ran only this membership check, so a ledger deleted or orphaned
    // mid-export kept streaming page by page — the rows outlive the gate that
    // admitted them. One `get` per page, against a job that already reads a
    // page of rows.
    const ledger = await ctx.db.get('ledgers', args.ledgerId);
    if (
      !ledgerIsReachable(ledger) ||
      membership === null ||
      membership.deletedAt !== undefined ||
      (dataExport.kind === 'LEDGER' &&
        membership.role !== 'OWNER' &&
        membership.role !== 'ADMIN')
    )
      throw new Error('Export access changed');
    if (args.source === 'items') {
      const query = ctx.db
        .query('ledgerItems')
        .withIndex(
          'by_ledgerId_deletedAt_authorId_dayKey_occurredAt',
          (index) =>
            dataExport.kind === 'PERSONAL'
              ? index
                  .eq('ledgerId', args.ledgerId)
                  .eq('deletedAt', undefined)
                  .eq('authorId', dataExport.requesterUserId)
              : index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
        );
      const page = await query.paginate(args.paginationOpts);
      return {
        json: JSON.stringify(page.page.map(safeItem)),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
        photos: [],
      };
    }
    if (args.source === 'comments') {
      const page = await ctx.db
        .query('itemComments')
        .withIndex('by_ledgerId_deletedAt_authorId_createdAt', (index) =>
          dataExport.kind === 'PERSONAL'
            ? index
                .eq('ledgerId', args.ledgerId)
                .eq('deletedAt', undefined)
                .eq('authorId', dataExport.requesterUserId)
            : index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
        )
        .paginate(args.paginationOpts);
      return {
        json: JSON.stringify(
          page.page.map((row) => ({
            id: String(row._id),
            itemId: String(row.itemId),
            authorId: String(row.authorId),
            body: row.body,
            editedAt: row.editedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
        ),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
        photos: [],
      };
    }
    if (args.source === 'photos') {
      const page = await ctx.db
        .query('itemPhotos')
        .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
          index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
        )
        .paginate(args.paginationOpts);
      const rows = page.page.flatMap((row) =>
        dataExport.kind === 'LEDGER' ||
        row.uploadedByUserId === dataExport.requesterUserId
          ? [row]
          : [],
      );
      return {
        json: JSON.stringify(
          rows.map((row) => ({
            id: String(row._id),
            itemId: String(row.itemId),
            order: row.order,
            width: row.width,
            height: row.height,
            capturedAt: row.capturedAt,
            uploadedByUserId: row.uploadedByUserId,
            createdAt: row.createdAt,
          })),
        ),
        count: rows.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
        photos: rows.flatMap((row) =>
          row.storageId === undefined
            ? []
            : [
                {
                  id: row._id,
                  storageId: row.storageId,
                  mediaType: row.mimeType ?? 'image/jpeg',
                },
              ],
        ),
      };
    }
    if (args.source === 'categories') {
      const rows = await ctx.db
        .query('ledgerCategories')
        .withIndex('by_ledgerId_sortOrder', (index) =>
          index.eq('ledgerId', args.ledgerId),
        )
        .take(MAX_CATEGORIES_PER_LEDGER + 1);
      if (rows.length > MAX_CATEGORIES_PER_LEDGER)
        throw new Error('Export category limit exceeded');
      return {
        json: JSON.stringify(
          rows.slice(0, MAX_CATEGORIES_PER_LEDGER).map((row) => ({
            key: row.key,
            kind: row.kind,
            label: row.label,
            iconKey: row.iconKey,
            colorToken: row.colorToken,
            order: row.sortOrder,
            archivedAt: row.archivedAt,
          })),
        ),
        count: Math.min(rows.length, MAX_CATEGORIES_PER_LEDGER),
        isDone: true,
        continueCursor: '',
        photos: [],
      };
    }
    const rows = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
      )
      .take(MEMBER_SCAN_LIMIT + 1);
    if (rows.length > MEMBER_SCAN_LIMIT)
      throw new Error('Export member limit exceeded');
    return {
      json: JSON.stringify(
        rows.slice(0, MEMBER_SCAN_LIMIT).map((row) => ({
          userId: String(row.userId),
          role: row.role,
          joinedAt: row.joinedAt,
          joinedVia: row.joinedVia,
        })),
      ),
      count: Math.min(rows.length, MEMBER_SCAN_LIMIT),
      isDone: true,
      continueCursor: '',
      photos: [],
    };
  },
});

export const personalSourcePage = internalQuery({
  args: {
    exportId: v.id('dataExports'),
    source: personalSourceKindValidator,
    legalKind: v.optional(legalEventKindValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    json: v.string(),
    count: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const {dataExport} = await requireExportJob(ctx, args.exportId);
    if (dataExport.kind !== 'PERSONAL')
      throw new Error('Wrong personal export kind');
    if (args.source === 'accounts') {
      const page = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (index) =>
          index.eq('userId', dataExport.requesterUserId),
        )
        .paginate(args.paginationOpts);
      return {
        json: JSON.stringify(
          page.page.map((row) => ({
            provider: row.provider,
            providerAccountId: row.providerAccountId,
            emailVerified: row.emailVerified,
            phoneVerified: row.phoneVerified,
          })),
        ),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    }
    if (args.source === 'legal') {
      if (args.legalKind === undefined)
        throw new Error('Legal export kind missing');
      const page = await ctx.db
        .query('legalEvents')
        .withIndex('by_userId_kind_createdAt', (index) =>
          index
            .eq('userId', dataExport.requesterUserId)
            .eq('kind', args.legalKind!),
        )
        .paginate(args.paginationOpts);
      return {
        json: JSON.stringify(
          page.page.map((row) => ({
            kind: row.kind,
            documentVersion: row.documentVersion,
            documentSha256: row.documentSha256,
            locale: row.locale,
            createdAt: row.createdAt,
          })),
        ),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    }
    if (args.source === 'authAudit') {
      const page = await ctx.db
        .query('authAudit')
        .withIndex('by_userId_createdAt', (index) =>
          index.eq('userId', dataExport.requesterUserId),
        )
        .paginate(args.paginationOpts);
      return {
        json: JSON.stringify(
          page.page.map((row) => ({
            event: row.event,
            detail: row.detail,
            createdAt: row.createdAt,
          })),
        ),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    }
    if (args.source === 'notifications') {
      const page = await ctx.db
        .query('notifications')
        .withIndex('by_userId_deletedAt_createdAt', (index) =>
          index.eq('userId', dataExport.requesterUserId),
        )
        .paginate(args.paginationOpts);
      return {
        json: JSON.stringify(
          page.page.map((row) => ({
            kind: row.kind,
            titleKey: row.titleKey,
            bodyKey: row.bodyKey,
            params: safeNotificationParams(row.params),
            readAt: row.readAt,
            createdAt: row.createdAt,
            deletedAt: row.deletedAt,
          })),
        ),
        count: page.page.length,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    }
    const page = await ctx.db
      .query('feedback')
      .withIndex('by_userId_createdAt', (index) =>
        index.eq('userId', dataExport.requesterUserId),
      )
      .paginate(args.paginationOpts);
    return {
      json: JSON.stringify(
        page.page.map((row) => ({
          category: row.category,
          body: row.body,
          contactEmail: row.contactEmail,
          locale: row.locale,
          status: row.status,
          createdAt: row.createdAt,
        })),
      ),
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const resolveDownload = internalQuery({
  args: {fileId: v.string(), now: v.number()},
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id('_storage'),
      fileName: v.string(),
      mediaType: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireActiveProfile(ctx);
    const fileId = ctx.db.normalizeId('dataExportFiles', args.fileId);
    if (fileId === null) return null;
    const file = await ctx.db.get('dataExportFiles', fileId);
    if (
      file === null ||
      file.requesterUserId !== profile.userId ||
      file.expiresAt <= args.now
    )
      return null;
    const dataExport = await ctx.db.get('dataExports', file.exportId);
    if (
      dataExport === null ||
      dataExport.state !== 'READY' ||
      dataExport.expiresAt === undefined ||
      dataExport.expiresAt <= args.now
    )
      return null;
    return {
      storageId: file.storageId,
      fileName: file.fileName,
      mediaType: file.mediaType,
    };
  },
});
