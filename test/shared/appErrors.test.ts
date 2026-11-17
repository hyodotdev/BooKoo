import {
  APP_ERROR_CODES,
  APP_ERROR_MESSAGE_KEYS,
  APP_ERROR_MESSAGE_KEYS_BY_CODE,
  appErrorPayloadOf,
  isAppErrorCode,
  isAppErrorPayload,
} from '@shared/appErrors';
import en from '../../assets/langs/en.json';

const valueAtPath = (root: unknown, path: string): unknown => {
  let value = root;

  for (const segment of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }

  return value;
};

describe('AppError wire contract', () => {
  it('keeps codes unique', () => {
    expect(new Set(APP_ERROR_CODES).size).toBe(APP_ERROR_CODES.length);
    expect(new Set(APP_ERROR_MESSAGE_KEYS).size).toBe(
      APP_ERROR_MESSAGE_KEYS.length,
    );
  });

  it('assigns every wire key to at least one code', () => {
    const assigned = new Set(
      Object.values(APP_ERROR_MESSAGE_KEYS_BY_CODE).flat(),
    );

    expect(assigned).toEqual(new Set(APP_ERROR_MESSAGE_KEYS));
  });

  it('recognizes every declared code and rejects unknown values', () => {
    for (const code of APP_ERROR_CODES) {
      expect(isAppErrorCode(code)).toBe(true);
    }

    expect(isAppErrorCode('LEDGER_CURRENCY_LOCKED')).toBe(false);
    expect(isAppErrorCode(undefined)).toBe(false);
  });

  it('has a real catalog leaf for every wire message key', () => {
    for (const key of APP_ERROR_MESSAGE_KEYS) {
      expect(typeof valueAtPath(en, key)).toBe('string');
    }
  });

  it('accepts a valid payload with finite raw params', () => {
    expect(
      isAppErrorPayload({
        code: 'RATE_LIMITED',
        messageKey: 'error.rateLimited',
        params: {retryAfterSeconds: 30, operation: 'invite'},
      }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    {code: 'UNKNOWN', messageKey: 'error.generic'},
    {code: 'FORBIDDEN', messageKey: 'common.error'},
    {code: 'FORBIDDEN', messageKey: 'error.futureUnknownKey'},
    {code: 'FORBIDDEN', messageKey: 'error.amountZero'},
    {code: 'FORBIDDEN', messageKey: 'error.forbidden', params: null},
    {
      code: 'RATE_LIMITED',
      messageKey: 'error.rateLimited',
      params: {retryAfterSeconds: Number.POSITIVE_INFINITY},
    },
    {
      code: 'INVALID_INPUT',
      messageKey: 'error.invalidInput',
      params: {nested: {secret: true}},
    },
  ])('rejects malformed payload %#', (payload) => {
    expect(isAppErrorPayload(payload)).toBe(false);
  });

  it('unwraps only validated ConvexError-shaped data', () => {
    const payload = {
      code: 'LEDGER_MAINTENANCE',
      messageKey: 'error.ledger.maintenance',
      params: {lock: 'TIMEZONE'},
    } as const;

    expect(appErrorPayloadOf({data: payload})).toEqual(payload);
    expect(appErrorPayloadOf({data: {...payload, code: 'UNKNOWN'}})).toBeNull();
    expect(appErrorPayloadOf(new Error('network'))).toBeNull();
  });
});
