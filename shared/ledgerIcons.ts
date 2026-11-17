/**
 * Ledger colour+icon catalog.
 *
 * Ledgers keep the six named colour tokens from `ledgers.colorKey`. The 2026
 * create/edit form also stores a Phosphor glyph in `ledgers.iconKey`. Migrated
 * rows omit `iconKey`; the client then falls back to the colour piggy asset.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. Icon names are verified against
 * cpk-ui `iconList` in `test/shared/ledgerIcons.test.ts`.
 */

import {
  EXPENSE_PRESETS,
  INCOME_PRESETS,
  categoryI18nKey,
} from './categories';

export type LedgerIconGroup = 'expense' | 'income' | 'other';

export interface LedgerIconEntry {
  readonly group: LedgerIconGroup;
  readonly i18nKey: string;
  readonly icon: string;
}

const LEDGER_OTHER_ICONS = [
  {group: 'other', i18nKey: 'icon.star', icon: 'Star'},
  {group: 'other', i18nKey: 'icon.water', icon: 'Drop'},
  {group: 'other', i18nKey: 'icon.earth', icon: 'Globe'},
  {group: 'other', i18nKey: 'icon.sun', icon: 'Sun'},
  {group: 'other', i18nKey: 'icon.tree', icon: 'Tree'},
  {group: 'other', i18nKey: 'icon.sprout', icon: 'Leaf'},
  {group: 'other', i18nKey: 'icon.pot', icon: 'Plant'},
  {group: 'other', i18nKey: 'icon.bulb', icon: 'Lightbulb'},
  {group: 'other', i18nKey: 'icon.champagne', icon: 'Champagne'},
  {group: 'other', i18nKey: 'icon.certificate', icon: 'Certificate'},
  {group: 'other', i18nKey: 'icon.robot', icon: 'Robot'},
  {group: 'other', i18nKey: 'icon.pen', icon: 'PencilSimple'},
  {group: 'other', i18nKey: 'icon.paint', icon: 'PaintBrush'},
  {group: 'other', i18nKey: 'icon.piggyBank', icon: 'PiggyBank'},
] as const satisfies readonly LedgerIconEntry[];

const presetEntries = (
  group: 'expense' | 'income',
  presets: typeof EXPENSE_PRESETS | typeof INCOME_PRESETS,
): readonly LedgerIconEntry[] =>
  presets.map((preset) => ({
    group,
    i18nKey: categoryI18nKey(preset.key),
    icon: preset.icon,
  }));

export const LEDGER_ICON_CATALOG: readonly LedgerIconEntry[] = [
  ...presetEntries('expense', EXPENSE_PRESETS),
  ...presetEntries('income', INCOME_PRESETS),
  ...LEDGER_OTHER_ICONS,
];

export const LEDGER_ICON_NAMES: readonly string[] = Array.from(
  new Set(LEDGER_ICON_CATALOG.map((entry) => entry.icon)),
);

const LEDGER_ICON_NAME_SET: ReadonlySet<string> = new Set(LEDGER_ICON_NAMES);

export const isLedgerIconName = (value: string): boolean =>
  LEDGER_ICON_NAME_SET.has(value);

export const FALLBACK_LEDGER_ICON = 'PiggyBank';

export const randomLedgerIcon = (
  exclude?: string | null,
  random: () => number = Math.random,
): string => {
  const pool =
    exclude === undefined || exclude === null
      ? LEDGER_ICON_NAMES
      : LEDGER_ICON_NAMES.filter((name) => name !== exclude);
  const list = pool.length > 0 ? pool : LEDGER_ICON_NAMES;
  return list[Math.floor(random() * list.length)] ?? FALLBACK_LEDGER_ICON;
};
