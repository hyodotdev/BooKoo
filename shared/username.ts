import {PROFANITY_KEYS} from './reserved/profanity.generated';

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

const HANDLE_BODY = /^[a-z0-9._]+$/;
const HANDLE_EDGE = /^[a-z0-9]$/;
const CONSECUTIVE_SEPARATORS = /[._]{2}/;

export type HandleRejection =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'BAD_CHARSET'
  | 'BAD_EDGE'
  | 'DOUBLE_SEPARATOR'
  | 'RESERVED';

export const RESERVED_EXACT_HANDLES: ReadonlySet<string> = new Set([
  'about',
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'blog',
  'callback',
  'calendar',
  'category',
  'contact',
  'currency',
  'dev',
  'developer',
  'docs',
  'download',
  'edit',
  'entries',
  'entry',
  'explore',
  'faq',
  'feed',
  'help',
  'home',
  'index',
  'invite',
  'invites',
  'join',
  'ledger',
  'ledgers',
  'legal',
  'lock',
  'login',
  'logout',
  'me',
  'members',
  'new',
  'notice',
  'notification',
  'notifications',
  'oauth',
  'onboarding',
  'password',
  'pricing',
  'privacy',
  'profile',
  'register',
  'report',
  'reset',
  'root',
  'search',
  'security',
  'settings',
  'share',
  'signin',
  'signout',
  'signup',
  'stats',
  'static',
  'status',
  'support',
  'system',
  'terms',
  'user',
  'users',
  'verify',
  'webhook',
  'well-known',
  'www',
  'bookoo',
  'bookooapp',
  'bookoo_official',
  'official',
  'staff',
  'team',
  'mod',
  'moderator',
  'administrator',
  'helpdesk',
  'customer',
  'customerservice',
  'billing',
  'payment',
  'payments',
  'gwanrija',
  'gwanlija',
  'unyeongja',
  'unyeongjin',
  'unyoungja',
  'gogaeksenteo',
  'gogaekcenter',
  'gogaek',
  'gongsik',
  'gongsikgyejeong',
  'gagyebu',
  'jangbu',
  'bugoo',
  'bukoo',
  'kongji',
  'gongji',
  'bank',
  'nh',
  'nonghyup',
  'kb',
  'shinhan',
  'woori',
  'hana',
  'ibk',
  'kbank',
  'kakaobank',
  'kakaopay',
  'toss',
  'tossbank',
  'naverpay',
  'apple',
  'apple-callback',
  'google',
  'kakao',
  'naver',
  'line',
  'instagram',
  'facebook',
  'meta',
  'twitter',
  'u',
  'youtube',
  'null',
  'undefined',
  'true',
  'false',
  'nan',
  'anonymous',
  'deleted',
  'unknown',
  'test',
  'demo',
  'guest',
]);

const RESERVED_PREFIXES = [
  'bookoo',
  'admin',
  'official',
  'support',
  'system',
  'gwanrija',
  'unyeongja',
] as const;

export function normalizeHandle(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function confusableKey(key: string): string {
  return key
    .replace(/[._]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/3/g, 'e');
}

export function isReservedHandle(key: string): boolean {
  if (RESERVED_EXACT_HANDLES.has(key)) return true;
  if (PROFANITY_KEYS.has(confusableKey(key))) return true;
  return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function validateHandle(
  raw: string,
): {ok: true; key: string} | {ok: false; reason: HandleRejection} {
  const key = normalizeHandle(raw);
  if (key.length < HANDLE_MIN_LENGTH) return {ok: false, reason: 'TOO_SHORT'};
  if (key.length > HANDLE_MAX_LENGTH) return {ok: false, reason: 'TOO_LONG'};
  if (!HANDLE_BODY.test(key)) return {ok: false, reason: 'BAD_CHARSET'};
  if (!HANDLE_EDGE.test(key[0]!) || !HANDLE_EDGE.test(key.at(-1)!))
    return {ok: false, reason: 'BAD_EDGE'};
  if (CONSECUTIVE_SEPARATORS.test(key))
    return {ok: false, reason: 'DOUBLE_SEPARATOR'};
  if (isReservedHandle(key)) return {ok: false, reason: 'RESERVED'};
  return {ok: true, key};
}

export function isHandleClaimAvailable(
  claim: {readonly userId: string; readonly releasedAt?: number} | null,
  currentUserId: string,
  now: number,
  cooldownMs: number,
): boolean {
  if (claim === null || claim.userId === currentUserId) return true;
  return claim.releasedAt !== undefined && now - claim.releasedAt >= cooldownMs;
}

function stableSuffix(seed: string, index: number): number {
  let hash = 2_166_136_261;
  for (const char of `${seed}:${index}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return 1000 + ((hash >>> 0) % 9000);
}

/**
 * Produce a deterministic, bounded candidate list. Availability is checked by
 * the server with exact indexed probes; this helper performs no I/O.
 */
export function handleCandidates(
  seed: string,
  limit: number,
  calendarYear: number,
): string[] {
  const normalized = normalizeHandle(seed)
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, HANDLE_MAX_LENGTH - 5);
  const base = normalized.length >= HANDLE_MIN_LENGTH ? normalized : 'user';
  const year = Math.abs(Math.trunc(calendarYear)) % 100;
  const raw = [
    base,
    `${base}${year}`,
    `${base}.${year}`,
    ...Array.from({length: 20}, (_, index) => `${base}${index + 1}`),
    ...Array.from(
      {length: 40},
      (_, index) => `${base}${stableSuffix(base, index)}`,
    ),
  ];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const checked = validateHandle(candidate);
    if (!checked.ok || seen.has(checked.key)) continue;
    seen.add(checked.key);
    output.push(checked.key);
    if (output.length >= limit) break;
  }
  return output;
}
