# BooKoo store assets

`metadata/` is the reviewed store-listing source for App Store Connect and
Google Play. Google Play's default is English (United States), verified Live
on October9. Other supported languages retain localized listings. See
`.notes/qa/2026-10-09-store-english-default.md` for publication evidence.

`current-play-gallery.json` selects `marketing/2026-10-09-v1.1.0/`. It contains
eight1080×1920 RGB panels per English, Korean, Japanese, Simplified Chinese and
Indonesian locale. Exact order: intro → calendar → timeline → statistics →
entry → sharing → comments → theme. The mint intro restores the white pig/B
mark and angled phones requested by the owner; the following panels use navy.

All UI comes from the October9 native1.1.0 Android Release QA app on a connected
Galaxy Z Flip5, using disposable local synthetic ledgers. The entry panel shows
an explicitly confirmed receipt kept pending until Done. Captures are cropped
at documented system/ad insets and proportionally mapped into white frames.
No UI pixels are repainted or fabricated. The gallery README and manifest record
source hashes, output hashes, crops, build and reproduction commands. Local
candidate generation does not establish store publication; release evidence
belongs in `.notes/qa/2026-10-09-release-1-1-0.md`.

`bun store-assets/update-play-listing.mjs --credentials <service-account.json>`
defaults to a dry run. It reads the same selector, checks English default,
scene order, image dimensions and hashes, backs up remote assets privately,
and preserves tracks and unrelated locales. `--apply` explicitly commits the
reviewed copy and phone screenshots. In September, this service account could
upload but not validate/commit (403), so Console was used; that historical
limitation must be rechecked rather than assumed. Backups stay ignored under
`.local/store-listing/`.

`store-locales.json` owns the mapping from canonical language files to store
locale ids: 13 copy owners, 14 Apple slots and 16 Google slots. Portuguese
serves both Brazil and Portugal; Spanish also serves Latin America; Traditional
Chinese serves Taiwan and Hong Kong on Play. `store.config.js` and the Play
publisher derive their locale adapters from this registry. Platform expectations
in `verify:store` remain independent so a broken registry is detected.

Add `--text-only` to dry-run all configured Play text locales, including those
without dedicated galleries. Review that plan, then repeat with `--apply` to
commit only differing text. It preserves existing images, tracks, videos and
English default. New text locales inherit default English artwork. Apple text
localizations without dedicated screenshots likewise inherit the English
primary gallery; the screenshot uploader still owns the nine actual galleries.
Text translations do not claim new native UI languages.

The September gallery and October9 composition study are retained as historical
sources and are not selected for this release. Existing App Store screenshots
retain their reviewed device sizes; the refreshed Play portraits are not valid
Apple screenshot substitutes. `scripts/verify-store-metadata.ts` checks field
limits, locales, release-note version and positional scene/alt-text contracts.
French, German, Spanish, Italian, Dutch, Portuguese and Vietnamese listings use the reviewed
English legal and support pages until native legal translations are approved.
Traditional Chinese links to the existing Simplified Chinese legal/support pages.

Truthful screenshots from a signed release build belong under:

```text
store-assets/<version>/<locale>/<device>/
```

Allowed device directories are `iphone-6.9`, `ipad-13`, `android-phone`, and
`android-tablet`. Each directory must contain eight PNG source captures, alt
text, the app version/build, OS, theme, route, locale, dimensions, and SHA-256
in a deterministic manifest. No legacy screenshot, `.local` file, real user
name, email, amount, receipt, memo, photo, or place may enter this tree.

The current English iOS release-candidate captures are under
`1.0.0/en/iphone-6.9` and `1.0.0/en/ipad-13`. Their manifests identify the
local Release working tree that produced App Store Connect build 10. The 16
alpha-free PNGs were uploaded and processed for the `en-US` 1.0.0 version on
2026-08-31. Development storyboard captures under `docs/app-flow/` are QA
evidence, not store assets.

Stylized review candidates live under `marketing/1.0.0/<locale>/`. Each of the
nine marketing locales (`en-US`, `ko`, `ja`, `zh-Hans`, `id`, `fr-FR`,
`de-DE`, `es-ES`, and `it-IT`) contain eight 6.9-inch iPhone, 6.5-inch iPhone,
iPad, and Google Play phone images. The app UI inside every frame is a real
simulator capture; only the abstract background art was generated. Headlines
and device composition are deterministic so text cannot be hallucinated or
drift from the shipped UI. One default English listing intentionally covers
the United States, United Kingdom, and Canada instead of duplicating identical
English assets. App Store Connect currently requires the 6.5-inch set when a
localization overrides the primary 6.9-inch screenshots.

Marketing-specific source overrides live under `marketing/sources/`. They are
also real BooKoo device captures. The timeline source must contain populated,
realistic entries; the statistics source must expose several meaningful
category segments; the ledger switcher must show at least three realistic
ledgers; and the final scene explicitly demonstrates dark-mode support. A
loading-only, empty, single-ledger, debug-labelled, or fabricated UI source is
not an acceptable store candidate.

Regenerate with `node store-assets/generate-marketing-screenshots.mjs` and
verify every locale, device size, scene count, and alpha channel with
`bun run verify:marketing`.

`scripts/upload-app-store-screenshots.mjs` dry-runs all nine App Store
localizations by default and uploads the 6.9-inch, 6.5-inch, and 13-inch sets
only with `--apply`. Set `ASC_LOCALE` to one supported App Store locale id to
limit a recovery run. The apply path removes only stale screenshots from the
target set before uploading replacements, which keeps the App Store's ten-image
limit and makes an interrupted run safe to repeat.

The Apple gallery source is selected by sourceVersion in
apple-gallery-config.json, currently1.1.0. It is independent of the remote
App Store version selected by package.json or ASC_APP_VERSION, allowing the
metadata-only1.1.1 draft to reuse the exact verified gallery and order.

Use `--backup-dir <absolute DevLogs run directory>` to keep listing dry-run plans,
readbacks and recoverable screenshots on the registered development-log volume.
