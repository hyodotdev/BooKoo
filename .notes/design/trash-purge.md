# Trash purge — design and rollout

Status: merged 2026-10-31 (PR112, main 3f2c8fa). Production `TRASH_PURGE_MODE` is
`dry_run` since 12:39Z; the first run at 13:01Z found 0 expired entries and 0 due
ledgers across 53 ledgers, with no writes. Enforcing it is an owner decision
(rollout below), because it irreversibly deletes production rows and blobs.

## Why

The privacy policy (`public/legal/privacy`) says trashed entries and ledgers are
destroyed 30 days after deletion ("항목과 가계부의 휴지통은 30일 뒤 파기합니다").
Nothing did that: `convex/crons.ts` did not exist and nothing read
`ledgers.by_purgeAfter` (`.notes/SWEEP-FINDINGS.md`, "Verified, deferred by
decision"). Restore already refuses past 30 days (`items.restore`,
`ledgers.restore`), so the data was unreachable but retained with its photos.

## What runs

`convex/crons.ts` registers the two SCHEMA §6.1 purges; both live in
`convex/maintenance/purge.ts`.

| Cron (UTC) | Function | Scope |
| --- | --- | --- |
| daily 18:00 | `purgeSoftDeleted` | Entries trashed ≥ `ITEM_PURGE_GRACE_MS` ago in reachable (`ledgerIsReachable`: not deleted, not orphaned), unlocked ledgers: photos (upload row, then blob, then row), comments, then the entry. Pages ledgers 25 at a time; ≤ `CASCADE_BATCH` deletes per transaction, rerunning a page until it is clean. |
| daily 19:00 | `purgeDeletedLedgers` | Up to `PURGE_BATCH` ledgers with `purgeAfter ≤ now`: lock `DELETING`, start or resume a `LEDGER_PURGE` job (`purgeLedgerBatch`). |

`purgeLedgerBatch` walks the SCHEMA §5 cascade in dependency order — photos,
uploads, comments, items, receipts, categories, the three rollup tables,
member state, members, invites (with their redemptions), join requests,
notifications, audit log — then leaves a tombstone: title, description, emoji,
icon and `legacyRaw` cleared, `purgeAfter` cleared, `maintenanceLock` kept at
`DELETING`. `legacyKey` stays so a migration rerun cannot re-import it. Live
entries still pass through the rollup trigger, which is why items precede the
rollup phases and use the smaller `LEDGER_PURGE_ITEM_BATCH`.

Guards, each pinned by `test/convex/trashPurge.test.ts`:

- `TRASH_PURGE_MODE` unset or anything but `dry_run`/`enforce` → no reads.
- Every range has a numeric lower bound (`gte(…, 0)`): Convex sorts `undefined`
  below every number, so `lte(now)` alone would select every live row.
- `dry_run` writes nothing; `purgeLedgerBatch` pauses unless `enforce`.
- A job whose ledger is not deleted or is still restorable is marked `FAILED`
  and deletes nothing.

## Out of scope, on purpose

- **Orphaned ledgers** (`orphanedAt`). Account deletion orphans a ledger at
  request time and cancelling clears it; `migrate/rescue.ts` also orphans
  unclaimed legacy ledgers that a legacy owner may still claim. Purging them
  needs a product decision on the claim window.
- **`user/deletion.ts#purgeExpiredAccounts`** stays unwired. It ranges
  `.lt('purgeAfter', now)` without a lower bound, so it would also return every
  profile with no `purgeAfter`. The primary account purge is scheduled directly
  and does not need it.
- **Other retention promises** — security/audit logs (180 days or 2 years),
  notifications, support records (1 year), `clientMutationReceipts` TTL and the
  unreferenced-upload sweep. Same pattern, separate switches:
  `retention-purge.md`.

## Rollout (each step needs the owner's go-ahead)

1. Merge with the switch unset. CI deploys the crons to production; they return
   immediately.
2. `bunx convex env set TRASH_PURGE_MODE dry_run --prod`.
3. After 18:00/19:00 UTC, read the production logs for `trash_purge.items`
   (`scanned`, `ledgers`, `items`, `cappedLedgers` — a capped ledger holds more
   than 200 expired entries) and `trash_purge.ledgers` (`due`, `started`).
   Migrated legacy entries that were already deleted count here.
4. Owner reviews the counts and decides to enforce.
5. `bunx convex env set TRASH_PURGE_MODE enforce --prod`. Watch the next runs'
   logs, `trash_purge.ledger_done` / `trash_purge.ledger_failed`, and Convex
   insights.
6. Kill switch at any time: `bunx convex env remove TRASH_PURGE_MODE --prod`.
   Running chains stop at their next transaction and resume where they left off.
