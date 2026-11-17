import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';

export async function requireDeletingProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'>> {
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (index) => index.eq('userId', userId))
    .unique();
  if (
    profile === null ||
    profile.deletedAt === undefined ||
    profile.purgedAt !== undefined
  )
    throw new Error('Account deletion source invalid');
  return profile;
}

export async function getDueDeletingProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  now: number,
): Promise<Doc<'userProfiles'> | null> {
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_userId', (index) => index.eq('userId', userId))
    .unique();
  if (
    profile === null ||
    profile.deletedAt === undefined ||
    profile.purgedAt !== undefined ||
    profile.purgeAfter === undefined ||
    profile.purgeAfter > now
  )
    return null;
  return profile;
}
