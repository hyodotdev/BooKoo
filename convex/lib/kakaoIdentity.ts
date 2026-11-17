import {appError} from './errors';

const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface KakaoProfile {
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly picture?: string;
}

/**
 * Upgrade a Kakao email to verified only after the access-token subject agrees
 * with the already signature-verified OIDC subject.
 */
export async function fetchKakaoProfile(
  accessToken: string,
  expectedSubject: string,
): Promise<KakaoProfile> {
  const response = await fetch(KAKAO_USER_URL, {
    method: 'GET',
    headers: {Authorization: `Bearer ${accessToken}`},
  }).catch(() => null);
  if (response === null)
    throw appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.kakao.foreignToken',
    );
  const body = asRecord(await response.json().catch(() => null));
  if (!response.ok || body === undefined)
    throw appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.kakao.foreignToken',
    );

  const subject =
    typeof body.id === 'number' ? String(body.id) : asString(body.id);
  if (subject !== expectedSubject)
    throw appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.kakao.foreignToken',
    );

  const account = asRecord(body.kakao_account);
  const profile = asRecord(account?.profile);
  return {
    email: asString(account?.email),
    emailVerified:
      account?.is_email_valid === true && account?.is_email_verified === true,
    name: asString(profile?.nickname),
    picture:
      asString(profile?.thumbnail_image_url) ??
      asString(profile?.profile_image_url),
  };
}
