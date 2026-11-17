import {normalizeEmail} from './email';

export const EMAIL_OTP_PROVIDER_IDS = {
  en: 'bookoo-otp',
  ko: 'bookoo-otp-ko',
  ja: 'bookoo-otp-ja',
  zh: 'bookoo-otp-zh',
  id: 'bookoo-otp-id',
  de: 'bookoo-otp-de',
  es: 'bookoo-otp-es',
  fr: 'bookoo-otp-fr',
  it: 'bookoo-otp-it',
  nl: 'bookoo-otp-nl',
  pt: 'bookoo-otp-pt',
  vi: 'bookoo-otp-vi',
} as const;

export type EmailOtpProviderId =
  (typeof EMAIL_OTP_PROVIDER_IDS)[keyof typeof EMAIL_OTP_PROVIDER_IDS];

const EMAIL_OTP_PROVIDER_ID_SET: ReadonlySet<string> = new Set(
  Object.values(EMAIL_OTP_PROVIDER_IDS),
);

export interface EmailIdentity {
  readonly email?: string;
  readonly emailVerified: boolean;
}

/** The only predicate that may enable an automatic email account merge. */
export function shouldAutoLinkViaEmail(identity: EmailIdentity): boolean {
  return identity.emailVerified && normalizeEmail(identity.email) !== undefined;
}

export function hasMatchingAccountEmails(
  currentEmailValue: string | undefined,
  otherEmailValue: string | undefined,
  credentialEmailValue: string | undefined,
): boolean {
  const current = normalizeEmail(currentEmailValue);
  const other = normalizeEmail(otherEmailValue);
  const credential = normalizeEmail(credentialEmailValue);
  return (
    current !== undefined &&
    current === other &&
    (credential === undefined || credential === current)
  );
}

export function isEmailOtpProvider(
  provider: string,
): provider is EmailOtpProviderId {
  return EMAIL_OTP_PROVIDER_ID_SET.has(provider);
}
