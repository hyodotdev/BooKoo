/**
 * The app's single translation entry point.
 *
 * Design: `.notes/design/money-categories-i18n.md` PART 3 (+ §4.1 / §4.2 for
 * the formatting rules). Reference implementation: Martie's `src/STRINGS.ts`
 * (`.notes/research/07-martie-client-arch.md` §8).
 *
 * Three things make this different from the legacy `getString()`:
 *
 * 1. **Keys are compile-time checked.** `t()` takes `TranslationKey`, a union
 *    derived from the shape of `assets/langs/ko.json`. A typo is a build
 *    error, not the literal `'...'` the legacy rendered for a missing key —
 *    which is exactly why four legacy keys rotted unnoticed
 *    (`.notes/research/04-legacy-content-i18n.md` §2). Nothing in the app ever
 *    needs `t(key as any)`; if you reach for a cast, the key set is wrong.
 * 2. **`ko.json` is the source of truth**, matching `.eslintrc.js`
 *    (`i18n-json/identical-keys` compares every locale against `ko.json`).
 *    `bun lint:i18n` guarantees every other locale file carries the same keys, so
 *    the type derived from `ko` describes all of them.
 * 3. **Plural keys are a separate type.** `t()` cannot address one, because a
 *    plural entry without a `count` returns an object, not a string. Use
 *    `tCount()`.
 */
import {getLocales} from 'expo-localization';
import {
  de as deDateFns,
  enUS,
  es as esDateFns,
  fr as frDateFns,
  id as idDateFns,
  it as itDateFns,
  ja as jaDateFns,
  ko as koDateFns,
  nl as nlDateFns,
  pt as ptDateFns,
  vi as viDateFns,
  zhCN,
} from 'date-fns/locale';
import {format, formatDistanceToNow} from 'date-fns';
import type {Locale as DateFnsLocale} from 'date-fns';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from '@shared/locales';
// DEPENDENCY: `shared/money.ts` is owned by another agent and may not exist in
// the working tree yet, in which case this import is the only thing failing a
// whole-repo typecheck of this file. Do not shadow it with a local copy — the
// point of `shared/` is that the client and the Convex mutation round money
// identically.
import {formatInteger, formatMoney, formatPercent} from '@shared/money';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

import {Storage, storage} from './storage';
import {diagnostic} from '~/features/diagnostics/ring';

import de from '../../assets/langs/de.json';
import en from '../../assets/langs/en.json';
import es from '../../assets/langs/es.json';
import fr from '../../assets/langs/fr.json';
import id from '../../assets/langs/id.json';
import it from '../../assets/langs/it.json';
import ja from '../../assets/langs/ja.json';
import ko from '../../assets/langs/ko.json';
import nl from '../../assets/langs/nl.json';
import pt from '../../assets/langs/pt.json';
import vi from '../../assets/langs/vi.json';
import zh from '../../assets/langs/zh.json';

/* -------------------------------------------------------------------------- */
/* The i18n-js instance                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `import {I18n} from 'i18n-js'` resolves through the package's `module`
 * field to the ESM build, which Metro mis-handles. The CommonJS entry is the
 * one that works in React Native.
 * See https://github.com/fnando/i18n/issues/26#issuecomment-1225775247.
 * The cast keeps the value typed without an `any` anywhere.
 */
type I18nConstructor = typeof import('i18n-js').I18n;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {I18n} = require('i18n-js/dist/require/index') as {
  I18n: I18nConstructor;
};

/* -------------------------------------------------------------------------- */
/* Locales                                                                    */
/* -------------------------------------------------------------------------- */

export {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
};

/**
 * `date-fns` is the single source for date display (design §4.2). `Intl`
 * date formatting is used in exactly one place repo-wide — timezone
 * conversion — because Hermes iOS is `NSDateFormatter`-backed and diverges
 * from Android's ICU on option handling.
 */
export const DATE_FNS_LOCALES: Readonly<
  Record<SupportedLocale, DateFnsLocale>
> = {
  en: enUS,
  ko: koDateFns,
  ja: jaDateFns,
  zh: zhCN,
  id: idDateFns,
  de: deDateFns,
  es: esDateFns,
  fr: frDateFns,
  it: itDateFns,
  nl: nlDateFns,
  pt: ptDateFns,
  vi: viDateFns,
};

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The chosen locale lives in MMKV, not SecureStore: it is not a secret and it
 * is read on the boot path, where a SecureStore read is slow enough to be felt
 * (design §3.4).
 *
 * The instance and key inventory are shared with the rest of the boot path so
 * locale, theme, lock hints, and active-ledger state cannot drift into separate
 * MMKV databases.
 */
/* -------------------------------------------------------------------------- */
/* Initial locale                                                             */
/* -------------------------------------------------------------------------- */

const readStoredLocale = (): SupportedLocale | undefined => {
  const stored = storage.getString(Storage.Locale);

  return stored !== undefined && isSupportedLocale(stored) ? stored : undefined;
};

/** The device's UI language, narrowed to something we actually ship. */
export const getDeviceLocale = (): SupportedLocale => {
  // `languageCode` is `string | null` on this platform's typings, not
  // `string | undefined`, so the nullish check has to cover both.
  const languageCode = getLocales()[0]?.languageCode ?? undefined;

  return languageCode !== undefined && isSupportedLocale(languageCode)
    ? languageCode
    : DEFAULT_LOCALE;
};

const i18n = new I18n({en, ko, ja, zh, id, de, es, fr, it, nl, pt, vi});

i18n.defaultLocale = DEFAULT_LOCALE;
i18n.enableFallback = true;
i18n.locale = readStoredLocale() ?? getDeviceLocale();

/**
 * A missing key must never render as chrome. The legacy `getString()` returned
 * the literal `'...'`, which is how four keys stayed broken for years. Here it
 * degrades to the humanized last path segment and complains in development.
 */
i18n.missingBehavior = 'report';
i18n.missingTranslation.register('report', (_i18n, scope) => {
  const key = String(scope);

  diagnostic({
    kind: 'MISSING_TRANSLATION',
    keyHash: bytesToHex(sha256(new TextEncoder().encode(key))),
    locale: isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE,
  });

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing translation: ${key}`);
  }

  return key.split('.').pop() ?? '';
});

/* -------------------------------------------------------------------------- */
/* Pluralization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `Intl.PluralRules` is not implemented in Hermes, so i18n-js does the
 * plural selection and we register the rule per language.
 *
 * ko / ja / zh / id / vi have no grammatical plural: always `other`, with `zero`
 * used when the entry defines it so "no entries" can read naturally instead of
 * "0 entries". Germanic and Romance locales keep `one`/`other`, plus `zero`
 * when the catalog defines it.
 */
const otherOnly = (_i18n: unknown, count: number): string[] =>
  count === 0 ? ['zero', 'other'] : ['other'];

const oneOtherPlural = (_i18n: unknown, count: number): string[] => {
  if (count === 0) {
    return ['zero', 'other'];
  }

  return count === 1 ? ['one', 'other'] : ['other'];
};

for (const locale of ['ko', 'ja', 'zh', 'id', 'vi'] as const) {
  i18n.pluralization.register(locale, otherOnly);
}

// Registered explicitly rather than left to the built-in `default`, because
// `Pluralization.get(locale)` falls through to the *currently active* locale's
// pluralizer when the requested one is not registered — so rendering an
// English string while the UI is Korean would otherwise use `otherOnly` and
// print "1 members".
for (const locale of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt'] as const) {
  i18n.pluralization.register(locale, oneOtherPlural);
}

/* -------------------------------------------------------------------------- */
/* Typed keys                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A plural entry. The converter guarantees every locale carries the same
 * sub-keys, so `other` is always present and `one` is present even in the
 * languages that never read it.
 */
interface PluralEntry {
  readonly other: string;
}

/**
 * Dotted paths whose value is a plain string. Plural entries are excluded on
 * purpose: `i18n.t()` on one without a `count` returns the raw object.
 *
 * NOTE: a namespace must never contain a leaf literally named `other`, or it
 * would be mistaken for a plural entry. Nothing in `assets/langs/*.json` does.
 */
type StringKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string
        ? K
        : T[K] extends PluralEntry
          ? never
          : `${K}.${StringKeys<T[K]>}`;
    }[keyof T & string]
  : never;

/** Dotted paths whose value is a plural entry. */
type PluralKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string
        ? never
        : T[K] extends PluralEntry
          ? K
          : `${K}.${PluralKeys<T[K]>}`;
    }[keyof T & string]
  : never;

/** Every non-plural key in the app, e.g. `'ledger.leaveConfirm'`. */
export type TranslationKey = StringKeys<typeof ko>;

/** Every plural key in the app, e.g. `'ledger.itemCount'`. */
export type PluralTranslationKey = PluralKeys<typeof ko>;

/**
 * `{{name}}` interpolation values. Numbers are accepted, but anything the user
 * reads as a quantity should be pre-formatted with `formatCount()` /
 * `formatAmount()` so grouping follows the locale rather than
 * `String(number)`.
 */
export type TranslationParams = Readonly<Record<string, string | number>>;

/* -------------------------------------------------------------------------- */
/* t                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The ONLY translation entry point.
 *
 * `locale` is for rendering in *someone else's* language — an invite preview,
 * a share sheet — and restores the active locale before returning.
 */
export const t = (
  key: TranslationKey,
  params?: TranslationParams,
  locale?: SupportedLocale,
): string => {
  if (locale === undefined) {
    return i18n.t(key, params);
  }

  const previous = i18n.locale;

  i18n.locale = locale;

  try {
    return i18n.t(key, params);
  } finally {
    i18n.locale = previous;
  }
};

/**
 * Selects the plural form and interpolates it.
 *
 * `i18n.pluralize()` is deliberately NOT used: it overwrites `options.count`
 * with the raw number just before interpolating, which would render
 * "1234 entries" instead of "1,234 entries". Selecting the form and
 * interpolating explicitly keeps `{{count}}` a **pre-formatted string**, so
 * grouping follows the locale without i18n-js reaching for `Intl` (which
 * Hermes iOS gets wrong anyway).
 */
const pluralizeIn = (
  key: PluralTranslationKey,
  count: number,
  params: TranslationParams | undefined,
  locale: SupportedLocale,
): string => {
  const forms = i18n.t<Partial<Record<string, string>>>(key);

  // `missingBehavior` already resolved it to a string — nothing to select.
  if (typeof forms === 'string') {
    return forms;
  }

  const message = i18n.pluralization
    .get(locale)(i18n, count)
    .map((form) => forms[form])
    .find((value): value is string => typeof value === 'string');

  if (message === undefined) {
    return i18n.missingTranslation.get(`${key}.other`, {});
  }

  // `TranslateOptions['count']` is typed `number` because i18n-js expects to do
  // the plural selection itself. We already did it, so `count` is now purely a
  // placeholder value — and it has to be the pre-formatted string, which is the
  // whole reason `i18n.pluralize()` is not used here.
  const values: TranslationParams = {
    ...params,
    count: formatCount(count, locale),
  };

  return i18n.interpolate(i18n, message, values);
};

/** Plural form of `t`. `{{count}}` arrives already grouped for the locale. */
export const tCount = (
  key: PluralTranslationKey,
  count: number,
  params?: TranslationParams,
  locale?: SupportedLocale,
): string => {
  if (locale === undefined) {
    return pluralizeIn(key, count, params, getLocale());
  }

  const previous = i18n.locale;

  i18n.locale = locale;

  try {
    return pluralizeIn(key, count, params, locale);
  } finally {
    i18n.locale = previous;
  }
};

/* -------------------------------------------------------------------------- */
/* Locale state                                                               */
/* -------------------------------------------------------------------------- */

type LocaleListener = (locale: SupportedLocale) => void;

let listeners: LocaleListener[] = [];

export const getLocale = (): SupportedLocale => {
  const current = i18n.locale;

  return isSupportedLocale(current) ? current : DEFAULT_LOCALE;
};

/**
 * i18n-js is not reactive, so every subscriber is notified explicitly. This is
 * what lets a language change re-render immediately; the legacy app had to
 * force-remount the whole tab (`route.params.reload()` → `changeTab('tab4')`)
 * because its formatter read the store once at render.
 */
export const subscribeLocale = (listener: LocaleListener): (() => void) => {
  listeners = [...listeners, listener];

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
};

/** Sets the active locale and persists it. No-ops when nothing changes. */
export const setActiveLocale = (next: SupportedLocale): void => {
  if (i18n.locale === next) {
    return;
  }

  storage.set(Storage.Locale, next);
  i18n.locale = next;

  for (const listener of listeners) {
    listener(next);
  }
};

/** Forgets the user's explicit choice and follows the device again. */
export const resetLocaleToDevice = (): SupportedLocale => {
  const device = getDeviceLocale();

  storage.delete(Storage.Locale);

  if (i18n.locale !== device) {
    i18n.locale = device;

    for (const listener of listeners) {
      listener(device);
    }
  }

  return device;
};

/** True when the app is following the device rather than an explicit choice. */
export const isFollowingDeviceLocale = (): boolean =>
  readStoredLocale() === undefined;

/* -------------------------------------------------------------------------- */
/* Number / money formatting — delegated to shared/money.ts                    */
/* -------------------------------------------------------------------------- */

/**
 * These wrappers exist so no call site has to thread the UI locale through by
 * hand, and so there is exactly one grouping implementation in the app. The
 * arithmetic itself is `shared/money.ts`, which the Convex functions import
 * too — a total rendered in a push notification has to match the one on
 * screen to the digit.
 *
 * Parameter types are read off the shared functions rather than restated, so
 * a signature change over there surfaces here as a type error instead of a
 * silently wrong call.
 */

/** Grouped integer, e.g. `1,234` / `1.234`. Never used for money. */
export const formatCount = (
  value: number,
  locale: SupportedLocale = getLocale(),
): string => formatInteger(value, locale);

/** `0.128` → `12.8%`, grouped and punctuated for the locale. */
export const formatRatio = (
  value: number,
  digits?: number,
  locale: SupportedLocale = getLocale(),
): string => formatPercent(value, locale, digits);

/** Money, from integer minor units. Never build one of these by hand. */
export const formatAmount = (
  money: Parameters<typeof formatMoney>[0],
  options?: Parameters<typeof formatMoney>[2],
  locale: SupportedLocale = getLocale(),
): string => formatMoney(money, locale, options);

/* -------------------------------------------------------------------------- */
/* Date formatting — date-fns only                                            */
/* -------------------------------------------------------------------------- */

export const getDateFnsLocale = (
  locale: SupportedLocale = getLocale(),
): DateFnsLocale => DATE_FNS_LOCALES[locale];

/**
 * `date-fns` `format` with the locale bound.
 *
 * Patterns are `date-fns` patterns: lowercase `yyyy` / `dd`, and `EEE` for a
 * short weekday. Moment's `YYYY` / `DD` / `Do` mean something else here and
 * are a silent source of wrong output when a legacy pattern is pasted in.
 */
export const formatDate = (
  date: Date | number,
  pattern: string,
  locale: SupportedLocale = getLocale(),
): string => format(date, pattern, {locale: DATE_FNS_LOCALES[locale]});

/** Replaces the legacy `moment(d).fromNow()` on comment timestamps. */
export const formatTimeAgo = (
  date: Date | number,
  locale: SupportedLocale = getLocale(),
): string =>
  formatDistanceToNow(date, {
    addSuffix: true,
    locale: DATE_FNS_LOCALES[locale],
  });

export {i18n};
