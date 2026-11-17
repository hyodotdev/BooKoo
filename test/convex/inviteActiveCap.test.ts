import {ACTIVE_INVITES_PER_LEDGER} from '../../convex/lib/constants';

/**
 * The cap counted unexpired rows among the OLDEST 21 unrevoked invites —
 * `by_ledgerId_revokedAt_createdAt` ascends and there was no `.order('desc')`.
 * That fails in both directions:
 *
 * - Every invite `create` mints carries an `expiresAt` (7 days by default, 90
 *   at most), so on a ledger that has been sharing a while the oldest rows are
 *   expired. The count came out near zero and the cap never bit, however many
 *   live links existed.
 * - Legacy invites never expire and are the oldest rows on a migrated ledger,
 *   so the same window filled with them and the cap jammed shut.
 *
 * Liveness splits on `expiresAt`, and Convex sorts `undefined` below every
 * number, so one `gt(now)` range would silently drop the never-expiring rows.
 * Two bounded reads against `by_ledgerId_revokedAt_expiresAt` are the count.
 */

const source = require('fs').readFileSync(
  require('path').join(__dirname, '../../convex/invites/mutations.ts'),
  'utf8',
) as string;

const createBody = source.slice(
  source.indexOf('export const create'),
  source.indexOf("ctx.db.insert('ledgerInvites'"),
);

describe('the active-invite cap', () => {
  it('counts liveness through the expiry index, not the age index', () => {
    // Matched as a real `withIndex` call: the comment above the fix names the
    // old index to explain why it was wrong.
    const used = [...createBody.matchAll(/withIndex\(\s*'([a-zA-Z_]+)'/g)].map(
      (match) => match[1],
    );
    // `by_codeHash` is also read here — it is the mint-time uniqueness gate.
    expect(
      used.filter((name) => name === 'by_ledgerId_revokedAt_expiresAt'),
    ).toHaveLength(2);
    expect(used).not.toContain('by_ledgerId_revokedAt_createdAt');
  });

  it('reads the never-expiring rows and the in-date rows separately', () => {
    // A single `gt('expiresAt', now)` drops every legacy invite, because
    // `undefined` sorts below every number.
    expect(createBody).toContain("eq('expiresAt', undefined)");
    expect(createBody).toContain("gt('expiresAt', now)");
  });

  it('stays bounded — the cap is a sentinel read, never a scan', () => {
    expect(createBody).not.toContain('.collect()');
    expect(createBody).toContain('ACTIVE_INVITES_PER_LEDGER + 1');
    // The second read only asks for the remainder, so the pair can never
    // return more than the sentinel.
    expect(createBody).toContain('ACTIVE_INVITES_PER_LEDGER + 1 - live.length');
  });

  it('refuses at the cap, not above it', () => {
    expect(createBody).toContain(
      'unexpired.length >= ACTIVE_INVITES_PER_LEDGER',
    );
    expect(ACTIVE_INVITES_PER_LEDGER).toBe(20);
  });
});

describe('the expiry index', () => {
  it('is registered in the frozen schema inventory', () => {
    const schema = require('fs').readFileSync(
      require('path').join(__dirname, '../../convex/schema/ledgerInvites.ts'),
      'utf8',
    ) as string;
    expect(schema).toContain(
      "index('by_ledgerId_revokedAt_expiresAt', ['ledgerId', 'revokedAt', 'expiresAt'])",
    );
  });
});
