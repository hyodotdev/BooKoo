import {
  encodeInviteCode,
  formatInviteCodeForDisplay,
  hashInviteCode,
  inviteUrl,
  normalizeInviteCode,
} from '@shared/inviteCode';

describe('invite code contract', () => {
  const code = 'BK1000G40R40M30E209185GR38E1W';

  it('encodes 128 deterministic bits in Crockford base32', () => {
    const bytes = Uint8Array.from({length: 16}, (_, index) => index);
    expect(encodeInviteCode(bytes)).toBe(code);
    expect(() => encodeInviteCode(bytes.slice(1))).toThrow(
      'Invite entropy must be 16 bytes',
    );
  });

  it('normalizes display confusables and rejects malformed input', () => {
    expect(normalizeInviteCode(' bk1-ooog-4or4-om3o-e2o9-185g-r38e-1w ')).toBe(
      code,
    );
    expect(normalizeInviteCode('BK1-too-short')).toBeNull();
    expect(formatInviteCodeForDisplay(code)).toBe(
      'BK1-000G-40R4-0M30-E209-185G-R38E-1W',
    );
  });

  it('hashes the normalized secret and emits only the public HTTPS route', () => {
    expect(hashInviteCode(code, 'pepper')).toBe(
      '2b7c5cbf49bb9496335f83864255bef42808035978fba07e458a804cf949ffdb',
    );
    expect(inviteUrl(code)).toBe(
      'https://bookoo.hyo.dev/invite/BK1-000G-40R4-0M30-E209-185G-R38E-1W',
    );
  });
});
