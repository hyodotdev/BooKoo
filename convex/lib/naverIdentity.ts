import type {VerifiedIdentity} from './idToken';
import {appError} from './errors';

const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

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

/**
 * Naver exposes no audience-bound ID token. The profile endpoint proves token
 * possession, but its email remains untrusted and can never auto-link.
 */
export async function verifyNaverAccessToken(
  accessToken: string,
): Promise<VerifiedIdentity> {
  const response = await fetch(NAVER_PROFILE_URL, {
    method: 'GET',
    headers: {Authorization: `Bearer ${accessToken}`},
  }).catch(() => null);
  if (response === null)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.naver.profile');
  const body = asRecord(await response.json().catch(() => null));
  const profile = asRecord(body?.response);
  const subject = asString(profile?.id);
  if (
    !response.ok ||
    body?.resultcode !== '00' ||
    profile === undefined ||
    subject === undefined
  ) {
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.naver.profile');
  }
  return {
    subject,
    email: asString(profile.email),
    emailVerified: false,
    name: asString(profile.name) ?? asString(profile.nickname),
    picture: asString(profile.profile_image),
    nickname: asString(profile.nickname),
  };
}
