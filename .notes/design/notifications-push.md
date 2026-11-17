# Design — Notifications and push delivery

Status: **normative for R5/G20–G21, amended by D6/G36**. `SCHEMA.md` owns stored tables and the inbox kind
union; this document owns push-only payloads, delivery bounds, coalescing, receipts, channels,
permissions, tap routing, and notification block filtering.

Official runtime contracts used here:

- [Expo Push sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo Notifications API](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)

The design assumes Expo Push Service, not direct APNs/FCM. An Expo ticket means only that Expo accepted a
message; the receipt is the later provider hand-off result. Expo recommends checking receipts after 15
minutes, receipts disappear after 24 hours, and `DeviceNotRegistered` means the exact token must stop
receiving sends. A function scheduled by a Convex mutation is atomic with that mutation; actions themselves
have side effects and are not automatically retried. The workflow below encodes both facts explicitly.

---

## 1. Two notification classes

### 1.1 Inbox-backed events

Low-frequency, personally addressed events write a `notifications` row first, then schedule a push. The
canonical stored union is:

```ts
type NotificationKind =
  | 'LEDGER_INVITE'
  | 'JOIN_REQUESTED'
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'OWNERSHIP_TRANSFERRED'
  | 'LEDGER_ARCHIVED'
  | 'COMMENT_ADDED'
  | 'LEGACY_CLAIMED'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';
```

The row is the durable user-visible record. A push outage never rolls it back. `JOIN_REJECTED` is in-app
only by product choice; all other kinds follow their recipient preference and channel mapping below.

Every person-caused social notification calls `hasBlockRelationship(actorUserId, recipientUserId)` before
writing its row or scheduling push. The helper performs the two exact
`userBlocks.by_blockerUserId_blockedUserId` reads; a hit creates neither artifact. This applies to
`COMMENT_ADDED`, while direct invite/join paths already fail their stronger pair/all-member gate before
notification creation. Mandatory authorization/state events (`MEMBER_REMOVED`, `ROLE_CHANGED`,
`OWNERSHIP_TRANSFERRED`, `LEDGER_ARCHIVED`, suspension/system notices) are not hidden; they render a
blocked actor as the generic placeholder and may still alert because the state change itself affects the
recipient. No notification reveals which direction caused a block.

### 1.2 Item activity is push-only

An item addition does **not** write a `notifications` row. Otherwise one busy ledger eventually creates
more inbox rows than items. Its scheduled payload is closed and typed:

```ts
type ItemAddedPushPayload = {
  kind: 'ITEM_ADDED';
  ledgerId: Id<'ledgers'>;
  itemId: Id<'ledgerItems'>;
  actorUserId: Id<'users'>;
  ledgerTitle: string;
  category:
    | {kind: 'PRESET'; key: string}
    | {kind: 'CUSTOM'; label: string};
  amountMinor: number;
  currency: string;
  createdAt: number;
};
```

`amountMinor` is an integer and `currency` is the item's ISO 4217 currency. There is no recipient-currency
conversion: the same ledger fact is formatted in each recipient's locale through `shared/money.ts`.
`ledgerTitle` and a custom category label are user text and are truncated before they enter the payload.
The Expo `data` object contains only `{kind, ledgerId, itemId}` and remains far below the provider payload
limit.

Updates and deletes do not emit item-activity pushes in v1. The reactive timeline and the unseen badge show
them; pushing every correction recreated the legacy app's noisiest behaviour.

---

## 2. Hard bounds and schema support

```ts
export const PUSH_RECIPIENT_SCAN_LIMIT = 200;  // equals MEMBER_SCAN_LIMIT
export const PUSH_DEVICE_LIMIT_PER_USER = 8;
export const PUSH_EXPO_BATCH_SIZE = 100;
export const ITEM_PUSH_COALESCE_MS = 10 * 60_000;
export const PUSH_RECEIPT_DELAY_MS = 15 * 60_000;
export const PUSH_RECEIPT_MAX_ATTEMPTS = 3;
```

`ledgerMemberState` gains `lastItemPushAt?: number`. `userProfiles` gains the all-or-none pair
`quietHoursStartMinute?: number` and `quietHoursEndMinute?: number`, interpreted as minutes after midnight
in `preferredTimeZone`. Both values are integers in `0..1439`; equal values are rejected. Both absent means
disabled. A range may cross midnight.

`push.registerToken` upserts by token, then reads the registering user's live rows with
`.take(PUSH_DEVICE_LIMIT_PER_USER + 1)`. If the upsert creates a ninth live token, the mutation disables
the least-recently-updated token (never the token just registered) in the same transaction. Thus normal
operation preserves the eight-token invariant; the send workflow's ninth-row check is defense in depth.

The item-create mutation already has every field needed for `ItemAddedPushPayload`. Its final operation is:

```ts
await ctx.scheduler.runAfter(0, internal.notifications.sendItemAdded, payload);
```

Scheduling is atomic with the four domain writes: a failed mutation schedules nothing, and a committed item
cannot lose the intent because the client disconnected. The scheduler's own system document is not a BooKoo
domain write, but the post-commit workflow is still costed below.

---

## 3. Item-push workflow and exact read set

`internal.notifications.sendItemAdded` is an `internalAction`. It first calls one internal mutation,
`claimItemPushRecipients(payload)`, which performs this bounded transaction:

1. Read live `ledgerMembers.by_ledgerId_deletedAt_role` with
   `.take(PUSH_RECIPIENT_SCAN_LIMIT + 1)`; an overflow is an invariant error.
2. Read `ledgerMemberState.by_ledgerId_userId` with the same bound and build a user-id map.
3. Drop the actor, missing state, `muted`, and `notifyNewItem === false` rows.
4. For each remaining user, read `userProfiles.by_userId`. Drop a missing/deleted profile,
   `pushEnabled === false`, `notifyLedgerActivity === false`, or a recipient currently inside their quiet
   hours.
5. For each remaining recipient, perform both exact actor/recipient block-pair reads. Drop the recipient
   if either directional row exists; the action never reveals which direction matched.
6. Drop a recipient whose `lastItemPushAt` is less than ten minutes old. Otherwise patch that one state
   row to the payload's `createdAt`; concurrent item actions contend on the row, retry, see the fresh value,
   and only one claims the window.
7. For each claimed user, read `pushTokens.by_userId_disabledAt` with
   `.take(PUSH_DEVICE_LIMIT_PER_USER + 1)`. More than eight live device rows is an invariant error, never an
   accidental fan-out; `push.registerToken` normally makes that state impossible.
8. Return `{pushTokenId, token, locale}` records to the action. Token strings are never logged.

Worst case at the 200-member cap: at most 200 live membership rows + 200 member-state rows + 199 profiles +
398 directional block rows + 1,592 live token rows = **2,589 documents read**, with at most 199 state
patches. A realistic eight-member ledger reads at most 8 + 8 + 7 + 14 + 56 = **93 documents** and patches
at most seven state rows. It schedules one action per item, but only the first action in each recipient's
ten-minute window sends to that recipient.

This work is outside the item mutation and cannot create rollup OCC conflicts. The item mutation remains four
domain writes; `SCHEMA.md` §5.1 reports both that synchronous cost and this bounded asynchronous cost.

Quiet hours suppress item-activity pushes without a catch-up banner. The unseen dot remains accurate. Inbox-
backed governance events are not silently discarded; they remain in the inbox and may omit only the external
banner according to the same quiet-hours preference.

---

## 4. Rendering, sending, retry, and receipts

The action formats title/body per returned token locale. Preset category names use the locale's
`category.<key>` translation; custom labels remain user text. Money is formatted from raw
`{amountMinor, currency}`. Neither the stored row nor the scheduled payload contains a formatted amount or a
sentence rendered in the actor's locale.

Messages are chunked to `PUSH_EXPO_BATCH_SIZE = 100` and sent to Expo. HTTP 429, HTTP 5xx, and network errors
receive bounded exponential retry with jitter inside the action. A permanent HTTP 400/payload error is logged
without its token or user text and raises an operations alert; blindly retrying it is forbidden.

For each successful ticket, the action calls `recordPushTickets`, passing only the receipt id and
`pushTokenId`. That mutation atomically schedules `checkPushReceipts` for 15 minutes later. Immediate ticket
`DeviceNotRegistered` errors patch the corresponding token's `disabledAt` instead.

`checkPushReceipts` fetches at most 1,000 ids per Expo request. Receipt `DeviceNotRegistered` patches the exact
token's `disabledAt`. A missing receipt or transient response schedules another check with its attempt count;
after three attempts it raises an operations alert and stops before Expo's 24-hour receipt expiry. Other
provider errors are recorded without notification content or token strings.

Expo delivery is best-effort and may be duplicated or omitted. BooKoo promises a bounded send workflow, not
exactly-once device presentation. The inbox remains the authority for inbox-backed events.

---

## 5. Android channels and permission timing

Create all Android channels before obtaining a push token:

| Channel id | Importance | Kinds |
|---|---|---|
| `ledger-activity` | default | `ITEM_ADDED`, `COMMENT_ADDED` |
| `ledger-social` | high | invite, join-request, joined/left events |
| `ledger-governance` | high | role/removal/ownership/archive, `LEGACY_CLAIMED`, `SYSTEM` |

`ANNOUNCEMENT` uses `ledger-social`. No v1 push requests critical or time-sensitive interruption.

The app does not ask on first launch. After the user creates or joins their first ledger, it shows an inline
explanation; the explicit enable button calls `requestPermissionsAsync`. A denial is not immediately prompted
again: settings shows the current OS state and a system-settings link. iOS `AUTHORIZED` and `PROVISIONAL` are
usable; Android creates the channels before requesting/obtaining the token. A granted response calls
`getExpoPushTokenAsync({projectId})` and upserts the token by its token string.

Push registration is tested in a development build, not assumed from Expo Go. Credential creation and EAS
builds remain operational setup, not part of this design task.

---

## 6. Tap routing and foreground behaviour

`src/features/push/routeForNotification.ts` accepts the closed kind plus typed ids and returns only these
routes; it never opens an arbitrary `data.url` string:

| Kind | Route |
|---|---|
| `ITEM_ADDED`, `COMMENT_ADDED` | `/entry/{itemId}` |
| `LEDGER_INVITE` | `/invite/{code}` when the targeted invite payload carries the one-time code |
| `JOIN_REQUESTED` | `/ledger/{ledgerId}/requests` |
| `MEMBER_JOINED`, `MEMBER_LEFT`, `MEMBER_REMOVED` | `/ledger/{ledgerId}/members` |
| `JOIN_APPROVED`, `ROLE_CHANGED`, `OWNERSHIP_TRANSFERRED` | `/ledger/{ledgerId}` |
| `JOIN_REJECTED` | no push |
| `LEDGER_ARCHIVED` | `/` |
| `LEGACY_CLAIMED` | `/settings/legacy` |
| `ANNOUNCEMENT` | `/settings/announcements` |
| `SYSTEM` | `/notifications` |

The root layout handles both a cold-start response (`getLastNotificationResponseAsync`) and later taps
(`addNotificationResponseReceivedListener`), clears a consumed last response, sets `activeLedgerId` before
navigating, and lets the destination's Convex guard reject stale access.

When the app is foregrounded on the same ledger, `ITEM_ADDED` does not show a banner; reactivity is the
notification. Social/governance events may show a banner through the foreground notification handler.

---

## 7. Verification contract

- Unit: quiet-hours ranges (same-day and across midnight), payload validator, amount formatting per locale,
  channel and route exhaustiveness.
- `convex-test`: actor/mute/global preference and both block-direction filters; 201st member and ninth token
  fail closed; concurrent item actions claim one ten-minute window; registration disables the oldest token
  on a ninth device; an inactive membership never receives a token.
- Integration with a fake Expo endpoint: batches of 100, retry/backoff, ticket-to-token-id mapping, receipt
  delay, `DeviceNotRegistered` write-back, three-attempt stop.
- Device: permission not shown on first launch; first-ledger education; denied settings path; cold/warm tap on
  iOS and Android; three Android channels; foreground suppression on the active ledger.
- Budget fixture: eight members × eight devices returns at most 93 documents and seven state writes from
  `claimItemPushRecipients`; 200 members × eight devices stays at or below 2,589 reads / 199 writes.
