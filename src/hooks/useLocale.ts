/**
 * Reactive access to the app's UI language, plus the three device-derived
 * defaults that always travel with it: the `date-fns` locale object, the first
 * day of the week, and the currency to pre-fill a new ledger with.
 *
 * Design: `.notes/design/money-categories-i18n.md` §3.4 (locale switching) and
 * §3.8 (device locale → currency / week start / timezone).
 *
 * Changing the language does NOT require an app reload. The legacy app had to
 * force-remount a whole tab because `FormattedProvider` read its store once at
 * render; here `src/utils/i18n.ts` publishes changes and this hook subscribes.
 */
import {useCallback, useMemo, useSyncExternalStore} from 'react';
import {getCalendars, getLocales} from 'expo-localization';
import type {Locale as DateFnsLocale} from 'date-fns';
import {LOCALE_DEFAULTS} from '@shared/locales';

import {
  DATE_FNS_LOCALES,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  getLocale,
  isFollowingDeviceLocale,
  resetLocaleToDevice,
  setActiveLocale,
  subscribeLocale,
  type SupportedLocale,
} from '../utils/i18n';

/** `date-fns` convention: 0 = Sunday … 6 = Saturday. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Read once. These are OS settings that cannot change without the process
 * being restarted in practice, and reading them during render would make the
 * render impure.
 */
const deviceCalendar = getCalendars()[0];

/**
 * `expo-localization` reports `firstWeekday` Unicode-numbered (1 = Sunday …
 * 7 = Saturday); `date-fns` wants 0 = Sunday … 6 = Saturday.
 */
const deviceWeekStartsOn = ((): WeekStartsOn | undefined => {
  const firstWeekday = deviceCalendar?.firstWeekday;

  if (typeof firstWeekday !== 'number') {
    return undefined;
  }

  return ((((firstWeekday - 1) % 7) + 7) % 7) as WeekStartsOn;
})();

/**
 * `Intl` currency formatting throws on anything that is not a well-formed
 * ISO 4217 code, and the OS can report region currencies we do not carry.
 *
 * DEPENDENCY: once `shared/currency.ts` lands, narrow this against
 * `SUPPORTED_CURRENCIES` instead of the shape check, so the ledger-creation
 * sheet can never be pre-filled with a code the picker does not list.
 */
const isCurrencyCodeShape = (value: string): boolean =>
  /^[A-Z]{3}$/.test(value);

/**
 * `expo-localization` already knows the OS's currency for the device region,
 * so there is no hand-maintained region→currency table to drift.
 */
const deviceCurrency = ((): string | undefined => {
  const code = getLocales()[0]?.currencyCode?.toUpperCase();

  return code !== undefined && isCurrencyCodeShape(code) ? code : undefined;
})();

export interface UseLocaleResult {
  /** The active UI language. */
  readonly locale: SupportedLocale;
  /** Persists to MMKV and re-renders every subscriber synchronously. */
  readonly setLocale: (next: SupportedLocale) => void;
  /** Drops the explicit choice and follows the device language again. */
  readonly resetToDeviceLocale: () => void;
  /** False once the user has picked a language by hand. */
  readonly isFollowingDevice: boolean;
  readonly supportedLocales: readonly SupportedLocale[];
  /** Language names, each written in its own language. */
  readonly localeLabels: Readonly<Record<SupportedLocale, string>>;
  /** For `format()` / `formatDistanceToNow()` — never `Intl.DateTimeFormat`. */
  readonly dateFnsLocale: DateFnsLocale;
  /**
   * Default first day of the week for a NEW ledger. Once a ledger exists this
   * is a ledger property: a shared calendar grid has to line up for every
   * member, so the device value only pre-fills the creation sheet.
   */
  readonly weekStartsOn: WeekStartsOn;
  /** Default base currency for a NEW ledger. Same caveat as `weekStartsOn`. */
  readonly defaultCurrency: string;
  /** IANA zone, e.g. `'Asia/Seoul'`. Also only a creation-form default. */
  readonly timezone: string;
  readonly uses24HourClock: boolean;
}

export const useLocale = (): UseLocaleResult => {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocale,
    // The server snapshot: RN has no SSR, but react-native-web does, and a
    // mismatched snapshot silently disables the subscription.
    getLocale,
  );

  const setLocale = useCallback((next: SupportedLocale): void => {
    setActiveLocale(next);
  }, []);

  const resetToDeviceLocale = useCallback((): void => {
    resetLocaleToDevice();
  }, []);

  return useMemo(() => {
    const fallback = LOCALE_DEFAULTS[locale];

    return {
      locale,
      setLocale,
      resetToDeviceLocale,
      isFollowingDevice: isFollowingDeviceLocale(),
      supportedLocales: SUPPORTED_LOCALES,
      localeLabels: LOCALE_LABELS,
      dateFnsLocale: DATE_FNS_LOCALES[locale],
      weekStartsOn: deviceWeekStartsOn ?? fallback.weekStartsOn,
      defaultCurrency: deviceCurrency ?? fallback.currency,
      timezone: deviceCalendar?.timeZone ?? 'UTC',
      uses24HourClock: deviceCalendar?.uses24hourClock ?? true,
    };
  }, [locale, resetToDeviceLocale, setLocale]);
};
