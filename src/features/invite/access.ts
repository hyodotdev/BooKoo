import type {LedgerRole} from '@shared/ledgerRoles';
import {t} from '~/utils/i18n';

export function inviteRoleLabel(role: LedgerRole): string {
  switch (role) {
    case 'ADMIN':
      return t('member.administrator');
    case 'OWNER':
      return t('member.owner');
    case 'VIEWER':
      return t('member.viewer');
    case 'MEMBER':
      return t('common.member');
  }
}

export function inviteAccessDescription(role: LedgerRole): string {
  switch (role) {
    case 'ADMIN':
      return t('member.accessAdministrator');
    case 'OWNER':
      return t('member.accessOwner');
    case 'VIEWER':
      return t('member.accessViewer');
    case 'MEMBER':
      return t('member.accessMember');
  }
}
