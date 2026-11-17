import {SignJWT, importPKCS8} from 'jose';

import {APPLE_CALLBACK_PATH} from './constants';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export interface AppleClientSecretConfig {
  readonly teamId: string;
  readonly keyId: string;
  readonly privateKey: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function appleClientSecretConfig(): AppleClientSecretConfig | null {
  const teamId = readEnv('APPLE_TEAM_ID');
  const keyId = readEnv('APPLE_KEY_ID');
  const privateKey = readEnv('APPLE_PRIVATE_KEY');
  if (teamId === undefined || keyId === undefined || privateKey === undefined)
    return null;
  return {teamId, keyId, privateKey: privateKey.replace(/\\n/g, '\n')};
}

export function appleWebRedirectUri(): string {
  return `${process.env.CONVEX_SITE_URL ?? ''}${APPLE_CALLBACK_PATH}`;
}

export async function createAppleClientSecret(
  config: AppleClientSecretConfig,
  clientId: string,
): Promise<string> {
  const key = await importPKCS8(config.privateKey, 'ES256');
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({alg: 'ES256', kid: config.keyId})
    .setIssuer(config.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CLIENT_SECRET_TTL_SECONDS)
    .setAudience(APPLE_ISSUER)
    .setSubject(clientId)
    .sign(key);
}

async function postToApple(
  url: string,
  form: URLSearchParams,
): Promise<{ok: boolean; payload: unknown; status: number}> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: form.toString(),
  });
  return {
    ok: response.ok,
    payload: await response.json().catch(() => null),
    status: response.status,
  };
}

function appleError(payload: unknown, status: number): Error {
  const code = asString(asRecord(payload)?.error) ?? String(status);
  return new Error(`Apple token endpoint rejected request (${code})`);
}

export async function exchangeAppleAuthorizationCode(
  config: AppleClientSecretConfig,
  clientId: string,
  code: string,
  redirectUri?: string,
): Promise<string | undefined> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: await createAppleClientSecret(config, clientId),
    code,
    grant_type: 'authorization_code',
  });
  if (redirectUri !== undefined) form.set('redirect_uri', redirectUri);
  const result = await postToApple(APPLE_TOKEN_URL, form);
  if (!result.ok) throw appleError(result.payload, result.status);
  return asString(asRecord(result.payload)?.refresh_token);
}

export async function revokeAppleRefreshToken(
  config: AppleClientSecretConfig,
  clientId: string,
  refreshToken: string,
): Promise<void> {
  const result = await postToApple(
    APPLE_REVOKE_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: await createAppleClientSecret(config, clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  );
  if (!result.ok) throw appleError(result.payload, result.status);
}
