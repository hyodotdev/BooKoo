import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

// identity
import {userProfilesTable, userPresenceTable} from './schema/userProfiles';
import {userEmailsTable} from './schema/userEmails';
import {userHandlesTable} from './schema/userHandles';
import {
  appleRefreshTokensTable,
  emailLinkCodesTable,
  authAuditTable,
} from './schema/authSupport';
import {contentReportsTable, userBlocksTable} from './schema/moderation';

// tenancy + access control
import {ledgersTable} from './schema/ledgers';
import {
  ledgerMembersTable,
  ledgerMemberStateTable,
} from './schema/ledgerMembers';
import {
  ledgerInviteRedemptionsTable,
  ledgerInvitesTable,
  ledgerJoinRequestsTable,
} from './schema/ledgerInvites';
import {ledgerAuditLogTable} from './schema/ledgerAuditLog';

// ledger contents
import {ledgerCategoriesTable} from './schema/ledgerCategories';
import {ledgerItemsTable} from './schema/ledgerItems';
import {itemPhotosTable} from './schema/itemPhotos';
import {itemCommentsTable} from './schema/itemComments';
import {clientMutationReceiptsTable} from './schema/clientMutationReceipts';

// derived — never produced by scanning ledgerItems on a read path
import {
  ledgerCategoryMonthRollupsTable,
  ledgerDayRollupsTable,
  ledgerMonthRollupsTable,
} from './schema/rollups';

// platform
import {notificationsTable, pushTokensTable} from './schema/notifications';
import {uploadsTable} from './schema/uploads';
import {feedbackTable} from './schema/feedback';
import {appAnnouncementsTable, appConfigTable} from './schema/appContent';
import {legalEventsTable} from './schema/legalEvents';
import {
  subscribersTable,
  subscriptionEventsTable,
} from './schema/subscriptions';
import {dataExportFilesTable, dataExportsTable} from './schema/dataExports';
import {subscriptionPurchasesTable} from './schema/subscriptionPurchases';

// migration staging — droppable after cutover; the legacy* FIELDS on live tables are permanent
import {
  legacyInvitesTable,
  legacyUsersTable,
  maintenanceJobsTable,
  migrationAnomaliesTable,
  migrationRunsTable,
} from './schema/migration';

export default defineSchema({
  ...authTables,

  // identity
  userProfiles: userProfilesTable,
  userPresence: userPresenceTable,
  userEmails: userEmailsTable,
  userHandles: userHandlesTable,
  appleRefreshTokens: appleRefreshTokensTable,
  emailLinkCodes: emailLinkCodesTable,
  authAudit: authAuditTable,
  contentReports: contentReportsTable,
  userBlocks: userBlocksTable,

  // tenancy + access control
  ledgers: ledgersTable,
  ledgerMembers: ledgerMembersTable,
  ledgerMemberState: ledgerMemberStateTable,
  ledgerInvites: ledgerInvitesTable,
  ledgerInviteRedemptions: ledgerInviteRedemptionsTable,
  ledgerJoinRequests: ledgerJoinRequestsTable,
  ledgerAuditLog: ledgerAuditLogTable,

  // ledger contents
  ledgerCategories: ledgerCategoriesTable,
  ledgerItems: ledgerItemsTable,
  itemPhotos: itemPhotosTable,
  itemComments: itemCommentsTable,
  clientMutationReceipts: clientMutationReceiptsTable,

  // derived
  ledgerDayRollups: ledgerDayRollupsTable,
  ledgerMonthRollups: ledgerMonthRollupsTable,
  ledgerCategoryMonthRollups: ledgerCategoryMonthRollupsTable,

  // platform
  pushTokens: pushTokensTable,
  notifications: notificationsTable,
  uploads: uploadsTable,
  feedback: feedbackTable,
  appConfig: appConfigTable,
  appAnnouncements: appAnnouncementsTable,
  legalEvents: legalEventsTable,
  dataExports: dataExportsTable,
  dataExportFiles: dataExportFilesTable,
  subscribers: subscribersTable,
  subscriptionPurchases: subscriptionPurchasesTable,
  subscriptionEvents: subscriptionEventsTable,

  // migration staging
  legacyUsers: legacyUsersTable,
  legacyInvites: legacyInvitesTable,
  migrationRuns: migrationRunsTable,
  migrationAnomalies: migrationAnomaliesTable,
  maintenanceJobs: maintenanceJobsTable,
});
