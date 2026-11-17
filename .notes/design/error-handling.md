# DESIGN — Application error contract (G32)

**Status:** normative, 2026-08-24. Owns the thrown server wire payload, client narrowing and presentation,
render boundaries, retry behavior, and error diagnostics. `shared/appErrors.ts` is the executable single
source of truth for the closed code/key vocabulary.

**Authority:** measured facts → `SCHEMA.md` → this document → subsystem examples. Function-specific
discriminated result unions remain authoritative for expected business outcomes as described in §2.

---

## 1. One wire payload, shared by server and client

There is one vocabulary and no `authError`, provider-specific wrapper, or natural-language server error.

```ts
// shared/appErrors.ts — pure TypeScript, imported by Metro and Convex
export const APP_ERROR_CODES = [/* the closed list below */] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
export type AppErrorMessageKey = (typeof APP_ERROR_MESSAGE_KEYS)[number];

export interface AppErrorPayload {
  readonly code: AppErrorCode;
  readonly messageKey: AppErrorMessageKey;
  readonly params?: Readonly<Record<string, string | number>>;
}
```

`isAppErrorPayload(unknown)` validates code, message key, and finite raw params. Client code narrows only
through that guard (or `appErrorPayloadOf` for `ConvexError.data`), never with a cast and never by matching
`Error.message`.

```ts
// convex/lib/errors.ts — the only server constructor
import {ConvexError} from 'convex/values';
import type {
  AppErrorCode,
  AppErrorMessageKey,
  AppErrorParam,
  AppErrorPayload,
} from '../../shared/appErrors';

export const appError = (
  code: AppErrorCode,
  messageKey: AppErrorMessageKey,
  params?: Readonly<Record<string, AppErrorParam>>,
): ConvexError<AppErrorPayload> =>
  new ConvexError({
    code,
    messageKey,
    ...(params === undefined ? {} : {params}),
  });
```

Every public Convex failure the user can act on throws this constructor. Unexpected invariant failures
remain ordinary errors so production does not leak internals. Internal jobs record a scrubbed diagnostic
and a typed terminal state; they do not manufacture a client payload when no client is waiting.

### 1.1 Closed code groups

The executable array in `shared/appErrors.ts` is authoritative. The groups and intended meaning are:

| Group                | Codes                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| generic              | `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `RATE_LIMITED`                                                                                                                                    |
| account/router       | `ACCOUNT_DELETED`, `ACCOUNT_SUSPENDED`, `ONBOARDING_REQUIRED`, `HANDLE_REQUIRED`, `PROVIDER_VERIFICATION_FAILED`                                                                                                |
| identity/link        | `HANDLE_TAKEN`, `HANDLE_INVALID`, `HANDLE_RESERVED`, `HANDLE_COOLDOWN`, `LINK_CONFLICT`, `LINK_AMBIGUOUS`, `LINK_LAST_METHOD`, `EMAIL_IN_USE`, `LEGACY_NOT_FOUND`, `LEGACY_AMBIGUOUS`, `LEGACY_ALREADY_CLAIMED` |
| ledger access/admin  | `LEDGER_NOT_FOUND`, `LEDGER_FORBIDDEN`, `LEDGER_ARCHIVED`, `LEDGER_MAINTENANCE`, `CANNOT_ACT_ON_PEER`, `CANNOT_GRANT_ROLE`, `ROLE_NOT_LINKABLE`, `OWNER_MUST_TRANSFER`, `MEMBER_LIMIT_REACHED`                  |
| item/catalog/storage | `ITEM_NOT_FOUND`, `ITEM_FORBIDDEN`, `AMOUNT_INVALID`, `CATEGORY_INVALID`, `UPLOAD_INVALID`, `PHOTO_LIMIT_REACHED`                                                                                               |

`NOT_A_MEMBER` is deliberately absent. A non-member receives `LEDGER_NOT_FOUND`, the same as a missing
ledger, so an opaque id cannot become an existence oracle. `LEDGER_FORBIDDEN` means the caller is a known
member but lacks the role for a management action. `NOT_FOUND`/`FORBIDDEN` remain for non-ledger domains;
new ledger code must use the ledger-specific members.

### 1.2 Message keys and params

`APP_ERROR_MESSAGE_KEYS` is also closed, and `APP_ERROR_MESSAGE_KEYS_BY_CODE` rejects an unrelated
code/key pair at compile time and at the client wire guard. A server cannot compile a new key until the
shared list, the per-code map, and all five locale catalogs are updated. The client does not call
`t(payload.messageKey)`, because repository i18n rules require static literals. Instead
`ERROR_MESSAGE_RENDERERS` maps each allowed key to a function
whose body contains a literal `t('error.…')` call. Dynamic map lookup chooses a renderer; translation
itself remains statically typed.

Params contain only raw values needed by the sentence: countdown seconds, maximum count, or a role/lock
enum. Money uses integer `*Minor` plus sibling `currency`; the renderer formats it locally. Params never
contain email, phone, memo, place, photo URL/storage id, invite code, auth token, provider response, or a
pre-rendered sentence. Non-finite numbers and nested objects fail the client guard and render the generic
fallback.

An unknown code/key from a newer server is forward-compatible: the client renders static
`error.generic`, records `wire_contract_unknown` in development/diagnostics, and never displays
`Error.message`.

---

## 2. Return a result or throw an error

A function-specific discriminated union is correct when all branches are normal, expected outcomes that
the current screen can exhaustively render without treating the command as broken. Examples:

- `invites.redeem`: joined, already-member, requested/pending, invalid, expired, revoked, exhausted,
  email/account mismatch, unavailable, blocked, and rate-limited;
- invite preview: OK plus the terminal public link states;
- handle availability: available or a typed rejection reason (the subsequent claim still rechecks and
  throws if the command loses the race).

Throw `appError` when the caller cannot execute the function contract: missing authentication/onboarding,
account gate, permission failure, invalid command args, maintenance lock, ownership rule, or a mutation
race that requires a new user decision. A return union must not duplicate a thrown code for the same
branch. An unexpected bug or third-party outage is neither a fake business result nor a user-facing
natural-language throw; it follows §5.

The result/error boundary is part of each public function signature and test. `RedeemResult` therefore
keeps `RATE_LIMITED` as a result because the invite card owns a countdown; generic authenticated writes
throw `RATE_LIMITED` with `retryAfterSeconds`.

---

## 3. Client classification

Every query/mutation/action error passes through one classifier with operation context:

```ts
type OperationKind = 'query' | 'mutation' | 'action';
type ErrorSurface =
  'route' | 'field' | 'inline' | 'snackbar' | 'dialog' | 'boundary';

interface ErrorContext {
  operation: OperationKind;
  phase: 'background' | 'initial-read' | 'submit' | 'destructive-confirm';
  field?: 'handle' | 'email' | 'amount' | 'category' | 'photo';
}
```

Classification precedence:

1. A valid `AppErrorPayload` uses the code matrix in §4.
2. A disconnected `useConvexConnectionState()` classifies an otherwise-untyped request failure as
   network/offline. It is never detected by matching an English error string.
3. An invalid/unknown wire payload or ordinary exception is an unexpected fault: generic copy plus a
   scrubbed diagnostic. During render it reaches a boundary; during an awaited operation it stays in the
   owning screen and offers only a safe recovery.

Expected mutation rejections are caught in the event handler. They are not stored and re-thrown during
render to make an ErrorBoundary show them. Query wrappers expose pending/success/error explicitly and
render the screen state from `app-shell-and-screens.md` §3.2.

---

## 4. Presentation and recovery matrix

The code supplies a default surface; operation context selects the exact component. A less disruptive
surface is preferred when content remains safe, but permission/destructive failures may not be reduced
to a transient toast.

| Codes / condition                                                  | Surface                                               | Required recovery                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`                                                  | route                                                 | clear user-scoped query cache and route to signed-out; preserve only the SecureStore pending invite |
| `ACCOUNT_DELETED`                                                  | route                                                 | `/account/deleted`; restore/sign-out only                                                           |
| `ACCOUNT_SUSPENDED`                                                | route                                                 | `/account/suspended`; appeal/help and sign-out only; no app data routes mount                       |
| `ONBOARDING_REQUIRED`, `HANDLE_REQUIRED`                           | route                                                 | resume the exact onboarding step, preserving pending invite intent                                  |
| handle/email/provider/legacy field failures                        | field or inline form                                  | focus the field or show the typed account-resolution action; preserve safe user input               |
| `AMOUNT_INVALID`, `CATEGORY_INVALID`                               | field                                                 | amount/category row; never a dialog                                                                 |
| `UPLOAD_INVALID`, `PHOTO_LIMIT_REACHED`                            | per-photo tile/inline                                 | Remove or Retry only that tile; primary saved item remains intact                                   |
| singular `*_NOT_FOUND` query result                                | full inline state                                     | safe Back/List action; query APIs should prefer `null` where absence is an ordinary race            |
| `LEDGER_NOT_FOUND`, `ITEM_NOT_FOUND` from a mutation               | dialog then route                                     | explain changed access/data and leave the stale screen                                              |
| `FORBIDDEN`, `LEDGER_FORBIDDEN`, `ITEM_FORBIDDEN`                  | inline for read, dialog for attempted write           | remove forbidden affordance after roster/query refresh                                              |
| `LEDGER_ARCHIVED`, `LEDGER_MAINTENANCE`                            | persistent inline banner; dialog only after stale tap | refresh ledger; archived stays read-only, maintenance exposes retry after unlock                    |
| peer/role/ownership/member-cap rules                               | blocking dialog                                       | name the required admin action; no automatic retry                                                  |
| `RATE_LIMITED`                                                     | inline with countdown                                 | disable that action until `retryAfterSeconds`; no timer-driven request loop                         |
| background refresh failure with already-rendered in-memory content | snackbar/chip                                         | keep the current process view; one manual Retry, deduplicated per operation                         |
| disconnected before a live result                                  | inline connection state                               | reconnect instruction; write buttons preserve drafts and expose Retry                               |
| unexpected awaited fault                                           | inline generic or dialog if destructive               | preserve screen state, scrubbed diagnostic, safe manual retry only                                  |
| render fault                                                       | nearest boundary                                      | reset that tab/screen; root fallback only if shell/provider rendering failed                        |

Success is not shown with a toast when the resulting subscription makes it self-evident. Snackbars are
for background/transient status, never the only record of a destructive failure. Dialogs have a short
title, concrete consequence, and one primary recovery; they do not expose codes or technical text.

### 4.1 Retry safety

- Queries and idempotent discriminated-result mutations may retry manually with the same args.
- `RATE_LIMITED` waits for the server-provided countdown; automatic retries are forbidden.
- Convex handles OCC retries inside a mutation. The client does not add another loop.
- After an ambiguous network completion, first reconcile the live query. Entry create/update and comment
  create retain server `clientRequestId`/revision idempotency, but no command is persisted or replayed by a
  client queue. Invite, upload claim, delete/restore, membership, auth, and every other command require a
  fresh user decision; the UI says “결과를 확인하는 중” and waits for authority.
- Actions invoked from the client are exceptional. User intent should be committed in a mutation and the
  action scheduled server-side so a client disconnect cannot erase the intent.

---

## 5. Boundaries and diagnostics

`react-native-error-boundary` catches React render/lifecycle failures only. The provider tree owns a root
boundary with a BooKoo fallback (not the library's default `FallbackComponent`), and each real tab/detail
composition owns a resettable screen boundary. A Timeline render bug must not destroy Calendar or the
auth provider. Reset clears only that route subtree and navigates to a safe route; it never wipes MMKV,
SecureStore, or server data.

The root fallback provides Retry and Sign out. It uses static localized copy, supports dark mode and
screen readers, and cannot depend on a Convex query that may be the failing component. Development logs
include code, message key, operation name, route template, app version, platform, and component stack.
Production diagnostics use D6's closed local allowlist and are not automatically persisted or uploaded.

Never log params wholesale. The diagnostic allowlist excludes user/document ids, handle/email, money,
memo, place, photo/storage URLs, invite codes, auth/provider payloads, and route query values. An error
fingerprint is code + operation + route template + release, not the natural-language message.

Provider SDK cancellations are local outcomes and produce no red diagnostic: Apple/Google typed cancel
codes are checked; Kakao's documented platform limitation is isolated in its adapter. Provider raw
messages never cross into the shared classifier.

---

## 6. Account suspension is a hard gate

G55's missing error is part of this contract. `beforeSessionCreation` rejects a suspended profile with
`ACCOUNT_SUSPENDED`, and `requireActiveProfile` repeats the check so an already-live session stops on its
next function call. The root user projection includes the suspended gate state, and the auth stage routes
only to `/account/suspended`; that screen exposes localized appeal/help and Sign out, never ledger data.

Soft-deleted accounts remain different: they may establish the restricted session needed to reach the
30-day restore screen. Hard-purged accounts cannot establish a session. The client does not infer any of
these states from `FORBIDDEN`.

`requireAppAdmin` is the only global operations-role gate. It composes `requireOnboarded`, accepts only
`appRole === 'ADMIN'`, and otherwise throws `FORBIDDEN/error.forbidden`; SUPPORT is not write authority.
Every D3 content/config/feedback-ops query and mutation calls it before its first domain read. The
ADMIN-only route row is a UX hint, never the security boundary.

---

## 7. Verification requirements

- Shared tests prove unique codes/keys and accept/reject valid/malformed unknown wire payloads.
- Server tests assert every public user-action failure is `ConvexError<AppErrorPayload>`, and that ordinary
  internal exceptions do not expose their message in production.
- A source check bans `authError(` and direct client-visible `new ConvexError` outside
  `convex/lib/errors.ts`; it also checks every `appError` message key against the closed shared list.
- Locale checks require identical keys for ko/en/ja/zh/id and one static renderer per allowed message key.
- Client tests cover every code's default surface, route gates, missing-key fallback, no dynamic `t`,
  countdown behavior, cached/offline behavior, and no blind retry after ambiguous completion.
- Render tests throw inside each tab and root boundary to prove containment, reset, dark theme,
  accessibility labels, and sign-out recovery.
- Logging tests feed payloads containing email, amount, ids, URLs, and invite codes and prove none reach
  the diagnostic event.

With this contract and `shared/appErrors.ts`, G32 has one executable union and one client/server handling
model rather than a collection of prose-only helper names.
