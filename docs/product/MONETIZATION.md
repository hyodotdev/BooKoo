# BooKoo monetization — Free and Pro

Status: **decided as the launch model.** BooKoo launches with two public tiers:
Free and Pro. A 100+ member Community tier is deliberately deferred until real
demand exists.

## 1. The one idea

**Free keeps a complete ledger; Pro removes ads and opens it to the group.**

BooKoo is a private, manual income-and-expense ledger. The paid unit is the
shared ledger, not a seat: one owner subscribes and every invited member of that
ledger receives the Pro experience, including ad removal. An invited partner is
never asked to subscribe just to join.

Native purchases use OpenIAP through `expo-iap`; IAPKit verifies store evidence
and emits signed lifecycle events. Convex remains the authority for shared
ledger access. The competition is closed following the owner's October 14
rejection report; monetization no longer depends on its sponsor.

## 2. Tiers

### Free — complete core ledger with restrained ads

- One ledger owned by the Free user
- Unlimited income and expense entries
- Categories, calendar, monthly totals, and basic statistics
- Photos, comments, statistics, and personal export
- Full access to your own data: read, export, delete, and account deletion
- Join any number of Pro-funded ledgers at no cost
- One contextual, non-personalized banner below the four main tabs

Free is not a trial or a crippled demo. Ads never interrupt entry creation and
never appear beside a memo, amount, photo, member, invitation, export, delete,
authentication, or privacy action.

### Pro — ad-free shared ledger

- No ads for the subscriber or invited members of the subscriber's ledger
- Create additional ledgers for separate groups, trips, or goals
- Up to 5 members in each new ledger

Price hypothesis:

| Package | Price (US) | Notes                                    |
| ------- | ---------- | ---------------------------------------- |
| Monthly | $3.99      | No trial                                 |
| Annual  | $29.99     | 7-day free trial · 37% below 12× monthly |

Annual is recommended and shown first with its monthly equivalent, while the
monthly option remains visible and equally actionable. Store-localized prices
come directly from Apple/Google through OpenIAP; no screen hardcodes a converted price.

### Community — deferred

A future tier may serve ledgers above 100 members with higher collaboration,
storage, moderation, and export limits. It is not designed, priced, promised in
store metadata, or implemented for launch. Revisit only after Pro ships and
real customers demonstrate the need.

## 3. Free/Pro boundary

The boundary is about collaboration scale and convenience, never access to
records the user can already see.

| Never gated                           | Pro capability                              |
| ------------------------------------- | ------------------------------------------- |
| Creating the first ledger             | Creating additional ledgers                 |
| Recording income and expenses         | —                                           |
| Reading existing entries              | —                                           |
| Export and deletion                   | —                                           |
| Accepting an invitation               | Raising a ledger past the free member limit |
| Participating in a Pro-funded ledger  | —                                           |
| Calendar, totals, and statistics      | —                                           |
| Photos and comments                   | —                                           |
| Manual entry                          | —                                           |

### Grandfathered 2017 users

A ledger is grandfathered only when migration writes `ledgers.legacyKey`.
Existing entries, photos, comments, members, history, exports, and ordinary
writes remain accessible. Grandfathering bypasses the member-count limit but
does not grant new Pro capabilities or remove Free-tier advertising on a
personal Free ledger.

The invariant is: **a lapse or missing subscription may remove a capability,
but never access to existing data.**

## 4. Advertising contract

- Provider: Unity LevelPlay with Unity Ads in dedicated `dev.hyo.bookoo` app
  records. Never reuse Martie or the removed 2017 app's identifiers.
- Format: anchored adaptive banner.
- Launch placement: `tab_shell_banner` only, directly below the four main tabs
  and above the device bottom Safe Area.
- Targeting: non-personalized requests only; no ATT prompt and no cross-app
  tracking by BooKoo.
- Consent: Google UMP completes before LevelPlay initializes. The SDK consumes
  UMP's actual stored TCF/Additional Consent signals; `canRequestAds` is not
  converted into affirmative GDPR consent. When a regional privacy-options
  form is required, Settings > Privacy exposes it and hides the creative while
  the user's choices can change. Google Mobile Ads remains a consent bridge
  only; no Google advertising initialization or requests are made.
- Audience: retain Play's existing 13–15, 16–17 and 18+ targets. Do not copy
  another app's child-directed classification. Unity's nonbehavioral adapter
  flag and device-ID opt-out preserve contextual-only delivery.
- Paid suppression: hide while entitlement state is loading; hide when the
  viewer has Pro; hide when the active ledger is funded by a Pro owner.
- Failure mode: consent, SDK, query, or network failure renders no ad and never
  prevents ledger use.
- Measurement: LevelPlay owns ad reporting. No third-party ad-event or revenue
  tracker is attached. The optional, automatically initialized Ad Quality SDK
  is excluded from both native dependency graphs. Android advertising-ID and
  Privacy Sandbox permissions are blocked. IAPKit owns store-verified
  subscription reporting.

Financial content, photo content, ledger titles, amounts, memos, user
identity, and membership data are never passed as ad targeting or event
metadata.

## 5. When Pro ends

| State                   | Read/export/add entries | Pro capabilities | Extra members       | Ads                    |
| ----------------------- | ----------------------- | ---------------- | ------------------- | ---------------------- |
| Pro active              | yes                     | yes              | yes                 | hidden                 |
| Cancelled before expiry | yes                     | yes              | yes                 | hidden                 |
| Verified store grace    | yes                     | until store expiry | yes               | hidden                 |
| Billing retry / paused  | yes                     | no               | frozen, not removed | Free placement resumes |
| Expired                 | yes                     | no               | frozen, not removed | Free placement resumes |

Expiry never deletes photos or removes members. Above-limit members continue
working; only another addition is refused until the ledger is under the limit
or Pro resumes.

## 6. Paywall placement

Never show a paywall on first launch, sign-in, invitation acceptance, existing
data, personal export, deletion, or the first entry.

| Paywall placement | Trigger                                     |
| -------------------- | ------------------------------------------- |
| `member_limit`       | Owner invites past the free member limit    |
| `second_ledger`      | Creating a second shared ledger             |
A non-owner sees “ask the owner to start Pro,” never a purchase button for a
ledger they do not own.

## 7. Experimentation and ethics

Run one product experiment variable at a time after a baseline exists. Do not
invent conversion, revenue, or retention. No per-seat pricing, countdown timers,
fake scarcity, review gating, financial-data sale, or engagement shame. The
annual trial is disclosed with its exact end date and renewal terms.

## 8. External launch items

1. Apple/Google products keep the identifiers in `shared/entitlements.ts`.
   IAPKit project `hyo-dev/bookoo` owns verification credentials, lifecycle
   ingress and signed delivery to Convex. The contract is
   `.notes/design/iapkit-entitlements.md`. Verify a fresh native build and store
   purchase/restore before releasing this native dependency transition.
2. Apply the final localized price schedule and annual trial only after the
   commercial action is approved.
3. Configure dedicated LevelPlay iOS and Android app/banner records for
   `dev.hyo.bookoo`, with Unity Ads delivery and enrolled QA test devices.
   Production builds fail closed until the platform-specific app keys and
   banner IDs are set. Retain Google app IDs only for UMP consent.
4. Complete Apple App Privacy, Google Data safety, consent messages, and review
   notes from the exact shipping SDK behavior.
