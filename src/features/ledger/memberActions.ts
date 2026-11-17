import {canActOnRole, type LedgerRole} from '@shared/ledgerRoles';

export type MemberManagementAction =
  | 'TRANSFER_OWNERSHIP'
  | 'ASSIGN_ADMIN'
  | 'REMOVE_ADMIN'
  | 'MAKE_MEMBER'
  | 'MAKE_VIEWER'
  | 'REMOVE_MEMBER';

export interface MemberActionPlan {
  readonly leading: readonly MemberManagementAction[];
  readonly trailing: readonly MemberManagementAction[];
}

/**
 * The server remains authoritative; this only decides which affordances the
 * client may reveal. A self row and any equal/higher role stay inert.
 */
export function memberActionPlan(
  actorRole: LedgerRole,
  targetRole: LedgerRole,
  isSelf: boolean,
): MemberActionPlan {
  if (
    (actorRole !== 'OWNER' && actorRole !== 'ADMIN') ||
    isSelf ||
    !canActOnRole(actorRole, targetRole)
  )
    return {leading: [], trailing: []};

  const leading: MemberManagementAction[] = [];
  if (actorRole === 'OWNER') {
    if (targetRole !== 'VIEWER') leading.push('TRANSFER_OWNERSHIP');
    leading.push(targetRole === 'ADMIN' ? 'REMOVE_ADMIN' : 'ASSIGN_ADMIN');
  } else if (actorRole === 'ADMIN') {
    if (targetRole === 'MEMBER') leading.push('MAKE_VIEWER');
    if (targetRole === 'VIEWER') leading.push('MAKE_MEMBER');
  }

  return {leading, trailing: ['REMOVE_MEMBER']};
}
