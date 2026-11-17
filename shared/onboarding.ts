export const ONBOARDING_STEPS = [
  'handle',
  'profile',
  'legacy',
  'ledger',
  'done',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const LEGACY_CLAIM_STATES = [
  'none',
  'pending',
  'claimed',
  'ambiguous',
  'skipped',
] as const;

export type LegacyClaimState = (typeof LEGACY_CLAIM_STATES)[number];

export interface OnboardingFacts {
  readonly hasHandle: boolean;
  readonly profileStepDone: boolean;
  readonly ledgerStepDone: boolean;
  readonly legacyClaimState: LegacyClaimState;
}

/** The single source of truth for the server-owned onboarding order. */
export function nextOnboardingStep(facts: OnboardingFacts): OnboardingStep {
  if (!facts.hasHandle) return 'handle';
  if (!facts.profileStepDone) return 'profile';
  if (facts.legacyClaimState === 'ambiguous') return 'legacy';
  if (!facts.ledgerStepDone) return 'ledger';
  return 'done';
}

export function hasCompletedOnboardingStep(
  current: OnboardingStep,
  step: 'profile' | 'ledger',
): boolean {
  return ONBOARDING_STEPS.indexOf(current) > ONBOARDING_STEPS.indexOf(step);
}

/**
 * A profile-complete user may join their first ledger from an invite. Earlier
 * stages have not established the stable handle required by membership rows.
 */
export function canRedeemLedgerInvite(
  current: OnboardingStep,
  hasHandle: boolean,
): boolean {
  return hasHandle && (current === 'ledger' || current === 'done');
}
