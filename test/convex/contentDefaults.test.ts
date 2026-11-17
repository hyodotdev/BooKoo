import {
  APP_CONTENT_LOCALES,
  DEFAULT_APP_CONTENT,
} from '../../convex/content/defaults';
import {
  LAUNCH_MARKERS,
  REPOSITIONED_KEYS,
} from '../../convex/content/seeds';

describe('default in-app content', () => {
  test('ships current notices and the complete Legacy FAQ topic set', () => {
    const notices = DEFAULT_APP_CONTENT.filter((row) => row.kind === 'NOTICE');
    const faqs = DEFAULT_APP_CONTENT.filter((row) => row.kind === 'FAQ');

    expect(notices).toHaveLength(3);
    expect(faqs).toHaveLength(14);
    expect(faqs.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        'faq-what-is-bookoo',
        'faq-bookoo-difference',
        'faq-create-ledger',
        'faq-ledger-and-entry',
        'faq-add-entry',
        'faq-invite-members',
        'faq-member-roles',
        'faq-use-other-devices',
        'faq-send-feedback',
        'faq-free-and-pro',
        'faq-restore-purchase',
        'faq-account-deletion',
        'faq-data-privacy',
        'faq-old-app',
      ]),
    );
    expect(
      faqs
        .flatMap((row) =>
          'legacyStringKey' in row ? [row.legacyStringKey] : [],
        )
        .sort(),
    ).toEqual(
      Array.from({length: 11}, (_, index) => `FAQ_${index + 1}`).sort(),
    );
  });

  test('keeps every slug unique and every supported locale complete', () => {
    const keys = DEFAULT_APP_CONTENT.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const row of DEFAULT_APP_CONTENT) {
      expect(row.key).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/);
      expect(row.translations.map((translation) => translation.locale)).toEqual(
        APP_CONTENT_LOCALES,
      );
      for (const translation of row.translations) {
        expect(translation.title.trim()).not.toBe('');
        expect(translation.body.trim()).not.toBe('');
      }
    }
  });

  test('does not republish stale Legacy announcements as current news', () => {
    expect(DEFAULT_APP_CONTENT.filter((row) => row.kind === 'NOTICE')).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({legacyStringKey: expect.any(String)}),
      ]),
    );
  });
});

describe('repositionLaunchCopy', () => {
  /**
   * `seedDefault` skips rows that already exist, so `repositionLaunchCopy` is
   * the only path by which edited launch copy reaches a seeded deployment. It
   * decides what to patch by looking for launch-era markers in the STORED
   * text, which makes this the load-bearing invariant: the copy it writes must
   * contain no marker itself.
   *
   * If it did, the mutation would rewrite the same rows on every run, and — the
   * reason that matters — the old couples framing would be back in the file
   * that every fresh deployment seeds from.
   */
  test('the repositioned copy contains none of the markers it matches on', () => {
    for (const key of REPOSITIONED_KEYS) {
      const item = DEFAULT_APP_CONTENT.find((row) => row.key === key);
      expect(item).toBeDefined();
      const text = (item?.translations ?? [])
        .map((translation) => `${translation.title}\n${translation.body}`)
        .join('\n');
      for (const marker of LAUNCH_MARKERS)
        expect([key, marker, text.includes(marker)]).toEqual([
          key,
          marker,
          false,
        ]);
    }
  });

  test('each repositioned key still ships all five locales', () => {
    for (const key of REPOSITIONED_KEYS) {
      const item = DEFAULT_APP_CONTENT.find((row) => row.key === key);
      expect(item?.translations.map((row) => row.locale).sort()).toEqual(
        [...APP_CONTENT_LOCALES].sort(),
      );
    }
  });
});
