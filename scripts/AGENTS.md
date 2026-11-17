# scripts/

One-off tooling and the Firebase → Convex migration. Nothing here is imported by
the app or by `convex/`. Root rules still apply — see `../AGENTS.md`.

Runtime is `bun`. The migration runbook — phases, ordering and the go/no-go
gates — is `../.notes/research/14-firebase-to-convex-migration.md`.

## These scripts move real user data

The migration operates on live production data from the legacy Firebase project.
Treat every script as something that will be run again, half-way, at 3am, by
someone who did not write it.

## Idempotent

- Re-running a script from the start must converge to the same result, never
  duplicate rows and never double-count. Dedupe on the stable legacy key
  (`legacyUid` / `legacyKey`) via an index lookup, not on insertion order.
- A partially-applied row is detected and completed, not re-inserted.
- Every mutation the script calls must itself be idempotent, because retries
  happen — wrap network calls in exponential backoff and assume some of them
  land twice.

## Resumable

- Long passes write a checkpoint after each batch and start from it on the next
  run. Killing a script must never be destructive.
- Batches are bounded and sized explicitly; no unbounded fan-out, no "read
  everything then loop".
- Progress and anomalies go to a report file, not only to stdout, so a run can
  be audited after the terminal is gone.

## Never write to production without a dry run

- Every script that writes takes an explicit flag to actually write. The
  **default is a dry run**: read, compute, report what would change, change
  nothing.
- The dry-run report is reviewed before the write run. A destructive script
  additionally requires an explicit confirmation argument — no interactive
  "are you sure" prompt that a pipe can answer.
- Rehearse against an isolated local or explicitly approved scratch deployment before touching production.

## Never commit exported user data

- Exports, intermediates, checkpoints, reports and downloaded blobs live under
  `.local/migration/`, which is ignored by git and EAS. Nothing under it is ever
  committed, pasted into an issue, attached to a PR, or uploaded by CI.
- Never print an email, phone number, memo, source path, credential, or raw row
  to stdout. Reports contain only the minimum data needed for offline review.
- Auth exports: strip password hashes and salts on arrival and shred the
  original. They are not migrated and must not be retained.
- Credentials come from the environment. `.env*` is not committed
  (`.env.example` is the only exception) and service-account JSON never enters
  the repo.
- Sample rows in a bug report are synthetic, not real people's ledgers.
