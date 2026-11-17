import {
  DEVELOPMENT_FIXED_OTP_CODE,
  FIXED_OTP_COLLISION_LIMIT,
  selectFixedOtpCode,
  selectFixedOtpCollisionIds,
} from '../../convex/otp/fixedOtpPolicy';

describe('development fixed OTP', () => {
  test('accepts 68686868 for every development email', () => {
    const environment = {environment: 'development'};

    expect(selectFixedOtpCode('one@example.com', environment)).toBe(
      DEVELOPMENT_FIXED_OTP_CODE,
    );
    expect(selectFixedOtpCode('two@example.com', environment)).toBe('68686868');
  });

  test('never enables the development code in production', () => {
    expect(
      selectFixedOtpCode('one@example.com', {environment: 'production'}),
    ).toBeUndefined();
  });

  test('requires the exact development environment value', () => {
    expect(
      selectFixedOtpCode('one@example.com', {environment: 'preview'}),
    ).toBeUndefined();
    expect(selectFixedOtpCode('one@example.com', {})).toBeUndefined();
  });

  test('keeps the explicit app-review allowlist independent', () => {
    const environment = {
      appReviewCode: '12345678',
      appReviewEmails: 'reviewer@example.com',
      environment: 'production',
    };

    expect(selectFixedOtpCode('REVIEWER@example.com', environment)).toBe(
      '12345678',
    );
    expect(
      selectFixedOtpCode('other@example.com', environment),
    ).toBeUndefined();
  });

  test('keeps only the newest row for a globally shared fixed code', () => {
    expect(FIXED_OTP_COLLISION_LIMIT).toBe(64);
    expect(
      selectFixedOtpCollisionIds(
        [{_id: 'older-a'}, {_id: 'current'}, {_id: 'older-b'}],
        'current',
      ),
    ).toEqual(['older-a', 'older-b']);
  });
});
