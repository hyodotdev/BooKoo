import type {Doc, Id, TableNames} from '../../convex/_generated/dataModel';
import {toItemRow, toPublicMember} from '../../convex/lib/serializers';

const id = <TableName extends TableNames>(value: string): Id<TableName> =>
  value as Id<TableName>;

describe('Convex public serializers', () => {
  it('projects an item through the explicit non-legacy allowlist', () => {
    const item: Doc<'ledgerItems'> = {
      _id: id<'ledgerItems'>('item-1'),
      _creationTime: 1,
      ledgerId: id<'ledgers'>('ledger-1'),
      type: 'EXPENSE',
      amountMinor: 12_000,
      currency: 'KRW',
      baseCurrency: 'KRW',
      baseAmountMinor: 12_000,
      occurredAt: 1_787_500_800_000,
      dayKey: 20260824,
      monthKey: 202608,
      occurredOffsetMinutes: 540,
      categoryKey: 'meal',
      authorId: id<'users'>('user-1'),
      memo: '점심',
      photoCount: 0,
      commentCount: 0,
      clientRequestId: 'd9428888-122b-4c26-8f3c-03c7a2e54a08',
      clientRequestHash: 'private-receipt-hash',
      legacyKey: 'private-legacy-key',
      legacyRaw: 'private-legacy-json',
      legacyChecksum: 'private-checksum',
      createdAt: 1,
      updatedAt: 2,
    };

    const row = toItemRow(item);
    expect(Object.keys(row)).toEqual([
      'id',
      'ledgerId',
      'type',
      'amountMinor',
      'currency',
      'baseCurrency',
      'baseAmountMinor',
      'occurredAt',
      'dayKey',
      'monthKey',
      'occurredOffsetMinutes',
      'categoryKey',
      'authorId',
      'paidByUserId',
      'memo',
      'place',
      'photoCount',
      'coverPhotoId',
      'commentCount',
      'updatedByUserId',
      'needsReview',
      'deletedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(JSON.stringify(row)).not.toContain('private-');
    expect(Object.keys(row).some((key) => key.startsWith('legacy'))).toBe(
      false,
    );
  });

  it('keeps private profile and member-state fields out of the roster', () => {
    const userId = id<'users'>('user-1');
    const profile: Doc<'userProfiles'> = {
      _id: id<'userProfiles'>('profile-1'),
      _creationTime: 1,
      userId,
      handle: 'hyo',
      handleKey: 'hyo',
      displayName: 'Hyo',
      bio: 'private bio',
      phone: 'private phone',
      locale: 'ko',
      appearance: 'SYSTEM',
      preferredCurrency: 'KRW',
      preferredTimeZone: 'Asia/Seoul',
      preferredWeekStartsOn: 0,
      pushEnabled: true,
      notifyLedgerActivity: true,
      notifyComments: true,
      notifyInvites: true,
      appRole: 'USER',
      onboardingStep: 'done',
      legacyClaimState: 'none',
      isPlaceholder: false,
      avatarMigrationState: 'NATIVE',
      avatarAttempts: 0,
      legacyRaw: 'private legacy profile',
      createdAt: 1,
      updatedAt: 1,
    };
    const membership: Doc<'ledgerMembers'> = {
      _id: id<'ledgerMembers'>('member-1'),
      _creationTime: 1,
      ledgerId: id<'ledgers'>('ledger-1'),
      userId,
      role: 'MEMBER',
      joinedAt: 1,
      joinedVia: 'CREATED',
      createdAt: 1,
      updatedAt: 1,
    };

    const row = toPublicMember(profile, membership, false);
    expect(row).toEqual({
      userId,
      handle: 'hyo',
      displayName: 'Hyo',
      avatarThumbUrl: null,
      role: 'MEMBER',
      isPlaceholder: false,
      blockedRelationship: false,
      joinedAt: 1,
    });
    expect(JSON.stringify(row)).not.toContain('private');
    expect(row).not.toHaveProperty('nickname');
  });
});
