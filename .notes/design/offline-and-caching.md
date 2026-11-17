# BooKoo — server authority and connectivity contract

Status: **normative** (supersedes the 2026-08-24 encrypted-cache/outbox
contract on 2026-09-02). `SCHEMA.md` remains authoritative for server fields,
indexes and idempotency; `privacy-and-compliance.md` owns data classification.

## 1. Product promise

BooKoo has only two client-side write states:

| State     | User meaning                                                                              |
| --------- | ----------------------------------------------------------------------------------------- |
| editing   | The draft exists only in the current component/process and may disappear after a restart. |
| committed | The Convex mutation returned an authoritative result.                                     |

There is no durable local pending state. The app never says that an entry,
edit, comment or attachment was saved until its server mutation succeeds. A
disconnected save remains on the form, explains that a connection is required,
and exposes the same primary action as Retry. Comments keep their current text
and attachments visible and expose an explicit Retry action.

## 2. Server is the only data authority

Ledgers, entries, comments, members, rollups, invitations and profiles are read
from live Convex queries. `ConvexQueryCacheProvider` may retain subscriptions in
memory for the current process and session, but no query result is persisted for
the next launch. A restart while offline therefore shows the normal loading or
connection-required state; it never paints an old ledger from disk.

Ordinary MMKV is restricted to non-sensitive device preferences and rendering
hints such as theme, locale, the active-navigation ledger id, lock booleans, notice watermark
and the PII-free session hint. It must never receive:

- server query results;
- entry, comment, member or ledger content;
- mutation arguments, request ids, amounts, memo text or content-bearing
  document identifiers (the active-navigation ledger id is the sole routing
  exception and grants no access without the server membership check);
- photo paths, storage ids, invite codes, credentials or exports.

Authentication sessions and tokens stay in SecureStore. App-lock PIN verifier,
biometric choice and lockout state remain in their independent SecureStore
record. Pending invitation codes remain in their independent device-only
SecureStore record. Removing the retired cache must not weaken these controls.

## 3. Writes and idempotency

`items.create`, `items.update` and `comments.create` call their Convex mutations
directly. A new set of mutation arguments creates an RFC 4122
`clientRequestId`; an unchanged manual retry in the same mounted form reuses
that id. The server's request hash, author scope, unique indexes, update receipt
and `expectedUpdatedAt` conflict contract remain unchanged. This protects an
ambiguous online retry without creating a client queue or durable command.

Before a write, the UI checks the shared Convex connection state. If it is not
connected, it does not invoke the mutation, clear the form, navigate away or
show success. If connectivity drops during a mutation, the UI keeps the draft
and shows the same connection/retry guidance. A repeated attempt may reuse the
form values and its in-memory request id. Changing the arguments starts a new
request id. Neither value survives a process restart.

No other mutation may use the retired outbox or report a local pending success.
Existing upload, delete/restore, membership, invite, account, security, export,
category and settings actions keep their current server response/error surface
and remain unqueued. Photo uploads remain POST → claim → attach after a real
server item id exists.

## 4. Retired encrypted storage migration

The former encrypted MMKV instance `bookoo.sensitive.v1`, SecureStore key
`bookoo.sensitive-key.v1`, account-scope marker and provisioning marker are
retired. On launch a render-independent best-effort cleanup:

1. reads the old key if it still exists;
2. clears the old encrypted instance only with that key;
3. deletes the old key and non-sensitive markers;
4. catches every local cleanup failure and continues boot immediately.

It never creates a replacement key, never opens the old store as plaintext,
never reaches Convex and can never delete server data. If the file/key pair is
already corrupt, any orphaned file remains encrypted and inert rather than
blocking launch. A later launch may retry marker/key cleanup.

There is no “Local encrypted data is unavailable”, reset-local-data recovery
screen, pending counter, queue sheet, queue diagnostic or sign-out queue warning.

## 5. UI and accessibility

- a persistent connectivity loss may be summarized non-destructively, but it
  never implies pending writes exist;
- forms keep entered values and focus context when a save fails;
- the error copy describes impact and action, not WebSocket, queue, mirror or
  encryption internals;
- Retry is a named 44×44 pt (iOS) / 48×48 dp (Android) target and is announced
  through a polite live region;
- loading uses the current screen geometry and never substitutes stale private
  content from another account or previous launch.

## 6. Acceptance

- missing/corrupt legacy store or key cannot block boot;
- plaintext MMKV contains no private server data or mutation arguments;
- create, update and comment call Convex directly and keep `clientRequestId`;
- disconnected writes stay visibly uncommitted and retryable;
- restart while disconnected does not restore prior ledger content;
- login, logout and A → B → A account replacement remount the in-memory query
  cache and never expose another account's data;
- app lock, biometrics, auth SecureStore and pending-invite custody still pass;
- source, translations, tests and current docs contain no active outbox, query
  mirror, pending-count or encrypted-cache recovery contract.
