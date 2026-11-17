import {
  canEditLedgerItem,
  hasLedgerRole,
  type LedgerRole,
} from '@shared/ledgerRoles';

interface LedgerEntryPermission {
  readonly archivedAt: number | null;
  readonly maintenanceLock:
    | 'NONE'
    | 'CURRENCY'
    | 'TIMEZONE'
    | 'ROLLUP'
    | 'DELETING';
  readonly itemWritePolicy: 'ANY_MEMBER' | 'AUTHOR_ONLY';
  readonly role: LedgerRole;
}

const isWritableLedger = (ledger: LedgerEntryPermission): boolean =>
  ledger.archivedAt === null &&
  ledger.maintenanceLock === 'NONE' &&
  hasLedgerRole(ledger.role, 'MEMBER');

export const canCreateEntry = (ledger: LedgerEntryPermission): boolean =>
  isWritableLedger(ledger);

export const canEditEntry = (
  ledger: LedgerEntryPermission,
  item: {readonly authorId: string},
  userId: string | undefined,
): boolean =>
  isWritableLedger(ledger) &&
  canEditLedgerItem(ledger.role, item.authorId, userId);
