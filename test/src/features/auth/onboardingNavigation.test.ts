import {ONBOARDING_STEPS} from '@shared/onboarding';
import {
  onboardingRouteFor,
  sessionRendersSignedInShell,
  sessionShowsAppShell,
  shouldFinishLedgerOnboarding,
  usesAppShellIdentityDialog,
  usesDedicatedOnboardingStack,
} from '../../../../src/features/auth/onboardingNavigation';

describe('onboardingRouteFor', () => {
  test('maps dedicated onboarding steps to routes and identity steps to the app shell', () => {
    expect(ONBOARDING_STEPS.map(onboardingRouteFor)).toEqual([
      null,
      null,
      '/legacy-claim',
      null,
      null,
    ]);
  });

  test('keeps the signed-in app shell after the handle, including first-ledger', () => {
    expect(usesAppShellIdentityDialog('handle')).toBe(true);
    expect(usesAppShellIdentityDialog('profile')).toBe(false);
    expect(usesAppShellIdentityDialog('ledger')).toBe(false);
    expect(usesDedicatedOnboardingStack('handle')).toBe(false);
    expect(usesDedicatedOnboardingStack('ledger')).toBe(false);
    expect(usesDedicatedOnboardingStack('legacy')).toBe(true);
    expect(sessionShowsAppShell('onboarding', 'handle')).toBe(true);
    expect(sessionShowsAppShell('onboarding', 'profile')).toBe(true);
    expect(sessionShowsAppShell('onboarding', 'ledger')).toBe(true);
    expect(sessionShowsAppShell('onboarding', 'legacy')).toBe(false);
    expect(sessionShowsAppShell('ready', 'done')).toBe(true);
    expect(sessionShowsAppShell('signed-out', null)).toBe(false);
    expect(shouldFinishLedgerOnboarding('ledger')).toBe(true);
    expect(shouldFinishLedgerOnboarding('done')).toBe(false);
  });

  test('keeps the signed-in shell while the profile query settles', () => {
    expect(sessionRendersSignedInShell('loading', null, true)).toBe(true);
    expect(sessionRendersSignedInShell('loading', null, false)).toBe(false);
    expect(sessionRendersSignedInShell('onboarding', 'handle', true)).toBe(
      true,
    );
    expect(sessionRendersSignedInShell('onboarding', 'ledger', true)).toBe(
      true,
    );
  });
});
