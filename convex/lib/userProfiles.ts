import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';
import {normalizeEmail} from '../../shared/email';
import {generatedDisplayName, validateDisplayName} from '../../shared/profile';
import {appError} from './errors';

/**
 * Resolve an avatar blob to the URL a profile may publish, refusing one the
 * caller does not own or did not upload as an avatar.
 *
 * `convex/schema/uploads.ts` states why this cannot be skipped: Convex records
 * no uploader on `_storage` metadata, so a mutation handed a storage id cannot
 * tell a member's own blob from one they guessed, and ownership is recorded in
 * `uploads` instead. A storage URL carries no auth and no expiry, and
 * `userProfiles.avatarUrl` is published by `publicProfileByHandle` — which
 * gates on nothing — and by the invite preview.
 *
 * Without the `purpose` half, any blob the caller uploaded qualifies, receipts
 * included: naming a receipt's storage id here would publish a ledger's
 * financial document to a permanent, unauthenticated URL that leaving the
 * ledger does not revoke.
 *
 * This lives here because the check existed on `updateProfile` and was missing
 * from `completeProfileStep` — the drift was the defect.
 */
export async function ownedAvatarUrl(
  ctx: MutationCtx,
  userId: Id<'users'>,
  storageId: Id<'_storage'>,
): Promise<string> {
  const upload = await ctx.db
    .query('uploads')
    .withIndex('by_storageId', (index) => index.eq('storageId', storageId))
    .unique();
  if (
    upload === null ||
    upload.userId !== userId ||
    upload.purpose !== 'AVATAR'
  )
    throw appError('UPLOAD_INVALID', 'error.upload.notOwned');
  const url = await ctx.storage.getUrl(storageId);
  if (url === null) throw appError('UPLOAD_INVALID', 'error.upload.invalid');
  return url;
}

export function newUserProfileDefaults(
  userId: Id<'users'>,
  user: Doc<'users'> | null,
  now: number,
): Omit<Doc<'userProfiles'>, '_id' | '_creationTime'> {
  const verifiedEmail =
    user?.emailVerificationTime === undefined
      ? undefined
      : normalizeEmail(user.email);
  const providerName = validateDisplayName(user?.name ?? '');
  const displayName =
    providerName.ok && providerName.value.length > 0
      ? providerName.value
      : generatedDisplayName(userId);
  return {
    userId,
    ...(verifiedEmail === undefined ? {} : {emailNormalized: verifiedEmail}),
    displayName,
    bio: '',
    phone: '',
    ...(user?.image === undefined ? {} : {avatarUrl: user.image}),
    locale: 'en',
    appearance: 'SYSTEM',
    preferredCurrency: 'USD',
    preferredTimeZone: 'UTC',
    preferredWeekStartsOn: 0,
    pushEnabled: true,
    notifyLedgerActivity: true,
    notifyComments: true,
    notifyInvites: true,
    appRole: 'USER',
    onboardingStep: 'handle',
    legacyClaimState: 'none',
    isPlaceholder: false,
    avatarMigrationState: 'NATIVE',
    avatarAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}
