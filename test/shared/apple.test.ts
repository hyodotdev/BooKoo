import {
  appleAppRedirectLocation,
  parseAppleCallbackParams,
  parseAppleWebName,
} from '@shared/apple';

describe('parseAppleWebName', () => {
  it('keeps the product name order', () => {
    expect(
      parseAppleWebName(
        JSON.stringify({name: {firstName: '길동', lastName: '홍'}}),
      ),
    ).toBe('홍길동');
  });

  it('accepts a partial name', () => {
    expect(parseAppleWebName(JSON.stringify({name: {firstName: 'Hyo'}}))).toBe(
      'Hyo',
    );
  });

  it.each([undefined, '', '{broken', '[]', '{"name":null}'])(
    'ignores malformed input %p',
    (input) => {
      expect(parseAppleWebName(input)).toBeUndefined();
    },
  );
});

describe('Apple Android callback payload', () => {
  it('puts tokens in both the query and the fragment so Android Intents keep them', () => {
    const location = appleAppRedirectLocation(
      new URLSearchParams({
        id_token: 'token-1',
        state: 'state-1',
        extra: 'drop-me',
      }),
    );
    expect(location).toBe(
      'bookoo://apple-callback?id_token=token-1&state=state-1#id_token=token-1&state=state-1',
    );
  });

  it('reads the fragment first and falls back to the query', () => {
    expect(
      parseAppleCallbackParams(
        'bookoo://apple-callback#id_token=from-hash&state=s1',
      ).get('id_token'),
    ).toBe('from-hash');
    expect(
      parseAppleCallbackParams(
        'bookoo://apple-callback?id_token=from-query&state=s1',
      ).get('id_token'),
    ).toBe('from-query');
  });
});
