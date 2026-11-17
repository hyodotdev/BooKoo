import {v} from 'convex/values';
import type {WithoutSystemFields} from 'convex/server';

import type {Doc, Id, TableNames} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {migrationMutation} from '../lib/functions';

const resultValidator = v.object({
  inserted: v.number(),
  skipped: v.number(),
  failed: v.number(),
});

type MigrationResult = {
  inserted: number;
  skipped: number;
  failed: number;
};

type Insert<Table extends TableNames> = WithoutSystemFields<Doc<Table>>;
type InputRow = Record<string, unknown>;

const rowValidator = v.string();

const asRecord = (value: unknown, label: string): InputRow => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as InputRow;
};

const parseRow = (value: string): InputRow => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('row must be valid JSON');
  }
  return asRecord(parsed, 'row');
};

const stringField = (row: InputRow, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${field} must be a non-empty string`);
  return value;
};

const documentOf = <Table extends TableNames>(row: InputRow): Insert<Table> =>
  asRecord(row.document, 'document') as Insert<Table>;

const requireBatch = (rows: readonly unknown[], limit: number): void => {
  if (rows.length === 0 || rows.length > limit)
    throw new Error(`batch size must be between 1 and ${limit}`);
};

const priorBatch = async (
  ctx: MutationCtx,
  runId: string,
  table: string,
  batchIndex: number,
): Promise<MigrationResult | undefined> => {
  const prior = await ctx.db
    .query('migrationRuns')
    .withIndex('by_runId_table_batchIndex', (index) =>
      index.eq('runId', runId).eq('table', table).eq('batchIndex', batchIndex),
    )
    .unique();
  return prior === null
    ? undefined
    : {inserted: 0, skipped: prior.inserted + prior.skipped, failed: 0};
};

const recordBatch = async (
  ctx: MutationCtx,
  runId: string,
  table: string,
  batchIndex: number,
  result: MigrationResult,
): Promise<MigrationResult> => {
  await ctx.db.insert('migrationRuns', {
    runId,
    table,
    batchIndex,
    ...result,
    at: Date.now(),
  });
  return result;
};

const profileByLegacyUid = async (
  ctx: MutationCtx,
  legacyUid: string,
): Promise<Doc<'userProfiles'>> => {
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_legacyUid', (index) => index.eq('legacyUid', legacyUid))
    .unique();
  if (profile === null) throw new Error('pass-order violation: user missing');
  return profile;
};

const ledgerByLegacyKey = async (
  ctx: MutationCtx,
  legacyKey: string,
): Promise<Doc<'ledgers'>> => {
  const ledger = await ctx.db
    .query('ledgers')
    .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
    .unique();
  if (ledger === null) throw new Error('pass-order violation: ledger missing');
  return ledger;
};

const itemByLegacyKey = async (
  ctx: MutationCtx,
  legacyKey: string,
): Promise<Doc<'ledgerItems'>> => {
  const item = await ctx.db
    .query('ledgerItems')
    .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
    .unique();
  if (item === null) throw new Error('pass-order violation: item missing');
  return item;
};

const commonArgs = {
  runId: v.string(),
  batchIndex: v.number(),
  rows: v.array(rowValidator),
};

export const importLegacyUserRefs = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const prior = await priorBatch(
      ctx,
      args.runId,
      'legacyUsers',
      args.batchIndex,
    );
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const legacyUid = stringField(row, 'legacyUid');
      const existing = await ctx.db
        .query('legacyUsers')
        .withIndex('by_legacyUid', (index) => index.eq('legacyUid', legacyUid))
        .unique();
      if (existing !== null) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert('legacyUsers', documentOf<'legacyUsers'>(row));
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, 'legacyUsers', args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importPlaceholders = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const prior = await priorBatch(
      ctx,
      args.runId,
      'userProfiles',
      args.batchIndex,
    );
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const legacyUid = stringField(row, 'legacyUid');
      const legacy = await ctx.db
        .query('legacyUsers')
        .withIndex('by_legacyUid', (index) => index.eq('legacyUid', legacyUid))
        .unique();
      if (legacy === null)
        throw new Error('pass-order violation: legacy user missing');
      const duplicate = await ctx.db
        .query('userProfiles')
        .withIndex('by_legacyUid', (index) => index.eq('legacyUid', legacyUid))
        .unique();
      if (duplicate !== null) {
        if (legacy.placeholderUserId !== duplicate.userId)
          await ctx.db.patch(legacy._id, {placeholderUserId: duplicate.userId});
        skipped += 1;
        continue;
      }
      const userDocument = asRecord(row.user, 'user') as Insert<'users'>;
      const userId = await ctx.db.insert('users', userDocument);
      const profileDocument = documentOf<'userProfiles'>(row);
      await ctx.db.insert('userProfiles', {...profileDocument, userId});
      await ctx.db.patch(legacy._id, {placeholderUserId: userId});
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, 'userProfiles', args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importLedgers = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 200);
    const prior = await priorBatch(ctx, args.runId, 'ledgers', args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const legacyKey = stringField(row, 'legacyKey');
      const duplicate = await ctx.db
        .query('ledgers')
        .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const owner = await profileByLegacyUid(
        ctx,
        stringField(row, 'legacyOwnerUid'),
      );
      const document = documentOf<'ledgers'>(row);
      await ctx.db.insert('ledgers', {...document, ownerId: owner.userId});
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, 'ledgers', args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importMembers = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const prior = await priorBatch(
      ctx,
      args.runId,
      'ledgerMembers',
      args.batchIndex,
    );
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    const increments = new Map<Id<'ledgers'>, number>();
    for (const input of args.rows) {
      const row = parseRow(input);
      const legacyKey = stringField(row, 'legacyKey');
      const duplicate = await ctx.db
        .query('ledgerMembers')
        .withIndex('by_legacyKey', (index) => index.eq('legacyKey', legacyKey))
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const [ledger, profile] = await Promise.all([
        ledgerByLegacyKey(ctx, stringField(row, 'legacyLedgerKey')),
        profileByLegacyUid(ctx, stringField(row, 'legacyUid')),
      ]);
      const document = documentOf<'ledgerMembers'>(row);
      await ctx.db.insert('ledgerMembers', {
        ...document,
        ledgerId: ledger._id,
        userId: profile.userId,
      });
      const state = asRecord(row.state, 'state') as Omit<
        Insert<'ledgerMemberState'>,
        'ledgerId' | 'userId'
      >;
      await ctx.db.insert('ledgerMemberState', {
        ...state,
        ledgerId: ledger._id,
        userId: profile.userId,
      });
      increments.set(ledger._id, (increments.get(ledger._id) ?? 0) + 1);
      inserted += 1;
    }
    for (const [ledgerId, increment] of increments) {
      const ledger = await ctx.db.get('ledgers', ledgerId);
      if (ledger !== null)
        await ctx.db.patch(ledgerId, {
          memberCount: ledger.memberCount + increment,
        });
    }
    return recordBatch(ctx, args.runId, 'ledgerMembers', args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importJoinRequests = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const table = 'ledgerJoinRequests';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const [ledger, profile] = await Promise.all([
        ledgerByLegacyKey(ctx, stringField(row, 'legacyLedgerKey')),
        profileByLegacyUid(ctx, stringField(row, 'legacyUid')),
      ]);
      await ctx.db.insert(table, {
        ...documentOf<'ledgerJoinRequests'>(row),
        ledgerId: ledger._id,
        userId: profile.userId,
      });
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importLegacyInvites = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const table = 'legacyInvites';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    const documents = args.rows.map((input) =>
      documentOf<'legacyInvites'>(parseRow(input)),
    );
    const existingKeys = new Set<string>();
    for (const legacyLedgerKey of new Set(
      documents.map((document) => document.legacyLedgerKey),
    )) {
      const existing = await ctx.db
        .query(table)
        .withIndex('by_legacyLedgerKey', (index) =>
          index.eq('legacyLedgerKey', legacyLedgerKey),
        )
        .take(501);
      if (existing.length > 500)
        throw new Error('legacy invite identity range exceeds measured bound');
      for (const row of existing)
        existingKeys.add(JSON.stringify([row.rawParentKey, row.rawChildKey]));
    }
    let inserted = 0;
    let skipped = 0;
    for (const document of documents) {
      const key = JSON.stringify([document.rawParentKey, document.rawChildKey]);
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert(table, document);
      existingKeys.add(key);
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importInvites = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 300);
    const table = 'ledgerInvites';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const ledger = await ledgerByLegacyKey(
        ctx,
        stringField(row, 'legacyLedgerKey'),
      );
      const creator = await profileByLegacyUid(
        ctx,
        stringField(row, 'legacyCreatedByUid'),
      );
      await ctx.db.insert(table, {
        ...documentOf<'ledgerInvites'>(row),
        ledgerId: ledger._id,
        createdByUserId: creator.userId,
      });
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importCategories = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 300);
    const table = 'ledgerCategories';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const ledger = await ledgerByLegacyKey(
        ctx,
        stringField(row, 'legacyLedgerKey'),
      );
      const key = stringField(row, 'key');
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_ledgerId_key', (index) =>
          index.eq('ledgerId', ledger._id).eq('key', key),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const document = documentOf<'ledgerCategories'>(row);
      await ctx.db.insert(table, {...document, ledgerId: ledger._id, key});
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importItems = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 300);
    const table = 'ledgerItems';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const [ledger, author] = await Promise.all([
        ledgerByLegacyKey(ctx, stringField(row, 'legacyLedgerKey')),
        profileByLegacyUid(ctx, stringField(row, 'legacyWriterUid')),
      ]);
      const document = documentOf<'ledgerItems'>(row);
      await ctx.db.insert(table, {
        ...document,
        ledgerId: ledger._id,
        authorId: author.userId,
      });
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importComments = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const table = 'itemComments';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    const increments = new Map<Id<'ledgerItems'>, number>();
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const [item, author] = await Promise.all([
        itemByLegacyKey(ctx, stringField(row, 'legacyItemKey')),
        profileByLegacyUid(ctx, stringField(row, 'legacyWriterUid')),
      ]);
      await ctx.db.insert(table, {
        ...documentOf<'itemComments'>(row),
        itemId: item._id,
        ledgerId: item.ledgerId,
        authorId: author.userId,
      });
      increments.set(item._id, (increments.get(item._id) ?? 0) + 1);
      inserted += 1;
    }
    for (const [itemId, increment] of increments) {
      const item = await ctx.db.get('ledgerItems', itemId);
      if (item !== null)
        await ctx.db.patch(itemId, {
          commentCount: item.commentCount + increment,
        });
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importPhotos = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 500);
    const table = 'itemPhotos';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    const increments = new Map<Id<'ledgerItems'>, number>();
    const covers = new Map<Id<'ledgerItems'>, Id<'itemPhotos'>>();
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const item = await itemByLegacyKey(
        ctx,
        stringField(row, 'legacyItemKey'),
      );
      const document = documentOf<'itemPhotos'>(row);
      const photoId = await ctx.db.insert(table, {
        ...document,
        itemId: item._id,
        ledgerId: item.ledgerId,
      });
      increments.set(item._id, (increments.get(item._id) ?? 0) + 1);
      if (document.order === 0) covers.set(item._id, photoId);
      inserted += 1;
    }
    for (const [itemId, increment] of increments) {
      const item = await ctx.db.get('ledgerItems', itemId);
      if (item !== null)
        await ctx.db.patch(itemId, {
          photoCount: item.photoCount + increment,
          coverPhotoId: item.coverPhotoId ?? covers.get(itemId),
        });
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importFeedback = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 300);
    const table = 'feedback';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', stringField(row, 'legacyKey')),
        )
        .unique();
      if (duplicate !== null) {
        skipped += 1;
        continue;
      }
      const legacyUid = row.legacyUid;
      const profile =
        typeof legacyUid === 'string'
          ? await profileByLegacyUid(ctx, legacyUid)
          : undefined;
      await ctx.db.insert(table, {
        ...documentOf<'feedback'>(row),
        userId: profile?.userId,
      });
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});

export const importAnomalies = migrationMutation({
  args: commonArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    requireBatch(args.rows, 300);
    const table = 'migrationAnomalies';
    const prior = await priorBatch(ctx, args.runId, table, args.batchIndex);
    if (prior !== undefined) return prior;
    let inserted = 0;
    let skipped = 0;
    for (const input of args.rows) {
      const row = parseRow(input);
      const document = documentOf<'migrationAnomalies'>(row);
      const duplicate = await ctx.db
        .query(table)
        .withIndex('by_legacyKey', (index) =>
          index.eq('legacyKey', document.legacyKey),
        )
        .first();
      if (
        duplicate !== null &&
        duplicate.kind === document.kind &&
        duplicate.sourcePath === document.sourcePath
      ) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert(table, document);
      inserted += 1;
    }
    return recordBatch(ctx, args.runId, table, args.batchIndex, {
      inserted,
      skipped,
      failed: 0,
    });
  },
});
