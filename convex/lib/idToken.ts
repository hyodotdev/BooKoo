import {ConvexError} from 'convex/values';
import {createRemoteJWKSet, jwtVerify} from 'jose';

import type {AppErrorPayload} from '../../shared/appErrors';
import type {SocialProvider} from './constants';
import {appError} from './errors';
import {fetchKakaoProfile} from './kakaoIdentity';
import {verifyNaverAccessToken} from './naverIdentity';

const APPLE_ISSUER = 'https://appleid.apple.com';
const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const;
const KAKAO_ISSUER = 'https://kauth.kakao.com';
const KAKAO_MAX_TOKEN_AGE_SECONDS = 10 * 60;

const appleJwks = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
const googleJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const kakaoJwks = createRemoteJWKSet(
  new URL('https://kauth.kakao.com/.well-known/jwks.json'),
);

export interface VerifiedIdentity {
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly picture?: string;
  readonly nickname?: string;
}

export interface VerifiedAppleIdentity extends VerifiedIdentity {
  readonly audience: string;
}

export type SocialCredentials = Partial<Record<string, unknown>>;

export interface VerifiedSocialCredentials {
  readonly identity: VerifiedIdentity;
  readonly fallbackName?: string;
  readonly apple?: {
    readonly audience: string;
    readonly authorizationCode?: string;
  };
}

function splitEnvList(raw: string | undefined): string[] {
  return raw === undefined
    ? []
    : raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function optionalCredentialString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function requireCredentialString(
  value: unknown,
  provider: SocialProvider,
): string {
  const parsed = optionalCredentialString(value);
  if (parsed !== undefined) return parsed;
  if (provider === 'apple')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.parse');
  if (provider === 'google')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.google.noSub');
  if (provider === 'kakao')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.noSub');
  throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.naver.profile');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function claimedAudiences(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string',
  );
}

function appleAudiences(): string[] {
  return [
    ...splitEnvList(process.env.APPLE_BUNDLE_ID),
    ...splitEnvList(process.env.APPLE_SERVICE_ID),
  ];
}

function googleAudiences(): string[] {
  return [
    ...splitEnvList(process.env.GOOGLE_IOS_CLIENT_ID),
    ...splitEnvList(process.env.GOOGLE_ANDROID_CLIENT_ID),
    ...splitEnvList(process.env.GOOGLE_WEB_CLIENT_ID),
  ];
}

function kakaoAudiences(): string[] {
  return [
    ...new Set([
      ...splitEnvList(process.env.KAKAO_NATIVE_APP_KEY),
      ...splitEnvList(process.env.KAKAO_REST_API_KEY),
    ]),
  ];
}

export function isAppleServiceId(audience: string): boolean {
  return splitEnvList(process.env.APPLE_SERVICE_ID).includes(audience);
}

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonce: string | undefined,
): Promise<VerifiedAppleIdentity> {
  const audiences = appleAudiences();
  if (audiences.length === 0)
    throw appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.apple.notConfigured',
    );
  const {payload} = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });
  if (typeof payload.sub !== 'string')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.noSub');
  const audience = claimedAudiences(payload.aud).find((value) =>
    audiences.includes(value),
  );
  if (audience === undefined)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.aud');
  const tokenNonce = asString(payload.nonce);
  if (tokenNonce !== undefined && tokenNonce !== expectedNonce)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.nonce');
  return {
    subject: payload.sub,
    email: asString(payload.email),
    emailVerified: asBoolean(payload.email_verified),
    audience,
  };
}

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedIdentity> {
  const audiences = googleAudiences();
  if (audiences.length === 0)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.google.noSub');
  const {payload} = await jwtVerify(idToken, googleJwks, {
    issuer: [...GOOGLE_ISSUERS],
    audience: audiences,
  });
  if (typeof payload.sub !== 'string')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.google.noSub');
  return {
    subject: payload.sub,
    email: asString(payload.email),
    emailVerified: asBoolean(payload.email_verified),
    name: asString(payload.name),
    picture: asString(payload.picture),
  };
}

export async function verifyKakaoIdToken(
  idToken: string,
  expectedNonce: string | undefined,
): Promise<VerifiedIdentity> {
  const allowed = kakaoAudiences();
  if (allowed.length === 0)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.aud');
  const {payload} = await jwtVerify(idToken, kakaoJwks, {
    issuer: KAKAO_ISSUER,
    maxTokenAge: KAKAO_MAX_TOKEN_AGE_SECONDS,
  });
  if (!claimedAudiences(payload.aud).some((value) => allowed.includes(value)))
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.aud');
  if (typeof payload.sub !== 'string')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.noSub');
  const tokenNonce = asString(payload.nonce);
  if (tokenNonce !== undefined && tokenNonce !== expectedNonce)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.nonce');
  return {
    subject: payload.sub,
    email: asString(payload.email),
    emailVerified: false,
    name: asString(payload.nickname),
    picture: asString(payload.picture),
  };
}

function providerFailure(
  provider: SocialProvider,
): ConvexError<AppErrorPayload> {
  if (provider === 'apple')
    return appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.parse');
  if (provider === 'google')
    return appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.google.noSub');
  if (provider === 'kakao')
    return appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.kakao.foreignToken',
    );
  return appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.naver.profile');
}

export async function verifySocialCredentials(
  provider: SocialProvider,
  credentials: SocialCredentials,
): Promise<VerifiedSocialCredentials> {
  try {
    const fallbackName = optionalCredentialString(credentials.name);
    if (provider === 'apple') {
      const identity = await verifyAppleIdToken(
        requireCredentialString(credentials.idToken, provider),
        optionalCredentialString(credentials.nonce),
      );
      return {
        identity,
        fallbackName,
        apple: {
          audience: identity.audience,
          authorizationCode: optionalCredentialString(
            credentials.authorizationCode,
          ),
        },
      };
    }
    if (provider === 'google')
      return {
        identity: await verifyGoogleIdToken(
          requireCredentialString(credentials.idToken, provider),
        ),
        fallbackName,
      };
    if (provider === 'kakao') {
      const identity = await verifyKakaoIdToken(
        requireCredentialString(credentials.idToken, provider),
        optionalCredentialString(credentials.nonce),
      );
      const accessToken = optionalCredentialString(credentials.accessToken);
      const profile =
        accessToken === undefined
          ? undefined
          : await fetchKakaoProfile(accessToken, identity.subject);
      return {
        identity:
          profile === undefined
            ? identity
            : {
                ...identity,
                email: profile.email ?? identity.email,
                emailVerified: profile.emailVerified,
                name: profile.name ?? identity.name,
                picture: profile.picture ?? identity.picture,
              },
        fallbackName,
      };
    }
    return {
      identity: await verifyNaverAccessToken(
        requireCredentialString(credentials.accessToken, provider),
      ),
      fallbackName,
    };
  } catch (error: unknown) {
    if (error instanceof ConvexError) throw error;
    console.error(`Provider ${provider} verification failed`, error);
    throw providerFailure(provider);
  }
}
