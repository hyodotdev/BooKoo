# Retention purges — mapping, open questions and rollout

Status: implemented 2026-10-31 on `feat/retention-purge`, beside the trash
purge (`trash-purge.md`). Everything ships **off**. The owner
answered all four the same day: Q1 180 days, Q2 governance audit stays with its
ledger, Q3 and Q4 support records and moderation reports are not purged.

Dev dry run (2026-10-31, `amiable-cormorant-231`, both switches `dry_run`, then
removed): `retention_purge.done` 27 ledgers, 0 FEED rows, 0 notifications,
16 expired receipts; `upload_sweep.done` 1 scanned, 1 referenced (a live
avatar), 0 orphans. An independent read-only count gave the same numbers, and
row counts were unchanged afterwards. A second dry run after the `authAudit`
and `legalEvents` stages were added walked all five stages without a failure:
0 `authAudit`, 0 `legalEvents`, 0 kept consents (dev holds nothing older than
180 days in either table, as an independent count confirmed), 16 receipts. On
dev those two stages only proved they run; their selection is pinned by the
unit tests.

## The promise

Privacy policy §5, all five locales (`public/*/legal/privacy`):

> 내보내기 파일과 실패 기록은 완료 후 최대 7일, 보안·감사 기록은 목적별 최대
> 180일 또는 2년, 지원 기록은 해결 후 최대 1년 보관합니다.

The English, Japanese, Chinese and Indonesian texts say the same and are no
more specific: none says which records get 180 days and which get 2 years. The
internal matrix (`privacy-and-compliance.md` §3) adds periods the public text
does not mention, and in one row contradicted it (3 years for auth/legal
evidence; corrected to 180 days with Q1).

## Mapping

| Promise | Table and field | Period | State |
| --- | --- | --- | --- |
| Trash 30 days | `ledgerItems.deletedAt`, `ledgers.purgeAfter` | 30 d | `trash-purge.md`, `TRASH_PURGE_MODE` |
| Export files and failures 7 days | `dataExports` / `dataExportFiles.expiresAt` | 7 d | Already enforced without a cron: `exports.worker` schedules `cleanup` at `expiresAt` |
| Notifications (internal matrix: "180 days maximum"; the public text does not name them) | `notifications.createdAt` via `by_ledgerId_createdAt`, per ledger plus `.eq('ledgerId', undefined)` | 180 d, `NOTIFICATION_RETENTION_MS` | **Built**, `RETENTION_PURGE_MODE` |
| Audit feed (SCHEMA §3.8) | `ledgerAuditLog` where `retention = 'FEED'`, `by_ledgerId_retention_createdAt` | 180 d, `AUDIT_FEED_RETENTION_MS` | **Built**, `RETENTION_PURGE_MODE`. v1 writes no FEED rows, so it deletes nothing today |
| Offline update receipts (internal matrix: 30 days) | `clientMutationReceipts.expiresAt`, `by_expiresAt` | 30 d from the update | **Built**, `RETENTION_PURGE_MODE` |
| Claimed uploads nothing references | `uploads` where `referencedCheckedAt` is unset, `by_referencedCheckedAt` | `UPLOAD_CLAIM_TTL_MS` (24 h) after the claim | **Built**, `UPLOAD_SWEEP_MODE` |
| Governance audit | `ledgerAuditLog` where `retention = 'AUDIT'` | ledger lifetime + 30 d (Q2: part of the ledger) | Deleted with the ledger by `purgeLedgerBatch`; no separate purge |
| Account security trail | `authAudit` via `by_event_createdAt`, per event | 180 d, `SECURITY_RECORD_RETENTION_MS` (Q1) | **Built**, `RETENTION_PURGE_MODE` |
| Consent evidence | `legalEvents` via `by_createdAt` | 180 d (Q1), except the newest row per (user, kind) of a live account | **Built**, `RETENTION_PURGE_MODE` |
| Support records, resolution + 1 year | `feedback` (`status`, `by_status_createdAt`) | 1 y after resolution | Not purged (Q3). Nothing marks a record resolved, so none is due |
| Moderation reports | `contentReports` (`status`, `handledAt`, `by_status_createdAt`) | none stated | Not purged (Q4) |

## What runs

`convex/crons.ts`; both jobs live in `convex/maintenance/retention.ts`.

| Cron (UTC) | Function | Scope |
| --- | --- | --- |
| daily 22:00 | `purgeRetention` | One chain with five stages. `ledgers`: pages every ledger 25 at a time (deleted, orphaned and locked ones too — no restore window applies) and deletes its FEED rows and notifications older than 180 days. `unscoped`: notifications with no `ledgerId`. `receipts`: `clientMutationReceipts` with `expiresAt ≤ now`. `authAudit`: rows older than 180 days, one `by_event_createdAt` range per event, the cursor naming the event to resume. `legalEvents`: rows older than 180 days, 100 per transaction, except the newest of each kind for an account whose profile exists and is not purged. At most `CASCADE_BATCH` deletes per transaction; a full batch reruns the same page, stage or event. |
| every 6 h | `sweepOrphanUploads` | Pages the unchecked set (`.eq('referencedCheckedAt', undefined)`), 50 per transaction. Skips claims younger than 24 h. A referenced upload is stamped `referencedCheckedAt` and leaves the set; an orphan loses its blob, then its row. |

Referrer check, per purpose. Anything short of proof that nothing names the
blob is `undecided`, and an undecided upload is left alone:

- `AVATAR`: the owner's `userProfiles.avatarStorageId` equals the blob.
- `ITEM_PHOTO` / `COMMENT_ATTACHMENT`: an `itemPhotos` row has it as
  `storageId` (`by_storageId`), or one of the entry's photo rows has it as
  `thumbStorageId` (`by_itemId_deletedAt_order`, at most
  `UPLOAD_REFERRER_SCAN_LIMIT` rows; past that it is undecided). An upload with
  no `itemId` is undecided.

Guards, each pinned by `test/convex/retentionPurge.test.ts` against a fake
index that orders `undefined` below every number, as Convex does:

- Each switch is read alone. `TRASH_PURGE_MODE=enforce` enables neither of the
  new jobs, and `RETENTION_PURGE_MODE` does not enable the sweep.
- Unset or anything but `dry_run`/`enforce` → no reads.
- Every range has a numeric lower bound (`gte(…, 0)`); the sweep's
  `.eq(undefined)` is an equality on purpose.
- Every audit range includes `.eq('retention', 'FEED')`, so AUDIT rows are
  never read.
- A live account's newest consent of each kind is never deleted; a purged or
  missing account's is.
- `dry_run` writes nothing: no delete, no patch, no blob delete.

## Not built, on purpose

- **The `_storage` pass of `uploads.sweepOrphans`** (SCHEMA §5.1, §7.5.4:
  "deletes blobs older than `UPLOAD_CLAIM_TTL_MS` with no `uploads.by_storageId`
  row"). Built as written it would destroy every migrated legacy photo and
  avatar (`migrate/files.ts` stores blobs without an `uploads` row) and every
  live export file (`exports/actions.ts` likewise). §7.5 rule 1, "every blob
  has an `uploads` row", is false for those blobs. A safe version needs a
  referrer check against `itemPhotos.by_storageId`, a profile avatar index and
  a `dataExportFiles` storage index; it closes only the crash window between
  the upload POST and `claimUpload`.
- **A replaced avatar after its first check.** Once the sweep stamps an avatar
  referenced, replacing it later leaves the old blob behind, because
  `user.updateProfile` / `completeProfileStep` do not free the previous avatar
  (SCHEMA §6 row 11 says the attaching mutation should). Unstamped replaced
  avatars are swept.
- **`user/deletion.ts#purgeExpiredAccounts`** stays unwired with its
  lower-bound defect (`trash-purge.md`).
- **Expired `emailLinkCodes`.** Abandoned email-link codes (hash plus the
  normalized address) stay until account purge; `by_expiresAt` is commented
  "expiry cron" but nothing reads it. Small, but it is personal data with a
  ten-minute purpose.

## Owner decisions and questions

**Q1 — answered 2026-10-31: 180 days.** Every `authAudit` row and every
`legalEvents` row goes 180 days after it was written, within the public "180
days or 2 years" cap. One exception, added so a live account keeps proof of
what it agreed to: the newest `legalEvents` row per (user, kind) stays while
the account's profile exists and is not purged; after the purge it goes at the
first run where it is itself older than 180 days. `privacy-and-compliance.md` §3 now says the same. Earlier design
text that keeps auth/legal evidence for three years (`RECONCILIATION.md` D4,
`auth-onboarding.md` deletion step 9) is superseded.

The consent stage re-reads kept rows nightly (three per live account older
than 180 days, 100 per transaction). That is fine at BooKoo's size; if it
grows, mark kept rows instead.

**Q2 — answered 2026-10-31: the governance audit is part of the ledger.** It
is the ledger's Activity history (creation, renames, currency and timezone
changes, invites, joins, removals, role and ownership changes, category edits,
entry deletes and restores). It stays while the ledger exists and is destroyed
by the ledger purge, as `privacy-and-compliance.md` §3 already said. No code
change. The public policy text was not edited: changing it changes the hashed
document version that `legalEvents` records.

**Q3 — answered 2026-10-31: support records are not purged.** No code sets
`feedback.status` past `NEW` or records a resolution time, and the migrated
legacy opinions (2017–2020) are in the same state, so no record is "resolved"
and none falls under the policy's "resolution + 1 year". The constraint this
leaves: whatever change first marks a record resolved (a status edit, an admin
resolve action, a `resolvedAt` field) must ship the 1-year purge with it, or
the policy is broken from that record on.

**Q4 — answered 2026-10-31: moderation reports are not purged.**
`contentReports` keeps its rows; the public policy names no period for them.

## Rollout (each step needs the owner's go-ahead)

The switches are independent; each can follow these steps on its own.

1. Merge with both switches unset. CI deploys the crons; they return
   immediately.
2. `bunx convex env set RETENTION_PURGE_MODE dry_run --prod` (and/or
   `UPLOAD_SWEEP_MODE`).
3. After 22:00 UTC, read `retention_purge.done` (`ledgers`, `feed`,
   `notifications`, `receipts`, `authAudit`, `legalEvents`, `consentKept`,
   `cappedRanges` — a capped range held more than 200 rows, so its count is a
   floor). The sweep logs `upload_sweep.done` every
   six hours (`scanned`, `young`, `referenced`, `undecided`, `orphans`,
   `orphanBytes`); spot-check a few orphan rows before enforcing.
4. Owner reviews the counts and decides to enforce.
5. `bunx convex env set RETENTION_PURGE_MODE enforce --prod`. Watch the next
   run's log and Convex insights.
6. Kill switch at any time: `bunx convex env remove RETENTION_PURGE_MODE --prod`
   (or `UPLOAD_SWEEP_MODE`). A running chain stops at its next transaction.
