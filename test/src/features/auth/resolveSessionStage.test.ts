import {resolveSessionStage} from '../../../../src/features/auth/sessionStage';

const baseUser = {suspended: false, purgeAfter: null as number | null};

describe('resolveSessionStage', () => {
  test('holds loading until app lock store is ready when unlocked', () => {
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'done',
        appLock: {ready: false, enabled: false, locked: false},
      }),
    ).toBe('loading');
  });

  test('enters locked immediately when lock is enabled and locked', () => {
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'done',
        appLock: {ready: false, enabled: true, locked: true},
      }),
    ).toBe('locked');
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'done',
        appLock: {ready: true, enabled: true, locked: true},
      }),
    ).toBe('locked');
  });

  test('reaches ready only after lock store settles unlocked', () => {
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'done',
        appLock: {ready: true, enabled: true, locked: false},
      }),
    ).toBe('ready');
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'done',
        appLock: {ready: true, enabled: false, locked: false},
      }),
    ).toBe('ready');
  });

  test('does not treat lock ahead of auth or onboarding gates', () => {
    expect(
      resolveSessionStage({
        isLoading: true,
        isAuthenticated: false,
        user: undefined,
        onboardingStep: null,
        appLock: {ready: true, enabled: true, locked: true},
      }),
    ).toBe('loading');
    expect(
      resolveSessionStage({
        isLoading: false,
        isAuthenticated: true,
        user: baseUser,
        onboardingStep: 'ledger',
        appLock: {ready: true, enabled: true, locked: true},
      }),
    ).toBe('onboarding');
  });
});
