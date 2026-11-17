import {
  ALL_CATEGORY_ICON_NAMES,
  CATEGORY_COLOR_TOKENS,
  SYSTEM_CATEGORIES,
  categoryNameInput,
  isValidCategoryName,
  type CategoryKind,
} from '../../shared/categories';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {CATEGORY_SCAN_LIMIT, MAX_CATEGORIES_PER_LEDGER} from './constants';
import {appError} from './errors';

export async function materializeCategories(
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  userId: Id<'users'>,
  now: number,
): Promise<void> {
  const rows = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (index) =>
      index.eq('ledgerId', ledgerId),
    )
    .take(CATEGORY_SCAN_LIMIT);
  if (rows.length > MAX_CATEGORIES_PER_LEDGER)
    throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
  if (rows.length > 0) {
    const keys = new Set(rows.map((row) => row.key));
    if (!SYSTEM_CATEGORIES.every((preset) => keys.has(preset.key)))
      throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
    return;
  }
  for (const category of SYSTEM_CATEGORIES)
    await ctx.db.insert('ledgerCategories', {
      ledgerId,
      key: category.key,
      source: 'PRESET',
      kind: category.kind,
      iconKey: category.icon,
      colorToken: category.colorToken,
      sortOrder: category.sortOrder,
      createdByUserId: userId,
      legacyIconId: category.legacyIconId,
      createdAt: now,
      updatedAt: now,
    });
}

export const validateCategoryLabel = (value: string): string => {
  // Older installed clients still send spaces. Normalize at the write boundary
  // as the new editor does, without rewriting existing stored/preset labels.
  const label = categoryNameInput(value);
  if (!isValidCategoryName(label))
    throw appError('CATEGORY_INVALID', 'error.categoryLabel');
  return label;
};

/** Name-only callers retain their API; identity changes are one atomic patch. */
export function categoryIdentityPatch(
  category: Pick<
    Doc<'ledgerCategories'>,
    'source' | 'label' | 'archivedAt' | 'reassignJobKey'
  >,
  args: {label?: string; iconKey?: string; colorToken?: string},
): Pick<Doc<'ledgerCategories'>, 'label'> & {
  iconKey?: string;
  colorToken?: string;
} {
  if (
    category.archivedAt !== undefined ||
    category.reassignJobKey !== undefined ||
    (args.iconKey !== undefined &&
      !ALL_CATEGORY_ICON_NAMES.includes(args.iconKey)) ||
    (args.colorToken !== undefined &&
      !CATEGORY_COLOR_TOKENS.some((token) => token === args.colorToken))
  )
    throw appError('CATEGORY_INVALID', 'error.categoryInvalid');
  if (category.source === 'CUSTOM' && args.label === undefined)
    throw appError('CATEGORY_INVALID', 'error.categoryLabel');
  return {
    label:
      args.label === undefined
        ? undefined
        : args.label === category.label
          ? category.label
          : validateCategoryLabel(args.label),
    ...(args.iconKey === undefined ? {} : {iconKey: args.iconKey}),
    ...(args.colorToken === undefined ? {} : {colorToken: args.colorToken}),
  };
}

export async function nextCategorySortOrder(
  ctx: MutationCtx,
  ledgerId: Id<'ledgers'>,
  kind: CategoryKind,
): Promise<number> {
  const rows = await ctx.db
    .query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (index) =>
      index.eq('ledgerId', ledgerId),
    )
    .take(CATEGORY_SCAN_LIMIT);
  if (rows.length >= MAX_CATEGORIES_PER_LEDGER)
    throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
  const current = rows
    .filter((row) => row.kind === kind)
    .reduce(
      (maximum, row) => Math.max(maximum, row.sortOrder),
      kind === 'INCOME' ? 1000 : 0,
    );
  return current + 10;
}
