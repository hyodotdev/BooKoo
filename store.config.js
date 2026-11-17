const {version} = require('./package.json');

const localeMappings = require('./store-assets/store-locales.json');
const localeFiles = Object.fromEntries(
  Object.entries(localeMappings).flatMap(([locale, mapping]) => {
    const metadata = require(`./store-assets/metadata/${locale}.json`);
    return mapping.apple.map((storeLocale) => [storeLocale, metadata]);
  }),
);

// `verify:store` checks this too, but a bare `eas metadata:push` does not run
// it, and the failure it prevents is silent: What's New is the one field the
// store shows verbatim and nobody re-reads after a version bump.
for (const [locale, metadata] of Object.entries(localeFiles)) {
  if (metadata.releaseNotesVersion !== version)
    throw new Error(
      `store.config.js: ${locale} release notes are written for ${metadata.releaseNotesVersion}, but package.json is ${version}`,
    );
}

const info = Object.fromEntries(
  Object.entries(localeFiles).map(([locale, metadata]) => [
    locale,
    {
      title: metadata.apple.name,
      subtitle: metadata.apple.subtitle,
      description: metadata.apple.description,
      promoText: metadata.apple.promoText,
      releaseNotes: metadata.apple.releaseNotes,
      keywords: metadata.apple.keywords
        .split(',')
        .map((keyword) => keyword.trim()),
      marketingUrl: 'https://bookoo.hyo.dev',
      supportUrl: metadata.urls.support,
      privacyPolicyUrl: metadata.urls.privacy,
      privacyChoicesUrl: metadata.urls.privacyChoices,
    },
  ]),
);

module.exports = {
  configVersion: 0,
  apple: {
    version,
    copyright: '2026 Hyo Jang',
    categories: ['FINANCE', 'LIFESTYLE'],
    advisory: {
      ageRatingOverride: 'NONE',
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      contests: 'NONE',
      gambling: false,
      gamblingSimulated: 'NONE',
      horrorOrFearThemes: 'NONE',
      kidsAgeBand: null,
      koreaAgeRatingOverride: 'NONE',
      lootBox: false,
      matureOrSuggestiveThemes: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      profanityOrCrudeHumor: 'NONE',
      sexualContentGraphicAndNudity: 'NONE',
      sexualContentOrNudity: 'NONE',
      unrestrictedWebAccess: false,
      violenceCartoonOrFantasy: 'NONE',
      violenceRealistic: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
    },
    info,
    release: {
      // The launch owner explicitly chose automatic publication after App
      // Review approval. Keep this in the repository so a later metadata sync
      // cannot silently return the version to Pending Developer Release.
      automaticRelease: true,
    },
  },
};
