import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import appleGalleryConfig from '../store-assets/apple-gallery-config.json';

const LOCALES = [
  'de',
  'en',
  'es',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'nl',
  'pt',
  'vi',
  'zh',
  'zh-Hant',
] as const;
type Locale = (typeof LOCALES)[number];
const STORE_LOCALES: Readonly<Record<Locale, readonly string[]>> = {
  de: ['de-DE'],
  en: ['en-US'],
  es: ['es-ES'],
  fr: ['fr-FR'],
  id: ['id'],
  it: ['it'],
  ja: ['ja'],
  ko: ['ko'],
  nl: ['nl-NL'],
  pt: ['pt-BR', 'pt-PT'],
  vi: ['vi'],
  zh: ['zh-Hans'],
  'zh-Hant': ['zh-Hant'],
};
const AD_PLACEMENT_COPY: Readonly<Record<Locale, string>> = {
  de: 'direkt unterhalb der Haupttabs',
  en: 'directly below the main tabs',
  es: 'justo debajo de las pestañas principales',
  fr: 'juste en dessous des onglets principaux',
  id: 'tepat di bawah tab utama',
  it: 'direttamente sotto le schede principali',
  ja: 'メインタブのすぐ下',
  ko: '메인 탭 바로 아래',
  nl: 'direct onder de hoofdtabbladen',
  pt: 'diretamente abaixo das abas principais',
  vi: 'ngay bên dưới các thẻ chính',
  zh: '主标签栏正下方',
  'zh-Hant': '主分頁正下方',
};

// EAS Metadata validates these keys against its App Store Connect locale
// schema. Store-copy locale tags are not interchangeable with these ids:
// Italian is `it` here even though app runtime locale APIs commonly report
// `it-IT`. Keep this independent allow-list so an internally consistent but
// unsupported mapping cannot pass the repository gate again.
const SUPPORTED_EAS_APPLE_LOCALE_IDS = new Set([
  'de-DE',
  'en-US',
  'es-ES',
  'fr-FR',
  'id',
  'it',
  'ja',
  'ko',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'vi',
  'zh-Hans',
  'zh-Hant',
]);

interface StoreMetadata {
  readonly locale: string;
  readonly releaseNotesVersion: string;
  readonly apple: {
    readonly name: string;
    readonly subtitle: string;
    readonly keywords: string;
    readonly promoText: string;
    readonly releaseNotes: string;
    readonly description: string;
  };
  readonly google: {
    readonly name: string;
    readonly shortDescription: string;
    readonly fullDescription: string;
    readonly releaseNotes: string;
    readonly promoVideo: string | null;
  };
  readonly urls: {
    readonly privacy: string;
    readonly terms: string;
    readonly support: string;
    readonly privacyChoices: string;
    readonly accountDeletion: string;
  };
  readonly screenshotScenes: readonly string[];
  readonly screenshotAltText: readonly string[];
}

const ROOT = process.cwd();
const META_ROOT = join(ROOT, 'store-assets', 'metadata');
const APP_VERSION: string = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;
const failures: string[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Independent platform-contract expectations; runtime consumers use the registry.
const localeRegistry: unknown = JSON.parse(
  readFileSync(join(ROOT, 'store-assets', 'store-locales.json'), 'utf8'),
);
if (!isRecord(localeRegistry)) throw new Error('Invalid store locale registry');
if (
  Object.keys(localeRegistry).sort().join(',') !== [...LOCALES].sort().join(',')
)
  throw new Error(
    'Store locale registry must cover every canonical metadata file',
  );
const expectedGoogleLocales = [
  'de-DE',
  'en-US',
  'es-ES',
  'es-419',
  'fr-FR',
  'id',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'vi',
  'zh-CN',
  'zh-TW',
  'zh-HK',
].sort();
const googleLocales: string[] = [];
for (const locale of LOCALES) {
  const mapping = localeRegistry[locale];
  if (
    !isRecord(mapping) ||
    !Array.isArray(mapping.apple) ||
    !Array.isArray(mapping.google)
  )
    throw new Error(`Invalid store locale mapping: ${locale}`);
  if (mapping.apple.join(',') !== STORE_LOCALES[locale].join(','))
    throw new Error(`Unexpected Apple locale mapping: ${locale}`);
  for (const language of mapping.google) {
    if (typeof language !== 'string')
      throw new Error(`Invalid Google locale: ${locale}`);
    googleLocales.push(language);
  }
}
if (googleLocales.sort().join(',') !== expectedGoogleLocales.join(','))
  throw new Error(
    'Google locale registry has missing, repeated or unsupported slots',
  );

const stringField = (
  record: Record<string, unknown>,
  key: string,
): string | null => (typeof record[key] === 'string' ? record[key] : null);

// Verify the selected release gallery. Its uploader reads the same selector.
const gallerySelection: unknown = JSON.parse(
  readFileSync(join(ROOT, 'store-assets', 'current-play-gallery.json'), 'utf8'),
);
if (!isRecord(gallerySelection))
  throw new Error('Invalid Play gallery selector');
if (
  gallerySelection.defaultLanguage !== 'en-US' ||
  !Array.isArray(gallerySelection.locales) ||
  gallerySelection.locales[0] !== 'en-US' ||
  !Array.isArray(gallerySelection.scenes) ||
  gallerySelection.scenes.join(',') !==
    'intro,calendar,timeline,stats,entry,sharing,comments,theme'
)
  throw new Error(
    'Play gallery must preserve English first and R81 scene order',
  );
const galleryDirectory = stringField(gallerySelection, 'directory');
if (
  galleryDirectory === null ||
  !/^marketing\/[a-zA-Z0-9.-]+$/.test(galleryDirectory)
)
  throw new Error('Invalid Play gallery directory');
const PLAY_MANIFEST = join(
  ROOT,
  'store-assets',
  galleryDirectory,
  'manifest.json',
);
const PANEL_LOCALE_TO_METADATA: Readonly<Record<string, Locale>> = {
  'ko-KR': 'ko',
  'en-US': 'en',
  ja: 'ja',
  'zh-CN': 'zh',
  id: 'id',
};
const readPlayPanelScenes = (): Readonly<Partial<Record<Locale, string[]>>> => {
  const raw: unknown = JSON.parse(readFileSync(PLAY_MANIFEST, 'utf8'));
  if (!isRecord(raw) || !Array.isArray(raw.panels))
    throw new Error('Play panel manifest is missing its panels array');
  const scenes: Partial<Record<Locale, string[]>> = {};
  for (const panel of raw.panels) {
    if (!isRecord(panel)) continue;
    const {locale, file} = panel;
    if (typeof locale !== 'string' || typeof file !== 'string') continue;
    const key = PANEL_LOCALE_TO_METADATA[locale];
    if (key === undefined) continue;
    const scene = /^\d\d-(.+)\.png$/.exec(file)?.[1];
    if (scene === undefined) continue;
    (scenes[key] ??= []).push(scene);
  }
  return scenes;
};
const PLAY_PANEL_SCENES = readPlayPanelScenes();

// The four locales without their own Play galleries annotate the iOS panels.
// Their manual Play text may inherit default English graphics. Read the iOS
// scene order from captured files: alt text describes panel N, not text-only
// localization coverage.
const readAppleShotScenes = (locale: Locale): string[] => {
  const selected = Object.values(appleGalleryConfig.locales).find(
    (value) => value.appLocale === locale,
  );
  const family = appleGalleryConfig.families[0];
  if (!selected || !family) throw new Error(`Missing Apple gallery: ${locale}`);
  const manifest: unknown = JSON.parse(
    readFileSync(
      join(
        ROOT,
        'store-assets',
        'marketing',
        appleGalleryConfig.sourceVersion,
        selected.directory,
        family.directory,
        'gallery-manifest.json',
      ),
      'utf8',
    ),
  );
  if (
    !isRecord(manifest) ||
    manifest.version !== appleGalleryConfig.sourceVersion ||
    !Array.isArray(manifest.scenes) ||
    !manifest.scenes.every((scene): scene is string => typeof scene === 'string')
  )
    throw new Error(`Invalid selected Apple gallery manifest: ${locale}`);
  return manifest.scenes;
};

const readMetadata = (locale: Locale): StoreMetadata | null => {
  const value: unknown = JSON.parse(
    readFileSync(join(META_ROOT, `${locale}.json`), 'utf8'),
  );
  if (!isRecord(value)) return null;
  const apple = value.apple;
  const google = value.google;
  const urls = value.urls;
  const alt = value.screenshotAltText;
  const scenes = value.screenshotScenes;
  if (
    !isRecord(apple) ||
    !isRecord(google) ||
    !isRecord(urls) ||
    !Array.isArray(alt) ||
    !alt.every((item) => typeof item === 'string') ||
    !Array.isArray(scenes) ||
    !scenes.every((item) => typeof item === 'string')
  )
    return null;
  const parsed = {
    locale: stringField(value, 'locale'),
    releaseNotesVersion: stringField(value, 'releaseNotesVersion'),
    apple: {
      name: stringField(apple, 'name'),
      subtitle: stringField(apple, 'subtitle'),
      keywords: stringField(apple, 'keywords'),
      promoText: stringField(apple, 'promoText'),
      releaseNotes: stringField(apple, 'releaseNotes'),
      description: stringField(apple, 'description'),
    },
    google: {
      name: stringField(google, 'name'),
      shortDescription: stringField(google, 'shortDescription'),
      fullDescription: stringField(google, 'fullDescription'),
      releaseNotes: stringField(google, 'releaseNotes'),
    },
    urls: {
      privacy: stringField(urls, 'privacy'),
      terms: stringField(urls, 'terms'),
      support: stringField(urls, 'support'),
      privacyChoices: stringField(urls, 'privacyChoices'),
      accountDeletion: stringField(urls, 'accountDeletion'),
    },
    screenshotScenes: scenes,
    screenshotAltText: alt,
  };
  if (
    parsed.locale === null ||
    parsed.releaseNotesVersion === null ||
    Object.values(parsed.apple).some((item) => item === null) ||
    Object.values(parsed.google).some((item) => item === null) ||
    Object.values(parsed.urls).some((item) => item === null)
  )
    return null;
  return {
    locale: parsed.locale,
    releaseNotesVersion: parsed.releaseNotesVersion ?? '',
    apple: {
      name: parsed.apple.name ?? '',
      subtitle: parsed.apple.subtitle ?? '',
      keywords: parsed.apple.keywords ?? '',
      promoText: parsed.apple.promoText ?? '',
      releaseNotes: parsed.apple.releaseNotes ?? '',
      description: parsed.apple.description ?? '',
    },
    google: {
      name: parsed.google.name ?? '',
      shortDescription: parsed.google.shortDescription ?? '',
      fullDescription: parsed.google.fullDescription ?? '',
      releaseNotes: parsed.google.releaseNotes ?? '',
      promoVideo:
        typeof google.promoVideo === 'string' ? google.promoVideo : null,
    },
    urls: {
      privacy: parsed.urls.privacy ?? '',
      terms: parsed.urls.terms ?? '',
      support: parsed.urls.support ?? '',
      privacyChoices: parsed.urls.privacyChoices ?? '',
      accountDeletion: parsed.urls.accountDeletion ?? '',
    },
    screenshotScenes: parsed.screenshotScenes,
    screenshotAltText: parsed.screenshotAltText,
  };
};

const codePoints = (value: string): number => [...value].length;

const limit = (
  locale: Locale,
  label: string,
  value: string,
  maximum: number,
  measure: (input: string) => number = codePoints,
): void => {
  const observed = measure(value);
  if (observed > maximum)
    failures.push(`${locale}: ${label} is ${observed}/${maximum}`);
  if (value.trim().length === 0) failures.push(`${locale}: ${label} is empty`);
};

const files = readdirSync(META_ROOT)
  .filter((name) => name.endsWith('.json'))
  .sort();
const expectedFiles = LOCALES.map((locale) => `${locale}.json`).sort();
if (files.join(',') !== expectedFiles.join(','))
  failures.push(
    `metadata files are ${files.join(',')}, expected ${expectedFiles.join(',')}`,
  );

for (const locale of LOCALES) {
  const metadata = readMetadata(locale);
  if (metadata === null) {
    failures.push(`${locale}: invalid metadata shape`);
    continue;
  }
  if (metadata.locale !== locale)
    failures.push(`${locale}: locale field is ${metadata.locale}`);
  limit(locale, 'Apple name', metadata.apple.name, 30);
  limit(locale, 'Apple subtitle', metadata.apple.subtitle, 30);
  // Apple's keyword limit is 100 CHARACTERS, not bytes. Measuring bytes here
  // silently capped every CJK locale at roughly a third of the field — ko sat at
  // 28/100 and ja/zh still do — because one Hangul or Han syllable costs three
  // bytes. Confirmed against App Store Connect on 2026-09-19: it accepted and
  // persisted a 99-character Korean keyword string that is 255 bytes.
  limit(locale, 'Apple keywords', metadata.apple.keywords, 100);
  limit(locale, 'Apple promotional text', metadata.apple.promoText, 170);
  // App Store Connect requires What's New for EVERY localization before a
  // version can be submitted; the 1.0.3 submission was rejected once for
  // missing it. Keeping the text in the repo means `eas metadata:push` fills
  // all nine, and this gate fails here rather than at the submission.
  limit(locale, 'Apple release notes', metadata.apple.releaseNotes, 4_000);
  // Apple 3.1.2: an app with an auto-renewable subscription must disclose the
  // subscription and link Terms of Use plus Privacy Policy from the description
  // or the binary. BooKoo ships one, so every localized description must carry
  // the block and both links. A store listing that quietly drops this is a
  // documented rejection, and the failure is invisible until review.
  for (const [field, text] of [
    ['Apple description', metadata.apple.description],
    ['Google full description', metadata.google.fullDescription],
  ] as const) {
    if (!text.includes('BooKoo Pro'))
      failures.push(`${locale} ${field}: missing the subscription disclosure`);
    if (!text.includes(metadata.urls.terms))
      failures.push(`${locale} ${field}: missing the Terms of Use link`);
    if (!text.includes(metadata.urls.privacy))
      failures.push(`${locale} ${field}: missing the Privacy Policy link`);
    if (!text.includes(AD_PLACEMENT_COPY[locale]))
      failures.push(
        `${locale} ${field}: ad placement must describe the banner below the main tabs`,
      );
  }

  limit(locale, 'Apple description', metadata.apple.description, 4_000);
  limit(locale, 'Google name', metadata.google.name, 30);
  if (metadata.google.name !== metadata.apple.name)
    failures.push(`${locale}: Google title must match the Apple title`);
  limit(
    locale,
    'Google short description',
    metadata.google.shortDescription,
    80,
  );
  limit(
    locale,
    'Google full description',
    metadata.google.fullDescription,
    4_000,
  );
  // Play Console has no equivalent of `eas metadata:push`, so this text is
  // typed into the release by hand. Keeping it beside Apple's is what makes the
  // two stores describe the same release, and 500 is Play's own cap per locale
  // — a quarter of the length the Apple note is allowed to be.
  limit(locale, 'Play release notes', metadata.google.releaseNotes, 500);
  // Nothing else ties a note to a release. `store.config.js` pushes whatever
  // `apple.releaseNotes` currently says for whatever version package.json
  // currently is, so without this the next version ships this version's What's
  // New and every gate stays green. Each locale states its own release because
  // each locale's note is written separately, and a half-finished pass should
  // fail rather than ship eight correct notes and one stale one.
  if (metadata.releaseNotesVersion !== APP_VERSION)
    failures.push(
      `${locale}: release notes are written for ${metadata.releaseNotesVersion}, but package.json is ${APP_VERSION}`,
    );
  if (metadata.screenshotAltText.length !== 8)
    failures.push(
      `${locale}: screenshot alt text has ${metadata.screenshotAltText.length}/8 scenes`,
    );
  metadata.screenshotAltText.forEach((alt, index) =>
    limit(locale, `screenshot alt text ${index + 1}`, alt, 200),
  );
  // The alt text is positional: entry N describes panel N. Naming the scenes
  // next to it is what makes that checkable — three locales silently kept the
  // pre-repositioning scene list (an iPad detail pane, a three-ledger switcher)
  // while their panels had already been re-shot, and only reading the prose
  // against the pictures revealed it.
  if (metadata.screenshotScenes.length !== metadata.screenshotAltText.length)
    failures.push(
      `${locale}: screenshotScenes has ${metadata.screenshotScenes.length} entries but alt text has ${metadata.screenshotAltText.length}`,
    );
  const shipped = PLAY_PANEL_SCENES[locale];
  const inheritsEnglishGallery = ['nl', 'pt', 'vi', 'zh-Hant'].includes(locale);
  const expectedScenes =
    shipped ??
    (inheritsEnglishGallery
      ? (PLAY_PANEL_SCENES.en ?? [])
      : readAppleShotScenes(locale));
  if (expectedScenes.join(',') !== metadata.screenshotScenes.join(','))
    failures.push(
      `${locale}: screenshotScenes is ${metadata.screenshotScenes.join(',')} but the captured ${shipped === undefined ? 'App Store' : 'Play'} panels are ${expectedScenes.join(',')}`,
    );
  // Play trailers are optional. Keep a missing or deleted trailer null instead
  // of retaining a broken URL that blocks Console saves. Manual text locales
  // may inherit default graphics, so gallery coverage does not gate video text.
  const video = metadata.google.promoVideo;
  if (video !== null && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(video))
    failures.push(
      `${locale}: promoVideo must be a https://www.youtube.com/watch?v=<id> URL, received ${String(video)}`,
    );
  // French, German, Spanish, and Italian are localized store listings first. Until
  // their reviewed legal documents ship, link those listings to the complete
  // English public contract rather than silently serving Korean fallback copy.
  const publicLocale = ['fr', 'de', 'es', 'it', 'nl', 'pt', 'vi'].includes(locale)
    ? 'en'
    : locale === 'zh-Hant'
      ? 'zh'
      : locale;
  const expectedUrls = {
    privacy: `https://bookoo.hyo.dev/legal/privacy?lang=${publicLocale}`,
    // Apple 3.1.2 requires the Terms of Use link, and the description checks
    // below assert the description contains urls.terms — so if this entry were
    // wrong, both would agree on the same wrong URL and pass.
    terms: `https://bookoo.hyo.dev/legal/terms?lang=${publicLocale}`,
    support: `https://bookoo.hyo.dev/support?lang=${publicLocale}`,
    privacyChoices: `https://bookoo.hyo.dev/privacy-choices?lang=${publicLocale}`,
    accountDeletion: `https://bookoo.hyo.dev/account-deletion?lang=${publicLocale}`,
  };
  for (const [key, expected] of Object.entries(expectedUrls)) {
    const actual = metadata.urls[key as keyof typeof expectedUrls];
    if (actual !== expected)
      failures.push(`${locale}: ${key} URL does not match the public contract`);
  }
}

// Keep EAS Metadata in lock-step with the reviewed source files. A locale can
// otherwise pass every copy/URL limit here while never being uploaded because
// it was omitted from store.config.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configuredInfo: unknown = require('../store.config.js').apple?.info;
if (
  typeof configuredInfo !== 'object' ||
  configuredInfo === null ||
  Array.isArray(configuredInfo)
)
  throw new Error('store.config.js apple.info must be an object');
const configuredLocales = Object.keys(configuredInfo).sort();
const expectedStoreLocales = Object.values(STORE_LOCALES).flat().sort();
for (const locale of configuredLocales) {
  if (!SUPPORTED_EAS_APPLE_LOCALE_IDS.has(locale))
    throw new Error(
      `store.config.js contains unsupported EAS Apple locale id: ${locale}`,
    );
}
if (configuredLocales.join('\n') !== expectedStoreLocales.join('\n'))
  throw new Error(
    `store.config.js locales do not match metadata: expected ${expectedStoreLocales.join(', ')}, received ${configuredLocales.join(', ')}`,
  );

if (failures.length > 0)
  throw new Error(
    `store metadata verification failed:\n- ${failures.join('\n- ')}`,
  );

process.stdout.write(
  `store metadata: ${LOCALES.length} locales and 8 scenes verified within platform limits\n`,
);
