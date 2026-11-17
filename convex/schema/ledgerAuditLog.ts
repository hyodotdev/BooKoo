import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {ledgerRoleValidator} from './ledgerMembers';

export const ledgerAuditActionValidator = v.union(
  v.literal('LEDGER_CREATED'),
  v.literal('LEDGER_UPDATED'),
  v.literal('LEDGER_ARCHIVED'),
  v.literal('LEDGER_RESTORED'),
  v.literal('LEDGER_DELETE_SCHEDULED'),
  v.literal('LEDGER_DELETE_CANCELLED'),
  v.literal('CURRENCY_CONFIRMED'),
  v.literal('TIMEZONE_CHANGED'),
  v.literal('POLICY_CHANGED'),
  v.literal('INVITE_CREATED'),
  v.literal('INVITE_REVOKED'),
  v.literal('INVITE_REDEEMED'),
  v.literal('JOIN_REQUESTED'),
  v.literal('JOIN_APPROVED'),
  v.literal('JOIN_REJECTED'),
  v.literal('MEMBER_JOINED'),
  v.literal('MEMBER_LEFT'),
  v.literal('MEMBER_REMOVED'),
  v.literal('MEMBER_ROLE_CHANGED'),
  v.literal('OWNERSHIP_TRANSFERRED'),
  v.literal('CATEGORY_CREATED'),
  v.literal('CATEGORY_RENAMED'),
  v.literal('CATEGORY_ARCHIVED'),
  v.literal('CATEGORY_REASSIGNED'),
  v.literal('ITEM_DELETED'),
  v.literal('ITEM_RESTORED'),
  v.literal('EXPORT_REQUESTED'),
  v.literal('MIGRATION_IMPORTED'),
  v.literal('MIGRATION_OWNERSHIP_RESCUED'),
  v.literal('ROLLUP_REPAIRED'),
  v.literal('ITEMS_REBUCKETED'),
);

/**
 * FEED rows are purged at 180 days; AUDIT rows are structurally unreachable by the purge.
 * v1 writes ONLY 'AUDIT'. The field ships anyway because it is the mechanism that keeps any future
 * item-level activity feed bounded, and it costs one literal today instead of a schema change and a
 * backfill tomorrow.
 */
export const auditRetentionValidator = v.union(
  v.literal('AUDIT'),
  v.literal('FEED'),
);

/**
 * GOVERNANCE events only. Deliberately NOT written for item create/update: that would double the
 * write volume of the hottest path in the app and make this the largest table in the deployment.
 * Item history is answered by ledgerItems.updatedAt/updatedByUserId plus the soft-delete window;
 * ITEM_DELETED/ITEM_RESTORED are here because "who deleted the 300,000원 entry" is the question a
 * shared money log must be able to answer.
 */
export const ledgerAuditLogTable = defineTable({
  ledgerId: v.id('ledgers'),
  action: ledgerAuditActionValidator,
  retention: auditRetentionValidator,
  actorUserId: v.optional(v.id('users')), // undefined = the system / a cron / the migration
  targetUserId: v.optional(v.id('users')),
  targetInviteId: v.optional(v.id('ledgerInvites')),
  targetItemId: v.optional(v.id('ledgerItems')),
  beforeRole: v.optional(ledgerRoleValidator),
  afterRole: v.optional(ledgerRoleValidator),
  /** Small, non-secret, structured. NEVER an invite code, never free client text. */
  meta: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  createdAt: v.number(),
})
  // Ledger settings -> Activity, paginated desc 30.
  .index('by_ledgerId_createdAt', ['ledgerId', 'createdAt'])
  // "Recently deleted" / restore, and the retention purge cron (`.eq(retention,'FEED')`).
  .index('by_ledgerId_retention_createdAt', [
    'ledgerId',
    'retention',
    'createdAt',
  ])
  // "Everything that happened to this member in this ledger" on the member detail sheet.
  .index('by_ledgerId_targetUserId_createdAt', [
    'ledgerId',
    'targetUserId',
    'createdAt',
  ]);
