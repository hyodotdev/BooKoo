import {
  DISPLAY_NAME_MAX_LENGTH,
  generatedDisplayName,
  normalizeDisplayName,
  validateDisplayName,
} from '@shared/profile';

describe('profile display-name rules', () => {
  it('normalizes surrounding and repeated whitespace', () => {
    expect(normalizeDisplayName('  Minji   Kim  ')).toBe('Minji Kim');
    expect(validateDisplayName('  Minji   Kim  ')).toEqual({
      ok: true,
      value: 'Minji Kim',
    });
  });

  it('allows a blank name and rejects overlong names', () => {
    expect(validateDisplayName('   ')).toEqual({ok: true, value: ''});
    expect(validateDisplayName('가'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual(
      {ok: false, reason: 'TOO_LONG'},
    );
  });

  it('assigns a stable generated starter name', () => {
    expect(generatedDisplayName('user-a')).toBe(generatedDisplayName('user-a'));
    expect(generatedDisplayName('user-a')).not.toBe(
      generatedDisplayName('user-b'),
    );
    expect(validateDisplayName(generatedDisplayName('user-a')).ok).toBe(true);
  });
});
