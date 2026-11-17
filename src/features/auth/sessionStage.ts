import type {OnboardingStep} from '@shared/onboarding';

export type SessionStage =
  | 'loading'
  | 'signed-out'
  | 'profile-missing'
  | 'suspended'
  | 'pending-deletion'
  | 'onboarding'
  | 'locked'
  | 'ready';

/** Light/dark appearance is a signed-in setting. Tutorial and the intro dock stay brand navy. */
export function sessionUsesAppearanceTheme(stage: SessionStage): boolean {
  return (
    stage === 'ready' ||
    stage === 'onboarding' ||
    stage === 'locked' ||
    stage === 'suspended' ||
    stage === 'pending-deletion'
  );
}

/** Email OTP login uses appearance; the navy intro/tutorial does not. */
export function signedOutPathUsesAppearance(pathname: string): boolean {
  return pathname === '/sign-in-email' || pathname === '/sign-in-code';
}

export function sessionChromeUsesAppearance(
  stage: SessionStage,
  pathname: string,
): boolean {
  return (
    sessionUsesAppearanceTheme(stage) ||
    (stage === 'signed-out' && signedOutPathUsesAppearance(pathname))
  );
}

export function resolvedOnboardingStep(
  user: {
    readonly displayName: string;
    readonly handle: string | null;
    readonly onboardingStep: OnboardingStep;
  } | null,
): OnboardingStep | null {
  if (user === null) return null;
  if (user.handle === null) return 'handle';
  if (user.displayName.trim().length === 0) return 'profile';
  return user.onboardingStep;
}

export function resolveSessionStage(input: {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly user:
    | undefined
    | null
    | {
        readonly suspended: boolean;
        readonly purgeAfter: number | null;
      };
  readonly onboardingStep: OnboardingStep | null;
  readonly appLock: {
    readonly ready: boolean;
    readonly enabled: boolean;
    readonly locked: boolean;
  };
}): SessionStage {
  if (input.isLoading) return 'loading';
  if (!input.isAuthenticated) return 'signed-out';
  if (input.user === undefined) return 'loading';
  if (input.user === null) return 'profile-missing';
  if (input.user.suspended) return 'suspended';
  if (input.user.purgeAfter !== null) return 'pending-deletion';
  if (input.onboardingStep !== 'done') return 'onboarding';
  // Prefer an optimistic lock gate (MMKV flag while SecureStore loads) over
  // falling through to `ready`, which previously skipped the unlock screen.
  if (input.appLock.enabled && input.appLock.locked) return 'locked';
  if (!input.appLock.ready) return 'loading';
  return 'ready';
}
