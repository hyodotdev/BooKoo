import {
  MAIN_SIGN_IN_METHODS,
  SECONDARY_SIGN_IN_METHODS,
} from '../../../../src/features/auth/signInMethods';

describe('sign-in method hierarchy', () => {
  test('keeps email, Apple, and Google as the three primary choices', () => {
    expect(MAIN_SIGN_IN_METHODS).toEqual(['email', 'apple', 'google']);
  });

  test('keeps Kakao and Naver as circular secondary choices', () => {
    expect(SECONDARY_SIGN_IN_METHODS).toEqual(['kakao', 'naver']);
  });
});
