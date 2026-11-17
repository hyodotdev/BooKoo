import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';

type IndexKind = 'lookup' | 'list' | 'maintenance';
type LifecycleKind =
  'standardMutable' | 'appendOnly' | 'eventLifecycle' | 'derivedOrCursor';
type IndexPolicy = {
  kind: IndexKind;
  name: string;
  fields: readonly string[];
  search?: true;
};
type TablePolicy = {
  lifecycle: LifecycleKind;
  requiredAt: readonly string[];
  forbidUpdatedAt?: true;
  indexes: readonly IndexPolicy[];
};

const i = (
  kind: IndexKind,
  name: string,
  ...fields: readonly string[]
): IndexPolicy => ({kind, name, fields});
const search = (name: string, field: string): IndexPolicy => ({
  kind: 'lookup',
  name,
  fields: [field],
  search: true,
});

// This is the executable form of SCHEMA.md §7.8. Adding a table or index to
// code without adding it here is intentionally a CI failure.
const TABLE_POLICY = {
  userProfiles: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_userId', 'userId'),
      i('lookup', 'by_emailNormalized', 'emailNormalized'),
      i('lookup', 'by_handleKey', 'handleKey'),
      i('maintenance', 'by_appRole', 'appRole'),
      i('lookup', 'by_legacyUid', 'legacyUid'),
      i('maintenance', 'by_purgeAfter', 'purgeAfter'),
      i(
        'maintenance',
        'by_avatarMigrationState_avatarAttempts',
        'avatarMigrationState',
        'avatarAttempts',
      ),
      i('lookup', 'by_legacyKey', 'legacyKey'),
      search('search_handle', 'handle'),
    ],
  },
  userPresence: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['lastSeenAt'],
    indexes: [i('lookup', 'by_userId', 'userId')],
  },
  userEmails: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'lookup',
        'by_emailNormalized_deletedAt',
        'emailNormalized',
        'deletedAt',
      ),
      i('list', 'by_userId_deletedAt', 'userId', 'deletedAt'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  userHandles: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['claimedAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_handleKey', 'handleKey'),
      i('list', 'by_userId_claimedAt', 'userId', 'claimedAt'),
      i('maintenance', 'by_userId_releasedAt', 'userId', 'releasedAt'),
    ],
  },
  appleRefreshTokens: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [i('lookup', 'by_userId_clientId', 'userId', 'clientId')],
  },
  emailLinkCodes: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt', 'expiresAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('list', 'by_userId', 'userId'),
      i('lookup', 'by_emailNormalized', 'emailNormalized'),
      i('maintenance', 'by_expiresAt', 'expiresAt'),
    ],
  },
  authAudit: {
    lifecycle: 'appendOnly',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('list', 'by_userId_createdAt', 'userId', 'createdAt'),
      i('maintenance', 'by_event_createdAt', 'event', 'createdAt'),
    ],
  },
  contentReports: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('maintenance', 'by_status_createdAt', 'status', 'createdAt'),
      i('list', 'by_reporterUserId_createdAt', 'reporterUserId', 'createdAt'),
    ],
  },
  userBlocks: {
    lifecycle: 'appendOnly',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i(
        'lookup',
        'by_blockerUserId_blockedUserId',
        'blockerUserId',
        'blockedUserId',
      ),
      i('maintenance', 'by_blockedUserId', 'blockedUserId'),
      i('list', 'by_blockerUserId_createdAt', 'blockerUserId', 'createdAt'),
    ],
  },
  ledgers: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('list', 'by_ownerId_deletedAt', 'ownerId', 'deletedAt'),
      i('maintenance', 'by_purgeAfter', 'purgeAfter'),
      i('maintenance', 'by_maintenanceLock', 'maintenanceLock'),
      i('maintenance', 'by_rollupVersion', 'rollupVersion'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  ledgerMembers: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_ledgerId_userId', 'ledgerId', 'userId'),
      i('list', 'by_userId_deletedAt', 'userId', 'deletedAt'),
      i('list', 'by_ledgerId_deletedAt_role', 'ledgerId', 'deletedAt', 'role'),
      i('lookup', 'by_joinedViaInviteId', 'joinedViaInviteId'),
      i('lookup', 'by_legacyUid', 'legacyUid'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  ledgerMemberState: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [
      i('lookup', 'by_userId_ledgerId', 'userId', 'ledgerId'),
      i('lookup', 'by_ledgerId_userId', 'ledgerId', 'userId'),
    ],
  },
  ledgerInvites: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_codeHash', 'codeHash'),
      i(
        'list',
        'by_ledgerId_revokedAt_createdAt',
        'ledgerId',
        'revokedAt',
        'createdAt',
      ),
      i(
        'list',
        'by_ledgerId_revokedAt_expiresAt',
        'ledgerId',
        'revokedAt',
        'expiresAt',
      ),
      i(
        'lookup',
        'by_inviteeEmailNormalized_revokedAt',
        'inviteeEmailNormalized',
        'revokedAt',
      ),
      i('lookup', 'by_inviteeUserId_revokedAt', 'inviteeUserId', 'revokedAt'),
      i('maintenance', 'by_expiresAt', 'expiresAt'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  ledgerInviteRedemptions: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['redeemedAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_inviteId_userId', 'inviteId', 'userId'),
      i('list', 'by_inviteId_redeemedAt', 'inviteId', 'redeemedAt'),
    ],
  },
  ledgerJoinRequests: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_ledgerId_status_requestedAt',
        'ledgerId',
        'status',
        'requestedAt',
      ),
      i('lookup', 'by_ledgerId_userId', 'ledgerId', 'userId'),
      i('list', 'by_userId_status', 'userId', 'status'),
      i('maintenance', 'by_status_expiresAt', 'status', 'expiresAt'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  ledgerAuditLog: {
    lifecycle: 'appendOnly',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('list', 'by_ledgerId_createdAt', 'ledgerId', 'createdAt'),
      i(
        'maintenance',
        'by_ledgerId_retention_createdAt',
        'ledgerId',
        'retention',
        'createdAt',
      ),
      i(
        'list',
        'by_ledgerId_targetUserId_createdAt',
        'ledgerId',
        'targetUserId',
        'createdAt',
      ),
    ],
  },
  ledgerCategories: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('list', 'by_ledgerId_sortOrder', 'ledgerId', 'sortOrder'),
      i('lookup', 'by_ledgerId_key', 'ledgerId', 'key'),
      i('lookup', 'by_ledgerId_legacyIconId', 'ledgerId', 'legacyIconId'),
    ],
  },
  ledgerItems: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_ledgerId_deletedAt_dayKey_occurredAt',
        'ledgerId',
        'deletedAt',
        'dayKey',
        'occurredAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_categoryKey_dayKey_occurredAt',
        'ledgerId',
        'deletedAt',
        'categoryKey',
        'dayKey',
        'occurredAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_authorId_dayKey_occurredAt',
        'ledgerId',
        'deletedAt',
        'authorId',
        'dayKey',
        'occurredAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_type_dayKey_occurredAt',
        'ledgerId',
        'deletedAt',
        'type',
        'dayKey',
        'occurredAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_type_amountMinor_dayKey_occurredAt',
        'ledgerId',
        'deletedAt',
        'type',
        'amountMinor',
        'dayKey',
        'occurredAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_createdAt',
        'ledgerId',
        'deletedAt',
        'createdAt',
      ),
      i('maintenance', 'by_ledgerId_monthKey', 'ledgerId', 'monthKey'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
      i(
        'lookup',
        'by_ledgerId_authorId_clientRequestId',
        'ledgerId',
        'authorId',
        'clientRequestId',
      ),
      search('search_memo', 'memo'),
    ],
  },
  itemPhotos: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('list', 'by_itemId_deletedAt_order', 'itemId', 'deletedAt', 'order'),
      i(
        'list',
        'by_itemId_deletedAt_commentId_order',
        'itemId',
        'deletedAt',
        'commentId',
        'order',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_createdAt',
        'ledgerId',
        'deletedAt',
        'createdAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_commentId_createdAt',
        'ledgerId',
        'deletedAt',
        'commentId',
        'createdAt',
      ),
      i(
        'maintenance',
        'by_migrationState_attempts',
        'migrationState',
        'attempts',
      ),
      i('lookup', 'by_storageId', 'storageId'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  itemComments: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_itemId_deletedAt_createdAt',
        'itemId',
        'deletedAt',
        'createdAt',
      ),
      i(
        'list',
        'by_ledgerId_deletedAt_authorId_createdAt',
        'ledgerId',
        'deletedAt',
        'authorId',
        'createdAt',
      ),
      i(
        'lookup',
        'by_itemId_authorId_clientRequestId',
        'itemId',
        'authorId',
        'clientRequestId',
      ),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  clientMutationReceipts: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt', 'expiresAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_userId_clientRequestId', 'userId', 'clientRequestId'),
      i('list', 'by_ledgerId_createdAt', 'ledgerId', 'createdAt'),
      i('maintenance', 'by_expiresAt', 'expiresAt'),
    ],
  },
  ledgerDayRollups: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [
      i('lookup', 'by_ledgerId_dayKey_shard', 'ledgerId', 'dayKey', 'shard'),
    ],
  },
  ledgerMonthRollups: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [
      i(
        'lookup',
        'by_ledgerId_monthKey_shard',
        'ledgerId',
        'monthKey',
        'shard',
      ),
      i('maintenance', 'by_repairedAt', 'repairedAt'),
    ],
  },
  ledgerCategoryMonthRollups: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [
      i(
        'lookup',
        'by_ledgerId_monthKey_categoryKey_shard',
        'ledgerId',
        'monthKey',
        'categoryKey',
        'shard',
      ),
      i(
        'list',
        'by_ledgerId_categoryKey_monthKey_shard',
        'ledgerId',
        'categoryKey',
        'monthKey',
        'shard',
      ),
    ],
  },
  notifications: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_userId_deletedAt_createdAt',
        'userId',
        'deletedAt',
        'createdAt',
      ),
      i('list', 'by_userId_deletedAt_readAt', 'userId', 'deletedAt', 'readAt'),
      i('maintenance', 'by_ledgerId_createdAt', 'ledgerId', 'createdAt'),
    ],
  },
  pushTokens: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [
      i('list', 'by_userId_disabledAt', 'userId', 'disabledAt'),
      i('lookup', 'by_token', 'token'),
    ],
  },
  uploads: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt'],
    indexes: [
      i('lookup', 'by_storageId', 'storageId'),
      i('list', 'by_userId_createdAt', 'userId', 'createdAt'),
      i('list', 'by_ledgerId_createdAt', 'ledgerId', 'createdAt'),
      i('maintenance', 'by_referencedCheckedAt', 'referencedCheckedAt'),
    ],
  },
  feedback: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('maintenance', 'by_status_createdAt', 'status', 'createdAt'),
      i('list', 'by_userId_createdAt', 'userId', 'createdAt'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
    ],
  },
  legalEvents: {
    lifecycle: 'appendOnly',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('list', 'by_userId_kind_createdAt', 'userId', 'kind', 'createdAt'),
      i('maintenance', 'by_createdAt', 'createdAt'),
    ],
  },
  dataExports: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['requestedAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_requesterUserId_requestedAt',
        'requesterUserId',
        'requestedAt',
      ),
      i(
        'lookup',
        'by_requesterUserId_kind_ledgerId_state',
        'requesterUserId',
        'kind',
        'ledgerId',
        'state',
      ),
      i('maintenance', 'by_state_expiresAt', 'state', 'expiresAt'),
      i('list', 'by_ledgerId_requestedAt', 'ledgerId', 'requestedAt'),
    ],
  },
  dataExportFiles: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt', 'expiresAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('list', 'by_exportId_order', 'exportId', 'order'),
      i('maintenance', 'by_expiresAt', 'expiresAt'),
    ],
  },
  subscribers: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_userId', 'userId'),
      i('lookup', 'by_appUserId', 'appUserId'),
      i('maintenance', 'by_status_expiresAt', 'status', 'expiresAt'),
    ],
  },
  subscriptionPurchases: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_providerSubscriptionId', 'providerSubscriptionId'),
      i('list', 'by_userId_createdAt', 'userId', 'createdAt'),
      i(
        'lookup',
        'by_userId_environment_store_status_expiresAt',
        'userId',
        'environment',
        'store',
        'status',
        'expiresAt',
      ),
    ],
  },
  subscriptionEvents: {
    lifecycle: 'appendOnly',
    requiredAt: ['receivedAt', 'eventAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_eventId', 'eventId'),
      i('list', 'by_appUserId_receivedAt', 'appUserId', 'receivedAt'),
      i('list', 'by_userId_receivedAt', 'userId', 'receivedAt'),
      i(
        'lookup',
        'by_userId_outcome_receivedAt',
        'userId',
        'outcome',
        'receivedAt',
      ),
      i(
        'lookup',
        'by_userId_store_environment_revokesAccess_receivedAt',
        'userId',
        'store',
        'environment',
        'revokesAccess',
        'receivedAt',
      ),
      i('maintenance', 'by_receivedAt', 'receivedAt'),
    ],
  },
  appConfig: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['updatedAt'],
    indexes: [i('lookup', 'by_singleton', 'singleton')],
  },
  appAnnouncements: {
    lifecycle: 'standardMutable',
    requiredAt: ['createdAt', 'updatedAt'],
    indexes: [
      i(
        'list',
        'by_kind_deletedAt_sortOrder',
        'kind',
        'deletedAt',
        'sortOrder',
      ),
      i('maintenance', 'by_kind_publishedAt', 'kind', 'publishedAt'),
      i('lookup', 'by_key', 'key'),
    ],
  },
  legacyUsers: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['legacyCreatedAt'],
    indexes: [
      i('lookup', 'by_legacyUid', 'legacyUid'),
      i(
        'lookup',
        'by_emailNormalized_claimState',
        'emailNormalized',
        'claimState',
      ),
      i('maintenance', 'by_claimState', 'claimState'),
      i('lookup', 'by_placeholderUserId', 'placeholderUserId'),
    ],
  },
  legacyInvites: {
    lifecycle: 'appendOnly',
    requiredAt: ['importedAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_emailNormalized', 'emailNormalized'),
      i('lookup', 'by_legacyLedgerKey', 'legacyLedgerKey'),
      i('maintenance', 'by_reconciledAs', 'reconciledAs'),
    ],
  },
  migrationRuns: {
    lifecycle: 'appendOnly',
    requiredAt: ['at'],
    forbidUpdatedAt: true,
    indexes: [
      i('lookup', 'by_runId_table_batchIndex', 'runId', 'table', 'batchIndex'),
    ],
  },
  migrationAnomalies: {
    lifecycle: 'eventLifecycle',
    requiredAt: ['createdAt'],
    forbidUpdatedAt: true,
    indexes: [
      i('maintenance', 'by_kind_resolvedAt', 'kind', 'resolvedAt'),
      i('lookup', 'by_legacyKey', 'legacyKey'),
      i('maintenance', 'by_producedRow_kind', 'producedRow', 'kind'),
    ],
  },
  maintenanceJobs: {
    lifecycle: 'derivedOrCursor',
    requiredAt: ['startedAt', 'updatedAt'],
    indexes: [
      i('lookup', 'by_jobKey', 'jobKey'),
      i('maintenance', 'by_state_updatedAt', 'state', 'updatedAt'),
      i('maintenance', 'by_ledgerId_kind', 'ledgerId', 'kind'),
    ],
  },
} as const satisfies Record<string, TablePolicy>;

type TableName = keyof typeof TABLE_POLICY;

const SOFT_DELETE_TABLES = new Set<TableName>([
  'userEmails',
  'ledgers',
  'ledgerMembers',
  'ledgerItems',
  'itemPhotos',
  'itemComments',
  'notifications',
  'appAnnouncements',
]);
const failures: string[] = [];

for (const [tableName, policy] of Object.entries(TABLE_POLICY)) {
  const seen = new Set<string>();
  if (policy.indexes.length > 32)
    failures.push(`${tableName}: more than 32 indexes`);

  for (const index of policy.indexes) {
    const key = `${index.search === true ? 'search' : 'index'}:${index.name}`;
    if (seen.has(key))
      failures.push(`${tableName}.${index.name}: classified more than once`);
    seen.add(key);
    if (index.name.length > 64)
      failures.push(`${tableName}.${index.name}: name exceeds 64 characters`);
    if (index.fields.length > 16)
      failures.push(`${tableName}.${index.name}: tuple exceeds 16 fields`);
    const expectedName = `${index.search === true ? 'search_' : 'by_'}${index.fields.join('_')}`;
    if (index.name !== expectedName)
      failures.push(`${tableName}.${index.name}: expected ${expectedName}`);
    if (index.fields.includes('_creationTime'))
      failures.push(`${tableName}.${index.name}: indexes _creationTime`);
    if (
      SOFT_DELETE_TABLES.has(tableName as TableName) &&
      index.kind === 'list' &&
      index.fields.length > 1 &&
      index.fields[1] !== 'deletedAt'
    ) {
      failures.push(
        `${tableName}.${index.name}: soft-delete list must put deletedAt second`,
      );
    }
  }
}

const convexRoot = join(process.cwd(), 'convex');
const allTypeScriptFiles = (root: string): string[] =>
  readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory())
      return entry.name === '_generated' ? [] : allTypeScriptFiles(path);
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
  });
const files = allTypeScriptFiles(convexRoot);

type ActualIndex = {name: string; fields: string[]; search: boolean};
type ActualTable = {
  fields: Set<string>;
  validators: Map<string, string>;
  spreads: Set<string>;
  indexes: ActualIndex[];
};
const actualTables = new Map<string, ActualTable>();
const assembledTables = new Map<string, string>();
let hasAuthTablesSpread = false;

const propertyName = (node: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return undefined;
};

const readFields = (
  node: ts.Expression | undefined,
  table: ActualTable,
): void => {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return;
  for (const property of node.properties) {
    if (
      ts.isSpreadAssignment(property) &&
      ts.isIdentifier(property.expression)
    ) {
      table.spreads.add(property.expression.text);
    } else if (ts.isPropertyAssignment(property)) {
      const name = propertyName(property.name);
      if (name !== undefined) {
        table.fields.add(name);
        table.validators.set(name, property.initializer.getText());
      }
    } else if (ts.isShorthandPropertyAssignment(property)) {
      table.fields.add(property.name.text);
    }
  }
};

const stringArray = (node: ts.Expression | undefined): string[] => {
  if (node === undefined || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.flatMap((element) =>
    ts.isStringLiteral(element) ? [element.text] : [],
  );
};

const searchField = (node: ts.Expression | undefined): string[] => {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return [];
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyName(property.name) !== 'searchField') continue;
    if (ts.isStringLiteral(property.initializer))
      return [property.initializer.text];
  }
  return [];
};

const readChain = (node: ts.Expression, table: ActualTable): void => {
  if (!ts.isCallExpression(node)) return;
  if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'defineTable'
  ) {
    readFields(node.arguments[0], table);
    return;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  const method = node.expression.name.text;
  readChain(node.expression.expression, table);
  if (method !== 'index' && method !== 'searchIndex') return;
  const nameNode = node.arguments[0];
  if (!ts.isStringLiteral(nameNode)) return;
  table.indexes.push({
    name: nameNode.text,
    fields:
      method === 'index'
        ? stringArray(node.arguments[1])
        : searchField(node.arguments[1]),
    search: method === 'searchIndex',
  });
};

const isDbGet = (node: ts.CallExpression): boolean => {
  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== 'get'
  )
    return false;
  const owner = node.expression.expression;
  return (
    (ts.isIdentifier(owner) && owner.text === 'db') ||
    (ts.isPropertyAccessExpression(owner) && owner.name.text === 'db')
  );
};

for (const file of files) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const shortPath = relative(process.cwd(), file);

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith('Table') &&
      node.initializer !== undefined
    ) {
      const tableName = node.name.text.slice(0, -'Table'.length);
      const table: ActualTable = {
        fields: new Set(),
        validators: new Map(),
        spreads: new Set(),
        indexes: [],
      };
      readChain(node.initializer, table);
      if (table.fields.size > 0 || table.indexes.length > 0)
        actualTables.set(tableName, table);
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineSchema'
      ) {
        const schemaObject = node.arguments[0];
        if (
          schemaObject !== undefined &&
          ts.isObjectLiteralExpression(schemaObject)
        ) {
          for (const property of schemaObject.properties) {
            if (
              ts.isSpreadAssignment(property) &&
              ts.isIdentifier(property.expression) &&
              property.expression.text === 'authTables'
            ) {
              hasAuthTablesSpread = true;
            } else if (
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.initializer)
            ) {
              const name = propertyName(property.name);
              if (name !== undefined)
                assembledTables.set(name, property.initializer.text);
            }
          }
        }
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (
          method === 'any' &&
          node.expression.expression.getText(source) === 'v'
        )
          failures.push(`${shortPath}: v.any() is banned`);
        if (method === 'collect')
          failures.push(`${shortPath}: .collect() is banned`);
        if (method === 'filter' && sourceText.includes('ledgerItems'))
          failures.push(`${shortPath}: .filter() is banned with ledgerItems`);
      }
      if (isDbGet(node) && node.arguments.length !== 2)
        failures.push(`${shortPath}: db.get requires table name and id`);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

const hasField = (table: ActualTable, field: string): boolean =>
  table.fields.has(field) ||
  (table.spreads.has('timestamps') &&
    (field === 'createdAt' || field === 'updatedAt')) ||
  (table.spreads.has('softDelete') &&
    (field === 'deletedAt' || field === 'deletedByUserId')) ||
  (table.spreads.has('legacyTrailer') &&
    ['legacyKey', 'legacyCreatedAt', 'legacyRaw'].includes(field));

if (actualTables.size === 0) {
  const status = readFileSync(
    join(process.cwd(), '.notes', 'STATUS.md'),
    'utf8',
  );
  const i1Line =
    status.split('\n').find((line) => line.startsWith('| I1 |')) ?? '';
  if (/\bDONE\b/.test(i1Line))
    failures.push(
      'I1 is DONE but no convex/schema table implementation exists',
    );
  process.stdout.write(
    `schema: ${Object.keys(TABLE_POLICY).length}-table policy verified; implementation pending I1\n`,
  );
} else {
  if (!hasAuthTablesSpread)
    failures.push('schema: defineSchema must spread authTables');
  for (const tableName of Object.keys(TABLE_POLICY)) {
    const assembledAs = assembledTables.get(tableName);
    if (assembledAs === undefined)
      failures.push(`${tableName}: missing from defineSchema assembly`);
    else if (assembledAs !== `${tableName}Table`)
      failures.push(
        `${tableName}: defineSchema must map to ${tableName}Table, found ${assembledAs}`,
      );
    const table = actualTables.get(tableName);
    if (table === undefined) {
      failures.push(`${tableName}: policy table has no implementation`);
      continue;
    }
    const policy: TablePolicy = TABLE_POLICY[tableName as TableName];
    const actualIndexKeys = new Set(
      table.indexes.map(
        (index) =>
          `${index.search ? 'search' : 'index'}:${index.name}:${index.fields.join(',')}`,
      ),
    );
    const policyIndexKeys = new Set(
      policy.indexes.map(
        (index) =>
          `${index.search === true ? 'search' : 'index'}:${index.name}:${index.fields.join(',')}`,
      ),
    );
    for (const key of policyIndexKeys)
      if (!actualIndexKeys.has(key))
        failures.push(`${tableName}: missing or changed ${key}`);
    for (const key of actualIndexKeys)
      if (!policyIndexKeys.has(key))
        failures.push(`${tableName}: unclassified ${key}`);
    for (const field of policy.requiredAt)
      if (!hasField(table, field))
        failures.push(`${tableName}: ${policy.lifecycle} requires ${field}`);
    if (policy.forbidUpdatedAt === true && hasField(table, 'updatedAt'))
      failures.push(`${tableName}: ${policy.lifecycle} forbids updatedAt`);
    if (
      SOFT_DELETE_TABLES.has(tableName as TableName) &&
      !table.spreads.has('softDelete')
    )
      failures.push(`${tableName}: must spread softDelete`);
    if (
      hasField(table, 'legacyKey') &&
      !table.indexes.some((index) => index.name === 'by_legacyKey')
    )
      failures.push(`${tableName}: legacyKey requires by_legacyKey`);
    for (const [field, validator] of table.validators) {
      if (!field.endsWith('At')) continue;
      if (!/^v\.(?:number\(\)|optional\(v\.number\(\)\))$/.test(validator)) {
        failures.push(
          `${tableName}.${field}: timestamp validator must be v.number() or v.optional(v.number())`,
        );
      }
    }
  }
  for (const tableName of actualTables.keys())
    if (!(tableName in TABLE_POLICY))
      failures.push(`${tableName}: table is not classified`);
  for (const tableName of assembledTables.keys())
    if (!(tableName in TABLE_POLICY))
      failures.push(`${tableName}: assembled table is not classified`);
  process.stdout.write(
    `schema: ${actualTables.size} implemented tables checked against policy\n`,
  );
}

if (failures.length > 0) {
  throw new Error(
    `schema invariant verification failed:\n- ${[...new Set(failures)].join('\n- ')}`,
  );
}
