export type LedgerRole = 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER';

export const LEDGER_ROLE_RANK: Readonly<Record<LedgerRole, number>> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const hasLedgerRole = (role: LedgerRole, minimum: LedgerRole): boolean =>
  LEDGER_ROLE_RANK[role] >= LEDGER_ROLE_RANK[minimum];

export const canActOnRole = (actor: LedgerRole, target: LedgerRole): boolean =>
  LEDGER_ROLE_RANK[actor] > LEDGER_ROLE_RANK[target];

export const canGrantRole = (actor: LedgerRole, granted: LedgerRole): boolean =>
  LEDGER_ROLE_RANK[granted] < LEDGER_ROLE_RANK[actor];

export const canEditLedgerItem = (
  role: LedgerRole,
  authorId: string,
  currentUserId: string | undefined,
): boolean =>
  hasLedgerRole(role, 'ADMIN') ||
  (hasLedgerRole(role, 'MEMBER') && authorId === currentUserId);
