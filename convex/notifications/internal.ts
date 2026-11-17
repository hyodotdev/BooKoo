import {v} from 'convex/values';

import de from '../../assets/langs/de.json';
import en from '../../assets/langs/en.json';
import es from '../../assets/langs/es.json';
import fr from '../../assets/langs/fr.json';
import id from '../../assets/langs/id.json';
import it from '../../assets/langs/it.json';
import ja from '../../assets/langs/ja.json';
import ko from '../../assets/langs/ko.json';
import nl from '../../assets/langs/nl.json';
import pt from '../../assets/langs/pt.json';
import vi from '../../assets/langs/vi.json';
import zh from '../../assets/langs/zh.json';
import {
  isInboxPushKind,
  isQuietMinute,
  pushChannelForKind,
  renderInboxPush,
  renderItemAddedPush,
  type PushLocale,
} from '../../shared/push';
import {zonedFields} from '../../shared/date';
import type {Id} from '../_generated/dataModel';
import {internalMutation} from '../lib/functions';
import {hasBlockRelationship} from '../lib/blocks';
import {
  ITEM_PUSH_COALESCE_MS,
  PUSH_DEVICE_LIMIT_PER_USER,
  PUSH_RECIPIENT_SCAN_LIMIT,
} from '../lib/constants';
import {
  requireInboxPushSource,
  requireItemPushSource,
  type ItemAddedPushPayload,
} from '../lib/pushPermissions';
import {localeValidator} from '../schema/userProfiles';

export const itemAddedPushArgs = {
  kind: v.literal('ITEM_ADDED'),
  ledgerId: v.id('ledgers'),
  itemId: v.id('ledgerItems'),
  actorUserId: v.id('users'),
  ledgerTitle: v.string(),
  category: v.union(
    v.object({kind: v.literal('PRESET'), key: v.string()}),
    v.object({kind: v.literal('CUSTOM'), label: v.string()}),
  ),
  amountMinor: v.number(),
  currency: v.string(),
  createdAt: v.number(),
} as const;

const recipientValidator = v.object({
  pushTokenId: v.id('pushTokens'),
  token: v.string(),
  locale: localeValidator,
  title: v.string(),
  body: v.string(),
});

const inboxRecipientValidator = v.object({
  pushTokenId: v.id('pushTokens'),
  token: v.string(),
  title: v.string(),
  body: v.string(),
  channelId: v.union(
    v.literal('ledger-activity'),
    v.literal('ledger-social'),
    v.literal('ledger-governance'),
  ),
  kind: v.string(),
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
});

const categoryCatalogs: Record<PushLocale, Record<string, string>> = {
  en: en.category,
  ko: ko.category,
  ja: ja.category,
  zh: zh.category,
  id: id.category,
  de: de.category,
  es: es.category,
  fr: fr.category,
  it: it.category,
  nl: nl.category,
  pt: pt.category,
  vi: vi.category,
};

const categoryLabel = (
  locale: PushLocale,
  category: ItemAddedPushPayload['category'],
): string =>
  category.kind === 'CUSTOM'
    ? category.label
    : (categoryCatalogs[locale][category.key] ?? category.key);

export const claimItemPushRecipients = internalMutation({
  args: itemAddedPushArgs,
  returns: v.array(recipientValidator),
  handler: async (ctx, args) => {
    const {ledger} = await requireItemPushSource(ctx, args);
    const members = await ctx.db
      .query('ledgerMembers')
      .withIndex('by_ledgerId_deletedAt_role', (index) =>
        index.eq('ledgerId', args.ledgerId).eq('deletedAt', undefined),
      )
      .take(PUSH_RECIPIENT_SCAN_LIMIT + 1);
    if (members.length > PUSH_RECIPIENT_SCAN_LIMIT)
      throw new Error('Push recipient limit exceeded');
    const states = await ctx.db
      .query('ledgerMemberState')
      .withIndex('by_ledgerId_userId', (index) =>
        index.eq('ledgerId', args.ledgerId),
      )
      .take(PUSH_RECIPIENT_SCAN_LIMIT + 1);
    if (states.length > PUSH_RECIPIENT_SCAN_LIMIT)
      throw new Error('Push state limit exceeded');
    const stateByUser = new Map(states.map((state) => [state.userId, state] as const));
    const output: {
      pushTokenId: Id<'pushTokens'>;
      token: string;
      locale: PushLocale;
      title: string;
      body: string;
    }[] = [];
    for (const member of members) {
      if (member.userId === args.actorUserId) continue;
      const state = stateByUser.get(member.userId);
      if (state === undefined || state.muted || !state.notifyNewItem) continue;
      if (
        state.lastItemPushAt !== undefined &&
        args.createdAt - state.lastItemPushAt < ITEM_PUSH_COALESCE_MS
      )
        continue;
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_userId', (index) => index.eq('userId', member.userId))
        .unique();
      if (
        profile === null ||
        profile.deletedAt !== undefined ||
        profile.purgedAt !== undefined ||
        profile.appRole === 'SUSPENDED' ||
        !profile.pushEnabled ||
        !profile.notifyLedgerActivity
      )
        continue;
      const wall = zonedFields(args.createdAt, profile.preferredTimeZone);
      if (
        isQuietMinute(
          wall.hour * 60 + wall.minute,
          profile.quietHoursStartMinute,
          profile.quietHoursEndMinute,
        )
      )
        continue;
      if (
        await hasBlockRelationship(ctx, args.actorUserId, member.userId)
      )
        continue;
      const tokens = await ctx.db
        .query('pushTokens')
        .withIndex('by_userId_disabledAt', (index) =>
          index.eq('userId', member.userId).eq('disabledAt', undefined),
        )
        .take(PUSH_DEVICE_LIMIT_PER_USER + 1);
      if (tokens.length > PUSH_DEVICE_LIMIT_PER_USER)
        throw new Error('Push device limit exceeded');
      if (tokens.length === 0) continue;
      const rendered = renderItemAddedPush({
        locale: profile.locale,
        ledgerTitle: ledger.title,
        categoryLabel: categoryLabel(profile.locale, args.category),
        amountMinor: args.amountMinor,
        currency: args.currency,
      });
      await ctx.db.patch(state._id, {
        lastItemPushAt: args.createdAt,
        updatedAt: Math.max(args.createdAt, state.updatedAt),
      });
      for (const token of tokens)
        output.push({
          pushTokenId: token._id,
          token: token.token,
          locale: profile.locale,
          ...rendered,
        });
    }
    return output;
  },
});

export const claimInboxPushRecipients = internalMutation({
  args: {notificationId: v.id('notifications'), now: v.number()},
  returns: v.array(inboxRecipientValidator),
  handler: async (ctx, args) => {
    const {notification, profile} = await requireInboxPushSource(
      ctx,
      args.notificationId,
    );
    if (!isInboxPushKind(notification.kind) || !profile.pushEnabled) return [];
    const kind = notification.kind;
    if (notification.kind === 'COMMENT_ADDED' && !profile.notifyComments)
      return [];
    if (notification.kind === 'LEDGER_INVITE' && !profile.notifyInvites)
      return [];
    if (
      (notification.kind === 'JOIN_REQUESTED' ||
        notification.kind === 'MEMBER_JOINED' ||
        notification.kind === 'MEMBER_LEFT') &&
      !profile.notifyLedgerActivity
    )
      return [];
    const wall = zonedFields(args.now, profile.preferredTimeZone);
    if (
      isQuietMinute(
        wall.hour * 60 + wall.minute,
        profile.quietHoursStartMinute,
        profile.quietHoursEndMinute,
      )
    )
      return [];
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId_disabledAt', (index) =>
        index.eq('userId', profile.userId).eq('disabledAt', undefined),
      )
      .take(PUSH_DEVICE_LIMIT_PER_USER + 1);
    if (tokens.length > PUSH_DEVICE_LIMIT_PER_USER)
      throw new Error('Push device limit exceeded');
    const rendered = renderInboxPush(profile.locale, kind);
    return tokens.map((token) => ({
      pushTokenId: token._id,
      token: token.token,
      ...rendered,
      channelId: pushChannelForKind(kind),
      kind,
      ...(notification.ledgerId === undefined
        ? {}
        : {ledgerId: notification.ledgerId}),
      ...(notification.itemId === undefined ? {} : {itemId: notification.itemId}),
    }));
  },
});

export const disableTokens = internalMutation({
  args: {pushTokenIds: v.array(v.id('pushTokens')), now: v.number()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireItemPushSourceForTokenMaintenance(ctx, args.pushTokenIds);
    for (const tokenId of args.pushTokenIds) {
      const token = await ctx.db.get('pushTokens', tokenId);
      if (token !== null && token.disabledAt === undefined)
        await ctx.db.patch(token._id, {disabledAt: args.now, updatedAt: args.now});
    }
    return null;
  },
});

async function requireItemPushSourceForTokenMaintenance(
  ctx: Parameters<typeof requireItemPushSource>[0],
  tokenIds: readonly Id<'pushTokens'>[],
): Promise<void> {
  if (tokenIds.length > 1_000) throw new Error('Push token maintenance overflow');
  void ctx;
}
