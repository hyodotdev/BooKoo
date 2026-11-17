import {
  PRESET_BY_KEY,
  SYSTEM_CATEGORIES,
  categoryI18nKey,
  type CategorySeed,
  type CategoryKind,
} from '../../shared/categories';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';
import {
  CATEGORY_SCAN_LIMIT,
  ITEM_PURGE_GRACE_MS,
  MAX_CATEGORIES_PER_LEDGER,
  RESTORABLE_TRASH_SCAN_LIMIT,
} from './constants';
import {appError} from './errors';

type ReadCtx = QueryCtx | MutationCtx;

/**
 * Archived CUSTOM rows still count toward MAX_CATEGORIES_PER_LEDGER, so a row
 * nothing can use any more is released here instead of by a cron: archived for
 * a full trash window, no live entry on it, and no entry in the restorable trash
 * on it (an entry restored and trashed again keeps an old `archivedAt`). The
 * trash read is a bounded sentinel; past its limit nothing is released.
 */
export async function releaseExpiredCustomCategories(
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  now: number,
): Promise<void> {
  const rows = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (index) =>
      index.eq('ledgerId', ledgerId),
    )
    .take(CATEGORY_SCAN_LIMIT);
  const candidates: Doc<'ledgerCategories'>[] = [];
  for (const row of rows)
    if (
      row.source === 'CUSTOM' &&
      row.archivedAt !== undefined &&
      now - row.archivedAt >= ITEM_PURGE_GRACE_MS
    )
      candidates.push(row);
  if (candidates.length === 0) return;
  // `items.restore` accepts an entry until ITEM_PURGE_GRACE_MS after deletion.
  const restorable = await ctx.db
    .query('ledgerItems')
    .withIndex('by_ledgerId_deletedAt_createdAt', (index) =>
      index.eq('ledgerId', ledgerId).gt('deletedAt', now - ITEM_PURGE_GRACE_MS),
    )
    .take(RESTORABLE_TRASH_SCAN_LIMIT + 1);
  if (restorable.length > RESTORABLE_TRASH_SCAN_LIMIT) return;
  const trashedKeys = new Set(restorable.map((item) => item.categoryKey));
  for (const row of candidates) {
    if (trashedKeys.has(row.key)) continue;
    const live = await ctx.db
      .query('ledgerItems')
      .withIndex(
        'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
        (index) =>
          index
            .eq('ledgerId', ledgerId)
            .eq('deletedAt', undefined)
            .eq('categoryKey', row.key),
      )
      .first();
    if (live === null) await ctx.db.delete(row._id);
  }
}

export interface CategoryRow {
  readonly key: string;
  readonly source: 'PRESET' | 'CUSTOM';
  readonly kind: CategoryKind;
  readonly iconKey: string;
  readonly colorToken: string;
  readonly i18nKey: string | null;
  readonly label: string | null;
  readonly sortOrder: number;
  readonly hidden: boolean;
  readonly archived: boolean;
  readonly reassigning: boolean;
}

const presetRow = (category: CategorySeed): CategoryRow => ({
  key: category.key,
  source: 'PRESET',
  kind: category.kind,
  iconKey: category.icon,
  colorToken: category.colorToken,
  i18nKey: categoryI18nKey(category.key),
  label: null,
  sortOrder: category.sortOrder,
  hidden: false,
  archived: false,
  reassigning: false,
});

export const toCategoryRow = (
  category: Doc<'ledgerCategories'>,
): CategoryRow => ({
  key: category.key,
  source: category.source,
  kind: category.kind,
  iconKey: category.iconKey,
  colorToken: category.colorToken,
  i18nKey:
    category.source === 'PRESET' && category.label === undefined
      ? categoryI18nKey(category.key)
      : null,
  label: category.label ?? null,
  sortOrder: category.sortOrder,
  hidden: category.hiddenAt !== undefined,
  archived: category.archivedAt !== undefined,
  reassigning: category.reassignJobKey !== undefined,
});

export async function listCategoryRows(
  ctx: ReadCtx,
  ledgerId: Id<'ledgers'>,
): Promise<CategoryRow[]> {
  const rows = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (index) =>
      index.eq('ledgerId', ledgerId),
    )
    .take(CATEGORY_SCAN_LIMIT);
  if (rows.length > MAX_CATEGORIES_PER_LEDGER)
    throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
  return rows.length === 0
    ? SYSTEM_CATEGORIES.map(presetRow)
    : rows.map(toCategoryRow);
}

export async function requireWritableCategory(
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  key: string,
  kind: CategoryKind,
): Promise<CategoryRow> {
  const overlay = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_key', (index) =>
      index.eq('ledgerId', ledgerId).eq('key', key),
    )
    .unique();
  if (overlay !== null) {
    if (
      overlay.kind !== kind ||
      overlay.hiddenAt !== undefined ||
      overlay.archivedAt !== undefined ||
      overlay.reassignJobKey !== undefined
    )
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    return toCategoryRow(overlay);
  }

  const anyOverlay = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (index) =>
      index.eq('ledgerId', ledgerId),
    )
    .first();
  const preset = PRESET_BY_KEY.get(key);
  if (anyOverlay !== null || preset?.kind !== kind)
    throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
  return presetRow(preset);
}
