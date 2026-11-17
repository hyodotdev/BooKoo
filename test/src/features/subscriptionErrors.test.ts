import {ConvexError} from 'convex/values';

import {
  canPurchaseForLedger,
  ledgerExpansionMessageFor,
  premiumMessage,
  premiumRefusalOf,
} from '~/features/subscription/errors';

describe('premium refusal bridge', () => {
  const refusal = (capability: string): unknown =>
    new ConvexError({
      code: 'PREMIUM_REQUIRED',
      messageKey: 'error.premium.memberLimit',
      params: {capability, ledgerId: 'ledger_1'},
    });

  it('recognises a paywall refusal and carries the capability', () => {
    const parsed = premiumRefusalOf(refusal('MEMBER_LIMIT'));
    expect(parsed?.capability).toBe('MEMBER_LIMIT');
    expect(parsed?.ledgerId).toBe('ledger_1');
  });

  it('ignores every other error', () => {
    expect(premiumRefusalOf(new Error('network'))).toBeNull();
    expect(premiumRefusalOf(null)).toBeNull();
    expect(
      premiumRefusalOf(
        new ConvexError({
          code: 'LEDGER_FORBIDDEN',
          messageKey: 'error.ledger.forbidden',
        }),
      ),
    ).toBeNull();
  });

  it('refuses a capability the client does not know', () => {
    // A server that starts sending an unknown capability must not open an
    // arbitrary paywall; it degrades to a generic error instead.
    expect(premiumRefusalOf(refusal('SOMETHING_ELSE'))).toBeNull();
  });

  it('refuses a capability and message-key mismatch', () => {
    expect(
      premiumRefusalOf(
        new ConvexError({
          code: 'PREMIUM_REQUIRED',
          messageKey: 'error.premium.secondLedger',
          params: {capability: 'MEMBER_LIMIT'},
        }),
      ),
    ).toBeNull();
  });

  it('localizes through a static key, never the wire value', () => {
    const parsed = premiumRefusalOf(refusal('MEMBER_LIMIT'));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    const message = premiumMessage(parsed);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain('error.premium');
  });

  it('offers a purchase button only to the ledger owner', () => {
    expect(canPurchaseForLedger(true)).toBe(true);
    expect(canPurchaseForLedger(false)).toBe(false);
  });

  it('explains the absolute member cap without opening another paywall', () => {
    const message = ledgerExpansionMessageFor(
      new ConvexError({
        code: 'MEMBER_LIMIT_REACHED',
        messageKey: 'error.ledger.memberLimit',
        params: {limit: 5},
      }),
      true,
    );
    expect(message).toBeTruthy();
    expect(message).not.toContain('error.ledger.memberLimit');
  });
});
