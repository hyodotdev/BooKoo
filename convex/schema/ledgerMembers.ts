import {defineTable} from 'convex/server';
import {v, type Infer} from 'convex/values';

import {legacyTrailer, softDelete, timestamps} from './common';

/** sharing-invites.md §1.1. Rank order matters: OWNER > ADMIN > MEMBER > VIEWER. */
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'), // exactly one live row per ledger; == ledgers.ownerId
  v.literal('ADMIN'), // manage people + ledger settings; cannot transfer or delete
  v.literal('MEMBER'), // the legacy "member": read all, write items/comments/photos
  v.literal('VIEWER'), // read only — accountant, parent, "구경만 하는" link
);
export type LedgerRole = Infer<typeof ledgerRoleValidator>;

export const joinSourceValidator = v.union(
  v.literal('CREATED'),
  v.literal('INVITE_LINK'),
  v.literal('INVITE_EMAIL'),
  v.literal('INVITE_HANDLE'),
  v.literal('REQUEST_APPROVED'),
  v.literal('LEGACY_IMPORT'), // the legacy members map carried no provenance
);

export const membershipEndReasonValidator = v.union(
  v.literal('LEFT'),
  v.literal('REMOVED'),
  v.literal('LEDGER_DELETED'),
);

/**
 * THE AUTHORIZATION DOCUMENT. `by_ledgerId_userId` is the single most-called index in the app: the
 * first line of every ledger-scoped query and mutation is
 *   requireLedgerMember(ctx, ledgerId) -> .eq(ledgerId).eq(userId).unique()
 * — ONE document, whose read set is exactly that one index key, so another member joining or leaving
 * does not invalidate my queries.
 *
 * Because it is in the read set of every function in the app, this row must be nearly immutable. It
 * therefore carries NO lastReadAt, NO unread count, NO nickname-change churn and NO display
 * snapshot; those live in `ledgerMemberState` (hot) and `userProfiles` (resolved once per screen).
 *
 * EXACTLY ONE ROW PER (ledgerId, userId) FOREVER. Leaving sets `deletedAt`; rejoining clears it.
 * That invariant is what makes `by_ledgerId_userId` a true unique key.
 *
 * NAMING DEVIATION from sharing-invites.md §5.2, which called this field `removedAt`: the schema-wide
 * rule is that the soft-delete discriminator is named `deletedAt` and sits at position 2 of every
 * live list index. The exact guard `by_ledgerId_userId` is a manifest-classified lookup and reads the
 * row before checking its state. `endReason` carries what `removedAt` was distinguishing.
 */
export const ledgerMembersTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  role: ledgerRoleValidator,

  joinedAt: v.number(),
  joinedVia: joinSourceValidator,
  invitedByUserId: v.optional(v.id('users')),
  /** Which link they came through — powers "링크로 참여" and the leaked-link panic button. */
  joinedViaInviteId: v.optional(v.id('ledgerInvites')),

  /** Membership ended. The ROW STAYS: it is the membership audit trail and it keeps authored items
   *  resolving an author. Also set by ledgers.softDelete (endReason 'LEDGER_DELETED'), which is how
   *  a ledger delete becomes O(members) instead of O(items) — see §7.1. */
  ...softDelete,
  endReason: v.optional(membershipEndReasonValidator),
  /** Removed WITH 차단: blocks redeeming ANY future invite to this ledger. */
  blockedAt: v.optional(v.number()),

  legacyUid: v.optional(v.string()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${uid}`
})
  // THE guard. requireLedgerMember / requireLedgerRole. eq/eq -> 1 document.
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  // Ledger switcher / drawer: cursor-paginated in pages of 20; the frozen
  // legacy listMine contract remains bounded to LEDGER_SCAN_LIMIT.
  .index('by_userId_deletedAt', ['userId', 'deletedAt'])
  // Members screen roster; "who is the OWNER" (.eq(role,'OWNER').unique()); the last-owner guard;
  // the push fan-out recipient list. `.take(MEMBER_SCAN_LIMIT = 200)`.
  .index('by_ledgerId_deletedAt_role', ['ledgerId', 'deletedAt', 'role'])
  // The leaked-link panic button: remove everyone who joined through one invite.
  .index('by_joinedViaInviteId', ['joinedViaInviteId'])
  // Import idempotency + the claim re-parenting sweep (resolve legacyUid -> userId).
  .index('by_legacyUid', ['legacyUid'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * The HOT per-(ledger, member) row, split out of ledgerMembers precisely so that writing
 * `lastReadAt` — which happens every time anyone opens a ledger — cannot invalidate the
 * authorization read set of every query in that ledger.
 *
 * Deliberately has NO unread COUNT. Maintaining one would mean 8 document writes per item insert
 * (one per member), which is the single worst write amplification available in this schema. The
 * badge is an O(1) timestamp comparison instead (§4.3).
 */
export const ledgerMemberStateTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  /** Throttled write (LAST_READ_THROTTLE_MS = 60_000). Drives the "new activity" dot. */
  lastReadAt: v.number(),
  lastOpenedAt: v.number(),

  muted: v.boolean(),
  notifyNewItem: v.boolean(),
  notifyComment: v.boolean(),
  /** ITEM_ADDED push coalescing claim; patched at most once per recipient per 10 minutes. */
  lastItemPushAt: v.optional(v.number()),

  /** Per-ledger display name: "아빠" in the family ledger, "형" in the trip ledger. */
  nickname: v.optional(v.string()),
  /** Per-ledger tint so 8 members are distinguishable in a chart legend. */
  colorKey: v.optional(v.string()),

  /** Client-chosen switcher order. Replaces legacy AsyncStorage `selectedLedgerIndex`, which stored
   *  an ARRAY INDEX and broke whenever ledger order changed (`02` §14). */
  pinnedAt: v.optional(v.number()),
  sortOrder: v.number(),

  updatedAt: v.number(),
})
  // Per-membership switcher state: point-read by ledger for each paginated row;
  // legacy listMine retains its bounded `.eq(userId)` compatibility scan.
  .index('by_userId_ledgerId', ['userId', 'ledgerId'])
  // Push fan-out: every member-state row of one ledger in one range read, mute filtered in JS over
  // <=200 rows. Also the per-member point read on markRead.
  .index('by_ledgerId_userId', ['ledgerId', 'userId']);
