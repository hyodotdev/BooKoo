# RevenueCat entitlements — normative contract

Product decisions live in `docs/product/MONETIZATION.md`. This file is the
executable contract: identifiers, the webhook state machine, and where authority
sits. Where the two disagree, the product document owns *what* is sold and this
document owns *how it is enforced*.

## 1. Where authority lives

**The client never grants anything.** `react-native-purchases` reports what it
believes, and BooKoo uses that only to decide what to *draw*. Every premium write
is re-checked in Convex against server state that came from RevenueCat, not from
the device.

Three sources of truth, in descending order:

1. **The RevenueCat webhook** → `subscriptionEvents` → `subscribers`. Authoritative.
2. **A server-side REST read** of `GET /v1/subscribers/{app_user_id}`, run by
   `subscriptions.actions.refresh` with the secret API key. Used to close the
   webhook-latency window right after a purchase, and to self-heal.
3. **The client's `CustomerInfo`** — presentation only. It may open a screen; it
   may never authorize a write.

## 2. Identifiers

Never hardcode a price or a product in a screen. Screens name a *capability*; the
mapping to placements and products lives in `shared/entitlements.ts` and in
RevenueCat's dashboard.

| Thing | Identifier |
| --- | --- |
| Entitlement | `bookoo_pro` |
| Offering | `pro` |
| Monthly package | `$rc_monthly` |
| Annual package | `$rc_annual` |
| App Store product (monthly) | `dev.hyo.bookoo.pro.monthly` |
| App Store product (annual) | `dev.hyo.bookoo.pro.annual` |
| App Store subscription group | `bookoo_pro` |
| Play subscription | `pro` with base plans `monthly` / `annual` |

### appUserID

The RevenueCat `appUserID` is the Convex `Id<'users'>` string, and nothing else.

It is stable across sign-out, reinstall, and devices, it is already the join key
for every other table, and it is not personally identifying on its own. Email,
handle, display name, and ledger title are all **forbidden** as `appUserID`;
`shared/entitlements.ts#assertUsableAppUserId` rejects anything containing `@`,
whitespace, or the RevenueCat anonymous prefix, so a regression cannot quietly
start leaking an address into a third-party dashboard.

Identity flow:

- signed in → `Purchases.logIn(userId)`
- signed out → `Purchases.logOut()` (returns to an anonymous id; no entitlement)
- never `configure({appUserID})` with a value the server has not issued

## 3. Household derivation

An entitlement is held by a **person**; access is granted to a **ledger**.

```
capability request on ledger L
  → requireLedgerMember(L)                        (existing O(1) join lookup)
  → read ledgers.ownerId                          (already denormalized on L)
  → subscribers.by_userId(ownerId)                (O(1) indexed lookup)
  → isEntitlementActive(row, now)                 (pure)
```

Two indexed reads, no scan, no per-member fan-out. The invited member is never
consulted about their own subscription — that is the whole point of the model.

The entitlement is **not** denormalized onto `ledgers`. That document is cold by
construction (`schema/ledgers.ts`): a field that changes on every renewal would
invalidate the ledger switcher, every ledger header, and every item mutation's
read set, and would make renewals OCC-conflict with concurrent expense entries.

## 4. Enforcement points

Enforcement is on the **write path only**.

This is not a shortcut, it falls out of two rules that happen to agree:
`docs/product/MONETIZATION.md` §3 says reading your own data is never gated, and
`convex/AGENTS.md` bans `Date.now()` inside a query. A query therefore cannot and
need not evaluate expiry. Queries return the stored row and `expiresAt`; the
client renders from that; mutations decide.

```ts
// convex/lib/entitlements.ts
await requireLedgerEntitlement(ctx, ledger, 'MEMBER_LIMIT');
```

Called immediately after the membership guard, before any domain read or write.
Throws `PREMIUM_REQUIRED` carrying the capability and the placement so the client
opens the right paywall rather than a generic error dialog.

Launch capabilities: `MEMBER_LIMIT`, `SECOND_SHARED_LEDGER`. Comments, photos,
statistics, exports, and ordinary entry creation stay in the complete Free core
until a separately implemented and server-enforced paid boundary is approved.
Store copy and the paywall must never advertise a reserved capability as paid.

Grandfathered ledgers — those with `ledgers.legacyKey` set, written only by the
migration — bypass the member-count check only, per
`docs/product/MONETIZATION.md` §3, and never bypass a new-capability check. The
predicate is `isGrandfathered()`; there is deliberately no separate flag field,
because a derived predicate over a migration-only column cannot drift from the
thing it describes.

## 5. Webhook

`POST /revenuecat/webhook` → `convex/subscriptions/http.ts`.

### Authorization

The `Authorization` header must equal `REVENUECAT_WEBHOOK_AUTH_HEADER`, compared
with a constant-time comparison over the encoded bytes. A missing or mismatched
header returns 401 with no body and writes nothing. The value is a Convex
environment secret; it never appears in this repository, in a log line, or in an
error message.

### Idempotency

RevenueCat retries. Every event carries `event.id`.

1. Look up `subscriptionEvents.by_eventId`. If present → return 200 immediately.
   A duplicate is a success, not an error; returning non-2xx would make
   RevenueCat retry forever.
2. Insert the event row, then apply it.
3. Apply only if `event.event_timestamp_ms >= subscribers.lastEventAt`. Retries
   can arrive out of order; an older event must never overwrite newer state.

Both guards are needed: (1) stops the same delivery twice, (3) stops two
*different* deliveries landing backwards.

### Environment separation

Every event carries `environment: "SANDBOX" | "PRODUCTION"`.

A deployment normally applies only events matching
`REVENUECAT_EXPECTED_ENVIRONMENT`. The September 6 iOS-first release correction
adds one server-enrolled App Review/TestFlight exception: at most 32 exact Convex
user IDs in `REVENUECAT_SANDBOX_APP_USER_IDS` may use RevenueCat-verified,
finite-expiry **Apple** Sandbox subscriptions on production. No client flag,
email wildcard, Google test receipt, or undated test grant enables this path.
Unenrolled mismatches remain `IGNORED_ENVIRONMENT` / HTTP 200.

Such rows retain `environment: SANDBOX` for reporting and never replace an
existing PRODUCTION row, even an expired one. A real purchase can replace test
history, with separate ordering and no inherited cancellation/grace fields.
Both reads and writes check enrollment; removing an ID withdraws its test
access. Cross-environment TRANSFER cannot spread enrollment to another user;
same-account Restore uses authenticated server REST reconciliation. RevenueCat
remains the verifier; the allowlist alone does not grant Pro. Production
webhook routing must deliver both event environments to this policy while dev
continues to accept only Sandbox. No environment setting is globally loosened.

### State machine

`type` → effect on the `subscribers` row:

| Event | `status` | Other effects |
| --- | --- | --- |
| `INITIAL_PURCHASE` | `ACTIVE` | set `expiresAt`, `productId`, `store`, `periodType`, `willRenew = true` |
| `RENEWAL` | `ACTIVE` | extend `expiresAt`, clear `billingIssueDetectedAt` |
| `UNCANCELLATION` | `ACTIVE` | `willRenew = true`, clear `unsubscribeDetectedAt` |
| `PRODUCT_CHANGE` | `ACTIVE` | set new `productId`; `expiresAt` from the event |
| `CANCELLATION` | unchanged (stays `ACTIVE` until expiry) | `willRenew = false`, set `unsubscribeDetectedAt` |
| `BILLING_ISSUE` | unchanged | set `billingIssueDetectedAt`; grace period is still access |
| `SUBSCRIPTION_PAUSED` | `PAUSED` at the pause date | `willRenew = false` |
| `EXPIRATION` | `EXPIRED` | keep `expiresAt` for history |
| `TRANSFER` | move the entitlement | `EXPIRED` on the origin id, applied to the destination id |
| `REFUND` / cancellation with a past `expiration_at_ms` | `EXPIRED` | recorded as `REFUNDED` |

`CANCELLATION` deliberately does **not** revoke. A user who cancels on day 3 of a
month they paid for keeps the month. Revoking early is both wrong and a refund
request.

`TRANSFER` follows RevenueCat's own resolution: the destination `appUserID` in
the event body wins, and the origin is expired in the same mutation. BooKoo does
not attempt to reunify the two accounts' ledgers — a transfer changes who holds
the entitlement, never who owns a ledger.

### Unknown users

An event may arrive for an `appUserID` with no `subscribers` row, or an anonymous
RevenueCat id. Record the event with outcome `UNKNOWN_SUBSCRIBER` and return 200.
Never create a `users` row from webhook input.

## 6. Ownership change

The entitlement follows the person, so transferring ledger ownership moves which
subscription funds the ledger.

- Transferring ownership to a member **without** Pro does not delete
  anything and does not block writes. The ledger drops to free capabilities at
  the moment of transfer, exactly as an expiry would, and over-limit members are
  frozen rather than removed.
- The previous owner keeps their subscription; it simply stops funding that
  ledger.
- The transfer mutation surfaces this consequence before it commits. Silently
  downgrading someone else's household would be indefensible.

## 7. Secrets

| Variable | Home | Never |
| --- | --- | --- |
| `REVENUECAT_SECRET_API_KEY` | Convex environment | client bundle, repo, logs |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | Convex environment | client bundle, repo, logs |
| `REVENUECAT_EXPECTED_ENVIRONMENT` | Convex environment (non-secret) | — |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | EAS / `.env` | — (public by design; it is a client SDK key) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | EAS / `.env` | — |

`EXPO_PUBLIC_*` values are inlined into the JS bundle and readable by anyone who
downloads the app. That is correct for RevenueCat *public* SDK keys and wrong for
everything else. The secret API key is never one of them.

`.env.example` carries variable **names** only.

## 8. Degraded states

Every one of these is a state the app must render deliberately, not an exception
to swallow.

| State | Behaviour |
| --- | --- |
| Purchase pending (e.g. Ask to Buy) | show pending; grant nothing; the webhook resolves it |
| Purchase cancelled by user | return to the previous screen silently; not an error dialog |
| Already subscribed | never offer the same product twice; show manage instead |
| Offline | use the last server-confirmed row; never grant on client cache alone |
| RevenueCat unreachable | keep last known server state; retry with backoff; never revoke on a fetch failure |
| Webhook lagging | `refresh` closes the window; the UI shows a short "confirming" state |
| Store account differs from BooKoo account | RevenueCat `TRANSFER`; follow §5 |

The asymmetry is deliberate: **failures never revoke.** A network error must not
take away a household's paid features. Only an explicit `EXPIRATION`,
`SUBSCRIPTION_PAUSED`, or refund does that.

## 9. The subscription cannot take down the app

`SubscriptionProvider` sits in the root provider stack and Convex's `useQuery`
throws during render. Without a guard, a deployment that has not yet published
`subscriptions.queries.mine` — or any transient failure resolving it — would
propagate to the root error boundary and replace the **entire app** with a crash
screen.

Purchases are an optional capability. A ledger that works offline and without
payment must not be brought down by the part that sells upgrades. The provider
isolates its query probe inside an `ErrorBoundary`, with the app as a sibling.
A probe error means **unknown entitlement**, not a confirmed free tier: ads are
suppressed, client-only Pro is never granted, and the ledger remains available.
The probe retries when the authentication signature changes.

`test/src/features/subscriptionProvider.test.tsx` verifies this by making the
query throw, and was confirmed to FAIL when the boundary is removed — it is a
regression test, not a decoration.

## 10. Known costs

**The SDK pulls its web bundle into native builds.**
`react-native-purchases/dist/purchases.js` line 43 does an unconditional
`require('./browser/nativeModule')`, so `@revenuecat/purchases-js-hybrid-mappings`
— 840 KB of minified JS — is bundled on iOS and Android even though the native
modules are what actually run there.

This is upstream behaviour, not a misconfiguration here. It is **accepted, not
worked around**: a Metro resolver alias stubbing out an internal path of a
payments SDK is exactly the kind of clever fix that produces a purchase failure
in production, and a working purchase is the one thing Shipaton eligibility
depends on. Revisit only if RevenueCat splits the entry point upstream.

Measured after this change: iOS 10 MB and Android 10 MB Hermes bytecode. The
`8.1 MB` recorded on 2026-08-25 predates two days of unrelated P1 work, so the
delta is **not** attributable to this dependency alone and no such claim is made.

The `web` target does not build, for an unrelated pre-existing reason
(`react-native-pager-view` reaching a native-only module). Verified to reproduce
identically at `8e754b0`, before this work. It does not affect the iOS/Android
release.

## 11. Verification status

On September 6, the user's iPad sandbox monthly purchase was verified in
RevenueCat and the development Convex deployment: INITIAL_PURCHASE and RENEWAL
were APPLIED, with matching APP_STORE/SANDBOX `bookoo_pro` state. The physical
iPad displayed active Pro; Customer Center restored the same purchase and
returned to server-confirmed Pro without another transaction. These are local
debug-build integration results, not signed-store release acceptance.

Both previously empty Apple server-notification URLs now point to BooKoo's
RevenueCat Apple app, independently verified in App Store Connect. Apple's
sandbox TEST subsequently returned delivery SUCCESS. This remains distinct
from refund/cancellation and closed-app lifecycle acceptance. Evidence references
live in the [shared audit](../qa/loop-ui/2026-09-06.md).

Google's actual license-test receipt remains rejected by its subscriptions API
(401 permissionDenied), even though catalog validation passes. Transfer,
billing issues, the complete collaboration matrix and final store artifacts
remain unverified. Never infer those from this focused iPad result.
