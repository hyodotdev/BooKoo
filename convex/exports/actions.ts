'use node';

import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {v} from 'convex/values';

import {toRfc4180Csv, zipSingleStoredFile} from '../../shared/exportFiles';
import {internal} from '../_generated/api';
import {internalAction} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {requireScheduledExportAction} from '../lib/exportPermissions';
import {DATA_EXPORT_FILE_MAX_BYTES} from '../lib/constants';

const PAGE_SIZE = 250;

interface ExportSourcePage {
  readonly json: string;
  readonly count: number;
  readonly isDone: boolean;
  readonly continueCursor: string;
  readonly photos: readonly {
    readonly id: Id<'itemPhotos'>;
    readonly storageId: Id<'_storage'>;
    readonly mediaType: string;
  }[];
}

interface PersonalSourcePage {
  readonly json: string;
  readonly count: number;
  readonly isDone: boolean;
  readonly continueCursor: string;
}

const extensionFor = (mediaType: string): string => {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
};

export const build = internalAction({
  args: {
    exportId: v.id('dataExports'),
    jobId: v.id('maintenanceJobs'),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireScheduledExportAction(ctx, args.exportId);
    try {
      await ctx.runMutation(internal.exports.worker.start, args);
      const header = await ctx.runQuery(internal.exports.internal.header, {
        exportId: args.exportId,
      });
      const manifest: {
        fileName: string;
        byteSize: number;
        sha256: string;
      }[] = [];
      const recordBytes = async (
        fileName: string,
        mediaType: string,
        bytes: Uint8Array,
        phase: string,
      ): Promise<void> => {
        const ownedBytes = Uint8Array.from(bytes);
        const blob = new Blob([ownedBytes.buffer], {type: mediaType});
        const storageId = await ctx.storage.store(blob);
        const digest = bytesToHex(sha256(bytes));
        try {
          await ctx.runMutation(internal.exports.worker.recordFile, {
            ...args,
            fileName,
            mediaType,
            storageId,
            byteSize: bytes.byteLength,
            sha256: digest,
            phase,
          });
          manifest.push({fileName, byteSize: bytes.byteLength, sha256: digest});
        } catch (error) {
          await ctx.storage.delete(storageId);
          throw error;
        }
      };
      const encoder = new TextEncoder();
      await recordBytes(
        'account.json',
        'application/json; charset=utf-8',
        encoder.encode(header.json),
        'header',
      );
      await recordBytes(
        'account.csv',
        'text/csv; charset=utf-8',
        encoder.encode(toRfc4180Csv(header.json)),
        'header',
      );
      if (header.kind === 'PERSONAL') {
        const personalSources = [
          'accounts',
          'authAudit',
          'notifications',
          'feedback',
        ] as const;
        for (const source of personalSources) {
          let cursor: string | null = null;
          let pageNumber = 0;
          do {
            const page: PersonalSourcePage = await ctx.runQuery(
              internal.exports.internal.personalSourcePage,
              {
                exportId: args.exportId,
                source,
                paginationOpts: {cursor, numItems: PAGE_SIZE},
              },
            );
            if (page.count > 0) {
              const baseName = `personal-${source}-${String(pageNumber).padStart(4, '0')}`;
              await recordBytes(
                `${baseName}.json`,
                'application/json; charset=utf-8',
                encoder.encode(page.json),
                source,
              );
              await recordBytes(
                `${baseName}.csv`,
                'text/csv; charset=utf-8',
                encoder.encode(toRfc4180Csv(page.json)),
                source,
              );
            }
            cursor = page.isDone ? null : page.continueCursor;
            pageNumber += 1;
          } while (cursor !== null);
        }
        const legalKinds = [
          'TERMS_ACCEPTED',
          'PRIVACY_NOTICE_ACKNOWLEDGED',
          'AGE_14_PLUS_ATTESTED',
          'OPTIONAL_LOCATION_GRANTED',
          'OPTIONAL_LOCATION_WITHDRAWN',
          'OPTIONAL_MARKETING_GRANTED',
          'OPTIONAL_MARKETING_WITHDRAWN',
          'OPTIONAL_COUNTRY_ANALYTICS_GRANTED',
          'OPTIONAL_COUNTRY_ANALYTICS_WITHDRAWN',
        ] as const;
        for (const legalKind of legalKinds) {
          let cursor: string | null = null;
          let pageNumber = 0;
          do {
            const page: PersonalSourcePage = await ctx.runQuery(
              internal.exports.internal.personalSourcePage,
              {
                exportId: args.exportId,
                source: 'legal',
                legalKind,
                paginationOpts: {cursor, numItems: PAGE_SIZE},
              },
            );
            if (page.count > 0) {
              const baseName = `personal-legal-${legalKind}-${String(pageNumber).padStart(4, '0')}`;
              await recordBytes(
                `${baseName}.json`,
                'application/json; charset=utf-8',
                encoder.encode(page.json),
                'legal',
              );
              await recordBytes(
                `${baseName}.csv`,
                'text/csv; charset=utf-8',
                encoder.encode(toRfc4180Csv(page.json)),
                'legal',
              );
            }
            cursor = page.isDone ? null : page.continueCursor;
            pageNumber += 1;
          } while (cursor !== null);
        }
      }
      const sources = [
        'categories',
        'members',
        'items',
        'comments',
        'photos',
      ] as const;
      for (const ledgerId of header.ledgerIds) {
        for (const source of sources) {
          let cursor: string | null = null;
          let pageNumber = 0;
          do {
            const page: ExportSourcePage = await ctx.runQuery(
              internal.exports.internal.sourcePage,
              {
                exportId: args.exportId,
                ledgerId,
                source,
                paginationOpts: {cursor, numItems: PAGE_SIZE},
              },
            );
            if (page.count > 0) {
              const baseName = `${String(ledgerId)}-${source}-${String(pageNumber).padStart(4, '0')}`;
              await recordBytes(
                `${baseName}.json`,
                'application/json; charset=utf-8',
                encoder.encode(page.json),
                source,
              );
              await recordBytes(
                `${baseName}.csv`,
                'text/csv; charset=utf-8',
                encoder.encode(toRfc4180Csv(page.json)),
                source,
              );
              for (const photo of page.photos) {
                const blob = await ctx.storage.get(photo.storageId);
                if (blob === null) throw new Error('EXPORT_SOURCE_MISSING');
                const extension = extensionFor(photo.mediaType);
                const archive = zipSingleStoredFile(
                  `photos/${photo.id}.${extension}`,
                  new Uint8Array(await blob.arrayBuffer()),
                );
                if (archive.byteLength > DATA_EXPORT_FILE_MAX_BYTES)
                  throw new Error('EXPORT_PHOTO_TOO_LARGE');
                await recordBytes(
                  `${String(ledgerId)}-photo-${photo.id}.zip`,
                  'application/zip',
                  archive,
                  'photos',
                );
              }
            }
            cursor = page.isDone ? null : page.continueCursor;
            pageNumber += 1;
          } while (cursor !== null);
        }
      }
      await recordBytes(
        'manifest.json',
        'application/json; charset=utf-8',
        encoder.encode(
          JSON.stringify({
            schemaVersion: 1,
            exportId: String(args.exportId),
            formats: ['json', 'csv', 'zip'],
            omissions: [],
            files: manifest,
          }),
        ),
        'manifest',
      );
      await ctx.runMutation(internal.exports.worker.complete, args);
    } catch (error) {
      const failedCode =
        error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
          ? error.message
          : 'EXPORT_FAILED';
      await ctx.runMutation(internal.exports.worker.fail, {
        ...args,
        failedCode,
      });
    }
    return null;
  },
});
