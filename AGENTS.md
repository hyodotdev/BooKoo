# BooKoo — Agent Rules

This file is the neutral single source of truth every agent reads (Codex, Grok,
Cursor, and Claude via `CLAUDE.md`). `CLAUDE.md` is the Claude-facing companion:
it repeats these rules and adds the project overview, architecture map and
performance mandate. Where both files state a rule, they state it identically —
if you ever find them disagreeing, **this file wins** and the drift is a bug to
fix in the same commit.

Per-directory rules live in `convex/AGENTS.md`, `app/AGENTS.md`,
`src/AGENTS.md`, `shared/AGENTS.md`, and `scripts/AGENTS.md`. Read the one for
the tree you are editing.

## Start here, every session

This repo is worked on by several agents in alternating sessions (Claude Code, Codex, Grok,
Cursor). None of them can see another's chat history, so **the repo is the only shared memory.**

1. Read `.notes/STATUS.md` — current phase, the work queue, and the handoff protocol.
2. Check the current branch. Continue its `IN PROGRESS` task, or create a task branch from `main`
   before claiming new work.
3. Claim a task there before starting it, and update it before you finish.
4. Write decisions into `.notes/`, never only into your reply.

User UI corrections are durable product decisions, not chat-only tweaks. Normalize each correction into a
reusable rule in `.notes/design/visual-language-2026.md` during the same session, and reconcile any superseded
rule in `.notes/design/RECONCILIATION.md`. Future work must check those rules before styling the same surface.

`BooKooLegacy/` is a read-only reference copy of the 2017 app. Never edit or build it.
`.local/` holds exported production user data. Never commit it, never quote it, never upload it.

## SSOT and KISS

- Before implementation and every review, identify the canonical owner of each
  rule, data contract, calculation, state and UI primitive. Search existing
  exports and callers before adding another implementation.
- Keep one authoritative implementation or record; derive consumers and
  generated output from it. Reuse or improve the existing owner and remove
  superseded in-scope copies together. Platform adapters and independent test
  expectations may differ when they have a concrete reason.
- Keep the smallest change that satisfies the request (KISS). Add abstractions,
  configuration and fallback paths only for a demonstrated requirement,
  duplication or testability need; avoid speculative features and unrelated
  refactors.
- Record the canonical paths reused, the SSOT/KISS result, and any justified
  duplication or complexity in review evidence. Fix divergent sources and
  unnecessary in-scope complexity; do not treat taste-only preferences as defects.

## Commit Messages

Always write commit messages in Angular Conventional Commits format.

- Format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Subject: imperative, lowercase, no period, ~50 chars max
- Use scope when helpful, e.g. `auth`, `ledger`, `convex`, `ui`, `migrate`

## Branch Names

- `main` is the sole integration branch. Do not develop directly on it: branch from it, finish and
  verify one queue task, then fast-forward the completed task branch into `main`.
- Do not create or restore a long-lived `develop` branch. This repository intentionally uses only
  `main` plus short-lived task branches.
- For every new branch, use a task-intent prefix: `feat/`, `bugfix/`,
  `docs/`, `refactor/`, `test/`, or `chore/`.
- Never create branches with tool or vendor prefixes such as `codex/`, `grok/`,
  `claude/`, or `cursor/`.
- Use a concise kebab-case description after the prefix.
- Before claiming a new task, the worktree must be clean and the current commit must contain
  `main`. If another task branch or uncommitted work is present, continue or hand off that work;
  do not move it onto `main` or hide it in a stash.
- Never force-update a remote branch as part of this workflow without explicit user approval.

## PR Checklist

1. `bun check` — `tsc --noEmit` + eslint + jest must pass.
2. When the active task is authorized to use the configured Convex deployment,
   run `bunx convex dev --once` for `convex/**` changes. Otherwise do not create
   cloud state; report the check as not run.
3. Run the app and look at the screen when anything under `app/**` or `src/**`
   changed. A list screen is not done until you have scrolled past page one.

## Native Build Execution

- Before IAP implementation, native builds and release verification, compare the
  exact installed `expo-iap` version with the npm `latest` stable release and
  inspect its official release notes. Record the check and use the current
  stable version unless a verified compatibility issue requires a documented
  pin. A native dependency upgrade requires rebuilt candidates and fresh E2E.
- Never enqueue an EAS cloud build. Every EAS native build must use
  `eas build --local`, including production and store-candidate builds.
- Store binaries may instead come from the Codemagic `ios-production` and
  `android-production` workflows in `codemagic.yaml`, started by the GitHub
  Actions `Release` workflow (kind `store`), a hand-pushed `v<version>` tag on
  main, or by hand in Codemagic. They upload to
  TestFlight and a Play internal draft only, never submit for review, and
  number each build one above the latest store build. The EAS remote counter
  then falls behind: raise it with `eas build:version:set` before the next EAS
  store build.
- Direct local Xcode and Gradle builds remain the preferred fast path for
  simulator, emulator, and connected-device E2E checks.
- Store submission is a separate operation: inspect the locally built IPA or
  AAB first, then submit that exact artifact when submission is authorized.

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
- When the upstream cpk-ui change is already committed and pushed but its npm prerelease is waiting for
  action-time authorization, BooKoo may carry a **minimal, temporary** `patch-package` overlay against the
  exact published version. The patch must contain compiled package output only, name the upstream commit in
  `docs/ai/WORKFLOWS.md`, apply successfully to a pristine registry copy, and be removed as soon as that
  upstream version is published. It must never replace upstream source ownership or hide an unshared local edit.

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

## Data Conventions

- **Money is an integer in minor units** (`amountMinor: number`, e.g. KRW won,
  USD cents) plus an ISO 4217 `currency` string. Never a float, never a string.
  The legacy app stored `amount` as a string *and* `realAmount` as a number —
  that mistake is not repeated.
- **Timestamps are `number`, epoch milliseconds**, everywhere: schema, shared
  code, and client. No ISO strings for instants.
- Stored ledger bucket keys are integers: `monthKey` is `YYYYMM` and `dayKey`
  is `YYYYMMDD`, both derived server-side in the ledger timezone. ISO calendar
  strings exist only at UI/API boundaries and use the shared codecs.
- Never call `Date.now()` inside a Convex query. Pass the day/month key in as an
  argument so the query stays cacheable and deterministic.
- Date math is `date-fns`. `moment` is gone and does not come back.
- Every table that receives migrated data carries `legacyUid` / `legacyKey` from
  the very first schema version.

## Do Not

- Do not hand-edit `convex/_generated/**`; regenerate and commit it when the
  authorized Convex task changes the schema or public API.
- Do not commit `.env*` files (`.env.example` is the only exception).
- Do not commit or upload exported production data. Every migration export,
  intermediate, checkpoint, report and blob lives under `.local/migration/`.
- Do not hand-edit files that `bash .agents/scripts/sync-skills.sh` generates.

## Agent Skills

Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
`.claude/skills/`, `.codex/skills/`, `.grok/skills/`, and `.cursor/rules/` as
thin pointers (those mirrors are generated — they appear on the first sync
run). Edit the canonical file only, then run
`bash .agents/scripts/sync-skills.sh`. See `.agents/README.md` (to be created)
for the layout and the authoring conventions.

The sync script owns and overwrites every mirrored pointer, and prunes any
pointer whose canonical skill has been deleted. Hand-authored Cursor rules use a
two-digit `NN-` prefix (`.cursor/rules/00-project.mdc`); the prune loop skips
those, so they are safe to keep alongside generated rules.
