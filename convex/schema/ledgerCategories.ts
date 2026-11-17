import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {timestamps} from './common';

export const categoryKindValidator = v.union(
  v.literal('EXPENSE'),
  v.literal('INCOME'),
);
export const categorySourceValidator = v.union(
  v.literal('PRESET'),
  v.literal('CUSTOM'),
);

/**
 * COPY-ON-WRITE OVERLAY. The invariant is small enough to hold in your head:
 *   a ledger has either ZERO rows here (and uses shared/categories.ts SYSTEM_CATEGORIES verbatim),
 *   or a COMPLETE overlay set (all 34 presets) plus its customs.
 * There is no partial state.
 *
 * Why presets are code and not 34 seeded rows per ledger: 34 inserts at every ledger creation, 34 x N
 * rows of storage, a data migration every time a preset is added, and a read on the screen that
 * renders on every entry. And crucially: a preset TRANSLATION FIX (`04` §3.1 lists eight bad ones,
 * plus FURNITURE reading "home appliances" in ko/ja/zh) then ships in the app bundle and takes effect
 * everywhere at once, instead of needing a job that walks every ledger's seeded rows.
 */
export const ledgerCategoriesTable = defineTable({
  ledgerId: v.id('ledgers'),
  /** Stable identity. PRESET -> the SYSTEM_CATEGORIES slug ('meal'). CUSTOM -> `c_<8 chars>`. */
  key: v.string(),
  source: categorySourceValidator,
  kind: categoryKindValidator,
  /** A raw cpk-ui `IconName`, e.g. 'ForkKnife', semantically validated against `iconList`. NOT an
   *  asset path or array index — the legacy `CATEGORIES_ICON[iconId]` had no bounds check. */
  iconKey: v.string(),
  /** Theme colour TOKEN name, e.g. 'category.red'. Never a hex: dark mode needs two values. */
  colorToken: v.string(),
  /**
   * PRESET + undefined => render t(`category.${key}`) in the viewer's locale, re-translated on every
   * language switch. PRESET + string => the user renamed it; never re-translated.
   * CUSTOM => always a string (enforced in the mutation).
   */
  label: v.optional(v.string()),
  /** Multiples of 10 (income offset by 1000) so an insert needs no reflow. */
  sortOrder: v.number(),
  /** Hidden from the picker; still resolves on historical items. Distinct from archived. */
  hiddenAt: v.optional(v.number()),
  /** Soft-deleted. Still resolves on historical items; only the picker filters it. */
  archivedAt: v.optional(v.number()),
  /** Set while `categories.reassign` is moving this category's items; the row cannot be picked. */
  reassignJobKey: v.optional(v.string()),

  createdByUserId: v.optional(v.id('users')),
  /** Legacy CATEGORIES_ICON id 0..33. Present on PRESET rows and on customs recovered from items. */
  legacyIconId: v.optional(v.number()),
  /** The exact `category.txt` the legacy item carried, for a recovered custom. */
  legacyLabel: v.optional(v.string()),
  ...timestamps,
})
  // Picker + label map: `.eq(ledgerId).take(CATEGORY_SCAN_LIMIT /* 121 */)`, then ASSERT <=120.
  // Hidden/archived are filtered in JS only after the assertion. Zero rows => code defaults.
  .index('by_ledgerId_sortOrder', ['ledgerId', 'sortOrder'])
  // materialize() idempotence, create-custom uniqueness, and O(1) key resolution on the detail screen.
  .index('by_ledgerId_key', ['ledgerId', 'key'])
  // Migration: map a legacy `category.iconId` to this ledger's row. IDEMPOTENT re-runs.
  .index('by_ledgerId_legacyIconId', ['ledgerId', 'legacyIconId']);
