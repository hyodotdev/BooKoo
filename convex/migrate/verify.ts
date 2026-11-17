import {v} from 'convex/values';

import {monthDayKeyBounds} from '../../shared/date';
import {scaleOf} from '../../shared/currency';
import type {Doc} from '../_generated/dataModel';
import {migrationMutation} from '../lib/functions';
import {anomalyKindValidator} from '../schema/migration';

const tableValidator = v.union(
  v.literal('legacyUsers'),
  v.literal('userProfiles'),
  v.literal('ledgers'),
  v.literal('ledgerMembers'),
  v.literal('ledgerMemberState'),
  v.literal('ledgerJoinRequests'),
  v.literal('legacyInvites'),
  v.literal('ledgerInvites'),
  v.literal('ledgerCategories'),
  v.literal('ledgerItems'),
  v.literal('itemComments'),
  v.literal('itemPhotos'),
  v.literal('feedback'),
  v.literal('migrationAnomalies'),
  v.literal('ledgerMonthRollups'),
);

const keyRowValidator = v.object({
  key: v.string(),
  checksum: v.optional(v.string()),
  verified: v.optional(v.boolean()),
});

type KeyRow = {key: string; checksum?: string; verified?: boolean};
type PageResult = {rows: KeyRow[]; cursor: string; done: boolean};

const result = (
  page: {page: unknown[]; continueCursor: string; isDone: boolean},
  summarize: (row: unknown) => KeyRow,
): PageResult => ({
  rows: page.page.map(summarize),
  cursor: page.continueCursor,
  done: page.isDone,
});

const legacySummary = (row: unknown): KeyRow => {
  const document = row as {
    legacyKey?: string;
    legacyChecksum?: string;
    _id: string;
  };
  return {
    key: document.legacyKey ?? String(document._id),
    checksum: document.legacyChecksum,
  };
};

export const pageTable = migrationMutation({
  args: {table: tableValidator, cursor: v.union(v.string(), v.null())},
  returns: v.object({
    rows: v.array(keyRowValidator),
    cursor: v.string(),
    done: v.boolean(),
  }),
  handler: async (ctx, args): Promise<PageResult> => {
    const options = {cursor: args.cursor, numItems: 500};
    switch (args.table) {
      case 'legacyUsers': {
        const page = await ctx.db
          .query('legacyUsers')
          .withIndex('by_legacyUid')
          .paginate(options);
        return result(page, (row) => ({
          key: (row as Doc<'legacyUsers'>).legacyUid,
          checksum:
            (row as Doc<'legacyUsers'>).placeholderUserId === undefined
              ? 'missing'
              : 'linked',
        }));
      }
      case 'userProfiles':
        return result(
          await ctx.db
            .query('userProfiles')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'ledgers':
        return result(
          await ctx.db
            .query('ledgers')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'ledgerMembers':
        return result(
          await ctx.db
            .query('ledgerMembers')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'ledgerMemberState': {
        const page = await ctx.db
          .query('ledgerMemberState')
          .withIndex('by_ledgerId_userId')
          .paginate(options);
        return {
          rows: await Promise.all(
            page.page.map(async (state) => {
              const [ledger, profile] = await Promise.all([
                ctx.db.get('ledgers', state.ledgerId),
                ctx.db
                  .query('userProfiles')
                  .withIndex('by_userId', (index) =>
                    index.eq('userId', state.userId),
                  )
                  .unique(),
              ]);
              return {
                key: `${ledger?.legacyKey ?? 'missing-ledger'}/${profile?.legacyUid ?? 'missing-user'}`,
              };
            }),
          ),
          cursor: page.continueCursor,
          done: page.isDone,
        };
      }
      case 'ledgerJoinRequests':
        return result(
          await ctx.db
            .query('ledgerJoinRequests')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'legacyInvites':
        return result(
          await ctx.db
            .query('legacyInvites')
            .withIndex('by_legacyLedgerKey')
            .paginate(options),
          (row) => {
            const invite = row as Doc<'legacyInvites'>;
            return {key: `${invite.rawParentKey}/${invite.rawChildKey}`};
          },
        );
      case 'ledgerInvites':
        return result(
          await ctx.db
            .query('ledgerInvites')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'ledgerCategories': {
        const page = await ctx.db
          .query('ledgerCategories')
          .withIndex('by_ledgerId_sortOrder')
          .paginate(options);
        return {
          rows: await Promise.all(
            page.page.map(async (category) => {
              const ledger = await ctx.db.get('ledgers', category.ledgerId);
              return {
                key: `${ledger?.legacyKey ?? 'missing-ledger'}/${category.key}`,
              };
            }),
          ),
          cursor: page.continueCursor,
          done: page.isDone,
        };
      }
      case 'ledgerItems':
        return result(
          await ctx.db
            .query('ledgerItems')
            .withIndex('by_legacyKey')
            .paginate(options),
          (row) => {
            const item = row as Doc<'ledgerItems'>;
            const evidenceMismatch =
              item.legacyCurrencyEvidence !== undefined &&
              !['UNKNOWN', 'OTHER'].includes(item.legacyCurrencyEvidence) &&
              item.legacyCurrencyEvidence !== item.baseCurrency;
            return {
              ...legacySummary(row),
              verified: !evidenceMismatch || item.needsReview === true,
            };
          },
        );
      case 'itemComments':
        return result(
          await ctx.db
            .query('itemComments')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'itemPhotos':
        return result(
          await ctx.db
            .query('itemPhotos')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'feedback':
        return result(
          await ctx.db
            .query('feedback')
            .withIndex('by_legacyKey')
            .paginate(options),
          legacySummary,
        );
      case 'migrationAnomalies':
        return result(
          await ctx.db
            .query('migrationAnomalies')
            .withIndex('by_legacyKey')
            .paginate(options),
          (row) => {
            const anomaly = row as Doc<'migrationAnomalies'>;
            return {
              key: `${anomaly.kind}:${anomaly.legacyKey}`,
              checksum: anomaly.producedRow ? 'produced' : 'not-produced',
            };
          },
        );
      case 'ledgerMonthRollups':
        return result(
          await ctx.db
            .query('ledgerMonthRollups')
            .withIndex('by_ledgerId_monthKey_shard')
            .paginate(options),
          (row) => ({
            key: String((row as Doc<'ledgerMonthRollups'>).ledgerId),
          }),
        );
    }
  },
});

export const ledgerSums = migrationMutation({
  args: {legacyLedgerKeys: v.array(v.string())},
  returns: v.array(
    v.object({
      legacyLedgerKey: v.string(),
      itemCount: v.number(),
      directionalMinor: v.number(),
      magnitudeMinor: v.number(),
      residualMinor: v.number(),
      lossyCount: v.number(),
      legacyValueMissing: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.legacyLedgerKeys.length > 25)
      throw new Error('ledger batch too large');
    const output: {
      legacyLedgerKey: string;
      itemCount: number;
      directionalMinor: number;
      magnitudeMinor: number;
      residualMinor: number;
      lossyCount: number;
      legacyValueMissing: number;
    }[] = [];
    for (const legacyKey of args.legacyLedgerKeys) {
      const ledger = await ctx.db
        .query('ledgers')
        .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
        .unique();
      if (ledger === null) throw new Error('ledger not found');
      const items = await ctx.db
        .query('ledgerItems')
        .withIndex('by_ledgerId_monthKey', (index) =>
          index.eq('ledgerId', ledger._id),
        )
        .take(5001);
      if (items.length > 5000)
        throw new Error('ledger item verification bound exceeded');
      let directionalMinor = 0;
      let magnitudeMinor = 0;
      let residualMinor = 0;
      let lossyCount = 0;
      let legacyValueMissing = 0;
      for (const item of items) {
        const signedMinor =
          item.type === 'EXPENSE' ? -item.amountMinor : item.amountMinor;
        directionalMinor += signedMinor;
        magnitudeMinor += item.amountMinor;
        if (item.legacyRealAmount === undefined) {
          legacyValueMissing += 1;
          continue;
        }
        const residual =
          item.legacyRealAmount * scaleOf(item.baseCurrency) - signedMinor;
        residualMinor += residual;
        if (Math.abs(residual) > 1e-9) lossyCount += 1;
      }
      output.push({
        legacyLedgerKey: legacyKey,
        itemCount: items.length,
        directionalMinor,
        magnitudeMinor,
        residualMinor,
        lossyCount,
        legacyValueMissing,
      });
    }
    return output;
  },
});

export const spotItem = migrationMutation({
  args: {legacyKey: v.string()},
  returns: v.union(
    v.null(),
    v.object({
      legacyKey: v.string(),
      legacyLedgerKey: v.optional(v.string()),
      legacyWriterUid: v.optional(v.string()),
      type: v.string(),
      amountMinor: v.number(),
      baseAmountMinor: v.number(),
      currency: v.string(),
      baseCurrency: v.string(),
      occurredAt: v.number(),
      dayKey: v.number(),
      monthKey: v.number(),
      occurredOffsetMinutes: v.number(),
      categoryKey: v.string(),
      memo: v.string(),
      photoCount: v.number(),
      commentCount: v.number(),
      legacyChecksum: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query('ledgerItems')
      .withIndex('by_legacyKey', (index) =>
        index.eq('legacyKey', args.legacyKey),
      )
      .unique();
    if (item === null) return null;
    return {
      legacyKey: args.legacyKey,
      legacyLedgerKey: item.legacyLedgerKey,
      legacyWriterUid: item.legacyWriterUid,
      type: item.type,
      amountMinor: item.amountMinor,
      baseAmountMinor: item.baseAmountMinor,
      currency: item.currency,
      baseCurrency: item.baseCurrency,
      occurredAt: item.occurredAt,
      dayKey: item.dayKey,
      monthKey: item.monthKey,
      occurredOffsetMinutes: item.occurredOffsetMinutes,
      categoryKey: item.categoryKey,
      memo: item.memo,
      photoCount: item.photoCount,
      commentCount: item.commentCount,
      legacyChecksum: item.legacyChecksum,
    };
  },
});

export const anomalySummary = migrationMutation({
  args: {kinds: v.array(anomalyKindValidator)},
  returns: v.array(
    v.object({
      kind: anomalyKindValidator,
      unresolved: v.number(),
      unapproved: v.number(),
      total: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.kinds.length > 30) throw new Error('anomaly kind batch too large');
    const output: {
      kind: Doc<'migrationAnomalies'>['kind'];
      unresolved: number;
      unapproved: number;
      total: number;
    }[] = [];
    for (const kind of args.kinds) {
      const unresolved = await ctx.db
        .query('migrationAnomalies')
        .withIndex('by_kind_resolvedAt', (index) =>
          index.eq('kind', kind).eq('resolvedAt', undefined),
        )
        .take(5001);
      if (unresolved.length > 5000) throw new Error('anomaly bound exceeded');
      const resolved = await ctx.db
        .query('migrationAnomalies')
        .withIndex('by_kind_resolvedAt', (index) =>
          index.eq('kind', kind).gt('resolvedAt', 0),
        )
        .take(5001);
      if (resolved.length > 5000) throw new Error('anomaly bound exceeded');
      const unapprovedResolved = resolved.reduce(
        (count, row) => count + (row.waivedByUserId === undefined ? 1 : 0),
        0,
      );
      output.push({
        kind,
        unresolved: unresolved.length,
        unapproved: unresolved.length + unapprovedResolved,
        total: unresolved.length + resolved.length,
      });
    }
    return output;
  },
});

export const blobProgress = migrationMutation({
  args: {},
  returns: v.object({
    photos: v.record(v.string(), v.number()),
    avatars: v.record(v.string(), v.number()),
  }),
  handler: async (ctx) => {
    const states = ['NATIVE', 'PENDING', 'DONE', 'MISSING', 'FAILED'] as const;
    const photos: Record<string, number> = {};
    const avatars: Record<string, number> = {};
    for (const state of states) {
      const photoRows = await ctx.db
        .query('itemPhotos')
        .withIndex('by_migrationState_attempts', (index) =>
          index.eq('migrationState', state),
        )
        .take(5001);
      const avatarRows = await ctx.db
        .query('userProfiles')
        .withIndex('by_avatarMigrationState_avatarAttempts', (index) =>
          index.eq('avatarMigrationState', state),
        )
        .take(5001);
      if (photoRows.length > 5000 || avatarRows.length > 5000)
        throw new Error('blob verification bound exceeded');
      photos[state] = photoRows.length;
      avatars[state] = avatarRows.length;
    }
    return {photos, avatars};
  },
});

const rollupValueValidator = v.object({
  expenseMinor: v.number(),
  incomeMinor: v.number(),
  itemCount: v.number(),
});

export const rollupSpot = migrationMutation({
  args: {legacyLedgerKey: v.string(), monthKey: v.number()},
  returns: v.object({
    source: rollupValueValidator,
    month: rollupValueValidator,
    days: rollupValueValidator,
    categories: rollupValueValidator,
    matches: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ledger = await ctx.db
      .query('ledgers')
      .withIndex('by_legacyKey', (index) =>
        index.eq('legacyKey', args.legacyLedgerKey),
      )
      .unique();
    if (ledger === null) throw new Error('ledger not found');
    const items = await ctx.db
      .query('ledgerItems')
      .withIndex('by_ledgerId_monthKey', (index) =>
        index.eq('ledgerId', ledger._id).eq('monthKey', args.monthKey),
      )
      .take(5001);
    if (items.length > 5000) throw new Error('rollup source bound exceeded');
    const source = items.reduce(
      (total, item) => ({
        expenseMinor:
          total.expenseMinor +
          (item.deletedAt === undefined && item.type === 'EXPENSE'
            ? item.baseAmountMinor
            : 0),
        incomeMinor:
          total.incomeMinor +
          (item.deletedAt === undefined && item.type === 'INCOME'
            ? item.baseAmountMinor
            : 0),
        itemCount: total.itemCount + (item.deletedAt === undefined ? 1 : 0),
      }),
      {expenseMinor: 0, incomeMinor: 0, itemCount: 0},
    );
    const monthRows = await ctx.db
      .query('ledgerMonthRollups')
      .withIndex('by_ledgerId_monthKey_shard', (index) =>
        index.eq('ledgerId', ledger._id).eq('monthKey', args.monthKey),
      )
      .take(101);
    const bounds = monthDayKeyBounds(args.monthKey);
    const dayRows = await ctx.db
      .query('ledgerDayRollups')
      .withIndex('by_ledgerId_dayKey_shard', (index) =>
        index
          .eq('ledgerId', ledger._id)
          .gte('dayKey', bounds.first)
          .lte('dayKey', bounds.last),
      )
      .take(101);
    const categoryRows = await ctx.db
      .query('ledgerCategoryMonthRollups')
      .withIndex('by_ledgerId_monthKey_categoryKey_shard', (index) =>
        index.eq('ledgerId', ledger._id).eq('monthKey', args.monthKey),
      )
      .take(501);
    const sum = (
      rows: readonly {
        expenseMinor: number;
        incomeMinor: number;
        itemCount: number;
      }[],
    ) =>
      rows.reduce(
        (total, row) => ({
          expenseMinor: total.expenseMinor + row.expenseMinor,
          incomeMinor: total.incomeMinor + row.incomeMinor,
          itemCount: total.itemCount + row.itemCount,
        }),
        {expenseMinor: 0, incomeMinor: 0, itemCount: 0},
      );
    const month = sum(monthRows);
    const days = sum(dayRows);
    const categories = sum(categoryRows);
    const encoded = JSON.stringify(source);
    return {
      source,
      month,
      days,
      categories,
      matches:
        JSON.stringify(month) === encoded &&
        JSON.stringify(days) === encoded &&
        JSON.stringify(categories) === encoded,
    };
  },
});
