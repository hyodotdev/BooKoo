# Legacy-inspired Google Play gallery

Local review candidate, created October 9, 2026. No store upload has occurred.
English (`en-US`) is the primary version. Korean, Japanese, Simplified Chinese
and Indonesian retain their own authentic UI captures and captions.

The cover restores the owner's supplied old composition: mint ground, the
original white pig/B mark, two angled white phones, and no marketing headline.
The seven remaining feature panels use navy, lighter captions and upright
white frames. The owner's R81 sequence is intro, calendar, timeline, stats,
entry, sharing, comments, theme. Intro is followed by a separate calendar
feature panel. Inspect `en-US-overview.png` first.

## Authentic screen content

The inputs are the inspected September Android screenshots in
`../2026-09-13/sources/`, captured with synthetic fixture data. They were not
captured again in this task and do not certify the October production release.
Original UI pixels are used as Blender textures on the cover and composited
proportionally on the feature panels. Only the documented status-bar/test-ad
crops are applied. App labels, amounts, dates and controls are never redrawn.
The Chinese candidate also crops its 53px black system-status strip; the
existing September files retain their historical crop configuration.
`manifest.json` records each source and output SHA-256. All final gallery files
are 1080×1920 opaque 24-bit RGB PNGs, each below 8 MiB.

## Reproduce

Render each cover with Blender 5.2 (tested on this workstation):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python store-assets/generate-play-cover.py -- en-US
```

Repeat for `ko-KR`, `ja`, `zh-CN`, `id`, then render the complete gallery:

```sh
bun store-assets/generate-play-refresh.mjs --legacy-cover
```

The `.blend` scenes are saved locally with packed textures for inspection, but
are ignored because the checked-in generator recreates them. The default
refresh mode continues to target the existing September gallery.

## Composition study

`composition-concept.png` was generated with the **built-in imagegen tool**,
using the owner's legacy cover, the native English calendar and the actual
BooKoo icon as references. The full prompt is in `composition-prompt.txt`.
This image is a composition study only: generated UI details can move. It is
excluded from the final gallery and manifest. The final covers instead render
the original native screenshots in a reproducible 3D scene.

## Submission boundary

The currently shipped manifest and positional store metadata still describe
the September gallery. On submission, explicitly replace and order all eight
phone screenshots for each locale and reconcile its screenshot scene/alt-text
order with this candidate. Recheck the native source against the current
release before submitting. Publishing is separate from this local design task.
