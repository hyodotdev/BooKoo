# BooKoo — Operations and quality contract

Status: **normative for D7 operations and executable quality gates**.

Authority remains measured production truth in `research/15-REAL-DATA-PROFILE.md`, then
`SCHEMA.md`, then this document. This document never turns an unperformed console action or a
secret-dependent skipped job into a pass.

## 1. Executable local and CI gates

`bun lint:all` is the non-mutating repository policy gate. It runs ESLint, JSON i18n lint,
five-locale key/placeholder/plural/metadata verification, exhaustive direct-dependency ownership,
tracked-snapshot secret checks, the 38-table schema policy, and staged release-readiness checks.
`bun fix:i18n` is the only formatting command that may rewrite locale JSON.

The completion gate remains exactly:

```sh
bun lint && bun typecheck && bun run test
```

CI runs that typecheck unconditionally. I1 must therefore generate and commit the Convex client types
when its first imports require `_generated`; a missing generated API is a red build, not a warning or
a secret-dependent skip. `scripts/lint-schema.ts` validates the complete frozen policy today and says
plainly that schema implementation is pending. The moment any application table is implemented, all
38 tables and every exact index must match; an I1 `DONE` row without schema files is a failure.

Full reachable Git history is scanned by Gitleaks `v8.30.1` from its official GHCR image. The local
snapshot verifier prints only a path and rule name, never the matched value. CI checks out full history
with persisted credentials disabled. Core GitHub Actions use their Node 24 generations (`checkout@v6`,
`setup-node@v6`, `cache@v5`).

## 2. Performance evidence is staged, never simulated

| Tier | Owner / due                   | Executable artefact                                                                    | Pass evidence                                                                                          |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1    | I1–I5 with each domain        | Jest/`convex-test` unit and integration suites                                         | normal CI test output                                                                                  |
| 2    | I3, before I3 may be DONE     | `convex/seeds.ts`, `test/perf/transactionBudgets.test.ts`, and CI job `convex-budgets` | transaction metrics for every §4 query budget against an ephemeral local deployment                    |
| 3    | P1, before first public build | `scripts/perf/load-ledger.ts`                                                          | committed aggregate `docs/perf/loadtest-YYYY-MM-DD.md`; raw logs under `.local/release-evidence/perf/` |

Tier 2 runs the official Convex anonymous-agent local backend inside the CI runner, seeds only deterministic
synthetic data, and runs the budget suite before the process and its local state disappear. It consumes no
cloud slot, project quota, deploy key, Management PAT, or production data. Branch protection requires this
job for internal, fork, and bot PRs alike. `scripts/verify-readiness.ts` prevents I3 from being marked DONE
without the local-backend job and artefacts. A separate `main`-only job deploys the exact checked commit to
production after lint/typecheck/tests, history scanning, and the budget job all succeed.

Tier 3 drives eight concurrent writers against one hot 100,000-item synthetic ledger using the exact
§5.4 threshold. The committed report contains only aggregate counts, percentiles and the decision. It
never contains a deployment URL, token, raw request, user id or production row.

## 3. Credential retirement and rotation ledger

No row below is marked complete by D7. Console action happens only in E1/M1/P1/P2 at action time and
requires dated non-secret evidence under `.local/release-evidence/security/`; the committed release
checklist records only the evidence filename, actor, UTC time, and outcome.

| Credential / service                                        | Owner and timing                                          | Required action                                                                                                                                                   | Completion evidence                                                  | State 2026-08-24        |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| Legacy Firebase service account                             | M1; just before rehearsal, after rehearsal, after cutover | Never reuse the embedded legacy JSON. Create a migration-only least-privilege credential outside the repo; rotate/delete after rehearsal and again after cutover. | IAM principal id, roles, created/deleted timestamps; no key material | pending M1              |
| Legacy Sentry auth token/project                            | E1/P1                                                     | Revoke the token and delete/disable unused legacy project integration; the new app does not inherit it.                                                           | redacted console confirmation                                        | pending external action |
| Legacy Google Maps keys                                     | E1/P1                                                     | Revoke; any future map key is new, API-restricted, bundle/SHA-restricted, and separately budgeted.                                                                | key id suffix + restriction/revocation state                         | pending external action |
| Legacy AdMob, Amplitude, Facebook apps/keys                 | E1/P1                                                     | Delete or disable; none ships in v1.                                                                                                                              | console state per service                                            | pending external action |
| Legacy Android JKS and Apple distribution/push certificates | P2                                                        | Do not reuse. Confirm the new bundle is signed by new managed credentials, then revoke/retire the old certificates where supported.                               | signing fingerprint/certificate ids and expiry/revocation state      | pending signed build    |
| New provider and EAS credentials                            | E1/P1/P2                                                  | Least privilege, environment-scoped, stored only in the provider/Convex/EAS secret store; rotate on exposure or owner change.                                     | inventory of non-secret ids, scope and last-rotation date            | pending external setup  |
| CI Convex production deploy key                             | release owner                                             | Production scope only; used exclusively by the post-check `main` deployment job; rotate after exposure and on maintainer change.                                  | secret name, scope, set/rotation timestamp                           | set 2026-09-01; first run pending |

Local evidence on 2026-08-24: `BooKooLegacy/`, `.local/`, and non-example `.env*` are ignored; the
current reachable local history contains no tracked `BooKooLegacy/` path, and the tracked secret-shaped
filename check finds only `.env.example` as an allowed environment file. This does **not** prove that
credentials in the separate historical legacy repository have been revoked, so every external row
above stays pending. A local Gitleaks `v8.30.1` full-history run on the same date scanned 48 reachable
commits (about 3.90 MB) and reported no leaks; CI repeats that scan on every push/PR.

## 4. Migration code and PII boundary

M1 owns `scripts/migrate/01-*` through `19-*` exactly as inventoried in `migration-plan.md`, with shared
helpers under `scripts/migrate/lib/` and secret-guarded temporary server handlers under
`convex/migrate/`. Scripts default to dry run; write mode is explicit, bounded, idempotent and resumable.

Every export, normalized JSONL, checkpoint, report, waiver, rollback archive and downloaded blob lives
under `.local/migration/**`. That directory is excluded by Git and EAS. Migration code never prints an
email, phone number, memo, raw source row/path, provider token or blob URL to stdout. Progress output is
counts, pass ids and redacted anomaly kinds only. `scripts/migrate/lib/email.ts` must be byte-identical
to `shared/email.ts`; `scripts/verify-readiness.ts` enforces this as soon as the migration file exists.

The local export/intermediates and PII-bearing staging columns are destroyed after 90 days of signed
post-cutover verification unless a dated preservation hold names the minimum retained fields, purpose,
owner and expiry. Password hashes and salts are stripped and securely deleted on the export machine
before any file enters `.local/migration/`.

## 5. Dependency and API drift

`scripts/verify-dependencies.ts` is the exhaustive direct-dependency register. An installed package
without an owner, or an owner entry for an absent package, fails `lint:all`. D7 removes six dead direct
packages: the unused toast package, `expo-auth-session`, `@react-native/metro-config`, `dotenv-cli`,
`eslint-plugin-prettier`, and the unused Resend SDK. Email delivery remains the designed server-side
`fetch`; Apple-on-Android uses `expo-web-browser`; Expo owns Metro configuration; formatting remains
Prettier plus `eslint-config-prettier`.

Every Convex point read uses `db.get('table', id)`. The two auth examples using the deprecated one-arg
form are corrected, and `scripts/lint-schema.ts` rejects one-arg db reads in implemented Convex code.

## 6. Small cross-document decisions

- Invite links default to 7 days and accept at most 90 days. Join requests remain 14 days.
- `DEFAULT_LOCALE` remains the shared `'en'` fallback. The client resolves one of
  `ko | en | ja | zh | id` before sign-in and passes it through account/profile creation. The D6
  provider tree mounts ready-only notification registration only after onboarding, so the device locale
  is stored before any push target exists; email OTP already chooses a locale-specific provider. If no
  locale is known, English is deliberate and deterministic.
- `handles.check` remains an unlimited cached one-index query. `handleClaim` and `handleRename` are the
  write-backed abuse limits; adding a rate-limit write to availability checks would cost more and make a
  harmless probe contend.
- Handle history uses `userHandles.by_userId_claimedAt.order('desc').take(50)`; the removed
  `by_userId` index is never recreated.

## 7. Pull-request and release truthfulness

The PR template requires local checks, schema classification, query-budget evidence for Convex changes,
dependency ownership, secret hygiene and release evidence. A check is reported only with actual output.
External console state is reported as pending until a human-visible confirmation has been performed and
recorded; no design decision itself is proof of deployment, credential rotation, store submission or a
production-ready binary.
