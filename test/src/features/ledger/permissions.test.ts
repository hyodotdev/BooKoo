import {
  canCreateEntry,
  canEditEntry,
} from '../../../../src/features/ledger/permissions';

const writableLedger = {
  archivedAt: null,
  maintenanceLock: 'NONE',
  itemWritePolicy: 'AUTHOR_ONLY',
  role: 'MEMBER',
} as const;

describe('entry permissions', () => {
  it('allows members to create only in an active writable ledger', () => {
    expect(canCreateEntry(writableLedger)).toBe(true);
    expect(canCreateEntry({...writableLedger, role: 'VIEWER'})).toBe(false);
    expect(canCreateEntry({...writableLedger, archivedAt: 1})).toBe(false);
    expect(
      canCreateEntry({...writableLedger, maintenanceLock: 'TIMEZONE'}),
    ).toBe(false);
  });

  it('allows edits only for the author or an administrator', () => {
    const item = {authorId: 'author'};
    expect(canEditEntry(writableLedger, item, 'author')).toBe(true);
    expect(canEditEntry(writableLedger, item, 'other')).toBe(false);
    expect(
      canEditEntry({...writableLedger, role: 'ADMIN'}, item, 'other'),
    ).toBe(true);
    expect(
      canEditEntry(
        {...writableLedger, itemWritePolicy: 'ANY_MEMBER'},
        item,
        'other',
      ),
    ).toBe(false);
  });
});
