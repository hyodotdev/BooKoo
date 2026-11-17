import {v} from 'convex/values';

import type {MutationCtx} from '../_generated/server';
import {migrationMutation} from '../lib/functions';

const kindValidator = v.union(v.literal('photo'), v.literal('avatar'));

const pendingValidator = v.object({
  kind: kindValidator,
  legacyKey: v.string(),
  sourcePath: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceMd5: v.optional(v.string()),
  isBase64: v.boolean(),
  attempts: v.number(),
});

export const generateUploadUrl = migrationMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => ctx.storage.generateUploadUrl(),
});

export const nextPendingBlobs = migrationMutation({
  args: {
    kind: v.union(kindValidator, v.literal('both')),
    limit: v.number(),
  },
  returns: v.array(pendingValidator),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 50)
      throw new Error('limit must be between 1 and 50');
    const pending: {
      kind: 'photo' | 'avatar';
      legacyKey: string;
      sourcePath?: string;
      sourceUrl?: string;
      sourceMd5?: string;
      isBase64: boolean;
      attempts: number;
    }[] = [];
    if (args.kind !== 'avatar') {
      const photos = await ctx.db
        .query('itemPhotos')
        .withIndex('by_migrationState_attempts', (index) =>
          index.eq('migrationState', 'PENDING').lt('attempts', 6),
        )
        .take(args.limit);
      for (const photo of photos) {
        pending.push({
          kind: 'photo',
          legacyKey: photo.legacyKey ?? String(photo._id),
          sourcePath: photo.legacyPath,
          sourceUrl: photo.legacyUrl,
          sourceMd5: photo.legacySourceMd5,
          isBase64: photo.legacyIsBase64,
          attempts: photo.attempts,
        });
      }
    }
    if (args.kind !== 'photo' && pending.length < args.limit) {
      const avatars = await ctx.db
        .query('userProfiles')
        .withIndex('by_avatarMigrationState_avatarAttempts', (index) =>
          index.eq('avatarMigrationState', 'PENDING').lt('avatarAttempts', 6),
        )
        .take(args.limit - pending.length);
      for (const avatar of avatars) {
        pending.push({
          kind: 'avatar',
          legacyKey: avatar.legacyUid ?? String(avatar._id),
          sourcePath: avatar.avatarLegacySourcePath,
          sourceUrl: avatar.avatarLegacyUrl,
          isBase64: false,
          attempts: avatar.avatarAttempts,
        });
      }
    }
    return pending;
  },
});

export const resetFailedBlobs = migrationMutation({
  args: {
    kind: v.union(kindValidator, v.literal('both')),
    limit: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 50)
      throw new Error('limit must be between 1 and 50');
    let reset = 0;
    if (args.kind !== 'avatar') {
      const photos = await ctx.db
        .query('itemPhotos')
        .withIndex('by_migrationState_attempts', (index) =>
          index.eq('migrationState', 'FAILED'),
        )
        .take(args.limit);
      for (const photo of photos) {
        await ctx.db.patch(photo._id, {
          migrationState: 'PENDING',
          attempts: 0,
          lastError: undefined,
          updatedAt: Date.now(),
        });
        reset += 1;
      }
    }
    if (args.kind !== 'photo' && reset < args.limit) {
      const avatars = await ctx.db
        .query('userProfiles')
        .withIndex('by_avatarMigrationState_avatarAttempts', (index) =>
          index.eq('avatarMigrationState', 'FAILED'),
        )
        .take(args.limit - reset);
      for (const avatar of avatars) {
        await ctx.db.patch(avatar._id, {
          avatarMigrationState: 'PENDING',
          avatarAttempts: 0,
          avatarLastError: undefined,
          updatedAt: Date.now(),
        });
        reset += 1;
      }
    }
    return reset;
  },
});

export const attachPhotoBlob = migrationMutation({
  args: {
    legacyKey: v.string(),
    storageId: v.id('_storage'),
    thumbStorageId: v.id('_storage'),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  returns: v.union(v.literal('attached'), v.literal('already_done')),
  handler: async (ctx, args) => {
    const photo = await ctx.db
      .query('itemPhotos')
      .withIndex('by_legacyKey', (index) =>
        index.eq('legacyKey', args.legacyKey),
      )
      .unique();
    if (photo === null) throw new Error('photo not found');
    if (photo.migrationState === 'DONE') {
      await Promise.all([
        ctx.storage.delete(args.storageId),
        ctx.storage.delete(args.thumbStorageId),
      ]);
      return 'already_done' as const;
    }
    await ctx.db.patch(photo._id, {
      storageId: args.storageId,
      thumbStorageId: args.thumbStorageId,
      width: args.width,
      height: args.height,
      byteSize: args.byteSize,
      mimeType: args.mimeType,
      migrationState: 'DONE',
      attempts: photo.attempts + 1,
      lastError: undefined,
      legacyUrl: undefined,
      updatedAt: Date.now(),
    });
    return 'attached' as const;
  },
});

export const attachAvatarBlob = migrationMutation({
  args: {
    legacyUid: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.union(v.literal('attached'), v.literal('already_done')),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_legacyUid', (index) =>
        index.eq('legacyUid', args.legacyUid),
      )
      .unique();
    if (profile === null) throw new Error('avatar profile not found');
    if (profile.avatarMigrationState === 'DONE') {
      await ctx.storage.delete(args.storageId);
      return 'already_done' as const;
    }
    const publicUrl = await ctx.storage.getUrl(args.storageId);
    if (publicUrl === null) throw new Error('avatar storage URL unavailable');
    await ctx.db.patch(profile._id, {
      avatarStorageId: args.storageId,
      avatarUrl: publicUrl,
      avatarThumbUrl: publicUrl,
      avatarMigrationState: 'DONE',
      avatarAttempts: profile.avatarAttempts + 1,
      avatarLastError: undefined,
      avatarLegacyUrl: undefined,
      updatedAt: Date.now(),
    });
    return 'attached' as const;
  },
});

export const discardUploads = migrationMutation({
  args: {storageIds: v.array(v.id('_storage'))},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (args.storageIds.length > 4) throw new Error('discard batch too large');
    for (const storageId of args.storageIds)
      await ctx.storage.delete(storageId);
    return null;
  },
});

const markArgs = {
  kind: kindValidator,
  legacyKey: v.string(),
};

const markState = async (
  ctx: MutationCtx,
  args: {kind: 'photo' | 'avatar'; legacyKey: string},
  state: 'MISSING' | 'FAILED',
): Promise<null> => {
  let sourcePath: string | undefined;
  let table: 'itemPhotos' | 'userProfiles' | undefined;
  if (args.kind === 'photo') {
    const photo = await ctx.db
      .query('itemPhotos')
      .withIndex('by_legacyKey', (index) =>
        index.eq('legacyKey', args.legacyKey),
      )
      .unique();
    if (photo !== null) {
      await ctx.db.patch(photo._id, {
        migrationState: state,
        attempts: photo.attempts + 1,
        lastError: state,
        updatedAt: Date.now(),
      });
      sourcePath = photo.legacyPath;
      table = 'itemPhotos';
    }
  } else {
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_legacyUid', (index) =>
        index.eq('legacyUid', args.legacyKey),
      )
      .unique();
    if (profile !== null) {
      await ctx.db.patch(profile._id, {
        avatarMigrationState: state,
        avatarAttempts: profile.avatarAttempts + 1,
        avatarLastError: state,
        updatedAt: Date.now(),
      });
      sourcePath = profile.avatarLegacySourcePath;
      table = 'userProfiles';
    }
  }
  if (state === 'MISSING' && table !== undefined) {
    const existing = await ctx.db
      .query('migrationAnomalies')
      .withIndex('by_legacyKey', (index) =>
        index.eq('legacyKey', args.legacyKey),
      )
      .take(21);
    if (existing.length > 20) throw new Error('blob anomaly bound exceeded');
    if (
      !existing.some(
        (row) => row.kind === 'PHOTO_OBJECT_MISSING' && row.table === table,
      )
    )
      await ctx.db.insert('migrationAnomalies', {
        kind: 'PHOTO_OBJECT_MISSING',
        sourcePath: sourcePath ?? '',
        legacyKey: args.legacyKey,
        table,
        producedRow: true,
        detailJson: JSON.stringify({reason: 'MIRROR_OBJECT_UNAVAILABLE'}),
        createdAt: Date.now(),
      });
  }
  return null;
};

export const markBlobMissing = migrationMutation({
  args: markArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => markState(ctx, args, 'MISSING'),
});

export const markBlobFailed = migrationMutation({
  args: markArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => markState(ctx, args, 'FAILED'),
});
