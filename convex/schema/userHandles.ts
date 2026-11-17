import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * Authority for handle uniqueness. One row per handle EVER claimed; rows are NEVER deleted.
 *
 * Convex has no unique constraint. Uniqueness is a check-then-insert inside ONE mutation against
 * `by_handleKey`: Convex tracks index RANGES in the read set, so a competing insert into the range
 * this mutation read invalidates it, the mutation re-runs at a fresh timestamp, and the re-run sees
 * the winner's row (`09` §12.2). Three conditions are load-bearing: same mutation, `.eq()` on the
 * NORMALIZED key via withIndex (never `.filter()`), and one normalization function
 * (`shared/username.ts`) shared byte-for-byte by client and server.
 *
 * `releasedAt` is what stops a freed handle being recycled straight into an impersonation
 * (HANDLE_RELEASE_COOLDOWN_MS = 90 d; the original owner may always re-take immediately).
 */
export const userHandlesTable = defineTable({
  /** NFKC-folded, lowercased, ASCII-only. THIS is what uniqueness compares. */
  handleKey: v.string(),
  /** Exactly what the member typed, for display casing. */
  handle: v.string(),
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away or the account is deleted. undefined == currently held. */
  releasedAt: v.optional(v.number()),
})
  // THE uniqueness gate inside claimHandle/changeHandle; also checkAvailability (advisory) and the
  // <=12 probes inside suggestAvailable. Narrowest possible read set.
  .index('by_handleKey', ['handleKey'])
  // Security screen "Previously: @oldhyo until 2026-05-01". `.take(HANDLE_HISTORY_LIMIT = 50)`.
  .index('by_userId_claimedAt', ['userId', 'claimedAt'])
  // "Is this user's handle currently live?" without walking their rename history — used by
  // deleteAccount to release the live claim.
  .index('by_userId_releasedAt', ['userId', 'releasedAt']);
