import {useEffect, useMemo} from 'react';
import {useConvexAuth} from '@convex-dev/auth/react';

import type {OnboardingStep} from '@shared/onboarding';
import {useAppLock} from '~/features/lock/provider';
import {useCurrentUser} from './currentUser';
import {useSessionSignOut} from './signOut';
import {
  resolveSessionStage,
  resolvedOnboardingStep,
  type SessionStage,
} from './sessionStage';

export type {SessionStage} from './sessionStage';
export {
  resolveSessionStage,
  resolvedOnboardingStep,
  sessionChromeUsesAppearance,
  sessionUsesAppearanceTheme,
  signedOutPathUsesAppearance,
} from './sessionStage';

const e2eSessionStage = (): Extract<
  SessionStage,
  'loading' | 'locked' | 'pending-deletion' | 'suspended'
> | null => {
  if (!__DEV__) return null;
  const stage = process.env.EXPO_PUBLIC_E2E_SESSION_STAGE;
  if (
    stage === 'loading' ||
    stage === 'locked' ||
    stage === 'pending-deletion' ||
    stage === 'suspended'
  )
    return stage;
  return null;
};

const e2eOnboardingStep = (): Extract<
  OnboardingStep,
  'handle' | 'profile'
> | null => {
  if (!__DEV__) return null;
  const step = process.env.EXPO_PUBLIC_E2E_ONBOARDING_STEP;
  return step === 'handle' || step === 'profile' ? step : null;
};

export function useSession() {
  const {isLoading, isAuthenticated} = useConvexAuth();
  const {signOut} = useSessionSignOut();
  const appLock = useAppLock();
  const user = useCurrentUser();
  const actualOnboardingStep = resolvedOnboardingStep(user ?? null);
  const injectedOnboardingStep = e2eOnboardingStep();
  const onboardingStep =
    user === undefined || user === null
      ? actualOnboardingStep
      : injectedOnboardingStep ?? actualOnboardingStep;

  const resolvedStage = resolveSessionStage({
    isLoading,
    isAuthenticated,
    user,
    onboardingStep,
    appLock,
  });
  const injectedStage = e2eSessionStage();
  const stage: SessionStage =
    injectedStage !== null && resolvedStage === 'ready'
      ? injectedStage
      : resolvedStage;

  useEffect(() => {
    if (stage !== 'profile-missing') return;
    const timer = setTimeout(() => {
      void signOut();
    }, 2500);
    return () => clearTimeout(timer);
  }, [signOut, stage]);

  return useMemo(
    () => ({
      stage,
      isAuthenticated,
      user: user ?? null,
      onboardingStep,
      appLock,
    }),
    [appLock, isAuthenticated, onboardingStep, stage, user],
  );
}
