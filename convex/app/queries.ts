import {v} from 'convex/values';

import {query} from '../_generated/server';

export const configValidator = v.object({
  minSupportedIosBuild: v.number(),
  minSupportedAndroidBuild: v.number(),
  latestIosVersion: v.string(),
  latestAndroidVersion: v.string(),
  iosStoreUrl: v.string(),
  androidStoreUrl: v.string(),
  maintenanceMode: v.boolean(),
  maintenanceMessageKey: v.union(v.string(), v.null()),
  legacyClaimEnabled: v.boolean(),
  featureInviteLinks: v.boolean(),
  featureBudgets: v.boolean(),
  featureRecurring: v.boolean(),
  featureCsvImport: v.boolean(),
  featureReceiptOcr: v.boolean(),
  featureMultiCurrencyEntry: v.boolean(),
  updatedAt: v.number(),
});

export const config = query({
  args: {},
  returns: v.union(configValidator, v.null()),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('appConfig')
      .withIndex('by_singleton', (index) => index.eq('singleton', 'CONFIG'))
      .unique();
    if (row === null) return null;
    return {
      minSupportedIosBuild: row.minSupportedIosBuild,
      minSupportedAndroidBuild: row.minSupportedAndroidBuild,
      latestIosVersion: row.latestIosVersion,
      latestAndroidVersion: row.latestAndroidVersion,
      iosStoreUrl: row.iosStoreUrl,
      androidStoreUrl: row.androidStoreUrl,
      maintenanceMode: row.maintenanceMode,
      maintenanceMessageKey: row.maintenanceMessageKey ?? null,
      legacyClaimEnabled: row.legacyClaimEnabled,
      featureInviteLinks: row.featureInviteLinks,
      featureBudgets: row.featureBudgets,
      featureRecurring: row.featureRecurring,
      featureCsvImport: row.featureCsvImport,
      featureReceiptOcr: row.featureReceiptOcr,
      featureMultiCurrencyEntry: row.featureMultiCurrencyEntry,
      updatedAt: row.updatedAt,
    };
  },
});
