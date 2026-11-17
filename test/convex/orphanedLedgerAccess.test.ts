import {encodeInviteCode, hashInviteCode} from '../../shared/inviteCode';
import {requireLedgerMember} from '../../convex/lib/ledgerPermissions';
import {preview} from '../../convex/invites/queries';
import {handOffLedgers} from '../../convex/user/deletion';

/**
 * A ledger is orphaned (`user/deletion.ts` → `handOffLedgers`) only when the
 * account being deleted was its last live member — the handoff loop reaches
 * that branch precisely when `remaining` is empty. So an orphaned ledger has
 * nobody entitled to it, and any membership row on one was minted afterwards,
 * by redeeming an invite that outlived its owner.
 *
 * `ledgers/queries.ts` and `items/queries.ts` already skip orphans, which is
 * why the ledger never appears in a switcher. That is a listing filter, not an
 * authorization check: before this suite, the invite gate and
 * `requireLedgerRole` both looked at `deletedAt` and `archivedAt` only, so the
 * redeemer got a real membership row and read the deleted owner's entries by
 * ledger id.
 */

jest.mock('../../convex/lib/functions', () => ({
  internalMutation: (definition: {handler: unknown}) => ({
    _handler: definition.handler,
  }),
}));
jest.mock('../../convex/lib/deletionPermissions', () => ({
  requireDeletingProfile: jest.fn().mockResolvedValue({userId: 'owner'}),
  getDueDeletingProfile: jest.fn(),
}));
jest.mock('../../convex/lib/permissions', () => ({
  requireOnboarded: jest.fn().mockResolvedValue({userId: 'joiner'}),
  getCurrentProfile: jest.fn().mockResolvedValue({userId: 'joiner'}),
}));

const PEPPER = 'test-pepper';
const CODE = encodeInviteCode(new Uint8Array(16).fill(7));

function handler(fn: unknown): (ctx: unknown, args: unknown) => Promise<unknown> {
  if (fn === null || (typeof fn !== 'function' && typeof fn !== 'object'))
    throw new Error('Missing convex function');
  const registered: unknown = Reflect.get(fn, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}

const ORPHANED = {
  _id: 'ledger',
  title: 'Deleted owner household',
  ownerId: 'gone',
  memberCount: 0,
  orphanedAt: 1_700_000_000_000,
};

describe('a ledger whose last member deleted their account', () => {
  it('is not readable through a membership row minted from a stale invite', async () => {
    const ctx = {
      db: {
        get: jest.fn().mockResolvedValue(ORPHANED),
        query: jest.fn(() => ({
          withIndex: () => ({
            // The attacker really is a member: redeeming wrote this row.
            unique: async () => ({
              ledgerId: 'ledger',
              userId: 'joiner',
              role: 'MEMBER' as const,
            }),
          }),
        })),
      },
    };

    await expect(
      requireLedgerMember(
        ctx as unknown as Parameters<typeof requireLedgerMember>[0],
        'ledger' as Parameters<typeof requireLedgerMember>[1],
      ),
    ).rejects.toMatchObject({data: {code: 'LEDGER_NOT_FOUND'}});
  });

  it('reports its surviving invites as unavailable rather than joinable', async () => {
    process.env.INVITE_TOKEN_PEPPER = PEPPER;
    const ctx = {
      db: {
        get: jest.fn().mockResolvedValue(ORPHANED),
        query: jest.fn(() => ({
          withIndex: (
            _name: string,
            build: (index: {eq: (f: string, v: unknown) => unknown}) => unknown,
          ) => {
            build({
              eq: (field, value) => {
                // The invite is found by its hash: it was never revoked.
                if (field === 'codeHash')
                  expect(value).toBe(hashInviteCode(CODE, PEPPER));
                return {};
              },
            });
            return {
              unique: async () => ({
                _id: 'invite',
                ledgerId: 'ledger',
                role: 'MEMBER' as const,
                useCount: 0,
              }),
            };
          },
        })),
      },
    };

    await expect(
      handler(preview)(ctx, {code: CODE, now: Date.now()}),
    ).resolves.toEqual({status: 'LEDGER_UNAVAILABLE'});
  });
});

describe('orphaning a ledger', () => {
  it('revokes the invites that would otherwise outlive every member', async () => {
    const patched: {id: string; fields: Record<string, unknown>}[] = [];
    const invites = [
      {_id: 'invite-a', ledgerId: 'ledger'},
      {_id: 'invite-b', ledgerId: 'ledger'},
    ];

    const ctx = {
      db: {
        get: jest.fn().mockResolvedValue({userId: 'owner', deletedAt: 1}),
        patch: jest.fn(async (id: string, fields: Record<string, unknown>) => {
          patched.push({id, fields});
        }),
        insert: jest.fn(),
        query: jest.fn((table: string) => ({
          withIndex: () => ({
            // The owner is the only member, so the handoff finds no successor.
            take: async () =>
              table === 'ledgerMembers'
                ? [{_id: 'member', userId: 'owner', joinedAt: 1}]
                : invites,
            paginate: async () => ({
              page: [{_id: 'ledger', ownerId: 'owner'}],
              isDone: true,
              continueCursor: '',
            }),
          }),
        })),
      },
      scheduler: {runAfter: jest.fn()},
    };

    await handler(handOffLedgers)(ctx, {userId: 'owner', phase: 'OWNED'});

    expect(patched.map((row) => row.id)).toEqual(
      expect.arrayContaining(['invite-a', 'invite-b']),
    );
    for (const id of ['invite-a', 'invite-b'])
      expect(
        patched.find((row) => row.id === id)?.fields.revokedAt,
      ).toEqual(expect.any(Number));
    expect(
      patched.find((row) => row.id === 'ledger')?.fields.orphanedAt,
    ).toEqual(expect.any(Number));
  });
});
