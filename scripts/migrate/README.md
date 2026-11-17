# Firebase → Convex migration tools

This directory is the executable companion to `.notes/design/migration-plan.md`.
It never ships in the app. Every export, normalized row, report, checkpoint,
snapshot, and blob remains under `.local/migration/`, which Git and EAS exclude.

## Safety contract

- External writers do nothing unless `--write` or `--apply` is explicit.
- Freeze, rescue, restore, and receipt cleanup require a second confirmation flag.
- Drivers are sequential, bounded, checkpointed after commit, and safe to replay.
- The terminal prints aggregate counts only. Private values stay in mode-0600 local files.
- `03-export-auth.sh` destroys the unsafe password-hash/salt export immediately.
- The synthetic rehearsal proves tooling only. P1 still requires the measured
  production-data rehearsal on an isolated Convex preview.

## Environment and ordered run

Copy only the names from `.env.example` into an ignored environment file or your
shell. Preview and production must use different `MIGRATION_SECRET` values of at
least 32 characters. Never commit values.

Run `05-normalize.ts` twice and compare `reports/checksums.json` before any
destination write. `06-validate.ts` is the pre-import gate. Then run `07` through
`14` in order, followed by rollups (`15`), blobs (`16`), rescue (`17`), and the
sole final gate (`18`). All write examples are intentionally explicit:

```bash
scripts/migrate/01-freeze-legacy.sh --write --confirm-freeze
scripts/migrate/02-export-rtdb.sh --write
scripts/migrate/03-export-auth.sh --write
bun scripts/migrate/04-export-storage.ts --write
scripts/migrate/04b-mirror-storage.sh --write
bun scripts/migrate/05-normalize.ts
bun scripts/migrate/06-validate.ts

scripts/migrate/07-import-legacy-users.sh --write --deployment local
bun scripts/migrate/08-import-placeholders.ts --write --resume
bun scripts/migrate/09-import-ledgers.ts --write --resume
bun scripts/migrate/10-import-invites.ts --write --resume
bun scripts/migrate/11-import-categories.ts --write --resume
bun scripts/migrate/12-import-items.ts --write --resume
bun scripts/migrate/13-import-comments-photos.ts --write --resume
bun scripts/migrate/14-import-feedback.ts --write --resume
bun scripts/migrate/15-rebuild-rollups.ts --write
bun scripts/migrate/16-migrate-blobs.ts --write --daemon
bun scripts/migrate/17-rescue-orphans.ts --apply --confirm-rescue
bun scripts/migrate/18-verify.ts --spot 25 --blobs
```

Create a snapshot before every write pass. Snapshot restoration is the exact
rollback mechanism; only then may restored-run receipts be cleared:

```bash
scripts/migrate/19-rollback.sh snapshot pre-P7 --write --confirm-snapshot --deployment local
scripts/migrate/19-rollback.sh restore .local/migration/backups/pre-P7-UTC.zip --write --confirm-restore --deployment local
scripts/migrate/19-rollback.sh delete-run RUN_ID --write --snapshot-restored --confirm-delete-receipts
```

Never restore after real users can write. Keep maintenance mode enabled until
counts, checksums, financial checks, anomaly waivers, 25 item spots, five rollup
spots, and both blob gates are green.
