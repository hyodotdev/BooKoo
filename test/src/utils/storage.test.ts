import {
  isThemePreference,
  Storage,
  storage,
  THEME_PREFERENCES,
} from '../../../src/utils/storage';

describe('device-local storage', () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it('keeps every non-secret key in one inventory', () => {
    expect(new Set(Object.values(Storage)).size).toBe(
      Object.values(Storage).length,
    );
  });

  it.each(THEME_PREFERENCES)(
    'accepts the %s theme preference',
    (preference) => {
      expect(isThemePreference(preference)).toBe(true);
    },
  );

  it('rejects absent and legacy boolean theme values', () => {
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference('true')).toBe(false);
    expect(isThemePreference('false')).toBe(false);
  });

  it('persists synchronous boot-path values in the shared instance', () => {
    storage.set(Storage.ThemeType, 'dark');
    storage.set(Storage.Locale, 'ko');

    expect(storage.getString(Storage.ThemeType)).toBe('dark');
    expect(storage.getString(Storage.Locale)).toBe('ko');
  });
});
