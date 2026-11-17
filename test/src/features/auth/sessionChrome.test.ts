import {
  sessionChromeUsesAppearance,
  resolvedOnboardingStep,
  sessionUsesAppearanceTheme,
  signedOutPathUsesAppearance,
  type SessionStage,
} from '../../../../src/features/auth/sessionStage';

describe('session appearance chrome', () => {
  it('keeps tutorial and sign-in on the brand canvas', () => {
    const signedOut: SessionStage[] = [
      'loading',
      'signed-out',
      'profile-missing',
    ];
    for (const stage of signedOut) {
      expect(sessionUsesAppearanceTheme(stage)).toBe(false);
    }
  });

  it('applies light/dark only after sign-in', () => {
    const signedIn: SessionStage[] = [
      'onboarding',
      'locked',
      'ready',
      'suspended',
      'pending-deletion',
    ];
    for (const stage of signedIn) {
      expect(sessionUsesAppearanceTheme(stage)).toBe(true);
    }
  });

  it('applies light/dark to email OTP while the intro stays navy', () => {
    expect(signedOutPathUsesAppearance('/')).toBe(false);
    expect(signedOutPathUsesAppearance('/sign-in')).toBe(false);
    expect(signedOutPathUsesAppearance('/sign-in-email')).toBe(true);
    expect(signedOutPathUsesAppearance('/sign-in-code')).toBe(true);
    expect(sessionChromeUsesAppearance('signed-out', '/')).toBe(false);
    expect(sessionChromeUsesAppearance('signed-out', '/sign-in-email')).toBe(
      true,
    );
    expect(sessionChromeUsesAppearance('signed-out', '/apple-callback')).toBe(
      false,
    );
    expect(sessionChromeUsesAppearance('ready', '/')).toBe(true);
  });

  it('forces missing IDs through handle setup and repairs blank names', () => {
    expect(
      resolvedOnboardingStep({
        displayName: 'Mint',
        handle: null,
        onboardingStep: 'done',
      }),
    ).toBe('handle');
    expect(
      resolvedOnboardingStep({
        displayName: '   ',
        handle: 'mint_24',
        onboardingStep: 'done',
      }),
    ).toBe('profile');
    expect(
      resolvedOnboardingStep({
        displayName: 'Mint',
        handle: 'mint_24',
        onboardingStep: 'done',
      }),
    ).toBe('done');
  });
});
