import {previewReceived, receivedPaginated} from '../../convex/invites/queries';
import {declineReceived, redeemReceived} from '../../convex/invites/mutations';
import {inviteUsePatch} from '../../convex/invites/availability';
import type {Id} from '../../convex/_generated/dataModel';

jest.mock('../../convex/lib/functions', () => {
  const {mutationGeneric} =
    jest.requireActual<typeof import('convex/server')>('convex/server');
  return {mutation: mutationGeneric};
});
jest.mock('../../convex/lib/permissions', () => ({
  requireOnboarded: jest.fn().mockResolvedValue({userId: 'recipient'}),
}));
jest.mock('../../convex/lib/rateLimits', () => ({
  enforceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

function call(
  registered: unknown,
  ctx: unknown,
  args: unknown,
): Promise<unknown> {
  if (typeof registered !== 'function') throw new Error('Missing function');
  const handler: unknown = Reflect.get(registered, '_handler');
  if (typeof handler !== 'function') throw new Error('Missing handler');
  return handler(ctx, args);
}

describe('received invites', () => {
  it('retires a consumed direct invite from the active expiry index', () => {
    const recipient = 'recipient' as Id<'users'>;
    expect(
      inviteUsePatch({inviteeUserId: recipient, maxUses: 1, useCount: 0}, 100),
    ).toEqual({useCount: 1, lastUsedAt: 100, updatedAt: 100, expiresAt: 100});
    expect(inviteUsePatch({maxUses: 1, useCount: 0}, 100)).toEqual({
      useCount: 1,
      lastUsedAt: 100,
      updatedAt: 100,
    });
  });

  it.each([
    ['wrong account', 'someone-else'],
    ['share link', undefined],
  ])(
    'hides invite details and denies redemption by ID for a %s',
    async (_label, inviteeUserId) => {
      const db = {
        normalizeId: jest.fn().mockReturnValue('invite'),
        get: jest.fn().mockResolvedValue({inviteeUserId}),
        query: jest.fn(),
        patch: jest.fn(),
      };
      await expect(
        call(previewReceived, {db}, {inviteId: 'invite', now: 10}),
      ).resolves.toEqual({status: 'INVALID'});
      await expect(
        call(redeemReceived, {db}, {inviteId: 'invite'}),
      ).resolves.toEqual({status: 'INVALID'});
      await expect(
        call(declineReceived, {db}, {inviteId: 'invite'}),
      ).rejects.toMatchObject({data: {code: 'NOT_FOUND'}});
      expect(db.get).toHaveBeenCalledTimes(3);
      expect(db.query).not.toHaveBeenCalled();
      expect(db.patch).not.toHaveBeenCalled();
    },
  );

  it('retires a declined invitation and preserves its distinct recipient status', async () => {
    const invite = {
      _id: 'invite',
      ledgerId: 'ledger',
      inviteeUserId: 'recipient',
      useCount: 0,
    };
    const index = {eq: jest.fn().mockImplementation(() => index)};
    const withIndex = jest.fn(
      (_name: string, select: (value: typeof index) => void) => {
        select(index);
        return {unique: async () => null};
      },
    );
    const db = {
      normalizeId: jest.fn().mockReturnValue('invite'),
      get: jest.fn().mockResolvedValue(invite),
      query: jest.fn().mockReturnValue({withIndex}),
      patch: jest
        .fn()
        .mockImplementation(async (_id, patch) => Object.assign(invite, patch)),
    };
    await expect(
      call(declineReceived, {db}, {inviteId: 'invite'}),
    ).resolves.toBeNull();
    expect(db.patch).toHaveBeenCalledWith('invite', {
      declinedAt: expect.any(Number),
      revokedAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(db.query).toHaveBeenCalledWith('ledgerMembers');
    expect(index.eq.mock.calls).toEqual([
      ['ledgerId', 'ledger'],
      ['userId', 'recipient'],
    ]);
    await expect(
      call(declineReceived, {db}, {inviteId: 'invite'}),
    ).resolves.toBeNull();
    expect(db.patch).toHaveBeenCalledTimes(1);
    await expect(
      call(previewReceived, {db}, {inviteId: 'invite', now: 10}),
    ).resolves.toEqual({
      status: 'DECLINED',
    });
    await expect(
      call(redeemReceived, {db}, {inviteId: 'invite'}),
    ).resolves.toEqual({status: 'REVOKED'});
  });

  it.each([
    ['active member', {role: 'MEMBER'}, null],
    [
      'pending approval',
      null,
      {status: 'PENDING', expiresAt: Number.MAX_SAFE_INTEGER},
    ],
  ])(
    'rejects a stale decline after the invite has an %s',
    async (_label, member, request) => {
      const db = {
        normalizeId: jest.fn().mockReturnValue('invite'),
        get: jest.fn().mockResolvedValue({
          _id: 'invite',
          ledgerId: 'ledger',
          inviteeUserId: 'recipient',
          requiresApproval: true,
          useCount: 0,
        }),
        query: jest.fn((table) => ({
          withIndex: () => ({
            unique: async () => (table === 'ledgerMembers' ? member : request),
          }),
        })),
        patch: jest.fn(),
      };
      await expect(
        call(declineReceived, {db}, {inviteId: 'invite'}),
      ).rejects.toMatchObject({data: {code: 'INVALID_INPUT'}});
      expect(db.patch).not.toHaveBeenCalled();
    },
  );

  it('handles a malformed detail route without attempting a document read', async () => {
    const db = {
      normalizeId: jest.fn().mockReturnValue(null),
      get: jest.fn(),
    };
    await expect(
      call(previewReceived, {db}, {inviteId: 'bad', now: 10}),
    ).resolves.toEqual({status: 'INVALID'});
    expect(db.get).not.toHaveBeenCalled();
  });

  it('keeps the continuation when a bounded page has no actionable invites', async () => {
    const cursor = {
      page: [
        {_id: 'expired', expiresAt: 1, useCount: 0},
        {_id: 'used', expiresAt: 100, useCount: 1, maxUses: 1},
      ],
      continueCursor: 'next',
      isDone: false,
    };
    const paginate = jest.fn().mockResolvedValue(cursor);
    const index = {eq: jest.fn().mockImplementation(() => index)};
    const withIndex = jest.fn(
      (_: string, select: (value: typeof index) => void) => {
        select(index);
        return {order: () => ({paginate})};
      },
    );
    const db = {
      query: jest.fn().mockReturnValue({withIndex}),
      get: jest.fn(),
    };
    await expect(
      call(
        receivedPaginated,
        {db},
        {
          now: 10,
          paginationOpts: {numItems: 20, cursor: null},
        },
      ),
    ).resolves.toEqual({...cursor, page: []});
    expect(db.query).toHaveBeenCalledWith('ledgerInvites');
    expect(withIndex).toHaveBeenCalledWith(
      'by_inviteeUserId_revokedAt',
      expect.any(Function),
    );
    expect(index.eq.mock.calls).toEqual([
      ['inviteeUserId', 'recipient'],
      ['revokedAt', undefined],
    ]);
    expect(paginate).toHaveBeenCalledWith({
      numItems: 20,
      cursor: null,
      maximumRowsRead: 100,
    });
    expect(db.get).not.toHaveBeenCalled();
  });
});
