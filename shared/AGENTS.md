# shared/

Code compiled by **three independent toolchains**: the Convex bundler (esbuild,
via relative imports out of `convex/`), Metro (the app bundle), and Jest. Root
rules still apply — see `../AGENTS.md`.

## Pure TypeScript only

- **No `react-native`, no `react`, no `expo-*` imports.** They do not exist in
  the Convex isolate.
- **No `convex/server`, no `convex/values`, no `_generated` imports.** They do
  not exist in the app bundle, and importing them here drags the server runtime
  into Metro.
- No `node:` builtins, no platform globals (`window`, `document`, `__DEV__`),
  no filesystem, no network.
- Ideally zero imports at all. If a helper needs a dependency, that is a strong
  signal it belongs in `convex/lib/` or `src/utils/` instead.
- Everything exported is a pure function or a plain type/const. No module-level
  side effects, no singletons, no `Date.now()` at module scope.

## What belongs here

The rules that must produce **identical answers on the client and on the
server** — the client for instant feedback, the server as the real gate:

- validation and normalization (usernames, emails, invite codes)
- money arithmetic in minor units and currency formatting rules
- period keys (`'YYYY-MM'`, `'YYYY-MM-DD'`) and day-boundary resolution
- category identifiers and their i18n key mapping
- the shared error-code union and its payload type

If a rule is duplicated between a mutation and a form, it is a bug: move it here
and have both call it.

## Imports

- App and test code: `@shared/*` (aliased in `tsconfig.json`).
- Convex code: a **relative** path (`../shared/x`, `../../shared/x`). The Convex
  bundler does not read the root tsconfig `paths`.

## Testing

This is the most testable code in the repo, and the place where test effort pays
back the most — pure in, pure out, no mocks, no renderer, no deployment. New
logic here ships with unit tests in the same commit. `bun run test` must stay green;
a `shared/` change with no accompanying test is not finished.
