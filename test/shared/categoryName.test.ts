import {categoryNameInput, isValidCategoryName} from '@shared/categories';
import {validateCategoryLabel} from '../../convex/lib/categoryMutations';

describe('category names', () => {
  it.each(['Food', '외식비', '食費', '🍽️', 'x'.repeat(40)])(
    'accepts a compact name: %s',
    (name) => {
      expect(isValidCategoryName(name)).toBe(true);
      expect(validateCategoryLabel(name)).toBe(name);
    },
  );
  it.each([
    '',
    ' ',
    ' Food',
    'Food ',
    'Shared dinners',
    '식\t비',
    '식\n비',
    '식\u00a0비',
    '식\u3000비',
    'x'.repeat(41),
  ])('requires normalization or rejects invalid editor input: %s', (name) => {
    expect(isValidCategoryName(name)).toBe(false);
  });
  it.each(['', ' \n\t\u3000', 'x'.repeat(41)])(
    'rejects an empty or overlong normalized name: %s',
    (name) => expect(() => validateCategoryLabel(name)).toThrow(),
  );
  it.each([
    [' Food ', 'Food'],
    ['Shared dinners', 'Shareddinners'],
    ['식\t비', '식비'],
    ['식\u3000비', '식비'],
  ])(
    'normalizes old-client writes without rejecting spaces: %s',
    (input, expected) => {
      expect(validateCategoryLabel(input)).toBe(expected);
    },
  );
  it('removes whitespace without truncating text or splitting Korean composition', () => {
    expect(categoryNameInput(' Shared\ndinners\tand\u00a0food ')).toBe(
      'Shareddinnersandfood',
    );
    expect(categoryNameInput('외 ㅅ')).toBe('외ㅅ');
  });
});
