import {iconList} from 'cpk-ui/components/uis/Icon/Icon';

import {
  ALL_CATEGORY_ICON_NAMES,
  CATEGORY_COLOR_TOKENS,
  categoryI18nKey,
  categoryLabel,
  CUSTOM_ICON_NAMES,
  CUSTOM_ICON_POOL,
  EXPENSE_PRESETS,
  INCOME_PRESETS,
  isCustomCategoryKey,
  MAX_CATEGORIES_PER_LEDGER,
  PRESET_BY_KEY,
  PRESET_BY_LEGACY_ICON_ID,
  presetToResolved,
  resolvePresetCategory,
  SYSTEM_CATEGORIES,
  UNCATEGORIZED,
  UNCATEGORIZED_KEY,
} from '@shared/categories';

const ICON_NAMES: ReadonlySet<string> = new Set<string>(iconList);

/**
 * The ids below are written into `ledgerItems.categoryKey` on every device in
 * production, and `legacyIconId` is the ONLY join key the Firebase migration
 * has. This snapshot is the guard: changing one is a data-loss bug, not a
 * refactor, so it has to fail here first.
 */
const FROZEN_KEYS_BY_LEGACY_ICON_ID: Readonly<Record<number, string>> = {
  0: 'cafe',
  1: 'drink',
  2: 'snack',
  3: 'meal',
  4: 'dating',
  5: 'movie',
  6: 'pet',
  7: 'transport',
  8: 'exercise',
  9: 'wear',
  10: 'sleep',
  11: 'baby',
  12: 'gift',
  13: 'electronic',
  14: 'furniture',
  15: 'travel',
  16: 'mobileFee',
  17: 'hospital',
  18: 'walletMoney',
  19: 'salary',
  20: 'bonus',
  21: 'sellProduct',
  22: 'award',
  23: 'present',
  24: 'extra',
  25: 'car',
  26: 'culture',
  27: 'education',
  28: 'electric',
  29: 'insurance',
  30: 'maintenance',
  31: 'membership',
  32: 'stuffs',
  33: 'tax',
};

describe('the 34 presets', () => {
  it('has exactly 34 entries, 27 expense and 7 income', () => {
    expect(SYSTEM_CATEGORIES).toHaveLength(34);
    expect(EXPENSE_PRESETS).toHaveLength(27);
    expect(INCOME_PRESETS).toHaveLength(7);
  });

  it('has unique keys', () => {
    const keys = SYSTEM_CATEGORIES.map((category) => category.key);

    expect(new Set(keys).size).toBe(34);
    expect(PRESET_BY_KEY.size).toBe(34);
  });

  it('has unique legacyIconIds covering 0..33 with no gap', () => {
    const ids = SYSTEM_CATEGORIES.map((category) => category.legacyIconId);

    expect(new Set(ids).size).toBe(34);
    expect([...ids].sort((a, b) => a - b)).toEqual(
      Array.from({length: 34}, (_, index) => index),
    );
    expect(PRESET_BY_LEGACY_ICON_ID.size).toBe(34);
  });

  it('KEEPS EVERY id STABLE — this failing means a migration just broke', () => {
    for (const [legacyIconId, key] of Object.entries(
      FROZEN_KEYS_BY_LEGACY_ICON_ID,
    )) {
      expect(PRESET_BY_LEGACY_ICON_ID.get(Number(legacyIconId))?.key).toBe(key);
    }
  });

  it('has a strictly ascending sortOrder, with income in its own block', () => {
    const orders = SYSTEM_CATEGORIES.map((category) => category.sortOrder);

    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(34);

    for (const category of EXPENSE_PRESETS) {
      expect(category.sortOrder).toBeLessThan(1000);
    }

    for (const category of INCOME_PRESETS) {
      expect(category.sortOrder).toBeGreaterThan(1000);
    }
  });

  it('spaces sortOrder in multiples of 10 so a preset can be inserted later', () => {
    for (const category of SYSTEM_CATEGORIES) {
      expect(category.sortOrder % 10).toBe(0);
    }
  });

  it('carries a colour TOKEN, never a hex', () => {
    const allowedTokens: ReadonlySet<string> = new Set(CATEGORY_COLOR_TOKENS);

    for (const category of SYSTEM_CATEGORIES) {
      expect(category.colorToken).toMatch(/^category\.[a-z]+$/);
      expect(allowedTokens.has(category.colorToken)).toBe(true);
    }

    expect(CATEGORY_COLOR_TOKENS).toHaveLength(15);
    expect(new Set(CATEGORY_COLOR_TOKENS).size).toBe(15);
  });

  it('carries a unique legacy STRINGS key for the migration label lookup', () => {
    const stringKeys = SYSTEM_CATEGORIES.map(
      (category) => category.legacyStringKey,
    );

    expect(new Set(stringKeys).size).toBe(34);

    for (const key of stringKeys) expect(key).toMatch(/^[A-Z_]+$/);
  });

  it('derives the i18n key from the stable slug', () => {
    expect(categoryI18nKey('meal')).toBe('category.meal');

    for (const category of SYSTEM_CATEGORIES) {
      expect(presetToResolved(category).i18nKey).toBe(
        `category.${category.key}`,
      );
    }
  });
});

describe('icons — the cpk-ui font decision, executed', () => {
  it('ships NO image asset: every icon is a cpk-ui glyph NAME', () => {
    for (const category of SYSTEM_CATEGORIES) {
      expect(typeof category.icon).toBe('string');
      expect(category.icon).not.toMatch(/\.(png|svg|jpg)$/);
      expect(category.icon).not.toMatch(/[/:]/);
    }
  });

  it('resolves every preset icon against cpk-ui iconList', () => {
    const missing = SYSTEM_CATEGORIES.filter(
      (category) => !ICON_NAMES.has(category.icon),
    ).map((category) => `${category.key} -> ${category.icon}`);

    expect(missing).toEqual([]);
  });

  it('resolves the uncategorized fallback icon', () => {
    expect(ICON_NAMES.has(UNCATEGORIZED.icon)).toBe(true);
  });

  it('resolves every custom-pool icon', () => {
    const missing = CUSTOM_ICON_NAMES.filter((name) => !ICON_NAMES.has(name));

    expect(missing).toEqual([]);
  });

  it('has no duplicate name inside the custom pool', () => {
    expect(new Set(CUSTOM_ICON_NAMES).size).toBe(CUSTOM_ICON_NAMES.length);
    expect(Object.keys(CUSTOM_ICON_POOL).length).toBeGreaterThan(5);
  });

  it('keeps the two deliberate collisions apart', () => {
    // ELECTRONIC (appliances) must not reuse MOBILE_FEE's phone glyph.
    expect(PRESET_BY_KEY.get('electronic')?.icon).toBe('Television');
    expect(PRESET_BY_KEY.get('mobileFee')?.icon).toBe('DeviceMobile');
    // GIFT is an expense (giving); PRESENT is income (receiving).
    expect(PRESET_BY_KEY.get('gift')?.icon).toBe('Gift');
    expect(PRESET_BY_KEY.get('present')?.icon).toBe('HandHeart');
  });

  it('exposes every renderable name in one list, deduplicated', () => {
    expect(new Set(ALL_CATEGORY_ICON_NAMES).size).toBe(
      ALL_CATEGORY_ICON_NAMES.length,
    );

    for (const name of ALL_CATEGORY_ICON_NAMES) {
      expect(ICON_NAMES.has(name)).toBe(true);
    }
  });
});

describe('resolution', () => {
  it('resolves every preset key', () => {
    for (const category of SYSTEM_CATEGORIES) {
      const resolved = resolvePresetCategory(category.key);

      expect(resolved.key).toBe(category.key);
      expect(resolved.kind).toBe(category.kind);
      expect(resolved.icon).toBe(category.icon);
      expect(resolved.hidden).toBe(false);
      expect(resolved.archived).toBe(false);
    }
  });

  it('answers UNCATEGORIZED for an unknown key instead of going out of bounds', () => {
    expect(resolvePresetCategory('does-not-exist')).toBe(UNCATEGORIZED);
    expect(resolvePresetCategory('')).toBe(UNCATEGORIZED);
    expect(UNCATEGORIZED.key).toBe(UNCATEGORIZED_KEY);
    expect(UNCATEGORIZED.hidden).toBe(true);
  });

  it('prefers a literal label over the i18n key', () => {
    const t = (key: string): string => `t(${key})`;

    expect(categoryLabel(resolvePresetCategory('meal'), t)).toBe(
      't(category.meal)',
    );
    expect(
      categoryLabel({...resolvePresetCategory('meal'), label: '외식'}, t),
    ).toBe('외식');
  });

  it('recognizes a custom key', () => {
    expect(isCustomCategoryKey('c_1a2b3c4d')).toBe(true);
    expect(isCustomCategoryKey('meal')).toBe(false);
  });

  it('caps a ledger s category count so the picker query stays bounded', () => {
    expect(MAX_CATEGORIES_PER_LEDGER).toBeGreaterThan(34);
    expect(MAX_CATEGORIES_PER_LEDGER).toBeLessThanOrEqual(1000);
  });
});
