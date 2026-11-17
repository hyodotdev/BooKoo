import {
  EMAIL_OTP_PROVIDER_IDS,
  hasMatchingAccountEmails,
  isEmailOtpProvider,
  shouldAutoLinkViaEmail,
} from '@shared/authPolicy';
import {SUPPORTED_LOCALES} from '@shared/locales';

describe('auth policy', () => {
  test('auto-links only a verified, syntactically usable email', () => {
    expect(
      shouldAutoLinkViaEmail({email: 'Hyo@Example.com', emailVerified: true}),
    ).toBe(true);
    expect(
      shouldAutoLinkViaEmail({email: 'hyo@example.com', emailVerified: false}),
    ).toBe(false);
    expect(shouldAutoLinkViaEmail({email: '  ', emailVerified: true})).toBe(
      false,
    );
    expect(shouldAutoLinkViaEmail({emailVerified: true})).toBe(false);
  });

  test('manual account linking requires matching account emails', () => {
    expect(
      hasMatchingAccountEmails(
        'HYO@example.com',
        'hyo@example.com',
        'hyo@example.com',
      ),
    ).toBe(true);
    expect(
      hasMatchingAccountEmails('hyo@example.com', 'hyo@example.com', undefined),
    ).toBe(true);
    expect(
      hasMatchingAccountEmails('a@example.com', 'b@example.com', undefined),
    ).toBe(false);
    expect(
      hasMatchingAccountEmails(
        'a@example.com',
        'a@example.com',
        'b@example.com',
      ),
    ).toBe(false);
  });

  test('recognizes every locale-specific OTP provider and nothing else', () => {
    expect(Object.keys(EMAIL_OTP_PROVIDER_IDS).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );
    for (const provider of Object.values(EMAIL_OTP_PROVIDER_IDS))
      expect(isEmailOtpProvider(provider)).toBe(true);
    expect(isEmailOtpProvider('email-link')).toBe(false);
    expect(isEmailOtpProvider('google')).toBe(false);
  });
});
