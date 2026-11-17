import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {normalizeDataset} from '../../scripts/migrate/05-normalize';
import {canonical} from '../../scripts/migrate/lib/hash';
import {pushIdToMillis} from '../../scripts/migrate/lib/keys';
import {parseAmountEvidence, toMoney} from '../../scripts/migrate/lib/money';

const fixture = join(process.cwd(), 'test', 'fixtures', 'migration');
const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixture, name), 'utf8')) as Record<
    string,
    unknown
  >;

describe('migration tooling', () => {
  it('normalizes the synthetic corpus byte-deterministically', () => {
    const input = {
      root: readJson('rtdb.json'),
      authUsers: (readJson('auth-users.safe.json').users ?? []) as Record<
        string,
        unknown
      >[],
      storageManifest: [],
      importedAt: Date.parse('2026-08-25T00:00:00Z'),
      runId: 'synthetic-rehearsal',
    };
    const first = normalizeDataset(input);
    const second = normalizeDataset(input);

    expect(canonical(first)).toBe(canonical(second));
    expect(first.summary).toMatchObject({
      legacyUsers: 5,
      placeholders: 5,
      ledgers: 1,
      ledgerMembers: 2,
      joinRequests: 1,
      items: 2,
      comments: 1,
      photos: 1,
      invites: 1,
      legacyInvites: 2,
      feedback: 1,
      anomalies: 0,
    });
    expect(first.summary.categories).toBe(35);
    expect(
      first.rows.placeholders?.find((row) => row.legacyUid === 'uid-avatar')
        ?.document,
    ).toMatchObject({avatarMigrationState: 'PENDING'});
    expect(
      first.rows.placeholders?.find((row) => row.legacyUid === 'uid-owner')
        ?.document,
    ).toMatchObject({avatarMigrationState: 'NATIVE'});
  });

  it('keeps measured money and push-id transforms stable', () => {
    expect(parseAmountEvidence('HK$ 12.00')).toBe('OTHER');
    expect(parseAmountEvidence('₩12,000')).toBe('KRW');
    expect(toMoney(-12000.5, 0, 'KRW')).toEqual({
      type: 'EXPENSE',
      amountMinor: 12001,
      anomalies: ['LOSSY_AMOUNT_CONVERSION'],
    });
    expect(pushIdToMillis('-L9xQ2fT3kZ8aB1cDeFg')).toBeDefined();
  });

  it('turns an absent avatar object into an auditable terminal state', () => {
    const authUsers = (readJson('auth-users.safe.json').users ?? []) as Record<
      string,
      unknown
    >[];
    authUsers[0] = {
      ...authUsers[0],
      photoUrl: 'https://example.test/missing-avatar',
    };
    const output = normalizeDataset({
      root: readJson('rtdb.json'),
      authUsers,
      storageManifest: [],
      importedAt: Date.parse('2026-08-25T00:00:00Z'),
      runId: 'synthetic-missing-avatar',
    });

    expect(
      output.rows.placeholders?.find((row) => row.legacyUid === 'uid-owner')
        ?.document,
    ).toMatchObject({avatarMigrationState: 'MISSING'});
    expect(
      output.rows.anomalies?.some(
        (row) =>
          (row.document as Record<string, unknown>).kind ===
          'PHOTO_OBJECT_MISSING',
      ),
    ).toBe(true);
  });
});
