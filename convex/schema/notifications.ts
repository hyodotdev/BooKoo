import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {softDelete, timestamps} from './common';
import {localeValidator, platformValidator} from './userProfiles';

/**
 * NOTE WHAT IS NOT IN THIS UNION: there is no ITEM_CREATED / ITEM_UPDATED / ITEM_DELETED row.
 *
 * The legacy app pushed on every item add/update but kept no inbox at all. Writing an inbox row per
 * member per item would be up to 7 document inserts on the hottest write path and ~700,000
 * notification rows for one 100k-item ledger — the single worst write amplification available in
 * this schema. So:
 *   - the PUSH still fires through the bounded/coalesced workflow in `notifications-push.md`;
 *   - the IN-APP signal is the O(1) timestamp comparison of §4.3, at zero extra writes.
 * Rows are written only for LOW-FREQUENCY, PERSONALLY-ADDRESSED events, all O(1) per event.
 */
export const notificationKindValidator = v.union(
  v.literal('LEDGER_INVITE'),
  v.literal('JOIN_REQUESTED'),
  v.literal('JOIN_APPROVED'),
  v.literal('JOIN_REJECTED'),
  v.literal('MEMBER_JOINED'),
  v.literal('MEMBER_LEFT'),
  v.literal('MEMBER_REMOVED'),
  v.literal('ROLE_CHANGED'),
  v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('LEDGER_ARCHIVED'),
  v.literal('COMMENT_ADDED'),
  v.literal('LEGACY_CLAIMED'),
  v.literal('ANNOUNCEMENT'),
  v.literal('SYSTEM'),
);

export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,

  /** i18n KEY + params, never a rendered sentence. The inbox must re-render when the user changes
   *  language, and the push body must be rendered in the RECIPIENT's locale, not the sender's —
   *  which is exactly what FightingHows structurally cannot do (`09` §11.2). */
  titleKey: v.string(),
  bodyKey: v.string(),
  /** `*Minor` values are integers and require a sibling `currency` ISO code. */
  params: v.record(v.string(), v.union(v.string(), v.number())),
  /** English rendering, so an unknown key on an old client still shows something. */
  fallbackTitle: v.string(),
  fallbackBody: v.string(),

  /** expo-router deep link, e.g. `/ledger/<id>/item/<id>`. Legacy taps did NOTHING. */
  route: v.optional(v.string()),
  ledgerId: v.optional(v.id('ledgers')),
  itemId: v.optional(v.id('ledgerItems')),
  actorUserId: v.optional(v.id('users')),

  readAt: v.optional(v.number()),
  ...timestamps,
  ...softDelete,
})
  // Inbox list, desc, paginated 20. deletedAt inside the index, so hidden rows are skipped BY it.
  .index('by_userId_deletedAt_createdAt', ['userId', 'deletedAt', 'createdAt'])
  // Unread badge: triple-eq, `.take(UNREAD_COUNT_LIMIT = 50)`, rendered "50+". `deletedAt` sits
  // BEFORE `readAt` so an inbox full of read rows is skipped by the index rather than walked and
  // discarded by a post-filter (`09` §3.1).
  .index('by_userId_deletedAt_readAt', ['userId', 'deletedAt', 'readAt'])
  // Ledger-delete cascade.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt']);

/**
 * Upsert keyed on the TOKEN STRING, not the user: Expo rotates a device's token and a device can be
 * handed to another account, so an existing row is RE-POINTED rather than duplicated (`09` §10.2).
 * HARD delete on sign-out — a retired token must stop matching `by_token`.
 *
 * Legacy `users/{uid}/push_tokens` is NOT migrated: those tokens were minted by an Expo SDK 36
 * module that no longer exists, every install is being replaced by a new build with a new bundle id
 * (`DECISIONS.md` §7), and importing them would seed the table with dead tokens the first send would
 * have to garbage-collect. The `%2E` key encoding (`02` §5) therefore never has to be decoded.
 */
export const pushTokensTable = defineTable({
  userId: v.id('users'),
  token: v.string(), // ExponentPushToken[...]
  platform: platformValidator,
  deviceName: v.optional(v.string()),
  /** Recipient locale at registration, cached so the send action localizes without a profile read
   *  per token. Legacy localized the push in the SENDER's language. */
  locale: localeValidator,
  appVersion: v.optional(v.string()),
  /** Expo returned DeviceNotRegistered — stop sending, keep the row for diagnostics. */
  disabledAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  // Push fan-out/registration guard: `.eq(userId).eq(disabledAt, undefined).take(9)`; at most 8 live.
  .index('by_userId_disabledAt', ['userId', 'disabledAt'])
  // Register / deregister / DeviceNotRegistered receipt handling.
  .index('by_token', ['token']);
