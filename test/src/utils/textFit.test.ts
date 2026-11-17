import {wholeWordFit} from '../../../src/utils/textFit';

describe('whole-word fit', () => {
  // An Android tablet split the Indonesian "Pemeliharaan" into
  // "Pemeliharaa / n" even in a 74dp cell.
  it('shrinks a one-word Latin name instead of splitting it', () => {
    expect(wholeWordFit('Pemeliharaan')).toEqual({
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.7,
      numberOfLines: 1,
    });
    expect(wholeWordFit('Instandhaltung').numberOfLines).toBe(1);
  });

  it('wraps names with spaces and CJK or Hangul names on two lines', () => {
    expect(wholeWordFit('Maintenance fee')).toEqual({numberOfLines: 2});
    expect(wholeWordFit('手机与网络费')).toEqual({numberOfLines: 2});
    expect(wholeWordFit('통신비')).toEqual({numberOfLines: 2});
  });

  it('shrinks a long one-word settings title at the largest text size', () => {
    expect(wholeWordFit('Announcements').numberOfLines).toBe(1);
    expect(wholeWordFit('Export ledger data').numberOfLines).toBe(2);
  });
});
