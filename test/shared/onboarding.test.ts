import {
  canRedeemLedgerInvite,
  LEGACY_CLAIM_STATES,
  nextOnboardingStep,
  ONBOARDING_STEPS,
} from '@shared/onboarding';

describe('nextOnboardingStep', () => {
  test('is exhaustive over every stored fact combination', () => {
    for (const hasHandle of [false, true]) {
      for (const profileStepDone of [false, true]) {
        for (const ledgerStepDone of [false, true]) {
          for (const legacyClaimState of LEGACY_CLAIM_STATES) {
            const result = nextOnboardingStep({
              hasHandle,
              profileStepDone,
              ledgerStepDone,
              legacyClaimState,
            });
            if (!hasHandle) expect(result).toBe('handle');
            else if (!profileStepDone) expect(result).toBe('profile');
            else if (legacyClaimState === 'ambiguous')
              expect(result).toBe('legacy');
            else if (!ledgerStepDone) expect(result).toBe('ledger');
            else expect(result).toBe('done');
          }
        }
      }
    }
  });

  test('puts an ambiguous legacy claim before ledger creation', () => {
    expect(
      nextOnboardingStep({
        hasHandle: true,
        profileStepDone: true,
        ledgerStepDone: false,
        legacyClaimState: 'ambiguous',
      }),
    ).toBe('legacy');
  });
});

describe('canRedeemLedgerInvite', () => {
  test('allows a first-ledger invite only after profile setup', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(canRedeemLedgerInvite(step, true)).toBe(
        step === 'ledger' || step === 'done',
      );
    }
  });

  test('always requires a stable handle', () => {
    for (const step of ONBOARDING_STEPS)
      expect(canRedeemLedgerInvite(step, false)).toBe(false);
  });
});
