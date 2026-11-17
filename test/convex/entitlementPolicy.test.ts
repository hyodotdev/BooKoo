import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {
  FREE_MEMBER_LIMIT,
  FREE_SHARED_LEDGER_LIMIT,
  memberCapacityPolicy,
  PRO_MEMBER_LIMIT,
} from '../../convex/lib/entitlements';
import {
  APP_ERROR_MESSAGE_KEYS_BY_CODE,
  isAppErrorPayload,
} from '../../shared/appErrors';
import {PREMIUM_CAPABILITIES} from '../../shared/entitlements';

const read = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

/**
 * These assertions guard the two promises that make the entitlement model what it
 * is, and that a well-meaning refactor could quietly break:
 *
 * 1. accepting an invitation never asks the joiner to pay;
 * 2. reading, exporting or deleting your own data is never gated.
 */
describe('ledger entitlement policy', () => {
  it('never shows the joiner a paywall when redeeming an invite', () => {
    const source = read('convex', 'invites', 'mutations.ts');
    const redeem = source.slice(source.indexOf('export const redeem'));

    // The redemption path reports a ledger state...
    expect(redeem).toContain("status: 'LEDGER_AT_CAPACITY'");
    // ...and must never throw the paywall error at the person joining.
    expect(redeem).not.toContain('requireMemberCapacity');
    expect(redeem).not.toContain('requireLedgerEntitlement');
    expect(redeem).not.toContain('PREMIUM_REQUIRED');
  });

  it('puts the paywall on the path that expands the ledger', () => {
    const source = read('convex', 'invites', 'mutations.ts');
    const create = source.slice(
      source.indexOf('export const create'),
      source.indexOf('export const revoke'),
    );
    expect(create).toContain('requireMemberCapacity');
  });

  it('gates join-request approval, which is also an expansion', () => {
    expect(read('convex', 'joinRequests', 'mutations.ts')).toContain(
      'requireMemberCapacity',
    );
  });

  it('exempts migrated ledgers from the member limit', () => {
    const source = read('convex', 'lib', 'entitlements.ts');
    expect(source).toContain('ledger.legacyKey !== undefined');
    // The exemption must be checked before the entitlement, or a grandfathered
    // ledger without a subscription would still be blocked.
    expect(source.indexOf('isGrandfathered(ledger)')).toBeLessThan(
      source.indexOf('return ledgerHasEntitlement'),
    );
  });

  it('never gates a read path on the subscription', () => {
    // Enforcement is mutation-only by construction: a query cannot call
    // Date.now(), and reads of your own data are never sold.
    const queries = read('convex', 'subscriptions', 'queries.ts');
    expect(queries).not.toContain('requireLedgerEntitlement');
    expect(read('convex', 'lib', 'entitlements.ts')).toContain(
      'ctx: MutationCtx,',
    );
  });

  it('keeps free limits at values that make partner sharing free', () => {
    expect(FREE_MEMBER_LIMIT).toBe(2);
    expect(FREE_SHARED_LEDGER_LIMIT).toBe(1);
    expect(PRO_MEMBER_LIMIT).toBe(5);
  });

  it('enforces the second-ledger gate on the server write path', () => {
    const source = read('convex', 'ledgers', 'mutations.ts');
    const create = source.slice(
      source.indexOf('export const create'),
      source.indexOf('export const update'),
    );
    expect(create).toContain(".query('ledgers')");
    expect(create).toContain(".withIndex('by_ownerId_deletedAt'");
    expect(create).toContain('FREE_SHARED_LEDGER_LIMIT');
    expect(create).toContain('requireUserEntitlement');
    expect(create).toContain("'SECOND_SHARED_LEDGER'");
  });

  it('caps new non-legacy ledgers at five members', () => {
    expect(memberCapacityPolicy(false, 1)).toBe('ALLOW');
    expect(memberCapacityPolicy(false, 2)).toBe('ALLOW');
    expect(memberCapacityPolicy(false, 3)).toBe('REQUIRE_PRO');
    expect(memberCapacityPolicy(false, 5)).toBe('REQUIRE_PRO');
    expect(memberCapacityPolicy(false, 6)).toBe('FULL');
    expect(memberCapacityPolicy(true, 100)).toBe('ALLOW');
  });

  it('carries a distinct message key for every premium capability', () => {
    const keys = APP_ERROR_MESSAGE_KEYS_BY_CODE.PREMIUM_REQUIRED;
    expect(keys).toHaveLength(PREMIUM_CAPABILITIES.length);
    expect(new Set(keys).size).toBe(PREMIUM_CAPABILITIES.length);
  });

  it('produces a payload the client can narrow without a cast', () => {
    expect(
      isAppErrorPayload({
        code: 'PREMIUM_REQUIRED',
        messageKey: 'error.premium.memberLimit',
        params: {capability: 'MEMBER_LIMIT', ledgerId: 'k123'},
      }),
    ).toBe(true);
    // A code cannot borrow another code's key.
    expect(
      isAppErrorPayload({
        code: 'PREMIUM_REQUIRED',
        messageKey: 'error.ledger.memberLimit',
      }),
    ).toBe(false);
  });

  it('localizes every premium message in all shipped locales', () => {
    for (const locale of [
      'ko',
      'en',
      'ja',
      'zh',
      'id',
      'de',
      'es',
      'fr',
      'it',
      'nl',
      'pt',
      'vi',
    ]) {
      const catalog: unknown = JSON.parse(
        read('assets', 'langs', `${locale}.json`),
      );
      const premium = (catalog as {error?: {premium?: Record<string, string>}})
        .error?.premium;
      expect(premium?.memberLimit).toBeDefined();
      expect(premium?.secondLedger).toBeDefined();
    }
  });
});

describe('subscription data retention', () => {
  const source = (): string => read('convex', 'user', 'deletion.ts');

  it('reaches all subscription tables in the purge chain', () => {
    const text = source();
    expect(text).toContain("PHOTOS: 'SUBSCRIPTION_EVENTS'");
    expect(text).toContain("SUBSCRIPTION_EVENTS: 'SUBSCRIPTION_PURCHASES'");
    expect(text).toContain("SUBSCRIPTION_PURCHASES: 'SUBSCRIBERS'");
    expect(text).toContain("SUBSCRIBERS: 'FINALIZE'");
  });

  it('gives each subscription phase exactly one table', () => {
    // The first attempt put both tables in ONE phase. `deleteIndexed` advances
    // as soon as it deletes a partial batch, so the events delete for a user
    // with 1..DELETE_BATCH-1 rows advanced straight to FINALIZE and the
    // `subscribers` row was never deleted — the phase worked for everybody
    // EXCEPT the paying users it was written for.
    //
    // The previous version of this test only grepped for the phase literals, so
    // it passed while the phase did not do its job. Assert the structure that
    // was actually wrong.
    const text = source();
    for (const [phase, table] of [
      ['SUBSCRIPTION_EVENTS', 'subscriptionEvents'],
      ['SUBSCRIPTION_PURCHASES', 'subscriptionPurchases'],
      ['SUBSCRIBERS', 'subscribers'],
    ] as const) {
      const start = text.indexOf(`if (phase === '${phase}')`);
      expect(start).toBeGreaterThan(-1);
      const block = text.slice(start, start + 500);
      const body = block.slice(
        0,
        block.indexOf('if (phase ===', 10) + 1 || 500,
      );
      const other =
        table === 'subscribers' ? 'subscriptionEvents' : 'subscribers';
      expect(body).toContain(`'${table}'`);
      expect(body).not.toContain(`'${other}'`);
    }
  });

  it('does not leave a phase unreachable', () => {
    const text = source();
    for (const phase of [
      'SUBSCRIPTION_EVENTS',
      'SUBSCRIPTION_PURCHASES',
      'SUBSCRIBERS',
    ])
      expect(text).toContain(`v.literal('${phase}')`);
  });
});
