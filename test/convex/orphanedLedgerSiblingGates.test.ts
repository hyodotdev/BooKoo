import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * PR #43 added the `orphanedAt` half to `requireLedgerRole`, but
 * `requireItemMember`, `requireCommentMember` and `requirePhotoMember` do not
 * call it — each re-implements the ledger lookup inline, and each kept the old
 * `deletedAt`-only condition.
 *
 * Nothing reachable exploited that: orphaning leaves no live membership and
 * `invites.redeem` refuses an orphan, so the item-level helpers had no
 * membership row to pass. The gap was a redeem-landing-during-handoff race and,
 * more to the point, four copies of one condition drifting apart — the same
 * shape as the avatar-ownership defect in #47, whose own commit message said
 * the drift was the defect.
 */

const source = readFileSync(
  join(__dirname, '../../convex/lib/ledgerPermissions.ts'),
  'utf8',
);

/** The file minus its comments — the prose here quotes the very conditions. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the ledger reachability gate', () => {
  it('is written once', () => {
    expect(code.match(/const ledgerIsReachable =/g)).toHaveLength(1);
    expect(code).toContain('ledger.deletedAt === undefined');
    expect(code).toContain('ledger.orphanedAt === undefined');
  });

  it('is the only ledger gate any permission helper uses', () => {
    // An inline copy is how the three siblings fell behind in the first place.
    expect(code).not.toMatch(/ledger\.deletedAt !== undefined/);
    expect(code).not.toMatch(/ledger === null \|\| ledger\.deletedAt/);
  });

  it('guards every helper that resolves a ledger from a child row', () => {
    // requireLedgerRole, requireItemMember, requireCommentMember,
    // requirePhotoMember.
    expect(code.match(/!ledgerIsReachable\(ledger\)/g)).toHaveLength(4);
  });

  it.each(['requireItemMember', 'requireCommentMember', 'requirePhotoMember'])(
    '%s refuses an orphaned ledger',
    (helper) => {
      const start = code.indexOf(helper);
      expect(start).toBeGreaterThan(-1);
      const body = code.slice(start, start + 900);

      expect(body).toContain('!ledgerIsReachable(ledger)');
    },
  );
});

describe('every other gate that resolves a ledger before serving its data', () => {
  const read = (path: string): string =>
    readFileSync(join(__dirname, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it.each([
    ['receipt bytes', '../../convex/photos/internal.ts'],
    ['the unseen badge', '../../convex/ledgers/queries.ts'],
    ['the item push fan-out', '../../convex/lib/pushPermissions.ts'],
    ['the data-export worker', '../../convex/exports/internal.ts'],
    ['entry route resolution', '../../convex/items/queries.ts'],
    ['the invite listings and preview', '../../convex/invites/queries.ts'],
    ['invite redeem', '../../convex/invites/mutations.ts'],
  ])('%s shares the one predicate', (_label, path) => {
    const code = read(path);

    expect(code).toContain('ledgerIsReachable(ledger)');
    // An inline `ledger.deletedAt` test is the drift this closes.
    expect(code).not.toMatch(/ledger\.deletedAt !== undefined/);
  });
});

describe('the whole convex tree', () => {
  it('has no inline ledger-liveness gate left outside the predicate', () => {
    const {execSync} = require('child_process');
    const hits = execSync(
      "grep -rn 'ledger\\.deletedAt [!=]== undefined' convex/ || true",
      {cwd: join(__dirname, '../..'), encoding: 'utf8'},
    ) as string;

    const offenders = hits
      .split('\n')
      .filter((line) => line.trim().length > 0)
      // The predicate itself, and `requireDeletedLedgerOwner`, which requires
      // the inverse — a ledger that IS deleted — on purpose.
      // The predicate itself, and `requireDeletedLedgerOwner`, which requires
      // the inverse — a ledger that IS deleted — on purpose.
      .filter((line) => !line.startsWith('convex/lib/ledgerPermissions.ts:'))
      // Two paths must still see an orphaned ledger, because reaching it is
      // the whole point: account deletion has to finish orphaning and
      // bookkeeping it, and cancelling a deletion has to un-orphan the
      // ledgers the owner is coming back to. Named rather than pattern-matched
      // so a new exception cannot slip in unnoticed.
      .filter(
        (line) =>
          !line.startsWith('convex/user/deletion.ts:') &&
          !line.startsWith('convex/user/mutations.ts:'),
      )
      // The ledger purge requires the inverse — a ledger that IS deleted and
      // past its restore window — before it destroys anything.
      .filter((line) => !line.startsWith('convex/maintenance/purge.ts:'));

    expect(offenders).toEqual([]);
  });

  it('gates the export worker on every page, not just the header', () => {
    const code = readFileSync(
      join(__dirname, '../../convex/exports/internal.ts'),
      'utf8',
    );
    // `sourcePage` used to check membership only, so a ledger orphaned
    // mid-export kept streaming.
    const page = code.slice(code.indexOf('sourcePage'));

    expect(page).toContain("ctx.db.get('ledgers', args.ledgerId)");
    expect(page).toContain('!ledgerIsReachable(ledger)');
  });
});
