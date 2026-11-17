/**
 * The 34-entry preset category taxonomy.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. This array is what the Convex seed
 * inserts and what the app renders, so it is imported by both, unchanged.
 *
 * Design sources:
 * - `.notes/design/money-categories-i18n.md` §2.2 (copy-on-write overlay model),
 *   §2.3 (the 34 presets), §2.6 (legacy migration), §2.7 (corrected translations)
 * - `.notes/design/category-icons.md` — the AUTHORITATIVE icon decision. It
 *   supersedes §2.4 of the money doc: icons are cpk-ui's bundled Phosphor icon
 *   font, NOT re-traced SVGs and NOT the legacy PNGs. Nothing here references an
 *   image asset; `icon` is a glyph NAME.
 *
 * ============================================================================
 * `key` AND `legacyIconId` ARE STABLE FOREVER. DO NOT RENAME OR RENUMBER THEM.
 * ============================================================================
 *
 * `key` is written verbatim into `ledgerItems.categoryKey` and into every
 * `ledgerCategories` overlay row, on every device, in production. Renaming one
 * orphans every historical entry that carries it — those entries would resolve
 * to `UNCATEGORIZED` and their rollup buckets would silently split in two.
 *
 * `legacyIconId` is the legacy `item.category.iconId` and is the ONLY join key
 * the Firebase migration has: the legacy app had no server-side category table
 * at all, so `(iconId, txt)` on the item is the entire surviving record of what
 * a user's categories were.
 *
 * Safe changes:  add a new preset (new key, new sortOrder, `legacyIconId: -1`).
 * Unsafe changes: rename a key, reuse a key, change a `legacyIconId`.
 * To retire a preset, hide it in the picker — never delete the entry.
 */

export type CategoryKind = 'EXPENSE' | 'INCOME';

export const CATEGORY_LABEL_MAX_LENGTH = 40;

/** Only applies to names the user enters; never rewrites existing/preset labels. */
export function categoryNameInput(value: string): string {
  return value.replace(/\s/gu, '');
}

export function isValidCategoryName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= CATEGORY_LABEL_MAX_LENGTH &&
    value === categoryNameInput(value)
  );
}

/**
 * Stable data tokens used by presets/overlays. The client resolves them through
 * `src/theme/chartPalette.ts`; they are not a fifth cpk theme bucket.
 */
export const CATEGORY_COLOR_TOKENS = [
  'category.red',
  'category.brown',
  'category.orange',
  'category.purple',
  'category.blue',
  'category.navy',
  'category.teal',
  'category.green',
  'category.yellow',
  'category.slate',
  'category.pink',
  'category.grey',
  'category.indigo',
  'category.lime',
  'category.sky',
] as const;

export type CategoryColorToken = (typeof CATEGORY_COLOR_TOKENS)[number];

/**
 * A cpk-ui icon glyph name. cpk-ui bundles 3,771 Phosphor icons in `cpk.ttf`,
 * already registered by `app.config.ts`, so a category icon costs zero new
 * binary assets, inherits `color`/`size` from props (correct in light mode,
 * dark mode, and against a ledger accent colour), and stays crisp on a tablet.
 *
 * The union is derived from the array below rather than imported from `cpk-ui`
 * on purpose: `shared/` must not import a react-native package, or the Convex
 * bundle drags in the whole UI library. `test/shared/categories.test.ts` checks
 * every name against cpk-ui's real `iconList`, which is the same guarantee
 * enforced one layer out.
 */
export type CategoryIconName = (typeof SYSTEM_CATEGORIES)[number]['icon'];

export interface CategorySeed {
  /** Stable slug. Also the i18n key suffix: `t('category.' + key)`. NEVER renamed. */
  readonly key: string;
  readonly kind: CategoryKind;
  /** cpk-ui icon glyph name. Rendered as `<Icon name={icon} />`. */
  readonly icon: string;
  /** Data colour token; resolved per light/dark by the app chart palette. Never a hex. */
  readonly colorToken: CategoryColorToken;
  /** Legacy `Data.ts` CATEGORIES_ICON id, 0..33. The migration join key. NEVER changed. */
  readonly legacyIconId: number;
  /** Legacy `STRINGS.js` flat key — consumed by `scripts/convert-legacy-strings.mjs`. */
  readonly legacyStringKey: string;
  /** Legacy raster basename under `BooKooLegacy/assets/icons/`. Provenance only — NOT shipped. */
  readonly legacyAsset: string;
  /** Picker order. Multiples of 10, +1000 offset for income, so presets can be inserted later. */
  readonly sortOrder: number;
}

/**
 * Two icon collisions were resolved deliberately:
 * - 13 `electronic` uses `Television` (not `DeviceMobile`) so it does not
 *   collide with 16 `mobileFee`. `electronic` is 가전 (appliances); `mobileFee`
 *   is the phone bill.
 * - 23 `present` uses `HandHeart` (not `Gift`) so it does not collide with 12
 *   `gift`. `gift` is an EXPENSE (giving); `present` is INCOME (receiving).
 *
 * The ORDER differs from the legacy taxonomy on purpose. Legacy had
 * `sortOrder === legacyIconId`, which dropped the whole income block (18–24)
 * into the middle of the expense list and appended 25–33 after it because those
 * shipped in a later update. Expenses are now grouped by frequency of use in a
 * Korean shared ledger — food, transport, fixed bills, then discretionary —
 * and income has its own block. `legacyIconId` is preserved, so the reorder
 * costs the migration nothing.
 */
export const SYSTEM_CATEGORIES = [
  // ---------- EXPENSE (27) ----------
  {
    key: 'meal',
    kind: 'EXPENSE',
    icon: 'ForkKnife',
    colorToken: 'category.red',
    legacyIconId: 3,
    legacyStringKey: 'MEAL',
    legacyAsset: 'categoryMeal',
    sortOrder: 10,
  },
  {
    key: 'cafe',
    kind: 'EXPENSE',
    icon: 'Coffee',
    colorToken: 'category.brown',
    legacyIconId: 0,
    legacyStringKey: 'CAFE',
    legacyAsset: 'categoryCafe',
    sortOrder: 20,
  },
  {
    key: 'snack',
    kind: 'EXPENSE',
    icon: 'Cookie',
    colorToken: 'category.orange',
    legacyIconId: 2,
    legacyStringKey: 'SNACK',
    legacyAsset: 'categorySnack',
    sortOrder: 30,
  },
  {
    key: 'drink',
    kind: 'EXPENSE',
    icon: 'BeerBottle',
    colorToken: 'category.purple',
    legacyIconId: 1,
    legacyStringKey: 'DRINK',
    legacyAsset: 'categoryDrink',
    sortOrder: 40,
  },
  {
    key: 'transport',
    kind: 'EXPENSE',
    icon: 'Bus',
    colorToken: 'category.blue',
    legacyIconId: 7,
    legacyStringKey: 'TRANSPORT',
    legacyAsset: 'categoryTransport',
    sortOrder: 50,
  },
  {
    key: 'car',
    kind: 'EXPENSE',
    icon: 'Car',
    colorToken: 'category.navy',
    legacyIconId: 25,
    legacyStringKey: 'CAR',
    legacyAsset: 'categoryCar',
    sortOrder: 60,
  },
  {
    key: 'mobileFee',
    kind: 'EXPENSE',
    icon: 'DeviceMobile',
    colorToken: 'category.teal',
    legacyIconId: 16,
    legacyStringKey: 'MOBILE_FEE',
    legacyAsset: 'categoryMobileFee',
    sortOrder: 70,
  },
  {
    key: 'electric',
    kind: 'EXPENSE',
    icon: 'Lightning',
    colorToken: 'category.yellow',
    legacyIconId: 28,
    legacyStringKey: 'ELECTRIC',
    legacyAsset: 'categoryElectric',
    sortOrder: 80,
  },
  {
    key: 'maintenance',
    kind: 'EXPENSE',
    icon: 'Wrench',
    colorToken: 'category.slate',
    legacyIconId: 30,
    legacyStringKey: 'MAINTENANCE',
    legacyAsset: 'categoryMaintenance',
    sortOrder: 90,
  },
  {
    key: 'wear',
    kind: 'EXPENSE',
    icon: 'TShirt',
    colorToken: 'category.pink',
    legacyIconId: 9,
    legacyStringKey: 'WEAR',
    legacyAsset: 'categoryWear',
    sortOrder: 100,
  },
  {
    key: 'stuffs',
    kind: 'EXPENSE',
    icon: 'Basket',
    colorToken: 'category.grey',
    legacyIconId: 32,
    legacyStringKey: 'STUFFS',
    legacyAsset: 'categoryStuffs',
    sortOrder: 110,
  },
  {
    key: 'electronic',
    kind: 'EXPENSE',
    icon: 'Television',
    colorToken: 'category.indigo',
    legacyIconId: 13,
    legacyStringKey: 'ELECTRONIC',
    legacyAsset: 'categoryElectronic',
    sortOrder: 120,
  },
  {
    key: 'furniture',
    kind: 'EXPENSE',
    icon: 'Couch',
    colorToken: 'category.brown',
    legacyIconId: 14,
    legacyStringKey: 'FURNITURE',
    legacyAsset: 'categoryFurniture',
    sortOrder: 130,
  },
  {
    key: 'hospital',
    kind: 'EXPENSE',
    icon: 'FirstAid',
    colorToken: 'category.red',
    legacyIconId: 17,
    legacyStringKey: 'HOSPITAL',
    legacyAsset: 'categoryHospital',
    sortOrder: 140,
  },
  {
    key: 'insurance',
    kind: 'EXPENSE',
    icon: 'ShieldCheck',
    colorToken: 'category.green',
    legacyIconId: 29,
    legacyStringKey: 'INSURANCE',
    legacyAsset: 'categoryInsurance',
    sortOrder: 150,
  },
  {
    key: 'education',
    kind: 'EXPENSE',
    icon: 'GraduationCap',
    colorToken: 'category.blue',
    legacyIconId: 27,
    legacyStringKey: 'EDUCATION',
    legacyAsset: 'categoryEducation',
    sortOrder: 160,
  },
  {
    key: 'culture',
    kind: 'EXPENSE',
    icon: 'Ticket',
    colorToken: 'category.purple',
    legacyIconId: 26,
    legacyStringKey: 'CULTURE',
    legacyAsset: 'categoryCulture',
    sortOrder: 170,
  },
  {
    key: 'movie',
    kind: 'EXPENSE',
    icon: 'FilmSlate',
    colorToken: 'category.indigo',
    legacyIconId: 5,
    legacyStringKey: 'MOVIE',
    legacyAsset: 'categoryMovie',
    sortOrder: 180,
  },
  {
    key: 'exercise',
    kind: 'EXPENSE',
    icon: 'Barbell',
    colorToken: 'category.lime',
    legacyIconId: 8,
    legacyStringKey: 'EXERCISE',
    legacyAsset: 'categoryExercise',
    sortOrder: 190,
  },
  {
    key: 'membership',
    kind: 'EXPENSE',
    icon: 'IdentificationCard',
    colorToken: 'category.teal',
    legacyIconId: 31,
    legacyStringKey: 'MEMBERSHIP',
    legacyAsset: 'categoryMembership',
    sortOrder: 200,
  },
  {
    key: 'travel',
    kind: 'EXPENSE',
    icon: 'Airplane',
    colorToken: 'category.sky',
    legacyIconId: 15,
    legacyStringKey: 'TRAVEL',
    legacyAsset: 'categoryTravel',
    sortOrder: 210,
  },
  {
    key: 'sleep',
    kind: 'EXPENSE',
    icon: 'Bed',
    colorToken: 'category.navy',
    legacyIconId: 10,
    legacyStringKey: 'SLEEP',
    legacyAsset: 'categorySleep',
    sortOrder: 220,
  },
  {
    key: 'dating',
    kind: 'EXPENSE',
    icon: 'Heart',
    colorToken: 'category.pink',
    legacyIconId: 4,
    legacyStringKey: 'DATING',
    legacyAsset: 'categoryDate',
    sortOrder: 230,
  },
  {
    key: 'gift',
    kind: 'EXPENSE',
    icon: 'Gift',
    colorToken: 'category.red',
    legacyIconId: 12,
    legacyStringKey: 'GIFT',
    legacyAsset: 'categoryGift',
    sortOrder: 240,
  },
  {
    key: 'baby',
    kind: 'EXPENSE',
    icon: 'Baby',
    colorToken: 'category.sky',
    legacyIconId: 11,
    legacyStringKey: 'BABY',
    legacyAsset: 'categoryBaby',
    sortOrder: 250,
  },
  {
    key: 'pet',
    kind: 'EXPENSE',
    icon: 'Dog',
    colorToken: 'category.orange',
    legacyIconId: 6,
    legacyStringKey: 'PET',
    legacyAsset: 'categoryPet',
    sortOrder: 260,
  },
  {
    key: 'tax',
    kind: 'EXPENSE',
    icon: 'Receipt',
    colorToken: 'category.slate',
    legacyIconId: 33,
    legacyStringKey: 'TAX',
    legacyAsset: 'categoryTax',
    sortOrder: 270,
  },

  // ---------- INCOME (7) ----------
  {
    key: 'salary',
    kind: 'INCOME',
    icon: 'Money',
    colorToken: 'category.green',
    legacyIconId: 19,
    legacyStringKey: 'SALARY',
    legacyAsset: 'categorySalary',
    sortOrder: 1010,
  },
  {
    key: 'bonus',
    kind: 'INCOME',
    icon: 'Trophy',
    colorToken: 'category.lime',
    legacyIconId: 20,
    legacyStringKey: 'BONUS',
    legacyAsset: 'categoryBonus',
    sortOrder: 1020,
  },
  {
    key: 'walletMoney',
    kind: 'INCOME',
    icon: 'Wallet',
    colorToken: 'category.teal',
    legacyIconId: 18,
    legacyStringKey: 'WALLET_MONEY',
    legacyAsset: 'categoryWallet',
    sortOrder: 1030,
  },
  {
    key: 'sellProduct',
    kind: 'INCOME',
    icon: 'Storefront',
    colorToken: 'category.blue',
    legacyIconId: 21,
    legacyStringKey: 'SELL_PRODUCT',
    legacyAsset: 'categoryProduct',
    sortOrder: 1040,
  },
  {
    key: 'award',
    kind: 'INCOME',
    icon: 'Medal',
    colorToken: 'category.yellow',
    legacyIconId: 22,
    legacyStringKey: 'AWARD',
    legacyAsset: 'categoryAward',
    sortOrder: 1050,
  },
  {
    key: 'present',
    kind: 'INCOME',
    icon: 'HandHeart',
    colorToken: 'category.pink',
    legacyIconId: 23,
    legacyStringKey: 'PRESENT',
    legacyAsset: 'categoryPresent',
    sortOrder: 1060,
  },
  {
    key: 'extra',
    kind: 'INCOME',
    icon: 'DotsThreeCircle',
    colorToken: 'category.grey',
    legacyIconId: 24,
    legacyStringKey: 'EXTRA',
    legacyAsset: 'categoryExtra',
    sortOrder: 1070,
  },
] as const satisfies readonly CategorySeed[];

export type CategoryKey = (typeof SYSTEM_CATEGORIES)[number]['key'];

/** The terminal fallback. Never offered in the picker; always resolves. */
export const UNCATEGORIZED_KEY = 'uncategorized';

export const EXPENSE_PRESETS: readonly CategorySeed[] =
  SYSTEM_CATEGORIES.filter((category) => category.kind === 'EXPENSE');

export const INCOME_PRESETS: readonly CategorySeed[] = SYSTEM_CATEGORIES.filter(
  (category) => category.kind === 'INCOME',
);

export const PRESET_BY_KEY: ReadonlyMap<string, CategorySeed> = new Map(
  SYSTEM_CATEGORIES.map((category) => [category.key, category]),
);

/** The migration's only join: legacy `item.category.iconId` -> preset. */
export const PRESET_BY_LEGACY_ICON_ID: ReadonlyMap<number, CategorySeed> =
  new Map(
    SYSTEM_CATEGORIES.map((category) => [category.legacyIconId, category]),
  );

/** A ledger's category count is capped so the picker query stays bounded. */
export const MAX_CATEGORIES_PER_LEDGER = 120;

// ---------------------------------------------------------------------------
// Resolution (design §2.2)
// ---------------------------------------------------------------------------

export interface ResolvedCategory {
  key: string;
  kind: CategoryKind;
  icon: string;
  colorToken: CategoryColorToken;
  /** i18n key for presets; `undefined` when `label` is set. */
  i18nKey?: string;
  /** Literal label for customs and renamed presets. Never translated. */
  label?: string;
  sortOrder: number;
  hidden: boolean;
  archived: boolean;
}

/**
 * Legacy bug 3 is closed structurally: an unknown key resolves HERE, and the
 * icon renderer takes a NAME, not an array index. There is no index to go out
 * of bounds, which is what the legacy `CATEGORIES_ICON[iconId]` lookup did.
 */
export const UNCATEGORIZED: ResolvedCategory = {
  key: UNCATEGORIZED_KEY,
  kind: 'EXPENSE',
  icon: 'Question',
  colorToken: 'category.grey',
  i18nKey: `category.${UNCATEGORIZED_KEY}`,
  sortOrder: 999_999,
  hidden: true,
  archived: false,
};

/** i18n key for a preset label: `categoryI18nKey('meal') === 'category.meal'`. */
export const categoryI18nKey = (key: string): string => `category.${key}`;

export const presetToResolved = (seed: CategorySeed): ResolvedCategory => ({
  key: seed.key,
  kind: seed.kind,
  icon: seed.icon,
  colorToken: seed.colorToken,
  i18nKey: categoryI18nKey(seed.key),
  sortOrder: seed.sortOrder,
  hidden: false,
  archived: false,
});

/**
 * The zero-read fast path: a brand-new ledger has no `ledgerCategories` rows at
 * all and renders straight from this array. Rows only exist once a member
 * reorders, hides, renames or adds something (copy-on-write, design §2.2).
 */
export const resolvePresetCategory = (key: string): ResolvedCategory => {
  const seed = PRESET_BY_KEY.get(key);

  return seed ? presetToResolved(seed) : UNCATEGORIZED;
};

/**
 * The label a row renders. `t` is the typed translator from `src/STRINGS.ts`;
 * it is passed in rather than imported, because `shared/` must not depend on
 * i18n-js (it does not exist in the Convex isolate).
 */
export const categoryLabel = (
  category: ResolvedCategory,
  t: (key: string) => string,
): string =>
  category.label ?? (category.i18nKey ? t(category.i18nKey) : category.key);

/** Custom-category keys are `c_` + a stable hash of `(legacyIconId, txt)`. */
export const isCustomCategoryKey = (key: string): boolean =>
  key.startsWith('c_');

// ---------------------------------------------------------------------------
// Custom-category icon pool (design §2.4)
// ---------------------------------------------------------------------------

/**
 * The allowlist offered when a member creates a custom category ("Golf").
 * All names verified against cpk-ui's `iconList` (3,771 entries) — the same
 * test that checks the 34 presets checks this pool, so a typo fails CI rather
 * than rendering an empty box on someone's phone.
 */
export const CUSTOM_ICON_POOL: Readonly<Record<string, readonly string[]>> = {
  food: [
    'ForkKnife',
    'Coffee',
    'BeerBottle',
    'Cookie',
    'Pizza',
    'Hamburger',
    'IceCream',
    'Wine',
    'Martini',
    'Champagne',
    'BowlFood',
    'Popcorn',
    'Carrot',
    'Fish',
    'Egg',
    'Cake',
  ],
  transport: [
    'Bus',
    'Car',
    'Train',
    'Airplane',
    'Bicycle',
    'Motorcycle',
    'Taxi',
    'Boat',
    'GasPump',
    'Scooter',
    'Truck',
  ],
  home: [
    'House',
    'Buildings',
    'Bed',
    'Couch',
    'Lamp',
    'Toilet',
    'Bathtub',
    'Broom',
    'Plug',
    'Key',
    'Door',
    'Drop',
    'Fire',
    'Recycle',
    'Trash',
  ],
  shopping: [
    'ShoppingCart',
    'ShoppingBag',
    'Basket',
    'Tag',
    'Storefront',
    'CreditCard',
    'Wallet',
    'Money',
    'Bank',
    'PiggyBank',
    'Receipt',
    'Coins',
    'CurrencyCircleDollar',
    'Barcode',
    'Package',
  ],
  leisure: [
    'FilmSlate',
    'MusicNotes',
    'GameController',
    'Television',
    'Headphones',
    'Guitar',
    'Camera',
    'BookOpen',
    'Book',
    'PaintBrush',
    'Palette',
    'Confetti',
    'Ticket',
    'MaskHappy',
    'Newspaper',
  ],
  health: [
    'FirstAid',
    'Pill',
    'Heartbeat',
    'Tooth',
    'Eyeglasses',
    'Stethoscope',
    'Syringe',
    'Bandaids',
    'Wheelchair',
    'Flask',
  ],
  sport: [
    'Barbell',
    'SoccerBall',
    'PersonSimpleRun',
    'PersonSimpleBike',
    'SwimmingPool',
    'Mountains',
    'Tent',
    'Campfire',
  ],
  education: [
    'GraduationCap',
    'Student',
    'Notebook',
    'PencilSimple',
    'Backpack',
    'Certificate',
    'Printer',
  ],
  living: [
    'Dog',
    'Cat',
    'PawPrint',
    'Bird',
    'Plant',
    'Flower',
    'Tree',
    'Leaf',
    'Baby',
    'Balloon',
    'TShirt',
    'Sneaker',
    'Watch',
    'Sunglasses',
    'Scissors',
  ],
  work: [
    'Briefcase',
    'Suitcase',
    'Handshake',
    'Users',
    'UserCircle',
    'Calendar',
    'Clock',
    'MapPin',
    'Globe',
    'ChartLine',
    'PhoneCall',
    'EnvelopeSimple',
    'IdentificationCard',
    'Note',
    'Laptop',
    'Desktop',
    'DeviceMobile',
    'WifiHigh',
    'SimCard',
    'Cloud',
  ],
  other: [
    'Toolbox',
    'Wrench',
    'Hammer',
    'ShieldCheck',
    'Umbrella',
    'Gift',
    'HandHeart',
    'Heart',
    'Star',
    'Trophy',
    'Medal',
    'Crown',
    'Sparkle',
    'Lightning',
    'Church',
    'Cross',
    'HandsPraying',
    'DotsThreeCircle',
    'Question',
  ],
};

/** Flat view of `CUSTOM_ICON_POOL`, for validation and search. */
export const CUSTOM_ICON_NAMES: readonly string[] =
  Object.values(CUSTOM_ICON_POOL).flat();

/** Every icon name this module can ever ask cpk-ui to render. */
export const ALL_CATEGORY_ICON_NAMES: readonly string[] = Array.from(
  new Set([
    ...SYSTEM_CATEGORIES.map((category) => category.icon),
    UNCATEGORIZED.icon,
    ...CUSTOM_ICON_NAMES,
  ]),
);
