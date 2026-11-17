/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as app_mutations from "../app/mutations.js";
import type * as app_queries from "../app/queries.js";
import type * as appleWeb from "../appleWeb.js";
import type * as audit_queries from "../audit/queries.js";
import type * as auth from "../auth.js";
import type * as blocks_mutations from "../blocks/mutations.js";
import type * as blocks_queries from "../blocks/queries.js";
import type * as budgets from "../budgets.js";
import type * as categories_internal from "../categories/internal.js";
import type * as categories_mutations from "../categories/mutations.js";
import type * as categories_queries from "../categories/queries.js";
import type * as comments_mutations from "../comments/mutations.js";
import type * as comments_queries from "../comments/queries.js";
import type * as content_defaults from "../content/defaults.js";
import type * as content_mutations from "../content/mutations.js";
import type * as content_queries from "../content/queries.js";
import type * as content_seeds from "../content/seeds.js";
import type * as crons from "../crons.js";
import type * as exports_actions from "../exports/actions.js";
import type * as exports_http from "../exports/http.js";
import type * as exports_internal from "../exports/internal.js";
import type * as exports_mutations from "../exports/mutations.js";
import type * as exports_queries from "../exports/queries.js";
import type * as exports_worker from "../exports/worker.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as files_mutations from "../files/mutations.js";
import type * as http from "../http.js";
import type * as invites_availability from "../invites/availability.js";
import type * as invites_mutations from "../invites/mutations.js";
import type * as invites_queries from "../invites/queries.js";
import type * as items_mutations from "../items/mutations.js";
import type * as items_queries from "../items/queries.js";
import type * as joinRequests_mutations from "../joinRequests/mutations.js";
import type * as joinRequests_queries from "../joinRequests/queries.js";
import type * as ledgers_currencyInternal from "../ledgers/currencyInternal.js";
import type * as ledgers_internal from "../ledgers/internal.js";
import type * as ledgers_mutations from "../ledgers/mutations.js";
import type * as ledgers_queries from "../ledgers/queries.js";
import type * as legacy_internal from "../legacy/internal.js";
import type * as legacy_mutations from "../legacy/mutations.js";
import type * as legacy_queries from "../legacy/queries.js";
import type * as lib_appleTokens from "../lib/appleTokens.js";
import type * as lib_blocks from "../lib/blocks.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_categoryMutations from "../lib/categoryMutations.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_deletionPermissions from "../lib/deletionPermissions.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_exportPermissions from "../lib/exportPermissions.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_iapkit from "../lib/iapkit.js";
import type * as lib_idToken from "../lib/idToken.js";
import type * as lib_kakaoIdentity from "../lib/kakaoIdentity.js";
import type * as lib_ledgerPermissions from "../lib/ledgerPermissions.js";
import type * as lib_maintenancePermissions from "../lib/maintenancePermissions.js";
import type * as lib_naverIdentity from "../lib/naverIdentity.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_pushPermissions from "../lib/pushPermissions.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_requestHash from "../lib/requestHash.js";
import type * as lib_rollups from "../lib/rollups.js";
import type * as lib_serializers from "../lib/serializers.js";
import type * as lib_subscriptionEnvironment from "../lib/subscriptionEnvironment.js";
import type * as lib_subscriptionProjection from "../lib/subscriptionProjection.js";
import type * as lib_userEmails from "../lib/userEmails.js";
import type * as lib_userProfiles from "../lib/userProfiles.js";
import type * as maintenance_purge from "../maintenance/purge.js";
import type * as maintenance_retention from "../maintenance/retention.js";
import type * as memberState_mutations from "../memberState/mutations.js";
import type * as members_mutations from "../members/mutations.js";
import type * as migrate_files from "../migrate/files.js";
import type * as migrate_import from "../migrate/import.js";
import type * as migrate_rescue from "../migrate/rescue.js";
import type * as migrate_rollback from "../migrate/rollback.js";
import type * as migrate_rollups from "../migrate/rollups.js";
import type * as migrate_verify from "../migrate/verify.js";
import type * as notifications_actions from "../notifications/actions.js";
import type * as notifications_internal from "../notifications/internal.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as otp_ResendOTP from "../otp/ResendOTP.js";
import type * as otp_emailTemplates from "../otp/emailTemplates.js";
import type * as otp_fixedOtp from "../otp/fixedOtp.js";
import type * as otp_fixedOtpPolicy from "../otp/fixedOtpPolicy.js";
import type * as otp_limits from "../otp/limits.js";
import type * as otp_resendClient from "../otp/resendClient.js";
import type * as photos_http from "../photos/http.js";
import type * as photos_internal from "../photos/internal.js";
import type * as photos_mutations from "../photos/mutations.js";
import type * as photos_queries from "../photos/queries.js";
import type * as reports_mutations from "../reports/mutations.js";
import type * as reports_queries from "../reports/queries.js";
import type * as rollups_internal from "../rollups/internal.js";
import type * as rollups_queries from "../rollups/queries.js";
import type * as schema_appContent from "../schema/appContent.js";
import type * as schema_authSupport from "../schema/authSupport.js";
import type * as schema_clientMutationReceipts from "../schema/clientMutationReceipts.js";
import type * as schema_common from "../schema/common.js";
import type * as schema_dataExports from "../schema/dataExports.js";
import type * as schema_feedback from "../schema/feedback.js";
import type * as schema_itemComments from "../schema/itemComments.js";
import type * as schema_itemPhotos from "../schema/itemPhotos.js";
import type * as schema_ledgerAuditLog from "../schema/ledgerAuditLog.js";
import type * as schema_ledgerCategories from "../schema/ledgerCategories.js";
import type * as schema_ledgerInvites from "../schema/ledgerInvites.js";
import type * as schema_ledgerItems from "../schema/ledgerItems.js";
import type * as schema_ledgerMembers from "../schema/ledgerMembers.js";
import type * as schema_ledgers from "../schema/ledgers.js";
import type * as schema_legalEvents from "../schema/legalEvents.js";
import type * as schema_migration from "../schema/migration.js";
import type * as schema_moderation from "../schema/moderation.js";
import type * as schema_notifications from "../schema/notifications.js";
import type * as schema_rollups from "../schema/rollups.js";
import type * as schema_subscriptionPurchases from "../schema/subscriptionPurchases.js";
import type * as schema_subscriptions from "../schema/subscriptions.js";
import type * as schema_uploads from "../schema/uploads.js";
import type * as schema_userEmails from "../schema/userEmails.js";
import type * as schema_userHandles from "../schema/userHandles.js";
import type * as schema_userProfiles from "../schema/userProfiles.js";
import type * as seeds from "../seeds.js";
import type * as subscriptions_actions from "../subscriptions/actions.js";
import type * as subscriptions_erasure from "../subscriptions/erasure.js";
import type * as subscriptions_http from "../subscriptions/http.js";
import type * as subscriptions_internal from "../subscriptions/internal.js";
import type * as subscriptions_internalQueries from "../subscriptions/internalQueries.js";
import type * as subscriptions_queries from "../subscriptions/queries.js";
import type * as user_actions from "../user/actions.js";
import type * as user_deletion from "../user/deletion.js";
import type * as user_mutations from "../user/mutations.js";
import type * as user_queries from "../user/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "app/mutations": typeof app_mutations;
  "app/queries": typeof app_queries;
  appleWeb: typeof appleWeb;
  "audit/queries": typeof audit_queries;
  auth: typeof auth;
  "blocks/mutations": typeof blocks_mutations;
  "blocks/queries": typeof blocks_queries;
  budgets: typeof budgets;
  "categories/internal": typeof categories_internal;
  "categories/mutations": typeof categories_mutations;
  "categories/queries": typeof categories_queries;
  "comments/mutations": typeof comments_mutations;
  "comments/queries": typeof comments_queries;
  "content/defaults": typeof content_defaults;
  "content/mutations": typeof content_mutations;
  "content/queries": typeof content_queries;
  "content/seeds": typeof content_seeds;
  crons: typeof crons;
  "exports/actions": typeof exports_actions;
  "exports/http": typeof exports_http;
  "exports/internal": typeof exports_internal;
  "exports/mutations": typeof exports_mutations;
  "exports/queries": typeof exports_queries;
  "exports/worker": typeof exports_worker;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/queries": typeof feedback_queries;
  "files/mutations": typeof files_mutations;
  http: typeof http;
  "invites/availability": typeof invites_availability;
  "invites/mutations": typeof invites_mutations;
  "invites/queries": typeof invites_queries;
  "items/mutations": typeof items_mutations;
  "items/queries": typeof items_queries;
  "joinRequests/mutations": typeof joinRequests_mutations;
  "joinRequests/queries": typeof joinRequests_queries;
  "ledgers/currencyInternal": typeof ledgers_currencyInternal;
  "ledgers/internal": typeof ledgers_internal;
  "ledgers/mutations": typeof ledgers_mutations;
  "ledgers/queries": typeof ledgers_queries;
  "legacy/internal": typeof legacy_internal;
  "legacy/mutations": typeof legacy_mutations;
  "legacy/queries": typeof legacy_queries;
  "lib/appleTokens": typeof lib_appleTokens;
  "lib/blocks": typeof lib_blocks;
  "lib/categories": typeof lib_categories;
  "lib/categoryMutations": typeof lib_categoryMutations;
  "lib/constants": typeof lib_constants;
  "lib/deletionPermissions": typeof lib_deletionPermissions;
  "lib/entitlements": typeof lib_entitlements;
  "lib/errors": typeof lib_errors;
  "lib/exportPermissions": typeof lib_exportPermissions;
  "lib/functions": typeof lib_functions;
  "lib/iapkit": typeof lib_iapkit;
  "lib/idToken": typeof lib_idToken;
  "lib/kakaoIdentity": typeof lib_kakaoIdentity;
  "lib/ledgerPermissions": typeof lib_ledgerPermissions;
  "lib/maintenancePermissions": typeof lib_maintenancePermissions;
  "lib/naverIdentity": typeof lib_naverIdentity;
  "lib/notifications": typeof lib_notifications;
  "lib/permissions": typeof lib_permissions;
  "lib/pushPermissions": typeof lib_pushPermissions;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/requestHash": typeof lib_requestHash;
  "lib/rollups": typeof lib_rollups;
  "lib/serializers": typeof lib_serializers;
  "lib/subscriptionEnvironment": typeof lib_subscriptionEnvironment;
  "lib/subscriptionProjection": typeof lib_subscriptionProjection;
  "lib/userEmails": typeof lib_userEmails;
  "lib/userProfiles": typeof lib_userProfiles;
  "maintenance/purge": typeof maintenance_purge;
  "maintenance/retention": typeof maintenance_retention;
  "memberState/mutations": typeof memberState_mutations;
  "members/mutations": typeof members_mutations;
  "migrate/files": typeof migrate_files;
  "migrate/import": typeof migrate_import;
  "migrate/rescue": typeof migrate_rescue;
  "migrate/rollback": typeof migrate_rollback;
  "migrate/rollups": typeof migrate_rollups;
  "migrate/verify": typeof migrate_verify;
  "notifications/actions": typeof notifications_actions;
  "notifications/internal": typeof notifications_internal;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "otp/ResendOTP": typeof otp_ResendOTP;
  "otp/emailTemplates": typeof otp_emailTemplates;
  "otp/fixedOtp": typeof otp_fixedOtp;
  "otp/fixedOtpPolicy": typeof otp_fixedOtpPolicy;
  "otp/limits": typeof otp_limits;
  "otp/resendClient": typeof otp_resendClient;
  "photos/http": typeof photos_http;
  "photos/internal": typeof photos_internal;
  "photos/mutations": typeof photos_mutations;
  "photos/queries": typeof photos_queries;
  "reports/mutations": typeof reports_mutations;
  "reports/queries": typeof reports_queries;
  "rollups/internal": typeof rollups_internal;
  "rollups/queries": typeof rollups_queries;
  "schema/appContent": typeof schema_appContent;
  "schema/authSupport": typeof schema_authSupport;
  "schema/clientMutationReceipts": typeof schema_clientMutationReceipts;
  "schema/common": typeof schema_common;
  "schema/dataExports": typeof schema_dataExports;
  "schema/feedback": typeof schema_feedback;
  "schema/itemComments": typeof schema_itemComments;
  "schema/itemPhotos": typeof schema_itemPhotos;
  "schema/ledgerAuditLog": typeof schema_ledgerAuditLog;
  "schema/ledgerCategories": typeof schema_ledgerCategories;
  "schema/ledgerInvites": typeof schema_ledgerInvites;
  "schema/ledgerItems": typeof schema_ledgerItems;
  "schema/ledgerMembers": typeof schema_ledgerMembers;
  "schema/ledgers": typeof schema_ledgers;
  "schema/legalEvents": typeof schema_legalEvents;
  "schema/migration": typeof schema_migration;
  "schema/moderation": typeof schema_moderation;
  "schema/notifications": typeof schema_notifications;
  "schema/rollups": typeof schema_rollups;
  "schema/subscriptionPurchases": typeof schema_subscriptionPurchases;
  "schema/subscriptions": typeof schema_subscriptions;
  "schema/uploads": typeof schema_uploads;
  "schema/userEmails": typeof schema_userEmails;
  "schema/userHandles": typeof schema_userHandles;
  "schema/userProfiles": typeof schema_userProfiles;
  seeds: typeof seeds;
  "subscriptions/actions": typeof subscriptions_actions;
  "subscriptions/erasure": typeof subscriptions_erasure;
  "subscriptions/http": typeof subscriptions_http;
  "subscriptions/internal": typeof subscriptions_internal;
  "subscriptions/internalQueries": typeof subscriptions_internalQueries;
  "subscriptions/queries": typeof subscriptions_queries;
  "user/actions": typeof user_actions;
  "user/deletion": typeof user_deletion;
  "user/mutations": typeof user_mutations;
  "user/queries": typeof user_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  blobImport: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"blobImport">;
};
