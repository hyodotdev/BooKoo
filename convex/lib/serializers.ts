import {v} from 'convex/values';

import type {Doc, Id} from '../_generated/dataModel';
import {ledgerRoleValidator, type LedgerRole} from '../schema/ledgerMembers';
import {
  invitePolicyValidator,
  itemWritePolicyValidator,
  ledgerColorValidator,
  ledgerMaintenanceLockValidator,
} from '../schema/ledgers';
import {ledgerItemTypeValidator} from '../schema/ledgerItems';

export const ledgerRowValidator = v.object({
  id: v.id('ledgers'),
  title: v.string(),
  description: v.string(),
  colorKey: ledgerColorValidator,
  emoji: v.union(v.string(), v.null()),
  iconKey: v.union(v.string(), v.null()),
  ownerId: v.id('users'),
  role: ledgerRoleValidator,
  baseCurrency: v.string(),
  currencyIsAssumed: v.boolean(),
  timeZone: v.string(),
  timeZoneIsAssumed: v.boolean(),
  weekStartsOn: v.number(),
  periodStartDay: v.number(),
  itemWritePolicy: itemWritePolicyValidator,
  invitePolicy: invitePolicyValidator,
  memberCount: v.number(),
  archivedAt: v.union(v.number(), v.null()),
  maintenanceLock: ledgerMaintenanceLockValidator,
  rollupVersion: v.number(),
  lastReadAt: v.union(v.number(), v.null()),
  lastOpenedAt: v.union(v.number(), v.null()),
  muted: v.boolean(),
  notifyNewItem: v.boolean(),
  notifyComment: v.boolean(),
  pinnedAt: v.union(v.number(), v.null()),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export interface LedgerRow {
  readonly id: Id<'ledgers'>;
  readonly title: string;
  readonly description: string;
  readonly colorKey: Doc<'ledgers'>['colorKey'];
  readonly emoji: string | null;
  readonly iconKey: string | null;
  readonly ownerId: Id<'users'>;
  readonly role: LedgerRole;
  readonly baseCurrency: string;
  readonly currencyIsAssumed: boolean;
  readonly timeZone: string;
  readonly timeZoneIsAssumed: boolean;
  readonly weekStartsOn: number;
  readonly periodStartDay: number;
  readonly itemWritePolicy: Doc<'ledgers'>['itemWritePolicy'];
  readonly invitePolicy: Doc<'ledgers'>['invitePolicy'];
  readonly memberCount: number;
  readonly archivedAt: number | null;
  readonly maintenanceLock: Doc<'ledgers'>['maintenanceLock'];
  readonly rollupVersion: number;
  readonly lastReadAt: number | null;
  readonly lastOpenedAt: number | null;
  readonly muted: boolean;
  readonly notifyNewItem: boolean;
  readonly notifyComment: boolean;
  readonly pinnedAt: number | null;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const toLedgerRow = (
  ledger: Doc<'ledgers'>,
  membership: Doc<'ledgerMembers'>,
  state: Doc<'ledgerMemberState'> | null,
): LedgerRow => ({
  id: ledger._id,
  title: ledger.title,
  description: ledger.description,
  colorKey: ledger.colorKey,
  emoji: ledger.emoji ?? null,
  iconKey: ledger.iconKey ?? null,
  ownerId: ledger.ownerId,
  role: membership.role,
  baseCurrency: ledger.baseCurrency,
  currencyIsAssumed: ledger.currencyIsAssumed,
  timeZone: ledger.timeZone,
  timeZoneIsAssumed: ledger.timeZoneIsAssumed,
  weekStartsOn: ledger.weekStartsOn,
  periodStartDay: ledger.periodStartDay,
  itemWritePolicy: ledger.itemWritePolicy,
  invitePolicy: ledger.invitePolicy,
  memberCount: ledger.memberCount,
  archivedAt: ledger.archivedAt ?? null,
  maintenanceLock: ledger.maintenanceLock,
  rollupVersion: ledger.rollupVersion,
  lastReadAt: state?.lastReadAt ?? null,
  lastOpenedAt: state?.lastOpenedAt ?? null,
  muted: state?.muted ?? false,
  notifyNewItem: state?.notifyNewItem ?? true,
  notifyComment: state?.notifyComment ?? true,
  pinnedAt: state?.pinnedAt ?? null,
  sortOrder: state?.sortOrder ?? 0,
  createdAt: ledger.createdAt,
  updatedAt: ledger.updatedAt,
});

export const placeValidator = v.object({
  label: v.string(),
  lat: v.number(),
  lng: v.number(),
  address: v.optional(v.string()),
  countryCode: v.optional(v.string()),
});

export const itemRowValidator = v.object({
  id: v.id('ledgerItems'),
  ledgerId: v.id('ledgers'),
  type: ledgerItemTypeValidator,
  amountMinor: v.number(),
  currency: v.string(),
  baseCurrency: v.string(),
  baseAmountMinor: v.number(),
  occurredAt: v.number(),
  dayKey: v.number(),
  monthKey: v.number(),
  occurredOffsetMinutes: v.number(),
  categoryKey: v.string(),
  authorId: v.id('users'),
  paidByUserId: v.union(v.id('users'), v.null()),
  memo: v.string(),
  place: v.union(placeValidator, v.null()),
  photoCount: v.number(),
  coverPhotoId: v.union(v.id('itemPhotos'), v.null()),
  commentCount: v.number(),
  updatedByUserId: v.union(v.id('users'), v.null()),
  needsReview: v.boolean(),
  deletedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export interface ItemRow {
  readonly id: Id<'ledgerItems'>;
  readonly ledgerId: Id<'ledgers'>;
  readonly type: Doc<'ledgerItems'>['type'];
  readonly amountMinor: number;
  readonly currency: string;
  readonly baseCurrency: string;
  readonly baseAmountMinor: number;
  readonly occurredAt: number;
  readonly dayKey: number;
  readonly monthKey: number;
  readonly occurredOffsetMinutes: number;
  readonly categoryKey: string;
  readonly authorId: Id<'users'>;
  readonly paidByUserId: Id<'users'> | null;
  readonly memo: string;
  readonly place: NonNullable<Doc<'ledgerItems'>['place']> | null;
  readonly photoCount: number;
  readonly coverPhotoId: Id<'itemPhotos'> | null;
  readonly commentCount: number;
  readonly updatedByUserId: Id<'users'> | null;
  readonly needsReview: boolean;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const toItemRow = (item: Doc<'ledgerItems'>): ItemRow => ({
  id: item._id,
  ledgerId: item.ledgerId,
  type: item.type,
  amountMinor: item.amountMinor,
  currency: item.currency,
  baseCurrency: item.baseCurrency,
  baseAmountMinor: item.baseAmountMinor,
  occurredAt: item.occurredAt,
  dayKey: item.dayKey,
  monthKey: item.monthKey,
  occurredOffsetMinutes: item.occurredOffsetMinutes,
  categoryKey: item.categoryKey,
  authorId: item.authorId,
  paidByUserId: item.paidByUserId ?? null,
  memo: item.memo,
  place: item.place ?? null,
  photoCount: item.photoCount,
  coverPhotoId: item.coverPhotoId ?? null,
  commentCount: item.commentCount,
  updatedByUserId: item.updatedByUserId ?? null,
  needsReview: item.needsReview ?? false,
  deletedAt: item.deletedAt ?? null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const publicMemberValidator = v.object({
  userId: v.id('users'),
  handle: v.union(v.string(), v.null()),
  displayName: v.string(),
  avatarThumbUrl: v.union(v.string(), v.null()),
  role: ledgerRoleValidator,
  isPlaceholder: v.boolean(),
  blockedRelationship: v.boolean(),
  joinedAt: v.number(),
});

export interface PublicMember {
  readonly userId: Id<'users'>;
  readonly handle: string | null;
  readonly displayName: string;
  readonly avatarThumbUrl: string | null;
  readonly role: LedgerRole;
  readonly isPlaceholder: boolean;
  readonly blockedRelationship: boolean;
  readonly joinedAt: number;
}

export const toPublicMember = (
  profile: Doc<'userProfiles'> | null,
  membership: Doc<'ledgerMembers'>,
  blockedRelationship: boolean,
): PublicMember => ({
  userId: membership.userId,
  handle: profile?.handle ?? null,
  displayName: profile?.displayName ?? '',
  avatarThumbUrl:
    profile?.avatarThumbUrl ??
    profile?.avatarUrl ??
    profile?.avatarLegacyUrl ??
    null,
  role: membership.role,
  isPlaceholder: profile?.isPlaceholder ?? true,
  blockedRelationship,
  joinedAt: membership.joinedAt,
});
