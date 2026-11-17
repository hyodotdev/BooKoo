export type PushKind =
  | 'ITEM_ADDED'
  | 'COMMENT_ADDED'
  | 'LEDGER_INVITE'
  | 'JOIN_REQUESTED'
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'OWNERSHIP_TRANSFERRED'
  | 'LEDGER_ARCHIVED'
  | 'LEGACY_CLAIMED'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';

export interface PushRouteData {
  readonly kind: PushKind;
  readonly ledgerId?: string;
  readonly itemId?: string;
}

export function routeForNotification(data: PushRouteData): string | null {
  if (data.kind === 'ITEM_ADDED' || data.kind === 'COMMENT_ADDED')
    return data.itemId === undefined ? null : `/entry/${data.itemId}`;
  if (data.kind === 'LEDGER_INVITE') return '/notifications';
  if (data.kind === 'JOIN_REQUESTED')
    return data.ledgerId === undefined
      ? null
      : `/ledger/${data.ledgerId}/requests`;
  if (
    data.kind === 'MEMBER_JOINED' ||
    data.kind === 'MEMBER_LEFT' ||
    data.kind === 'MEMBER_REMOVED'
  )
    return data.ledgerId === undefined
      ? null
      : `/ledger/${data.ledgerId}/members`;
  if (
    data.kind === 'JOIN_APPROVED' ||
    data.kind === 'ROLE_CHANGED' ||
    data.kind === 'OWNERSHIP_TRANSFERRED'
  )
    return data.ledgerId === undefined ? null : `/ledger/${data.ledgerId}`;
  if (data.kind === 'JOIN_REJECTED') return null;
  if (data.kind === 'LEDGER_ARCHIVED') return '/';
  if (data.kind === 'LEGACY_CLAIMED') return '/settings/account';
  if (data.kind === 'ANNOUNCEMENT') return '/settings/announcements';
  return '/notifications';
}

const KINDS: ReadonlySet<string> = new Set<PushKind>([
  'ITEM_ADDED',
  'COMMENT_ADDED',
  'LEDGER_INVITE',
  'JOIN_REQUESTED',
  'JOIN_APPROVED',
  'JOIN_REJECTED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'ROLE_CHANGED',
  'OWNERSHIP_TRANSFERRED',
  'LEDGER_ARCHIVED',
  'LEGACY_CLAIMED',
  'ANNOUNCEMENT',
  'SYSTEM',
]);

export function parsePushRouteData(value: unknown): PushRouteData | null {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    return null;
  const kind = value.kind;
  if (typeof kind !== 'string' || !KINDS.has(kind)) return null;
  const ledgerId =
    'ledgerId' in value && typeof value.ledgerId === 'string'
      ? value.ledgerId
      : undefined;
  const itemId =
    'itemId' in value && typeof value.itemId === 'string'
      ? value.itemId
      : undefined;
  return {kind: kind as PushKind, ledgerId, itemId};
}

export function shouldPresentForeground(
  data: PushRouteData | null,
  activeLedgerId: string | undefined,
): boolean {
  return !(
    data?.kind === 'ITEM_ADDED' &&
    data.ledgerId !== undefined &&
    data.ledgerId === activeLedgerId
  );
}
