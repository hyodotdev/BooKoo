import {SUPPORTED_LOCALES} from '@shared/locales';

import de from '../../../assets/langs/de.json';
import en from '../../../assets/langs/en.json';
import es from '../../../assets/langs/es.json';
import fr from '../../../assets/langs/fr.json';
import id from '../../../assets/langs/id.json';
import itLang from '../../../assets/langs/it.json';
import ja from '../../../assets/langs/ja.json';
import ko from '../../../assets/langs/ko.json';
import nl from '../../../assets/langs/nl.json';
import pt from '../../../assets/langs/pt.json';
import vi from '../../../assets/langs/vi.json';
import zh from '../../../assets/langs/zh.json';

const LANGS = {de, en, es, fr, id, it: itLang, ja, ko, nl, pt, vi, zh};

const isAllCaps = (value: string): boolean =>
  value.length > 1 &&
  value === value.toUpperCase() &&
  value !== value.toLowerCase();

describe('shared control labels', () => {
  it('covers every supported locale', () => {
    expect(Object.keys(LANGS).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  // All | Expense | Income sit in one segmented control; "All | EXPENSE |
  // INCOME" mixed two capitalizations in every Latin-script locale.
  it.each(Object.entries(LANGS))(
    '%s writes the Expense/Income segments like All',
    (_locale, strings) => {
      expect(isAllCaps(strings.common.all)).toBe(false);
      expect(isAllCaps(strings.ledgerItem.expense)).toBe(false);
      expect(isAllCaps(strings.ledgerItem.income)).toBe(false);
    },
  );

  // The Indonesian tutorial opened with "catatan silakan." — a lower-case,
  // machine-translated title on the first screen a new user sees.
  it.each(['de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'vi'] as const)(
    '%s starts every tutorial title with a capital letter',
    (locale) => {
      for (const slide of Object.values(LANGS[locale].tutorial)) {
        const first = slide.title.charAt(0);
        expect(first).toBe(first.toUpperCase());
      }
    },
  );

  // Indonesian shouted 29 labels the other locales write normally ("MEMO |
  // JUMLAH", "WARNA", "UNDANG"), some mistranslated: Yes was the slang
  // "IYA NIH", Done "LENGKAP" (complete), Delete "MENGHAPUS" (deleting).
  it.each(Object.keys(LANGS).filter((locale) => locale !== 'en'))(
    '%s writes in capitals only what English does',
    (locale) => {
      const shouted: string[] = [];
      // Every letter upper case; CJK letters have no case and never match.
      const shouting = (value: string): boolean =>
        /^\p{Lu}{3,}$/u.test(value.replace(/[^\p{L}]/gu, ''));
      const walk = (
        source: Record<string, unknown>,
        target: Record<string, unknown>,
        path: string,
      ): void => {
        for (const [key, value] of Object.entries(source)) {
          const other = target[key];
          if (typeof value === 'string' && typeof other === 'string') {
            if (shouting(other) && !shouting(value))
              shouted.push(`${path}${key}`);
          } else if (
            typeof value === 'object' &&
            value !== null &&
            typeof other === 'object' &&
            other !== null
          )
            walk(
              value as Record<string, unknown>,
              other as Record<string, unknown>,
              `${path}${key}.`,
            );
        }
      };
      walk(en, LANGS[locale as keyof typeof LANGS], '');
      expect(shouted).toEqual([]);
    },
  );

  // The ··· buttons and the stats "other" slice read 更 (a comparative) in
  // Chinese and "lebih" in Indonesian.
  it('names the more button as a noun in English, Chinese and Indonesian', () => {
    expect(en.common.more).toBe('More');
    expect(zh.common.more).toBe('更多');
    expect(id.common.more).toBe('Lainnya');
  });

  // Chinese answered Yes with 四 ("four"), labelled Next in Korean (다음),
  // Add as 另外 ("additionally") and Amount as 的金额; Japanese Next read
  // 次の ("the next …") and Date 日 ("day").
  it('uses natural Chinese and Japanese for the shared actions', () => {
    expect(zh.common.yes).toBe('是');
    expect(zh.common.no).toBe('否');
    expect(zh.common.next).toBe('下一步');
    expect(zh.common.add).toBe('添加');
    expect(zh.common.amount).toBe('金额');
    expect(ja.common.next).toBe('次へ');
    expect(ja.common.date).toBe('日付');
    // One spelling: the category editor header alone read カテゴリー.
    expect(ja.common.category).toBe('カテゴリ');
  });

  it.each(Object.keys(LANGS).filter((locale) => locale !== 'ko'))(
    '%s carries no Korean text',
    (locale) => {
      const korean: string[] = [];
      const walk = (source: Record<string, unknown>, path: string): void => {
        for (const [key, value] of Object.entries(source)) {
          if (typeof value === 'string') {
            // The language picker names Korean in Korean.
            if (/[\uac00-\ud7a3]/.test(value.replace('한국어', '')))
              korean.push(`${path}${key}`);
          } else if (typeof value === 'object' && value !== null)
            walk(value as Record<string, unknown>, `${path}${key}.`);
        }
      };
      walk(LANGS[locale as keyof typeof LANGS], '');
      expect(korean).toEqual([]);
    },
  );

  // A translation review found meaning-reversing strings: Chinese Login read
  // 注册 (sign up), Announcements repeated Notifications (通知), Japanese
  // "Leave this ledger?" asked whether to stay (残す) and Add category read
  // only カテゴリ.
  it('keeps the visible labels saying what they do', () => {
    expect(zh.auth.login).toBe('登录');
    expect(ja.category.add).toBe('カテゴリを追加');
    expect(ja.ledger.leaveConfirm).not.toContain('残す');
    expect(en.permission.locationDenied).not.toContain('don not');
  });

  it.each(Object.keys(LANGS))(
    '%s names Announcements and Notifications differently',
    (locale) => {
      const lang = LANGS[locale as keyof typeof LANGS];
      expect(lang.settings.announcements).not.toBe(lang.settings.notifications);
    },
  );

  it('uses plain Indonesian for the shared actions', () => {
    expect(id.common.yes).toBe('Ya');
    expect(id.common.done).toBe('Selesai');
    expect(id.common.delete).toBe('Hapus');
    expect(id.common.add).toBe('Tambah');
    expect(id.common.success).toBe('Berhasil');
  });

  // Indonesian titles such as the login heading read "login" and "mengunci".
  it.each(['de', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'vi'] as const)(
    '%s capitalizes every string English capitalizes',
    (locale) => {
      const lowered: string[] = [];
      const walk = (
        source: Record<string, unknown>,
        target: Record<string, unknown>,
        path: string,
      ): void => {
        for (const [key, value] of Object.entries(source)) {
          const other = target[key];
          if (typeof value === 'string' && typeof other === 'string') {
            const first = value.charAt(0);
            const theirs = other.charAt(0);
            if (
              first !== first.toLowerCase() &&
              theirs !== theirs.toUpperCase()
            )
              lowered.push(`${path}${key}`);
          } else if (
            typeof value === 'object' &&
            value !== null &&
            typeof other === 'object' &&
            other !== null
          )
            walk(
              value as Record<string, unknown>,
              other as Record<string, unknown>,
              `${path}${key}.`,
            );
        }
      };
      walk(en, LANGS[locale], '');
      expect(lowered).toEqual([]);
    },
  );

  it('spells the English dismiss and unknown labels', () => {
    expect(en.common.ok).toBe('OK');
    expect(en.common.unknown).toBe('Unknown');
  });
});
