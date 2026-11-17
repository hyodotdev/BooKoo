# BooKoo — privacy, legal surface, exports, and private media

Status: **normative D4 release contract** (2026-08-24). This document resolves G37 and G38 and
supersedes every earlier statement that a receipt image may be rendered from a bearer storage URL.
`SCHEMA.md` remains authoritative for table and field shape; D4 updates it to match this contract.

This is an engineering and release specification, not a substitute for advice from Korean counsel.
The app, policy, console answers, processor contracts, and this matrix must receive one final legal review
before public submission. That review may tighten retention or wording; it may not silently broaden data
collection.

## 1. Product privacy baseline

1. BooKoo is a private shared-ledger service with one restrained, non-personalized Free-tier banner.
   It has no financial-data sale, personalized ad targeting, contacts access, background location, bank
   connection, payment processing, general product-analytics SDK, session replay, or separate general-
   purpose crash-reporting SDK. Pro-funded ledgers are ad-free. A deterministic 25% of release installations
   sends anonymous app-performance, limited device context and scrubbed native-crash diagnostics to EAS
   Observe; it is not joined to an account or ledger and carries no product event stream.
2. Core account, shared-ledger, item, comment, receipt-photo, invite, security, and support processing is
   necessary to perform the service contract. Under PIPA this uses Article 15(1)(4), not a fake bundled
   “required consent.” The privacy notice lists those fields and that legal basis separately from any
   consent-based processing, as Article 22(3) requires.
3. A consent is requested only for a genuinely optional purpose. It has its own unticked control, purpose,
   fields, retention, withdrawal path, policy version, and `legalEvents` grant/withdraw record. Refusal
   cannot block core service.
4. The sign-in landing always exposes Terms and Privacy links. Before the first account is finalized, the
   user affirmatively accepts the Terms, acknowledges the current Privacy Notice, and attests that they
   are at least 14. These are three separately labelled rows; “continue” alone is not evidence.
5. BooKoo does not serve children under 14 and does not collect a date of birth to prove age. An under-14
   response stops account creation and points to support; guardian-consent machinery is not approximated.
   Store age-rating answers describe app content and communication truthfully and are not treated as this
   contractual eligibility gate.
6. Provider sign-in requests the minimum provider payload: stable provider subject, verified email when
   the provider actually vouches for it, and optional display name/avatar. BooKoo requests or stores no
   gender, birthday, birth year, phone number, friends, or marketing scope for a new account. A declined
   email/profile scope yields an account without that field and never blocks Kakao/Naver sign-in.
7. Legacy phone numbers remain historical migration data. A user may optionally attach one place to an
   entry by searching, tapping a map, or asking the OS for the current position. The app stores only the
   `SCHEMA.md` inline `place` fields and never performs background location collection, continuous tracking,
   geofencing, or marketing use. Current-position access is user initiated, revocable in OS settings, and
   refusal leaves manual entry, map search, and the rest of the ledger usable.
8. No memo, amount, receipt, place, email, phone, profile, provider token, invite code, storage id/URL, or
   export content may enter logs, ad requests/events, analytics, crash reports, push payloads,
   **plaintext** MMKV, or support tickets. There is no sensitive-MMKV exception: server query results,
   mutation arguments, recent financial/category activity, receipt bytes, local photo URIs, tokens,
   invite codes, and export content are never persisted in MMKV. Auth, app-lock and pending-invite secrets
   use their separately scoped SecureStore records.

## 2. Legal surfaces and version evidence

The canonical public URLs are stable and non-PDF:

| Surface                   | URL                                       | In-app entry points                                     |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Privacy policy            | `https://bookoo.hyo.dev/legal/privacy`    | sign-in, onboarding, Settings > About, account deletion |
| Terms of service          | `https://bookoo.hyo.dev/legal/terms`      | sign-in, onboarding, Settings > About                   |
| Privacy choices / rights  | `https://bookoo.hyo.dev/privacy-choices`  | Settings > Privacy, Apple privacy-choices field         |
| External account deletion | `https://bookoo.hyo.dev/account-deletion` | Settings > Account, Google Play deletion URL            |
| Support                   | `https://bookoo.hyo.dev/support`          | sign-in help, Settings > Help, store support URL        |

Each route supports `?lang=ko|en|ja|zh|id`, defaults from `Accept-Language`, and always offers a visible
language switch. The Korean version is the controlling PIPA notice; all five versions show effective
date, previous versions, operator/privacy contact, purposes, fields, legal bases, retention/destruction,
processors, overseas transfers, user rights, refusal effects, security measures, and change notice.
Production submission is blocked until every URL is public, HTTPS, non-geofenced, crawlable without an
account, and its rendered copy hash equals the reviewed copy in the release repository.

`legalEvents` is append-only evidence, not an authorization oracle. Runtime authorization still follows
the current account/ledger/permission state.

```ts
export const legalEventKindValidator = v.union(
  v.literal('TERMS_ACCEPTED'),
  v.literal('PRIVACY_NOTICE_ACKNOWLEDGED'),
  v.literal('AGE_14_PLUS_ATTESTED'),
  v.literal('OPTIONAL_LOCATION_GRANTED'),
  v.literal('OPTIONAL_LOCATION_WITHDRAWN'),
  v.literal('OPTIONAL_MARKETING_GRANTED'),
  v.literal('OPTIONAL_MARKETING_WITHDRAWN'),
);

export const legalEventsTable = defineTable({
  userId: v.id('users'),
  kind: legalEventKindValidator,
  documentVersion: v.string(),
  documentSha256: v.string(),
  locale: localeValidator,
  createdAt: v.number(),
})
  .index('by_userId_kind_createdAt', ['userId', 'kind', 'createdAt'])
  .index('by_createdAt', ['createdAt']);
```

No IP address, user agent, or device fingerprint is stored as “consent evidence.” Terms/notice/age events
are written in the same account-finalization mutation after the three current version/hash values are
validated. Optional marketing does not ship in v1. Location events exist only as the declared seam; the
feature flag, native permission, policy, label, and withdrawal implementation must land in one future
release before the grant kind can be written.

## 3. Retention and deletion

“Forever” is not a retention period. Unless a preservation hold or a stated law applies, the following is
the maximum. A user-facing policy uses the same table in plain language.

| Data                                                                            | Live retention                                             | Deletion/destruction                                                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Active profile, verified email, provider linkage                                | account lifetime                                           | account purge after the 30-day recovery window; provider credentials/tokens revoked at request time                                         |
| Shared ledger/items/categories/memberships                                      | ledger lifetime                                            | item soft-delete 30 days; ledger soft-delete 30 days; then bounded hard purge                                                               |
| Receipt photos                                                                  | item/ledger lifetime                                       | detach/item/ledger purge deletes both blobs; account purge deletes every photo uploaded by that account                                     |
| Comments authored by a deleting account                                         | account recovery window                                    | hard-delete at account purge; comment counters repair in the same job                                                                       |
| Shared financial rows authored by a deleting account                            | ledger lifetime                                            | retained for co-members' ledger integrity, but profile/email/handle/avatar and uploader attribution are removed; rendered as “deleted user” |
| Push tokens                                                                     | active session/device only                                 | hard-delete on sign-out, invalid-token receipt, or deletion request                                                                         |
| Offline update receipts                                                         | 30 days from committed update                              | bounded expiry purge; account/ledger purge also deletes any remainder                                                                       |
| Notifications                                                                   | 180 days maximum                                           | daily bounded purge; no sensitive rendered content in payload/row                                                                           |
| Governance audit                                                                | ledger lifetime plus ledger's 30-day recovery              | hard-delete with ledger; actor/target profiles render as tombstones after account purge                                                     |
| Auth/security audit and legal events                                            | 180 days; the newest consent per kind for the account lifetime | daily bounded purge (`retention-purge.md`); keep longer only under a documented preservation hold |
| Feedback/support                                                                | resolution + 1 year                                        | bounded daily/monthly purge; attachments are not accepted in v1                                                                             |
| Personal/ledger export jobs and blobs                                           | 7 days from readiness, or first explicit delete            | delete all parts and job details; the user may delete sooner                                                                                |
| Unclaimed legacy identity data                                                  | migration/claim policy in the measured-data reconciliation | never “permanent by default”; G50's launch support and retention decision must land before migration                                        |
| `legacyRaw`, migration anomalies with raw payloads, local exports/intermediates | cutover sign-off + 90 days                                 | restricted migration purge; unresolved anomalies retain only the smallest required record until resolved                                    |

Account deletion is corrected from the earlier auth draft: shared transaction facts may remain
de-identified because removing them changes other members' balances, but account-uploaded receipt bytes and
comments do not survive purge by default. A confirmation explains this split before request. During the
30-day recovery window nothing irreversible happens to shared content. At purge, profile PII including
`bio`, `phone`, email mirrors, avatar/legacy sources, deletion reason, `legacyUid`, and provider payloads is
cleared; credentials, emails, sessions, tokens, owned avatar blobs, authored comment rows, and owned receipt
blobs are deleted in cursor-bounded stages. No “keep it with the ledger” ownership transfer happens merely
because a user deleted their account.

## 4. Personal export and ledger export are different products

The old register overstated Korean law. PIPA Article 35 gives a general access right. Article 35-2's
machine-readable transmission right applies only to processors within the statutory/decree scope; as of
2026-08-24, the decree's general private-sector threshold is far above BooKoo and that clause is scheduled
for 2027-02-20. BooKoo nonetheless ships a portable self-service package as a product commitment and for
other applicable regimes (including GDPR Article 20). There is no invented universal “30-day PIPA export
clock.” Automated requests target readiness within 24 hours; any formal rights request is acknowledged and
handled within the shorter applicable legal deadline.

### 4.1 Personal package — Settings > Privacy > Export my data

Any active account may request it. It contains only data about the requester:

- profile/preferences, own verified email rows, provider names and subjects without tokens/secrets;
- legal events, account/security history safe for the subject, memberships and roles;
- entries/comments/photos the requester authored or uploaded, with the minimum ledger id/title/currency
  context needed to understand them;
- notifications addressed to the requester, feedback/support they submitted, and a schema/readme manifest.

It excludes other members' emails/phones/provider ids, invite secrets, other members' comments/entries,
server secrets, moderation reporter identity, internal security signals, and derived service-only
inferences. Shared rows are redacted field-by-field, not copied wholesale and cleaned afterward.

### 4.2 Ledger package — Ledger Settings > Export ledger

This ships in v1 and requires current `ADMIN` or `OWNER` authority plus an explicit warning that the archive
contains every member's shared financial data. It contains ledger metadata, membership display tombstones,
categories, entries, comments, and receipt photos. It never contains private profile email/phone, provider
ids, push tokens, invite code/hash, account/security audit, or other ledgers. The request writes
`EXPORT_REQUESTED`; completion/failure does not create per-item audit rows.

### 4.3 Asynchronous, bounded, expiring delivery

`dataExports` and `dataExportFiles` are permanent v1 schema, while their rows are short-lived:

```ts
export const dataExportKindValidator = v.union(
  v.literal('PERSONAL'),
  v.literal('LEDGER'),
);
export const dataExportStateValidator = v.union(
  v.literal('QUEUED'),
  v.literal('RUNNING'),
  v.literal('READY'),
  v.literal('FAILED'),
  v.literal('EXPIRED'),
);

export const dataExportsTable = defineTable({
  requesterUserId: v.id('users'),
  ledgerId: v.optional(v.id('ledgers')),
  kind: dataExportKindValidator,
  state: dataExportStateValidator,
  phase: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  requestedAt: v.number(),
  readyAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()), // set on READY/FAILED to terminal time + 7 days
  failedCode: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_requesterUserId_requestedAt', ['requesterUserId', 'requestedAt'])
  .index('by_requesterUserId_kind_ledgerId_state', [
    'requesterUserId',
    'kind',
    'ledgerId',
    'state',
  ])
  .index('by_state_expiresAt', ['state', 'expiresAt'])
  .index('by_ledgerId_requestedAt', ['ledgerId', 'requestedAt']);

export const dataExportFilesTable = defineTable({
  exportId: v.id('dataExports'),
  requesterUserId: v.id('users'),
  order: v.number(),
  fileName: v.string(),
  mediaType: v.string(),
  storageId: v.id('_storage'),
  byteSize: v.number(),
  sha256: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index('by_exportId_order', ['exportId', 'order'])
  .index('by_expiresAt', ['expiresAt']);
```

- `exports.requestPersonal` and `exports.requestLedger` are mutations that authenticate, rate-limit to
  three requests/account/day, reject a second active request of the same kind/scope, insert the export/job,
  and schedule `USER_EXPORT` or `LEDGER_EXPORT`. Each maintenance `jobKey` is
  `<USER_EXPORT|LEDGER_EXPORT>:<dataExportId>` and is never parsed; it prevents successive exports from
  sharing a cursor and gives expiry/account purge an exact point lookup.
- Jobs use indexed, cursor-bounded batches and write canonical UTF-8 JSON plus RFC-4180 CSV. Receipt bytes
  are partitioned into deterministic ZIP volumes. Every file is at most `EXPORT_FILE_MAX_BYTES = 18 MiB`,
  below Convex HTTP actions' 20 MiB response limit. A manifest lists part names, sizes, SHA-256, omissions,
  and schema version. An individual source photo above the cap fails with a named support-safe code rather
  than being silently omitted.
- The terminal transition sets `readyAt` when applicable and sets `expiresAt` to terminal time plus
  `DATA_EXPORT_RETENTION_MS` in the same mutation; queued/running jobs have no fictitious expiry clock.
- Ready/failed notification rows contain only export id/state, never a file URL or content. The settings
  screen paginates the requester's small export history and shows expiry.
- `GET /exports/file/<dataExportFiles id>` takes `Authorization: Bearer <Convex Auth JWT>`, resolves the
  caller with `ctx.auth`, verifies requester ownership, `READY`, and `expiresAt > now`, then returns
  `ctx.storage.get(storageId)` with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
  and an attachment filename. The client never receives `storageId` or `ctx.storage.getUrl()`.
- The existing daily `purgeSoftDeleted` maintenance handler also advances export expiry: it deletes blobs
  first, then part rows and the corresponding maintenance job, marks the export `EXPIRED` as a crash-safe
  checkpoint, and hard-deletes the parent row in the final stage. `EXPIRED` is not retained as account
  history. Account deletion schedules the same destruction immediately. No additional cron registration is
  introduced. A downloaded copy is outside BooKoo's control and the UI says so.

## 5. Receipt-photo access — authenticated on every network request

Convex documents that `storage.getUrl()` returns a reusable bearer URL accessible without further app
authentication. BooKoo therefore stores no rendered receipt URL on `ledgerItems` or `itemPhotos`, returns
no storage id or legacy URL to clients, and never redirects to a storage URL.

1. `ledgerItems.coverPhotoId?: Id<'itemPhotos'>` replaces `coverThumbUrl`.
2. `itemPhotos` retains `storageId`/`thumbStorageId` as server-only fields. `url` and `thumbUrl` are
   removed. `legacyUrl` is migration-only, never projected, and cleared once the protected copy verifies.
3. `photos.listByItem` / `listByLedger` returns `photoId`, dimensions, blurhash, order, timestamps, and
   permission-safe metadata only. The client builds
   `${EXPO_PUBLIC_CONVEX_SITE_URL}/media/photo/<photoId>/<thumb|original>`.
4. `convex/http.ts` mounts a prefix route. The HTTP action requires a Bearer token, calls an internal query
   that resolves photo -> live item -> live ledger -> current active membership, and only then loads the
   chosen storage id and returns `ctx.storage.get`. Missing, deleted, unauthorized, and non-member all use
   the same 404 response; storage ids never enter the URL.
5. Response headers are `Cache-Control: private, no-store` for originals and
   `private, max-age=300, must-revalidate` for thumbnails, plus `Vary: Authorization`, `nosniff`, the stored
   image media type, and no CORS wildcard. HTTP range is not promised in v1; each resized original is below
   the 20 MiB HTTP action limit, enforced at `files.claimUpload`.
6. The installed `@convex-dev/auth/react#useAuthToken()` supplies the JWT and Expo Image 57's object source
   supports `headers`. `PrivateImage` is the only receipt renderer and passes the Authorization header.
   It never logs its source. Save-to-library uses an authenticated `fetch` into an extension-bearing cache
   file, then the D3 write-only Media Library flow.
7. `PrivateImage` sets Expo Image `cachePolicy="memory"` for both variants; receipt bytes never enter its
   disk cache. Sign-out, account switch, and reactive ledger-membership disappearance still call
   `Image.clearMemoryCache()` and `Image.clearDiskCache()` defensively after purging ledger MMKV keys.
   Network access is revoked immediately even if a device retains bytes it explicitly downloaded or
   screenshotted.
8. Push payloads, exports list rows, MMKV, crash/log context, and navigation params contain no media bearer
   URL. Export jobs read storage internally; protected download is the only delivery path.
9. The 724 measured legacy photos must all reach `DONE` before public cutover. There is no launch-time
   `legacyUrl` render fallback. `PENDING + FAILED + MISSING` requires an explicit per-row support decision,
   and the release gate is zero silently missing blobs.

This adds one authenticated HTTP hop per image and function bandwidth. That cost is accepted for a financial
app; the 320px thumbnail, five-minute private HTTP revalidation, session-memory image cache, bounded list
pages, and no `getUrl()` queries keep it bounded.

## 6. Store privacy declaration — launch baseline

These are console-ready answers for the current code/design. Any SDK or feature change reruns this matrix.

### Apple App Privacy

Core service data is linked to the user and used for App Functionality (plus Product Personalization for
locale/appearance/preferences). The Google Mobile Ads SDK additionally requires a conservative disclosure
for its own automatic processing. The final App Store checkboxes must be reconciled against the archived
Xcode privacy report and current Google disclosure immediately before submission:

- Contact Info: Name, Email Address, Phone Number (legacy-only until retention purge);
- Financial Info: Other Financial Info;
- Location: Precise Location (optional entry-place attachment; user initiated, not tracking);
- User Content: Photos or Videos, Other User Content, Customer Support;
- Identifiers: User ID, Device ID (push token/device registration);
- Free-tier ad SDK data: Coarse Location derived from IP; Device ID; Product Interaction; Advertising
  Data; Crash Data; Performance Data. Google documents advertising, analytics, and fraud-prevention
  purposes. No financial content or account profile is passed as ad metadata.
- EAS Observe: unlinked Device ID (anonymous installation/session), Performance Data and Other Diagnostic
  Data for analytics/app performance. The router integration and custom events are disabled, so no route,
  query parameter, account/ledger id or financial content is attached. The stable SDK's import-time
  JavaScript error handler is patched out; native reports retain numeric crash codes and symbolic code
  frames while Android/iOS free-form exception reasons are stripped.

BooKoo does not request ATT and does not intentionally access IDFA. That fact does not justify marking the
SDK data “not collected” or “not shared”; the App Privacy form must follow the actual privacy report and
Google's current SDK disclosure.

### Google Play Data safety

- Collected: name, email, legacy phone, user ids, financial records, optional entry place, photos,
  comments/other user content, support requests, push/device token, and essential account/security events.
- Google Mobile Ads automatically collects and shares IP-derived approximate location, app interactions,
  diagnostic information, and app/device identifiers for advertising, analytics, and fraud prevention.
  BooKoo blocks the Android advertising-ID permission, uses non-personalized requests, and does not pass
  ledger content or account profiles.
- EAS Observe collects unlinked anonymous installation/session identifiers, app/build/update version,
  country, OS/model, language, launch/render/interactive timing, frame/memory/device state, network type and
  bounded launch-request aggregates for app performance and diagnostics on a deterministic 25% sample.
  Sampled native crashes may add numeric exception/signal/status values and symbolic code frames; automatic
  JavaScript errors and free-form native exception messages are excluded.
- Purposes: app functionality, account management, security/fraud prevention, developer communications for
  OTP/invite/support only, and user-requested sharing with invited ledger members.
- Shared: no sale of financial/profile data. Contracted service processing, invitation-based sharing, and
  Google Mobile Ads' automatic technical/ad-data sharing are classified according to Google's current form
  instructions; do not guess “not shared” for the ad SDK.
- Data is encrypted in transit. Account deletion is available in-app and at the public deletion URL.
  Users may request deletion of some or all data; stated shared-ledger/retention exceptions are visible.

## 7. Processor and overseas-transfer register

Before release, the operator completes this table from signed/current vendor terms and publishes the
applicable rows. A vendor hostname or marketing page is not evidence of a processing country.

| Party                             | Role/purpose                                                                            | Data classes                                                                                                                                                                                                 | Required evidence before release                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex                            | processor; database, functions, auth, file storage                                      | all service data                                                                                                                                                                                             | DPA, subprocessors, storage/processing countries, security/retention                                                                                       |
| Expo                              | processor; build/update, push relay and EAS Observe performance/native-crash monitoring | build metadata; push token/payload; sampled anonymous install/session id, app/build/update, country, OS/model/language, performance/device/network diagnostics, numeric crash codes and symbolic code frames | DPA/terms, US hosting/subprocessors, minimum 90-day metric retention; verify no route, custom event, account/ledger content or free-form exception message |
| Resend                            | processor; OTP/invite email delivery                                                    | email, locale, one-time message                                                                                                                                                                              | DPA, sending region/subprocessors, message/log retention                                                                                                   |
| Apple / Google / Kakao / Naver    | independent login provider/recipient                                                    | provider subject, requested profile/email, auth exchange metadata                                                                                                                                            | current scopes, policies, deletion/revocation path, overseas-transfer notice where applicable                                                              |
| Apple Maps / Google Maps Platform | map and geocoding provider for an optional entry place                                  | user search text or selected/current coordinates while the picker is open                                                                                                                                    | current terms, processor/recipient role, countries, API-key restriction, deletion/retention and Korean disclosure review                                   |
| Google Mobile Ads / UMP           | Free-tier ad delivery, consent, measurement, analytics, fraud prevention                | IP-derived approximate location, app interaction, diagnostics, app/device identifiers, advertising data; no ledger content/profile                                                                           | current publisher terms, consent messages, retention/countries, privacy report, App Privacy/Data safety reconciliation                                     |

Sentry, general product analytics, OCR, and Firebase client SDK remain absent. Any new ad format, mediator,
product analytics stream, custom Observe event/route integration, or additional SDK requires processor
evidence, policy/consent/console-label update, and a release-checklist diff before it ships.

D6 observability additionally uses the narrowly configured EAS Observe performance stream described above.
The app's 200-event scrubbed ring remains local unless a user explicitly copies it. Store declarations must
therefore include Observe's automatic unlinked Performance/Diagnostic data and must not claim that the app
collects no diagnostics automatically.

For necessary overseas processing under PIPA Article 28-8(1)(3), the policy/email notice includes every
Article 28-8(2) item: fields, country, timing/method, recipient/contact, purpose/retention, and refusal method
and effect. If the selected vendor arrangement cannot satisfy that basis, a separate overseas-transfer
consent is required; a generic Terms checkbox is not a substitute.

## 8. Rights and operations

Settings > Privacy and the public privacy-choices page support access/export, correction, deletion,
processing suspension/withdrawal where applicable, account deletion, and privacy contact. Requests are
identity-verified without asking for a government id by default. The operator records received time,
scope, verification, disposition, response time, and the minimum non-sensitive reason for any restriction.
No support response includes another member's private profile data.

A pre-release tabletop test covers: account/export request; removed member requesting a receipt URL;
expired export; account deletion with shared and sole-member ledgers; provider revocation failure; rights
request involving another member; and processor incident notice. Results and policy hashes are release
artifacts, not chat history.

## 9. Primary references checked 2026-08-24

- Korea PIPA Articles [15](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335387),
  [22](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1006185927),
  [28-8](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334953),
  [30](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398435), and
  [35-2](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033216573);
  [Enforcement Decree Article 42-2](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=194207).
- Apple [App Review Guidelines 5.1](https://developer.apple.com/app-store/review/guidelines/),
  [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), and
  [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- Google Play [User Data, privacy, Data safety, and account deletion](https://support.google.com/googleplay/android-developer/answer/10144311).
- Convex [Serving Files security guidance](https://docs.convex.dev/file-storage/serve-files) and
  [HTTP action limits](https://docs.convex.dev/functions/http-actions).


## Optional country activity — November4 owner decision

The owner explicitly requested country-level active-account reporting and chose
IP-based country estimation with country-code-only application storage. This is
not permission to add location permissions, a general tracking SDK or historical
country inference. The existing presence owner stores only the latest code,
behind a separate unticked Privacy choice. Withdrawal immediately removes it;
late in-flight presence writes recheck server consent and cannot recreate it.
The existing Vercel website receives no BooKoo account id/token/cookie and the
function returns only the edge country header; application code never reads or
logs IP/city/coordinates. Provider infrastructure records follow provider policy.

November4 source disclosures cover purpose, country code plus existing activity
time, voluntary participation, latest-value replacement and withdrawal/deletion,
Vercel processing and VPN/unknown limits in all five legal languages. The actual
public policy and store answers must be verified/published before exposing the
production choice. Existing clients without document metadata continue to have
the October22 documents recorded; new onboarding and country opt-in pin exact
rendered document hashes. New optional grants/withdrawals use existing legal
records and personal exports, without collecting IP as consent evidence.
