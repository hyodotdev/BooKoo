import {
  redirectSystemPath,
  rewriteIncomingSystemPath,
} from '../../app/+native-intent';

const DISPLAY_CODE = 'BK1-000G-40R4-0M30-E209-185G-R38E-1W';
const NORMALIZED_CODE = 'BK1000G40R40M30E209185GR38E1W';

describe('native invite-link routing', () => {
  it('opens a verified production invitation in the in-app route', () => {
    expect(
      redirectSystemPath({
        path: `https://bookoo.hyo.dev/invite/${DISPLAY_CODE}`,
        initial: true,
      }),
    ).toBe(`/invite/${NORMALIZED_CODE}`);
  });

  it('does not accept the same path from a look-alike host', () => {
    const lookalike = `https://bookoo.hyo.dev.evil.example/invite/${DISPLAY_CODE}`;
    expect(redirectSystemPath({path: lookalike, initial: true})).toBe(
      lookalike,
    );
  });

  it('does not route a malformed invitation token', () => {
    const malformed = 'https://bookoo.hyo.dev/invite/not-a-valid-code';
    expect(redirectSystemPath({path: malformed, initial: true})).toBe(
      malformed,
    );
  });

  it('does not treat the Apple Android callback as a missing route', () => {
    expect(rewriteIncomingSystemPath('bookoo://apple-callback')).toBe(
      '/apple-callback',
    );
    expect(
      rewriteIncomingSystemPath('bookoo://apple-callback#id_token=abc&state=1'),
    ).toBe('/apple-callback');
    expect(rewriteIncomingSystemPath('/apple-callback')).toBe(
      '/apple-callback',
    );
    expect(
      redirectSystemPath({
        path: 'bookoo://apple-callback#id_token=abc',
        initial: false,
      }),
    ).toBe('/apple-callback');
  });
});
