# Design — Sharing: Membership, Invitations, Roles, Permissions

Status: **proposed, implementable**. Supersedes the legacy scheme described in
`.notes/research/02-legacy-data-model.md` §4 / §9 and `.notes/research/01-legacy-features.md` §5.13–5.16.

Inputs honoured: `DECISIONS.md` (invite-link-first), note 09 §4 (permissions-helper pattern),
note 13 §5.1/§5.5/§11 (indexed membership guard, denormalized `memberCount`), note 14 §6.4
(legacy invite/request migration), note 04 §4 (locale set `en ko ja zh id`).

---

## 0. What changes, in one page

| Legacy                                                                                                             | New                                                                                                      | Why                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledgers/{k}/owner` (uid string) + `ledgers/{k}/members` (uid→uid map)                                             | `ledgerMembers` join table with a `role` column + `ledgers.ownerId` denormalized                         | Maps are capped by Convex's 8,192-array / 1 MiB document limits and cannot carry a role. A join table gives the O(1) `by_ledgerId_userId` guard note 13 §11 rule 4 demands.               |
| 2 roles (owner / member), owner-only everything                                                                    | 4 roles: `OWNER` / `ADMIN` / `MEMBER` / `VIEWER` with a rank ladder                                      | Legacy had a single point of failure: if the owner went quiet nobody could invite or remove. `VIEWER` is a genuinely new capability (read-only share).                                    |
| `bookoo/invites` bidirectional double index keyed by percent-encoded email                                         | One `ledgerInvites` row holding a **hashed** capability token                                            | The double index was two writes with no transaction, produced orphans through two `Promise.all` bugs (note 02 §4), and required an email address to exist before you could invite anyone. |
| `inviteUsers()` downloads **every user record in the app** and linear-scans for an email                           | server-side `by_emailNormalized` / `by_handleKey` lookup, or no lookup at all (link)                     | note 02 §13 S7 — an O(all users) scan **and** a full user-directory leak to every client.                                                                                                 |
| Registered invitee is added to the ledger **with no consent**                                                      | Every join requires an explicit tap by the joiner                                                        | Legacy `inviteUsers` wrote `members/{uid}` for anyone whose email matched. Being added to a stranger's ledger without consent is a defect, not a feature.                                 |
| Unregistered invitee auto-joins at signup (`addInvitedLedgers`)                                                    | Pending invites surface as "받은 초대" cards; one tap joins                                              | Same consent argument, same number of taps in practice.                                                                                                                                   |
| `ledgers/{k}/requests` + public exact-title search (`searchLedgers`)                                               | Public search **dropped**; approval preserved as `ledgerInvites.requiresApproval` → `ledgerJoinRequests` | The search leaked ledger title + owner displayName + owner **email** to any signed-in user, and the request queue only existed because there was no link.                                 |
| Ownership transfer = write one field, old owner silently stays a member                                            | `transferOwnership` mutation: both membership rows patched, both parties notified, audit row written     | Legacy `changeOwner` (`firebaseApi.ts:594-601`) patched `owner` only.                                                                                                                     |
| `deleteLedger` orphans every other member's `users/{uid}/ledgers` pointer → dangling refs that crash `getMyLedger` | Soft archive → 30-day grace → batched purge                                                              | note 02 §9 documents the crash: `getMyLedger` resolves `null`, throws, and `Main.setMyLedgers`'s try/catch wipes the entire ledger list.                                                  |
| `info.people` (dead field, hard-coded `1`)                                                                         | `ledgers.memberCount`, maintained by membership mutations + nightly repair cron                          | note 13 §5.5. Never `.collect()` the membership to count.                                                                                                                                 |
| No audit trail at all                                                                                              | `ledgerAuditLog`, paginated, ADMIN-visible                                                               | A shared money ledger where members can remove each other needs a "who did what" record.                                                                                                  |

**The headline UX change** (`DECISIONS.md` §1, "링크 주면 들어오면 바로 초대되게"): sharing a ledger is
one tap for the sharer (native share sheet with a universal link) and one tap for the joiner (preview card →
참여하기). No email address needed, no owner approval, no waiting, no round trip through the App Store for
existing users. The join is instant; the _only_ thing standing between the tap on the link and membership is a
preview card, and §2.6 argues why removing even that would be wrong.

---

## 1. Role model

### 1.1 The set — and why exactly four

```ts
// convex/schema/ledgerMembers.ts
export const ledgerRoleValidator = v.union(
  v.literal('OWNER'),
  v.literal('ADMIN'),
  v.literal('MEMBER'),
  v.literal('VIEWER'),
);
export type LedgerRole = Infer<typeof ledgerRoleValidator>;
```

```ts
// convex/lib/ledgerPermissions.ts
/** Higher wins. Every "at least this role" check goes through this table. */
export const LEDGER_ROLE_RANK: Record<LedgerRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};
```

- **`OWNER`** — exactly one per ledger, always. Denormalized to `ledgers.ownerId` so the drawer can render the
  crown badge without a join. The only role that can transfer ownership, confirm a migrated ledger's currency,
  archive, or delete. Cannot be removed or demoted by anyone; can only stop being owner by transferring.
- **`ADMIN`** — everything `OWNER` can do _except_ the four irreversible/identity actions above, and except
  acting on peers (an ADMIN cannot remove, demote, or promote another ADMIN or the OWNER). This is the role
  that fixes the legacy single-point-of-failure: a household ledger where the spouse who created it stops
  using the app currently becomes unmanageable forever.
- **`MEMBER`** — the legacy "member". Full read/write on ledger items, comments and photos; can create invite
  links (see §1.3); cannot manage people or the ledger itself.
- **`VIEWER`** — read-only. Sees items, totals, graphs, photos and the member list; writes nothing, not even a
  comment; cannot invite; cannot export. Real use cases: a parent watching a student's ledger, an accountant, a
  landlord seeing the share-house's utility ledger, or simply a "구경만 하는" link posted in a chat where you
  don't want strangers editing amounts.

**Rejected alternatives.** A fifth `BILLING`/`GUEST` tier: no billing exists. Per-category or per-date-range
scoping: massively complicates every index in note 13 §5.1 for a household app. Free-form permission bitmasks:
unreadable in UI, unnecessary at four roles. Two roles (legacy): re-creates the owner bottleneck and gives the
invite link nothing to grant but full write access.

**UI containment so four roles don't feel like four roles.** The invite sheet's default is `MEMBER`, with a
segmented control offering 멤버 / 뷰어. `ADMIN` is only reachable from the member-list row menu ("관리자로
지정"), and only by the OWNER. A two-person ledger therefore never sees the word ADMIN.

### 1.2 The one policy knob

```ts
export const itemWritePolicyValidator = v.union(
  v.literal('ANY_MEMBER'), // default for new ledgers
  v.literal('AUTHOR_ONLY'), // legacy-compatible; default for migrated ledgers
);
```

"Can a MEMBER edit an item somebody else typed?" is the single most-contested permission in a shared ledger and
the one place where the legacy behaviour and the obvious modern behaviour genuinely disagree.

- Legacy: `LedgerItemDetail.tsx:230` — edit allowed if `item.writer === uid || ledger.owner === uid`.
- Reality of a couple's 가계부: "you typed 12,000 instead of 1,200, let me fix it" happens weekly.

So: `ANY_MEMBER` for ledgers created in the new app, `AUTHOR_ONLY` for every ledger imported from Firebase (so
existing users' expectations are preserved on day one), switchable by ADMIN+ in ledger settings. `ADMIN`/`OWNER`
override both. This is the **only** knob; everything else is fixed by role.

`ledgerItems.authorId` preserves the original author while its last-editor field records edits, so "anyone can fix
anything" never means "nobody knows who changed it".

### 1.3 Who can invite

`ledgers.invitePolicy: 'ANY_MEMBER' | 'MANAGERS_ONLY'`, default `ANY_MEMBER`.

Two hard rules layered on top, enforced server-side and not configurable:

1. **You can never create an invite granting a role above your own rank.** A `MEMBER` can create `MEMBER` and
   `VIEWER` links; an `ADMIN` can additionally create… `MEMBER` and `VIEWER` links (see rule 2).
2. **`OWNER` and `ADMIN` are never grantable by a link.** Ownership transfer and admin promotion are
   deliberate, named, audited acts against a _known person_, never a bearer token that can be forwarded.

`VIEWER` cannot invite at all, regardless of `invitePolicy`.

### 1.4 Permission matrix

`✅` allowed · `🔸` conditional (condition in the note column) · `❌` denied.

| #   | Action                                          | VIEWER | MEMBER | ADMIN | OWNER | Notes / guard                                                                                                                       |
| --- | ----------------------------------------------- | :----: | :----: | :---: | :---: | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 가계부 열람 (items, 통계, 그래프, 사진, 캘린더) |   ✅   |   ✅   |  ✅   |  ✅   | `requireLedgerRole(VIEWER)`                                                                                                         |
| 2   | 멤버 목록 보기 (이름·@handle·아바타·역할)       |   ✅   |   ✅   |  ✅   |  ✅   | Emails are **never** returned to non-managers                                                                                       |
| 3   | 항목 생성                                       |   ❌   |   ✅   |  ✅   |  ✅   | `requireLedgerRole(MEMBER)`                                                                                                         |
| 4   | **자기** 항목 수정/삭제                         |   ❌   |   ✅   |  ✅   |  ✅   |                                                                                                                                     |
| 5   | **남의** 항목 수정/삭제                         |   ❌   |   🔸   |  ✅   |  ✅   | 🔸 iff `ledger.itemWritePolicy === 'ANY_MEMBER'`                                                                                    |
| 6   | 사진 업로드/삭제                                |   ❌   |   🔸   |  ✅   |  ✅   | 🔸 follows the item's edit right (#4/#5)                                                                                            |
| 7   | 리뷰(댓글) 작성                                 |   ❌   |   ✅   |  ✅   |  ✅   |                                                                                                                                     |
| 8   | 자기 리뷰 삭제                                  |   ❌   |   ✅   |  ✅   |  ✅   |                                                                                                                                     |
| 9   | 남의 리뷰 삭제                                  |   ❌   |   ❌   |  ✅   |  ✅   | Moderation is a management act                                                                                                      |
| 10  | 카테고리 추가                                   |   ❌   |   ✅   |  ✅   |  ✅   | Additive, low blast radius                                                                                                          |
| 11  | 카테고리 이름변경/삭제/정렬                     |   ❌   |   ❌   |  ✅   |  ✅   | Retroactively changes every item's label                                                                                            |
| 12  | 초대 링크 생성                                  |   ❌   |   🔸   |  ✅   |  ✅   | 🔸 iff `invitePolicy === 'ANY_MEMBER'`; granted role ≤ own rank and ≤ `MEMBER` (§1.3)                                               |
| 13  | 자기가 만든 링크 조회/취소                      |   ❌   |   🔸   |  ✅   |  ✅   | 🔸 same as #12                                                                                                                      |
| 14  | 가계부의 **모든** 링크 조회/취소                |   ❌   |   ❌   |  ✅   |  ✅   |                                                                                                                                     |
| 15  | 특정 링크로 들어온 사람 일괄 내보내기           |   ❌   |   ❌   |  ✅   |  ✅   | The leaked-link panic button (§2.9)                                                                                                 |
| 16  | 가입 요청 승인/거절                             |   ❌   |   ❌   |  ✅   |  ✅   |                                                                                                                                     |
| 17  | 멤버 제거                                       |   ❌   |   ❌   |  🔸   |  ✅   | 🔸 target rank **strictly** below actor's rank                                                                                      |
| 18  | 역할 변경                                       |   ❌   |   ❌   |  🔸   |  ✅   | 🔸 both current and new role strictly below actor's rank ⇒ ADMIN can only set VIEWER↔MEMBER                                         |
| 19  | 스스로 나가기                                   |   ✅   |   ✅   |  ✅   |  🔸   | 🔸 OWNER must transfer first, unless sole member (§4.4/§4.5)                                                                        |
| 20  | 가계부 이름/설명/색 변경                        |   ❌   |   ❌   |  ✅   |  ✅   | Legacy: owner only. ADMIN exists precisely to unblock this.                                                                         |
| 21  | `itemWritePolicy` / `invitePolicy` 변경         |   ❌   |   ❌   |  ✅   |  ✅   | Audit-logged                                                                                                                        |
| 22  | **통화 확정**                                   |   ❌   |   ❌   |  ❌   |  ✅   | `ledgers.confirmCurrency`; migrated ledgers only, once while `currencyIsAssumed === true`; hard confirm + `CURRENCY_REBASE` + audit |
| 23  | 소유권 이전                                     |   ❌   |   ❌   |  ❌   |  ✅   | Target must be an active non-VIEWER member                                                                                          |
| 24  | 보관(archive) / 보관 해제                       |   ❌   |   ❌   |  ❌   |  ✅   |                                                                                                                                     |
| 25  | 삭제 요청 / 30일 내 복구                        |   ❌   |   ❌   |  ❌   |  ✅   |                                                                                                                                     |
| 26  | 내보내기 (CSV / JSON / 사진 zip)                |   ❌   |   ❌   |  ✅   |  ✅   | Takes every member's data off-platform; not a read like #1                                                                          |
| 27  | 감사 로그 열람                                  |   ❌   |   ❌   |  ✅   |  ✅   |                                                                                                                                     |
| 28  | 자기 푸시/알림 설정                             |   ✅   |   ✅   |  ✅   |  ✅   | Per-user, not per-ledger permission                                                                                                 |

Row 22 deserves a note: legacy had **no per-ledger currency at all** — currency was a device-level
`AsyncStorage['LOCALE']` setting, so one ledger could contain rows formatted in three currencies
(note 02 §6). Confirmation is therefore a one-time migration repair, not a general settings toggle.
It re-derives migrated amounts at the confirmed exponent and rebuilds all rollups (`SCHEMA.md` §7.3).
A new ledger with zero live items may still correct `baseCurrency` through `ledgers.update`; that one
field raises the guard from `ADMIN` to `OWNER` and proves emptiness with the indexed `.first()` probe.

---

## 2. The invite link

### 2.1 Shape

```
https://bookoo.hyo.dev/invite/BK1-K5QM-9T3X-8ZVA-2NHD-7RJP-W6
                               └──────── 26 Crockford-base32 chars = 128 bits ────────┘
```

- Custom-scheme fallback (in-app QR, dev builds): `bookoo://invite/BK1K5QM9T3X8ZVA2NHD7RJPW6`
- Manual-entry form shows the grouped form; `normalizeInviteCode` strips dashes/whitespace and
  case-folds, so users can type it from a screenshot.

### 2.2 Token generation, encoding, storage

```ts
// shared/inviteCode.ts — pure, no ctx, imported by BOTH convex/ and src/. Unit-tested.
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';

/** Crockford base32: no I, L, O, U — unambiguous when read aloud or OCR'd. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_PREFIX = 'BK1';
export const INVITE_CODE_BYTES = 16; // 128 bits
export const INVITE_CODE_CHARS = 26; // ceil(128 / 5)
export const INVITE_CODE_RE = /^BK1[0-9A-HJKMNP-TV-Z]{26}$/;

export function encodeInviteCode(bytes: Uint8Array): string {
  /* base32 encode → PREFIX + 26 chars */
}

/** Tolerates dashes, spaces, lowercase, and the Crockford confusables I/L→1, O→0. */
export function normalizeInviteCode(raw: string): string | null {
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return INVITE_CODE_RE.test(s) ? s : null;
}

/** The value stored in the DB. `pepper` comes from a Convex env var, never from the client. */
export function hashInviteCode(normalizedCode: string, pepper: string): string {
  return bytesToHex(
    sha256(new TextEncoder().encode(`${pepper}:${normalizedCode}`)),
  );
}

export function formatInviteCodeForDisplay(code: string): string {
  /* BK1-XXXX-XXXX-… */
}
export function inviteUrl(code: string): string {
  return `https://bookoo.hyo.dev/invite/${formatInviteCodeForDisplay(code)}`;
}
```

**Entropy: 128 bits** from `crypto.getRandomValues(new Uint8Array(16))`. Convex's runtime provides
`crypto.getRandomValues` inside mutations (it is seeded per-execution and recorded, so an OCC retry simply
produces a fresh code for a transaction whose previous attempt was rolled back — harmless).

**Why `@noble/hashes` and not `crypto.subtle`:** `crypto.subtle.digest` is async and its availability inside
Convex _queries/mutations_ (as opposed to actions) is not something to bet the redemption path on. `@noble/hashes`
is a 4 KB sync pure-JS implementation with no WASM, works identically in the Convex runtime, in Hermes, and in
`convex-test` under Node — which also means `shared/inviteCode.ts` is fully unit-testable.

**Storage: hash only.** The row stores `codeHash = sha256(pepper + ':' + code)` and **never** the plaintext.
`INVITE_TOKEN_PEPPER` is a Convex environment variable (`bunx convex env set INVITE_TOKEN_PEPPER …`, 32 random
bytes hex). At 128 bits the pepper adds nothing against brute force; it exists so that a _database export_
(migration dumps, a support engineer's `convex export`, a leaked backup) is not by itself a set of working
invite links.

**Consequence, accepted deliberately: an invite link cannot be re-displayed.** `invites.create` returns the
plaintext exactly once, and the client hands it straight to the native share sheet. The management screen lists
active links by `note` + creator + created-at + uses + expiry, with a Revoke button — never a URL. If you need
the link again you tap 공유 again and get a _new_ link; the old one stays valid until it expires or is revoked.
This is how GitHub PATs and Slack invite links behave, it removes the "plaintext bearer tokens at rest" problem
entirely, and it costs one extra tap in a flow nobody repeats often.

_(Rejected: storing plaintext so the sheet can be reopened — trades a permanent at-rest secret for one tap.
Rejected: storing a plaintext non-secret `selector` plus a hashed `verifier` — still cannot re-display, so it
buys nothing over a single hashed token. Rejected: deriving the code from `_id` — Convex ids are not secret.)_

### 2.3 Expiry, uses, revocation

| Field                                      | Default              | UI options                            | Server cap                               |
| ------------------------------------------ | -------------------- | ------------------------------------- | ---------------------------------------- |
| `expiresAt`                                | `now + 7d`           | 1시간 / 1일 / 7일 / 30일 / 무기한     | ≤ 90 d, or `undefined` for 무기한        |
| `maxUses`                                  | `undefined` (무제한) | 1회용 / 5회 / 무제한                  | ≤ 100                                    |
| `role`                                     | `MEMBER`             | 멤버 / 뷰어                           | ≤ actor's rank, never OWNER/ADMIN (§1.3) |
| `requiresApproval`                         | `false`              | "승인 후 참여" 토글                   | —                                        |
| `note`                                     | `undefined`          | free text, ≤ 40 chars ("카톡 가족방") | —                                        |
| `inviteeEmailNormalized` / `inviteeUserId` | `undefined`          | set by the 1:1 invite paths (§3.1)    | mutually exclusive                       |

- **Multi-use is the default**, because the headline use case is "paste into the family KakaoTalk room". The
  1회용 preset (`maxUses: 1`) exists for the email/handle-targeted paths.
- **Revocation** is `revokedAt` + `revokedByUserId`, checked by the redeem guard. Revoking does **not** remove
  members who already joined — that is the separate, deliberate `removeAllJoinedVia` action (§2.9).
- **Auto-GC:** a daily cron deletes rows where `expiresAt < now - 30d` or `revokedAt < now - 30d`, using
  `by_expiresAt`. Rows are kept for 30 days past death so the audit log's `targetInviteId` still resolves.
- **Cap of 20 active (non-revoked, non-expired) links per ledger**, checked in `invites.create` via
  `by_ledgerId_revokedAt_createdAt` + `.take(21)`. Prevents both UI sprawl and the spam vector in §6.14.

### 2.4 What a click does — the complete deferred-deep-link flow

```
                       user taps  https://bookoo.hyo.dev/invite/BK1-…
                                            │
                 ┌──────────────────────────┴──────────────────────────┐
                 │                                                     │
        app INSTALLED                                          app NOT installed
   (iOS Universal Link via AASA,                                       │
    Android App Link via assetlinks.json,                              │
    both host-verified by the OS)                                      │
                 │                                                     ▼
                 ▼                               Convex httpAction  GET /invite/:code
   OS launches BooKoo with the URL                    → server-renders a landing page:
                 │                                      • 가계부 이름 · 색 · 멤버 수
                 ▼                                      • 초대한 사람 displayName + @handle + 아바타
   app/+native-intent.tsx                                • 부여될 역할
   redirectSystemPath('/invite/BK1-…')                   • "앱에서 열기" (tries bookoo://invite/…)
     → '/invite/BK1…'                                    • "앱 설치하고 참여하기"  ← the install CTA
                 │                                       • the code in grouped, copyable form
                 ▼                                                     │
   SecureStore.setItemAsync('pendingInviteCode',        ┌──────────────┴──────────────┐
     {code, savedAt})            ← survives an          │                             │
                 │                 OAuth bounce       iOS                          Android
                 ▼                 (Kakao/Naver/       │                             │
        signed in with a handle?   Apple leave         ▼                             ▼
                 │                 the app)   navigator.clipboard          Play Store URL carries
        ┌────────┴────────┐                   .writeText(code)             &referrer=bk_invite%3D<CODE>
       no                yes                  (inside the tap gesture      → Google Play preserves it
        │                  │                   → permitted) then           → first launch reads it with
        ▼                  ▼                   → App Store                    InstallReferrer  ⇒ a TRUE
  /(auth)/sign-in    /invite/[code]                    │                       deferred deep link
  → handle claim           │                           ▼                             │
        │                  ▼                  first launch:                          ▼
        └──────────►  preview card             Clipboard.hasStringAsync()      pendingInviteCode set
                       ↓ 참여하기               → getStringAsync()             automatically, no prompt
              invites.redeem({code})            → INVITE_CODE_RE test                 │
                       ↓                        → "초대 코드가 있어요.                 │
                 ledger opens                      참여할까요?" (explicit)             │
                                                          │                          │
                                                          └────────┬─────────────────┘
                                                                   ▼
                                                          /invite/[code] preview
```

Concrete pieces:

**`app.config.ts`**

```ts
const DEEP_LINK_HOST = 'bookoo.hyo.dev';
scheme: 'bookoo',                       // NOT shared with Naver — see note 08 §929: the naver-login
                                        // plugin swallows every URL on its scheme before expo-router
                                        // sees it. Naver gets its own 'bookoonaver'.
ios: {
  associatedDomains: [`applinks:${DEEP_LINK_HOST}`],
},
android: {
  intentFilters: [{
    action: 'VIEW',
    autoVerify: true,
    data: {scheme: 'https', host: DEEP_LINK_HOST, pathPrefix: '/invite'},
    category: ['BROWSABLE', 'DEFAULT'],
  }],
},
```

Serve `/.well-known/apple-app-site-association` (paths `["/invite/*"]`) and `/.well-known/assetlinks.json`
from `bookoo.hyo.dev` — both can be `httpAction`s on the Convex deployment behind a custom domain, or
static files on whatever hosts the landing page. Host verification by the OS is what makes rule §6.18 hold.

**`app/+native-intent.tsx`** (Martie's pattern, note 07 §1.6)

```ts
const INVITE_PATH = /^\/invite\/([0-9A-Za-z-]{20,40})$/;

export function redirectSystemPath({path}: RedirectSystemPathParams): string {
  try {
    const url = new URL(path, `https://${DEEP_LINK_HOST}`);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname !== DEEP_LINK_HOST
    ) {
      return path;
    }
    const pathname = url.pathname;
    const m = pathname.match(INVITE_PATH);
    if (m?.[1]) {
      const code = normalizeInviteCode(m[1]);
      if (code) return `/invite/${code}`;
    }
  } catch {
    /* fall through */
  }
  return path;
}
```

**Pending-code custody** (`src/features/invite/pendingInvite.ts`)

- Written on _any_ discovery path: deep link, clipboard confirm, install referrer, manual entry.
- `SecureStore`, not MMKV — the OAuth providers take the user out of the app, and on Android a cold restart
  can happen mid-flow.
- `{code, savedAt}` with a **24-hour TTL**. A code older than that is dropped silently: a link found in the
  clipboard three weeks later must not ambush someone.
- Cleared on successful redeem, on any terminal `RedeemResult` status, and on sign-out.
- A single root-level effect in `app/_layout.tsx` runs `if (currentUser?.handle && pending) router.push(...)`
  — so the redirect happens after sign-in _and_ after handle claim, never before.

**Honest limits.** iOS has no first-party deferred deep link; the clipboard hand-off is the standard
workaround and it is _explicitly confirmed by the user_, never silent (iOS 14+ shows its own paste banner
anyway). Android's `InstallReferrer` (`react-native-play-install-referrer`, requires the custom dev client we
already build) is a real deferred deep link and needs no prompt. Both platforms always have the manual
"코드로 참여" fallback, which is why the landing page prints the grouped code.

### 2.5 Preview — what an unauthenticated stranger is allowed to learn

`invites.preview({code})` is a **public query, no auth required** (the landing page and the pre-sign-in app
screen both call it). It returns exactly:

```ts
type InvitePreview =
  | {
      status: 'OK';
      ledger: {
        title: string;
        description: string;
        colorKey: Doc<'ledgers'>['colorKey'];
        memberCount: number;
      };
      inviter: {
        displayName: string;
        handle: string | null;
        avatarUrl: string | null;
      };
      role: LedgerRole;
      requiresApproval: boolean;
      expiresAt: number | null;
      alreadyMember: boolean; // only meaningful when the caller is signed in
    }
  | {status: 'INVALID'} // unknown code — indistinguishable from a typo
  | {status: 'EXPIRED'}
  | {status: 'REVOKED'}
  | {status: 'EXHAUSTED'}
  | {status: 'LEDGER_UNAVAILABLE'};
```

It returns **no member list, no emails, no amounts, no item counts, no ledger id for an invalid code**. A
leaked link therefore leaks a household's ledger name and one person's public profile — which is exactly what
the sharer intended to show — and nothing more.

### 2.6 Preview-before-join, and why it is not "zero tap"

`DECISIONS.md` asks for "링크 주면 들어오면 바로 초대되게". The design gives that: **no email, no owner
approval, no waiting**, which is what made the legacy flow feel slow. What it does not do is join you the
instant the OS resolves the URL, for three reasons:

1. A link pasted in a group chat is tapped by people who are curious, not by people who consented. Silent
   membership means their `displayName` and avatar appear to strangers and they start receiving that
   household's push notifications.
2. The preview is the only place we can show _which_ ledger and _who_ invited — the difference between "우리집
   가계부 / 초대: @hyochan" and a name you've never seen is the whole anti-phishing signal.
3. Legacy already had non-consensual adds (`inviteUsers` fan-out) and it is listed as a defect in §0.

The preview screen is a single card with a full-width primary button. Signed-in users with a handle go from
tap-to-member in one further tap, with an optimistic navigation into the ledger.

### 2.7 Redemption

```ts
type RedeemResult =
  | {status: 'JOINED'; ledgerId: Id<'ledgers'>; role: LedgerRole}
  | {status: 'ALREADY_MEMBER'; ledgerId: Id<'ledgers'>; role: LedgerRole}
  | {
      status: 'REQUESTED';
      ledgerId: Id<'ledgers'>;
      requestId: Id<'ledgerJoinRequests'>;
    }
  | {
      status: 'REQUEST_PENDING';
      ledgerId: Id<'ledgers'>;
      requestId: Id<'ledgerJoinRequests'>;
    }
  | {status: 'REQUEST_REJECTED'; retryAfterMs: number}
  | {status: 'INVALID'}
  | {status: 'EXPIRED'}
  | {status: 'REVOKED'}
  | {status: 'EXHAUSTED'}
  | {status: 'EMAIL_MISMATCH'}
  | {status: 'WRONG_ACCOUNT'}
  | {status: 'LEDGER_UNAVAILABLE'}
  | {status: 'BLOCKED'}
  | {status: 'RATE_LIMITED'; retryAfterMs: number};
```

Per note 09 §13: `ConvexError({code, messageKey, params})` for _auth_ failures (not signed in, no handle);
a **discriminated union return** for every expected business outcome, so the client renders a specific
Korean/English/Japanese string without string-matching a server message.

Order of checks inside the single mutation (all in one transaction — this is what makes `maxUses` exact):

1. `requireProfile` → `UNAUTHENTICATED` (ConvexError).
2. `profile.handle === undefined` → `appError('HANDLE_REQUIRED', 'error.handle.required')`; the client
   routes to onboarding and keeps the pending code.
3. Rate limit `inviteRedeem` keyed on `userId` → `RATE_LIMITED`.
4. `normalizeInviteCode` → `INVALID` if it fails (no DB read at all for garbage).
5. `by_codeHash` eq lookup → `INVALID` if absent.
6. `revokedAt` → `REVOKED`; `expiresAt < now` → `EXPIRED`; `maxUses !== undefined && useCount >= maxUses`
   → `EXHAUSTED`.
7. Ledger `archivedAt`/`deletedAt` → `LEDGER_UNAVAILABLE`.
8. Binding: `inviteeUserId && !== me` → `WRONG_ACCOUNT`; `inviteeEmailNormalized && !== my verified email` →
   `EMAIL_MISMATCH`.
9. `ledgerMembers.by_ledgerId_userId` single read:
   - row exists, `deletedAt === undefined` → `ALREADY_MEMBER` (**does not burn a use**).
   - row exists, `blockedAt !== undefined` → `BLOCKED`.
   - otherwise, read the live roster with a `MEMBER_SCAN_LIMIT + 1` sentinel and check the candidate
     against every live member through two exact `userBlocks.by_blockerUserId_blockedUserId` lookups.
     Any relationship in either direction → `BLOCKED`. It reveals no member/direction, burns no use, and
     writes no redemption/request/notification. This is deliberately stronger than creator-only checking:
     a leaked link cannot be used to follow a person who blocked the redeemer into their shared ledger.
10. `ledgerInviteRedemptions.by_inviteId_userId` → if present, this user already consumed this invite; do not
    increment `useCount` again (idempotent re-tap, double-tap, retry).
11. Recent `REJECTED` join request within the 7-day cooldown → `REQUEST_REJECTED`.
12. `requiresApproval` → upsert `ledgerJoinRequests` (`PENDING`, `expiresAt = now + 14d`), notify ADMIN+,
    return `REQUESTED` / `REQUEST_PENDING`.
13. Otherwise **join**: upsert `ledgerMembers`, `patch` `ledgers.memberCount + 1` in the same mutation
    only when the row transitions from inactive to active,
    `patch` invite `useCount + 1` + `lastUsedAt`, insert `ledgerInviteRedemptions`, insert `ledgerAuditLog`,
    insert `notifications` rows for every ADMIN+, `ctx.scheduler.runAfter(0, sendExpoPush, …)`, return
    `JOINED`.

All checks and writes are one Convex mutation ⇒ atomic. Two people redeeming the last use of a `maxUses: 5` link at the
same instant hit OCC on the invite document, Convex retries the loser, the retry re-reads `useCount = 5` and
returns `EXHAUSTED`. **This is the entire correctness argument for `maxUses`** and it only works because the
check and the increment share a transaction.

### 2.8 Rate limiting

`SCHEMA.md` §2.2 owns the exact-pinned `@convex-dev/rate-limiter@0.3.2` component mount and the
single sixteen-bucket `RateLimiter`. Its sharing subset is `inviteCreate` (10/hour/user),
`inviteCreateDaily` (40/day/user), `inviteRedeem` (20/hour/user), `joinRequestCreate` (5/hour/user),
and `ledgerMemberChurn` (30/hour/ledger). Sharing imports that instance; it does not construct a second
partial limiter.

```ts
const ok = await rateLimiter.limit(ctx, 'inviteRedeem', {key: profile.userId});
if (!ok.ok)
  return {status: 'RATE_LIMITED', retryAfterMs: ok.retryAfter} as const;
```

`invites.preview` is unauthenticated and Convex functions cannot see a client IP, so it is rate-limited in the
place that _can_: the `GET /invite/:code` **httpAction** that backs the web landing page reads
`request.headers.get('x-forwarded-for')` and limits `60 / hour / IP`. The in-app `preview` query is left
unlimited by identity but is protected structurally — a 128-bit token cannot be guessed, and the reactive
query is served from Convex's cache for repeat calls with the same argument.

### 2.9 Abuse story: the link leaks into a group chat

This _will_ happen; it is the intended distribution channel. Layered response, none of which requires the
sharer to have predicted the leak:

**Before the leak (defaults do the work).**

- 7-day expiry by default; the link is dead a week after the family finished joining.
- Default granted role is `MEMBER`, never ADMIN/OWNER, so a stranger can never manage people or nuke the ledger.
- "승인 후 참여" toggle turns the link into a request funnel — this is where the legacy `requests` queue
  survives, attached to a _link_ instead of a public directory.
- 뷰어 링크 for the "just show them" case.

**At the moment of the leak (detection).**

- Every join writes an in-app notification to every ADMIN+ (`MEMBER_JOINED`) _and_ schedules a push
  (note 09 §10.4: row first, push scheduled, so a push outage never loses the record). The notification carries
  the joiner's `@handle` and which link they used, and its row action is 내보내기.
- The member list shows a "링크로 참여 · 3일 전" subtitle sourced from `joinedViaInviteId`.

**After the leak (the panic button).**

1. `invites.revoke({inviteId})` — instant, one tap from the link-management screen.
2. `invites.removeAllJoinedVia({inviteId})` — one indexed query on
   `ledgerMembers.by_joinedViaInviteId`, soft-removes
   every member who came through that link (never the actor, never anyone with rank ≥ actor). Confirmation
   dialog shows the exact list first.
3. `members.remove({..., block: true})` sets `blockedAt`, so that person cannot come back through _any_ future
   link (§2.7 step 9).
   This ledger-specific rejoin block is separate from D6's directional account `userBlocks`, which hides
   identity/communication surfaces and prevents unsafe interactions but never removes financial rows.
4. D4's private media endpoint rejects every future photo request after removal. Bytes the former member
   already downloaded, cached, or screenshotted cannot be revoked; §4.3 clears app-managed caches.

**What the design deliberately does not do:** email-domain allowlists, invite approval queues on by default,
CAPTCHA. All three punish the 99% household case to slightly inconvenience an attacker who could just ask a
member for a fresh link anyway.

---

## 3. Legacy flows — keep / redesign / drop

### 3.1 Email invite for unregistered users (the `bookoo/invites` double index) — **REDESIGN, keep the capability**

_Verdict: keep "invite someone who has no account", delete the mechanism entirely._

Why the capability stays: it is the only way to onboard a spouse/roommate who is not on BooKoo yet, and the
legacy app's own copy (`EMAIL_INVITE_SUBJECT` / `EMAIL_INVITE_BODY` with Play/App Store links) shows it was
the primary growth path.

Why the mechanism goes:

- Two mirrored writes with no transaction, drained by `authApi.addInvitedLedgers` whose
  `Promise.all(snap.forEach(...))` is a type error — `DataSnapshot.forEach` returns a **boolean**, so the awaits
  never awaited and the index-B wipe could race ahead of the per-ledger writes. Production data is expected to
  contain orphaned index-A rows and possibly dropped invites (note 02 §4).
- `deleteInvites` has the same class of bug: `Promise.all(a, b, c, d)` takes one iterable, so three of four
  removals are fire-and-forget.
- Both indexes live in one `bookoo/invites` map distinguished only by "does the first path segment look like a
  push id" — a namespace collision waiting for an email that starts with `-`.
- The whole thing exists only because RTDB has no server-side email lookup. Convex has an index.

Replacement — **an email-bound single-use invite**, same table, same redeem path, no new machinery:

```ts
invites.create({
  ledgerId,
  role: 'MEMBER',
  maxUses: 1,
  ttlMs: 14 * DAY,
  inviteeEmail: 'a@b.com',
});
```

→ `invites.actions.sendInviteEmail` (Resend, reusing the `convex/utils/resendClient.ts` already in the
FightingHows lineage) sends the localized email containing the universal link. No device mail composer, so no
`react-native-communications`, no "the user forgot to press send in Mail.app".

On first sign-in, `invites.queries.myPendingEmailInvites()` reads `by_inviteeEmailNormalized_revokedAt` with the
account's **verified** email and renders "받은 초대" cards on the home screen. **One tap joins** — it does not
auto-join like `addInvitedLedgers` did, because email matching is only as trustworthy as the provider's
verification and because being silently placed in a ledger is the consent defect from §0.

Migration of real pending invites (extends note 14 §6.4, which archives them):

1. Import all of `bookoo/invites` into `legacyInvites` as an archive, classified by
   `/^-[A-Za-z0-9_-]{19}$/` (index A, by ledger) vs `%40` (index B, by email), decoded with plain
   `decodeURIComponent` (the legacy decoder is a no-op, note 02 §5).
2. Reconcile: drop any archived invite whose email already resolves to a migrated member of that ledger —
   these are the `Promise.all` orphans.
3. **On account claim** (note 14 §3.4), materialize each surviving archived invite as a real `ledgerInvites`
   row: `inviteeEmailNormalized`, `maxUses: 1`, `role: 'MEMBER'`, `expiresAt = claimedAt + 30d`,
   `createdByUserId = ledger.ownerId`, `source: 'LEGACY_EMAIL'`, and a freshly generated code. The user sees a
   "받은 초대" card for a ledger someone invited them to in 2020, which is exactly what they were promised.
   Idempotent: keyed on `legacyKey = "{ledgerKey}/{encodedEmail}"`.

### 3.2 Public search-by-title (`searchLedgers`) — **DROP**

_Verdict: delete. No public ledger directory in the new app._

- `ref('bookoo/ledgers').orderByChild('info/title').equalTo(txt)` requires the **exact full title**, so as a
  discovery feature it barely worked; the legacy UI's empty state was `NO_LEDGER_SEARCH_RESULT`.
- Every result returned the ledger's title _and the owner's `displayName` and `email`_ to any signed-in user
  (`LedgerSearch` calls `getUserProfile(ledger.owner)` per row). Households name ledgers "가계부" and "생활비";
  a directory of those names plus their owners' email addresses is a privacy leak with no upside.
- The query returned **full ledger nodes including `items`** (note 02 §13 S11), so it was also one of the
  slowest paths in the app.
- With a link, guessing a name is pointless: the link _is_ the discovery mechanism, and it carries consent from
  someone who already has access.

Replacement for the legitimate underlying need ("I want to join my friend's ledger but they haven't sent me a
link"): **invite by @handle**, using the `userProfiles.search_handle` search index from note 09 §12.9.

```ts
invites.create({ledgerId, role: 'MEMBER', maxUses: 1, inviteeUserId});
```

This inverts the trust direction — you search for a _person_, and that person receives a notification and
consents — instead of searching for a household's private ledger.

Migration: nothing to migrate. `searchLedgers` had no persisted state.

### 3.3 Request-to-join with owner approval (`ledgers/{k}/requests`) — **REDESIGN, keep the approval UX**

_Verdict: keep the approval inbox, delete the standalone request queue._

The `WAITING_LIST` block in `SeeMembers.tsx` (avatar + displayName + email + ACCEPT/REJECT) is good UI and note
01 §5.16 explicitly asks to preserve it. What goes is the _only_ way to reach it — the public search. Approval
becomes a **property of an invite link** (`requiresApproval: true`), plus the handle-invite path, both feeding
one `ledgerJoinRequests` table and one inbox screen.

Additions the legacy queue lacked:

- `status` is a real enum, so a rejection is recorded (legacy REJECT just deleted the node — the requester
  could re-request instantly, forever).
- 7-day cooldown after `REJECTED`; 14-day auto-`EXPIRED` via cron on `by_status_expiresAt`.
- At most one non-terminal row per `(ledgerId, userId)`, enforced by `by_ledgerId_userId`.
- The requester sees their own pending requests (`joinRequests.queries.mine`) and can cancel — legacy's
  `requestLedger` was a blind toggle with no server confirmation of state.
- Approval writes the membership _and_ the audit row _and_ both notifications in one transaction; legacy's
  `acceptOrRejectRequestedUser` did two independent fan-out writes.

Migration of legacy `ledgers/{k}/requests/{uid}`: note 14 §6.4 says drop. **I recommend importing them
instead**, because both sides of the pair map cleanly to migrated ids and the cost is one JSONL file:
`ledgerJoinRequests { ledgerId, userId, status: 'PENDING', source: 'LEGACY_REQUEST',
expiresAt: migratedAt + 30d, legacyKey: "{ledgerKey}/{uid}" }`. A request whose requester never claims their
account simply expires; a request whose requester _does_ claim it lands in the owner's inbox with the original
intent intact. Skip any row where the uid is already a member (legacy left those behind on accept).

### 3.4 Two smaller legacy behaviours

| Legacy                                                                                | Verdict                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner-removes-member and pending-invite deletion share one function (`deleteInvites`) | **Split.** `members.remove` and `invites.revoke` are different acts with different guards and different audit entries.                                                                                                                |
| `EXIT_ALERT_INVITES` — the owner cannot delete a ledger while pending invites exist   | **Drop.** Archiving revokes every outstanding link in the same mutation; there is nothing left to be inconsistent about.                                                                                                              |
| Swipe-left = remove, swipe-right = transfer ownership on the member row               | **Keep**, per note 01 §5.16, re-implemented on `react-native-gesture-handler` `ReanimatedSwipeable` inside FlashList. Transfer moves behind a row menu (it is not a symmetric action and deserves a named confirm), swipe keeps 제거. |
| Crown badge on the owner row, "INVITING / 미가입" pseudo-member rows                  | **Keep both.** Pending `inviteeEmailNormalized`/`inviteeUserId` invites render as ghost rows in the member list exactly like `maskInvite.png` did.                                                                                    |

---

## 4. Membership-change side effects

### 4.1 `memberCount`

Maintained explicitly by every membership mutation, in the same transaction as the row transition. There
is no `ledgerMembers` trigger. This matches `SCHEMA.md` §6 and prevents migration P3 from both firing a
trigger and patching its measured per-ledger total.

```ts
// Shared internal helper. Call exactly once when a mutation changes the live-row count.
async function applyMemberCountDelta(
  ctx: MutationCtx,
  ledger: Doc<'ledgers'>,
  delta: number,
): Promise<void> {
  const next = ledger.memberCount + delta;
  if (next < 0 || next > MEMBER_SCAN_LIMIT)
    throw invariantError('MEMBER_COUNT');
  await ctx.db.patch(ledger._id, {memberCount: next, updatedAt: Date.now()});
}
```

Rules that make this safe:

- `ledgers.create` inserts the ledger with `memberCount: 1` and its OWNER membership in one transaction.
- `invites.redeem` and approved `joinRequests.decide` apply `+1` only for an inactive→active transition;
  idempotent re-taps apply zero.
- `members.remove`, `members.leave`, and `invites.removeAllJoinedVia` apply the exact active→inactive
  decrement once per transaction. A bounded bulk batch patches the ledger once with `-removedInBatch`.
- `memberCount` counts **every active row regardless of role**, including VIEWERs — it is what the UI labels
  "멤버 N", so it must match what the member list shows.
- Never `.collect()` `ledgerMembers` to count: that read set covers the whole membership, so any member
  touching their own row would re-run every subscribed query (note 13 §5.5).
- A nightly repair cron recomputes one ledger's count from `by_ledgerId_deletedAt_role` with
  `.take(MEMBER_SCAN_LIMIT)` and patches on disagreement — the safety net that makes denormalization
  shippable. Membership creation rejects the 201st active member.
- `memberCount` lives on `ledgers` because it changes only a handful of times per ledger per year. The
  discarded hot-counter table is not reintroduced.
- Migration P3 inserts through raw migration mutations and patches the exact count once per ledger after
  its membership rows are present; it does not replay application deltas.

### 4.2 Notifications

Pattern from note 09 §10.4 everywhere: **write the `notifications` row first, then
`ctx.scheduler.runAfter(0, internal.notifications.actions.sendExpoPush, …)`**, so a push outage never rolls
back the in-app record. Per note 09 §13, rows store `titleKey` / `bodyKey` / `params` and are localized in
`sendExpoPush` against `userProfiles.locale` — no Korean sentences on the server.

The kind names and `params: Record<string, string | number>` contract come from `SCHEMA.md` §3.14;
`notifications-push.md` owns delivery. A `*Minor` number is always paired with `currency`, and neither a
row nor a scheduled payload stores sender-formatted money.

| Event                      | Recipients                                   | kind                    | route                    |
| -------------------------- | -------------------------------------------- | ----------------------- | ------------------------ |
| 링크/이메일/핸들 초대 도착 | `inviteeUserId` (handle invites only)        | `LEDGER_INVITE`         | `/invite/{code}`         |
| 새 멤버 참여               | every active ADMIN+ except the joiner        | `MEMBER_JOINED`         | `/ledger/{id}/members`   |
| 가입 요청 도착             | every active ADMIN+                          | `JOIN_REQUESTED`        | `/ledger/{id}/requests`  |
| 가입 승인                  | the requester                                | `JOIN_APPROVED`         | `/ledger/{id}`           |
| 가입 거절                  | the requester                                | `JOIN_REJECTED`         | — (in-app only, no push) |
| 역할 변경                  | the target                                   | `ROLE_CHANGED`          | `/ledger/{id}`           |
| 멤버 제거                  | the removed user **and** every active ADMIN+ | `MEMBER_REMOVED`        | `/`                      |
| 멤버 자진 탈퇴             | every active ADMIN+                          | `MEMBER_LEFT`           | `/ledger/{id}/members`   |
| 소유권 이전                | **every** active member                      | `OWNERSHIP_TRANSFERRED` | `/ledger/{id}`           |
| 보관 / 삭제 예약           | every active member                          | `LEDGER_ARCHIVED`       | `/`                      |

Two rules: the actor never notifies themselves, and `JOIN_REJECTED` writes an in-app row but schedules
no push (a rejection does not deserve a lock-screen banner). Recipient fan-out reads
`ledgerMembers.by_ledgerId_deletedAt_role` and is bounded by `PUSH_RECIPIENT_SCAN_LIMIT`; live tokens are
bounded to `PUSH_DEVICE_LIMIT_PER_USER`. Ticket/receipt cleanup and channels follow
`notifications-push.md`.

### 4.3 What a removed member can still see

The `ledgerMembers` row is **soft-removed** (`deletedAt`, `deletedByUserId`, `endReason`, optional
`blockedAt`) and there is **exactly one row per `(ledgerId, userId)` forever** — a rejoin patches
`deletedAt: undefined` rather than inserting a second row. That is what keeps `by_ledgerId_userId` a true unique key and the guard a single
indexed read.

| Surface                                                   | After removal                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger list, ledger screen, items, totals, graphs, photos | **Gone within milliseconds.** Every guard is `by_ledgerId_userId` with `deletedAt === undefined`; Convex reactivity pushes the invalidation to the open app without a refetch.                                                                                                                                                                                                                       |
| Items they authored                                       | **Stay in the ledger.** They are the household's records, not the person's. `ledgerItems.authorId` still resolves through the soft-removed row, so the name and avatar keep rendering for remaining members.                                                                                                                                                                                         |
| Their name/avatar in others' UI                           | Still rendered (from the soft-removed row), with a "나간 멤버" style.                                                                                                                                                                                                                                                                                                                                |
| Push notifications for that ledger                        | Stop immediately — fan-out reads `by_ledgerId_deletedAt_role`.                                                                                                                                                                                                                                                                                                                                       |
| In-app `notifications` rows already delivered             | Kept. Tapping one lands on the ledger route and hits the guard → "접근 권한이 없습니다" screen.                                                                                                                                                                                                                                                                                                      |
| Current-process query/image state for that ledger         | Convex reactivity removes the query result; authenticated image memory/disk caches are cleared on membership loss/sign-out. No ledger data is persisted in MMKV.                                                                                                                                                                                                                                     |
| Export files they already downloaded                      | Out of our control — this is why export is ADMIN+ only.                                                                                                                                                                                                                                                                                                                                              |
| Receipt photos                                            | **Future network access stops immediately.** Documents carry only photo ids. D4's HTTP action authenticates the Bearer token and rechecks current membership before returning bytes, so an old id/token receives the same 404 as missing content. Bytes already viewed, downloaded, cached, or screenshotted remain outside revocation; the app clears its image caches on membership loss/sign-out. |

### 4.4 Leaving a ledger you own — forced transfer

`members.leave({ledgerId, transferToUserId?})`, one mutation, one transaction:

```
role !== 'OWNER'                        → soft-remove me, notify ADMIN+, audit, done.
role === 'OWNER' && memberCount === 1   → §4.5 (this is "delete my ledger").
role === 'OWNER' && memberCount > 1:
    transferToUserId === undefined      → appError('OWNER_MUST_TRANSFER',
                                                    'error.ledger.ownerMustTransfer')
                                          → client opens the "누구에게 넘길까요?" picker
    transferToUserId provided           → assert target is an active member with role !== 'VIEWER'
                                          → patch target row role='OWNER'
                                          → patch ledgers.ownerId
                                          → patch my row role='MEMBER', deletedAt=now,
                                            endReason='LEFT'
                                          → 2 audit rows (TRANSFER_OWNERSHIP, MEMBER_LEFT)
                                          → notify everyone
```

Doing both in one mutation (rather than making the client call `transferOwnership` then `leave`) is not a
nicety: it removes the window where a crash or a lost connection leaves a ledger with an owner who thinks they
left, and it means the two audit rows can never be separated.

A `VIEWER` cannot receive ownership — the picker filters them out — because handing the ledger to someone who
cannot even create an item is a footgun, not a feature.

### 4.5 The last member leaves

Because the OWNER is always a member, "the last member leaves" is exactly "the OWNER leaves a ledger where
`memberCount === 1`" — the legacy `EXIT_ALERT_LAST_USER` path, which called `deleteLedger` and hard-removed the
whole `ledgers/{k}` node (orphaning every photo in Storage, and every other member's dangling
`users/{uid}/ledgers` pointer, note 02 §9).

New behaviour:

1. The mutation sets `ledgers.archivedAt = now`, `ledgers.deletedAt = now`, `purgeAfter = now + 30d`, revokes
   every outstanding invite, and soft-removes the last membership row.
2. The ledger moves to 보관함 in the drawer, greyed, read-only, restorable by its owner for 30 days
   (`ledgers.mutations.restore`).
3. A daily cron picks up `by_purgeAfter` and runs a **batched, self-rescheduling** purge (note 13 §8.4 /
   note 09 §9.5): items → reviews → photos in `_storage` → rollups → invites → redemptions → join requests →
   members → audit log → the ledger. Each batch is bounded (`.take(200)`) and reschedules itself, so the
   32,000-documents-scanned and 16,000-documents-written transaction limits (note 13 §1.6) are never
   approached regardless of ledger size.
4. Photos are deleted from `_storage` explicitly — legacy `deleteLedger` orphaned every blob in the bucket.

If a ledger's owner _account_ is deleted (`user/mutations.deleteAccount`), the same logic runs per owned
ledger, but transfer is attempted first: ownership passes to the longest-tenured active `ADMIN`, else the
longest-tenured active `MEMBER`, else — nobody left — the ledger is archived for 30 days and purged. This is
the case that silently produced permanently ownerless ledgers in the legacy data.

### 4.6 Other side effects worth naming

- **Role change** patches the row, writes an audit entry and notifies the target. Demoting the only ADMIN is
  allowed (the OWNER still exists); demoting/removing the OWNER is impossible by construction (§1.4 #17/#18).
- **Ownership transfer** patches two membership rows _and_ `ledgers.ownerId` in one transaction, then reads
  `by_ledgerId_deletedAt_role` and asserts exactly one active OWNER whose user id equals `ledgers.ownerId`.
  Ledger creation, owner leave/account deletion, and any role mutation that can affect ownership run the
  same assertion before commit. The nightly `OWNER_INVARIANT_CHECK` alerts and never self-heals.
- **Currency confirmation** (#22) sets `maintenanceLock: 'CURRENCY'`, schedules the resumable
  `CURRENCY_REBASE` job, re-derives `amountMinor` and `baseAmountMinor` from `legacyRealAmount`, rebuilds
  every rollup, writes `CURRENCY_CONFIRMED`, and unlocks only after success. Populated non-migrated
  ledgers cannot change base currency in v1.
- **Archive** revokes all invites, blocks all writes (`requireLedgerRole` rejects any minimum above `VIEWER`
  when `archivedAt !== undefined`), and keeps the ledger readable by its members.

### 4.7 Account blocking inside an existing ledger

`moderation-and-safety.md` owns report/block UI and ops actions. A directional account block is enforced
symmetrically for discovery, direct invites/requests, future join/redeem/approval, notifications, profile
identity, and comments. It does **not** mutate either membership, any item, or a rollup. Item money/date/
category/memo remain visible; author identity becomes a blocked-user placeholder and comments collapse.
The confirmation offers Leave this ledger and, for ADMIN+, the separate governed Remove member action.

---

## 5. Convex tables and function signatures

House style per `SCHEMA.md` §1.2: one file per table under `convex/schema/`,
`'by_' + fields.join('_')` index grammar with exact field names,
epoch-ms `v.number()` timestamps, enum validators exported from the schema file, `returns:` validators on
**100%** of functions, `ConvexError({code, messageKey, params})`, `paginationOptsValidator` on every unbounded
list. `legacyUid` / `legacyKey` present from day one (`DECISIONS.md` §4).

### 5.1 `convex/schema/ledgers.ts` (sharing-relevant fields only)

The normative table and validators are `SCHEMA.md` §3.5. This flow uses its required `description`,
token-valued `colorKey`, `baseCurrency`, lifecycle fields, and exact indexes; it does not redefine a
sharing-only subset.

### 5.2 `convex/schema/ledgerMembers.ts`

The normative table and role/join/end-reason validators are `SCHEMA.md` §3.6. Membership removal uses
`deletedAt`, `deletedByUserId`, and `endReason`; invitation provenance uses `invitedByUserId`. The O(1)
guard is `by_ledgerId_userId`, and live roster/fan-out reads use
`by_ledgerId_deletedAt_role`.

### 5.3 `convex/schema/ledgerInvites.ts`

The normative invite, redemption, and join-request tables and validators are `SCHEMA.md` §3.7.
Stored email targets are `inviteeEmailNormalized`; actor fields are `createdByUserId`,
`revokedByUserId`, and `decidedByUserId`. The management index includes its sort key:
`by_ledgerId_revokedAt_createdAt`.

### 5.4 `convex/schema/ledgerInviteRedemptions.ts`

See `SCHEMA.md` §3.7. Redeem idempotency is `by_inviteId_userId`; management/repair ordering is
`by_inviteId_redeemedAt`.

### 5.5 `convex/schema/ledgerJoinRequests.ts`

See `SCHEMA.md` §3.7. Approval ordering is `by_ledgerId_status_requestedAt`; pair uniqueness and
outgoing/expiry reads are `by_ledgerId_userId`, `by_userId_status`, and `by_status_expiresAt`.

### 5.6 `convex/schema/ledgerAuditLog.ts`

The normative audit schema and action set are `SCHEMA.md` §3.8. Audit actors and time are
`actorUserId` and `createdAt`; paginated and target-specific reads use
`by_ledgerId_createdAt` and `by_ledgerId_targetUserId_createdAt`.

### 5.7 `convex/lib/ledgerPermissions.ts`

Extends the FightingHows `lib/permissions.ts` pattern (note 09 §4) with the per-ledger dimension. Note 09 §13
already prescribes this: _"Roles become per-ledger (`ledgerMembers` join table) plus a thin global `appRole`."_

```ts
import {ConvexError} from 'convex/values';
import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';
import {requireProfile, getCurrentProfile} from './permissions';
import {appError} from './errors';

export type LedgerRole = Doc<'ledgerMembers'>['role'];

export const LEDGER_ROLE_RANK: Record<LedgerRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export interface LedgerContext {
  profile: Doc<'userProfiles'>;
  ledger: Doc<'ledgers'>;
  membership: Doc<'ledgerMembers'>;
  role: LedgerRole;
}

export function hasLedgerRole(role: LedgerRole, minimum: LedgerRole): boolean {
  return LEDGER_ROLE_RANK[role] >= LEDGER_ROLE_RANK[minimum];
}

/**
 * The single gate every ledger-scoped function opens with.
 * Cost: 1 index read on userProfiles.by_userId + 1 on ledgers (by id)
 *     + 1 on ledgerMembers.by_ledgerId_userId. Three point reads, no scans, ever.
 */
export async function requireLedgerRole(
  ctx: QueryCtx | MutationCtx,
  ledgerId: Id<'ledgers'>,
  minimum: LedgerRole,
  opts: {allowArchived?: boolean} = {},
): Promise<LedgerContext> {
  const profile = await requireProfile(ctx); // lib/permissions.ts

  const ledger = await ctx.db.get('ledgers', ledgerId);
  if (!ledger || ledger.deletedAt !== undefined) {
    throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
  }

  const membership = await ctx.db
    .query('ledgerMembers')
    .withIndex('by_ledgerId_userId', (q) =>
      q.eq('ledgerId', ledgerId).eq('userId', profile.userId),
    )
    .unique(); // unique by invariant §5.2

  if (!membership || membership.deletedAt !== undefined) {
    // Same code as a non-existent ledger: never confirm that a ledger id is real
    // to somebody who is not a member.
    throw appError('LEDGER_NOT_FOUND', 'error.ledger.notFound');
  }

  if (!hasLedgerRole(membership.role, minimum)) {
    throw appError('LEDGER_FORBIDDEN', 'error.ledger.forbidden');
  }

  // An archived ledger is readable but frozen: anything above VIEWER is refused.
  if (
    ledger.archivedAt !== undefined &&
    !opts.allowArchived &&
    LEDGER_ROLE_RANK[minimum] > LEDGER_ROLE_RANK.VIEWER
  ) {
    throw appError('LEDGER_ARCHIVED', 'error.ledger.archived');
  }

  return {profile, ledger, membership, role: membership.role};
}

/** Any live roster member, including VIEWER. The name means membership, not minimum MEMBER role. */
export const requireLedgerMember = (
  ctx: QueryCtx | MutationCtx,
  ledgerId: Id<'ledgers'>,
): Promise<LedgerContext> => requireLedgerRole(ctx, ledgerId, 'VIEWER');

/** Nullable variant for screens that must render for non-members (invite preview). */
export async function getLedgerContext(
  ctx: QueryCtx | MutationCtx,
  ledgerId: Id<'ledgers'>,
): Promise<LedgerContext | null> {
  /* same body, returns null instead of throwing */
}

/** #5 in the permission matrix. */
export function canEditItem(
  lc: LedgerContext,
  item: Doc<'ledgerItems'>,
): boolean {
  if (hasLedgerRole(lc.role, 'ADMIN')) return true;
  if (!hasLedgerRole(lc.role, 'MEMBER')) return false;
  if (lc.ledger.itemWritePolicy === 'ANY_MEMBER') return true;
  return item.authorId === lc.profile.userId;
}

/**
 * The rule behind matrix rows #17 and #18: you may only act on somebody whose rank is
 * STRICTLY below yours, and only assign a role STRICTLY below yours. Consequences that
 * fall out for free: nobody can remove or demote the OWNER; an ADMIN cannot touch
 * another ADMIN; an ADMIN cannot mint another ADMIN; no link can grant OWNER.
 */
export function assertCanActOn(actor: LedgerRole, target: LedgerRole): void {
  if (LEDGER_ROLE_RANK[actor] <= LEDGER_ROLE_RANK[target]) {
    throw appError('CANNOT_ACT_ON_PEER', 'error.ledger.cannotActOnPeer');
  }
}
export function assertCanGrant(actor: LedgerRole, granted: LedgerRole): void {
  if (LEDGER_ROLE_RANK[granted] >= LEDGER_ROLE_RANK[actor]) {
    throw appError('CANNOT_GRANT_ROLE', 'error.ledger.cannotGrantRole');
  }
}
/** Extra rule for links specifically: bearer tokens never carry management rights. */
export function assertGrantableByLink(granted: LedgerRole): void {
  if (granted !== 'MEMBER' && granted !== 'VIEWER') {
    throw appError('ROLE_NOT_LINKABLE', 'error.invite.roleNotLinkable');
  }
}
```

### 5.8 Function inventory — signature, guard, index

`convex/ledgers/`, `convex/members/`, `convex/invites/`, `convex/joinRequests/`, `convex/audit/`.
Every one has an explicit `returns:` validator and an explicit `Promise<T>` handler annotation.

#### Queries

| Function                           | Args                         | Guard                                                                                                        | Index used by the guard / body                                                                                                                                     |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ledgers.queries.myLedgers`        | `{paginationOpts}`           | `requireProfile`                                                                                             | `ledgerMembers.by_userId_deletedAt` eq(userId).eq(deletedAt, undefined) → `.paginate()`; then `ctx.db.get` per ledger (bounded by page size)                       |
| `ledgers.queries.get`              | `{ledgerId}`                 | `requireLedgerRole(VIEWER, {allowArchived:true})`                                                            | `ledgerMembers.by_ledgerId_userId`                                                                                                                                 |
| `members.queries.list`             | `{ledgerId, paginationOpts}` | `requireLedgerRole(VIEWER)`                                                                                  | guard: `by_ledgerId_userId`; body: `by_ledgerId_deletedAt_role` eq/eq → `.paginate()`; profiles joined by `loadProfileMap` (note 09 §6 serializer, the N+1 killer) |
| `members.queries.listGhosts`       | `{ledgerId}`                 | `requireLedgerRole(VIEWER)`                                                                                  | `ledgerInvites.by_ledgerId_revokedAt_createdAt` `.take(50)`, filtered in JS to bound invites → the "INVITING / 미가입" rows                                        |
| `invites.queries.listActive`       | `{ledgerId}`                 | `requireLedgerRole(MEMBER)`; rows not created by the caller are dropped unless `hasLedgerRole(role,'ADMIN')` | `by_ledgerId_revokedAt_createdAt` eq(ledgerId).eq(revokedAt, undefined) `.take(21)`                                                                                |
| **`invites.queries.preview`**      | `{code}`                     | **none** — public                                                                                            | `by_codeHash` eq; `ctx.db.get('ledgers')`; `userProfiles.by_userId` for the inviter; `ledgerMembers.by_ledgerId_userId` only when signed in (for `alreadyMember`)  |
| `invites.queries.myPendingInvites` | `{}`                         | `requireProfile`                                                                                             | `by_inviteeEmailNormalized_revokedAt` eq(myVerifiedEmail).eq(undefined) ∪ `by_inviteeUserId_revokedAt` eq(me).eq(undefined), each `.take(20)`                      |
| `joinRequests.queries.listPending` | `{ledgerId, paginationOpts}` | `requireLedgerRole(ADMIN)`                                                                                   | `by_ledgerId_status_requestedAt` eq(ledgerId).eq('PENDING') → `.paginate()`                                                                                        |
| `joinRequests.queries.mine`        | `{}`                         | `requireProfile`                                                                                             | `by_userId_status` eq(me).eq('PENDING') `.take(20)`                                                                                                                |
| `audit.queries.list`               | `{ledgerId, paginationOpts}` | `requireLedgerRole(ADMIN)`                                                                                   | `by_ledgerId_createdAt` eq → `.order('desc').paginate()`                                                                                                           |

#### Mutations

| Function                                                            | Args                                                                                          | Guard                                                                                                                       | Notes                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ledgers.mutations.create`                                          | `{title, description, colorKey, baseCurrency}`                                                | `requireProfile`                                                                                                            | inserts ledger (`ownerId: me`, `memberCount: 1`) + `ledgerMembers` row `role:'OWNER'` + audit; asserts the OWNER mirror    |
| `ledgers.mutations.update`                                          | `{ledgerId, title?, description?, colorKey?, itemWritePolicy?, invitePolicy?, baseCurrency?}` | `requireLedgerRole(ADMIN)`; `baseCurrency` additionally requires `OWNER` + zero live items                                  | audit `LEDGER_UPDATED` with changed keys in `meta`; base-currency emptiness uses the indexed `.first()` probe              |
| `ledgers.mutations.confirmCurrency`                                 | `{ledgerId, baseCurrency}`                                                                    | `requireLedgerRole(OWNER)` + `currencyIsAssumed === true`                                                                   | matrix #22; `maintenanceLock: 'CURRENCY'` → `CURRENCY_REBASE` → `ROLLUP_REBUILD`; audit `CURRENCY_CONFIRMED`; one use only |
| `ledgers.mutations.transferOwnership`                               | `{ledgerId, toUserId}`                                                                        | `requireLedgerRole(OWNER)`                                                                                                  | target must be active and `role !== 'VIEWER'`; patches 2 rows + `ownerId`; notifies all                                    |
| `ledgers.mutations.archive` / `unarchive`                           | `{ledgerId}`                                                                                  | `requireLedgerRole(OWNER, {allowArchived:true})`                                                                            | archive also revokes every active invite                                                                                   |
| `ledgers.mutations.scheduleDelete`                                  | `{ledgerId}`                                                                                  | `requireLedgerRole(OWNER, {allowArchived:true})`                                                                            | `deletedAt`, `purgeAfter = now+30d`; cron §4.5                                                                             |
| `ledgers.mutations.restore`                                         | `{ledgerId}`                                                                                  | owner-of-deleted (special path: `by_ownerId_deletedAt`)                                                                     | within 30 days                                                                                                             |
| `invites.mutations.create`                                          | `{ledgerId, role, maxUses?, ttlMs?, requiresApproval, inviteeEmail?, inviteeUserId?, note?}`  | `requireLedgerRole(MEMBER)` + policy/rank/rate guards; direct user target additionally checks both account-block directions | returns `{inviteId, code, url}` — **the only time the plaintext exists server-side**; 20-active cap                        |
| `invites.mutations.revoke`                                          | `{inviteId}`                                                                                  | `requireLedgerRole(MEMBER)` then `invite.createdByUserId === me \|\| hasLedgerRole(role,'ADMIN')`                           | audit                                                                                                                      |
| **`invites.mutations.redeem`**                                      | `{code}`                                                                                      | `requireProfile` + handle claimed + `rateLimiter('inviteRedeem')`                                                           | §2.7 including all-live-member two-direction safety checks, one transaction                                                |
| `invites.mutations.removeAllJoinedVia`                              | `{inviteId}`                                                                                  | `requireLedgerRole(ADMIN)`                                                                                                  | `ledgerMembers.by_joinedViaInviteId` `.take(200)`; skips self and anyone with rank ≥ actor                                 |
| `joinRequests.mutations.decide`                                     | `{requestId, approve}`                                                                        | `requireLedgerRole(ADMIN)` on `request.ledgerId`                                                                            | approval re-runs all-member block checks; a hit terminates `BLOCKED`, otherwise upsert + notify                            |
| `joinRequests.mutations.cancel`                                     | `{requestId}`                                                                                 | `requireProfile` + `request.userId === me`                                                                                  | → `CANCELLED`                                                                                                              |
| `members.mutations.setRole`                                         | `{ledgerId, userId, role}`                                                                    | `requireLedgerRole(ADMIN)` + `assertCanActOn(actor, target.role)` + `assertCanGrant(actor, role)`                           | never `OWNER` (that is `transferOwnership`)                                                                                |
| `members.mutations.remove`                                          | `{ledgerId, userId, block?}`                                                                  | `requireLedgerRole(ADMIN)` + `assertCanActOn` + `rateLimiter('ledgerMemberChurn', {key: ledgerId})`                         | soft-remove + optional `blockedAt`                                                                                         |
| `members.mutations.leave`                                           | `{ledgerId, transferToUserId?}`                                                               | `requireLedgerRole(VIEWER, {allowArchived:true})`                                                                           | §4.4 / §4.5                                                                                                                |
| `categories.mutations.create`                                       | `{ledgerId, kind, label, iconKey, colorToken}`                                                | `requireLedgerRole(MEMBER)`                                                                                                 | matrix #10; a MEMBER may intentionally materialize the first overlay                                                       |
| `categories.mutations.reorder` / `rename` / `setHidden` / `archive` | category-specific args                                                                        | `requireLedgerRole(ADMIN)`                                                                                                  | matrix #11; shared taxonomy/history change                                                                                 |

#### Actions / internal maintenance

| Function                                    | Kind             | Notes                                                                                                                                                                                               |
| ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invites.actions.sendInviteEmail`           | `action`         | `requireActionUserId` then an `internalQuery` re-check of ADMIN/MEMBER rights (an action has no `db`, note 09 §4). Resend; the code is passed in from the mutation's return value, never re-derived |
| `exports.mutations.requestPersonal`         | `mutation`       | active account → rate/one-active guard → `dataExports` + `USER_EXPORT`; only requester data, protected expiring parts                                                                               |
| `exports.mutations.requestLedger`           | `mutation`       | `requireLedgerRole(ADMIN)` → rate/one-active guard → `dataExports` + `LEDGER_EXPORT`; audit `EXPORT_REQUESTED`                                                                                      |
| `GET /exports/file/<fileId>`                | `httpAction`     | Convex Auth Bearer token → requester/READY/expiry check → return ≤18 MiB blob with private no-store headers; never expose `storageId`/`getUrl()`                                                    |
| `notifications.actions.sendExpoPush`        | `internalAction` | unchanged from note 09 §10.3, extended with the new `kind`s                                                                                                                                         |
| `internal.joinRequests.expirePending`       | cron handler     | `by_status_expiresAt` eq('PENDING').lt(expiresAt, now) `.take(200)` → `EXPIRED`                                                                                                                     |
| `internal.invites.expireAndRepairUseCount`  | cron handler     | expire/GC invite rows and run `INVITE_USECOUNT_REPAIR` in bounded batches                                                                                                                           |
| `internal.maintenance.purgeDeletedLedgers`  | cron handler     | `by_purgeAfter` lt(now) → batched self-rescheduling purge (§4.5)                                                                                                                                    |
| `internal.maintenance.repairLedgerCounters` | cron handler     | includes `MEMBER_COUNT_REPAIR` from `by_ledgerId_deletedAt_role` `.take(MEMBER_SCAN_LIMIT)`                                                                                                         |

`SCHEMA.md` §6.1 is the only `convex/crons.ts` registry and owns the exact schedules for these handlers.

Base index-range reads per redeem remain **7** (profile, rate limiter, invite, ledger, membership,
redemption, join-request cooldown). A non-member adds one capped live-roster range and two exact block
lookups per live member: **≤408 ranges and ≤607 documents** at the 200-member hard cap, including the base
reads. This remains bounded below Convex's 4,096-range-read and 32,000-document-scan transaction limits;
the sentinel rejects a corrupt 201st member instead of weakening the safety check.

---

## 6. Security review of this design

Each row: the attack, and the specific mechanism that blocks it.

| #   | Attack                                                                                                   | Blocked by                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Guess an invite code.**                                                                                | 128 bits from `crypto.getRandomValues`. At 1,000 guesses/sec it is ~10³¹ years to reach 1% probability. Codes are opaque — no ledger id, no timestamp, no counter, so no structure to narrow the space.                                                                                                                                                                                         |
| 2   | **Online scan of the code space.**                                                                       | `rateLimiter('inviteRedeem')` 20/h/user, and redeem requires an authenticated account with a claimed handle. The web preview path is 60/h/IP in the `httpAction`. Both are belt-and-braces on top of #1.                                                                                                                                                                                        |
| 3   | **Steal a DB export / backup and get working links.**                                                    | Only `codeHash = sha256(pepper + ':' + code)` is stored; the pepper is a Convex env var, not in the data. An export yields nothing redeemable. This is the whole reason the design gave up link re-display (§2.2).                                                                                                                                                                              |
| 4   | **Read a code out of logs or an error report.**                                                          | The code never appears in `console.*`, never in a `ConvexError` message, never in `ledgerAuditLog.meta`, never in a notification body. Audit rows reference `targetInviteId`, an opaque Convex id.                                                                                                                                                                                              |
| 5   | **Leaked link in a group chat → strangers join.**                                                        | §2.9: 7-day default expiry, `maxUses`, granted role capped at MEMBER, `requiresApproval` toggle, immediate ADMIN notification with the joiner's handle, `revoke` + `removeAllJoinedVia`, and `block` on removal.                                                                                                                                                                                |
| 6   | **A removed member rejoins with the old link.**                                                          | Redeem step 9 reads the _existing_ `ledgerMembers` row (soft-removed, never deleted) and returns `BLOCKED` when `blockedAt` is set. Without `block`, they can rejoin — which is intentional for an accidental removal — but the ADMIN is notified again.                                                                                                                                        |
| 7   | **Privilege escalation through a link** (mint an OWNER/ADMIN link).                                      | Three independent checks in `invites.create`: `assertCanGrant(actorRole, role)` (strictly below the actor), `assertGrantableByLink(role)` (MEMBER/VIEWER only, period), and the `invitePolicy` gate. The redeem path takes the role from the **invite row**, never from the caller's args.                                                                                                      |
| 8   | **Self-promotion by tampering with mutation args.**                                                      | No mutation accepts "my role" as an argument. `requireLedgerRole` re-reads the caller's membership row from the DB on every single call. The client's cached role is never trusted for anything but UI affordance.                                                                                                                                                                              |
| 9   | **Hostile ADMIN takes over the ledger.**                                                                 | `assertCanActOn` requires strictly-greater rank, so an ADMIN can never remove, demote, or promote another ADMIN or the OWNER; and `setRole` can never assign `OWNER`. Currency change, transfer, archive, and delete are OWNER-only. The OWNER can always demote the ADMIN and recover.                                                                                                         |
| 10  | **Ledger enumeration by guessing a `ledgerId`.**                                                         | Every ledger-scoped function opens with `requireLedgerRole`, which returns `NOT_FOUND` — _the same code_ — for "no such ledger" and for "you are not a member". A valid id therefore leaks nothing.                                                                                                                                                                                             |
| 11  | **Scrape the member directory via `preview`.**                                                           | Preview returns the ledger title/`colorKey`/`memberCount` and **one** profile (the inviter's, which is already public via `/@handle`). No member list, no emails, no amounts, no item counts.                                                                                                                                                                                                   |
| 12  | **Scrape all users' emails** (the legacy `inviteUsers` full-directory read, note 02 §13 S7).             | There is no client-reachable path that reads more than one `userProfiles` row by email, and that path (`by_emailNormalized`) is only ever hit server-side inside `invites.create` with an email the caller already typed. Member-list responses carry `displayName`/`handle`/`avatar` only — never `email` — for non-managers.                                                                  |
| 13  | **Hijack an email-bound invite.**                                                                        | Redeem compares `invite.inviteeEmailNormalized` to the caller's **verified** email (the provider-verified value that `DECISIONS.md` §3 already requires for account merging), normalized identically on both sides. Unverified emails never match.                                                                                                                                              |
| 14  | **Hijack a handle-bound invite after the target renames.**                                               | Binding is `inviteeUserId: Id<'users'>`, not the handle string. Note 09 §12.7's rename/impersonation history is irrelevant here because the token never references a handle.                                                                                                                                                                                                                    |
| 15  | **Invite spam / notification flooding.**                                                                 | `inviteCreate` 10/h + 40/day per user, 20 active links per ledger, `joinRequestCreate` 5/h, `ledgerMemberChurn` 30/h per ledger. Every push fan-out is bounded by the member list and gated by the recipient's own `pushEnabled` (note 09 §10.3).                                                                                                                                               |
| 16  | **Join-request harassment** (request → rejected → request again forever, the legacy toggle's behaviour). | `by_ledgerId_userId` enforces at most one non-terminal row per pair; `REJECTED` starts a 7-day cooldown checked in redeem step 11; `PENDING` auto-`EXPIRED` after 14 days by cron.                                                                                                                                                                                                              |
| 17  | **Race the `maxUses` counter** (two people redeem the last slot).                                        | Check and increment are in one Convex mutation. The loser hits OCC, Convex re-runs the whole handler, the re-run reads the updated `useCount` and returns `EXHAUSTED`. At most `maxUses` memberships are ever created.                                                                                                                                                                          |
| 18  | **Double-tap / retry burns extra uses.**                                                                 | `ledgerInviteRedemptions.by_inviteId_userId` makes redeem idempotent per (invite, user); an `ALREADY_MEMBER` result never increments `useCount`.                                                                                                                                                                                                                                                |
| 19  | **Race a removal against a redeem.**                                                                     | Both mutations write the same `ledgerMembers` document, so Convex serializes them. Whichever commits second sees the first's state — a removal that lands after a join removes the new member; a join that lands after a removal is evaluated against `blockedAt`. There is no interleaving that produces a member with no row or a row with no count.                                          |
| 20  | **Forge a deep link on a look-alike host** (`bookoo.hyo.dev.evil.com/invite/…`).                         | iOS AASA and Android `assetlinks.json` are host-verified by the OS, and `+native-intent.tsx` re-parses the URL against `DEEP_LINK_HOST` before mapping it. A URL from any other host opens in the browser and never reaches the app's invite route.                                                                                                                                             |
| 21  | **Open redirect / XSS on the web landing page.**                                                         | The page renders only server-fetched preview fields, HTML-escaped; it never reflects a query parameter and never redirects to a URL taken from the request. The only outbound links are the two fixed store URLs and the fixed `bookoo://` scheme.                                                                                                                                              |
| 22  | **Clipboard poisoning on first launch** (attacker leaves a code in the clipboard).                       | The clipboard read is behind an explicit "참여할까요?" confirm showing the full preview card, requires a strict `INVITE_CODE_RE` match, and the stored pending code has a 24-hour TTL. Worst case the victim is shown a card for a ledger they can decline.                                                                                                                                     |
| 23  | **Cross-account leakage of a pending code** (device shared, user A's code redeemed by user B).           | The pending code is cleared on sign-out and on every terminal redeem result, and it is stored in `SecureStore` (per-app, OS-encrypted), not in MMKV.                                                                                                                                                                                                                                            |
| 24  | **Data exfiltration by a VIEWER.**                                                                       | Export is ADMIN+ (matrix #26). A VIEWER can of course screenshot what they can see — which is why VIEWER is offered as the _safer_ link role, not as a confidentiality boundary.                                                                                                                                                                                                                |
| 25  | **Photos remain reachable after removal.**                                                               | Closed by D4 (§4.3): every network request authenticates and rechecks current membership; no bearer storage URL is stored or projected. Previously viewed local bytes remain equivalent to a download/screenshot and app caches are purged on removal.                                                                                                                                          |
| 26  | **Ownerless ledger** (owner deletes their account or is removed).                                        | The OWNER cannot be removed by anyone (#9); `leave` forces a transfer (§4.4); `deleteAccount` transfers each owned ledger to the longest-tenured ADMIN, else MEMBER, else archives it (§4.5). Every ownership-changing path asserts in the same transaction that exactly one active OWNER row exists and equals `ledgers.ownerId`; the nightly check alerts on drift without guessing a repair. |
| 27  | **Migration replay creates duplicate memberships or resurrects revoked access.**                         | `by_ledgerId_userId` upsert semantics (one row per pair, forever) make the member importer idempotent; materialized legacy invites are keyed on `legacyKey` and skipped when the email already resolves to an active member (§3.1 step 2).                                                                                                                                                      |
| 28  | **Somebody reads the ledger through a stale Convex subscription after removal.**                         | Convex invalidates any query whose read set includes the mutated `ledgerMembers` row — which is _every_ ledger-scoped query, because they all open with `requireLedgerRole`. The removal therefore pushes an error to every open subscription within milliseconds. This is a property of the guard being a DB read rather than a cached claim.                                                  |
| 29  | **A harasser follows a blocker into a shared ledger through somebody else's link/request.**              | Redeem/request/approval compare the candidate with every capped live member in both account-block directions before any use/request/membership write. Direct user invites check the pair at creation. Existing co-members keep financial rows but lose identity/communication surfaces per `moderation-and-safety.md`.                                                                          |

Two things this design does **not** defend against, stated plainly:

- A current member who screenshots, exports, or simply remembers the ledger's contents. Sharing a ledger means
  trusting the people you share it with; the design bounds _who becomes a member_, not what members do.
- A compromised device with a live session. That is the app-lock feature's problem (legacy `LOCKED` /
  `LOCKED_NUMBER` / `LOCKED_FINGERPRINT`, note 02 §14) and belongs in a different design doc — with the note
  that the legacy PIN was stored in `AsyncStorage` **in plaintext** and must move to `SecureStore`.

---

## 7. Client surface

| Route                                | Screen                            | Notes                                                                                                                               |
| ------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/invite/[code].tsx`              | Preview card → 참여하기           | Works signed-out (calls `invites.preview`); the join button routes to sign-in and preserves the pending code                        |
| `app/invite/code.tsx`                | 코드 직접 입력                    | `formatInviteCodeForDisplay` grouping, auto-dashes, paste-friendly                                                                  |
| `app/(app)/ledger/[id]/members.tsx`  | Member list                       | FlashList + `ReanimatedSwipeable` (swipe = 제거), crown on OWNER, role chip, "링크로 참여 · N일 전", ghost rows for pending invites |
| `app/(app)/ledger/[id]/invites.tsx`  | 초대 링크 관리                    | note / creator / created / uses / expiry / Revoke. No URLs. `+ 새 링크` opens the create sheet then the native share sheet          |
| `app/(app)/ledger/[id]/requests.tsx` | 승인 대기                         | The legacy `WAITING_LIST` block, promoted to its own screen; badge on the members tab                                               |
| `app/(app)/ledger/[id]/audit.tsx`    | 활동 기록                         | ADMIN+; paginated                                                                                                                   |
| `app/(app)/index`                    | "받은 초대" cards                 | From `invites.queries.myPendingInvites`                                                                                             |
| `app/+native-intent.tsx`             | `/invite/:code` → `/invite/:code` | §2.4                                                                                                                                |

Tablet (note 07): `members` / `invites` / `requests` render as a two-pane split — list on the left, detail or
the create-link sheet on the right — instead of three pushed screens. Dark/light comes free from cpk-ui theme
tokens; the six legacy ledger colors become `{light, dark}` token pairs rather than raw `rgb()` strings.

i18n keys (note 04 §9 naming), added to `ko` / `en` / `ja` / `zh` / `id`:

```
ledger.role.owner|admin|member|viewer
ledger.members.title|empty|removedBadge|joinedViaLink|pendingInvite
ledger.invite.create|share|revoke|revokeConfirm|expiresIn|usesLeft|unlimited|requireApproval
ledger.invite.preview.title|invitedBy|memberCount|joinCta|declineCta
ledger.invite.result.joined|alreadyMember|requested|requestPending|invalid|expired|revoked|
                     exhausted|emailMismatch|wrongAccount|ledgerUnavailable|blocked|rateLimited
ledger.request.title|approve|reject|cancel|cooldown
ledger.transfer.title|confirm|pickMember
ledger.leave.confirm|ownerMustTransfer|lastMemberArchives
error.ledger.notFound|forbidden|archived|cannotActOnPeer|cannotGrantRole
error.invite.roleNotLinkable
notification.ledger.memberJoined|joinRequested|joinApproved|joinRejected|roleChanged|
                   memberRemoved|memberLeft|ownershipTransferred|inviteReceived|archived
```

---

## 8. Implementation checklist

1. `shared/inviteCode.ts` + `__tests__/inviteCode.test.ts` (encode / normalize round-trip, Crockford
   confusables, hash stability, regex rejection of near-misses). Pure, no ctx — the `shared/` seam from
   note 09 §8.
2. `bunx convex env set INVITE_TOKEN_PEPPER $(openssl rand -hex 32)` in dev **and** prod.
3. Schema files §5.1–5.6, assembled in `convex/schema.ts`.
4. `convex/lib/ledgerPermissions.ts` (§5.7) + `convex/lib/rateLimits.ts` (§2.8) +
   `convex/convex.config.ts` mounting `@convex-dev/rate-limiter`.
5. Membership helpers: one exact `memberCount` delta per membership mutation plus the in-transaction
   single-OWNER assertion. Migration P3 inserts raw rows and patches the measured count once per ledger.
6. Functions §5.8, in dependency order: `ledgers` → `members` → `invites` → `joinRequests` → `audit`.
7. `app.config.ts` deep-link config + AASA + `assetlinks.json` + `app/+native-intent.tsx`.
8. `src/features/invite/pendingInvite.ts` (SecureStore custody, 24 h TTL) and the root-layout redirect effect.
9. `GET /invite/:code` httpAction landing page (server-rendered preview, IP rate limit, clipboard CTA, Android
   referrer parameter, grouped code).
10. `react-native-play-install-referrer` wiring (Android deferred deep link) — needs a dev-client rebuild.
11. Screens §7, then the swipe/crown/ghost-row details from note 01 §5.16.
12. Implement the sharing maintenance handlers, then register them only through the eleven-job inventory in
    `SCHEMA.md` §6.1.
13. Migration: `legacyInvites` archive import + reconcile + on-claim materialization (§3.1);
    `ledgerJoinRequests` import with `source: 'LEGACY_REQUEST'` (§3.3); every migrated ledger gets
    `itemWritePolicy: 'AUTHOR_ONLY'`.
14. `convex-test` coverage for the redeem state machine — one test per `RedeemResult` variant, plus a
    concurrency test proving `maxUses` is never exceeded.
