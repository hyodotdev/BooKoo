import {normalizeInviteCode} from '@shared/inviteCode';

const HOST = process.env.EXPO_PUBLIC_APP_DOMAIN ?? 'bookoo.hyo.dev';
const INVITE = /^\/invite\/([0-9A-Za-z-]{20,40})$/;
const HANDLE = /^\/@([a-z0-9_.]{3,20})$/;
const ENTRY = /^\/e\/([a-z0-9]{20,40})$/;

export function rewriteIncomingSystemPath(path: string): string | null {
  try {
    const url = new URL(path, 'bookoo://host');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (url.hostname === 'apple-callback' || pathname === '/apple-callback')
      return '/apple-callback';
  } catch {
    const trimmed = (path.split('#')[0] ?? path)
      .split('?')[0]
      ?.replace(/\/+$/, '');
    if (
      trimmed === '/apple-callback' ||
      trimmed === 'bookoo://apple-callback' ||
      trimmed?.endsWith('://apple-callback') === true
    )
      return '/apple-callback';
  }
  return null;
}

export function redirectSystemPath({path}: {readonly path: string; readonly initial: boolean}): string {
  const rewritten = rewriteIncomingSystemPath(path);
  if (rewritten !== null) return rewritten;
  try {
    const url = new URL(path, `https://${HOST}`);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== HOST)
      return path;
    const invite = url.pathname.match(INVITE)?.[1];
    if (invite !== undefined) {
      const normalized = normalizeInviteCode(invite);
      if (normalized !== null) return `/invite/${normalized}`;
    }
    const handle = url.pathname.match(HANDLE)?.[1];
    if (handle !== undefined) return `/u/${handle}`;
    const entry = url.pathname.match(ENTRY)?.[1];
    if (entry !== undefined) return `/entry/${entry}`;
  } catch {
    return path;
  }
  return path;
}
