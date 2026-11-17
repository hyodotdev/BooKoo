# scripts/

Repo-side scripts. Nothing here ships in the app bundle — the whole directory
is excluded by `.easignore`. Root lint and TypeScript checks do validate it.

## `scripts/migrate/` — Firebase → Convex

The one-time migration tooling reads the legacy Firebase
project `bookoo-89f6c` (Realtime Database under `/bookoo`, plus photos in
Firebase Storage) and writing the rows into Convex.

It provides:

- Export the Realtime Database tree and Storage objects to a local staging
  directory (git-ignored — nothing exported ever gets committed).
- Map legacy records onto the Convex schema, preserving `legacyUid` /
  `legacyKey` on every table so a re-run is idempotent and a row can always be
  traced back to its origin.
- Convert money to **integer minor units** and legacy timestamps to the single
  repo-wide date convention before writing.
- Upload photos to Convex file storage and rewrite item references to the new
  storage ids.
- Import in batches through Convex mutations (or `convex import`), never in a
  single unbounded pass.

Passwords are **not** migrated. Legacy accounts are re-authenticated with email
OTP or a social provider on first login and linked to their `legacyUid`.

**Design doc:** `.notes/design/migration-plan.md` (authoritative once written).
The research it is based on is `.notes/research/14-firebase-to-convex-migration.md`
and `.notes/research/02-legacy-data-model.md`. `.notes/` is tracked because it
is the shared design state for alternating agents.

## Conventions for anything added here

- One script, one job; make it re-runnable and idempotent.
- Run with `bun scripts/<name>.ts`; if a script grows dependencies of its own,
  justify every added root dependency in `scripts/verify-dependencies.ts`.
- Never write into `convex/_generated`, `assets/`, or `app/` from a script
  without saying so at the top of the file.
- Credentials come from the environment, never from a committed file. Anything
  a script downloads or emits belongs under `.local/migration/`.

## `scripts/convert-legacy-strings.ts` — `STRINGS.js` → `assets/langs/`

Regenerates the whole app string set from the legacy source.

```bash
bun scripts/convert-legacy-strings.ts                            # write
bun scripts/convert-legacy-strings.ts --check                    # verify only (CI)
bun scripts/convert-legacy-strings.ts --content-out=.local/migration/content/legacyContent.json
```

**It writes into `assets/`** — `assets/langs/{en,ko,ja,zh,id}.json` and
`assets/langs/meta/{en,ko,ja,zh,id}.json`. That is the exception to the
"never write into `assets/`" rule above, and the only one.

### What it does

Reads `BooKooLegacy/STRINGS.js` (87 KB, five locales, 263 flat
`SCREAMING_SNAKE_CASE` keys, no nesting, no interpolation) and emits the nested
camelCase key set described in `.notes/design/money-categories-i18n.md` §3 and
`.notes/research/04-legacy-content-i18n.md` §9.3, through five in-file tables:

| Table | Purpose |
|---|---|
| `KEY_MAP` | `LEGACY_KEY → new.nested.key`, 189 entries |
| `DROPPED` | 77 keys that deliberately do not ship, each with a reason |
| `VALUE_OVERRIDE` | corrected copy for keys that *are* migrated (the 34 category labels, the tab labels, the biometrics wording, …) |
| `NEW_STRINGS` | keys the rewrite introduces (invite links, username claim, sign-in providers, `money.*`, `error.*`, `a11y.*`, theme) |
| `NEW_PLURALS` | plural entries, all five locales, all sub-keys |

Every run prints what it dropped and why, anything it could not map, any stray
single-locale key, and every value it had to back-fill from `en` — that last
list is the outstanding-translation to-do.

### Why the curation lives in the script

The output is a pure function of the legacy file plus those tables, so a re-run
is idempotent and **cannot silently revert a fix**. Hand-editing
`assets/langs/*.json` is therefore wrong: the next run overwrites it. Fix the
table instead, and the reason for the change stays next to the change.

### Invariants it has to keep, and the checks that prove it

- `assets/langs/ko.json` is the key SSOT (`.eslintrc.js` →
  `i18n-json/identical-keys`). The script fails loudly if any locale's key set
  diverges, before writing anything.
- Keys are sorted with plain `Array.prototype.sort()` — UTF-16 code-unit order —
  because that is exactly what `i18n-json/sorted-keys` uses. `localeCompare`
  would disagree on mixed-case camelCase and `bun lint:i18n --fix` would then
  rewrite every file on each run.
- Plural entries carry the same sub-keys in every locale, so no `ignoreKeys`
  exception is needed in `.eslintrc.js`.
- No key contains a hyphen (`custom-syntax-validator.ts`).

```bash
bun scripts/convert-legacy-strings.ts   # regenerate
bun lint:i18n                           # must make no changes
bunx jest test/assets/langs.test.ts     # parity, placeholders, plurals, meta
```

### What it does NOT write

`ANNOUNCEMENT_*` (18 keys) and `FAQ_*` (22 keys) are content, not UI chrome, and
belong in the Convex `appAnnouncements` table (`kind: NOTICE | FAQ`) so content
can change without an app release. `--content-out=<path>` emits seed rows; put
that path under `.local/migration/`.
