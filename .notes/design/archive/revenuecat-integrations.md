# Historical integration register (superseded 2026-10-14)

## 7. RevenueCat — PRODUCTION BACKEND CONNECTED; STORE KEYS PARTIAL

Status: project `6364d791` has App Store app `app268c953952` and Play Store app
`appcb9315409f`, both for `dev.hyo.bookoo`. The official RevenueCat MCP is configured in
Codex with project-configuration read/write scope and was validated against server 0.1.0.
The V2 credential stays in the local Codex configuration and never enters this repository.
The new Google Play Console app record exists for `dev.hyo.bookoo`. App Store prices and
the annual introductory trial are scheduled on the new Pro subscriptions. RevenueCat's
App Store Connect API and separate In-App Purchase credentials validate. The
dedicated Play service-account JSON is configured; catalog checks pass, while
the subscription purchase-permission check remains unresolved (September 6).

Product decisions: `docs/product/MONETIZATION.md`.
Enforcement contract: `.notes/design/revenuecat-entitlements.md`.

### 7.1 Project and apps

| Item | Value |
|---|---|
| Project name | `BooKoo` |
| iOS app | `app268c953952`; App Store bundle id `dev.hyo.bookoo` |
| Android app | `appcb9315409f`; Play Store package `dev.hyo.bookoo` |

The iOS app has valid App Store Connect API and separate **In-App Purchase Key**
credentials. The latter was generated with explicit account-wide scope approval
and uploaded only to this app. The Android app's least-privilege Play principal
and service-account JSON are configured; purchase validation is a separate open
gate. Private credentials stay in RevenueCat and protected, ignored local
storage; never commit their contents.

### 7.2 Entitlement, offering, packages

| Layer | Identifier / RevenueCat id |
|---|---|
| Shipping entitlement | `bookoo_pro` / `entlb43d071db2` |
| Current offering | `pro` / `ofrngf3d0c03de8` |
| Monthly package | `$rc_monthly` / `pkge40a7dce985` |
| Annual package | `$rc_annual` / `pkge6c3eafc828` |

`shared/entitlements.ts` and the webhook key on the literal string `bookoo_pro`.
The public tier is called **Pro**; the internal entitlement keeps this pre-existing
identifier because RevenueCat reports an archived collision for the shorter `pro`
identifier. The old `together` entitlement remains historical. Its former `default`
offering (`ofrngffa46c3e8a`) is archived, preserved, and never repurposed; `pro` is the
only current shipping offering.

### 7.3 Store products

Prices follow the approved launch hypothesis in `docs/product/MONETIZATION.md` §2. The
App Store schedules and annual trial are applied. Play accepted the first Android App
Bundle and now has subscription `pro` / `BooKoo Pro` with complete Korean, English,
Japanese, Simplified Chinese, and Indonesian benefits and descriptions. Its monthly and
annual base plans are not yet saved or activated.

**RevenueCat shipping catalog:**

| Store | Monthly | Annual |
|---|---|---|
| App Store | `dev.hyo.bookoo.pro.monthly` / `prod396fa723b3` | `dev.hyo.bookoo.pro.annual` / `prod49e76f2097` |
| Google Play | `pro:monthly` / `prodb0c9f61c39` | `pro:annual` / `prod9d275cee12` |
| Test Store | `monthly` / `prod9466dc1bd0` | `yearly` / `prod5f77cda04b` |

All six products unlock `bookoo_pro` and are attached to the matching package in
the current `pro` offering. The old Test Store `lifetime` product remains attached
to the entitlement for historical development accounts, but is absent from the
shipping offering.

**App Store Connect target** — one new auto-renewable subscription group:

| Item | Value |
|---|---|
| Group reference name | `bookoo_pro` |
| Monthly product id | `dev.hyo.bookoo.pro.monthly` |
| Annual product id | `dev.hyo.bookoo.pro.annual` |
| Monthly price hypothesis (US) | $3.99 |
| Annual price hypothesis (US) | $29.99 |
| Introductory offer | Annual only: 7-day free trial, new subscribers |

The matching App Store Connect Pro group is `22342458`; monthly subscription `6806335288`
and annual subscription `6806339761` are both `READY_TO_SUBMIT`. The older Together
records — group `22340089`, monthly `6805997499`, and annual `6805997603` — remain
reference-only prelaunch configuration and are not reused by the Pro shipping catalog.

**Play Console target** — one subscription with two base plans:

| Item | Value |
|---|---|
| Subscription id | `pro` |
| Base plan | `monthly`, auto-renewing, $3.99 hypothesis |
| Base plan | `annual`, auto-renewing, $29.99 hypothesis |
| Offer | On `annual`: 7-day free trial, new customers |

The new Google Play app record for package `dev.hyo.bookoo` exists and version 14 is Active
on the internal track. Subscription `pro` exists with all five shipped localizations. The
`monthly` base-plan form has been retried after internal publication with monthly
auto-renewal, the standard 7-day grace/automatic hold settings, valid regional availability,
and localized pricing, but Play still returns a generic save error before creating the plan.
The current signed-in administrator can manage Play users and store presence, while the
Payments profile page reports `You need permission`; an account-owner payments session is
required before treating this as an app-form defect. App Store configuration is complete;
both stores still require signed-device purchase/restore verification.

### 7.3.1 Native Paywall compatibility (2026-09-05)

The current offering is attached to native Paywall `pw01e8f13550124c74`. Published revision 8 at
`2026-09-04T22:18:44.976Z` is the shipping configuration: Annual is selected by default, both live
App Store prices render, the layout has no media component, and the single mint action is followed
by renewal disclosure, Restore Purchases, Terms and Privacy. Terms and Privacy each contain the
explicit nested `in_app_browser` URL payload required by the embedded native decoder.

The client is pinned exactly to `react-native-purchases` and `react-native-purchases-ui` 10.4.2,
which embed RevenueCat iOS 5.80.2 and Android 10.12.0. Revision 8 rendered correctly on iPhone 17
Pro Max and iPad A16 in light and dark. The newer 10.9.0/iOS 5.87.1 experiment selected the
workflow-backed rendering path without an offering workflow and fell back to a generic paywall, so
it is not the release baseline. Any future RevenueCat SDK change requires new local native builds
and the same device matrix before the exact pin changes.

### 7.3.2 Paywall localization (2026-09-24)

Until 2026-09-24 the paywall had only `en_US`, so every other device saw English, including Korean devices,
the primary market. Revision 30, published that day, adds ten locales:

- `ko`, `ja`, `id`, `it`: the editor stores these four as language-only identifiers.
- `zh_Hans`, `de_DE`, `es_ES`, `fr_FR`, `nl_NL`, `pt_BR`.

**Wording.** It reuses the app's own translations in `assets/langs/*.json` (구매 복원, 이용약관, 가계부당 최대
5명, Kassenbuch, livret, and so on). Portuguese is Brazilian (`pt_BR`) for reach, although the app's `pt.json`
is mostly European Portuguese.

**Legal links.** Terms and Privacy carry `?lang=` for ko, ja, zh and id, the only languages the public legal
pages have. `en_US` and the European locales link with `?lang=en`.

**Layout.** It is unchanged: the draft's components were compared line by line with revision 28, and only the
letter case of hex colours differs. On a Korean Galaxy Z Flip5 running the Play-installed 1.0.4, the paywall
now renders in Korean with live KRW prices (매년 ₩40,000 결제 · 매월 ₩5,500).

Any new paywall string needs all eleven locales. The Paywall AI editor builds its draft from the
**published** revision, so it silently drops unpublished draft edits: re-read the draft before publishing.

A sideloaded Android debug build returns product-not-found because Google Play did not distribute
it. Android purchase evidence remains blocked until the `monthly` and `annual` base plans are
activated, the least-privilege Play service-account JSON is added to RevenueCat, and purchase plus
restore pass from the exact Play-installed release AAB.

### 7.4 Placements

One per moment a paywall may appear. These strings are produced by
`shared/entitlements.ts#placementFor` and must match exactly.

`member_limit` · `second_ledger`

No RevenueCat targeting rule exists yet. The current MCP exposes targeting-rule reads but
not creation, while RevenueCat defines placements through a targeting rule. The client
deliberately falls back to the current `pro` offering, so both launch placements get
the monthly/annual packages until a dashboard targeting rule is added. Additional
placements must not be added until the corresponding feature has a server-enforced
boundary and matching store copy.

### 7.5 Webhook

| Item | Value |
|---|---|
| URL (development) | `https://amiable-cormorant-231.convex.site/revenuecat/webhook` |
| URL (production) | `https://<production>.convex.site/revenuecat/webhook` |
| Method | `POST` |
| RevenueCat integration id | development `whintgra450b7c4f4`; production `whintgrb1ea50d234` |
| Environment | `sandbox`; all apps |
| Authorization header | generated per-deployment secret, stored only in Convex and RevenueCat |

The handler **fails closed**: with `REVENUECAT_WEBHOOK_AUTH_HEADER` unset it
returns 401 to everything, so the secret must be set on the deployment before
the webhook is pointed at it.

Set on each Convex deployment with `bunx convex env set`:

| Variable | Development | Production |
|---|---|---|
| `REVENUECAT_SECRET_API_KEY` | the v1 secret key | the v1 secret key |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | a distinct secret | a distinct secret |
| `REVENUECAT_EXPECTED_ENVIRONMENT` | `SANDBOX` | `PRODUCTION` |

Use a **different** webhook secret per deployment. Sharing one means a leak from
development grants write access to production's entitlement table.

`REVENUECAT_EXPECTED_ENVIRONMENT` is the guard that stops a sandbox QA purchase
granting a real production entitlement; a mismatched event is journalled as
`IGNORED_ENVIRONMENT` and acknowledged with 200.

The development deployment was synchronized after the secret was set. Live probes verified
that both a missing Authorization header and a wrong header return 401. A real purchase
delivery is still untested and must not be marked complete in `docs/release/PURCHASE_E2E.md`.

### 7.6 Public SDK keys

The two `EXPO_PUBLIC_REVENUECAT_*` keys are app-specific **public** keys. They
are inlined into the JS bundle by design. Set them in `.env.local` for local
work and as EAS environment variables for builds. The secret API key is never
one of these.

The app-specific iOS and Android public keys are installed in ignored `.env.local` and in
all three EAS environments. EAS production uses its production Convex origins and complete
public provider configuration; no development backend value is inherited.

### 7.7 Judge access

Shipaton requires judges to reach every premium feature. Two mechanisms, and the
choice is made when the products exist:

1. The annual package's 7-day free trial, which every judge can start; or
2. A RevenueCat **promotional entitlement** granted to a dedicated judge account.

The judge account must contain only synthetic data. Never grant a promotional
entitlement to an account holding migrated production records.
