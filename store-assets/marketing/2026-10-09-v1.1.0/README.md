# BooKoo 1.1.0 Play gallery

English is primary. Each of the five Play locales contains eight1080×1920 RGB
panels in the owner's R81 order: intro, calendar, timeline, stats, entry,
sharing, comments, theme. The mint intro uses the exact white pig/B mark and
native calendar textures on locally rendered angled white phones. Feature
panels use navy, restrained captions and proportional native screenshots.

Sources were captured October9,2026 on Galaxy Z Flip5 (SM-F731N, Android16,
1080×2640, default font scale, portrait). The isolated package
`dev.hyo.bookoo.receiptqa` uses the1.1.0 native Release build, Expo57.0.27,
React Native0.86.3, the local receipt module and a loopback synthetic backend.
The installed Play app and its data are preserved. All displayed ledgers,
people, records, comments and receipt photos are synthetic.

The tab-label gallery acceptance APK SHA256 is
`b34fbbf4d5a13c67a586998798887eca1bcfafa32fbe32f40c21daec76a445b0`.
Its source map matches the primary editor, media adapter, parser and legal
constants. Indonesian entry is recaptured after the one-line tab-label fix;
unchanged source scenes retain their original inspected capture identity.
Later receipt Save acceptance uses3127cbaf after the Indonesian Cancel copy fix;
that new artifact does not rename these unchanged captures as freshly taken.

R82 recaptures all five blank entry screens with the tab-row Scan receipt
action using APKeeec033fb9ff8301e821666a3607404bddf805b97eb5cacda67c8f7384c8fc81.
These five forms share the local English climbing-club fixture (no member or
ledger title appears in the form), select September6, and use each respective
app locale. Other30 native scene sources retain their original identities.
The owner's R81 order and the mint cover artwork remain unchanged.

R85/R89 refreshes the five statistics and five entry sources on October10
using the Pixel10 profile on Android14 (API34) (1080×2424, default font). The exact QA APK
is `b93fa8b2cc383322482b62ce92f48584ac7a2767c24fccca627c3d0d504f2fee`.
Each locale uses its localized synthetic gallery fixture. Statistics show the
complete expense total; the entry action has compact padding. These ten
sources have per-file timestamps and digests in `october-10-recapture.json`.
Their crops remove72 top pixels; statistics end240 pixels above the bottom
before the test banner, and entries remove72 bottom system pixels with Done
retained. The other25 scene sources and five calendar-based covers retain
their October9 identities. No unchanged scene is presented as a new capture.

For the retained Galaxy sources, `source-crops.json` removes92 top pixels (system status area),312 bottom pixels
on main tabs (test banner and navigation), and144 bottom pixels on detail/form
routes (system navigation only). Entry Done remains in frame. No native UI is
repainted, stretched or fabricated. Receipt Apply stays pending; capture does
not save gallery draft edits.

Reproduce each intro with the local Blender executable, passing a locale of
`en-US`, `ko-KR`, `ja`, `zh-CN` or `id`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python store-assets/generate-play-cover.py -- en-US \
  --sources store-assets/marketing/2026-10-09-v1.1.0/sources \
  --output store-assets/marketing/2026-10-09-v1.1.0 \
  --crop-config store-assets/marketing/2026-10-09-v1.1.0/source-crops.json

bun store-assets/generate-play-refresh.mjs --legacy-cover \
  --sources=store-assets/marketing/2026-10-09-v1.1.0/sources \
  --crop-config=store-assets/marketing/2026-10-09-v1.1.0/source-crops.json \
  --captured-at=2026-10-09-to-2026-10-10 \
  --output=store-assets/marketing/2026-10-09-v1.1.0 \
  --locales=en-US,ko-KR,ja,zh-CN,id
```

The manifest records source and output SHA256, scene order, crops and geometry.
Overviews are review aids, not upload assets. Blender working files are ignored.
`store-assets/current-play-gallery.json` selects this gallery for metadata
verification and the dry-run-first uploader. Store publication is a separate
state recorded in `.notes/qa/2026-10-09-release-1-1-0.md`; generation alone does
not prove publication or certify the future signed production binary.
