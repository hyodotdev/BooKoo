import {readdirSync} from 'node:fs';
import {join} from 'node:path';

import {
  RESERVED_EXACT_HANDLES,
  confusableKey,
  handleCandidates,
  isHandleClaimAvailable,
  isReservedHandle,
  normalizeHandle,
  validateHandle,
} from '@shared/username';

describe('username rules', () => {
  test('folds compatibility forms but rejects non-ASCII confusables', () => {
    expect(normalizeHandle('  Ｈｙｏ  ')).toBe('hyo');
    expect(validateHandle('раypal')).toEqual({
      ok: false,
      reason: 'BAD_CHARSET',
    });
  });

  test.each([
    ['ab', 'TOO_SHORT'],
    ['a'.repeat(21), 'TOO_LONG'],
    ['hyo-', 'BAD_CHARSET'],
    ['_hyo', 'BAD_EDGE'],
    ['hyo.', 'BAD_EDGE'],
    ['hy..o', 'DOUBLE_SEPARATOR'],
    ['support-team', 'BAD_CHARSET'],
    ['support_team', 'RESERVED'],
  ])('rejects %s as %s', (value, reason) => {
    expect(validateHandle(value)).toEqual({ok: false, reason});
  });

  test('keeps the uniqueness key separate from the similarity warning key', () => {
    expect(confusableKey('jo.hn')).toBe(confusableKey('john'));
    expect(validateHandle('jo.hn')).toEqual({ok: true, key: 'jo.hn'});
    expect(validateHandle('john')).toEqual({ok: true, key: 'john'});
  });

  test('generates a deterministic, valid and duplicate-free bounded list', () => {
    const first = handleCandidates('효', 12, 2026);
    const second = handleCandidates('효', 12, 2026);
    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(new Set(first).size).toBe(first.length);
    expect(first.every((candidate) => validateHandle(candidate).ok)).toBe(true);
    expect(first[0]).toBe('user26');
  });

  test('reserves every static top-level route segment', () => {
    const ignored = new Set(['_layout.tsx', 'index.tsx']);
    for (const entry of readdirSync(join(process.cwd(), 'app'), {
      withFileTypes: true,
    })) {
      if (
        entry.name.startsWith('_') ||
        entry.name.startsWith('+') ||
        entry.name.startsWith('(')
      )
        continue;
      if (!entry.isDirectory() && !/\.(?:ts|tsx|js|jsx)$/.test(entry.name))
        continue;
      const segment = entry.isDirectory()
        ? entry.name
        : ignored.has(entry.name)
          ? undefined
          : entry.name.replace(/\.[^.]+$/, '');
      if (segment === undefined || segment.startsWith('[')) continue;
      expect(
        RESERVED_EXACT_HANDLES.has(segment) || isReservedHandle(segment),
      ).toBe(true);
    }
  });

  test('keeps the current handle available to its owner', () => {
    expect(
      isHandleClaimAvailable({userId: 'me'}, 'me', 10_000, 1_000),
    ).toBe(true);
  });

  test('blocks another owner until the release cooldown expires', () => {
    expect(
      isHandleClaimAvailable({userId: 'other'}, 'me', 10_000, 1_000),
    ).toBe(false);
    expect(
      isHandleClaimAvailable(
        {userId: 'other', releasedAt: 9_001},
        'me',
        10_000,
        1_000,
      ),
    ).toBe(false);
    expect(
      isHandleClaimAvailable(
        {userId: 'other', releasedAt: 9_000},
        'me',
        10_000,
        1_000,
      ),
    ).toBe(true);
  });
});
