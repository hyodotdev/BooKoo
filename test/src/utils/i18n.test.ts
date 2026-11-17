import {renderHook, act} from '@testing-library/react-native';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatAmount,
  formatCount,
  formatDate,
  formatRatio,
  getDateFnsLocale,
  getLocale,
  i18n,
  resetLocaleToDevice,
  setActiveLocale,
  t,
  tCount,
} from '../../../src/STRINGS';
import {useLocale} from '../../../src/hooks/useLocale';

describe('i18n smoke', () => {
  afterEach(() => {
    resetLocaleToDevice();
  });

  it('boots on the device locale', () => {
    expect(SUPPORTED_LOCALES).toContain(getLocale());
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('translates', () => {
    setActiveLocale('ko');
    expect(t('common.done')).toBe('완료');
    setActiveLocale('ja');
    expect(t('common.done')).toBe('完了');
    setActiveLocale('fr');
    expect(t('common.done')).toBe('Terminé');
    setActiveLocale('es');
    expect(t('settings.language')).toBe('Idioma');
  });

  it('ships developed-country locales alongside legacy parity', () => {
    expect(SUPPORTED_LOCALES).toEqual([
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
    ]);
  });

  it('interpolates', () => {
    setActiveLocale('en');
    expect(t('auth.otpSent', {email: 'a@b.c'})).toContain('a@b.c');
  });

  it('renders in another locale without leaking it', () => {
    setActiveLocale('en');
    expect(t('common.done', undefined, 'ko')).toBe('완료');
    expect(getLocale()).toBe('en');
  });

  it('pluralizes', () => {
    setActiveLocale('en');
    expect(tCount('ledger.itemCount', 0)).toBe('No entries');
    expect(tCount('ledger.itemCount', 1)).toBe('1 entry');
    expect(tCount('ledger.itemCount', 1234)).toBe('1,234 entries');

    setActiveLocale('ko');
    expect(tCount('ledger.itemCount', 0)).toBe('내역 없음');
    expect(tCount('ledger.itemCount', 1)).toBe('내역 1건');
    expect(tCount('ledger.itemCount', 1234)).toBe('내역 1,234건');
  });

  it('renders Vietnamese counts, VND and calendar dates without fallback', () => {
    setActiveLocale('vi');
    expect(t('settings.language')).toBe('Ngôn ngữ');
    expect(t('auth.signingInWith', {provider: 'Google'})).toBe(
      'Đang đăng nhập với Google…',
    );
    expect(tCount('ledger.itemCount', 0)).toBe('Chưa có giao dịch');
    expect(tCount('ledger.itemCount', 1)).toBe('1 giao dịch');
    expect(tCount('ledger.itemCount', 1234)).toBe('1.234 giao dịch');
    expect(formatAmount({amountMinor: 1234567, currency: 'VND'})).toBe(
      '1.234.567 ₫',
    );
    expect(getDateFnsLocale().code).toBe('vi');
    expect(formatDate(new Date(2026, 10, 4), 'EEEE')).toBe('Thứ Tư');
    expect(t('common.done', undefined, 'en')).toBe('Done');
    expect(getLocale()).toBe('vi');
  });

  it('reports a missing key instead of rendering chrome', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Straight through the raw instance: `t()` will not accept an unknown key,
    // which is the point — this only proves the runtime fallback is not the
    // legacy's silent literal `'...'`.
    expect(i18n.t('common.nope')).toBe('nope');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('formats numbers, money and dates', () => {
    setActiveLocale('en');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatRatio(0.1234)).toBe('12.3%');
    expect(formatAmount({amountMinor: 123456, currency: 'USD'})).toContain(
      '1,234',
    );
    expect(formatAmount({amountMinor: 12000, currency: 'KRW'})).toContain(
      '12,000',
    );
    expect(formatDate(new Date(2026, 7, 24), 'yyyy-MM-dd')).toBe('2026-08-24');
    setActiveLocale('ko');
    expect(getDateFnsLocale().code).toBe('ko');
  });
});

describe('useLocale', () => {
  it('re-renders on a locale change and exposes the defaults', () => {
    const {result} = renderHook(() => useLocale());

    act(() => {
      result.current.setLocale('ja');
    });

    expect(result.current.locale).toBe('ja');
    expect(result.current.dateFnsLocale.code).toBe('ja');
    expect(result.current.isFollowingDevice).toBe(false);
    // __mocks__/expo-localization: firstWeekday 1 (Sunday), currencyCode USD.
    expect(result.current.weekStartsOn).toBe(0);
    expect(result.current.defaultCurrency).toBe('USD');
    expect(result.current.timezone).toBe('Asia/Seoul');

    act(() => {
      result.current.resetToDeviceLocale();
    });

    expect(result.current.locale).toBe('en');
    expect(result.current.isFollowingDevice).toBe(true);
  });
});
