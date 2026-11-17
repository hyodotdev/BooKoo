import type {OnboardingStep} from '@shared/onboarding';
import type {SessionStage} from './sessionStage';

export type OnboardingRoute = '/legacy-claim';

export function usesAppShellIdentityDialog(
  step: OnboardingStep | null,
): boolean {
  return step === 'handle';
}

export function onboardingRouteFor(
  step: OnboardingStep,
): OnboardingRoute | null {
  switch (step) {
    case 'handle':
    case 'profile':
    case 'ledger':
    case 'done':
      return null;
    case 'legacy':
      return '/legacy-claim';
  }
}

/** Ambiguous legacy-claim is the only remaining dedicated onboarding stack. */
export function usesDedicatedOnboardingStack(
  step: OnboardingStep | null,
): boolean {
  return step !== null && onboardingRouteFor(step) !== null;
}

export function sessionShowsAppShell(
  stage: SessionStage,
  onboardingStep: OnboardingStep | null,
): boolean {
  if (stage === 'ready') return true;
  return (
    stage === 'onboarding' && !usesDedicatedOnboardingStack(onboardingStep)
  );
}

/** Keep the signed-in shell mounted while the profile query settles after login. */
export function sessionRendersSignedInShell(
  stage: SessionStage,
  onboardingStep: OnboardingStep | null,
  isAuthenticated: boolean,
): boolean {
  if (sessionShowsAppShell(stage, onboardingStep)) return true;
  return isAuthenticated && stage === 'loading';
}

/** Creating the first ledger from the live app shell finishes onboarding. */
export function shouldFinishLedgerOnboarding(
  step: OnboardingStep | null,
): boolean {
  return step === 'ledger';
}
