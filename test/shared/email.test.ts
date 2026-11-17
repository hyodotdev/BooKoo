import {normalizeEmail} from '@shared/email';

describe('normalizeEmail', () => {
  test('normalizes casing and surrounding whitespace', () => {
    expect(normalizeEmail('  Hyo@Example.COM ')).toBe('hyo@example.com');
  });

  test('rejects incomplete, repeated-at, and whitespace addresses', () => {
    for (const value of [
      '',
      'name',
      '@example.com',
      'name@',
      'a@@b.com',
      'a b@c.com',
    ])
      expect(normalizeEmail(value)).toBeUndefined();
  });

  test('does not collapse provider-specific aliases', () => {
    expect(normalizeEmail('a.b+ledger@gmail.com')).toBe('a.b+ledger@gmail.com');
  });
});
