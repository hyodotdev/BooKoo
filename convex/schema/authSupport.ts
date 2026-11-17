import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/** auth-onboarding.md §12.3. SECRET — never reaches a client, never in a serializer projection. */
export const appleRefreshTokensTable = defineTable({
  userId: v.id('users'),
  /** Bundle id on iOS, Services ID on Android web — DIFFERENT values, so stored, not guessed. */
  clientId: v.string(),
  refreshToken: v.string(),
  updatedAt: v.number(),
})
  // Revoke-on-account-deletion (App Store 5.1.1(v)) and the token refresh path.
  .index('by_userId_clientId', ['userId', 'clientId']);

/** OUR OWN OTP, for ADDING an email to an already-signed-in account (auth-onboarding.md §11.4). */
export const emailLinkCodesTable = defineTable({
  userId: v.id('users'),
  emailNormalized: v.string(),
  codeHash: v.string(), // sha256 hex, lowercase. The plaintext code is never stored.
  expiresAt: v.number(),
  attemptsLeft: v.number(),
  createdAt: v.number(),
})
  // "cancel my pending email link" + the one-outstanding-code-per-user rule.
  .index('by_userId', ['userId'])
  // Verify: `.eq(emailNormalized)` then compare the hash in JS over <=1 row.
  .index('by_emailNormalized', ['emailNormalized'])
  // Expiry cron.
  .index('by_expiresAt', ['expiresAt']);

export const authAuditEventValidator = v.union(
  v.literal('handle_claimed'),
  v.literal('handle_renamed'),
  v.literal('account_linked'),
  v.literal('account_unlinked'),
  v.literal('accounts_merged'),
  v.literal('email_verified'),
  v.literal('email_reassigned'),
  v.literal('primary_email_changed'),
  v.literal('legacy_claimed'),
  v.literal('legacy_force_claimed'),
  v.literal('legacy_ambiguous'),
  v.literal('deletion_requested'),
  v.literal('deletion_cancelled'),
  v.literal('deletion_purged'),
  v.literal('ledger_ownership_transferred'),
  v.literal('account_suspended'),
  v.literal('account_reinstated'),
);

/**
 * Append-only impersonation/support paper trail. ACCOUNT-scoped; ledger governance goes to
 * ledgerAuditLog. Small, structured, never free text from a client.
 */
export const authAuditTable = defineTable({
  userId: v.optional(v.id('users')),
  event: authAuditEventValidator,
  detail: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  ticketRef: v.optional(v.string()),
  createdAt: v.number(),
})
  // "everything that happened to this account", paginated desc on the support screen.
  .index('by_userId_createdAt', ['userId', 'createdAt'])
  // Ops: "every ambiguous legacy claim this week".
  .index('by_event_createdAt', ['event', 'createdAt']);
