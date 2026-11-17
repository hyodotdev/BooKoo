import {v} from 'convex/values';

import {mutation} from '../lib/functions';
import {appError} from '../lib/errors';
import {requireAppAdmin} from '../lib/permissions';

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const requireStoreUrl = (value: string, host: string): void => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== host)
      throw appError('INVALID_INPUT', 'error.invalidInput');
  } catch {
    throw appError('INVALID_INPUT', 'error.invalidInput');
  }
};

const compareVersion = (left: string, right: string): number => {
  const a = left.split('-', 1)[0]!.split('.').map(Number);
  const b = right.split('-', 1)[0]!.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export const upsertConfig = mutation({
  args: {
    minSupportedIosBuild: v.number(),
    minSupportedAndroidBuild: v.number(),
    latestIosVersion: v.string(),
    latestAndroidVersion: v.string(),
    iosStoreUrl: v.string(),
    androidStoreUrl: v.string(),
    maintenanceMode: v.boolean(),
    maintenanceMessageKey: v.optional(v.string()),
    legacyClaimEnabled: v.boolean(),
    featureInviteLinks: v.boolean(),
    featureBudgets: v.boolean(),
    featureRecurring: v.boolean(),
    featureCsvImport: v.boolean(),
    featureReceiptOcr: v.boolean(),
    featureMultiCurrencyEntry: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const admin = await requireAppAdmin(ctx);
    if (
      !Number.isSafeInteger(args.minSupportedIosBuild) ||
      !Number.isSafeInteger(args.minSupportedAndroidBuild) ||
      args.minSupportedIosBuild < 1 ||
      args.minSupportedAndroidBuild < 1 ||
      !semver.test(args.latestIosVersion) ||
      !semver.test(args.latestAndroidVersion) ||
      (args.maintenanceMessageKey !== undefined &&
        args.maintenanceMessageKey !== 'maintenance.default')
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    requireStoreUrl(args.iosStoreUrl, 'apps.apple.com');
    requireStoreUrl(args.androidStoreUrl, 'play.google.com');
    const existing = await ctx.db
      .query('appConfig')
      .withIndex('by_singleton', (index) => index.eq('singleton', 'CONFIG'))
      .unique();
    if (
      existing !== null &&
      (compareVersion(args.latestIosVersion, existing.latestIosVersion) < 0 ||
        compareVersion(args.latestAndroidVersion, existing.latestAndroidVersion) < 0)
    )
      throw appError('INVALID_INPUT', 'error.invalidInput');
    const value = {...args, singleton: 'CONFIG' as const, updatedAt: Date.now(), updatedByUserId: admin.userId};
    if (existing === null) await ctx.db.insert('appConfig', value);
    else await ctx.db.replace(existing._id, value);
    return null;
  },
});
