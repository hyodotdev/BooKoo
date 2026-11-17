# OpenIAP + IAPKit purchase acceptance

Current native adapter: `expo-iap` (OpenIAP). Verification, immutable account
binding and lifecycle ingestion: IAPKit `hyo-dev/bookoo`. Shared ledger access:
Convex `subscribers` and `convex/lib/entitlements.ts`. The former provider matrix
and dated device evidence are archived in the operations repository; that
evidence does not certify the new native adapter.

Use one focused batch with the shared E2E execution protocol. Preserve app data
and use only existing virtual devices. A compiled replacement native binary is
required; this dependency change cannot ship through an OTA alone.

| Gate | Required observation |
| --- | --- |
| Native wiring | Fresh iOS/Android build launches with ExpoIap, no removed provider modules |
| Catalog | Monthly/annual native prices, eligible Play offer token, no hardcoded converted price |
| Purchase | Store cancellation and deferred payment; verified proof before finish/acknowledge |
| Restore | Existing store purchase reconnects to the same Convex account; foreign binding does not move |
| Confirmation | Charged transaction stays pending on network failure; reactive server entitlement settles it |
| Management | Native App Store/Play subscription management opens; cancelling retains access until expiry |
| Server authorization | Forged signature, product/application/project mismatch and unknown/deleted user rejected |
| Lifecycle | Signed purchase/renewal/cancel/grace/expiry/refund; replay and stale event guards |
| Environment | Production receipts never overwritten by sandbox; only exact enrolled Apple review users allowed |
| Session isolation | A→B switches discard old callbacks/catalog; anonymous identity never purchases |
| Ledger entitlement | Owner funds shared access; member and second-ledger guards stay server-owned |
| Advertising | Consent and Pro suppression retained; no removed-provider ad revenue callbacks |
| Privacy | Five canonical legal translations disclose IAPKit; keys remain backend-only |
| Store ingress | Apple production+sandbox ASN v2 and authenticated Google RTDN reach IAPKit |

Actual native store transactions require a compatible store-installed candidate
and confirmed tester account. Simulator catalog unavailability is a prerequisite
limitation, never a purchase/restore PASS. Record fresh evidence and all pending
prerequisites in `.notes/qa/2026-10-14-openiap-iapkit.md`.
