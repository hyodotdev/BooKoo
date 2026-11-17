/**
 * The money model: integer minor units + an ISO-4217 code.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. Imported unchanged by the Expo
 * bundle, the Convex isolate and jest, and every function here must produce a
 * byte-identical answer in all three.
 *
 * Design source: `.notes/design/money-categories-i18n.md` §1.1–§1.7.
 *
 * The two rules everything else follows from:
 *
 * 1. `amountMinor` is an INTEGER count of the currency's minor unit. No float
 *    ever touches a stored amount. The only non-integer in the module is the
 *    intermediate of an FX conversion, which is rounded immediately.
 * 2. `Intl` supplies the *decoration* (symbol, separators, symbol position);
 *    the *digits and the rounding* are computed here with integer arithmetic.
 *    Hermes on iOS ignores fraction-digit options (facebook/hermes#812), so a
 *    formatter that delegates digits to `Intl` is wrong on the platform where
 *    it matters most.
 */

import {
  currencyChrome,
  exponentOf,
  SCALES,
  type CurrencyCode,
} from './currency';

/**
 * An amount of money.
 * KRW 12,000 -> {amountMinor: 12000, currency: 'KRW'}  (exponent 0)
 * USD 12.34  -> {amountMinor: 1234,  currency: 'USD'}  (exponent 2)
 * BHD 1.234  -> {amountMinor: 1234,  currency: 'BHD'}  (exponent 3)
 */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

/**
 * The classification. `amountMinor` carries the MAGNITUDE and is normally
 * positive; the sign never encodes the type.
 *
 * Why not the legacy "signed amount, no type field":
 * - `by_ledger_type_occurredAt` makes "all income this year" one index range.
 *   `sign < 0` is not expressible as an index range, and `.filter()` is banned
 *   on `ledgerItems`.
 * - `TRANSFER` has no sign — a move between two of the ledger's own accounts is
 *   neither income nor expense, and must be excluded from both rollup buckets.
 * - A negative `amountMinor` stays meaningful: it is a refund on an EXPENSE (or
 *   a clawback on an INCOME), entered through an explicit toggle, never by
 *   typing a minus. A €20 refund on a €50 grocery expense reduces the groceries
 *   bucket to €30 instead of polluting income.
 */
export type EntryType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/** Display cash flow without discarding refund/clawback provenance. */
export function entryCashFlowMinor(
  type: EntryType,
  amountMinor: number,
): number {
  return type === 'EXPENSE' ? -amountMinor : amountMinor;
}

/** Rejected on write: a zero-amount entry is pointless, so we do not store one. */
export const MIN_AMOUNT_MINOR_ABS = 1;

/**
 * Hard ceiling on |amountMinor|. Well inside `Number.MAX_SAFE_INTEGER`
 * (9.007e15) so that sums of many rows stay exact; the assertion exists to
 * catch float drift, not to model an economy.
 */
export const MAX_AMOUNT_MINOR_ABS = 1e15;

/** Shared error codes, thrown as `Error(code)` so both runtimes can map them. */
export type MoneyErrorCode =
  | 'error.amountNotInteger'
  | 'error.amountZero'
  | 'error.amountTooLarge'
  | 'error.currencyMismatch';

export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode) {
    super(code);
    this.name = 'MoneyError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/**
 * Half away from zero. `Math.round` is half-up toward +∞
 * (`Math.round(-0.5) === -0`), which biases negative amounts.
 *
 * Half-away-from-zero, not banker's rounding, on purpose: a user splitting
 * 1000 three ways expects 333/333/334, and half-even produces results people
 * report as bugs. Banker's rounding is right for accounting systems that must
 * not accumulate bias over millions of rows; a shared ledger is not that.
 */
export const roundHalfAwayFromZero = (value: number): number =>
  value < 0 ? -Math.round(-value) : Math.round(value);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const isValidAmountMinor = (amountMinor: number): boolean =>
  Number.isSafeInteger(amountMinor) &&
  amountMinor !== 0 &&
  Math.abs(amountMinor) <= MAX_AMOUNT_MINOR_ABS;

/** Called on every write, on the client for feedback and on the server as the gate. */
export const assertValidAmount = (money: Money): void => {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new MoneyError('error.amountNotInteger');
  }

  if (money.amountMinor === 0) throw new MoneyError('error.amountZero');

  if (Math.abs(money.amountMinor) > MAX_AMOUNT_MINOR_ABS) {
    throw new MoneyError('error.amountTooLarge');
  }
};

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

const assertSameCurrency = (a: Money, b: Money): void => {
  if (a.currency !== b.currency) throw new MoneyError('error.currencyMismatch');
};

const assertSafeResult = (value: number): number => {
  if (!Number.isSafeInteger(value))
    throw new MoneyError('error.amountTooLarge');

  return value;
};

/** Exact integer addition. Throws on a currency mismatch — never silently sums apples and pears. */
export const addMoney = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b);

  return {
    amountMinor: assertSafeResult(a.amountMinor + b.amountMinor),
    currency: a.currency,
  };
};

export const subtractMoney = (a: Money, b: Money): Money => {
  assertSameCurrency(a, b);

  return {
    amountMinor: assertSafeResult(a.amountMinor - b.amountMinor),
    currency: a.currency,
  };
};

export const negateMoney = (money: Money): Money => ({
  amountMinor: -money.amountMinor,
  currency: money.currency,
});

export const absMoney = (money: Money): Money => ({
  amountMinor: Math.abs(money.amountMinor),
  currency: money.currency,
});

export const isZeroMoney = (money: Money): boolean => money.amountMinor === 0;

/** Sums same-currency amounts exactly. An empty list answers zero in `currency`. */
export const sumMoney = (
  amounts: readonly Money[],
  currency: CurrencyCode,
): Money =>
  amounts.reduce<Money>((acc, next) => addMoney(acc, next), {
    amountMinor: 0,
    currency,
  });

/**
 * The signed contribution of an entry to a rollup bucket. `TRANSFER` contributes
 * to neither expense nor income — it only moves an accountId — which is exactly
 * what a sign-only representation cannot express.
 *
 * `sign` is +1 when the entry is being added and -1 when it is being removed,
 * so an edit emits a subtract-then-add pair with no `Math.abs` anywhere.
 */
export const rollupDelta = (
  type: EntryType,
  baseAmountMinor: number,
  sign: 1 | -1 = 1,
): {expenseMinor: number; incomeMinor: number} => ({
  expenseMinor: type === 'EXPENSE' ? sign * baseAmountMinor : 0,
  incomeMinor: type === 'INCOME' ? sign * baseAmountMinor : 0,
});

// ---------------------------------------------------------------------------
// Major <-> minor
// ---------------------------------------------------------------------------

/**
 * Minor units as a major-unit float. LOSSY by construction — use it for charts
 * and FX math, never to store or compare an amount.
 */
export const toMajorUnits = (money: Money): number =>
  money.amountMinor / SCALES[exponentOf(money.currency)];

/**
 * A major-unit number (a chart tick, a legacy `realAmount`) as minor units,
 * rounded half away from zero. Returns `undefined` for a non-finite input or an
 * out-of-range result rather than guessing — the legacy migration writes those
 * rows to `migrationIssues` instead of inventing a number.
 */
export const fromMajorUnits = (
  major: number,
  currency: CurrencyCode,
): number | undefined => {
  if (!Number.isFinite(major)) return undefined;

  const minor = roundHalfAwayFromZero(major * SCALES[exponentOf(currency)]);

  return Number.isSafeInteger(minor) ? minor : undefined;
};

// ---------------------------------------------------------------------------
// FX conversion (design §1.6)
// ---------------------------------------------------------------------------

/**
 * `fxRateMicros = round(base major units per 1 quote major unit * 1e6)`.
 *   KRW per 1 JPY = 9.38     -> 9_380_000
 *   KRW per 1 USD = 1356.20  -> 1_356_200_000
 *   VND per 1 USD = 25_400   -> 25_400_000_000
 * An integer with a documented scale, because a float rate round-tripping
 * through JSON invites `0.1 + 0.2` drift.
 */
export const FX_SCALE = 1_000_000;

const SAFE_PRODUCT = Number.MAX_SAFE_INTEGER;

/**
 * Converts `amountMinor` of `from` into minor units of `to`.
 *
 * The exponent difference is applied explicitly, so JPY->BHD (0 -> 3) and
 * BHD->KRW (3 -> 0) are both correct:
 *   minorTo = amountMinor * fxRateMicros * 10^(expTo - expFrom) / 1e6
 *
 * Prefer `convertMinorSafe` at call sites; this is the direct form, kept
 * separate so the safe branch is visible and testable.
 */
export const convertMinor = (
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxRateMicros: number,
): number => {
  const shift = Math.pow(10, exponentOf(to) - exponentOf(from));

  return roundHalfAwayFromZero((amountMinor * fxRateMicros * shift) / FX_SCALE);
};

/**
 * Same conversion, overflow-aware. The largest realistic product
 * (`1e9 minor * 2.6e10 micros`) exceeds 2^53, so above the threshold we divide
 * first. Precision loss is then bounded by 1e-6 relative — sub-minor-unit for
 * any ledger transaction — and stays deterministic across platforms.
 */
export const convertMinorSafe = (
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxRateMicros: number,
): number => {
  const shift = Math.pow(10, exponentOf(to) - exponentOf(from));

  if (Math.abs(amountMinor) * Math.abs(fxRateMicros) * shift <= SAFE_PRODUCT) {
    return convertMinor(amountMinor, from, to, fxRateMicros);
  }

  return roundHalfAwayFromZero(amountMinor * shift * (fxRateMicros / FX_SCALE));
};

/** `convertMinorSafe`, wrapped so the currency travels with the number. */
export const convertMoney = (
  money: Money,
  to: CurrencyCode,
  fxRateMicros: number,
): Money => ({
  amountMinor: convertMinorSafe(
    money.amountMinor,
    money.currency,
    to,
    fxRateMicros,
  ),
  currency: to,
});

// ---------------------------------------------------------------------------
// Formatting (design §1.4)
// ---------------------------------------------------------------------------

export interface FormatMoneyOptions {
  /** Hide the symbol (compact rows where the ledger currency is implied). */
  omitSymbol?: boolean;
  /** Hide the fraction even for exponent > 0 (a user preference, JPY-style USD). */
  omitFraction?: boolean;
  /** '+' in front of positive values. Used for income rows and deltas. */
  alwaysSign?: boolean;
  /** Render the magnitude; the caller draws the sign with colour. */
  absolute?: boolean;
}

/** Groups an integer digit string in 3s. `group` may itself be a space. */
const groupDigits = (digits: string, group: string): string => {
  if (group === '') return digits;

  let out = '';

  for (let index = 0; index < digits.length; index++) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += group;

    out += digits[index];
  }

  return out;
};

/**
 * Splits |amountMinor| into a grouped integer string and an exact fraction
 * string. Both operands of the subtraction are integers, so the fraction is
 * exact — no float remainder, on any platform.
 */
const splitMinor = (
  amountMinor: number,
  exponent: number,
  group: string,
): {int: string; frac: string} => {
  const abs = Math.abs(amountMinor);
  const scale = SCALES[exponent];
  const intPart = Math.floor(abs / scale);
  const fracPart = abs - intPart * scale;

  return {
    int: groupDigits(String(intPart), group),
    frac: exponent === 0 ? '' : String(fracPart).padStart(exponent, '0'),
  };
};

/**
 * After the first call per (locale, currency) this is pure string work with
 * zero `Intl` allocations: a FlashList row rendering 60 amounts does 60
 * `Math.floor` calls, not 60 `Intl.NumberFormat` constructions.
 */
export const formatMoney = (
  money: Money,
  locale: string,
  opts: FormatMoneyOptions = {},
): string => {
  const exponent = exponentOf(money.currency);
  const chrome = currencyChrome(locale, money.currency);
  const showFraction = exponent > 0 && !opts.omitFraction;

  // Always split at the currency's real exponent, then drop the fraction when
  // asked. Splitting at 0 instead would render $12.34 as "$1,234" — the integer
  // part must still be the MAJOR-unit count.
  const {int, frac} = splitMinor(money.amountMinor, exponent, chrome.group);

  // `omitFraction` truncates toward zero rather than rounding: showing $10.99
  // as "$10" while the stored value is 1099 is honest ("we hid the cents");
  // "$11" is a lie.
  const digits =
    showFraction && frac !== '' ? `${int}${chrome.decimal}${frac}` : int;

  const negative = money.amountMinor < 0 && !opts.absolute;
  const signChar = negative
    ? '-'
    : opts.alwaysSign && money.amountMinor > 0
      ? '+'
      : '';
  const symbol = opts.omitSymbol ? '' : chrome.symbol;
  const gap = chrome.symbolSpaced && symbol ? '\u00A0' : '';
  const body = chrome.symbolBefore
    ? `${symbol}${gap}${digits}`
    : `${digits}${gap}${symbol}`;

  if (!signChar) return body;

  return chrome.minusBefore || !chrome.symbolBefore
    ? `${signChar}${body}`
    : `${symbol}${gap}${signChar}${digits}`;
};

/**
 * Non-money integers (counts, chart ticks) with the locale's group separator,
 * so there is exactly one grouping implementation in the app.
 */
export const formatInteger = (value: number, locale: string): string => {
  const chrome = currencyChrome(locale, 'USD');
  const {int} = splitMinor(value, 0, chrome.group);

  return value < 0 ? `-${int}` : int;
};

/** Highest index `SCALES` carries. Anything past it has no precomputed power. */
const MAX_FRACTION_DIGITS = SCALES.length - 1;

/**
 * `formatPercent(0.1234, 'en', 1) === '12.3%'`.
 *
 * `digits` is clamped into `[0, 4]`: `SCALES` only carries five entries, and an
 * out-of-range index used to reach `splitMinor` as `undefined` and render the
 * literal string `NaN.00NaN%`.
 */
export const formatPercent = (
  ratio: number,
  locale: string,
  digits = 1,
): string => {
  const places = Number.isFinite(digits)
    ? Math.min(Math.max(Math.trunc(digits), 0), MAX_FRACTION_DIGITS)
    : 1;
  const chrome = currencyChrome(locale, 'USD');
  const scaled = roundHalfAwayFromZero(ratio * 100 * SCALES[places]);
  const {int, frac} = splitMinor(scaled, places, chrome.group);
  const body = places > 0 ? `${int}${chrome.decimal}${frac}` : int;

  return scaled < 0 ? `-${body}%` : `${body}%`;
};

// ---------------------------------------------------------------------------
// Parsing (design §1.5)
// ---------------------------------------------------------------------------

export interface ParseResult {
  ok: boolean;
  minor: number;
  /** The input carried more fraction digits than the currency allows. */
  rounded: boolean;
}

const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC = /[\u06F0-\u06F9]/g;

/**
 * Non-ASCII separators CLDR really emits, folded to their ASCII equivalent
 * before the disambiguation runs.
 *
 * U+066C / U+066B are the Arabic thousands and decimal separators: `ar-*` and
 * `fa-*` render `12\u066C345\u066B67`, and stripping them (which the character-class
 * filter below used to do) turned that into `1234567` \u2014 a silent 100x
 * over-read of the module's OWN formatted output. U+2019 / U+2018 are the
 * apostrophe group separators CLDR uses for `de-CH` / `it-CH`.
 */
const SEPARATOR_ALIASES: Readonly<Record<string, string>> = {
  '\u066C': ',', // ARABIC THOUSANDS SEPARATOR
  '\u066B': '.', // ARABIC DECIMAL SEPARATOR
  '\u2019': "'", // RIGHT SINGLE QUOTATION MARK (de-CH group)
  '\u2018': "'", // LEFT SINGLE QUOTATION MARK
};

const SEPARATOR_ALIAS_RE = /[\u066C\u066B\u2019\u2018]/g;

/**
 * A number: an optional leading separator (so `'.5'` still means half a unit),
 * then digits, then any mix of digits and separators, ending on a DIGIT.
 * Anchoring the end on a digit is what keeps a currency symbol's own dots out.
 */
const NUMERIC_RUN = /[.,]?\d[\d.,'\u00A0\u202F ]*\d|[.,]?\d/;

/**
 * The ONLY place a string becomes money.
 *
 * Normal entry goes through the minor-unit keypad accumulator, where every key
 * is an integer operation and there is no decimal key at all; this exists for
 * paste ("1,234.56" copied out of a bank app) and for the migration.
 *
 * `locale` is used only to disambiguate a lone separator: "1,234" is 1234 major
 * units in en-US but 1.234 in de-DE. Ties go to "group", never "decimal" —
 * reading a pasted "1,234" as one dollar twenty-three is the worse failure.
 */
export const parseMoneyInput = (
  raw: string,
  currency: CurrencyCode,
  locale: string,
): ParseResult => {
  const exponent = exponentOf(currency);
  const chrome = currencyChrome(locale, currency);
  // The locale's separators, folded to ASCII the same way the input is, so the
  // comparisons below still line up in `ar-*` / `fa-*` / `de-CH`.
  const groupChar = SEPARATOR_ALIASES[chrome.group] ?? chrome.group;
  const decimalChar = SEPARATOR_ALIASES[chrome.decimal] ?? chrome.decimal;

  const normalized = raw
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(SEPARATOR_ALIAS_RE, (char) => SEPARATOR_ALIASES[char] ?? '')
    .replace(/[^\d.,'\u00A0\u202F \u2212-]/g, '')
    .replace(/\u2212/g, '-');

  const negative = normalized.includes('-');
  // The number is the DIGIT-ANCHORED run, not "everything left after the
  // filter". Several CLDR currency symbols contain ASCII dots of their own
  // (AED `د.إ.`, SAR `ر.س.`, BHD `د.ب.`, OMR `ر.ع.`); keeping them made
  // `'12٫34 د.إ.'` end in `..`, which the disambiguator read as the decimal
  // separator and returned 100x the amount.
  const run = NUMERIC_RUN.exec(normalized)?.[0] ?? '';
  const bare = run.replace(/[\s']/g, '');

  if (bare === '') return {ok: false, minor: 0, rounded: false};

  const lastDot = bare.lastIndexOf('.');
  const lastComma = bare.lastIndexOf(',');
  let decimalAt = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the later one is the decimal separator.
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const only = lastDot >= 0 ? lastDot : lastComma;
    const tail = bare.length - only - 1;
    const separator = bare[only];

    // A single separator with exactly 3 trailing digits is ambiguous
    // ('1,234' / '1.234'). Resolve it with the locale's own group separator.
    decimalAt = tail === 3 && separator === groupChar ? -1 : only;

    if (tail === 3 && separator !== groupChar && separator !== decimalChar) {
      decimalAt = -1;
    }

    // An exponent-0 currency has no fraction to write, so a 3-digit tail can
    // only ever be a thousands group. Without this, `'12.345'` KRW read as 12
    // in every locale whose group separator is not '.' \u2014 a 1000x under-read.
    if (tail === 3 && exponent === 0) {
      decimalAt = -1;
    }
  }

  const intText = (decimalAt >= 0 ? bare.slice(0, decimalAt) : bare).replace(
    /\D/g,
    '',
  );
  const fracText =
    decimalAt >= 0 ? bare.slice(decimalAt + 1).replace(/\D/g, '') : '';

  const rounded = fracText.length > exponent;
  const fracFixed = fracText.slice(0, exponent).padEnd(exponent, '0');
  // Round the dropped digits half away from zero rather than truncating a paste.
  const carry = rounded && Number(fracText[exponent]) >= 5 ? 1 : 0;
  const magnitude = Number(`${intText || '0'}${fracFixed}`) + carry;

  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_AMOUNT_MINOR_ABS) {
    return {ok: false, minor: 0, rounded};
  }

  return {ok: true, minor: negative ? -magnitude : magnitude, rounded};
};

// ---------------------------------------------------------------------------
// Keypad accumulator (design §1.5) — the state model; the view lives in src/
// ---------------------------------------------------------------------------

/** Stays inside `Number.MAX_SAFE_INTEGER` with room to spare. */
export const MAX_KEYPAD_DIGITS = 15;

export interface KeypadState {
  /** ALWAYS the value in minor units. The decimal point is implied and fixed. */
  minor: number;
  currency: CurrencyCode;
}

export const keypadDigit = (state: KeypadState, digit: number): KeypadState => {
  if (String(Math.abs(state.minor)).length >= MAX_KEYPAD_DIGITS) return state;

  return {...state, minor: state.minor * 10 + digit};
};

/** Exact: no re-parse of a display string, so no rounding on every keystroke. */
export const keypadBackspace = (state: KeypadState): KeypadState => ({
  ...state,
  minor: Math.trunc(state.minor / 10),
});

export const keypadClear = (state: KeypadState): KeypadState => ({
  ...state,
  minor: 0,
});

/** The '00' key — offered only for exponent-0 currencies, where amounts are large. */
export const keypadDoubleZero = (state: KeypadState): KeypadState =>
  keypadDigit(keypadDigit(state, 0), 0);

/** Calculator ops. +/- are exact; ×/÷ round half away from zero at the end only. */
export const applyKeypadOp = (
  a: number,
  b: number,
  op: '+' | '-' | '*' | '/',
): number => {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return roundHalfAwayFromZero(a * b);
    case '/':
      return b === 0 ? a : roundHalfAwayFromZero(a / b);
  }
};
