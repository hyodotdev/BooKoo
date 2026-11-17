# DESIGN — Money, Categories, I18N (the reference-data layer)

Status: design, ready to implement. Written against `.notes/DECISIONS.md` and recon notes
01, 02, 03, 04, 07, 09, 13.

Scope: everything that is *reference data* rather than user data — how an amount is represented,
parsed, formatted and rolled up; how the category taxonomy lives on the server; how every string,
number and date is localized; and the timezone rule that makes a shared ledger reconcilable.

Non-negotiables this document is written to satisfy:

- Unbounded data stays instant → no unbounded reads, no client-side aggregation, no per-row Intl work.
- Real Firebase production data will be migrated → `legacyUid` / `legacyKey` / `legacyIconId` from day one.
- Dark + light, tablet, i18n ko/en/ja (+ zh/id for legacy parity).
- TypeScript, no `any`.

File map produced by this design:

```
shared/                                  # imported by BOTH convex/ and src/  (single source of truth)
├── money.ts                             # minor-unit arithmetic, exponents, parse/format
├── currency.ts                          # currency data + separators cache + lazy Intl probe
├── categories.ts                        # SYSTEM_CATEGORIES (34) + resolution helpers
└── date.ts                              # day/month keys + calendar codecs in a fixed IANA tz

src/
├── STRINGS.ts                           # i18n-js instance + typed t()
├── hooks/useLocale.ts                   # reactive locale + MMKV persist
├── components/CategoryIcon.tsx          # typed cpk-ui Icon wrapper
└── components/AmountKeypad.tsx          # minor-unit accumulator keypad

assets/
├── langs/{en,ko,ja,zh,id}.json
└── langs/meta/{en,ko,ja,zh,id}.json     # native manifest strings for app.config.ts

convex/
├── schema/ledgerItems.ts                # amountMinor/currency/baseAmountMinor/fx*
├── schema/ledgerCategories.ts           # copy-on-write overlay rows
├── categories/{queries,mutations}.ts
└── migrate/legacyCategories.ts

scripts/
├── convert-legacy-strings.mjs           # STRINGS.js -> assets/langs/*.json
├── legacy-key-map.mjs                   # the 263-key mapping table (note 04 §9.3)
└── verify-langs.ts                      # parity + ICU-placeholder checker (CI)
```

---

# PART 1 — MONEY

## 1.1 The one representation

```ts
// shared/money.ts

/** ISO-4217 alphabetic code, uppercase. Never a symbol, never a locale tag. */
export type CurrencyCode = string & {readonly __brand?: 'CurrencyCode'};

/**
 * An amount of money. `amountMinor` is an INTEGER count of the currency's minor unit.
 * KRW 12,000  -> {amountMinor: 12000,   currency: 'KRW'}   (exponent 0)
 * USD 12.34   -> {amountMinor: 1234,    currency: 'USD'}   (exponent 2)
 * BHD 1.234   -> {amountMinor: 1234,    currency: 'BHD'}   (exponent 3)
 */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}
```

Rules, enforced by lint and by the Convex validators:

1. **`amountMinor` is always an integer.** `Number.isSafeInteger(amountMinor)` is asserted on every
   write. Convex has no integer type in `v.number()` (it is an IEEE double), so the assertion is the
   contract. Safe range is ±2^53−1 ≈ 9.007e15, i.e. ±90 trillion KRW or ±90 billion USD. That is
   more headroom than a household ledger will ever need; the assertion catches float drift, not overflow.
2. **There is no `amount: string` display field on any document.** The legacy pair
   (`amount: "₩-12,000"` + `realAmount: -12000`, note 02 §6) embedded the *creator's* device locale
   and currency into the row, so a shared ledger held rows formatted five different ways and nothing
   could be summed or sorted. Display strings are produced at render time, never persisted.
3. **Currency lives next to the amount, always.** A bare number is never passed across a function
   boundary — the `Money` object travels together. This is what makes the multi-currency case in §1.6
   representable at all; the legacy schema had *no* currency field anywhere in the database (note 02 §6).
4. **No floating point ever touches a stored amount.** All arithmetic on stored money is integer
   arithmetic on `amountMinor`. The only place a non-integer appears is the FX conversion in §1.6,
   which is rounded to an integer immediately and frozen.

## 1.2 The ISO-4217 exponent table we ship

Most currencies have exponent 2. We ship only the exceptions plus a hard default, so the table is
40 lines instead of 180 and cannot drift out of date for the 95 % case.

```ts
// shared/currency.ts

export type CurrencyExponent = 0 | 2 | 3 | 4;

/**
 * ISO 4217 minor-unit exponents that are NOT 2.
 * Source: ISO 4217:2015 Table A.1 (list-one), current as of 2026-08.
 * Anything absent from this map is exponent 2.
 */
const EXPONENT_EXCEPTIONS: Readonly<Record<string, CurrencyExponent>> = {
  // ---- exponent 0 (no minor unit in circulation) ----
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0,
  XAF: 0, XOF: 0, XPF: 0,
  // ---- exponent 3 (thousandths: dinar/rial family) ----
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // ---- exponent 4 (funds/index units; included for completeness) ----
  CLF: 4, UYW: 4,
};

export const DEFAULT_EXPONENT: CurrencyExponent = 2;

export const exponentOf = (currency: CurrencyCode): CurrencyExponent =>
  EXPONENT_EXCEPTIONS[currency.toUpperCase()] ?? DEFAULT_EXPONENT;

/** 10 ** exponent, precomputed — avoids Math.pow in hot list rendering. */
const SCALES: readonly number[] = [1, 10, 100, 1000, 10000];
export const scaleOf = (currency: CurrencyCode): number => SCALES[exponentOf(currency)];
```

Deliberate decisions inside that table:

- **We do NOT derive the exponent from `Intl`.** `new Intl.NumberFormat(l, {style:'currency', currency})
  .resolvedOptions().maximumFractionDigits` would give it, but Hermes on iOS is documented to ignore
  fraction-digit options (facebook/hermes#812), so the derived value cannot be trusted on the platform
  where correctness matters most. The table is 26 entries and is stable for decades; hard-code it.
- **MGA and MRU stay at exponent 2.** They are nominally 1/5 units (iraimbilanja, khoums) but ISO
  assigns exponent 2 and every payment system treats them as 2. Do not model fifths.
- **HUF and TWD stay at exponent 2** even though Hungary and Taiwan transact in whole units. The
  user's own "hide the decimals" preference is a *display* setting (§1.5), never a storage change.
- **Exponent 4 is included** so `CLF` cannot silently round to 2 decimals if a user picks it, even
  though it is not in `SUPPORTED_CURRENCIES`. `exponentOf` is total over all strings.

### Supported currency list

Note 04 §5 established that the legacy 47-row hand-maintained table is riddled with errors: `EUR`'s
symbol is `$`, `ZAR`'s symbol is the literal string `"VND"`, `IND` is not an ISO code (Indian rupee is
`INR`), and `GRD`/`ITL`/`HRK` are dead currencies. **Do not port that table.** Ship codes only; every
symbol and separator comes from `Intl` (§1.4).

```ts
export const SUPPORTED_CURRENCIES = [
  // Asia-Pacific (the actual user base)
  'KRW','JPY','USD','CNY','TWD','HKD','SGD','THB','VND','IDR','MYR','PHP','INR','AUD','NZD',
  // Europe
  'EUR','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','TRY','RUB','UAH','ISK',
  // Americas
  'CAD','BRL','ARS','CLP','COP','MXN','PEN',
  // MEA
  'AED','SAR','ILS','ZAR','EGP','NGN','QAR','KWD','BHD','OMR','JOD',
  // South/Central Asia
  'NPR','BDT','PKR','LKR','KZT','UZS',
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
```

47 codes, all real, all current. `KWD`/`BHD`/`OMR`/`JOD` are deliberately included so the exponent-3
path is exercised by real product surface and not just by unit tests. The legacy dead codes
(`GRD`, `ITL`, `HRK`, `SVC`, `BRN`, `IND`, `AMD`, `BYN`, `SOS`, `SYP`, `BAM`, `BGN`, `BOB`, `BZD`,
`CRC`, `DOP`, `GTQ`, `HNL`, `NPR`(kept), `UZS`(kept)) are handled by the migration in §1.9 — a legacy
ledger whose device currency was `IND` migrates to `INR`, `BRN` → `BND`, `GRD`/`ITL` → `EUR`,
`HRK` → `EUR`, `SVC` → `USD`.

The picker is **not** the raw 47-item list. It shows: (a) the ledger's current currency pinned at top,
(b) the device currency from `expo-localization`, (c) a "recent" section from
`userPrefs.recentCurrencies` (max 5), then (d) the full list grouped by region, searchable by code,
symbol and localized name. Legacy rendered a flat 46-row `FlatList` of `"{code} | {symbol}"`
(note 01 §5.20) with no search — with 47 rows that is a scroll-hunt.

## 1.3 Sign convention: explicit `type`, magnitude in `amountMinor` — DECIDED

```ts
export type EntryType = 'EXPENSE' | 'INCOME' | 'TRANSFER';
```

`ledgerItems.type` is the classification. `amountMinor` carries the magnitude and is **normally
positive**; a negative `amountMinor` is legal only as an explicit *refund / correction* on an
`EXPENSE` (or a *clawback* on an `INCOME`) and is entered through a dedicated toggle, never by typing
a minus sign. `amountMinor === 0` is rejected.

Why not "signed amount, no type field" (the legacy design):

1. **Indexability.** `by_ledgerId_deletedAt_type_dayKey_occurredAt` gives "all income this year" as one index range.
   With sign-only you cannot express `sign < 0` as an index range on a field that also carries the
   magnitude — you would need `.filter()`, which note 13 §11 rule 1 bans on `ledgerItems` outright.
   This is the decisive argument: the ban on `.filter()` makes a separate discriminator mandatory.
2. **`TRANSFER` has no sign.** A move between two of the ledger's own accounts is neither income nor
   expense and must be excluded from both rollup buckets. A sign cannot express "neither".
3. **Zero is unclassifiable.** Legacy had to reject `realAmount === 0` at validation
   (note 02 §6) purely because a zero amount had no type. With an explicit `type` a zero-amount entry
   is merely *pointless*, not *ambiguous* — we still reject it, but for a product reason, not a
   representational one.
4. **Legacy proved the drift.** `firebaseApi.addOrUpdateLedgerItem` contained a server-side patch-up
   — `if (category.category === 0 && realAmount > 0) realAmount = -realAmount` — because the client
   sometimes failed to negate. That patch only existed because the *type* was already stored (inside
   `category.category`) and disagreed with the *sign*. Two representations of one fact always drift.
   And note the asymmetry the legacy left behind: there is no equivalent guard for income, so
   negative income rows may exist in production data.
5. **Charts stop calling `Math.abs()`.** `LedgerLineGraph` did `Math.abs(realAmount)` and `Tab3` did
   `< 0 → consume, > 0 → income, === 0 → ignored`. With `type` the buckets are a switch, and the
   `=== 0` silent-drop bug disappears.
6. **Refunds become expressible.** Under sign-only, a €20 refund on a €50 grocery expense is an
   "income" and pollutes the income total. With `type: 'EXPENSE', amountMinor: -2000` it correctly
   reduces the groceries expense bucket to €30 and never appears as income.

The rollup arithmetic stays a one-liner with no `Math.abs`, no branch on sign:

```ts
const expenseDelta = doc.type === 'EXPENSE' ? sign * doc.baseAmountMinor : 0;
const incomeDelta  = doc.type === 'INCOME'  ? sign * doc.baseAmountMinor : 0;
// TRANSFER contributes to neither; it only moves accountId.
```

Validation on every write:

```ts
export const assertValidAmount = (m: Money): void => {
  if (!Number.isSafeInteger(m.amountMinor)) throw new MoneyError('error.amountNotInteger');
  if (m.amountMinor === 0)                  throw new MoneyError('error.amountZero');
  if (Math.abs(m.amountMinor) > 1e15)       throw new MoneyError('error.amountTooLarge');
};
```

`MoneyError` is the pure `shared/` error used identically by client and server. The Convex mutation
boundary catches it and throws `appError('AMOUNT_INVALID', error.code)`; shared code never imports
`convex/values`. The form renders the same static key inline without a server round trip.

## 1.4 Formatting: Intl for decoration, integer math for digits

### The Hermes reality (verified)

Expo SDK 57 / React Native 0.86.2 ships Hermes with `Intl` enabled on both platforms, but the
implementation is a **thin shim over the platform's own formatter**, not a full ICU:
Android delegates to `android.icu.*` (ICU4J, good), iOS delegates to `NSNumberFormatter` /
`NSDateFormatter` (partial). Known, still-relevant gaps:

| API | Hermes status | Consequence for BooKoo |
|---|---|---|
| `Intl.NumberFormat` (basic + `style:'currency'`) | present both platforms | usable for symbol/separator extraction |
| `minimumFractionDigits` / `maximumFractionDigits` | **ignored on iOS** (facebook/hermes#812) | we must not depend on them → we produce digits ourselves |
| `Intl.NumberFormat.prototype.formatToParts` | present on Android; unreliable/absent on older iOS shims | probe, with a regex-sentinel fallback |
| `Intl.PluralRules` | **not implemented** | pluralization comes from i18n-js, not Intl (§3.5) |
| `Intl.RelativeTimeFormat` / `ListFormat` / `Segmenter` / `DisplayNames` | **not implemented** | no "3 days ago" via Intl; date-fns `formatDistance` instead (§4.2) |
| `Intl.DateTimeFormat` with `timeZone` | present (needed for the ledger tz rule, §4.3) | probe once, hard-fail loudly if missing |
| `Intl.supportedValuesOf` | not implemented | never call it |

**Do not "just add FormatJS polyfills".** `@formatjs/intl-numberformat` + locale data is ~200 KB
per locale and its `intl-localematcher` is a documented performance problem on Hermes
(formatjs/formatjs#4276). We need exactly two things from Intl and both are cheap to obtain safely.

### The capability probe (lazy, memoized in `shared/currency.ts`)

```ts
// shared/currency.ts
export interface IntlCaps {
  numberFormat: boolean;
  formatToParts: boolean;
  fractionDigitsHonored: boolean;
  timeZone: boolean;
}

let cachedCaps: IntlCaps | undefined;

export const intlCaps = (): IntlCaps => {
  if (cachedCaps) return cachedCaps;
  const caps: IntlCaps = {
    numberFormat: false, formatToParts: false, fractionDigitsHonored: false, timeZone: false,
  };
  if (typeof Intl === 'undefined' || typeof Intl.NumberFormat !== 'function') {
    cachedCaps = caps;
    return caps;
  }
  caps.numberFormat = true;
  try {
    const nf = new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    // If Hermes/iOS ignores the options this yields '1,234.5' instead of '1,234.50'.
    caps.fractionDigitsHonored = nf.format(1234.5) === '1,234.50';
    caps.formatToParts = typeof nf.formatToParts === 'function' && nf.formatToParts(1).length > 0;
  } catch { /* leave false */ }
  try {
    caps.timeZone =
      new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Seoul', hour: 'numeric'}).format(0) !== '';
  } catch { /* leave false */ }
  cachedCaps = caps;
  return cachedCaps;
};
```

`fractionDigitsHonored` is *informational only* — the formatter below never relies on it. D6 keeps the
probe in development, tests, the bounded in-memory diagnostic ring, and an explicitly user-submitted
diagnostic bundle; it is never sent to Sentry/analytics automatically.

### The formatter

The insight: **the only thing we need from `Intl` is the decoration** — group separator, decimal
separator, currency symbol, and whether the symbol goes before or after. Those Hermes gets right on
both platforms. The **digits and the rounding** — the part Hermes iOS gets wrong — we compute with
integer arithmetic from `amountMinor`, which we already hold exactly.

```ts
// shared/currency.ts  (continued)

export interface CurrencyChrome {
  symbol: string;          // '₩', '$', 'BD', '¥'
  symbolBefore: boolean;   // '₩1,000' vs '1 000 ₽'
  symbolSpaced: boolean;   // '1 000 ₽' has a space between number and symbol
  group: string;           // ',' | '.' | ' ' (U+00A0) | "'"
  decimal: string;         // '.' | ','
  minusBefore: boolean;    // '-₩1,000' vs '₩-1,000'
}

const CHROME_FALLBACK: CurrencyChrome = {
  symbol: '', symbolBefore: true, symbolSpaced: false, group: ',', decimal: '.', minusBefore: true,
};

const chromeCache = new Map<string, CurrencyChrome>();

/** Derives the chrome ONCE per (locale, currency). Never called inside a list row. */
export const currencyChrome = (locale: string, currency: CurrencyCode): CurrencyChrome => {
  const cacheKey = `${locale}|${currency}`;
  const hit = chromeCache.get(cacheKey);
  if (hit) return hit;

  let chrome: CurrencyChrome = {...CHROME_FALLBACK, symbol: currency};

  if (intlCaps().numberFormat) {
    try {
      const nf = new Intl.NumberFormat(locale, {style: 'currency', currency});
      // Sentinel chosen so every part is present exactly once and is unambiguous:
      // integer part has a group boundary, fraction part is non-zero, value is negative.
      const SENTINEL = -1234.56;
      if (intlCaps().formatToParts) {
        const parts = nf.formatToParts(SENTINEL);
        const at = (t: string) => parts.findIndex((p) => p.type === t);
        const symIdx = at('currency');
        const intIdx = at('integer');
        chrome = {
          symbol: parts[symIdx]?.value ?? currency,
          symbolBefore: symIdx >= 0 && intIdx >= 0 ? symIdx < intIdx : true,
          symbolSpaced: parts.some((p) => p.type === 'literal' && /\s|\u00A0/.test(p.value)),
          group: parts.find((p) => p.type === 'group')?.value ?? ',',
          decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
          minusBefore: at('minusSign') >= 0 && at('minusSign') < Math.max(symIdx, intIdx),
        };
      } else {
        // formatToParts unavailable: parse the sentinel string positionally.
        const s = nf.format(SENTINEL);                     // e.g. '-₩1,235' / '-1.234,56 €'
        const digits = s.match(/[\d٠-٩][\d٠-٩\s\u00A0.,'\u2019]*[\d٠-٩]/)?.[0] ?? '';
        const firstDigit = s.indexOf(digits[0] ?? '0');
        const symbol = (s.slice(0, firstDigit) + s.slice(firstDigit + digits.length))
          .replace(/[-−]/g, '').trim();
        const seps = digits.replace(/[\d٠-٩]/g, '');
        chrome = {
          symbol: symbol || currency,
          symbolBefore: firstDigit > 0 && s.indexOf(symbol) < firstDigit,
          symbolSpaced: /[\s\u00A0]/.test(s),
          group: seps.length >= 2 ? seps[0] : (seps[0] === '.' ? ',' : '.'),
          decimal: seps.length >= 2 ? seps[seps.length - 1] : (seps[0] ?? '.'),
          minusBefore: s.trimStart().startsWith('-') || s.trimStart().startsWith('−'),
        };
      }
    } catch { /* keep fallback */ }
  }
  chromeCache.set(cacheKey, chrome);
  return chrome;
};
```

```ts
// shared/money.ts  (continued)

export interface FormatMoneyOptions {
  /** Hide the currency symbol entirely (compact list rows where the ledger currency is implied). */
  omitSymbol?: boolean;
  /** Force-hide the fraction part even for exponent>0 (user preference, JPY-style display of USD). */
  omitFraction?: boolean;
  /** '+' in front of positive values. Used for income rows and deltas. */
  alwaysSign?: boolean;
  /** Render the value's absolute magnitude; the caller draws the sign via type colour. */
  absolute?: boolean;
}

/** Groups an integer string in 3s with an arbitrary separator (which may itself be a space). */
const groupDigits = (digits: string, group: string): string => {
  if (group === '') return digits;
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += group;
    out += digits[i];
  }
  return out;
};

/** Splits |amountMinor| into its grouped integer string and its exact fraction string. */
const splitMinor = (
  amountMinor: number,
  exponent: CurrencyExponent,
  group: string,
): {int: string; frac: string} => {
  const abs = Math.abs(amountMinor);
  const scale = SCALES[exponent];
  const intPart = Math.floor(abs / scale);
  const fracPart = abs - intPart * scale;              // exact: both operands are integers
  return {
    int: groupDigits(String(intPart), group),
    frac: exponent === 0 ? '' : String(fracPart).padStart(exponent, '0'),
  };
};

export const formatMoney = (
  m: Money,
  locale: string,
  opts: FormatMoneyOptions = {},
): string => {
  const exponent = exponentOf(m.currency);
  const chrome = currencyChrome(locale, m.currency);
  const showFraction = exponent > 0 && !opts.omitFraction;
  const {int, frac} = splitMinor(m.amountMinor, showFraction ? exponent : 0, chrome.group);

  // omitFraction on a fractional currency: truncate toward zero, do not round —
  // a rounded-up display that disagrees with the stored value reads as a bug to users.
  const digits = showFraction && frac !== '' ? `${int}${chrome.decimal}${frac}` : int;

  const negative = m.amountMinor < 0 && !opts.absolute;
  const signChar = negative ? '-' : opts.alwaysSign ? '+' : '';
  const sym = opts.omitSymbol ? '' : chrome.symbol;
  const gap = chrome.symbolSpaced && sym ? '\u00A0' : '';

  const body = chrome.symbolBefore ? `${sym}${gap}${digits}` : `${digits}${gap}${sym}`;
  if (!signChar) return body;
  return chrome.minusBefore || !chrome.symbolBefore
    ? `${signChar}${body}`
    : `${sym}${gap}${signChar}${digits}`;
};
```

Cost: after the first call per (locale, currency), formatting is **pure string work with zero `Intl`
allocations**. A FlashList row rendering 60 amounts per screen does 60 `Math.floor` calls, not 60
`Intl.NumberFormat` constructions. (Constructing an `Intl.NumberFormat` per row is a real, measurable
Hermes cost and is exactly the kind of thing that made the legacy list janky; the legacy code called
`Number.toLocaleString(...)` per row — note 01 line 654.)

Determinism: the digit string is byte-identical on iOS, Android and in the Convex V8 runtime for the
same `amountMinor`. Only the decoration can vary by platform, and it is cached and testable.

Truncation over rounding for `omitFraction` is deliberate: `$10.99` displayed as `$10` with the stored
value still `1099` is honest ("we hid the cents"); `$11` is a lie.

### Convex-side formatting

The server needs formatted money for push notifications and invite emails only. `shared/money.ts` is
imported by `convex/` unchanged. The Convex runtime is V8 with full ICU, so `currencyChrome` takes the
`formatToParts` path there, and — critically — it formats in the **recipient's** locale
(`userProfiles.locale`), not the sender's. Legacy rendered `EMAIL_INVITE_SUBJECT`/`_BODY` and the
push body on the *sender's* device in the *sender's* language (note 01 §5, note 04 §9.2 deviation 2).

## 1.5 Input UX: the minor-unit accumulator

Money is entered on a **custom in-app keypad**, never a `TextInput` with `keyboardType="numeric"`.
Reasons: the OS numeric keypad differs per platform and per locale (comma vs period, no way to hide
the decimal key for KRW), it fights with the decimal separator, and it costs a keyboard-avoidance
layout on a screen that also has a category grid.

State is a single integer — the amount in minor units — and every key is an integer operation:

```ts
// src/components/AmountKeypad.tsx  (state model; the view is cpk-ui + kstyled)

const MAX_DIGITS = 15;                       // stays inside Number.MAX_SAFE_INTEGER

export interface KeypadState {
  minor: number;                             // ALWAYS the value in minor units
  currency: CurrencyCode;
}

export const keypadDigit = (s: KeypadState, d: number): KeypadState => {
  if (String(Math.abs(s.minor)).length >= MAX_DIGITS) return s;      // clamp, no throw
  return {...s, minor: s.minor * 10 + d};
};

export const keypadBackspace = (s: KeypadState): KeypadState => ({
  ...s,
  minor: Math.trunc(s.minor / 10),
});

export const keypadClear = (s: KeypadState): KeypadState => ({...s, minor: 0});

/** '00' key — present only for exponent-0 currencies, where amounts are large. */
export const keypadDoubleZero = (s: KeypadState): KeypadState =>
  keypadDigit(keypadDigit(s, 0), 0);
```

Behaviour that falls out of this, for free:

- **KRW (exp 0):** `1 2 0 0 0` → `minor = 12000` → renders `₩12,000`. There is no decimal key on the
  pad at all, because `exponentOf('KRW') === 0`. The legacy app showed a decimal key for KRW and users
  could type `12000.5` won.
- **USD (exp 2):** `1 2 3 4` → `minor = 1234` → renders `$12.34`. The decimal point is *implied and
  fixed*, filling right-to-left. There is no decimal key here either — this is the standard POS/
  banking-app entry model and it makes a mis-placed decimal impossible.
- **BHD (exp 3):** `1 2 3 4` → `minor = 1234` → renders `BD1.234`. Three implied decimals, same code path.
- **Backspace is exact.** `Math.trunc(minor/10)` on `1234` → `123` → renders `$1.23`. No re-parse of a
  display string, so no rounding on every keystroke.

Layout: the pad has `1..9`, `0`, `⌫`, and one context key — `00` when `exponent === 0`, otherwise a
**±/refund toggle**. Long-press `⌫` clears. The pad also carries `+ − × ÷` behind a "calc" toggle
(a real ask for splitting a bill):

```ts
/** Calculator ops. +/- are exact integer ops. ×/÷ round HALF_AWAY_FROM_ZERO at the end only. */
export const applyOp = (a: number, b: number, op: '+' | '-' | '*' | '/'): number => {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return roundHalfAwayFromZero((a * b) / 1);      // b entered as a plain multiplier
    case '/': return b === 0 ? a : roundHalfAwayFromZero(a / b);
  }
};

export const roundHalfAwayFromZero = (x: number): number =>
  x < 0 ? -Math.round(-x) : Math.round(x);
```

`Math.round` in JS is *half-up toward +∞* (`Math.round(-0.5) === -0` → `0`), which biases negative
amounts. `roundHalfAwayFromZero` fixes that. We use **half-away-from-zero, not banker's rounding**, for
money the user sees: users typing a split bill expect `÷3` of `1000` to give `333`/`333`/`334`, and
half-even produces results people report as bugs. Banker's rounding is the right choice for
accounting systems that must not accumulate bias over millions of rows; a household ledger is not that.

**Paste / typed entry** still needs a parser (a user pastes `1,234.56` from a bank app):

```ts
// shared/money.ts  (continued)

export interface ParseResult {
  ok: boolean;
  minor: number;
  /** Set when the input had more fraction digits than the currency allows. */
  rounded: boolean;
}

/**
 * Parses free text into minor units for `currency`, using `locale` only to disambiguate
 * a lone separator. Accepts ASCII and Arabic-Indic digits, ignores currency symbols and spaces.
 */
export const parseMoneyInput = (
  raw: string,
  currency: CurrencyCode,
  locale: string,
): ParseResult => {
  const exponent = exponentOf(currency);
  const chrome = currencyChrome(locale, currency);

  // Normalize Arabic-Indic digits to ASCII, strip everything that is not a digit or a separator.
  const normalized = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d.,'\u00A0\u202F \-\u2212]/g, '')
    .replace(/[\u2212]/g, '-');

  const negative = /-/.test(normalized);
  const bare = normalized.replace(/[-\s\u00A0\u202F']/g, '');
  if (bare === '') return {ok: false, minor: 0, rounded: false};

  // Decide which separator is the decimal one.
  const lastDot = bare.lastIndexOf('.');
  const lastComma = bare.lastIndexOf(',');
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);                       // the later one wins
  } else if (lastDot >= 0 || lastComma >= 0) {
    const only = lastDot >= 0 ? lastDot : lastComma;
    const tail = bare.length - only - 1;
    const sep = bare[only];
    // A single separator with exactly 3 trailing digits is ambiguous ('1,234' / '1.234').
    // Resolve it with the locale's own group separator; ties go to "group", never "decimal".
    decimalAt = tail === 3 && sep === chrome.group ? -1 : only;
    if (tail === 3 && sep !== chrome.group && sep !== chrome.decimal) decimalAt = -1;
  }

  const intText = (decimalAt >= 0 ? bare.slice(0, decimalAt) : bare).replace(/\D/g, '');
  const fracText = decimalAt >= 0 ? bare.slice(decimalAt + 1).replace(/\D/g, '') : '';

  const rounded = fracText.length > exponent;
  const fracFixed = fracText.slice(0, exponent).padEnd(exponent, '0');
  // Round the dropped digits half-away-from-zero rather than truncating a paste.
  const carry = rounded && Number(fracText[exponent]) >= 5 ? 1 : 0;

  const magnitude = Number(`${intText || '0'}${fracFixed}`) + carry;
  if (!Number.isSafeInteger(magnitude)) return {ok: false, minor: 0, rounded};
  return {ok: true, minor: negative ? -magnitude : magnitude, rounded};
};
```

That parser is the only place a *string* becomes money, and it is unit-tested against a fixture matrix
of (locale × currency × input) that includes `'1,234'` in `en-US` (→ 123400 for USD), `'1.234'` in
`de-DE` (→ 123400 for EUR) and `'12,000'` in `ko-KR` (→ 12000 for KRW).

## 1.6 Multi-currency — DECIDED

**A ledger has one base currency. An entry may be recorded in any currency. Both the original and the
base-converted amount are stored on the entry. Rollups sum the base amount only.**

The normative `ledgerItems` fields and indexes are `SCHEMA.md` §3.10. This document owns the money
rationale and algorithms only; it does not carry a second `defineTable` subset whose names or index
tuples can drift.

### Why store `baseAmountMinor` unconditionally

The alternative — store it only when the currencies differ, and fall back to `amountMinor` otherwise —
saves 8 bytes and costs a branch in **every** consumer: the rollup trigger, the repair cron, the
aggregate component, the CSV export, the chart. One of those branches will be forgotten. Storing it
always makes the invariant "`baseAmountMinor` is the number you sum" unconditional, and the rollup
trigger from note 13 §3.3 keeps working with one field renamed.

### Why store `baseCurrency` on the item

So a rollup row and an item row can be *checked against each other* without reading the ledger. If a
ledger's base currency is ever changed (§1.8) the items written before the change carry the old
snapshot, which is exactly what the migration job needs to find and rewrite. Without it, a
half-migrated ledger is indistinguishable from a consistent one.

### Why `fxRateMicros` as an integer

`rate * 1_000_000`, base-currency minor-per-quote-major... precisely:

```
fxRateMicros = round( (base major units per 1 quote major unit) * 1e6 )

KRW per 1 JPY  = 9.38      -> 9_380_000
KRW per 1 USD  = 1_356.20  -> 1_356_200_000
VND per 1 USD  = 25_400    -> 25_400_000_000        (still << 2^53)
```

Storing the rate as a float invites `0.1 + 0.2` class drift when the rate round-trips through JSON and
back; an integer with a documented scale does not. Six decimal places is the precision every FX API
publishes and is enough that the conversion error is under one minor unit for any household amount.

### The conversion, exactly

```ts
// shared/money.ts  (continued)

export const FX_SCALE = 1_000_000;

/**
 * Converts `amountMinor` of `from` into minor units of `to`, using an integer micro-rate.
 * Exponent difference is handled explicitly so JPY->BHD (0 -> 3) and BHD->KRW (3 -> 0) are correct.
 */
export const convertMinor = (
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxRateMicros: number,
): number => {
  const expFrom = exponentOf(from);
  const expTo = exponentOf(to);
  //   majorFrom      = amountMinor / 10^expFrom
  //   majorTo        = majorFrom * (fxRateMicros / 1e6)
  //   minorTo        = majorTo * 10^expTo
  // => minorTo = amountMinor * fxRateMicros * 10^(expTo-expFrom) / 1e6
  const numerator = amountMinor * fxRateMicros * Math.pow(10, expTo - expFrom);
  return roundHalfAwayFromZero(numerator / FX_SCALE);
};
```

Overflow check: the largest realistic product is
`amountMinor (1e9) * fxRateMicros (2.6e10) = 2.6e19` — that **exceeds 2^53**. So `convertMinor`
asserts and, above a threshold, falls back to a two-step computation that divides first:

```ts
const SAFE_PRODUCT = 2 ** 53 - 1;

export const convertMinorSafe = (
  amountMinor: number, from: CurrencyCode, to: CurrencyCode, fxRateMicros: number,
): number => {
  const shift = Math.pow(10, exponentOf(to) - exponentOf(from));
  if (Math.abs(amountMinor) * fxRateMicros * Math.abs(shift) <= SAFE_PRODUCT) {
    return convertMinor(amountMinor, from, to, fxRateMicros);
  }
  // Divide first: precision loss is bounded by 1e-6 relative, i.e. sub-minor-unit for any amount
  // small enough to be a household transaction. Still deterministic across platforms.
  return roundHalfAwayFromZero((amountMinor * shift) * (fxRateMicros / FX_SCALE));
};
```

The unit-test fixture explicitly covers `KRW→VND` and `VND→BHD` at 1e9 minor units to prove the branch.

### The rate is captured at write time and frozen

`fxAt` is the timestamp of the rate quote, not of the write. Once an entry is saved, **its
`baseAmountMinor` never changes**, even if the rate moves or the app later fetches a better quote.
Rationale: a closed month's total must not silently change. A user who wants to correct a rate edits
the entry, which is an explicit action that emits a rollup delta and an audit trail.

Rate acquisition (v2 seam; `SCHEMA.md` §10 keeps this disabled in v1):

1. **v1, same currency only** → no rate, `baseAmountMinor = amountMinor`, `fx*` absent.
2. **When the v2 flag is enabled, different currency** → the add-entry sheet shows a rate field pre-filled from a daily-cached
   quote. `MANUAL` is always allowed and is the fallback when the fetch fails; the user sees the
   computed base amount live as they type the rate, so a wrong rate is visible before saving.
3. That future daily quote comes from a Convex action registered by the v2 schema change, writing an
   `fxRates` table `{base, quote, rateMicros, quotedAt, source}` indexed
   `by_base_quote_quotedAt`. It is a *convenience*, never a correctness dependency — if `fxRates` is
   empty the flow still works with `MANUAL`. It is not a twelfth v1 cron; `SCHEMA.md` §6.1's eleven-job
   registry is complete.

### What rollups sum

`ledgerDayRollups`, `ledgerMonthRollups`, and `ledgerCategoryMonthRollups` sum
**`baseAmountMinor` only**. Their normative three-table shapes and exact indexes are
`SCHEMA.md` §3.13. One merged rollup table with an optional `categoryKey` is rejected because the
calendar, donut, and category-trend range reads require incompatible field orders.

A rollup row is **never** a multi-currency sum. There is exactly one currency in a rollup row and it
is the ledger's base. A "spent ¥3,000 + ₩50,000" total is meaningless and we never produce one; the
entry list shows each row in its own currency with the base amount as a subdued secondary line
(`¥3,000` / `≈ ₩28,140`), and every aggregate — month header, category donut, line chart, budget —
is in the base currency.

## 1.7 Display rules

| Surface | Rule |
|---|---|
| List row (`ledgerItems`) | `formatMoney({amountMinor, currency}, uiLocale, {absolute: true})`, tinted by `type` (expense = `theme.danger`, income = `theme.success`). Sign is conveyed by colour + a leading `−`/`+` glyph in the row's own text style, not by the number. Foreign-currency rows add a second line with the base amount, prefixed `≈`. |
| Day / month header | `formatMoney({amountMinor: expenseMinor, currency: baseCurrency}, uiLocale)` — always base. |
| Chart axis | `{omitFraction: true}` + a compact suffix we compute ourselves (`12.3만` in ko, `12.3K` in en) — never `notation: 'compact'`, which Hermes iOS does not honour. |
| Entry sheet | live-formatted from the keypad accumulator; symbol shown as a separate `Text` so it can be styled independently of the digits. |
| Push / email | rendered server-side in the **recipient's** locale (§1.4). |

Accessibility: the row's `accessibilityLabel` is built from
`t('a11y.expenseAmount', {amount: formatMoney(...), category})` so VoiceOver reads
"expense, twelve thousand won, groceries" rather than the visual "−₩12,000".

## 1.8 Changing a ledger's base currency

- If `ledgerItems.by_ledgerId_deletedAt_dayKey_occurredAt`
  `.eq('ledgerId', ledgerId).eq('deletedAt', undefined).first()` returns `null`, the ledger has zero
  live items and `ledgers.update` may apply a single `baseCurrency` patch. That field requires `OWNER`
  even though the rest of the mutation accepts `ADMIN`; the emptiness probe and patch are in the same
  Convex transaction. This is the day-one correction path.
- Otherwise `baseCurrency` is immutable in v1, with one migration-only exception:
  `ledgers.confirmCurrency` may run exactly once while `currencyIsAssumed === true`. It sets
  `maintenanceLock: 'CURRENCY'`, creates a resumable `CURRENCY_REBASE` row in `maintenanceJobs`, and
  re-derives every migrated row from `legacyRealAmount` at the confirmed currency exponent:
  `amountMinor = roundHalfAwayFromZero(abs(legacyRealAmount) * scaleOf(confirmedCurrency))` and
  `baseAmountMinor = amountMinor`. It then runs `ROLLUP_REBUILD`, writes `CURRENCY_CONFIRMED`, flips
  `currencyIsAssumed` to false, and unlocks. A second call is rejected.
- A populated non-migrated ledger cannot be re-denominated in v1. In particular, there is no
  `ledgers.baseCurrencyMigration` object and no mixed-currency-history divider. `SCHEMA.md` §10 records
  the v2 seam; until that feature is deliberately enabled, the UI tells the owner to create a new ledger.

## 1.9 Migrating legacy money

From note 02 §6, the legacy row is `{amount: string, realAmount: number}` with the sign carrying the
type, and there is **no currency on the ledger or the item** — currency was a device-level
`AsyncStorage['LOCALE']` setting.

```
for each legacy item:
  realAmount   := item.realAmount            (float, may be negative, may be missing)
  legacyKey    := item's RTDB push id
  type         := realAmount < 0 ? 'EXPENSE'
                : realAmount > 0 ? 'INCOME'
                : item.category?.category === 1 ? 'INCOME' : 'EXPENSE'
  currency     := ledger.baseCurrency                          (see below)
  amountMinor  := roundHalfAwayFromZero(Math.abs(realAmount) * scaleOf(currency))
  baseAmountMinor := amountMinor
  baseCurrency := currency
  fx*          := absent
```

`sign(realAmount)` is the authority, not `category.category`: the measured export contains 25,895
negative and 8,903 positive finite amounts, zero zero-valued rows, while `category.category` exists on
only 1,090 of 34,799 source children. The one remaining child is the measured ghost node and produces
no `ledgerItems` row. If the category flag disagrees with the sign, keep the sign-derived `type` and
write `AMOUNT_SIGN_CATEGORY_MISMATCH`; the zero fallback remains in code but is a zero-count cutover
assertion. The local real-export verification must assert exactly 25,895 imported expenses, 8,903
imported incomes, zero zeros, and one archived ghost child without committing or uploading `.local/`.

**Deriving the legacy ledger's currency** (there is no field to read):

1. Take every item in the ledger that still has a parsable `amount` display string. Extract its
   currency symbol/pattern and vote. `"₩-12,000"` → KRW, `"-$12.00"` → USD, `"-12.000 Rp"` → IDR.
2. Ties or no data → fall back to the ledger owner's `users/{uid}/info` locale if present, else `KRW`
   (the legacy user base is overwhelmingly Korean).
3. Record the decision on the ledger as `legacyCurrencySource: 'AMOUNT_VOTE' | 'OWNER_LOCALE' |
   'DEFAULT'` and surface a one-time in-app banner to the owner: *"We set this ledger's currency to
   ₩ KRW. Change it?"* — cheap, honest, and it makes a wrong guess a 2-tap fix instead of a support ticket.
4. Legacy dead/invalid codes are remapped before use:
   `IND→INR`, `BRN→BND`, `GRD→EUR`, `ITL→EUR`, `HRK→EUR`, `SVC→USD`, `AMD→AMD` (kept, symbol fixed),
   `VND`/`ZAR` symbol swap ignored entirely since we no longer store symbols.
5. `realAmount` values that are not finite, or whose `Math.abs(realAmount) * scale` is not a safe
   integer, are written to `migrationAnomalies` with the raw row and skipped — never guessed.

Fraction handling: for exponent-0 currencies a legacy `realAmount` of `12000.5` rounds to `12001`
minor units (= ₩12,001) and is logged. Legacy allowed such values because it parsed with
`parseFloat(str.match(/\d+/g))`.

---

# PART 2 — CATEGORIES

## 2.1 What the legacy did, and the four bugs to not reproduce

From note 02 §7.1 and note 04 §3.3: categories lived in a **device-local SQLite table**, seeded once at
install with the *already-translated* label, and each item persisted a denormalized snapshot
`{category: 0|1, iconId: 0..33, txt: '식사', showDelBtn: false}`.

1. Changing the app language never re-translated an existing category.
2. Categories were per-device, so two members of one shared ledger saw different names for the same
   `iconId`, and a custom category created by member A appeared to member B only as the frozen `txt`
   on the item.
3. `CATEGORIES_ICON[item.category.iconId].img` was read with **no bounds check** in `Tab1.tsx:224` and
   `Tab2.tsx:120` — a missing or out-of-range `iconId` crashed the list.
4. A pure UI flag (`showDelBtn`) leaked into the persisted model.

## 2.2 The model: presets in code, overlays in the database

**System presets are TypeScript, not rows.** Seeding 34 rows per ledger would be 34 writes at ledger
creation, 34 rows × N ledgers of storage, a schema-migration burden every time we add a preset, and a
read cost on a screen that renders on every entry. Instead:

- `SYSTEM_CATEGORIES` is a frozen array in `shared/categories.ts`, imported by both `convex/` and
  `src/`. A brand-new ledger reads **zero** category rows.
- The instant a member reorders, hides, renames or adds a category, the ledger is **materialized**:
  one mutation inserts the full overlay set (34 rows) plus the new custom row. From then on the
  picker is a single indexed `.take(121)` read of 34–~80 rows in normal use. A ledger is capped at
  120; row 121 is an invariant sentinel and is never silently hidden.

This is copy-on-write. The invariant is simple enough to hold in your head: *a ledger either has zero
`ledgerCategories` rows and uses the defaults verbatim, or it has a complete overlay set.* There is no
partial state to reason about.

```ts
// convex/schema/ledgerCategories.ts

export const ledgerCategoriesTable = defineTable({
  ledgerId: v.id('ledgers'),
  /** Stable identifier. Preset -> the SYSTEM_CATEGORIES slug ('meal'). Custom -> 'c_<8 chars>'. */
  key: v.string(),
  source: v.union(v.literal('PRESET'), v.literal('CUSTOM')),
  kind: v.union(v.literal('EXPENSE'), v.literal('INCOME')),
  /** A raw cpk-ui `IconName` such as 'ForkKnife'. Never an asset path or namespaced id. */
  iconKey: v.string(),
  /** Theme colour token name, e.g. 'category.red'. Never a hex. */
  colorToken: v.string(),
  /**
   * PRESET: undefined => render t(`category.${key}`); a string => the user renamed it.
   * CUSTOM: always a string (the user's literal label; never translated).
   */
  label: v.optional(v.string()),
  sortOrder: v.number(),                    // multiples of 10, so an insert needs no reflow
  hiddenAt: v.optional(v.number()),         // hidden from the picker, still resolves on old items
  archivedAt: v.optional(v.number()),       // soft-deleted
  /** Legacy Data.ts CATEGORIES_ICON id 0..33; present on PRESET rows and on recovered customs. */
  legacyIconId: v.optional(v.number()),
  createdBy: v.optional(v.id('users')),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_ledgerId_sortOrder', ['ledgerId', 'sortOrder'])
  .index('by_ledgerId_key', ['ledgerId', 'key'])
  .index('by_ledgerId_legacyIconId', ['ledgerId', 'legacyIconId']);
```

`ledgerItems.categoryKey: v.string()` holds the `key` — the slug for presets, `c_xxxxxxxx` for customs.
It is a plain string, not an `Id<'ledgerCategories'>`, precisely so an item written against a
zero-overlay ledger is valid, and so `by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt` is stable
when a category row is later archived and re-created.

### Resolution

```ts
// shared/categories.ts

import type {IconName} from 'cpk-ui';

export interface ResolvedCategory {
  key: string;
  kind: CategoryKind;                    // 'EXPENSE' | 'INCOME'  (see §2.3)
  iconKey: IconName;
  colorToken: string;
  /** i18n key for presets; undefined when `label` is set. */
  i18nKey?: string;
  /** Literal label for customs and renamed presets. */
  label?: string;
  sortOrder: number;
  hidden: boolean;
  archived: boolean;
}

export const UNCATEGORIZED: ResolvedCategory = {
  key: 'uncategorized',
  kind: 'EXPENSE',
  iconKey: 'Question',
  colorToken: 'category.grey',
  i18nKey: 'category.uncategorized',
  sortOrder: 999_999,
  hidden: true,          // never offered in the picker
  archived: false,
};

/** Client-side label resolution. `t` is the typed translator from src/STRINGS.ts. */
export const categoryLabel = (
  c: ResolvedCategory,
  t: (k: string) => string,
): string => c.label ?? (c.i18nKey ? t(c.i18nKey) : c.key);
```

Bug 3 above is closed structurally: `resolveCategory(key)` returns `UNCATEGORIZED` for anything
unknown, and the renderer passes the typed `iconKey` directly to cpk-ui's `<Icon>`. There is no array
index or asset lookup to go out of bounds.

## 2.3 The 34 presets — ready to paste

```ts
// shared/categories.ts

import type {IconName} from 'cpk-ui';

export type CategoryKind = 'EXPENSE' | 'INCOME';

export interface CategorySeed {
  /** Stable slug. Also the i18n key suffix: t(`category.${key}`). NEVER renumbered. */
  readonly key: string;
  readonly kind: CategoryKind;
  /** cpk-ui icon-font name; checked against the exported `IconName` union. */
  readonly icon: IconName;
  /** Data colour token; one of the 15 `CategoryColorToken`s, resolved by the app chart palette. */
  readonly colorToken: CategoryColorToken;
  /** Legacy Data.ts CATEGORIES_ICON id / INITIAL_CATEGORIES[n].iconId, 0..33. Migration key. */
  readonly legacyIconId: number;
  /** Legacy STRINGS.js flat key — consumed by scripts/convert-legacy-strings.mjs. */
  readonly legacyStringKey: string;
  /** Picker order. Multiples of 10 within each kind, so presets can be inserted later. */
  readonly sortOrder: number;
}

export const SYSTEM_CATEGORIES: readonly CategorySeed[] = [
  // ---------- EXPENSE (27) ----------
  {key:'meal',        kind:'EXPENSE', icon:'ForkKnife',          colorToken:'category.red',     legacyIconId:3,  legacyStringKey:'MEAL',         sortOrder:10},
  {key:'cafe',        kind:'EXPENSE', icon:'Coffee',             colorToken:'category.brown',   legacyIconId:0,  legacyStringKey:'CAFE',         sortOrder:20},
  {key:'snack',       kind:'EXPENSE', icon:'Cookie',             colorToken:'category.orange',  legacyIconId:2,  legacyStringKey:'SNACK',        sortOrder:30},
  {key:'drink',       kind:'EXPENSE', icon:'BeerBottle',         colorToken:'category.purple',  legacyIconId:1,  legacyStringKey:'DRINK',        sortOrder:40},
  {key:'transport',   kind:'EXPENSE', icon:'Bus',                colorToken:'category.blue',    legacyIconId:7,  legacyStringKey:'TRANSPORT',    sortOrder:50},
  {key:'car',         kind:'EXPENSE', icon:'Car',                colorToken:'category.navy',    legacyIconId:25, legacyStringKey:'CAR',          sortOrder:60},
  {key:'mobileFee',   kind:'EXPENSE', icon:'DeviceMobile',       colorToken:'category.teal',    legacyIconId:16, legacyStringKey:'MOBILE_FEE',   sortOrder:70},
  {key:'electric',    kind:'EXPENSE', icon:'Lightning',          colorToken:'category.yellow',  legacyIconId:28, legacyStringKey:'ELECTRIC',     sortOrder:80},
  {key:'maintenance', kind:'EXPENSE', icon:'Wrench',             colorToken:'category.slate',   legacyIconId:30, legacyStringKey:'MAINTENANCE',  sortOrder:90},
  {key:'wear',        kind:'EXPENSE', icon:'TShirt',             colorToken:'category.pink',    legacyIconId:9,  legacyStringKey:'WEAR',         sortOrder:100},
  {key:'stuffs',      kind:'EXPENSE', icon:'Basket',             colorToken:'category.grey',    legacyIconId:32, legacyStringKey:'STUFFS',       sortOrder:110},
  {key:'electronic',  kind:'EXPENSE', icon:'Television',         colorToken:'category.indigo',  legacyIconId:13, legacyStringKey:'ELECTRONIC',   sortOrder:120},
  {key:'furniture',   kind:'EXPENSE', icon:'Couch',              colorToken:'category.brown',   legacyIconId:14, legacyStringKey:'FURNITURE',    sortOrder:130},
  {key:'hospital',    kind:'EXPENSE', icon:'FirstAid',           colorToken:'category.red',     legacyIconId:17, legacyStringKey:'HOSPITAL',     sortOrder:140},
  {key:'insurance',   kind:'EXPENSE', icon:'ShieldCheck',        colorToken:'category.green',   legacyIconId:29, legacyStringKey:'INSURANCE',    sortOrder:150},
  {key:'education',   kind:'EXPENSE', icon:'GraduationCap',      colorToken:'category.blue',    legacyIconId:27, legacyStringKey:'EDUCATION',    sortOrder:160},
  {key:'culture',     kind:'EXPENSE', icon:'Ticket',             colorToken:'category.purple',  legacyIconId:26, legacyStringKey:'CULTURE',      sortOrder:170},
  {key:'movie',       kind:'EXPENSE', icon:'FilmSlate',          colorToken:'category.indigo',  legacyIconId:5,  legacyStringKey:'MOVIE',        sortOrder:180},
  {key:'exercise',    kind:'EXPENSE', icon:'Barbell',            colorToken:'category.lime',    legacyIconId:8,  legacyStringKey:'EXERCISE',     sortOrder:190},
  {key:'membership',  kind:'EXPENSE', icon:'IdentificationCard', colorToken:'category.teal',    legacyIconId:31, legacyStringKey:'MEMBERSHIP',   sortOrder:200},
  {key:'travel',      kind:'EXPENSE', icon:'Airplane',           colorToken:'category.sky',     legacyIconId:15, legacyStringKey:'TRAVEL',       sortOrder:210},
  {key:'sleep',       kind:'EXPENSE', icon:'Bed',                colorToken:'category.navy',    legacyIconId:10, legacyStringKey:'SLEEP',        sortOrder:220},
  {key:'dating',      kind:'EXPENSE', icon:'Heart',              colorToken:'category.pink',    legacyIconId:4,  legacyStringKey:'DATING',       sortOrder:230},
  {key:'gift',        kind:'EXPENSE', icon:'Gift',               colorToken:'category.red',     legacyIconId:12, legacyStringKey:'GIFT',         sortOrder:240},
  {key:'baby',        kind:'EXPENSE', icon:'Baby',               colorToken:'category.sky',     legacyIconId:11, legacyStringKey:'BABY',         sortOrder:250},
  {key:'pet',         kind:'EXPENSE', icon:'Dog',                colorToken:'category.orange',  legacyIconId:6,  legacyStringKey:'PET',          sortOrder:260},
  {key:'tax',         kind:'EXPENSE', icon:'Receipt',            colorToken:'category.slate',   legacyIconId:33, legacyStringKey:'TAX',          sortOrder:270},

  // ---------- INCOME (7) ----------
  {key:'salary',      kind:'INCOME',  icon:'Money',           colorToken:'category.green',  legacyIconId:19, legacyStringKey:'SALARY',       sortOrder:1010},
  {key:'bonus',       kind:'INCOME',  icon:'Trophy',          colorToken:'category.lime',   legacyIconId:20, legacyStringKey:'BONUS',        sortOrder:1020},
  {key:'walletMoney', kind:'INCOME',  icon:'Wallet',          colorToken:'category.teal',   legacyIconId:18, legacyStringKey:'WALLET_MONEY', sortOrder:1030},
  {key:'sellProduct', kind:'INCOME',  icon:'Storefront',      colorToken:'category.blue',   legacyIconId:21, legacyStringKey:'SELL_PRODUCT', sortOrder:1040},
  {key:'award',       kind:'INCOME',  icon:'Medal',           colorToken:'category.yellow', legacyIconId:22, legacyStringKey:'AWARD',        sortOrder:1050},
  {key:'present',     kind:'INCOME',  icon:'HandHeart',       colorToken:'category.pink',   legacyIconId:23, legacyStringKey:'PRESENT',      sortOrder:1060},
  {key:'extra',       kind:'INCOME',  icon:'DotsThreeCircle', colorToken:'category.grey',   legacyIconId:24, legacyStringKey:'EXTRA',        sortOrder:1070},
] as const;

export const EXPENSE_PRESETS = SYSTEM_CATEGORIES.filter((c) => c.kind === 'EXPENSE'); // 27
export const INCOME_PRESETS  = SYSTEM_CATEGORIES.filter((c) => c.kind === 'INCOME');  // 7

export const PRESET_BY_KEY = new Map(SYSTEM_CATEGORIES.map((c) => [c.key, c]));
export const PRESET_BY_LEGACY_ICON_ID = new Map(SYSTEM_CATEGORIES.map((c) => [c.legacyIconId, c]));
export const MAX_CATEGORIES_PER_LEDGER = 120;
export const CATEGORY_SCAN_LIMIT = MAX_CATEGORIES_PER_LEDGER + 1; // sentinel row
```

Changes from the legacy taxonomy, and why:

1. **Reordered.** Legacy `sortOrder === legacyIconId`, which put the entire income block (18–24) in
   the middle of the expense list and appended 25–33 (car, culture, education, …) after it, because
   they shipped in a later update (`ANNOUNCEMENT_TXT_6`). The new order groups expenses by
   *frequency of use in a Korean household ledger* — food first, then transport, then fixed bills,
   then discretionary — and puts income in its own block. `legacyIconId` is preserved so the data
   migration is unaffected by the reorder.
2. **`sortOrder` is a multiple of 10 with a 1000 offset for income**, so a new preset can be inserted
   between two existing ones in a future release without renumbering anyone's overlay rows.
3. **`key` is the migration identity, not `legacyIconId`.** `legacyIconId` exists only to translate
   the Firebase export.
4. **Added `uncategorized`** (not in the array; see `UNCATEGORIZED` in §2.2) as the terminal fallback.

## 2.4 Icons: cpk-ui's built-in icon font — DECIDED

`design/category-icons.md` is authoritative. BooKoo ships no category PNG or SVG assets and no second
category-icon font. Both presets and customs store a cpk-ui `IconName`, selected from the exported
`iconList`, and render directly:

```tsx
import {Icon, type IconName} from 'cpk-ui';

export interface CategoryIconProps {
  iconKey: IconName;
  size?: number;
  color: string;
}

export const CategoryIcon = ({iconKey, size = 24, color}: CategoryIconProps): JSX.Element =>
  <Icon name={iconKey} size={size} color={color} />;
```

The same font is already registered by `app.config.ts`, so category rendering adds no asset preload or
runtime dispatcher. `IconName` makes preset typos compile errors; custom choices come from `iconList`.
The normal cpk-ui `color` prop supplies theme tinting for light, dark, and ledger-accent surfaces.

## 2.5 Reorder / hide / rename / add / delete

All category mutations are **per-ledger and shared**, not per-user. The single worst legacy category
bug was that they were per-device; making them per-user would recreate it in a nicer wrapper. Two
members of a household must see the same category list, or the ledger is not shared. (A future
per-user *pinning* layer is possible as `userCategoryPrefs`, but it never affects labels or existence.)

Permission follows the four-role sharing matrix. `create` requires `MEMBER`; additive custom categories are
safe for ordinary writers. `reorder`, `rename`, `setHidden`, and `archive` require `ADMIN` because they
change the shared taxonomy or historical presentation. `VIEWER` gets a read-only picker. The helper is the
rank-minimum `requireLedgerRole(ctx, ledgerId, minimum)`, never an array guard.

```ts
// convex/categories/mutations.ts  (signatures + the parts that matter)

/** Idempotent. Inserts the 34 preset overlay rows iff the ledger has none. Bounded: 34 writes. */
const materialize = async (ctx: MutationCtx, ledgerId: Id<'ledgers'>): Promise<void> => {
  const existing = await ctx.db.query('ledgerCategories')
    .withIndex('by_ledgerId_sortOrder', (q) => q.eq('ledgerId', ledgerId))
    .first();
  if (existing) return;
  const now = Date.now();
  for (const c of SYSTEM_CATEGORIES) {
    await ctx.db.insert('ledgerCategories', {
      ledgerId, key: c.key, source: 'PRESET', kind: c.kind, iconKey: c.icon,
      colorToken: c.colorToken, sortOrder: c.sortOrder, legacyIconId: c.legacyIconId,
      createdAt: now, updatedAt: now,
    });
  }
};

export const reorder = mutation({
  args: {ledgerId: v.id('ledgers'), orderedKeys: v.array(v.string())},
  handler: async (ctx, {ledgerId, orderedKeys}) => {
    await requireLedgerRole(ctx, ledgerId, 'ADMIN');
    await materialize(ctx, ledgerId);
    if (orderedKeys.length > MAX_CATEGORIES_PER_LEDGER) {
      throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
    }
    const rows = await ctx.db.query('ledgerCategories')
      .withIndex('by_ledgerId_sortOrder', (q) => q.eq('ledgerId', ledgerId))
      .take(CATEGORY_SCAN_LIMIT);
    if (rows.length > MAX_CATEGORIES_PER_LEDGER) {
      throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
    }
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const now = Date.now();
    // Renumber only rows whose position actually changed -> smaller write set, fewer OCC conflicts.
    for (let i = 0; i < orderedKeys.length; i++) {
      const row = byKey.get(orderedKeys[i]);
      const next = (i + 1) * 10;
      if (row && row.sortOrder !== next) {
        await ctx.db.patch('ledgerCategories', row._id, {sortOrder: next, updatedAt: now});
      }
    }
  },
});

export const setHidden = mutation({ /* require ADMIN; ledgerId, key, hidden: boolean -> patch hiddenAt */ });

export const rename = mutation({
  args: {ledgerId: v.id('ledgers'), key: v.string(), label: v.optional(v.string())},
  // Handler begins with requireLedgerRole(ctx, ledgerId, 'ADMIN').
  // PRESET + label === undefined  -> clears the override, reverts to t(`category.${key}`).
  // PRESET + label === 'string'   -> user override; NEVER re-translated on locale change.
  // CUSTOM  + label === undefined -> rejected (a custom category must have a label).
});

export const create = mutation({
  args: {
    ledgerId: v.id('ledgers'), kind: kindValidator, label: v.string(),
    iconKey: v.string(), colorToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLedgerRole(ctx, args.ledgerId, 'MEMBER');
    // A MEMBER's first custom category materializes the overlay. This is intentional.
    await materialize(ctx, args.ledgerId);
    assertIconName(args.iconKey);                   // member of cpk-ui's exported iconList
    const label = args.label.trim();
    if (label.length === 0 || label.length > 40) {
      throw appError('CATEGORY_INVALID', 'error.categoryLabel');
    }

    // Ledger-scoped unique key. Same OCC argument as the username claim (note 09 §12.2):
    // the check and the insert are in ONE mutation and the check is an exact .eq() on an index,
    // so a colliding concurrent insert invalidates our read set and Convex retries us.
    let key = `c_${randomKey(8)}`;
    const clash = await ctx.db.query('ledgerCategories')
      .withIndex('by_ledgerId_key', (q) => q.eq('ledgerId', args.ledgerId).eq('key', key))
      .unique();
    if (clash) key = `c_${randomKey(8)}_${Date.now().toString(36)}`;
    // ...insert with sortOrder = (max sortOrder within kind) + 10
  },
});

export const archive = mutation({
  args: {
    ledgerId: v.id('ledgers'), key: v.string(),
    /** When present, every item using `key` is moved here before the category is archived. */
    reassignTo: v.optional(v.string()),
  },
  // Handler begins with requireLedgerRole(ctx, ledgerId, 'ADMIN').
});
```

The implementation inventory is checked against `sharing-invites.md` §1.4 rows 10–11:

| Function | Minimum role | First operation after the guard |
|---|---|---|
| `categories.create` | `MEMBER` | `materialize` (intentional for a MEMBER's first custom category) |
| `categories.reorder` | `ADMIN` | `materialize` |
| `categories.rename` | `ADMIN` | `materialize` |
| `categories.setHidden` | `ADMIN` | `materialize` |
| `categories.archive` | `ADMIN` | indexed emptiness probe; materialize first if no overlay exists |

### Deleting a category that has entries

Never a hard delete when entries exist. The `archive` mutation:

1. **Checks emptiness in O(1)**:
   ```ts
   const anyItem = await ctx.db.query('ledgerItems')
     .withIndex('by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt', (q) =>
       q.eq('ledgerId', ledgerId).eq('deletedAt', undefined).eq('categoryKey', key))
     .first();
   ```
   One index probe, no scan. (`categoryKey` follows the tenant and live-row discriminator.)
2. **Empty and `source === 'CUSTOM'`** → hard `delete`. Nothing references it.
3. **Empty and `source === 'PRESET'`** → set `hiddenAt`, never delete: a preset row deleted from the
   overlay set would break the "complete overlay set" invariant.
4. **Non-empty, no `reassignTo`** → the UI does not offer plain delete. It offers *hide*
   (`hiddenAt`), which removes it from the picker while every historical entry keeps rendering its
   correct name and icon. This is the default and the right answer for 95 % of cases: users want
   "stop showing me this", not "rewrite my history".
5. **Non-empty, with `reassignTo`** → schedule
   `internal.categories.reassignBatch({ledgerId, from, to, cursor})`. Each batch:
   - paginates `by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt` (200 items),
   - patches `categoryKey` on each,
   - applies a rollup delta for each item: `−baseAmountMinor` on `(monthKey, from)` and
     `+baseAmountMinor` on `(monthKey, to)` — the whole-month row is untouched because the month total
     does not change,
   - reschedules itself with the next cursor, or sets `archivedAt` on the source row when done.
   Idempotent by `(ledgerId, from, cursor)` per note 13 §5.4, so an action retry cannot double-count.
   The category shows a "moving entries…" state while `reassignState === 'RUNNING'` and cannot be
   picked for new entries.
6. **Archived categories still resolve.** `resolveCategory` reads the row regardless of `archivedAt`;
   only the picker filters on `hiddenAt == null && archivedAt == null`.

### The picker query, and its cost

```ts
export const listForLedger = query({
  args: {ledgerId: v.id('ledgers')},
  handler: async (ctx, {ledgerId}) => {
    await requireLedgerMember(ctx, ledgerId);          // O(1) via ledgerMembers.by_ledgerId_userId
    const rows = await ctx.db.query('ledgerCategories')
      .withIndex('by_ledgerId_sortOrder', (q) => q.eq('ledgerId', ledgerId))
      .take(CATEGORY_SCAN_LIMIT);                     // 0 rows, or 34..120 + sentinel
    if (rows.length > MAX_CATEGORIES_PER_LEDGER) {
      throw appError('CATEGORY_INVALID', 'error.tooManyCategories');
    }
    if (rows.length === 0) return SYSTEM_CATEGORIES.map(toResolved);   // zero-read fast path
    return rows.map(toResolvedRow);
  },
});
```

Read set: one index range over at most 121 documents. The extra sentinel turns a broken 120-row
invariant into a visible failure instead of a silently truncated picker; `.collect()` is not used.

### Smart ordering (a modernization, not a port)

`ledgerCategoryStats {ledgerId, key, useCount, lastUsedAt}` indexed `by_ledgerId_key`, patched by the
same trigger that maintains the rollups. The picker renders a **"recent" row of 8** above the full
grid, ordered by `lastUsedAt`. Cost: one extra bounded read (≤120 rows) and one extra patch per entry
write. Payoff: the two-tap entry flow becomes one tap for the ~80 % of entries that reuse a recent
category. The legacy app made you scan a 34-icon grid every single time.

## 2.6 Migrating legacy categories

Input per legacy item: `{category: 0|1, iconId: 0..33, txt: '<translated at install time>',
showDelBtn: boolean}` — and **no server-side category table exists at all**. `showDelBtn` is a UI hint,
not a classification signal; the measured export contains both values.

```
STEP 1 — classify every distinct (ledgerKey, iconId, txt) triple in the export.
  For each ledger, scan its items and build:  Map<`${iconId}|${txt}`, count>

STEP 2 — decide preset vs custom, per triple:
  preset := PRESET_BY_LEGACY_ICON_ID.get(iconId)
  if (preset === undefined)                       -> UNRECOVERABLE  (see step 5)
  if (txt is empty)                               -> PRESET
  if (txt ∈ LEGACY_LABELS[preset.key])            -> PRESET      // matches any of the 5 locales
  else                                            -> CUSTOM      // user typed their own name

  LEGACY_LABELS is built from BooKooLegacy/STRINGS.js: for each preset key, the set
  { STRINGS[loc][preset.legacyStringKey] | loc ∈ {en,ko,ja,zh,id} }, trimmed and NFC-normalized.
  This is the ONLY way to recover custom categories, because they never left the device —
  their sole surviving trace is the denormalized `txt` snapshot on the items.

STEP 3 — materialize the ledger (all 34 preset rows) iff any CUSTOM triple was found,
  or if any preset was renamed. Otherwise leave the ledger with zero overlay rows.

STEP 4 — for each CUSTOM triple, insert:
  { ledgerId, key: `c_${stableHash(iconId, txt)}`, source: 'CUSTOM',
    kind: preset.kind,
    iconKey: preset.icon,                       // reuse the cpk-ui icon the user picked
    colorToken: preset.colorToken,
    label: txt,                                 // literal, never translated
    legacyIconId: iconId,
    sortOrder: <after the presets of that kind>,
    createdAt: <ledger.created>, updatedAt: now }
  `stableHash` is deterministic, so re-running the migration produces the same key (idempotent).

STEP 5 — write each item's categoryKey:
  PRESET triple      -> preset.key
  CUSTOM triple      -> the c_… key from step 4
  UNRECOVERABLE      -> 'uncategorized', and copy `txt` into ledgerItems.legacyCategoryLabel
                        so nothing the user typed is lost; the entry detail screen shows it
                        as a hint and offers a one-tap "assign a category".

STEP 6 — kind conflicts. The item's `categoryKey` follows the preset selected by `iconId`, and the
  category row keeps `PRESET.kind`; the item's `type` independently follows `sign(realAmount)` (§1.9).
  If those disagree, keep both and write `CATEGORY_KIND_CONFLICT`. If `category.category` also
  disagrees with the sign, write `AMOUNT_SIGN_CATEGORY_MISMATCH`; neither flag may flip the item.
```

Legacy `showDelBtn` is dropped entirely. Legacy `txt` is dropped for preset rows (it is a stale
translation) and preserved as `label` for custom rows.

**Measured cap gate.** Applying this exact five-locale classifier to the frozen production export yields
1,598 CUSTOM triples across 505 ledgers, zero unrecoverable triples, and at most 54 customs in one
ledger. A complete overlay there is **88 rows** (34 presets + 54 customs), below the 120 cap. P6 freezes
these aggregates in `.local/migration/reports/categories.json` and fails before writing if any ledger
exceeds 120.

## 2.7 The category translations — corrected

The legacy category strings contain nine outright mistranslations (note 04 §3.1) plus one that recon
did not flag: **`FURNITURE` reads "home appliances" in ko/ja/zh** (`가전제품` / `家電製品` / `家用电器`),
colliding with `ELECTRONIC` (`전자제품` / `電子製品` / `电子产品`). Both slots meant "electronics" and
nothing meant "furniture". Corrected set, to be pasted into `assets/langs/*.json` under `category`:

| key | en | ko | ja | zh | id |
|---|---|---|---|---|---|
| meal | Meal | 식사 | 食事 | 餐饮 | Makan |
| cafe | Cafe | 카페 | カフェ | 咖啡 | Kafe |
| snack | Snack | 간식 | おやつ | 零食 | Camilan |
| drink | Drinks | 술 | お酒 | 酒水 ✎ | Minuman ✎ |
| transport | Transport | 교통비 | 交通費 | 交通费 | Transportasi |
| car | Car | 자동차 | 自動車 | 汽车 | Mobil ✎ |
| mobileFee | Phone & internet | 통신비 | 通信費 | 通讯费 | Komunikasi |
| electric | Electricity | 전기요금 | 電気代 | 电费 ✎ | Listrik |
| maintenance | Maintenance fee | 관리비 | 管理費 | 物业费 | Pemeliharaan |
| wear | Clothing | 의류 | 衣類 | 服装 | Pakaian |
| stuffs | Sundries | 잡화 | 雑貨 | 杂货 | Barang |
| electronic | Electronics | 전자제품 | 電子製品 | 电子产品 | Elektronik |
| furniture | Furniture | 가구 ✎ | 家具 ✎ | 家具 ✎ | Perabot ✎ |
| hospital | Health | 병원 | 病院 | 医疗 | Kesehatan |
| insurance | Insurance | 보험 | 保険 | 保险 | Asuransi |
| education | Education | 교육 | 教育 | 教育 | Pendidikan |
| culture | Culture | 문화 | 文化 | 文化 | Budaya |
| movie | Movies | 영화 | 映画 | 电影 | Film |
| exercise | Fitness | 운동 | 運動 | 运动 | Olahraga |
| membership | Membership | 멤버십 ✎ | 会費 | 会员费 ✎ | Keanggotaan |
| travel | Travel | 여행 | 旅行 | 旅游 | Perjalanan |
| sleep | Lodging | 숙박 | 宿泊 | 住宿 | Penginapan |
| dating | Dating | 데이트 | デート | 约会 ✎ | Kencan ✎ |
| gift | Gift money | 경조사비 | 慶弔費 | 礼金支出 ✎ | Hadiah |
| baby | Baby | 유아용품 | ベビー用品 | 婴儿用品 | Bayi |
| pet | Pet | 반려동물 ✎ | ペット ✎ | 宠物 ✎ | Hewan peliharaan ✎ |
| tax | Tax | 세금 | 税金 | 税金 | Pajak |
| salary | Salary | 월급 | 給料 | 工资 | Gaji |
| bonus | Bonus | 보너스 | ボーナス | 奖金 | Bonus |
| walletMoney | Allowance | 용돈 | 小遣い | 零用钱 ✎ | Uang saku |
| sellProduct | Sales | 물품판매 | 物品販売 | 出售商品 | Penjualan barang |
| award | Prize | 상금 | 賞金 | 赏金 ✎ | Hadiah uang |
| present | Gift received | 선물받음 ✎ | 贈り物 ✎ | 礼金收入 ✎ | Hadiah diterima ✎ |
| extra | Other income | 기타 수입 ✎ | その他収入 ✎ | 其他收入 ✎ | Pemasukan lain ✎ |
| uncategorized | Uncategorized | 미분류 | 未分類 | 未分类 | Tanpa kategori |

✎ = changed from the legacy value. `gift` (expense, 경조사비) and `present` (income, 선물받음) no longer
collide; `bonus` and `award` no longer both read `奖金`; `extra` no longer reads `吉他` ("guitar"); the
trailing space in the Indonesian `"TAMBAHAN "` is gone; `car` no longer reads `pajak` ("tax"); the
legacy ALL-CAPS Indonesian shouting is normalized to sentence case.

---

# PART 3 — I18N

## 3.1 Languages shipped

**Eleven: `en`, `ko`, `ja`, `zh`, `id`, `de`, `es`, `fr`, `it`, `nl`, `pt`.**

`ko`/`en`/`ja` are the stated minimum. `zh` and `id` are **legacy parity** — real production users
chose them (note 04 §4) and dropping a language during a migration is a regression the user sees on
first launch. `zh` is **Simplified** (the legacy values are 简体), and the picker label is
corrected from the legacy `中國語` (Traditional glyphs on a Simplified bundle) to `简体中文`.

`de`/`es`/`fr`/`it`/`nl`/`pt` are the developed-country expansion requested for launch (French,
Spanish, German, Italian, Dutch, Portuguese). Native names in the picker; editorial FAQ/notice
rows may still fall back to English until those catalogs are authored per locale.

Normalized to bare BCP-47 primary subtags. The legacy picker stored `en_US` while `getString` did
`LANG.substring(0, 2)` — an inconsistency that happened to work (note 04 §4). Not carried forward.

```ts
export const SUPPORTED_LOCALES = [
  'en', 'ko', 'ja', 'zh', 'id', 'de', 'es', 'fr', 'it', 'nl', 'pt',
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';
```

Adding further locales (`sv`, `pl`, Traditional `tw`, …) is a JSON file plus the shared locale list
and Convex `localeValidator`. Keep those three in lockstep.

## 3.2 File layout

```
assets/langs/
├── en.json          # SOURCE OF TRUTH for the NestedKeys<> type and for eslint identical-keys
├── ko.json
├── ja.json
├── zh.json
├── id.json
├── de.json
├── es.json
├── fr.json
├── it.json
├── nl.json
├── pt.json
└── meta/
    ├── en.json      # android.app_name, ios.CFBundleDisplayName, ios.NS*UsageDescription
    ├── ko.json
    ├── ja.json
    ├── zh.json
    ├── id.json
    ├── de.json
    ├── es.json
    ├── fr.json
    ├── it.json
    ├── nl.json
    └── pt.json
```

Two-level nesting, camelCase leaves, `{{name}}` interpolation (Martie's shape, note 04 §9.1).
Top-level namespaces:

`common`, `auth`, `calendar`, `intro`, `tutorial`, `tabs`, `ledger`, `ledgerItem`, `category`,
`member`, `settings`, `permission`, `lock`, `money`, `error`, `a11y`.

`money`, `error` and `a11y` are new. `announcement` and `faq` are deliberately absent — both kinds
become rows in `appAnnouncements` (`kind: 'NOTICE' | 'FAQ'`) so content ships without an app release
(note 04 §8.4).

`meta/*.json` is consumed by `app.config.ts` via Expo's `locales` field, which is what gives the
iOS permission dialogs per-locale text. The legacy `app.json` had English-only `infoPlist` strings
while the same copy existed (in five languages) inside `STRINGS.js` and was never used natively.

## 3.3 The loader and typed keys

Copied from Martie with two changes (note 07 §8.2, note 04 §9.2).

```ts
// src/STRINGS.ts
import * as Localization from 'expo-localization';

import en from '../assets/langs/en.json';
import id from '../assets/langs/id.json';
import ja from '../assets/langs/ja.json';
import ko from '../assets/langs/ko.json';
import zh from '../assets/langs/zh.json';

import {storage, Storage} from './utils/storage';

// ad-hoc: https://github.com/fnando/i18n/issues/26#issuecomment-1225775247
// `import {I18n} from 'i18n-js'` resolves to the ESM build and breaks under Metro.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {I18n} = require('i18n-js/dist/require/index');

const i18n = new I18n({en, ko, ja, zh, id});
i18n.defaultLocale = 'en';
i18n.enableFallback = true;
// A missing key must be LOUD in dev and silent-but-reported in prod. The legacy getString()
// returned the literal '...' for any missing key, which is why four keys rotted unnoticed.
i18n.missingBehavior = __DEV__ ? 'error' : 'guess';
i18n.missingTranslation.register('report', (_i18n, scope) => {
  reportMissingTranslation(String(scope));            // hashed key in D6's local bounded diagnostic ring
  return String(scope).split('.').pop() ?? '';
});

const getInitialLocale = (): SupportedLocale => {
  const stored = storage.getString(Storage.Locale) as SupportedLocale | undefined;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const device = Localization.getLocales()[0]?.languageCode;
  return (SUPPORTED_LOCALES as readonly string[]).includes(device ?? '')
    ? (device as SupportedLocale)
    : DEFAULT_LOCALE;
};
i18n.locale = getInitialLocale();

type NestedKeys<T> = T extends object
  ? {
      [K in keyof T]: K extends string | number
        ? `${K}` | (T[K] extends object ? `${K}.${NestedKeys<T[K]>}` : never)
        : never;
    }[keyof T]
  : '';

/** The ONLY translation entry point. `param` is a compile-time-checked dotted key. */
export const t = (
  param: NestedKeys<typeof en>,
  mapObj?: Record<string, string | number>,
  locale?: SupportedLocale,
): string => {
  const current = i18n.locale;
  if (locale) i18n.locale = locale;
  const translation = i18n.t(param, mapObj);
  i18n.locale = current;
  return translation;
};

export const getLocale = (): SupportedLocale => i18n.locale as SupportedLocale;
export {i18n};
```

**Rules that keep `t(x as any)` from ever appearing:**

1. `t` takes `NestedKeys<typeof en>`. Any typo is a compile error.
2. Dynamic keys are built through a **typed helper**, never a cast:
   ```ts
   // shared/categories.ts
   export type CategoryI18nKey = `category.${string}`;
   export const categoryI18nKey = (key: string): CategoryI18nKey => `category.${key}`;
   ```
   and the call site is `t(categoryI18nKey(c.key) as NestedKeys<typeof en>)`… — no. That is still a
   cast. The correct construction, and the one we use:
   ```ts
   // The union of preset keys is known at compile time, so the union of i18n keys is too.
   export type PresetKey = (typeof SYSTEM_CATEGORIES)[number]['key'];   // 'meal' | 'cafe' | ...
   export const categoryI18nKey = <K extends PresetKey>(key: K): `category.${K}` =>
     `category.${key}`;
   ```
   `t(categoryI18nKey('meal'))` type-checks with zero casts because `category.meal` is a member of
   `NestedKeys<typeof en>`. Custom categories never go through `t` at all — they carry a literal `label`.
3. ESLint bans `as any` and bans `t(` with a non-literal, non-`categoryI18nKey` argument via a small
   `no-restricted-syntax` rule.

### Parity enforcement (the single highest-value process fix)

```jsonc
// .eslintrc.json (json overrides block)
{
  "files": ["assets/langs/*.json"],
  "plugins": ["i18n-json"],
  "rules": {
    "i18n-json/valid-json": 2,
    "i18n-json/sorted-keys": [2, {"order": "asc", "indentSpaces": 2}],
    "i18n-json/identical-keys": [2, {"filePath": "./assets/langs/en.json"}],
    "i18n-json/valid-message-syntax": [2, {"syntax": "non-empty-string"}]
  }
}
```

```json
"lint:i18n": "eslint --fix --ext .json --format node_modules/eslint-plugin-i18n-json/formatter.js assets/langs/",
"lint:all": "bun lint && bun lint:i18n && bun tsx scripts/verify-langs.ts"
```

`identical-keys` against `en.json` is exactly the guard the legacy lacked: `PERMISSION_REQUEST_CAMERA_ROLL`
existed only in `en`, `id` was missing four keys and carried three strays including a mistranslated
`DIMINTA`, and `PERMISSION_CAMERA_NOT_GRANTED` was *called from code but defined nowhere* (note 04 §2).
`scripts/verify-langs.ts` adds what the eslint plugin cannot check: that every `{{placeholder}}` present
in `en` is present in every other locale with the same name, and vice versa. Wired into CI.

## 3.4 Locale switching, and where the locale is stored

```ts
// src/hooks/useLocale.ts  (Martie's pattern; i18n-js is not reactive on its own)
let localeListeners: ((l: SupportedLocale) => void)[] = [];

export const useLocale = () => {
  const [locale, setLocaleState] = useState<SupportedLocale>(getLocale);

  const setLocale = useCallback((next: SupportedLocale) => {
    storage.set(Storage.Locale, next);          // MMKV — synchronous, not SecureStore
    i18n.locale = next;
    setLocaleState(next);
    localeListeners.forEach((fn) => fn(next));
    void convex.mutation(api.users.setPreferredLocale, {locale: next});   // fire-and-forget
  }, []);

  useEffect(() => {
    localeListeners.push(setLocaleState);
    return () => { localeListeners = localeListeners.filter((f) => f !== setLocaleState); };
  }, []);

  return {locale, setLocale};
};
```

Two deviations from Martie, both required by BooKoo being a *shared* app:

1. **The locale is mirrored to the server** as `userProfiles.preferredLocale`. Push notifications and
   invite emails are rendered server-side per recipient. Legacy rendered
   `sendNotiToUsersInLedger(..., ADD_LEDGER_ITEM_NOTI, ...)` on the *sender's* device in the *sender's*
   language and pushed that string to everyone (note 01 line 681) — a Japanese member got Korean pushes.
   Notification rows store `titleKey` / `bodyKey` / `params` + an English `fallbackText`, never a
   rendered string (note 09 §11.2).
2. **Locale lives in MMKV, not SecureStore.** It is not a secret and it is read on the boot path;
   SecureStore reads are slow enough to be felt.

Changing the locale does **not** require an app reload. The legacy `Tab4` had to call
`route.params.reload()` → `Main.changeTab('tab4')` as a forced-remount hack because
`FormattedProvider` read the store once at render (note 01 §5.11). The listener array above makes it
reactive.

## 3.5 Pluralization

`Intl.PluralRules` is **not implemented in Hermes**, so we use i18n-js's own pluralization and register
per-language pluralizers.

```ts
// src/STRINGS.ts (continued)
type Pluralizable = {zero?: string; one?: string; other: string};

/** ko / ja / zh / id have no grammatical plural: always 'other'. */
const otherOnly = (_i18n: unknown, count: number, translation: Pluralizable): string[] =>
  count === 0 && translation.zero !== undefined ? ['zero'] : ['other'];

i18n.pluralization.register('ko', otherOnly);
i18n.pluralization.register('ja', otherOnly);
i18n.pluralization.register('zh', otherOnly);
i18n.pluralization.register('id', otherOnly);
// 'en' uses i18n-js's default (one / other). Register 'default' explicitly so a future
// locale added without a pluralizer falls back predictably rather than throwing.
i18n.pluralization.register('default', i18n.pluralization.default);
```

```json
// en.json
"ledger": {
  "memberCount": {"one": "{{count}} member", "other": "{{count}} members"},
  "itemCount":   {"zero": "No entries", "one": "{{count}} entry", "other": "{{count}} entries"}
}
```
```json
// ko.json
"ledger": {
  "memberCount": {"other": "멤버 {{count}}명"},
  "itemCount":   {"zero": "내역 없음", "other": "내역 {{count}}건"}
}
```

`identical-keys` would flag ko's missing `one`, so the eslint config adds an exception path for
plural sub-objects (`ignoreKeys: ["**.one", "**.zero"]`) and `scripts/verify-langs.ts` enforces the
real rule instead: *every plural object must contain `other`, and may contain `zero`/`one`.*

The count itself is formatted before interpolation — `{{count}}` is passed as a **pre-formatted
string** from our own grouping formatter, so `1,234 entries` groups correctly in `en` and
`1.234개` in `id`, without depending on `Intl` inside i18n-js.

## 3.6 How category and currency names localize

| Thing | Mechanism |
|---|---|
| **Preset category** | `t(categoryI18nKey(key))` at render time, from `assets/langs/*.json` → `category.*`. Changing the app language re-renders every category label immediately. This is the direct fix for the legacy's translate-once-at-install SQLite bug. |
| **Renamed preset** | `ledgerCategories.label` wins over the i18n key. The user's override is a literal and is never re-translated — that is the point of overriding. |
| **Custom category** | `label` only. Never translated, never guessed. Shared across the ledger, so all members see the same words in whatever language the creator typed. |
| **Currency symbol** | `currencyChrome(locale, code).symbol` — derived from `Intl`, cached. No hand-maintained symbol column (the legacy one had `EUR → '$'` and `ZAR → 'VND'`). |
| **Currency display name** | `Intl.DisplayNames` is **not in Hermes**, so: try `new Intl.NumberFormat(locale, {style:'currency', currency, currencyDisplay:'name'}).format(0)` and strip the digits; if that yields nothing useful, fall back to the ISO code. The picker always shows the code, so the name is decoration and a fallback is never a broken row. For the ~12 currencies our users actually pick we also ship literal `currency.<CODE>` keys in the langs files, which take priority. |
| **Language names in the picker** | Always in the language itself (`English`, `한국어`, `日本語`, `简体中文`, `Bahasa Indonesia`), never translated. A user hunting for their language must recognize it without already reading the current one. |
| **Month / weekday names** | `date-fns` locale objects, not `Intl` (§4.2). The legacy shipped 19 hand-written `SUN`…`SAT` / `JAN`…`DEC` keys; all 19 are dropped. |

## 3.7 RTL readiness

No RTL locale ships in v1 (`ar`, `he`, `fa` are not in the set), but the codebase is RTL-*ready* so
adding one is a JSON file and not a refactor:

1. **`I18nManager.allowRTL(true)` at boot**, `forceRTL` never called. Direction is read from
   `Localization.getLocales()[0].textDirection` (`'ltr' | 'rtl'`), which `expo-localization` provides.
2. **Logical style properties only.** ESLint `no-restricted-syntax` bans `marginLeft`, `marginRight`,
   `paddingLeft`, `paddingRight`, `left`, `right`, `textAlign: 'left'|'right'` inside kstyled blocks;
   use `marginStart`/`marginEnd`/`start`/`end`/`textAlign: 'auto'`. RN 0.86 supports all of these.
3. **Money formatting already handles it.** `currencyChrome` derives `symbolBefore` from `Intl` per
   locale, so an RTL locale that puts the symbol after the number gets it right for free. The one
   extra care: RTL currency strings often need `U+200F RIGHT-TO-LEFT MARK` around the digit run to
   avoid bidi reordering artefacts; `formatMoney` gains an `rtlIsolate` flag wrapping the numeric run
   in `U+2068 FSI … U+2069 PDI` when `textDirection === 'rtl'`. Isolates are the correct primitive
   and RN's text renderer honours them.
4. **Icons that encode direction** (back arrow, chevrons) come from `@expo/vector-icons` and are
   flipped via a `scaleX: -1` transform gated on `I18nManager.isRTL`, never by shipping a second asset.
5. **The calendar grid** (note 03) already computes columns from `weekStartsOn`; RTL only reverses the
   `flexDirection`, which `row` → `row-reverse` handles automatically under `I18nManager.isRTL`.

## 3.8 Device locale → default currency, week start, and timezone

Do **not** hand-maintain a region→currency table. `expo-localization` already exposes everything:

```ts
// src/utils/deviceDefaults.ts
import {getCalendars, getLocales} from 'expo-localization';

export interface DeviceDefaults {
  locale: SupportedLocale;
  currency: SupportedCurrency;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;   // 0 = Sunday (date-fns convention)
  timezone: string;                           // IANA, e.g. 'Asia/Seoul'
  uses24HourClock: boolean;
}

/** Fallbacks used only when the OS gives us nothing usable. */
const LOCALE_FALLBACK: Record<SupportedLocale, {currency: SupportedCurrency; weekStartsOn: 0 | 1}> = {
  en: {currency: 'USD', weekStartsOn: 0},
  ko: {currency: 'KRW', weekStartsOn: 0},
  ja: {currency: 'JPY', weekStartsOn: 0},
  zh: {currency: 'CNY', weekStartsOn: 0},
  id: {currency: 'IDR', weekStartsOn: 0},
};

export const deviceDefaults = (): DeviceDefaults => {
  const l = getLocales()[0];
  const c = getCalendars()[0];

  const locale: SupportedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(l?.languageCode ?? '')
    ? (l.languageCode as SupportedLocale)
    : DEFAULT_LOCALE;
  const fb = LOCALE_FALLBACK[locale];

  // expo-localization gives the OS's own currency for the device region. Trust it when it is
  // a code we support; otherwise fall back by UI language.
  const osCurrency = (l?.currencyCode ?? '').toUpperCase();
  const currency: SupportedCurrency =
    (SUPPORTED_CURRENCIES as readonly string[]).includes(osCurrency)
      ? (osCurrency as SupportedCurrency)
      : fb.currency;

  // getCalendars()[0].firstWeekday is Unicode-numbered: 1 = Sunday .. 7 = Saturday.
  // date-fns wants 0 = Sunday .. 6 = Saturday.
  const firstWeekday = c?.firstWeekday;
  const weekStartsOn = typeof firstWeekday === 'number'
    ? (((firstWeekday - 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6)
    : fb.weekStartsOn;

  return {
    locale,
    currency,
    weekStartsOn,
    timezone: c?.timeZone ?? 'UTC',
    uses24HourClock: c?.uses24hourClock ?? true,
  };
};
```

These are **defaults for the creation form**, not runtime behaviour. Once a ledger exists, its
`baseCurrency`, `weekStartsOn` and `timeZone` are ledger properties (§4.3), because a shared ledger
must look identical to every member. The device values only pre-fill the "create ledger" sheet and
drive the pure-UI locale.

Note the legacy bugs this closes: `setLocale()` mapped `ko → currency 'KRW', unit '$'` (won amounts
rendered with a dollar sign) and `id → currency 'IND'`, which is not an ISO code at all (note 04 §4).

## 3.9 Converting the 87 KB `STRINGS.js`

**Script: `scripts/convert-legacy-strings.mjs`**, with the mapping in `scripts/legacy-key-map.mjs`
(the full 263-row `LEGACY_KEY → new.nested.key` table already derived in note 04 §9.3, verified to
cover 263/263 with zero unmapped and zero orphans).

Transform, in order:

1. **Make the ES module requireable.** Read `BooKooLegacy/STRINGS.js`, replace
   `export default STRINGS;` with `module.exports = STRINGS;`, write to a temp `.cjs`, dynamic-import
   it, delete the temp. (The file is a single `const STRINGS = {en:{...}, ko:{...}, ja, zh, id}` with
   no imports, so this is safe.)
2. **Flatten → nest.** For each locale, walk `KEY_MAP`; `setDeep(out, newKey, value)` on each mapped
   key. `null` in the map = intentionally dropped.
3. **Fill from `en` on a miss** rather than emitting `undefined`, and `console.warn` each fill — that
   warning list *is* the translation to-do list (it will name `PERMISSION_REQUEST_CAMERA_ROLL` in four
   locales, and `ANNOUNCEMENT_9` / `ANNOUNCEMENT_TXT_9` / `REQUESTED` in `id`).
4. **Sort recursively** so `i18n-json/sorted-keys` passes on the first run.
5. **Route announcements and FAQ to `convex/seed/legacyContent.json`** instead of the langs files:
   9 announcements × 5 locales and 11 FAQs × 5 locales, as
   `{order, locale, title|question, body|answer}` rows.
6. **Emit `assets/langs/meta/*.json`** from the three `PERMISSION_REQUEST_*` keys, mapped to
   `ios.NSCameraUsageDescription`, `ios.NSPhotoLibraryUsageDescription`,
   `ios.NSLocationWhenInUseUsageDescription`, plus hand-authored `android.app_name` /
   `ios.CFBundleDisplayName`.
7. **Normalize.** NFC-normalize every value, `trim()` every value (this alone fixes the Indonesian
   `"TAMBAHAN "` trailing space), and convert the nine literal `\n` multi-line values to real newlines.

What gets **discarded**, and why:

| Discarded | Count | Reason |
|---|---|---|
| `ANNOUNCEMENT_1..9` + `ANNOUNCEMENT_TXT_1..9` | 18 | Release-note *content*, not UI chrome → `appAnnouncements` rows with `kind: 'NOTICE'`. All nine describe 2017–2019 legacy releases and are obsolete on day one; they are seeded for archive value and hidden by default. |
| `FAQ_1..11` + `FAQ_TXT_1..11` | 22 | → `appAnnouncements` rows with `kind: 'FAQ'`. Content is still substantively accurate and gets **rewritten**, not deleted. `FAQ_TXT_1` hardcodes `dooboolab@gmail.com` — replace. |
| `PERMISSION_REQUEST_CAMERA` / `_CAMERA_ROLL` / `_LOCATION` | 3 | → `assets/langs/meta/*.json` (native manifest strings). |
| `DONE` | 1 | Byte-identical to `COMPLETE` in all five locales → merged to `common.done`. |
| `FACEBOOK_NO_EMAIL` | 1 | Facebook login is not in the new provider set (Kakao/Naver/Google/Apple/email-OTP). |
| `SETTING_REPEAT`, `PASTE_MESSAGE`, `EXPORT_EXCEL`, `NEXT_UPDATE`, `NEXT_UPDATE_BODY` | 5 | Features that never shipped; `NoPage.tsx` placeholders. (If recurring transactions or CSV export land later they get *new* copy, not resurrected 2019 copy.) |
| `INTRO_FOOTER_TXT1..5` | 5 → 1 | Collapse into one ICU string `intro.agreementNotice`: `"By continuing you agree to the {{terms}} and {{privacy}}."` The legacy concatenated five fragments at the call site, which is unlocalizable word-order-wise. Net −4. |
| `SUN`…`SAT`, `JAN`…`DEC` | 19 | Standard weekday/month names — `date-fns` locale objects provide them correctly for every locale, including the ones we have not shipped yet. |
| `id`'s `ANNOUNCEMENT1_TITLE`, `ANNOUNCEMENT1_BODY`, `DIMINTA` | 3 | Stray keys in `id` only, wrong naming convention, dead. `DIMINTA` was the mistranslated stand-in for `REQUESTED`. |

**Authored fresh** (the script cannot produce these): `permission.cameraDenied` (called from legacy
code but defined in *no* locale), the ~9 new auth keys (`auth.continueWithKakao`, `…Naver`, `…Google`,
`…Apple`, `auth.sendOtp`, `auth.otpPlaceholder`, `auth.otpSent`, `auth.otpInvalid`, `auth.otpResend`),
the ~6 handle/username keys, 4 theme keys (`settings.theme` + system/light/dark), the whole `money.*`
namespace (`money.refund`, `money.baseAmountHint`, `money.fxRate`, `money.fxManual`, …), the `error.*`
namespace mirroring `AppErrorCode`, and the `a11y.*` namespace.

Net: **263 legacy `en` keys → ~210 migrated UI strings + ~35 new = ~245**, plus 34 corrected
`category.*` and 40 rows of Convex content.

Post-conversion manual passes, in order: (1) apply the §2.7 corrected category table;
(2) author `permission.cameraDenied` ×5; (3) build `intro.agreementNotice`; (4) drop the dead keys;
(5) move the three permission descriptions to `meta/`; (6) `bun lint:i18n` until clean;
(7) `bun tsx scripts/verify-langs.ts` until clean; (8) add the new namespaces.

---

# PART 4 — NUMBER / DATE FORMATTING AND THE TIMEZONE RULE

## 4.1 Numbers (non-money)

Percentages, counts and chart labels use the same cached-chrome approach as money, so there is exactly
one grouping implementation in the app:

```ts
// shared/money.ts (continued)
export const formatInteger = (n: number, locale: string): string =>
  splitMinor(n, 0, currencyChrome(locale, 'USD').group).int;    // group separator only

export const formatPercent = (ratio: number, locale: string, digits = 1): string => {
  const chrome = currencyChrome(locale, 'USD');
  const scaled = roundHalfAwayFromZero(ratio * 100 * 10 ** digits);
  const {int, frac} = splitMinor(scaled, digits as CurrencyExponent, chrome.group);
  return `${int}${digits ? chrome.decimal + frac : ''}%`;
};
```

Compact notation (`12.3만`, `12.3K`, `1.2万`) is **ours**, not `Intl`'s `notation:'compact'`, which
Hermes iOS does not honour and which has no correct Korean 만/억 behaviour anyway:

```ts
const COMPACT_UNITS: Record<SupportedLocale, readonly [number, string][]> = {
  ko: [[1e8, '억'], [1e4, '만']],
  ja: [[1e8, '億'], [1e4, '万']],
  zh: [[1e8, '亿'], [1e4, '万']],
  en: [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']],
  id: [[1e9, 'M'], [1e6, 'jt'], [1e3, 'rb']],
};
```

Korean/Japanese/Chinese group by 10,000, not by 1,000. `Intl`'s compact notation gets this *right* on
Android and *wrong or absent* on iOS — a chart axis that reads `12K원` on iOS and `1.2만원` on Android
is exactly the kind of split-brain the legacy had. One implementation, both platforms.

## 4.2 Dates: date-fns only, no `Intl.DateTimeFormat` for display

**Decision: `date-fns` v4 + `date-fns/locale` is the single source for date display. `Intl` is used for
dates in exactly one place — timezone conversion (§4.3) — and nowhere else.**

Rationale: `Intl.DateTimeFormat` on Hermes iOS is `NSDateFormatter`-backed and its option handling
diverges from Android's ICU (the same class of bug as facebook/hermes#812 for numbers). Date strings
appear in section headers on every screen; a platform split there is immediately visible. `date-fns`
produces byte-identical output on both platforms, on the Convex server, and in tests, and it is
tree-shakeable — unlike `moment`, which the legacy bundled with six locale files and a global
`moment.locale()` mutation in a Redux reducer (note 02 §8).

```ts
// shared/date.ts
import {enUS, id as idLocale, ja, ko, zhCN} from 'date-fns/locale';
import type {Locale as DateFnsLocale} from 'date-fns';

export const DATE_FNS_LOCALES: Record<SupportedLocale, DateFnsLocale> = {
  en: enUS, ko, ja, zh: zhCN, id: idLocale,
};

/** Legacy 'MMMM Do (ddd)' section header, without the English-only ordinal suffix. */
export const formatSectionDate = (d: Date, locale: SupportedLocale): string =>
  format(d, localeDatePattern(locale), {locale: DATE_FNS_LOCALES[locale]});

const localeDatePattern = (locale: SupportedLocale): string =>
  locale === 'en' ? 'MMMM d (EEE)' : 'M月d日 (EEE)'.replace('月', monthWord(locale));
```

Legacy format tokens and their replacements (note 04 §6):

| Legacy (moment) | Where | New |
|---|---|---|
| `'YYYY-MM-DD'` | calendar bucket key, `opinion.createdAt` | **not a format call any more** — a stored, indexed `dayKey: number` (`20260824`) computed server-side in the ledger tz (§4.3) |
| `'MMMM Do (ddd)'` | Tab2 section header, Tab3 | `format(d, 'MMMM d (EEE)', {locale})`; the English ordinal `Do` is dropped — it is meaningless in ko/ja/zh/id |
| `'YYYY-MM-DD(ddd) hh:mm'` | item detail | `format(d, 'yyyy-MM-dd (EEE) HH:mm')`, `HH` vs `hh` chosen by `deviceDefaults().uses24HourClock` |
| `moment(d).fromNow()` | review timestamps | `formatDistanceToNow(d, {addSuffix: true, locale})` |
| `moment.locale(...)` global mutation in a reducer | — | deleted; the locale is a parameter, never global state |

`date-fns` uses lowercase `yyyy`/`dd` where moment used `YYYY`/`DD` — a silent source of wrong output
if a pattern is copy-pasted. An ESLint `no-restricted-syntax` rule flags `YYYY`/`DD`/`Do` inside a
`format(` call.

## 4.3 The timezone rule for a shared ledger

**A ledger owns a fixed IANA timezone. Every date bucket is computed in that timezone, on the server.
Devices never decide what month an entry belongs to.**

```ts
// convex/schema/ledgers.ts (relevant fields)
timeZone: v.string(),          // IANA, e.g. 'Asia/Seoul'. Set at creation from the creator's device.
weekStartsOn: v.number(),      // 0..6, ledger-wide so the calendar grid matches for everyone
baseCurrency: v.string(),
```

Why this is not negotiable:

A shared ledger's month total must be **the same number for every member**. If `monthKey` were derived
from each device's timezone, an entry made at 2026-08-31 23:30 KST would be August for the member in
Seoul and July for the member in Los Angeles — and since `ledgerMonthRollups` is keyed by `monthKey`, the
two members would be reading *different rows* that can never be reconciled. The rollup would be
correct for nobody. Notes 13 §3.3 (rollups keyed by `monthKey`) and §4 ("no `Date.now()` inside
queries") make a single authoritative bucketing rule a hard structural requirement, not a preference.

The mechanics live only in `shared/date.ts`: `toDayKey`, `toMonthKey`, `offsetMinutesAt`, and
`wallClockToEpochMs` use the runtime's `Intl.DateTimeFormat` timezone data; date-fns is used only for
timezone-free calendar arithmetic anchored at local noon. The same module owns the four strict
calendar-component codecs and `dayKeyRangeOfPeriod`. `@date-fns/tz` is deliberately not installed.

Rules:

1. `occurredAt` (epoch ms) is the truth. `dayKey` / `monthKey` are **derived and stored** by the
   mutation, computed from `occurredAt` + `ledger.timeZone`. The client never sends them.
   (The client *does* compute them locally with the same pure `shared/date.ts` functions for optimistic
   updates, so the optimistic value and the server value agree.)
2. The §1.4 `intlCaps()` probe verifies `Intl.DateTimeFormat` timezone support. The Convex V8 runtime has
   full ICU, so the server path is safe unconditionally; the probe protects the client's optimistic path.
   If `intlCaps().timeZone` is false
   the client simply skips the optimistic update and waits for the server — degraded, never wrong.
3. **Editing an entry's date re-derives both keys**, and the rollup trigger emits a *pair* of deltas
   (subtract from the old `(monthKey, categoryKey)` bucket, add to the new). The trigger receives
   `change.oldDoc` and `change.newDoc`, so this needs no extra bookkeeping.
4. **`_creationTime` is never used as the entry's date.** Note 13 §1.1 makes this explicit and it also
   matters here: a user logging yesterday's coffee at 1 a.m. must land in yesterday.
5. **Changing `ledger.timeZone`** re-buckets history. Same shape as the base-currency migration
   (§1.8): a paginated internal mutation recomputing `dayKey`/`monthKey` per item and rebuilding the
   rollups, guarded by a `RUNNING` state. Rare enough to be a background job, common enough
   (a household moves country) that it must exist rather than being "create a new ledger".
6. **The calendar's `weekStartsOn` is a ledger property too**, defaulted from the creator's
   `getCalendars()[0].firstWeekday`. Note 03 documents that the legacy calendar hard-coded
   `weekStart={0}` while `moment.startOf('week')` was locale-global — two sources of truth that
   disagreed. One ledger-level number, passed explicitly to `startOfWeek(d, {weekStartsOn})`.
7. **Display uses the ledger timezone, not the device's.** A member travelling in Tokyo sees the
   household ledger's Seoul dates. The entry sheet shows a small "Asia/Seoul" affordance when
   `deviceDefaults().timezone !== ledger.timeZone`, so the difference is visible rather than
   confusing. This is the one place where "correct" and "expected" can diverge, and surfacing it is
   cheaper than explaining it in a support email.

Legacy comparison: there was **no `serverTimestamp()` anywhere** — every timestamp was a client clock
in `moment().format()` local-offset ISO (note 02 §8), and `selectedDate` was written as a raw `Date`
object that the Firebase SDK serialized to nothing, so an edited date **silently disappeared from the
row**. The migration must therefore fall back `selectedDate → created → push-id timestamp` and record
which source it used in `legacyDateSource`.

---

## 5. Implementation order

1. `shared/currency.ts` (including `intlCaps`) + `shared/money.ts` with the fixture test matrix
   (parse/format/convert × {KRW exp0, USD exp2, BHD exp3} × {en, ko, ja, zh, id}). No UI yet.
2. `shared/categories.ts` (the §2.3 array) + `shared/date.ts`.
3. `scripts/convert-legacy-strings.mjs` + `legacy-key-map.mjs` → `assets/langs/*.json`, then the
   §2.7 correction pass, then `lint:i18n` + `verify-langs.ts` green in CI.
4. `src/STRINGS.ts` + `useLocale` + `deviceDefaults`.
5. `CategoryIcon` as a thin typed wrapper around cpk-ui `<Icon>`; no new category assets or fonts.
6. Convex `ledgerCategories` schema, `materialize`, and the five mutations.
7. `AmountKeypad`.
8. Migration scripts (`migrate/legacyCategories.ts`, the currency-vote step) — last, because they
   depend on every decision above being frozen.

Steps 1–4 have no dependency on the Convex schema and can land the day the scaffold exists.
