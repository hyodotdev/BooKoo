import type {ReactElement} from 'react';
import {useEffect, useRef} from 'react';
import {usePathname, useRouter, type Href} from 'expo-router';

import type {OnboardingStep} from '@shared/onboarding';
import {useSession} from '~/features/auth/session';
import type {SessionStage} from '~/features/auth/session';
import {
  clearJoinedInviteContinuation,
  clearPendingInvite,
  readJoinedInviteContinuation,
  readPendingInvite,
} from './pendingInvite';

export const joinedInviteDestination = (ledgerId: string): Href => ({
  pathname: '/ledger/[ledgerId]',
  params: {ledgerId, joined: '1'},
});

export function shouldResumePendingInvite(
  stage: SessionStage,
  onboardingStep: OnboardingStep | null,
  pathname: string,
): boolean {
  if (pathname.startsWith('/invite/')) return false;
  return (
    stage === 'ready' || (stage === 'onboarding' && onboardingStep === 'ledger')
  );
}

const STALE_APP_SHELL_ONBOARDING_PATHS = [
  '/handle',
  '/ledger',
  '/ledger-new',
  '/profile',
] as const;

export function shouldLeaveCompletedOnboardingPath(
  stage: SessionStage,
  pathname: string,
): boolean {
  if (pathname === '/legacy-claim') return stage === 'ready';
  if (
    (STALE_APP_SHELL_ONBOARDING_PATHS as readonly string[]).includes(pathname)
  ) {
    // First-ledger now lives on the live app shell. Leaving these paths only
    // after `ready` stranded the session on an unmounted /ledger screen.
    return stage === 'ready' || stage === 'onboarding';
  }
  return false;
}

export function PendingInviteResume(): ReactElement | null {
  const pathname = usePathname();
  const router = useRouter();
  const {onboardingStep, stage, user} = useSession();
  const userId = user === null ? null : String(user.userId);
  const handledKey = useRef<string | null>(null);
  const supersededKey = useRef<string | null>(null);

  useEffect(() => {
    if (stage === 'signed-out') {
      handledKey.current = null;
      supersededKey.current = null;
    }
    const leaveCompletedOnboardingPath = shouldLeaveCompletedOnboardingPath(
      stage,
      pathname,
    );
    // Recover the old onboarding screen immediately. If this restarts the
    // effect, the joined continuation is still available on the next screen.
    if (leaveCompletedOnboardingPath) router.replace('/');
    let cancelled = false;
    void (async () => {
      if (stage === 'ready' && userId !== null) {
        const joined = await readJoinedInviteContinuation(userId).catch(
          () => null,
        );
        if (cancelled) return;
        if (joined !== null) {
          const key = `joined:${userId}:${joined.code}`;
          if (handledKey.current === key) return;
          handledKey.current = key;
          supersededKey.current = `${userId}:${joined.pendingCode}`;
          // Route before cleanup so the onboarding remount and keychain
          // latency cannot consume the destination without opening it.
          router.replace(
            joined.ledgerId === null
              ? '/'
              : joinedInviteDestination(joined.ledgerId),
          );
          void Promise.allSettled([
            clearPendingInvite(joined.pendingCode),
            clearJoinedInviteContinuation(),
          ]);
          return;
        }
      }
      if (!shouldResumePendingInvite(stage, onboardingStep, pathname)) return;
      const code = await readPendingInvite();
      if (cancelled || code === null) return;
      const key = `${userId ?? 'unknown'}:${code}`;
      // Cleanup may still be in flight. Ignore only the saved signup link
      // this join superseded, so a later invite can still be resumed.
      if (handledKey.current === key || supersededKey.current === key) return;
      handledKey.current = key;
      router.replace({pathname: '/invite/[code]', params: {code}});
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [onboardingStep, pathname, router, stage, userId]);

  return null;
}
