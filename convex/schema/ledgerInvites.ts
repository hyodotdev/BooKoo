import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {ledgerRoleValidator} from './ledgerMembers';
import {legacyTrailer, timestamps} from './common';

export const inviteSourceValidator = v.union(
  v.literal('LINK'), // a shareable deep link, N uses, expiring
  v.literal('EMAIL'), // aimed at one address
  v.literal('HANDLE'), // aimed at one existing account found by @handle
  v.literal('LEGACY_EMAIL'), // converted from bookoo/invites; NEVER auto-joins (see below)
);

export const ledgerInvitesTable = defineTable({
  ledgerId: v.id('ledgers'),

  /**
   * sha256(INVITE_TOKEN_PEPPER + ':' + normalizedCode), hex. The plaintext code is returned exactly
   * once, by the mutation that creates the row, and is NEVER stored. A database export is therefore
   * not a set of working invite links.
   */
  codeHash: v.string(),

  /** Role granted on redeem. NEVER OWNER or ADMIN — enforced in invites.create. A bearer token must
   *  not be able to grant management rights (sharing-invites.md §1.3 rule 2). */
  role: ledgerRoleValidator,
  source: inviteSourceValidator,

  maxUses: v.optional(v.number()), // undefined = unlimited
  useCount: v.number(), // required, 0 at insert
  /** undefined = never expires. REQUIRED to be optional: legacy invites never expired, and a 2019
   *  invitee who signs in tomorrow must still land in that ledger (`02` §4). New links get 7 d. */
  expiresAt: v.optional(v.number()),
  /** true => redeeming creates a ledgerJoinRequest instead of a membership. */
  requiresApproval: v.boolean(),

  /** At most one of these two is set. Present => the invite is bound to one identity. */
  inviteeEmailNormalized: v.optional(v.string()),
  inviteeUserId: v.optional(v.id('users')),

  note: v.optional(v.string()), // <=40 chars, shown in the management list
  createdByUserId: v.id('users'),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  revokedByUserId: v.optional(v.id('users')),
  // A recipient decline also sets revokedAt to leave the active invite indexes.
  declinedAt: v.optional(v.number()),

  /** The RTDB key exactly as it appeared: "hyo%40hyo%2Edev". Kept so A/B reconciliation is auditable. */
  legacyEncodedEmail: v.optional(v.string()),
  legacyLedgerKey: v.optional(v.string()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${encodedEmail}`
})
  // THE redemption lookup. Exact eq on a 128-bit-derived digest. Also the mint-time uniqueness gate.
  .index('by_codeHash', ['codeHash'])
  // LEGACY INDEX A: the Members screen "초대중" list + the 20-active-links-per-ledger cap.
  .index('by_ledgerId_revokedAt_createdAt', [
    'ledgerId',
    'revokedAt',
    'createdAt',
  ])
  // The active-link cap. `by_..._createdAt` cannot answer it: it orders by age, and liveness is a
  // question about `expiresAt`. Two bounded reads against this — one for the legacy rows that never
  // expire, one for `expiresAt > now` — are the whole count.
  .index('by_ledgerId_revokedAt_expiresAt', ['ledgerId', 'revokedAt', 'expiresAt'])
  // LEGACY INDEX B: "which ledgers were waiting for this address?", run once per verified email.
  .index('by_inviteeEmailNormalized_revokedAt', [
    'inviteeEmailNormalized',
    'revokedAt',
  ])
  // "You have an invitation" badge for an already-registered target.
  .index('by_inviteeUserId_revokedAt', ['inviteeUserId', 'revokedAt'])
  // Expiry GC cron.
  .index('by_expiresAt', ['expiresAt'])
  .index('by_legacyKey', ['legacyKey']);

/**
 * One row per (invite, user) that ever redeemed. Two jobs: `useCount` stays exact when the same
 * person taps the link twice (a re-tap must not burn a use), and the management screen can show WHO
 * used a link, not just how many times. It is also what the `useCount` repair job recounts from.
 */
export const ledgerInviteRedemptionsTable = defineTable({
  inviteId: v.id('ledgerInvites'),
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  redeemedAt: v.number(),
  outcome: v.union(v.literal('JOINED'), v.literal('REQUESTED')),
})
  // Idempotency: "has this person already redeemed this link?" — 1 document.
  .index('by_inviteId_userId', ['inviteId', 'userId'])
  // "Who used this link" + the useCount repair recount. `.take(INVITE_REDEMPTION_SCAN_LIMIT = 200)`.
  .index('by_inviteId_redeemedAt', ['inviteId', 'redeemedAt']);

export const joinRequestStatusValidator = v.union(
  v.literal('PENDING'),
  v.literal('APPROVED'),
  v.literal('REJECTED'),
  v.literal('CANCELLED'),
  v.literal('EXPIRED'),
  v.literal('BLOCKED'),
);
export const joinRequestSourceValidator = v.union(
  v.literal('INVITE_LINK'),
  v.literal('HANDLE_REQUEST'),
  v.literal('LEGACY_REQUEST'),
);

/**
 * The other half of the legacy membership state machine: `ledgers/{k}/requests/{uid}` (`02` §9 B).
 * A rejection KEEPS a row (`status: 'REJECTED'`) — legacy just dropped the node, so a stranger could
 * re-request forever and the owner had no record.
 *
 * Kept as a separate table rather than a `direction` column on ledgerInvites because the two flows
 * are inverses: an invite is the ledger granting permission and is keyed by an address that may not
 * correspond to an account; a request is a person asking, and always has a userId. Fusing them would
 * force emailNormalized / codeHash / inviteeUserId / userId all optional on one table and make every
 * read path check `direction` before trusting a field.
 */
export const ledgerJoinRequestsTable = defineTable({
  ledgerId: v.id('ledgers'),
  userId: v.id('users'),
  inviteId: v.optional(v.id('ledgerInvites')),
  status: joinRequestStatusValidator,
  source: joinRequestSourceValidator,
  message: v.optional(v.string()), // <=100 chars
  requestedAt: v.number(),
  expiresAt: v.number(), // requestedAt + 14 d
  decidedByUserId: v.optional(v.id('users')),
  decidedAt: v.optional(v.number()),
  ...timestamps,
  ...legacyTrailer, // legacyKey = `${ledgerKey}/${uid}`
})
  // The approval inbox AND the drawer's "pending request" dot (`.eq(status,'PENDING').take(1)`).
  // Legacy did the dot with N SEQUENTIAL round-trips per app open (`02` §S4).
  .index('by_ledgerId_status_requestedAt', [
    'ledgerId',
    'status',
    'requestedAt',
  ])
  // "at most one non-terminal request per pair" + the 7-day rejection cooldown.
  .index('by_ledgerId_userId', ['ledgerId', 'userId'])
  // "My outgoing requests".
  .index('by_userId_status', ['userId', 'status'])
  // Expiry cron.
  .index('by_status_expiresAt', ['status', 'expiresAt'])
  .index('by_legacyKey', ['legacyKey']);
