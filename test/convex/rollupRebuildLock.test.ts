import {canCreateEntry} from '../../src/features/ledger/permissions';

/**
 * A rollup rebuild accumulates one month's totals across several COMMITTED
 * transactions — `rollups/internal.ts` carries the running state in
 * `job.argsJson` between pages — and then replaces the month row with that
 * snapshot. A member write landing on an already-scanned page is invisible to
 * the remaining pages, so the trigger's correction is overwritten and the
 * dashboard disagrees with the entries permanently.
 *
 * OCC cannot catch it: the scanned documents are not in the last page's read
 * set. `TIMEZONE_REBUCKET` and `CURRENCY_REBASE` walk the same rows and both
 * take `maintenanceLock`; the rebuild did not, so `queueRollupRebuild` — which
 * the migration runs against live ledgers — left the ledger writable.
 */

describe('a ledger with a rollup rebuild in flight', () => {
  it('refuses writes, like the other jobs that walk every row', () => {
    expect(
      canCreateEntry({
        role: 'OWNER',
        archivedAt: null,
        itemWritePolicy: 'ANY_MEMBER',
        maintenanceLock: 'ROLLUP',
      }),
    ).toBe(false);
  });

  it('accepts writes again once no job holds the lock', () => {
    expect(
      canCreateEntry({
        role: 'OWNER',
        archivedAt: null,
        itemWritePolicy: 'ANY_MEMBER',
        maintenanceLock: 'NONE',
      }),
    ).toBe(true);
  });
});

describe('the maintenance jobs', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../../convex/migrate/rollups.ts'),
    'utf8',
  ) as string;
  const release = require('fs').readFileSync(
    require('path').join(__dirname, '../../convex/rollups/internal.ts'),
    'utf8',
  ) as string;

  it('take the lock before scheduling a rebuild', () => {
    expect(source).toContain("maintenanceLock: 'ROLLUP'");
    // Never stomp a lock another job is holding.
    expect(source).toContain("ledger.maintenanceLock === 'NONE'");
  });

  it('release only the lock the finishing job holds', () => {
    // Clearing unconditionally would drop a DELETING lock set by a purge
    // cascade while the job ran.
    expect(release).toContain("ledger.maintenanceLock === held");
    expect(release).not.toContain(
      "job.kind === 'TIMEZONE_REBUCKET' || job.kind === 'CURRENCY_REBASE'\n        ? 'NONE'",
    );
  });
});

describe('the maintenance lock union', () => {
  it('is mirrored exactly by the hand-written client type', () => {
    // `src/features/ledger/permissions.ts` restates the union by hand, so the
    // server can otherwise start sending a value the client type denies.
    const read = (path: string): string =>
      require('fs').readFileSync(require('path').join(__dirname, path), 'utf8');
    const between = (source: string, start: string, end: string): string => {
      const from = source.indexOf(start) + start.length;
      return source.slice(from, source.indexOf(end, from));
    };

    const client = between(
      read('../../src/features/ledger/permissions.ts'),
      'readonly maintenanceLock:',
      ';',
    );
    const server = between(
      read('../../convex/schema/ledgers.ts'),
      'ledgerMaintenanceLockValidator = v.union(',
      ');',
    );

    const names = (source: string, pattern: RegExp): string[] =>
      [...source.matchAll(pattern)].map((match) => match[1]).sort();

    expect(names(client, /'([A-Z_]+)'/g)).toEqual(
      names(server, /v\.literal\('([A-Z_]+)'\)/g),
    );
  });
});
