/**
 * App UI languages. Bare BCP-47 primary subtags.
 *
 * Legacy shipped `en ko ja zh id`. The rewrite keeps those for migration
 * parity and adds Western European developed-country languages requested for
 * launch: `de es fr it nl pt`, followed by Vietnamese (`vi`). `zh` is Simplified.
 */

export const SUPPORTED_LOCALES = [
  'en',
  'ko',
  'ja',
  'zh',
  'id',
  'de',
  'es',
  'fr',
  'it',
  'nl',
  'pt',
  'vi',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** Language names are always written in the language itself, never translated. */
export const LOCALE_LABELS: Readonly<Record<SupportedLocale, string>> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語',
  zh: '简体中文',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
  vi: 'Tiếng Việt',
};

export const isSupportedLocale = (value: string): value is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

/** Region fallbacks for new profiles/ledgers only; device settings take precedence.
 * CLDR firstDay: VN/CN Monday, ID/PT Sunday. Existing ledgers keep their own week.
 * https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml
 */
export const LOCALE_DEFAULTS: Readonly<
  Record<
    SupportedLocale,
    {
      readonly currency: string;
      readonly timeZone: string;
      readonly weekStartsOn: 0 | 1;
    }
  >
> = {
  en: {currency: 'USD', timeZone: 'UTC', weekStartsOn: 0},
  ko: {currency: 'KRW', timeZone: 'Asia/Seoul', weekStartsOn: 0},
  ja: {currency: 'JPY', timeZone: 'Asia/Tokyo', weekStartsOn: 0},
  zh: {currency: 'CNY', timeZone: 'Asia/Shanghai', weekStartsOn: 1},
  id: {currency: 'IDR', timeZone: 'Asia/Jakarta', weekStartsOn: 0},
  de: {currency: 'EUR', timeZone: 'Europe/Berlin', weekStartsOn: 1},
  es: {currency: 'EUR', timeZone: 'Europe/Madrid', weekStartsOn: 1},
  fr: {currency: 'EUR', timeZone: 'Europe/Paris', weekStartsOn: 1},
  it: {currency: 'EUR', timeZone: 'Europe/Rome', weekStartsOn: 1},
  nl: {currency: 'EUR', timeZone: 'Europe/Amsterdam', weekStartsOn: 1},
  pt: {currency: 'EUR', timeZone: 'Europe/Lisbon', weekStartsOn: 0},
  vi: {currency: 'VND', timeZone: 'Asia/Ho_Chi_Minh', weekStartsOn: 1},
};
