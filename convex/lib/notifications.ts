import {internal} from '../_generated/api';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {MEMBER_SCAN_LIMIT} from './constants';

type LedgerRole = Doc<'ledgerMembers'>['role'];
type NotificationKind = Doc<'notifications'>['kind'];

interface LedgerNotificationInput {
  readonly ledgerId: Id<'ledgers'>;
  readonly kind: NotificationKind;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly fallbackTitle: string;
  readonly fallbackBody: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly route?: string;
  readonly itemId?: Id<'ledgerItems'>;
  readonly actorUserId?: Id<'users'>;
  readonly roles?: readonly LedgerRole[];
  readonly excludeUserIds?: readonly Id<'users'>[];
  readonly now: number;
}

export async function scheduleInboxPush(
  ctx: MutationCtx,
  notificationId: Id<'notifications'>,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.notifications.actions.sendInbox, {
    notificationId,
  });
}

export async function notifyLedgerMembers(
  ctx: MutationCtx,
  input: LedgerNotificationInput,
): Promise<void> {
  const members = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_deletedAt_role', (index) =>
      index.eq('ledgerId', input.ledgerId).eq('deletedAt', undefined),
    )
    .take(MEMBER_SCAN_LIMIT + 1);
  if (members.length > MEMBER_SCAN_LIMIT)
    throw new Error('Notification recipient limit exceeded');
  const excluded = new Set(input.excludeUserIds ?? []);
  for (const member of members) {
    if (
      excluded.has(member.userId) ||
      (input.roles !== undefined && !input.roles.includes(member.role))
    )
      continue;
    const notificationId = await ctx.db.insert('notifications', {
      userId: member.userId,
      kind: input.kind,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      params: {...input.params},
      fallbackTitle: input.fallbackTitle,
      fallbackBody: input.fallbackBody,
      ...(input.route === undefined ? {} : {route: input.route}),
      ledgerId: input.ledgerId,
      ...(input.itemId === undefined ? {} : {itemId: input.itemId}),
      ...(input.actorUserId === undefined
        ? {}
        : {actorUserId: input.actorUserId}),
      createdAt: input.now,
      updatedAt: input.now,
    });
    await scheduleInboxPush(ctx, notificationId);
  }
}
