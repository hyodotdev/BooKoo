# OpenIAP + IAPKit — current subscription contract

Owner decision: 2026-10-14. The competition is closed and RevenueCat is removed.
Product policy remains in `docs/product/MONETIZATION.md`; the existing store
products, Free/Pro limits and ledger-owner funding model remain authoritative.

## Canonical owners

- Native store lifecycle: `expo-iap` 6.0.2 (OpenIAP); adapter in
  `src/features/subscription/client.ts`. One provider owns connection/listeners. Returned receipts and listener
  receipts use the same account-scoped verification and in-flight deduplication.
- Products/capabilities: `shared/entitlements.ts`. Monthly/annual identifiers
  map to the existing Apple products and Play `pro` base plans. Prices and
  eligible offer tokens come from native stores. `plans.ts` maps their types
  into the existing cpk-ui settings composition.
- Verification/account binding: `convex/subscriptions/actions.ts`. Authenticate
  through `internalQueries.caller`; send bounded proof plus expected product to
  IAPKit `/v1/purchase/verify`, then bind its verified transaction to that caller
  through `/v1/subscriptions/bind-user`. The captured expected user id must equal
  the authenticated caller before proof is sent; it guards a queued action across
  account changes and never selects the binding owner.
- Purchase state/projection: subscriptionPurchases and
  convex/lib/subscriptionProjection.ts; one indexed subscribers projection.
- Provenance and access: receipt-verified exact subscription anchors and signed
  IAPKit commerce events at `/iapkit/webhook`,
  journaled by `internal.ts` as digest-only `subscriptionEvents`. IAPKit project
  `m172jxxcqj5w0nyway3asjv1vn8g6pqj` / `hyo-dev/bookoo` is pinned server-side.
- Entitlement predicate/enforcement: `shared/entitlements.ts` and
  `convex/lib/entitlements.ts`; one indexed owner lookup, existing write gates.

## Security and transaction completion

Both IAPKit keys stay in Convex. No key is embedded in the mobile app/plugin.
After verification returns its store-owned environment and immutable binding
succeeds, the secret admin key reads `/v1/subscriptions/entitlements`. Its exact
Apple original transaction or Google token must match the caller, product, store
and finite live expiry. Match across all active purchases, even when another
record was updated more recently. Tokens/prices stay in the action; only the
verified provider record id and subscription state enter subscriptionPurchases.

Signed lifecycle events are digest-journaled once and schedule reconciliation;
they omit stable Google/provider purchase ids and cannot mutate an arbitrary
user-wide row. Tokenless `/v2/subscriptions/entitlements` refreshes only retained
verified ids. Foreign/unknown ids never bootstrap access or fabricate environment.
The response is capped at64KiB/128 active records, sanitized before scheduling,
and stored history is reconciled in32-row indexed pages with bounded retries.
The top-level userId scopes the response; an optional nested userId must match
when present. Required productIds and subscriptions must be complete and agree
for modeled products before an empty snapshot can revoke access.
Unchanged billing fields do not patch purchase rows or increment
projection revisions. A guarded no-op is successful reconciliation. A changed
page derives subscribers from at most four indexed live-purchase winner
probes. Production takes priority over review sandbox; otherwise the longest
valid expiry funds access. A frozen pre-migration bridge retains its former
confirmed expiry/grace until a matching store/product restore consumes it.

IAPKit entitlementsV2 applies isEntitledAt (Active/InGracePeriod only); paused
and billing-retry records are absent, even before their old expiry. Reconciliation
expires absent anchors, so those states cannot retain stale access. Do not infer
endpoint contents from the general subscription DTO enum. Store management is
available for known Apple/Play history independently of current entitlement.

A monotonic purchaseRevision and the latest scheduled-event identity guard
in-flight reads, including writes in the same millisecond. Verification also
captures the store/environment's revocation marker before binding/status read.
A later refund rejects that grant; first-binding active replay does not prevent
bootstrap. Source/administrative timestamps are not concurrency tokens. Valid
Unknown states and unmodeled v1 commerce types are acknowledged/journaled as
UNHANDLED_TYPE without granting or changing access. Purchase success requires
actual live server access.

Verify HMAC-SHA256 over `timestamp + '.' + rawBody`, require timestamp within
300 seconds in either direction, header event id equal to the signed body,
expected project/application/product and a live existing account. Cap bodies at
64 KiB. Journal event ids once and reconcile against current authoritative store state. Unknown or
deleted accounts never receive a new account or an entitlement. Deleted/purged
user tombstones also acknowledge late retries without recreating a billing
journal after the personal-data purge phase.

Environment policy is `IAPKIT_EXPECTED_ENVIRONMENT`; missing or misspelled values
disable billing and fail closed on grants/reconciliation. Exact existing Apple review
accounts in `IAPKIT_SANDBOX_APP_USER_IDS` retain the bounded finite-expiry
exception. Sandbox never overwrites a real production row. `provider: iapkit`
rows use IAPKit's effective store expiry; they do not inherit legacy fixed grace.
Cancellation preserves access to expiry; revoked/refunded/paused states grant
nothing. A terminal event from a different product/store does not revoke the
currently active subscription. Server status refresh remains user-scoped.
The existing rateLimits.ts owner limits authenticated verification to30/hour
(burst10) and public refresh to60/hour (burst20), before provider requests.
Trusted signed lifecycle jobs keep their separate bounded retry path.
Revision/event conflicts also restart from a fresh authoritative read; scheduled
page continuations restart the action when their marker has become stale.
The journal preserves signed occurredAt separately from snapshot updatedAt.
shared/application.json owns the native app identifier. Its pure TypeScript
adapter serves Metro/Convex; Expo config reads the same JSON because its config
loader cannot resolve a separately imported TypeScript module.

Native store connection failures retry on foreground, with at most one
connection attempt in flight for the current session.
Unfinished enumeration and settlement also retry on foreground while matching
caller/SKU intent remains. Enumeration failure does not suppress server refresh;
only one recovery enumeration runs at a time and identity/intent changes stop it.

Native request completion is event-based. Verify, bind and persist the exact
receipt anchor before `finishTransaction({isConsumable:false})`. Projection
revision conflicts retry that receipt at most three times using fresh caller
observations and provider reads; the pre-bind revocation marker stays fixed.
Unrelated active access never substitutes for recording this receipt.
Pending/failed verification stays
unfinished and can recover after launch/restore. Automatic launch recovery uses
unfinished StoreKit transactions or explicitly unacknowledged Play purchases,
only for a persisted caller/SKU checkout intent owned by the current account.
Completed/restorable history and unsolicited callbacks never auto-bind at login;
the full active purchase list belongs to the explicit Restore flow. The existing
MMKV inventory retains only caller/SKU intent, never a receipt or payment token.
A failed network call after a
store charge is PENDING. Account switching discards old callbacks/catalogs.
Restore binds only the same account; an existing foreign binding does not move
through the public verification path. Management uses native subscription UI.
The existing due account purge schedules IAPKit user-identifier erasure through
the secret-admin v2 endpoint after the recovery period. Failed submission retries
with bounded backoff; exhausted retries raise an operational failure. It never
cancels the Apple/Google subscription.

## Operations and migration

Convex variables: `IAPKIT_PUBLISHABLE_KEY`, `IAPKIT_SECRET_KEY`,
`IAPKIT_PROJECT_ID`, per-destination `IAPKIT_WEBHOOK_SECRET`, expected environment
and optional reviewer allowlist. IAPKit holds the approved Apple Server API key
and BooKoo Google service-account JSON. Apple ASN v2 and authenticated Google
RTDN target the IAPKit lifecycle URL; outbound signed destinations target the
existing dev/production Convex HTTP origins. App credentials and store product
ids remain unchanged. All former provider variables and app integrations are
removed; historical contracts/evidence stay archived.

Native dependency identity changed: rebuild locally and use a distinct Expo
runtime before release. No OTA can remove native modules from an installed
binary. New-source acceptance belongs to `docs/release/PURCHASE_E2E.md` and
`.notes/qa/2026-10-14-openiap-iapkit.md`; archived evidence is not a fresh PASS.

## Multi-purchase reconciliation (release review correction)

IAPKit public lifecycle events omit their storage-only subscription id; Google
events also omit a stable receipt token. They cannot safely mutate one arbitrary
user-wide subscription. Journal scoped signed events, then reconcile tokenless
v2 entitlements against receipt-verified provider ids in subscriptionPurchases.
This table owns individual purchase state; subscribers is its indexed projection
of the longest valid access, while preserving a pre-migration bridge until its
confirmed expiry or a matching store/product restore. Historical purchase rows
are paginated in bounded reconciliation/purge batches. No receipt token is stored.

First purchase/restore matches its receipt within backend-only v1 entitlements,
which includes all active subscriptions, rather than the most recently updated
single status record. Unknown signed states are journaled as UNHANDLED_TYPE
without changing access. Native Apple offer eligibility and terms use SDK6's
standard subscriptionOffers and actual subscriptionGroupIdIOS, with conditional
copy when eligibility is unavailable. Paywall exposure belongs to one screen
visit, independently of retrying its catalog read.
RootProvider includes the optional Layers provider. A configured app id enables
its route tracking and bounded paywall exposures; with no app id it is inactive.
The retired
RevenueCat conversion bridge has no replacement trial/subscribe event funnel;
absent events are unavailable metrics, not zero conversions. Existing approved
IAPKit/store aggregate reports remain the operational source when available.

Active subscriptions retain explicit Restore, including frozen legacy access,
so the verified receipt can bind before the old confirmed expiry. One canonical
restore row is shared by active/pending/inactive layouts. Native AlreadyOwned
prompts explicit Restore and clears new checkout intent; it never claims a
verified purchase, closes as success, or silently binds purchase history.

Native authentication owns checkout duration. The provider's confirmation
watchdog starts only after `requestPlan` returns, so a long Touch ID/password
flow cannot resolve as a false pending outcome or discard its later failure.
Callback-only native returns remain bounded, and delayed receipts still use
the same actor/SKU guard, verifier and native finish path.
