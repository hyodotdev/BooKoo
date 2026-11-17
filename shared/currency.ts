/**
 * ISO-4217 reference data.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. No `react-native`, no `convex/*`,
 * no `expo-*`, no `node:` builtins. Compiled by three toolchains (Metro, the
 * Convex esbuild bundler, jest) and must behave identically in all three.
 *
 * Design source: `.notes/design/money-categories-i18n.md` §1.2 (exponent table
 * + supported list) and §1.4 (Intl-derived chrome, integer-derived digits).
 *
 * The one thing this module refuses to do is hand-maintain a symbol/separator
 * table as the source of truth. The legacy app did, and shipped `EUR → '$'`,
 * `ZAR → 'VND'` and `IND` (not an ISO code) to production. Decoration comes
 * from `Intl`; the `symbol` column below is an OFFLINE FALLBACK only.
 */

/** ISO-4217 alphabetic code, uppercase. Never a symbol, never a locale tag. */
export type CurrencyCode = string & {readonly __brand?: 'CurrencyCode'};

/** ISO-4217 minor-unit exponent. 4 exists only for fund/index units (CLF, UYW). */
export type CurrencyExponent = 0 | 2 | 3 | 4;

/**
 * ISO-4217 minor-unit exponents that are NOT 2.
 * Source: ISO 4217:2015 Table A.1 (list-one), current as of 2026-08.
 * Anything absent from this map is exponent 2.
 *
 * Deliberately NOT derived from `Intl`: Hermes on iOS ignores fraction-digit
 * options (facebook/hermes#812), so a derived exponent cannot be trusted on the
 * platform where correctness matters most. This table is small and stable for
 * decades — hard-code it.
 *
 * MGA/MRU stay at 2 (nominally 1/5 units, but ISO and every payment system
 * treat them as 2). HUF/TWD stay at 2 even though those markets transact in
 * whole units — "hide the decimals" is a display preference, never storage.
 */
const EXPONENT_EXCEPTIONS: Readonly<Partial<Record<string, CurrencyExponent>>> =
  {
    // ---- exponent 0 (no minor unit in circulation) ----
    BIF: 0,
    CLP: 0,
    DJF: 0,
    GNF: 0,
    ISK: 0,
    JPY: 0,
    KMF: 0,
    KRW: 0,
    PYG: 0,
    RWF: 0,
    UGX: 0,
    UYI: 0,
    VND: 0,
    VUV: 0,
    XAF: 0,
    XOF: 0,
    XPF: 0,
    // ---- exponent 3 (thousandths: dinar/rial family) ----
    BHD: 3,
    IQD: 3,
    JOD: 3,
    KWD: 3,
    LYD: 3,
    OMR: 3,
    TND: 3,
    // ---- exponent 4 (funds/index units; here so they cannot silently round) ----
    CLF: 4,
    UYW: 4,
  };

/**
 * Legacy `LedgerSettingCurrency.tsx` codes that are not usable as-is
 * (note 04 §5, design §1.9 step 4). Applied by `normalizeCurrencyCode`, so the
 * remap happens once, at the edge, and nothing downstream has to know.
 */
export const LEGACY_CURRENCY_ALIASES: Readonly<Record<string, KnownCurrency>> =
  {
    IND: 'INR', // never an ISO code; the Indian rupee is INR
    BRN: 'BND', // the Brunei dollar is BND
    GRD: 'EUR', // Greek drachma, replaced 2002
    ITL: 'EUR', // Italian lira, replaced 2002
    HRK: 'EUR', // Croatian kuna, replaced 2023
    SVC: 'USD', // El Salvador transacts in USD
  };

/** Uppercases, trims, and applies the legacy alias table. Total over all strings. */
export const normalizeCurrencyCode = (currency: CurrencyCode): string => {
  const upper = currency.trim().toUpperCase();

  return LEGACY_CURRENCY_ALIASES[upper] ?? upper;
};

export const DEFAULT_EXPONENT: CurrencyExponent = 2;

/** `10 ** exponent`, precomputed — no `Math.pow` in hot list rendering. */
export const SCALES: readonly number[] = [1, 10, 100, 1000, 10000];

/**
 * Total over every string: an unknown or malformed code answers
 * `DEFAULT_EXPONENT` rather than throwing, so a legacy row with a junk currency
 * still migrates instead of crashing the import.
 */
export const exponentOf = (currency: CurrencyCode): CurrencyExponent =>
  EXPONENT_EXCEPTIONS[normalizeCurrencyCode(currency)] ?? DEFAULT_EXPONENT;

/** Number of minor units in one major unit of `currency` (1, 100, 1000, 10000). */
export const scaleOf = (currency: CurrencyCode): number =>
  SCALES[exponentOf(currency)];

// ---------------------------------------------------------------------------
// The supported set (what the picker offers)
// ---------------------------------------------------------------------------

/**
 * Order is the picker's default order — Asia-Pacific first, because that is the
 * actual user base. Covers circulating ISO 4217 national/regional currencies.
 * Precious metals, IMF funds, and test codes stay out of the ledger picker.
 */
export const SUPPORTED_CURRENCIES = [
  // Asia-Pacific (the actual user base) — USD is pinned high for the same reason.
  'KRW',
  'JPY',
  'USD',
  'CNY',
  'TWD',
  'HKD',
  'SGD',
  'THB',
  'VND',
  'IDR',
  'MYR',
  'PHP',
  'INR',
  'AUD',
  'NZD',
  'MOP',
  'KHR',
  'LAK',
  'MMK',
  'MNT',
  'BND',
  'FJD',
  'PGK',
  'SBD',
  'TOP',
  'VUV',
  'WST',
  'KPW',
  'XPF',
  // Europe
  'EUR',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'TRY',
  'RUB',
  'UAH',
  'ISK',
  'BGN',
  'BAM',
  'BYN',
  'ALL',
  'MKD',
  'MDL',
  'GEL',
  'RSD',
  'GIP',
  'FKP',
  // Americas
  'CAD',
  'BRL',
  'MXN',
  'ARS',
  'CLP',
  'COP',
  'PEN',
  'BOB',
  'UYU',
  'PYG',
  'VES',
  'PAB',
  'NIO',
  'GTQ',
  'HNL',
  'CRC',
  'DOP',
  'HTG',
  'JMD',
  'TTD',
  'BBD',
  'BSD',
  'BZD',
  'BMD',
  'KYD',
  'AWG',
  'ANG',
  'XCD',
  'GYD',
  'SRD',
  'CUP',
  // Middle East / Africa
  'AED',
  'SAR',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'JOD',
  'ILS',
  'EGP',
  'MAD',
  'TND',
  'DZD',
  'LYD',
  'IQD',
  'IRR',
  'YER',
  'LBP',
  'SYP',
  'ZAR',
  'NGN',
  'KES',
  'TZS',
  'UGX',
  'GHS',
  'ETB',
  'XOF',
  'XAF',
  'AOA',
  'BIF',
  'BWP',
  'CDF',
  'CVE',
  'DJF',
  'ERN',
  'GMD',
  'GNF',
  'LRD',
  'LSL',
  'MGA',
  'MRU',
  'MUR',
  'MWK',
  'MZN',
  'NAD',
  'RWF',
  'SCR',
  'SDG',
  'SLE',
  'SOS',
  'SSP',
  'STN',
  'SZL',
  'ZMW',
  'ZWG',
  'SHP',
  'KMF',
  // South / Central Asia
  'NPR',
  'BDT',
  'PKR',
  'LKR',
  'KZT',
  'UZS',
  'AMD',
  'AFN',
  'AZN',
  'KGS',
  'TJS',
  'TMT',
  'BTN',
  'MVR',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Live ISO codes the legacy picker offered that are NOT in the new supported
 * set (note 04 §5). They are not shown in the picker, but they are *known*:
 * an imported legacy ledger whose currency is one of these keeps working, with
 * a correct exponent and a correct symbol fallback, instead of degrading to a
 * bare code. Dead legacy codes are remapped instead — see `LEGACY_CURRENCY_ALIASES`.
 */
/**
 * Former picker exclusions. Every circulating ISO code is now offered, so this
 * list is empty; imported legacy rows still resolve through `SUPPORTED_CURRENCIES`
 * and `LEGACY_CURRENCY_ALIASES`.
 */
export const LEGACY_ONLY_CURRENCIES = [] as const;

export type LegacyOnlyCurrency = (typeof LEGACY_ONLY_CURRENCIES)[number];

/** Every code this app has first-class metadata for. */
export type KnownCurrency = SupportedCurrency | LegacyOnlyCurrency;

export type CurrencyRegion =
  'APAC' | 'EUROPE' | 'AMERICAS' | 'MEA' | 'SOUTH_ASIA';

export interface CurrencyInfo {
  readonly code: KnownCurrency;
  readonly exponent: CurrencyExponent;
  /**
   * OFFLINE FALLBACK ONLY. `currencyChrome()` prefers `Intl`, which is
   * locale-aware and always right; this value is what we render when `Intl` is
   * missing or throws, so a KRW row reads `₩12,000` and not `KRW12,000`.
   */
  readonly symbol: string;
  /** i18n key for the localized display name. Falls back to the code. */
  readonly nameKey: `currency.${KnownCurrency}`;
  /** Grouping header in the picker. */
  readonly region: CurrencyRegion;
  /** `false` for the legacy-only codes: known, but not offered in the picker. */
  readonly supported: boolean;
}

interface CurrencyRow {
  readonly symbol: string;
  readonly region: CurrencyRegion;
}

const CURRENCY_ROWS: Readonly<Record<KnownCurrency, CurrencyRow>> = {
  // --- Asia-Pacific ---
  KRW: {symbol: '₩', region: 'APAC'},
  JPY: {symbol: '¥', region: 'APAC'},
  CNY: {symbol: '¥', region: 'APAC'},
  TWD: {symbol: 'NT$', region: 'APAC'},
  HKD: {symbol: 'HK$', region: 'APAC'},
  SGD: {symbol: 'S$', region: 'APAC'},
  THB: {symbol: '฿', region: 'APAC'},
  VND: {symbol: '₫', region: 'APAC'},
  IDR: {symbol: 'Rp', region: 'APAC'},
  MYR: {symbol: 'RM', region: 'APAC'},
  PHP: {symbol: '₱', region: 'APAC'},
  AUD: {symbol: 'A$', region: 'APAC'},
  NZD: {symbol: 'NZ$', region: 'APAC'},
  BND: {symbol: 'B$', region: 'APAC'},
  MOP: {symbol: 'MOP$', region: 'APAC'},
  KHR: {symbol: '៛', region: 'APAC'},
  LAK: {symbol: '₭', region: 'APAC'},
  MMK: {symbol: 'K', region: 'APAC'},
  MNT: {symbol: '₮', region: 'APAC'},
  FJD: {symbol: 'FJ$', region: 'APAC'},
  PGK: {symbol: 'K', region: 'APAC'},
  SBD: {symbol: 'SI$', region: 'APAC'},
  TOP: {symbol: 'T$', region: 'APAC'},
  VUV: {symbol: 'VT', region: 'APAC'},
  WST: {symbol: 'WS$', region: 'APAC'},
  KPW: {symbol: '₩', region: 'APAC'},
  XPF: {symbol: '₣', region: 'APAC'},
  // --- Europe ---
  EUR: {symbol: '€', region: 'EUROPE'},
  GBP: {symbol: '£', region: 'EUROPE'},
  CHF: {symbol: 'CHF', region: 'EUROPE'},
  SEK: {symbol: 'kr', region: 'EUROPE'},
  NOK: {symbol: 'kr', region: 'EUROPE'},
  DKK: {symbol: 'kr', region: 'EUROPE'},
  PLN: {symbol: 'zł', region: 'EUROPE'},
  CZK: {symbol: 'Kč', region: 'EUROPE'},
  HUF: {symbol: 'Ft', region: 'EUROPE'},
  RON: {symbol: 'lei', region: 'EUROPE'},
  TRY: {symbol: '₺', region: 'EUROPE'},
  RUB: {symbol: '₽', region: 'EUROPE'},
  UAH: {symbol: '₴', region: 'EUROPE'},
  ISK: {symbol: 'kr', region: 'EUROPE'},
  BAM: {symbol: 'KM', region: 'EUROPE'},
  BGN: {symbol: 'лв', region: 'EUROPE'},
  BYN: {symbol: 'Br', region: 'EUROPE'},
  ALL: {symbol: 'L', region: 'EUROPE'},
  MKD: {symbol: 'ден', region: 'EUROPE'},
  MDL: {symbol: 'L', region: 'EUROPE'},
  GEL: {symbol: '₾', region: 'EUROPE'},
  RSD: {symbol: 'дин', region: 'EUROPE'},
  GIP: {symbol: '£', region: 'EUROPE'},
  FKP: {symbol: '£', region: 'EUROPE'},
  // --- Americas ---
  USD: {symbol: '$', region: 'AMERICAS'},
  CAD: {symbol: 'C$', region: 'AMERICAS'},
  BRL: {symbol: 'R$', region: 'AMERICAS'},
  ARS: {symbol: '$', region: 'AMERICAS'},
  CLP: {symbol: '$', region: 'AMERICAS'},
  COP: {symbol: '$', region: 'AMERICAS'},
  MXN: {symbol: '$', region: 'AMERICAS'},
  PEN: {symbol: 'S/', region: 'AMERICAS'},
  BOB: {symbol: 'Bs', region: 'AMERICAS'},
  BZD: {symbol: 'BZ$', region: 'AMERICAS'},
  CRC: {symbol: '₡', region: 'AMERICAS'},
  DOP: {symbol: 'RD$', region: 'AMERICAS'},
  GTQ: {symbol: 'Q', region: 'AMERICAS'},
  HNL: {symbol: 'L', region: 'AMERICAS'},
  UYU: {symbol: '$U', region: 'AMERICAS'},
  PYG: {symbol: '₲', region: 'AMERICAS'},
  VES: {symbol: 'Bs.', region: 'AMERICAS'},
  PAB: {symbol: 'B/.', region: 'AMERICAS'},
  NIO: {symbol: 'C$', region: 'AMERICAS'},
  HTG: {symbol: 'G', region: 'AMERICAS'},
  JMD: {symbol: 'J$', region: 'AMERICAS'},
  TTD: {symbol: 'TT$', region: 'AMERICAS'},
  BBD: {symbol: 'Bds$', region: 'AMERICAS'},
  BSD: {symbol: 'B$', region: 'AMERICAS'},
  BMD: {symbol: 'BD$', region: 'AMERICAS'},
  KYD: {symbol: 'CI$', region: 'AMERICAS'},
  AWG: {symbol: 'ƒ', region: 'AMERICAS'},
  ANG: {symbol: 'ƒ', region: 'AMERICAS'},
  XCD: {symbol: 'EC$', region: 'AMERICAS'},
  GYD: {symbol: 'G$', region: 'AMERICAS'},
  SRD: {symbol: '$', region: 'AMERICAS'},
  CUP: {symbol: '$', region: 'AMERICAS'},
  // --- Middle East / Africa ---
  AED: {symbol: 'د.إ', region: 'MEA'},
  SAR: {symbol: '﷼', region: 'MEA'},
  ILS: {symbol: '₪', region: 'MEA'},
  ZAR: {symbol: 'R', region: 'MEA'},
  EGP: {symbol: 'E£', region: 'MEA'},
  NGN: {symbol: '₦', region: 'MEA'},
  QAR: {symbol: '﷼', region: 'MEA'},
  KWD: {symbol: 'KD', region: 'MEA'},
  BHD: {symbol: 'BD', region: 'MEA'},
  OMR: {symbol: 'ر.ع.', region: 'MEA'},
  JOD: {symbol: 'JD', region: 'MEA'},
  SOS: {symbol: 'Sh', region: 'MEA'},
  SYP: {symbol: '£S', region: 'MEA'},
  MAD: {symbol: 'DH', region: 'MEA'},
  TND: {symbol: 'DT', region: 'MEA'},
  DZD: {symbol: 'DA', region: 'MEA'},
  LYD: {symbol: 'LD', region: 'MEA'},
  IQD: {symbol: 'ع.د', region: 'MEA'},
  IRR: {symbol: '﷼', region: 'MEA'},
  YER: {symbol: '﷼', region: 'MEA'},
  LBP: {symbol: 'ل.ل', region: 'MEA'},
  KES: {symbol: 'KSh', region: 'MEA'},
  TZS: {symbol: 'TSh', region: 'MEA'},
  UGX: {symbol: 'USh', region: 'MEA'},
  GHS: {symbol: 'GH₵', region: 'MEA'},
  ETB: {symbol: 'Br', region: 'MEA'},
  XOF: {symbol: 'CFA', region: 'MEA'},
  XAF: {symbol: 'FCFA', region: 'MEA'},
  AOA: {symbol: 'Kz', region: 'MEA'},
  BIF: {symbol: 'FBu', region: 'MEA'},
  BWP: {symbol: 'P', region: 'MEA'},
  CDF: {symbol: 'FC', region: 'MEA'},
  CVE: {symbol: '$', region: 'MEA'},
  DJF: {symbol: 'Fdj', region: 'MEA'},
  ERN: {symbol: 'Nfk', region: 'MEA'},
  GMD: {symbol: 'D', region: 'MEA'},
  GNF: {symbol: 'FG', region: 'MEA'},
  LRD: {symbol: 'L$', region: 'MEA'},
  LSL: {symbol: 'L', region: 'MEA'},
  MGA: {symbol: 'Ar', region: 'MEA'},
  MRU: {symbol: 'UM', region: 'MEA'},
  MUR: {symbol: '₨', region: 'MEA'},
  MWK: {symbol: 'MK', region: 'MEA'},
  MZN: {symbol: 'MT', region: 'MEA'},
  NAD: {symbol: 'N$', region: 'MEA'},
  RWF: {symbol: 'FRw', region: 'MEA'},
  SCR: {symbol: '₨', region: 'MEA'},
  SDG: {symbol: '£', region: 'MEA'},
  SLE: {symbol: 'Le', region: 'MEA'},
  SSP: {symbol: '£', region: 'MEA'},
  STN: {symbol: 'Db', region: 'MEA'},
  SZL: {symbol: 'E', region: 'MEA'},
  ZMW: {symbol: 'K', region: 'MEA'},
  ZWG: {symbol: 'ZiG', region: 'MEA'},
  SHP: {symbol: '£', region: 'MEA'},
  KMF: {symbol: 'CF', region: 'MEA'},
  // --- South / Central Asia ---
  INR: {symbol: '₹', region: 'SOUTH_ASIA'},
  NPR: {symbol: 'Rs', region: 'SOUTH_ASIA'},
  BDT: {symbol: '৳', region: 'SOUTH_ASIA'},
  PKR: {symbol: '₨', region: 'SOUTH_ASIA'},
  LKR: {symbol: 'Rs', region: 'SOUTH_ASIA'},
  KZT: {symbol: '₸', region: 'SOUTH_ASIA'},
  UZS: {symbol: "so'm", region: 'SOUTH_ASIA'},
  AMD: {symbol: '֏', region: 'SOUTH_ASIA'},
  AFN: {symbol: '؋', region: 'SOUTH_ASIA'},
  AZN: {symbol: '₼', region: 'SOUTH_ASIA'},
  KGS: {symbol: 'сом', region: 'SOUTH_ASIA'},
  TJS: {symbol: 'SM', region: 'SOUTH_ASIA'},
  TMT: {symbol: 'm', region: 'SOUTH_ASIA'},
  BTN: {symbol: 'Nu.', region: 'SOUTH_ASIA'},
  MVR: {symbol: 'Rf', region: 'SOUTH_ASIA'},
};

const toInfo = (code: KnownCurrency, supported: boolean): CurrencyInfo => {
  const row = CURRENCY_ROWS[code];

  return {
    code,
    exponent: exponentOf(code),
    symbol: row.symbol,
    nameKey: `currency.${code}`,
    region: row.region,
    supported,
  };
};

/** Every known currency: the supported picker set first, then the legacy-only tail. */
export const CURRENCIES: readonly CurrencyInfo[] = [
  ...SUPPORTED_CURRENCIES.map((code) => toInfo(code, true)),
  ...LEGACY_ONLY_CURRENCIES.map((code) => toInfo(code, false)),
];

const CURRENCY_BY_CODE: ReadonlyMap<string, CurrencyInfo> = new Map(
  CURRENCIES.map((info) => [info.code, info]),
);

export const currencyInfo = (
  currency: CurrencyCode,
): CurrencyInfo | undefined =>
  CURRENCY_BY_CODE.get(normalizeCurrencyCode(currency));

export const isKnownCurrency = (
  currency: CurrencyCode,
): currency is KnownCurrency =>
  CURRENCY_BY_CODE.has(normalizeCurrencyCode(currency));

export const isSupportedCurrency = (
  currency: CurrencyCode,
): currency is SupportedCurrency => currencyInfo(currency)?.supported === true;

/** i18n key for a currency's display name; falls back to the raw code. */
export const currencyNameKey = (currency: CurrencyCode): string =>
  currencyInfo(currency)?.nameKey ??
  `currency.${normalizeCurrencyCode(currency)}`;

/**
 * Offline symbol. Prefer `currencyChrome(locale, code).symbol` at render time —
 * this is the value that seeds the fallback when `Intl` is unavailable.
 */
export const currencySymbolFallback = (currency: CurrencyCode): string =>
  currencyInfo(currency)?.symbol ?? normalizeCurrencyCode(currency);

/** Picker grouping. Order within a region follows `SUPPORTED_CURRENCIES`. */
export const supportedCurrenciesByRegion = (): ReadonlyMap<
  CurrencyRegion,
  readonly CurrencyInfo[]
> => {
  const grouped = new Map<CurrencyRegion, CurrencyInfo[]>();

  for (const info of CURRENCIES) {
    if (!info.supported) continue;

    const bucket = grouped.get(info.region);

    if (bucket) bucket.push(info);
    else grouped.set(info.region, [info]);
  }

  return grouped;
};

// ---------------------------------------------------------------------------
// Intl capability probe (design §1.4)
// ---------------------------------------------------------------------------

export interface IntlCaps {
  numberFormat: boolean;
  formatToParts: boolean;
  /** Informational only — the formatter never relies on fraction-digit options. */
  fractionDigitsHonored: boolean;
  /** Required by `shared/date.ts`; false means the client skips optimistic bucketing. */
  timeZone: boolean;
}

let cachedCaps: IntlCaps | undefined;

/**
 * Lazily memoized, NOT run at module load — `shared/AGENTS.md` forbids
 * module-level side effects, and a probe that runs on import would also run
 * inside the Convex isolate on every cold start for no reason.
 */
export const intlCaps = (): IntlCaps => {
  if (cachedCaps) return cachedCaps;

  const caps: IntlCaps = {
    numberFormat: false,
    formatToParts: false,
    fractionDigitsHonored: false,
    timeZone: false,
  };

  if (typeof Intl === 'undefined' || typeof Intl.NumberFormat !== 'function') {
    cachedCaps = caps;

    return caps;
  }

  caps.numberFormat = true;

  try {
    const nf = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Hermes/iOS ignores these options and yields '1,234.5' instead of '1,234.50'.
    caps.fractionDigitsHonored = nf.format(1234.5) === '1,234.50';
    caps.formatToParts =
      typeof nf.formatToParts === 'function' && nf.formatToParts(1).length > 0;
  } catch {
    /* leave false */
  }

  try {
    caps.timeZone =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        hour: 'numeric',
      }).format(0) !== '';
  } catch {
    /* leave false */
  }

  cachedCaps = caps;

  return caps;
};

/** Test-only escape hatch: forget the memoized probe result. */
export const resetIntlCapsCache = (): void => {
  cachedCaps = undefined;
};

// ---------------------------------------------------------------------------
// Currency chrome (design §1.4)
// ---------------------------------------------------------------------------

/**
 * Everything `Intl` is trusted for: the *decoration* around the digits.
 * The digits themselves are produced by integer arithmetic in `money.ts`.
 */
export interface CurrencyChrome {
  /** '₩', '$', 'BD', '¥' */
  symbol: string;
  /** '₩1,000' vs '1 000 ₽' */
  symbolBefore: boolean;
  /** '1 000 ₽' has a space between the number and the symbol */
  symbolSpaced: boolean;
  /** ',' | '.' | ' ' (U+00A0) | "'" */
  group: string;
  /** '.' | ',' */
  decimal: string;
  /** '-₩1,000' vs '₩-1,000' */
  minusBefore: boolean;
}

const chromeCache = new Map<string, CurrencyChrome>();

export interface LocaleSeparators {
  group: string;
  decimal: string;
}

const separatorCache = new Map<string, LocaleSeparators>();

/**
 * Sentinel for the SEPARATOR probe. Five integer digits, not four: CLDR gives
 * `minimumGroupingDigits: 2` to pl, es, it, pt-PT, hu, lv, et and bg, so those
 * locales do NOT group `1234` and a 4-digit sentinel yields no `group` part at
 * all. Two fraction digits so the `decimal` part is always present.
 */
const SEPARATOR_SENTINEL = -11234.56;

const ASCII_SEPARATORS: LocaleSeparators = {group: ',', decimal: '.'};

/**
 * The locale's grouping and decimal separators, taken from its PLAIN number
 * format and memoized per locale.
 *
 * Deliberately NOT read off the currency-styled formatter, which gets both
 * wrong in ways that corrupt output:
 *
 * - an exponent-0 currency (KRW/JPY/VND/…) renders no fraction at all, so the
 *   `decimal` part is absent and the old code fell back to `'.'` — wrong in
 *   every comma-decimal locale, including `id`, which this app ships;
 * - a locale with `minimumGroupingDigits: 2` renders `-1234,56` for the old
 *   4-digit sentinel, so the `group` part is absent and the old code fell back
 *   to `','` — which in those very locales IS the decimal separator, and
 *   `formatMoney` then printed `-1,234,56 zł`.
 */
export const localeSeparators = (locale: string): LocaleSeparators => {
  const hit = separatorCache.get(locale);

  if (hit) return hit;

  let seps: LocaleSeparators = ASCII_SEPARATORS;

  if (intlCaps().numberFormat) {
    try {
      const nf = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      });

      if (intlCaps().formatToParts) {
        const parts = nf.formatToParts(SEPARATOR_SENTINEL);

        seps = {
          group:
            parts.find((part) => part.type === 'group')?.value ??
            ASCII_SEPARATORS.group,
          decimal:
            parts.find((part) => part.type === 'decimal')?.value ??
            ASCII_SEPARATORS.decimal,
        };
      } else {
        // No symbol to confuse things here: strip digits and the sign and what
        // is left is `[group, decimal]` in order.
        const found = nf
          .format(SEPARATOR_SENTINEL)
          .replace(/[\d٠-٩۰-۹−+-]/g, '');

        if (found.length >= 2) {
          seps = {group: found[0], decimal: found[found.length - 1]};
        } else if (found.length === 1) {
          seps = {
            group: found[0] === '.' ? ',' : '.',
            decimal: found[0],
          };
        }
      }
    } catch {
      /* keep the ASCII fallback */
    }
  }

  separatorCache.set(locale, seps);

  return seps;
};

/**
 * Derived ONCE per (locale, currency) and memoized. Never call `Intl` inside a
 * list row: constructing an `Intl.NumberFormat` per row is a measurable Hermes
 * cost, and the legacy list called `Number.toLocaleString` per row.
 *
 * The cache is a pure memo — same inputs, same output, no observable effect.
 */
export const currencyChrome = (
  locale: string,
  currency: CurrencyCode,
): CurrencyChrome => {
  const code = normalizeCurrencyCode(currency);
  const cacheKey = `${locale}|${code}`;
  const hit = chromeCache.get(cacheKey);

  if (hit) return hit;

  // Separators come from the locale, never from the currency — see
  // `localeSeparators`.
  const {group, decimal} = localeSeparators(locale);

  let chrome: CurrencyChrome = {
    symbol: currencySymbolFallback(code),
    symbolBefore: true,
    symbolSpaced: false,
    group,
    decimal,
    minusBefore: true,
  };

  if (intlCaps().numberFormat) {
    try {
      const nf = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
      });
      // Sentinel: every part appears exactly once and unambiguously — the
      // integer part crosses a group boundary, the fraction is non-zero, the
      // value is negative.
      const SENTINEL = -1234.56;

      if (intlCaps().formatToParts) {
        const parts = nf.formatToParts(SENTINEL);
        const at = (type: string): number =>
          parts.findIndex((part) => part.type === type);
        const symIdx = at('currency');
        const intIdx = at('integer');
        const minusIdx = at('minusSign');
        // Start of the rendered body = whichever of the symbol and the digits
        // comes first. `Math.max` was wrong: de-CH/fr-CH/nl-NL render
        // `CHF-1'234.56` (symbol, THEN minus), and comparing against the
        // integer index called that "minus first" and printed `-CHF1'234.56`.
        const bodyStart = Math.min(
          symIdx >= 0 ? symIdx : Number.POSITIVE_INFINITY,
          intIdx >= 0 ? intIdx : Number.POSITIVE_INFINITY,
        );

        chrome = {
          symbol: parts[symIdx]?.value ?? code,
          symbolBefore: symIdx >= 0 && intIdx >= 0 ? symIdx < intIdx : true,
          symbolSpaced: parts.some(
            (part) => part.type === 'literal' && /\s/.test(part.value),
          ),
          group,
          decimal,
          minusBefore: minusIdx >= 0 && minusIdx < bodyStart,
        };
      } else {
        // `formatToParts` unavailable (older iOS Hermes shims): parse the
        // sentinel string positionally. '-₩1,235' / '-1.234,56 €'
        const formatted = nf.format(SENTINEL);
        const digits =
          formatted.match(
            /[\d\u0660-\u0669][\d\u0660-\u0669\s.,'\u2019]*[\d\u0660-\u0669]/,
          )?.[0] ?? '';
        const firstDigit = formatted.indexOf(digits[0] ?? '0');
        const symbol = (
          formatted.slice(0, firstDigit) +
          formatted.slice(firstDigit + digits.length)
        )
          .replace(/[-\u2212]/g, '')
          .trim();

        chrome = {
          symbol: symbol || code,
          symbolBefore:
            firstDigit > 0 && formatted.indexOf(symbol) < firstDigit,
          symbolSpaced: /\s/.test(formatted),
          group,
          decimal,
          minusBefore:
            formatted.trimStart().startsWith('-') ||
            formatted.trimStart().startsWith('\u2212'),
        };
      }
    } catch {
      /* keep the offline fallback */
    }
  }

  chromeCache.set(cacheKey, chrome);

  return chrome;
};

/** Test-only escape hatch: forget every memoized chrome and separator pair. */
export const resetCurrencyChromeCache = (): void => {
  chromeCache.clear();
  separatorCache.clear();
};
