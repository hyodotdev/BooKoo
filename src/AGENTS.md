# UI

Rules for this directory. Root rules still apply — see `../AGENTS.md`.

## cpk-ui first

- Treat `crossplatformkorea/cpk-ui` as the reusable UI source of truth. Its local
  checkout is `/Users/hyo/Github/crossplatformkorea/cpk-ui`; when that path is
  unavailable, use the public repository and do not invent a different local
  package.
- Check both `cpk-ui`'s public export surface and its source before writing UI.
  The rule covers charts (pie, donut, bar, line, frames, legends), segmented or
  section controls, calendars, parallax headers, FABs, buttons, inputs, dialogs,
  sheets, loading, and any other data-agnostic visual primitive.
- If a component exists, import its public API. If it almost fits, change its
  upstream variant/slot/render/style API and tests rather than copying it or
  rebuilding its rendering in BooKoo. If it is missing, add it upstream first.
- A third-party rendering engine (`victory-native`, Skia, SVG, and similar) may
  be used inside cpk-ui, but a BooKoo feature screen must not import one directly
  to create a reusable visual.
- Text is cpk-ui `Typography.*`. React Native's bare `Text` is not used in app
  code.
- `useCPK()` gives `{theme, themeType, media, changeThemeType}`; `useTheme` is
  not exported from the package root.
- BooKoo-local components may compose domain semantics only: translate ledger
  rollups into generic chart data, format money, provide i18n/a11y labels, apply
  authorization, or connect navigation. They must delegate the visual primitive
  to cpk-ui and must not reproduce its drawing, geometry, gesture, or animation.
- Photo thumbnails are interaction surfaces, not decoration: every visible
  thumb opens the shared authenticated original-image viewer at its exact item
  index. Full-screen pinch/pan comes from cpk-ui `PinchZoom`; do not add a
  screen-local PanResponder, zoom implementation, or public storage URL.
- Stats category rows drill into a cpk-ui `LineChart` plus the selected month's
  paginated entry list. BooKoo selects the correct income/expense rollup and
  formats labels; responsive SVG geometry and chart hit targets remain upstream.

### Required upstream workflow

1. Inspect the cpk-ui working tree and `CONTRIBUTING.md`; create a short-lived
   feature branch there before changing the library. Do not edit its `main`
   directly and do not mix unrelated library work.
2. Implement the generic, data-agnostic API under `src/components/`, export it
   from `src/index.tsx`, and add colocated tests plus Storybook stories. Variant,
   size, state, styles, accessibility, reduced motion, and light/dark behavior
   belong to the library contract; BooKoo ledger types and strings do not.
3. Verify iOS/Android behavior and web behavior. Run `bun run test:all` and
   `bun run build` in cpk-ui. Charts must cover empty, one-value, multi-value,
   overflow, reduced-motion, and screen-reader summary states.
4. For local unpublished QA only, build cpk-ui, register `cpk-ui/lib` with
   `bun link`, then run `bun link cpk-ui --no-save` in BooKoo. Never commit the
   resulting symlink, `link:`, `file:`, tarball, or absolute path.
5. Before a BooKoo task is complete, restore the exact package/lockfile state
   and consume a published exact cpk-ui version. A prerelease publish is never
   implicit authorization. If the upstream source is committed and pushed but
   publication is waiting for authorization, the root guide permits one
   temporary minimal `patch-package` overlay with recorded commit provenance
   and a pristine-package application test. Otherwise record the cpk-ui commit
   and blocker in `.notes/STATUS.md` instead of leaving BooKoo dependent on
   unshared local state.

## cpk-ui Button corner radius

`Button` and `BookooButton` take **`borderRadius` as a dedicated prop**. cpk-ui
types `style` as `StyleProp<Omit<ViewStyle, 'borderRadius' | 'padding'>>`, so a
radius in `style` or `styles.container` is dropped or fights the loading
overlay and the corner changes when `loading` flips.

- Set the corner with `borderRadius={8}` (or whatever the surface needs). Do
  not put `borderRadius` or `padding` in `style`. Padding belongs in
  `styles.container`.
- `BookooButton` defaults to `16`. cpk-ui `Button` defaults to `4`. Pass the
  prop explicitly when the surface is not that default.
- A loading overlay, highlight, or wrapper around a button must use the **same
  number** as that `borderRadius` prop. Do not hardcode a different radius in
  a StyleSheet.

## Current promotion debt

- `src/components/uis/BookooSegmentedControl.tsx` is a temporary local rendering
  implementation. Its compact capsule variant must move into cpk-ui's
  `SegmentedControl`; BooKoo may then keep only a semantic adapter if needed.
- `src/components/uis/OptionSelect.tsx` is a temporary generic option-list
  selector. It must move into cpk-ui; BooKoo keeps only option mapping
  (currency codes, i18n labels) and screen routing.
- `src/features/ledger/CategoryFormFields.tsx` renders a generic colour-swatch
  row and a grouped, searchable icon grid inline. `src/components/uis/
  ColorIconSelect.tsx` already renders the same two controls as a modal
  apply/cancel screen; R58 requires the category form to be an inline
  live-editing section, so the two cannot share a call site as written. One
  cpk-ui primitive with both an inline and a modal presentation must replace
  both; do not add a third copy of this grid in the meantime.
- Stats donut and line rendering now come from cpk-ui. Future bar/pie/line
  primitives stay there as well, with BooKoo retaining only rollup-to-series
  mapping and money/i18n labels.

## kstyled — keep styles statically extractable

Full API and every silent failure mode: `../.notes/research/12-kstyled-api.md`.

- `import {styled, css} from 'kstyled'` **literally**. A barrel re-export or
  `import * as k` does not match the babel plugin and silently drops you onto
  the runtime CSS parser.
- **One `${...}` anywhere in a declaration moves it to runtime and flips the
  whole component onto the dynamic render path** — including `${SOME_CONST}`.
  There is no constant folding. Keep invariant declarations literal.
- A fully static `css` template is the cheapest primitive available: it compiles
  to a hoisted `StyleSheet.create` entry with no extra component. Prefer it over
  `styled.View` inside list rows.
- Interpolated numbers carry their unit inside the expression:
  `${bottom + 'px'}`, not `${bottom}px`; `font-family` takes no quotes.
- Never put a CSS comment inside a template — it is folded into the next
  property name and produces a garbage style key.
- No `@media`, breakpoints, nested selectors, pseudo-classes or keyframes;
  responsive work is JS (`useTabletLayout()` from `~/hooks/useTabletLayout`).
  `.attrs()` may appear at most once, immediately before the template.
- In list rows: hoist static parts to module scope, memoize the themed part once
  in the list parent, `React.memo` the row, never build a `style` array inline
  in `renderItem`.

## Theme tokens only

- Colors come from `theme.ts` and the cpk-ui token buckets (`bg`, `role`,
  `text`, `button`). **No hard-coded hex in components.** Dark mode is not
  optional; a literal color is a dark-mode bug waiting to happen. Breakpoints
  are never encoded in the theme.
- In ledger-scoped UI, `useLedgerAccent()` is the contextual primary token for
  non-destructive buttons and selected controls. Use `ledgerAccentSurface()`
  for filled foreground contrast, preserve semantic danger/warning/disabled
  colours, and pass a draft accent override when a colour editor previews an
  unsaved selection.

## Form completion

- A single-purpose create/edit/settings form awaits its mutation, then returns
  immediately through Expo Router. On failure it stays visible with retryable
  error feedback. If a deep link has no local history, replace to the owning
  deterministic surface. Inline collection managers may stay open for repeated
  actions; do not apply this exception to a normal Save/Update form.

## State ownership — pick exactly one

- **Convex** owns all server truth: ledgers, entries, members, comments,
  aggregates. If it is shared between users or devices, it is a Convex query —
  never mirrored into a store.
- **zustand** owns ephemeral cross-screen UI state: modal visibility, form
  drafts, filter selections. `create<T>()(...)`, split `State`/`Action`
  interfaces, an `initialState` const, a named `useXStore` export. Nothing in a
  store outlives the process.
- **MMKV** owns small, synchronous, device-local persistence: theme choice,
  locale, onboarding flags and non-secret app-lock hints. It never stores
  Convex query results, mutation arguments, financial data, comments or member
  data. Keys are declared in one place, not spelled inline.

Never copy a Convex result into zustand. That is precisely how the legacy app
put a whole ledger into Redux and became unusable.
