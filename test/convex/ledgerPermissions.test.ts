import {
  canActOnRole,
  canEditLedgerItem,
  canGrantRole,
  hasLedgerRole,
  LEDGER_ROLE_RANK,
} from '../../shared/ledgerRoles';

describe('ledger permission matrix', () => {
  it('keeps the frozen role rank total and monotone', () => {
    expect(LEDGER_ROLE_RANK).toEqual({
      VIEWER: 0,
      MEMBER: 1,
      ADMIN: 2,
      OWNER: 3,
    });
    expect(hasLedgerRole('OWNER', 'VIEWER')).toBe(true);
    expect(hasLedgerRole('ADMIN', 'MEMBER')).toBe(true);
    expect(hasLedgerRole('MEMBER', 'ADMIN')).toBe(false);
    expect(hasLedgerRole('VIEWER', 'MEMBER')).toBe(false);
  });

  it('lets managers act only on strictly lower roles', () => {
    expect(canActOnRole('OWNER', 'ADMIN')).toBe(true);
    expect(canActOnRole('ADMIN', 'MEMBER')).toBe(true);
    expect(canActOnRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canActOnRole('MEMBER', 'ADMIN')).toBe(false);
  });

  it('lets an actor grant only a strictly lower role', () => {
    expect(canGrantRole('OWNER', 'ADMIN')).toBe(true);
    expect(canGrantRole('ADMIN', 'MEMBER')).toBe(true);
    expect(canGrantRole('ADMIN', 'OWNER')).toBe(false);
    expect(canGrantRole('MEMBER', 'MEMBER')).toBe(false);
  });

  it('keeps item editing with its author or an administrator', () => {
    expect(canEditLedgerItem('MEMBER', 'author', 'author')).toBe(true);
    expect(canEditLedgerItem('MEMBER', 'author', 'other')).toBe(false);
    expect(canEditLedgerItem('ADMIN', 'author', 'other')).toBe(true);
    expect(canEditLedgerItem('OWNER', 'author', 'other')).toBe(true);
    expect(canEditLedgerItem('VIEWER', 'author', 'author')).toBe(false);
  });
});
