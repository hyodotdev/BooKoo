import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {softDelete, timestamps} from './common';
import {localeValidator} from './userProfiles';

/**
 * SINGLETON. `singleton` is a literal, so `by_singleton` is a 1-document read that Convex's
 * per-(query, args) cache serves to the ENTIRE user base from one entry (`13` §4.3 rule 4).
 *
 * Explicit typed fields, never a `valueJson: v.string()` key/value table: a parsed string with an
 * asserted type is `v.any()` with extra steps, in a schema whose rule is that `v.any()` is banned.
 * Adding a flag is a one-line schema change.
 */
export const appConfigTable = defineTable({
  singleton: v.literal('CONFIG'),

  minSupportedIosBuild: v.number(),
  minSupportedAndroidBuild: v.number(),
  latestIosVersion: v.string(),
  latestAndroidVersion: v.string(),
  iosStoreUrl: v.string(),
  androidStoreUrl: v.string(),

  maintenanceMode: v.boolean(),
  maintenanceMessageKey: v.optional(v.string()),

  /** Kill switch for the legacy claim flow, so a bad claim can be stopped without a deploy. */
  legacyClaimEnabled: v.boolean(),
  featureInviteLinks: v.boolean(),
  featureBudgets: v.boolean(),
  featureRecurring: v.boolean(),
  featureCsvImport: v.boolean(),
  featureReceiptOcr: v.boolean(),
  featureMultiCurrencyEntry: v.boolean(),

  updatedAt: v.number(),
  updatedByUserId: v.optional(v.id('users')),
})
  // Boot-time force-update / maintenance gate + the feature-flag read. ONE document, one cache entry.
  .index('by_singleton', ['singleton']);

// `app.config` is the public boot projection and omits updatedByUserId. D6's BootGate enforces only a
// live result in this order: maintenance -> below-minimum native build -> normal app. Native values come
// from expo-application; ADMIN writes validate strict SemVer, five-locale keys and canonical HTTPS stores.

export const announcementKindValidator = v.union(
  v.literal('NOTICE'),
  v.literal('FAQ'),
);

/**
 * Legacy shipped 9 announcements and 11 FAQs as HARDCODED i18n keys inside an 87 KB STRINGS.js, so
 * publishing a notice or fixing a typo required an App Store release.
 *
 * `translations` is an ARRAY OF TYPED OBJECTS bounded at 5, not `v.record(v.string(), v.string())`:
 * a record accepts any string key, so a typo'd locale is a silent runtime miss, while the array form
 * is compiler-checked and adding a locale is still a data change.
 */
export const appAnnouncementsTable = defineTable({
  kind: announcementKindValidator,
  /** Stable slug, e.g. 'v3-launch'. Idempotent seeding + the admin editor's upsert. */
  key: v.string(),
  translations: v.array(
    v.object({
      locale: localeValidator,
      /** NOTICE: the headline. FAQ: the question. */
      title: v.string(),
      /** NOTICE: the body. FAQ: the answer. */
      body: v.string(),
    }),
  ),
  sortOrder: v.number(),
  pinned: v.boolean(),
  publishedAt: v.optional(v.number()), // undefined = draft
  expiresAt: v.optional(v.number()),
  /** Audit ownership for the ADMIN-only authoring surface. Optional only for migrated seed rows. */
  createdByUserId: v.optional(v.id('users')),
  updatedByUserId: v.optional(v.id('users')),
  /** e.g. 'ANNOUNCEMENT_TXT_6' — provenance for the STRINGS.js converter. */
  legacyStringKey: v.optional(v.string()),
  ...timestamps,
  ...softDelete,
})
  // Settings -> Announcements / FAQ accordion. Indexed cursor pagination only.
  .index('by_kind_deletedAt_sortOrder', ['kind', 'deletedAt', 'sortOrder'])
  // "Is there anything new since I last looked" + the publish/unpublish admin path.
  .index('by_kind_publishedAt', ['kind', 'publishedAt'])
  .index('by_key', ['key']);
