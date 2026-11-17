# BooKoo — 함께 쓰는 가계부 (shared ledger)

Claude-facing companion to `AGENTS.md`. `AGENTS.md` is the neutral rulebook all
agents read; this file repeats the hard rules verbatim and adds the project
overview, the architecture map, and the performance mandate. If this file and
`AGENTS.md` ever disagree, `AGENTS.md` wins — fix the drift in the same commit.

## Project Overview

BooKoo is a **shared community ledger**: several people record and read the same
ledger together — entries with amount, category, memo, photo and location;
review comments on entries; a calendar; statistics graphs; app lock;
multi-language; push.

This is a **from-scratch rewrite** of the original BooKoo — first shipped in
2017, last touched around 2020, built on Expo 36 + Redux + Firebase Realtime
Database. Its source sits in `BooKooLegacy/` for reference only: never import
from it, never copy its data model.

**Real production user data is being migrated in.** The Firebase project is
`bookoo-89f6c` (RTDB under `/bookoo`, photos in Firebase Storage). That has two
consequences you must respect in every design decision:

1. Every table that receives migrated rows carries `legacyUid` / `legacyKey`
   from its first schema version — retrofitting those later is painful.
2. Ledgers arrive already large. Nothing may assume a small table.

See `.notes/DECISIONS.md` for the confirmed product decisions and
`.notes/design/migration-plan.md` for the executable migration runbook.
`.notes/` is tracked because it is the shared state for alternating agents;
PII and private evidence remain under ignored `.local/`.

## Tech Stack

As installed — read `package.json` before assuming a version.

- **Runtime**: Expo SDK 57 (`expo` ~57.0.20), React Native 0.86.3, React 19.2.3
- **Routing**: `expo-router` ~57.0.19 with typed routes
  (`experiments.typedRoutes: true` in `app.config.ts`)
- **Backend**: Convex 1.45.0 (DB + serverless functions + file storage),
  `convex-helpers` 0.1.123
- **Auth**: `@convex-dev/auth` 0.0.95 — Kakao / Naver / Google / Apple / email
  OTP, with a unique username (handle) chosen on first sign-in
- **UI kit**: `cpk-ui` 0.8.1; **styling**: `kstyled` 0.4.1 +
  `babel-plugin-kstyled` 0.4.1 (`strict: true`, first in the plugin list;
  `react-native-worklets/plugin` stays last)
- **Lists**: `@shopify/flash-list` 2.3.1
- **Charts**: cpk-ui-owned chart primitives; the current Victory/Skia screen import is recorded promotion debt
- **Client state**: `zustand` 5, `react-native-mmkv` 3.3.3
- **Dates**: `date-fns` 4 (no `moment`)
- **i18n**: `i18n-js` 4.5.3 over `assets/langs/*.json`
  (`ko`, `en`, `ja`, `zh`, `id`)
- **Types/tests**: TypeScript ~6.0.3, ESLint ^8.57.1, Jest ~29.7 + `jest-expo`
- **Package manager**: bun

## Key Architecture

```
convex/
  schema.ts                  defineSchema only — assembles schema/*
  schema/<table>.ts          one file per table; enums exported from here
  lib/                       ctx-taking + pure helpers, NOT convex functions
  <domain>/queries.ts        read paths
  <domain>/mutations.ts      write paths
  <domain>/actions.ts        anything that needs fetch/Node
  _generated/                DO NOT EDIT — produced by the Convex CLI
shared/                      pure TS shared by app + convex + jest
app/                         expo-router routes (thin) + `_`-prefixed subtrees
src/
  theme.ts                   the only source of colors
  styled.d.ts                kstyled theme augmentation
  components/uis/            reusable presentational components
  components/providers/      the root provider stack
  STRINGS.ts                 i18n loader
assets/langs/*.json          i18n strings (ko, en)
scripts/                     one-off + migration tooling (never imported by the app)
```

Path aliases (`tsconfig.json`): `~/*` → `./src/*`, `@convex/*` → `./convex/*`,
`@shared/*` → `./shared/*`. **App and test code may use `@shared/*`; Convex code
must import `shared/` with a relative path** (`../shared/...`), because the
Convex bundler does not read the root tsconfig `paths`.

Directories not created yet at the time of writing — `convex/schema/`,
`convex/lib/`, `convex/<domain>/`, `src/features/`, `src/hooks/`,
`src/stores/`, `app/_Tabs/` — follow the shape above when you create them.
The frozen table and index inventory is `.notes/design/SCHEMA.md`; do not invent
table or function names outside that authority.

## Conventions

- One table per file in `convex/schema/`, assembled in `convex/schema.ts`.
- Index names are mechanically `by_` + fields joined with `_`, in tuple order
  with camelCase preserved (`by_ledgerId_deletedAt_dayKey_occurredAt`).
- Domain modules are plural: `queries.ts`, `mutations.ts`, `actions.ts`.
- Client-visible failures use only `convex/lib/errors.ts#appError` and carry
  `ConvexError({code, messageKey, params})` from `shared/appErrors.ts`; server
  natural-language strings are forbidden. Expected business outcomes return a
  function-specific discriminated union when the screen owns every branch.
- Deletion is soft: set `deletedAt` (epoch ms). Hard delete only pure join rows,
  orphaned blobs, and rows a documented retention purge removes once nothing
  restorable can reference them (the SCHEMA §5 purge cascade, the released
  archived CUSTOM category).
- Every user-visible string goes through i18n. Server error payloads carry a
  closed code/key plus raw non-sensitive params; the client renders static
  localized keys under `.notes/design/error-handling.md`.
- Money is integer minor units; timestamps are epoch-ms numbers; stored month
  keys are `YYYYMM` integers and day keys are `YYYYMMDD` integers. Full list in
  `AGENTS.md` → Data Conventions.

## Native Build Execution

- Before IAP implementation, native builds and release verification, compare the
  exact installed `expo-iap` version with the npm `latest` stable release and
  inspect its official release notes. Record the check and use the current
  stable version unless a verified compatibility issue requires a documented
  pin. A native dependency upgrade requires rebuilt candidates and fresh E2E.
- Never enqueue an EAS cloud build. Every EAS native build must use
  `eas build --local`, including production and store-candidate builds.
- Direct local Xcode and Gradle builds remain the preferred fast path for
  simulator, emulator, and connected-device E2E checks.
- Store submission is a separate operation: inspect the locally built IPA or
  AAB first, then submit that exact artifact when submission is authorized.


## Agent Skills

Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
`.claude/skills/`, `.codex/skills/`, `.grok/skills/`, and `.cursor/rules/` as
thin pointers (generated — they appear on the first sync run). Edit the
canonical file only, then run `bash .agents/scripts/sync-skills.sh`.
See `.agents/README.md` (to be created).

## UI Component Ownership — cpk-ui first

- `crossplatformkorea/cpk-ui` is the sole home for reusable visual primitives. On this workstation its
  source checkout is `/Users/hyo/Github/crossplatformkorea/cpk-ui`; `src/AGENTS.md` contains the required
  cross-repository workflow.
- This includes buttons, inputs, dialogs, sheets, FABs, calendars, parallax surfaces, segmented/section
  controls, chart frames, legends, and pie/donut/bar/line charts. Search cpk-ui's public exports and source
  before writing UI code in BooKoo.
- If the primitive exists, consume its public export. If it is close but its API or result is wrong, improve
  the cpk-ui component instead of copying, forking, or recreating its rendering in BooKoo. If it is absent,
  add it to cpk-ui first.
- Third-party renderers such as Victory, Skia, or SVG are implementation details of cpk-ui components. New
  BooKoo screens must not import them directly to build reusable UI.
- BooKoo may own domain composition and semantic adapters only: ledger data mapping, money formatting, i18n,
  authorization, routing, and screen layout. A local adapter must delegate the visual primitive to cpk-ui; it
  must not become a second component implementation.
- cpk-ui `Button` / `BookooButton` corners are the `borderRadius` **prop**, never `style` or
  `styles.container`. `style` omits `borderRadius` and `padding`; padding goes in `styles.container`.
  A loading overlay must use the same number as that prop. Details in `src/AGENTS.md`.
- Every new or changed cpk-ui primitive must be exported from `src/index.tsx`, typed, covered by colocated
  tests and Storybook stories, verified on native and web, and pass cpk-ui's `bun run test:all` plus
  `bun run build` before BooKoo adopts it.
- Unpublished cpk-ui work may be locally linked for development with `--no-save`, but no `link:`/`file:` or
  absolute-path dependency may be committed. A finished BooKoo commit pins a published exact version.
  Publishing a prerelease is an external action and still requires user authorization at action time.

## List & Pagination Rules

- Any list backed by user-generated, server-side, or otherwise unbounded data
  must use `FlashList` from `@shopify/flash-list`.
- Do not render unbounded data with `ScrollView + array.map()` or fetch the full
  collection with `useQuery` / Convex `.collect()` for screen lists.
- Pair `FlashList` with Convex pagination: `paginationOptsValidator` on the
  query, `usePaginatedQuery` on the client, and `onEndReached` for loading more.
- `ScrollView` is acceptable only for static/short-form content, fixed-size
  controls, forms, detail pages, or deliberately capped preview sections such as
  "top 5".
- If a query can grow over time, add the right index for the list sort/filter
  **before** adding pagination.
- In BooKoo, ledger entries, entry comments, members, invites and notifications
  are all unbounded. Treat every one of them as a paginated list.
- Aggregates (monthly totals, per-category sums, balances) are precomputed
  server-side. Never derive a dashboard number by reading every entry — not on
  the client, not in a query handler.

## TypeScript Rules

- **`any` is banned.** ESLint enforces it: `@typescript-eslint/no-explicit-any`
  is configured as `error`, never `warn` and never disabled per-file.
  Use a concrete type, `unknown`, a generic, or a type guard. `as any`,
  `as unknown as T` and `// @ts-expect-error` used to dodge a real type problem
  are all the same violation.
- Convex document ids are `Id<'tableName'>`, imported from
  `convex/_generated/dataModel`. Never `string`.
- expo-router paths are typed routes (`experiments.typedRoutes: true` in
  `app.config.ts`). Use string literals with no cast. If typed routes error, the
  route file is missing — create it, do not cast.
- i18n keys are static literals. If you need a key that depends on data, branch
  with `if`/`switch` to reach a literal key. `t(dynamicKey as any)` is banned.
- Prefer explicit return types on exported functions and on every Convex
  handler.

## Styling Rules

- `kstyled`'s `styled` / `css`, imported literally from `'kstyled'`. A barrel
  re-export or a namespace import silently disables compilation and falls back
  to runtime CSS parsing.
- **Any `${...}` in a template moves that declaration to runtime and flips the
  whole component onto the dynamic render path** — even `${SOME_CONST}`. Keep
  invariant declarations literal.
- Numbers in css templates must carry their unit as part of the string:
  `${bottom + 'px'}`, not `${bottom}px`. Set `font-family` without quotes.
- Never put a CSS comment (`/* … */`) inside a kstyled template — it is folded
  into the next property name and produces a garbage style key.
- No `@media`, breakpoints, nested selectors, pseudo-classes or keyframes.
  kstyled does not support them and they compile to garbage silently.
- Colors come from `src/theme.ts` / the cpk-ui theme tokens only. No hardcoded
  hex in components.
- Tablet branches use `useTabletLayout()` from `~/hooks/useTabletLayout` (window
  minimum dimension >= 600dp), never `media.isTablet` or `Platform.isPad`, which
  misclassify split-screen and Android portrait tablets. Never branch on
  `isMobile` — it is always `true`.
- Details and failure modes: `.notes/research/12-kstyled-api.md`.

---

## PERFORMANCE (non-negotiable)

**The legacy app died because it loaded a whole ledger's items into Redux.**
That is the single failure this rewrite exists to fix. Performance is not a
polish pass here; it is the acceptance criterion.

Four rules, no exceptions:

1. **Every unbounded list paginates.** `paginationOptsValidator` + `.paginate()`
   server-side, `usePaginatedQuery` + `FlashList` + `onEndReached` client-side.
   Start at `initialNumItems: 30` and `loadMore(50)`.
2. **Every dashboard number comes from a rollup**, not from a scan. Monthly
   totals, per-category sums and balances are maintained incrementally on write
   (rollup tables, or a `ledgerId`-namespaced aggregate for arbitrary-range
   reports). No query handler ever walks every entry to produce a number.
3. **Every query is index-bounded.** `.withIndex(...)` always; `.filter()` on a
   growing table never; `.collect()` never. Bounded sidecars use a named
   `.take(N + 1)` sentinel; unbounded data uses `.paginate()`.
4. **Membership checks are O(1).** Every ledger-scoped function starts with a
   single indexed lookup on the ledger-member join table. Never "load the
   ledger's members and scan the array".

Supporting rules that fall out of these: hot-write counters live in the three
rollup tables, not on the parent document; receipt rows store private storage ids
and authenticated media endpoints stream bytes after membership checks; thumbnails
are generated client-side before upload.

**The binding checklist is `.notes/research/13-convex-scale.md` §11 ("BooKoo-specific
rules").** Read it before you touch a query, a schema file, or a list screen, and
treat any deviation from it as a defect that needs an explicit written
justification in the PR.

---

## Coding Principles (Karpathy-inspired)

### 1. Think Before Coding
- State uncertainties explicitly before writing code
- When a request is ambiguous, present interpretations and ask — don't guess
- Document assumptions that aren't obvious from context

### 2. SSOT and Simplicity First
- Follow the canonical [SSOT and KISS rules](AGENTS.md#ssot-and-kiss) before
  implementation and during every review.

### 3. Surgical Changes
- Only modify what's necessary for the task
- Match existing code style — don't "improve" surrounding code
- Don't add docstrings, comments, or type annotations to unchanged code

### 4. Goal-Driven Execution
- Transform tasks into verifiable success criteria
- "Fix the bug" → write a test reproducing it, then make it pass
- Always verify: `bun check` (`tsc --noEmit` + eslint + jest), plus
  `bunx convex dev --once` when `convex/**` changed
