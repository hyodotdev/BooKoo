# Contributing to BooKoo

Thanks for helping. BooKoo is a shared ledger used by real groups, so changes
are held to the rules in [`AGENTS.md`](./AGENTS.md) and
[`CONVENTION.md`](./CONVENTION.md). Their performance and privacy rules are
acceptance criteria, not suggestions.

- [Contributor License Agreement](#contributor-license-agreement)
- [Stack](#stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Repository layout](#repository-layout)
- [Non-negotiable rules](#non-negotiable-rules)
- [Pull requests](#pull-requests)
- [Further reading](#further-reading)
- [Security issues](#security-issues)

## Contributor License Agreement

Before a pull request can be merged, you must agree to the
[BooKoo Contributor License Agreement](./CLA.md).

Why: BooKoo is licensed under the AGPL and is also distributed through the App
Store and Google Play, whose terms are not compatible with the AGPL for code the
project does not own. The CLA lets the project keep shipping your contribution
in the store apps. You keep the copyright to your work, and the public code
stays under the AGPL.

To agree, add this line to your pull request description:

```text
I have read and agree to the BooKoo Contributor License Agreement (CLA.md).
```

## Stack

| Layer           | Choice                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| App             | [Expo](https://expo.dev) SDK 57, React Native 0.86, React 19                     |
| Routing         | [expo-router](https://docs.expo.dev/router/introduction) with typed routes       |
| Backend         | [Convex](https://convex.dev): database, functions, file storage, auth            |
| Auth            | Convex Auth: Kakao, Naver, Google, Apple and email OTP                           |
| UI              | [cpk-ui](https://github.com/crossplatformkorea/cpk-ui)                           |
| Styling         | [kstyled](https://github.com/niceplugin/kstyled) (compile-time CSS-in-JS)        |
| Lists           | [@shopify/flash-list](https://shopify.github.io/flash-list/) + Convex pagination |
| Client state    | zustand + [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)     |
| Purchases       | OpenIAP via `expo-iap`, verified by IAPKit                                        |
| Dates           | date-fns                                                                         |
| i18n            | i18n-js over `assets/langs/*.json` (12 languages)                                |
| Tests           | jest + jest-expo + @testing-library/react-native                                 |
| Package manager | [bun](https://bun.sh)                                                            |

## Getting started

Prerequisites:

- **bun** 1.3.13 (`packageManager` in `package.json`)
- **Node** `^22.13.0 || >=24.3.0`
- **Xcode** with CocoaPods for iOS, and the **Android SDK** (compileSdk 36,
  minSdk 24, JDK 17) for Android
- A **Convex account** — `bunx convex dev` logs you in and creates your own
  dev deployment
- Social sign-in keys only if you need to exercise those providers; see
  `.env.example`

First run:

```bash
bun install
cp .env.example .env.local   # fill in only the keys you need
bun dev:convex               # creates your dev deployment and keeps functions in sync
bun ios                      # or: bun android
```

Leave `bun dev:convex` running in a second terminal. `bun ios` and
`bun android` build the **QA** app identity (`BOOKOO_APP_VARIANT=qa`), which
never replaces a store install. Always develop against your own dev
deployment, never against production.

## Scripts

Run scripts with `bun <name>`. Use `bun run test` for tests: a bare `bun test`
starts Bun's own runner instead of jest.

| Script            | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `start`           | Metro dev server for the QA app                                      |
| `ios` / `android` | Prebuild and run the QA app on a simulator, emulator or device       |
| `web`             | Web target                                                           |
| `dev:convex`      | Watch `convex/`, push functions and regenerate `convex/_generated`   |
| `dev:convex:once` | One-shot push and codegen                                            |
| `lint`            | ESLint for app, Convex, shared, scripts and tests                    |
| `lint:all`        | Lint plus i18n, dependency, secret, schema, site and store checks    |
| `typecheck`       | `tsc --noEmit`                                                       |
| `test`            | jest, serial                                                         |
| `check`           | `lint` + `typecheck` + `test`: run before every pull request         |
| `fix:deps`        | Realign dependency versions with the Expo SDK                        |
| `doctor`          | `expo-doctor`                                                        |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests, a full-history
secret scan and the Convex transaction-budget suite on every pull request.
Production deploys run only from `main` of this repository and only when the
maintainer has enabled them.

[Codemagic](https://codemagic.io), which sponsors OpenIAP, builds the native
projects for pull requests (`codemagic.yaml`): an unsigned iOS simulator build
and an Android release APK, both with the QA app identity and no secrets.

## Repository layout

```
app/        expo-router routes. Thin screens; logic lives in src/.
convex/     Convex backend: schema/, lib/, and <domain>/queries|mutations|actions.
shared/     Pure TypeScript shared by the app, Convex and tests.
src/        Client code: components, features, hooks, stores, theme, i18n.
assets/     Icons, images, fonts and assets/langs/*.json.
modules/    Local Expo native modules.
plugins/    Local Expo config plugins.
test/       jest tests mirroring app/, src/, convex/ and shared/.
scripts/    Repository and verification scripts (never imported by the app).
public/     The bookoo.hyo.dev website, generated by scripts/generate-public-site.ts
            and deployed by Vercel from main.
.agents/    Canonical AI-agent skills; .claude/.codex/.grok/.cursor mirror them.
.notes/     Design and research notes, including the schema authority.
```

Path aliases (`tsconfig.json`): `~/*` → `src/*`, `@convex/*` → `convex/*`,
`@shared/*` → `shared/*`. Convex code imports `shared/` with a relative path.

## Non-negotiable rules

- **Every unbounded list paginates**: `paginationOptsValidator` +
  `.paginate()` on the server, `usePaginatedQuery` + `FlashList` on the client.
  No `ScrollView` + `.map()`, no `.collect()` on a growing table.
- **Every dashboard number comes from a rollup**, never from scanning entries.
- **Every query is index-bounded** with `.withIndex(...)`.
- **`any` is banned**, and route strings and i18n keys are never cast.
- **Money is integer minor units**; timestamps are epoch milliseconds.
- **Every user-visible string is translated**; colors come from the theme.

The full rules are in [`AGENTS.md`](./AGENTS.md) and
[`CONVENTION.md`](./CONVENTION.md).

## Pull requests

1. Open an issue first for anything larger than a small fix.
2. Use synthetic data only. Never include real ledgers, emails, screenshots of
   real accounts, tokens or keys.
3. Make sure the local checks pass:

   ```bash
   bun check
   bun lint:all
   ```

4. Use Conventional Commits (`feat(scope): …`, `fix(scope): …`).

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the rulebook for humans and AI agents
- [`CONVENTION.md`](./CONVENTION.md) — coding conventions
- [`scripts/README.md`](./scripts/README.md) — repository scripts
- [`docs/`](./docs/README.md) — product, performance and workflow notes
- [`.notes/design/SCHEMA.md`](./.notes/design/SCHEMA.md) — the table and index authority

## Security issues

Do not open a public issue for a vulnerability. Email hyo@hyo.dev with the
details and a way to reproduce it.
