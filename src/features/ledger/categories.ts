import {i18n} from '~/utils/i18n';
import type {CategoryRow} from './types';

export function categoryDisplayName(row: CategoryRow): string {
  if (row.label !== null) return row.label;
  if (row.i18nKey !== null) return i18n.t<string>(row.i18nKey);
  return row.key;
}

/** Merge a visible kind's permutation without moving hidden/archived/other-kind slots. */
export function mergeCategoryOrder(
  all: readonly CategoryRow[],
  visible: readonly CategoryRow[],
  ordered: readonly CategoryRow[],
): string[] | null {
  const visibleKeys = new Set(visible.map((row) => row.key));
  const orderedKeys = ordered.map((row) => row.key);
  if (
    visible.length !== ordered.length ||
    new Set(orderedKeys).size !== visibleKeys.size ||
    orderedKeys.some((key) => !visibleKeys.has(key))
  )
    return null;
  let index = 0;
  const merged = all.map((row) =>
    visibleKeys.has(row.key) ? orderedKeys[index++] : row.key,
  );
  return merged.every((key, position) => key === all[position]?.key)
    ? null
    : merged;
}
