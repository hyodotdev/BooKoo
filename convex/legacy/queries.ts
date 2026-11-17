import {v} from 'convex/values';

import {query} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {LEGACY_CANDIDATE_LIMIT, USER_EMAIL_LIMIT} from '../lib/constants';
import {appError} from '../lib/errors';
import {requireActiveProfile} from '../lib/permissions';

export const myLegacyCandidates = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('legacyUsers'),
      displayName: v.union(v.string(), v.null()),
      providers: v.array(v.string()),
      createdMonth: v.string(),
      ledgerCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireActiveProfile(ctx);
    const emailRows = await ctx.db
      .query('userEmails')
      .withIndex('by_userId_deletedAt', (query) =>
        query.eq('userId', profile.userId).eq('deletedAt', undefined),
      )
      .take(USER_EMAIL_LIMIT + 1);
    if (emailRows.length > USER_EMAIL_LIMIT)
      throw appError('LINK_AMBIGUOUS', 'error.link.duplicate');

    const output: {
      id: Id<'legacyUsers'>;
      displayName: string | null;
      providers: string[];
      createdMonth: string;
      ledgerCount: number;
    }[] = [];
    for (const email of emailRows) {
      const candidates = await ctx.db
        .query('legacyUsers')
        .withIndex('by_emailNormalized_claimState', (query) =>
          query
            .eq('emailNormalized', email.emailNormalized)
            .eq('claimState', 'ambiguous'),
        )
        .take(LEGACY_CANDIDATE_LIMIT + 1);
      for (const candidate of candidates) {
        if (output.some((row) => row.id === candidate._id)) continue;
        output.push({
          id: candidate._id,
          displayName: candidate.displayName ?? null,
          providers: candidate.providers,
          createdMonth: new Date(candidate.legacyCreatedAt)
            .toISOString()
            .slice(0, 7),
          ledgerCount: candidate.legacyLedgerKeys.length,
        });
        if (output.length >= LEGACY_CANDIDATE_LIMIT) return output;
      }
    }
    return output;
  },
});
