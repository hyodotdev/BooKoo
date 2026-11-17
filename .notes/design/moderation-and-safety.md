# BooKoo — reporting, blocking, and moderation enforcement

Status: **normative D6 contract** (2026-08-24). This document resolves G36. It applies to public handles,
shared-ledger comments, item memos, and ledger membership without changing financial truth.

## 1. The non-negotiable shared-ledger rule

A user block hides or mutes **identity and communication surfaces**, never accounting rows or totals.
An item remains visible with its amount, type, category, date, and memo because the shared ledger must
balance and its audit/history must remain intelligible. On rows authored by a blocked relationship, the
avatar/handle becomes localized “차단한 사용자”; comments are collapsed without body text; activity push
from that user is muted. The user may reveal a collapsed comment for evidence and can still report it.

Blocking an existing co-member does not remove either member and does not change roles. The confirmation
states this before commit, then offers Leave this ledger and, for ADMIN+, Remove member. Removing a member
remains the governance mutation and may be combined with the existing ledger-specific rejoin block.

User blocking and `ledgerMembers.blockedAt` are distinct:

- `userBlocks` is a directional account-to-account safety choice across handles, invites, comments, and
  notifications; unblock deletes that row.
- `ledgerMembers.blockedAt` is an ADMIN decision that prevents that removed member from rejoining one
  ledger. It persists with the soft-removed membership row.

Self-block is rejected. `blocks.create` is idempotent through
`by_blockerUserId_blockedUserId`; `blocks.remove` can delete only the caller's row. Neither subject is
notified.

Settings > Privacy and safety > Blocked accounts is an explicit management exception to the discovery
rule: `blocks.listMine` paginates the caller's own rows newest-first at 30 through
`by_blockerUserId_createdAt`, then loads at most 30 current public profiles so the caller can identify and
unblock the intended account. The screen never exposes who blocked the caller. Missing/deleted profiles
remain removable generic rows; an unblock never requires the target profile to exist.

## 2. What a user block enforces

The check is symmetric for interaction: if A blocked B **or** B blocked A, neither may discover the other
through `/@handle`, send a direct handle invite/request, redeem/join a ledger containing the other, or
receive a push caused solely by the other. Public profile/handle queries collapse blocked and missing to
the same unavailable result so the direction is not disclosed.

Invite creation with `inviteeUserId` checks the actor/target pair before writing. Email-bound invites
cannot reliably resolve the future account and therefore enforce at redeem. `invites.redeem`,
`joinRequests.create`, and approval all check the candidate against **every live member** of the target
ledger in both directions. With the 200-member hard cap this is at most 400 exact pair lookups, still
bounded and far below Convex transaction limits. A hit returns the existing `BLOCKED` result, burns no
invite use, creates no redemption/membership/notification, and reveals neither the member nor direction.

An already-live member receives `ALREADY_MEMBER` before the join block check: the block cannot pretend an
existing financial relationship does not exist. The client then applies the shared-ledger presentation
rule above. A request that was safe when created but is blocked before approval transitions to terminal
`BLOCKED`; it is not approvable and the requester sees only “요청을 진행할 수 없어요.”

The live-ledger roster supplies the pair result for current-member item/member surfaces. It cannot cover
comments written by a former member, so every `comments.list` page independently loads at most 20 distinct
author profiles and performs both exact block-pair reads for each author. This is a bounded 82-document
page including the 20 comments, item, membership gate, profiles, and block rows. Item rows whose authors
are no longer live members keep all accounting and memo/place content but render a generic former-member
identity; the client does not perform an unbounded profile fallback.

Before creating a person-caused notification row or push, the server uses the same two-direction pair
check. A block suppresses social activity such as `COMMENT_ADDED`; direct invite/join flows have already
failed before notification creation. Mandatory account or ledger-state events such as removal, role
change, archival, and suspension remain visible because hiding them would conceal a real authorization
change, but any blocked actor identity renders through the same placeholder. Item-activity push performs
the pair check per bounded recipient in `notifications-push.md`.

## 3. Report entry points and validation

Report actions ship at:

- comment long-press/overflow;
- item detail overflow for abusive memo/place content;
- `/@handle` and member-profile overflow;
- ledger Settings > Report ledger.

The sheet requires one of the closed `reportReasonValidator` values and allows an optional 500-character
plain-text explanation. It shows what data is sent, a safety/support link, Block user when applicable,
and Cancel. `reports.create` requires an active onboarded profile, uses `reportCreate` (10/account/day),
verifies the subject exists and the reporter may currently see it, derives and stores `contextLedgerId`
server-side for item/comment, rejects self-report, and inserts `OPEN`. It never tells the subject or
includes report text in logs, pushes, analytics, or diagnostics.

Duplicate reports are allowed because separate incidents can matter; the ops UI groups by subject without
changing source rows. A successful submission confirms receipt and the 24-hour **triage/acknowledgement**
target, not a guaranteed final decision.

## 4. Queue and action pipeline

Only `requireAppAdmin` may access the moderation queue. SUPPORT may receive tickets but has no database
write authority. The ADMIN route is server-gated, paginates `OPEN` oldest first at 30 rows, and exposes no
reporter identity outside the case detail needed to respond.

State invariants:

| Status | Required fields |
|---|---|
| `OPEN` | no acknowledgement, handler, or resolution |
| `REVIEWING` | `acknowledgedAt`, `acknowledgedByUserId` |
| `ACTIONED` | acknowledgement + `handledAt` + `handledByUserId` + a resolution other than `NO_ACTION` |
| `DISMISSED` | acknowledgement + `handledAt` + `handledByUserId` + `resolution:'NO_ACTION'` |

`reports.acknowledge` performs `OPEN → REVIEWING`. `reports.resolve` re-reads the subject/current state and
applies exactly one typed remedy in the same mutation as the terminal report transition:

| Resolution | Effect |
|---|---|
| `NO_ACTION` | dismiss with a closed reason code; no domain write |
| `COMMENT_REMOVED` | soft-delete the reported comment and decrement its parent counter once |
| `ITEM_CONTENT_REDACTED` | replace memo with `''` and remove place only; preserve money/date/category/author/rollups |
| `MEMBER_REMOVED` | soft-remove the reported user from `contextLedgerId` through the existing rank/last-owner invariants |
| `ACCOUNT_SUSPENDED` | set target `userProfiles.appRole='SUSPENDED'`, deny new sessions and every live-session capability through existing auth guards, and append auth audit |

A remedy not compatible with the subject/context is rejected before writes. `MEMBER_REMOVED` cannot
remove the sole OWNER; ownership must first be transferred through the audited governance path.
`ACCOUNT_SUSPENDED` never deletes shared rows. Reinstatement is a separate dual-confirmed ADMIN action,
adds an auth-audit row, and does not automatically restore memberships or deleted content.

Every terminal action stores only the typed resolution and optional opaque `ticketRef`; the mutation trims
it and accepts only `/^[A-Za-z0-9._:-]{1,128}$/`. Free-form internal notes remain in the access-controlled
support system. Reporter outcome notification is generic (“검토가
완료됐어요”), contains no target/remedy detail, and respects notification preferences. The subject is not
notified by the report system; account/membership screens explain any restriction through their own
existing state.

## 5. 24-hour operations commitment

The public safety/support page names the contact and says reports are acknowledged/triaged within 24
hours. Before release, the owner names a primary and backup responder covering weekends/holidays, enables
an oldest-open view, and rehearses: report → acknowledgement → evidence review → typed action/dismissal →
appeal. Any `OPEN` report older than 20 hours is an ops warning; 24 hours is a release incident. This is a
runbook/SLA, not a fake cron that auto-decides abuse.

Serious imminent harm uses the public emergency guidance and applicable authorities; BooKoo does not
promise real-time emergency response. Suspended users see only localized reason-category/help/appeal and
Sign out, never reporter identity or private ledger routes.

## 6. Accessibility and privacy

Report/block controls have explicit names, destructive confirmations, focus return, and live-region
success/failure. Blocked identity placeholders are not color-only. Screen-reader output never reads the
blocked handle accidentally through a nested avatar. Moderation data is excluded from personal/ledger
member exports except the reporter's own submitted report records and legally required operator records;
reporter identity is never exposed to the subject.

## 7. Acceptance

- Server tests cover self/duplicate block/unblock, both block directions, handle discovery, direct and
  email/link invite paths, all-member redeem/approval checks, ALREADY_MEMBER ordering, block-list
  pagination/missing profiles, former-member comment authors, no use burn, and no notification leak.
- Client tests prove blocked comments/identity are hidden while financial rows and every rollup total stay
  identical; leave/remove remedies are reachable.
- Report tests cover subject authorization, 500-character/rate limits, reporter confidentiality, all state
  invariants, every remedy, incompatible remedies, last-owner refusal, suspension of live/new sessions,
  appeal, and idempotent counter changes.
- Release evidence names the two responders, support URL, five-locale copy, and a timed under-24-hour
  rehearsal.
