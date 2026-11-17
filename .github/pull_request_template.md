## Verification

- [ ] `bun lint && bun typecheck && bun run test` passed locally with real output reviewed.
- [ ] `bun lint:all` passed; i18n lint was check-only and changed no files.
- [ ] No `.local/`, legacy source, credential, private store asset, or user data is in the diff.
- [ ] Direct dependencies are owned by `scripts/verify-dependencies.ts`; Expo dependency changes also passed `bun x expo install --fix` and `bun x expo-doctor`.

## Convex changes

- [ ] Not applicable, or `scripts/lint-schema.ts` passes with every table/index classified.
- [ ] Not applicable, or the affected query's §4 document-read budget and bounded index are stated in the PR.
- [ ] Not applicable, or the Tier-2 anonymous-local budget suite passed and its transaction-metric table is attached.

## Release evidence

- [ ] Not a release candidate, or the dated Tier-3 8-writer load report is under `docs/perf/` and contains only aggregate synthetic-data metrics.
- [ ] External console, rotation, legal, migration and store gates are supported by dated evidence; a skipped/secretless job is never reported as green.
