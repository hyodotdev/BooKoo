import {MMKV} from 'react-native-mmkv';

/**
 * Every non-secret, device-local key lives here. Credentials and app-lock
 * verifiers belong in SecureStore and must never be added to this inventory.
 */
export const Storage = {
  ActiveLedgerId: 'active-ledger-id',
  AnnouncementsLastReadAt: 'announcements-last-read-at',
  Locale: 'locale',
  LastOtaCheckAt: 'last-ota-check-at',
  LockEnabled: 'lock-enabled',
  LockLastActiveAt: 'lock-last-active-at',
  SessionHint: 'session-hint',
  PendingPurchaseIntent: 'pending-purchase-intent',
  SoftUpdateDismissal: 'soft-update-dismissal',
  ThemeType: 'theme-type',
} as const;

export const storage = new MMKV({id: 'bookoo.app'});

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const isThemePreference = (
  value: string | undefined,
): value is ThemePreference =>
  value !== undefined &&
  (THEME_PREFERENCES as readonly string[]).includes(value);
