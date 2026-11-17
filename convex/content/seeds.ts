import {v} from 'convex/values';

import {internalMutation} from '../lib/functions';
import {DEFAULT_APP_CONTENT} from './defaults';

export const seedDefault = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    existing: v.number(),
    reconciled: v.number(),
  }),
  handler: async (ctx) => {
    let inserted = 0;
    let existing = 0;
    let reconciled = 0;
    const now = Date.now();

    for (const item of DEFAULT_APP_CONTENT) {
      const found = await ctx.db
        .query('appAnnouncements')
        .withIndex('by_key', (index) => index.eq('key', item.key))
        .unique();
      if (found !== null) {
        if (item.key === 'faq-old-app' && found.legacyStringKey === 'FAQ_10') {
          await ctx.db.patch(found._id, {
            legacyStringKey: undefined,
            updatedAt: now,
          });
          reconciled += 1;
        }
        existing += 1;
        continue;
      }
      await ctx.db.insert('appAnnouncements', {
        kind: item.kind,
        key: item.key,
        translations: [...item.translations],
        sortOrder: item.sortOrder,
        pinned: item.pinned,
        publishedAt: item.publishedAt,
        ...('legacyStringKey' in item
          ? {legacyStringKey: item.legacyStringKey}
          : {}),
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }

    return {inserted, existing, reconciled};
  },
});

/**
 * Repoint the launch announcements at the repositioned copy.
 *
 * `seedDefault` deliberately skips rows that already exist, so editing
 * `defaults.ts` does nothing for a deployment that has already been seeded —
 * production kept describing BooKoo as a ledger for 가족·연인·친구 long after
 * every store listing had moved to teams, clubs and trips.
 *
 * This patches only the three keys that carried that framing, and only while
 * their stored text still contains one of the launch markers below. An
 * announcement rewritten since launch no longer matches, so it is left alone
 * rather than clobbered — the reason `seedDefault` skips in the first place.
 *
 * The guard is deliberately coarse: ONE marker in ANY locale replaces ALL FIVE
 * locales of that key. That is right for the launch rows, which were seeded as
 * a set and have never been edited, and it is why this is a one-shot repair
 * rather than a general reconciler. Two consequences worth knowing before
 * reaching for it again: an edit that legitimately uses one of these words
 * would be overwritten, and a partial rewrite would lose the edited locales.
 * Once this has run the markers are gone, so a later change to `defaults.ts`
 * still will not reach a seeded deployment — use the admin `upsert`.
 */
export const REPOSITIONED_KEYS = [
  'welcome-to-new-bookoo',
  'free-and-pro-launch',
  'faq-free-and-pro',
] as const;

/** Launch wording, one marker per locale. Absent once an admin has edited. */
export const LAUNCH_MARKERS = [
  'household',
  '가족·연인·친구',
  '가구 단위로',
  '공유 가구',
  '家族・パートナー・友人',
  '世帯',
  '家人、伴侣和朋友',
  '整个家庭',
  '共享家庭',
  'rumah tangga',
];

export const repositionLaunchCopy = internalMutation({
  args: {},
  returns: v.object({
    patched: v.array(v.string()),
    skipped: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const patched: string[] = [];
    const skipped: string[] = [];
    const missing: string[] = [];
    const now = Date.now();

    for (const key of REPOSITIONED_KEYS) {
      const item = DEFAULT_APP_CONTENT.find((entry) => entry.key === key);
      const found = await ctx.db
        .query('appAnnouncements')
        .withIndex('by_key', (index) => index.eq('key', key))
        .unique();
      if (item === undefined || found === null) {
        missing.push(key);
        continue;
      }
      const stored = found.translations
        .map((translation) => `${translation.title}\n${translation.body}`)
        .join('\n');
      if (!LAUNCH_MARKERS.some((marker) => stored.includes(marker))) {
        skipped.push(key);
        continue;
      }
      await ctx.db.patch(found._id, {
        translations: [...item.translations],
        updatedAt: now,
      });
      patched.push(key);
    }

    return {patched, skipped, missing};
  },
});
