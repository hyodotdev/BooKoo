import {
  appleAuthorizeUrl,
  configuredClientEnv,
  getSocialCredentials,
  isSocialSignInAvailable,
  SOCIAL_PROVIDERS,
} from '../../../../src/features/auth/social';

describe('social sign-in adapters', () => {
  test('reports every configured native provider as available', () => {
    for (const provider of SOCIAL_PROVIDERS)
      expect(isSocialSignInAvailable(provider)).toBe(true);
  });

  test('normalizes Apple credentials', async () => {
    await expect(getSocialCredentials('apple')).resolves.toEqual({
      authorizationCode: 'mock-apple-authorization-code',
      idToken: 'mock-apple-identity-token',
    });
  });

  test('normalizes Google credentials', async () => {
    await expect(getSocialCredentials('google')).resolves.toEqual({
      idToken: 'mock-google-id-token',
      name: 'Mock User',
    });
  });

  test('normalizes Kakao credentials', async () => {
    await expect(getSocialCredentials('kakao')).resolves.toEqual({
      accessToken: 'mock-kakao-access-token',
      idToken: 'mock-kakao-id-token',
      nonce: expect.any(String),
    });
  });

  test('treats blank Apple client env as missing', () => {
    expect(configuredClientEnv(undefined)).toBeUndefined();
    expect(configuredClientEnv('')).toBeUndefined();
    expect(configuredClientEnv('  ')).toBeUndefined();
    expect(configuredClientEnv('dev.hyo.bookoo.web')).toBe(
      'dev.hyo.bookoo.web',
    );
  });

  test('encodes Apple authorize spaces so Android does not send invalid_request', () => {
    const url = appleAuthorizeUrl({
      clientId: 'dev.hyo.bookoo.web',
      nonce: 'nonce-1',
      redirectUri: 'https://example.convex.site/auth/apple/callback',
      state: 'state-1',
    });
    expect(url).toContain('response_type=code%20id_token');
    expect(url).toContain('scope=name%20email');
    expect(url).not.toContain('response_type=code+id_token');
    expect(url).toContain('client_id=dev.hyo.bookoo.web');
  });

  test('normalizes Naver credentials', async () => {
    await expect(getSocialCredentials('naver')).resolves.toEqual({
      accessToken: 'mock-naver-access-token',
    });
  });
});
