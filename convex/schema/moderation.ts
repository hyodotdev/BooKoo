import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {timestamps} from './common';

export const reportReasonValidator = v.union(
  v.literal('SPAM'),
  v.literal('HARASSMENT'),
  v.literal('IMPERSONATION'),
  v.literal('SEXUAL'),
  v.literal('FRAUD'),
  v.literal('PRIVACY'),
  v.literal('OTHER'),
);
export const reportStatusValidator = v.union(
  v.literal('OPEN'),
  v.literal('REVIEWING'),
  v.literal('ACTIONED'),
  v.literal('DISMISSED'),
);
export const reportResolutionValidator = v.union(
  v.literal('NO_ACTION'),
  v.literal('COMMENT_REMOVED'),
  v.literal('ITEM_CONTENT_REDACTED'),
  v.literal('MEMBER_REMOVED'),
  v.literal('ACCOUNT_SUSPENDED'),
);

export const contentReportsTable = defineTable({
  reporterUserId: v.id('users'),
  /**
   * A DISCRIMINATED UNION, not (targetKind: string, fourOptionalIds). The id types are checked by
   * the compiler at every construction site and an impossible combination is unrepresentable.
   */
  subject: v.union(
    v.object({kind: v.literal('USER'), userId: v.id('users')}),
    v.object({kind: v.literal('LEDGER'), ledgerId: v.id('ledgers')}),
    v.object({kind: v.literal('ITEM'), itemId: v.id('ledgerItems')}),
    v.object({kind: v.literal('COMMENT'), commentId: v.id('itemComments')}),
  ),
  /** Derived and permission-checked by reports.create. Required for ledger/content subjects and for
   *  a USER report made from a member surface; never trusted from a client-supplied id alone. */
  contextLedgerId: v.optional(v.id('ledgers')),
  reason: reportReasonValidator,
  note: v.optional(v.string()), // <=500 chars, never logged/projected to the subject
  status: reportStatusValidator,
  acknowledgedAt: v.optional(v.number()),
  acknowledgedByUserId: v.optional(v.id('users')),
  handledByUserId: v.optional(v.id('users')),
  handledAt: v.optional(v.number()),
  resolution: v.optional(reportResolutionValidator),
  ticketRef: v.optional(v.string()), // opaque support-system reference, not free-form notes
  ...timestamps,
})
  // Moderation queue: `.eq('status','OPEN')`, createdAt asc, paginate 30.
  .index('by_status_createdAt', ['status', 'createdAt'])
  // Rate-limit backstop ("this account filed 40 reports today") + the reporter's own history.
  .index('by_reporterUserId_createdAt', ['reporterUserId', 'createdAt']);

export const userBlocksTable = defineTable({
  blockerUserId: v.id('users'),
  blockedUserId: v.id('users'),
  createdAt: v.number(),
})
  // O(1) "is B blocked by A" — checked when rendering a comment author and when resolving an invite.
  .index('by_blockerUserId_blockedUserId', ['blockerUserId', 'blockedUserId'])
  // Reverse check when someone tries to invite a user who has blocked them.
  .index('by_blockedUserId', ['blockedUserId'])
  // The block-list screen.
  .index('by_blockerUserId_createdAt', ['blockerUserId', 'createdAt']);
