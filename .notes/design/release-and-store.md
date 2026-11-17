# BooKoo — release and store submission contract

Status: **normative D4 release contract** (2026-08-24). This resolves G41. It is a checklist for a new
listing under `dev.hyo.bookoo`; it is not permission to create cloud resources or submit a build.

## 1. Release identity and public endpoints

### Initial-release version decision — September 6

Until the first public release, keep the iOS and Android marketing version at
`1.0.0`. `package.json` is the only source; Expo config and store metadata read
it. Increase only EAS-managed iOS build numbers and Android version codes for
replacement candidates. Never reset those counters or reuse an uploaded number.
This supersedes the earlier unshipped `1.0.1` candidate plan. It does not permit
reusing an old binary: rebuild from the exact reviewed, merged commit.

The unchanged appVersion runtime policy cannot distinguish incompatible native
candidates that share `1.0.0`. Do not publish an OTA across those candidates;
verify the channel has no incompatible update before shipping a replacement.
After launch, native-runtime changes need a new compatibility/version decision.
No force-update record is changed by this initial-release correction.

| Item | Production value / rule |
|---|---|
| App / slug / scheme | `BooKoo` / `bookoo` / `bookoo` |
| iOS bundle id | `dev.hyo.bookoo` |
| Android package | `dev.hyo.bookoo` |
| Invite host | `https://bookoo.hyo.dev/invite/<token>` |
| Privacy / terms / support | URLs fixed in `privacy-and-compliance.md` §2 |
| Primary category | Finance |
| Business model | Free core with one non-personalized monthly-summary banner; Pro removes ads and adds household capabilities |
| Platforms | iPhone, iPad, Android phone, Android tablet |
| Locales | Korean, English, Japanese, Simplified Chinese, Indonesian |

The `main` branch alone does not identify a release. A production candidate is an annotated version tag
from a verified release branch, with remote EAS build numbers, store record ids, policy/document hashes,
and the exact Convex production deployment recorded in a private release manifest. No secret, service
account JSON, `.p8`, keystore, OTP, or reviewer credential is committed.

Codemagic Patch (`bun ota:release`) is a manual production tool, not a per-merge deployment. A compatible JavaScript/assets-only
change may be published only from a clean checkout whose `HEAD` exactly matches `origin/main`, after an
exact successful push CI run plus an explicit compatibility acknowledgement and release message. The guarded
`ota:release*` scripts publish to the Patch `Production` deployment with the `production` EAS environment;
the target binary version plus Patch's native fingerprint keep updates scoped to matching installed binaries. Native dependency/
config/permission/entitlement/manifest/asset changes require new local-only IPA/AAB builds. The EAS `preview`
profile is retained only for explicit local internal-device testing and is unrelated to Convex cloud preview
deployments.

## 2. External identifiers — no placeholders at submission

`eas.json` placeholders remain visible until the corresponding accounts exist; that is safer than copying a
legacy id. Before the first production build:

- create the new App Store Connect record and replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and
  `REPLACE_WITH_APPLE_TEAM_ID` with non-secret identifiers;
- create the new Play app for `dev.hyo.bookoo`; use EAS-managed credentials or an ignored least-
  privilege service-account key, never `./secrets/...` unless that exact ignored file exists in CI;
- connect one EAS project id and explicit Convex development and production deployments; CI uses an
  ephemeral anonymous local backend instead of a cloud preview, and no production build may inherit
  `.env.local`;
- finish Google/Apple/Kakao/Naver redirect ids and scopes from the E1 integration note, and verify every
  release signing hash/bundle id in the providers;
- serve AASA and `assetlinks.json` for the exact production signing identities, then test invite links from
  Messages/KakaoTalk/email with the app absent, installed, signed out, and signed in.

The release check fails on `REPLACE_`, empty required variables, a development Convex URL, a production
service key in git, a provider id belonging to another app, or a privacy/support URL that does not return
200 over HTTPS.

## 3. Store metadata source

The first listing uses the following localized positioning. Full descriptions expand the same factual
feature list—shared ledgers, fast history, calendar/statistics, receipt photos, comments/invites,
five-language UI, dark mode, tablet layout, account export/deletion—and must not promise bank sync, OCR,
location capture, budgets, or an old-listing update.

| Locale | Name (≤30) | Subtitle / Play short description | Keyword direction |
|---|---|---|---|
| ko | BooKoo - 함께 쓰는 가계부 | 가족·연인·친구와 함께 기록하는 빠른 공유 가계부 | 가계부,공유가계부,생활비,지출,수입,예산,부부,가족 |
| en | BooKoo Shared Ledger | A fast shared ledger for couples, families, and friends | shared ledger,budget,expense,income,couple,family,money |
| ja | BooKoo 共有家計簿 | 家族・パートナー・友達と一緒に記録する家計簿 | 家計簿,共有,支出,収入,家族,夫婦,お金 |
| zh-Hans | BooKoo 共享记账 | 与家人、伴侣和朋友一起快速记账 | 记账,共享账本,支出,收入,家庭,情侣,财务 |
| id | BooKoo Catatan Bersama | Catatan keuangan bersama untuk keluarga, pasangan, dan teman | catatan,keuangan,pengeluaran,pemasukan,keluarga,pasangan |

Apple subtitle is capped at 30 characters and keywords at 100 bytes; Google name/short/full limits are
30/80/4,000 characters. A release script validates actual locale files against current console limits.
Descriptions are plain text, identify private invitation-based sharing, and explain that BooKoo records
manual ledger entries rather than connecting to a bank. The support and privacy URLs are localized.

## 4. Screenshot truth and local asset layout

Old Play Console screenshots are private reference material only. Archive downloads under
`.local/store-assets/legacy/play-console/original/` with a checksum manifest, and any exploratory iPhone
crops under `.local/store-assets/legacy/derived-ios/`. They may inform visual storytelling but must not be
stretched, relabelled, or submitted as screenshots of the new app: store assets must accurately show the
shipping build and the new tablet/iPhone UI.

Release assets live outside PII under `store-assets/<version>/<locale>/<device>/` only after a deterministic
demo seed replaces all real names, amounts, photos, emails, and places. The seed includes no `.local` data.
The archive keeps source captures, composed PNGs, alt text, device/OS/build, theme, locale, capture route,
and SHA-256 manifest.

Use eight truthful scenes per locale/device, mixing themes rather than attempting an impossible 16 uploads:

1. shared ledger switcher (light);
2. fast paginated timeline with receipt thumbnail (dark);
3. add-entry amount/category form (light);
4. ledger-zone calendar with daily totals (dark);
5. donut plus accessible category list (light);
6. twelve-month trend (dark);
7. invite/member roles (light);
8. receipt viewer or privacy/export settings (dark).

| Store family | Required production master | Count |
|---|---:|---:|
| Apple iPhone 6.9-inch | one accepted portrait size, default `1320×2868` | 8 × 5 locales |
| Apple iPad 13-inch | landscape `2752×2064` (or accepted `2732×2048`) | 8 × 5 locales |
| Google phone | portrait `1080×1920`, 9:16 | 8 × 5 locales |
| Google 10-inch tablet | landscape `1920×1080`, 16:9 | 8 × 5 locales |

Apple accepts 1–10 screenshots and requires the 13-inch set when the app runs on iPad. Google permits up
to eight/device type, requires at least two overall, and recommends at least four 1080px screenshots;
tablets/Chromebook use at least four. Images are PNG/JPEG without alpha, contain no notification/provider
leakage, show full battery/network chrome or deliberately clean system chrome, and have locale-specific alt
text. No ranking, price, award, download CTA, third-party logo, or unshipped feature appears.

## 5. Privacy, content, and rating answers

`privacy-and-compliance.md` §6 is the source for App Privacy and Data safety. Before submission, generate a
diff between installed production SDKs/native permissions and that matrix. Any new data type or purpose
blocks submission until policy, consent, processor register, Apple answer, Google answer, and screenshot/
review notes agree.

- App tracking transparency: BooKoo does not request ATT or intentionally access IDFA. Google Mobile
  Ads/UMP is present for non-personalized Free-tier ads, and Android advertising-ID permission is blocked.
  Complete the SDK-derived App Privacy/Data safety disclosures conservatively.
- Observe: disclose unlinked Device ID, Performance Data and Other Diagnostic Data for app analytics/
  performance, plus the matching Google diagnostics/app-interaction categories. The 25% sampled stream is
  anonymous per installation, US-hosted, and not tracking; router parameters, custom product events and
  automatic JavaScript errors are disabled. Native crash diagnostics retain numeric codes and symbolic code
  frames, with free-form exception messages stripped.
- Encryption: HTTPS and platform/Convex encryption only; `ITSAppUsesNonExemptEncryption=false` remains
  truthful unless custom non-exempt cryptography ships.
- UGC: private invite-only handles/comments/photos still require reporting, blocking, and moderation;
  answer store questionnaires truthfully rather than claiming “no user-generated content.”
- Location: historical imported places exist; the binary requests no location permission and collects no
  new coordinate. Review notes say exactly that.
- Finance: a manual shared record, not banking, payment, credit, investment, gambling, or money transfer.
- Age/content rating: do not hard-code “4+” or “Everyone.” Complete the current Apple and IARC questionnaires
  from the shipping feature set, record the generated ratings per territory, and investigate any unexpected
  result. The service eligibility gate remains 14+ regardless of content rating.

## 6. Reviewer access and notes

The production review account is synthetic and owns a synthetic ledger populated only with demo data. It
uses the review-only OTP path already designed in auth:

- allowlisted normalized reviewer email only;
- fixed OTP stored only in Convex production env, never code/EAS env/store metadata repository;
- feature enabled only for the active review window, rate-limited and audit logged;
- no bypass of provider verification, account/ledger permissions, export protection, or deletion;
- rotate/remove the OTP immediately after approval and before public release.

Review notes name the exact navigation:

- sign in with the supplied reviewer email and OTP;
- ledger switcher, timeline, calendar, statistics, receipt viewer, invite/member roles;
- Settings > Privacy > Export my data;
- Settings > Account > Delete account (two confirmations); external deletion URL for Play;
- Photos are selected/captured only after action-time permission and delivered through an authenticated
  media route; location is historical/read-only with no native permission;
- Free: one non-personalized banner below the monthly summary; Pro and Pro-funded invited members: no ads.
  No ad appears during sign-in, input, receipts, invites, export, privacy, or deletion. No bank sync,
  personalized targeting, ATT prompt, or background location.

Notes also explain tablet panes, the 30-day deletion recovery screen, how shared financial rows are
de-identified while account-owned receipt/comment content is purged, and a direct support contact. A human
executes the notes from a clean device before submission.

## 7. Legacy listing migration notice

The new package is not an update to `com.dooboolab.bookoo`.

- On the existing Google Play listing, if the operator still controls editable metadata, replace the first
  description paragraph and first screenshot with a localized, dated notice that the old app is retired,
  links to the new listing, and explains sign-in/legacy recovery. Do not upload a broken Expo 36 build merely
  to show a banner.
- The old iOS app/listing was deleted, so no in-place iOS channel is assumed. The new listing and public
  support page carry the legacy migration explanation.
- The new auth landing and `legacy-help` route say this is a separate installation and that verified legacy
  identity recovery restores historical ledgers. They never imply an automatic store update.
- Preserve the original screenshots privately, but do not expose real user data or obsolete security/
  provider claims in the new listing.

## 8. Production release gates

No “ready to deploy” claim is made until every line has real evidence:

1. clean release branch/tag; lockfile frozen; `bun lint && bun typecheck && bun run test` green;
2. production Convex schema/functions deployed and target smoke/load/security tests green;
3. migration rehearsal/cutover report green, 724/724 photo decisions explicit, no unresolved BLOCKER;
4. Expo dependency/doctor, native prebuild diff, iOS archive validation, Android app-bundle validation;
5. all production env/provider/signing ids complete; no placeholder/development origin/committed secret;
6. AASA/assetlinks, OAuth callbacks, OTP email, push token/receipt, auth providers tested on release builds;
7. private-media removal test proves a removed member receives 404 with an old photo id/token;
8. personal and ledger export request/download/expiry/deletion tested, including 18 MiB part boundary;
9. privacy/terms/support/deletion/choices URLs live and reviewed; processor/overseas table complete;
10. App Privacy/Data safety/content rating/account deletion/reviewer credentials entered and cross-checked;
11. five-locale iPhone/iPad/Android phone/tablet screenshots generated from the exact release build and
    visually inspected; metadata limits validated;
12. backup/rollback plus `observability.md`'s Convex/store quality checks, stop rules, device benchmark,
    on-call/incident response, moderation 24-hour coverage, support, staged rollout, and legacy notice have
    named owners, dates, and rehearsed evidence;
13. submit manually, monitor review, then use staged/phased rollout with crash/support/migration stop rules.

Cloud creation, credential creation, builds, submission, and rollout are external state changes. They happen
only in their authorized task with action-time confirmation where the browser/account requires it; a design
document never counts them as completed.

## 9. Primary references checked 2026-08-24

- Apple [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/),
  [platform metadata limits](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/),
  [App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy),
  and [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- Google Play [listing fields](https://support.google.com/googleplay/android-developer/answer/9859152),
  [preview assets](https://support.google.com/googleplay/android-developer/answer/9866151), and
  [User Data/account deletion](https://support.google.com/googleplay/android-developer/answer/10144311).

## 10. Queued store copy for the next Android release (added 2026-09-17)

Android 1.0.3's `새로운 기능` is immutable at 100% rollout and currently reads:

> 측정 기능이 필요 이상의 정보를 보내던 문제를 수정했습니다. 초대 링크와 화면 주소는 이제 외부로
> 전송되지 않습니다.

That is the honest note for the analytics privacy fix, but it is the only release note a visitor sees on a
listing whose whole pitch is a private invite-only ledger. **Do not ship a release just to replace it** — the
note sits below the screenshots and the About section, Play's own Store Listing Experiments do not test
release notes as acquisition copy, and the cost is a versionCode bump, a local AAB, QA and a Play review.

When 1.0.4 ships for a reason of its own, use this note. It leads with the two fixes already delivered over
EAS Update on runtimeVersion 1.0.3 and keeps the privacy item last without erasing it:

> • 원장 날짜·시간 표시 오류 수정
> • 앱 잠금 안정성 개선
> • 개인정보 보호 강화: 분석 전송 항목 최소화(초대 링크·화면 주소 제외)

Ranked higher than the release note for the same effort: the first three phone screenshots and their
captions, first reviews/social proof, short-description tuning, and the promo video's opening seconds.

**Used in 1.0.4 (2026-09-22).** 1.0.4 ships for the repositioning, so the queued note was spent as planned.
It lives in `store-assets/metadata/*.json` under `google.releaseNotes` rather than in this file, `원장` became
`가계부` to match the terminology sweep, and a fourth bullet covers the de/id/zh wording corrections. Apple
does NOT get this note: the live iOS 1.0.3 note already announced both EAS-Update fixes, so repeating them
would be announcing the same work twice. The two stores' notes differ on purpose — see `apple.releaseNotes`
in the same files. Play's cap is 500 characters per locale and `verify:store` enforces it.

## 10b. iOS 1.0.3 release note — shipped 2026-09-19, cut from eight bullets to four

The first draft listed eight bullets, one per fix. It read like a changelog, and
one line was actively harmful: it advertised that the app lock *had* two ways
past it. Nobody outside the team knew that, and a store release note is not where
to teach them. Cut to four, same coverage, trust items merged into one line:

> • 카테고리 이름·색상·아이콘을 직접 바꿀 수 있습니다
> • 기록 시각을 가계부 시간대로 통일해 멤버 모두가 같은 날짜를 봅니다
> • 앱 잠금과 초대·접근 보안을 강화하고 분석 수집을 최소화했습니다
> • 삭제된 내역의 영수증 노출을 고치고 작은 화면 레이아웃을 다듬었습니다

Written in all nine App Store localizations. **Apple requires What's New for every
localization on an update** — the first submission attempt failed listing German,
Indonesian, Chinese and Japanese as missing.

Two operational facts worth keeping:

- **Metadata is editable while a version is Waiting for Review**, and the edits
  ride along with that review. App Store Connect says so in its own banner: only
  swapping the *build* requires removing the version from review. Everything here
  — description, keywords, promotional text, release notes, and the app-level
  subtitle — was changed after 1.0.3 was already submitted.
- The general rule for release notes still holds: do not ship a release for a
  note's sake (§10), but when a release is already going out, the note is worth
  writing properly.

## 11. The ko Play panels were reshot on a Korean fixture (done 2026-09-18)

Three defects were fixed together, because the first gated the other two:

1. **Dollars on a Korean listing.** Every panel read `-US$68.55`, `총액 -US$392.26`.
2. **App Review fixture identities on screen** — "Home & Everyday", "Sam - Android
   Test", "Alex - iOS Test" — which is why the sharing scene could not lead.
3. **No panel showed a comment thread**, though the short description promises 댓글.

None was fixable by editing text, and `generate-play-refresh.mjs` rightly forbids
retouching (R63/R65), so all eight were reshot.

### The fixture

A development-deployment ledger, KRW on `Asia/Seoul`, titled `우리집 생활비` and
shared by `민지` (owner) and `서연` (member), with 27 September entries and a
three-message thread on a `-₩120,000` 어머님 생신 선물 entry. Seeded through normal
authenticated mutations so the rollups are real — the statistics panel's
`-₩821,500` is computed, not typed. The seeding script lives under `.local/`
because it is provisioning, not product code. The App Review fixture in
`.notes/qa/shared-fixture-2026-09-06.md` was left alone, as that note requires.

### The panels

`sharing, comments, calendar, timeline, stats, entry, categories, theme`.
`ledgers` was dropped: the account owns one ledger on the free tier, so a
"switch between ledgers" panel had nothing to show, and the comment thread is
the better claim for that slot.

### What a future run needs to know

- `scenes` in the generator is **per locale**. en-US keeps its original set and
  sources; Play's live default is Korean and the en listing is not published.
- `screenshotAltText` in `metadata/ko.json` is **positional** — reorder it with
  the scenes or the alt text describes the wrong panel.
- The ko sources come from a physical Pixel 10, whose status bar carries the
  tester's own notification icons. `sourceCrop` removes the status bar at the
  display cutout inset (173px, read from `dumpsys window displays`) and takes
  234px off the bottom so the composition still ends above the AdMob test
  banner. That 234 was measured from the banner's first non-white row, not
  guessed; if the frame geometry or the device changes, measure it again.
- The emulator was tried first and abandoned: `screencap` returns zero bytes on
  this host even after a cold boot, and its SystemUI gets stuck on the
  NotificationShade. Use the physical device.
- Do not clear the tester's notifications to clean the status bar. They are
  personal content; crop instead.
- Play appends an added screenshot to the end of the slot list and offers no
  move-to-front control, but drag-and-drop in the console grid works. Uploading
  eight at once lands them in an arbitrary order, so expect to drag.
- Submitting while a review is in flight cancels and restarts it.

### Deploying the public site

`bookoo.hyo.dev` is served by **Vercel**, not Firebase. The repo contains a
`firebase.json` whose `hosting.public` is `public/`, and following it deploys a
complete, correct copy of the site to `bookoo-90f0a.web.app` — which nothing
points at. The live domain does not change, and the deploy reports success.

The real target is the Vercel project `bookoo-public`, connected to this
repository through Vercel's Git integration with Root Directory `public`. Every
push to `main` that changes `public/` deploys production automatically; pull
requests get preview deployments. Do not upload `public/` with the CLI: with the
Root Directory set, a CLI upload from `public/` looks for `public/public`.

Verify against the domain, not the deploy output — `curl` the asset bundle and
read the strings back:

```bash
curl -s https://bookoo.hyo.dev/assets/content.js | grep -o '"tagline":"[^"]*"'
```

Note that `public/` is generated. Run `bun run public:generate` after any copy
change in `scripts/public-site/content.ts`, or `verify:public` fails in CI and
the deployed site keeps the old wording — which is exactly how the site spent
the whole community repositioning still describing BooKoo as a ledger for
가족 and 연인.

### Repositioning the seeded in-app announcements

`convex/content/seedDefault` **skips rows that already exist**. Editing
`convex/content/defaults.ts` therefore changes nothing on a deployment that has
already been seeded — production kept the launch wording for days after every
store listing had moved on, and the file gave no hint of it.

`content/seeds:repositionLaunchCopy` is the repair. It is an `internalMutation`,
not part of deploy, and it is one-shot: it matches on launch-era markers in the
stored text, and once it has run those markers are gone.

Dev first, then production as a separate, explicitly confirmed step, and read
the result back rather than trusting the command:

```bash
bunx convex run content/seeds:repositionLaunchCopy          # dev
bunx convex run content/seeds:repositionLaunchCopy --prod   # after confirming
```

Expected: `patched` lists all three keys on the first run and is empty on the
second, with the same three in `skipped`. A key in `missing` means that
deployment was never seeded — run `seedDefault` there instead, which inserts the
current copy directly.

This does not need an app release. Announcements are read at runtime through
`api.content.queries.list`, so the new copy reaches users on the store version
they already have.

**After it has run, `defaults.ts` is no longer the way to change those rows.**
The markers are gone, so a later edit will not reach production; use the admin
`content.mutations.upsert`, which requires all five locales.

## 15. The iOS local build cannot sign while two distribution identities exist (2026-09-22)

`eas build -p ios --profile production --local` fails at the archive step with:

> Provisioning profile "*[expo] dev.hyo.bookoo AppStore 2026-09-16T09:37:57.385Z" doesn't include
> signing certificate "Apple Distribution: Hyo Jang (PRDQGB267K)".

Everything before that step is green, including EAS's own "Verifying whether the distribution certificate
and provisioning profile match". The mismatch is between Xcode and the Mac's keychain, not between EAS and
Apple.

**Why.** For an App Store build, `@expo/build-tools` calls
`IOSConfig.ProvisioningProfile.setProvisioningProfileForPbxproj` **without** a `codeSignIdentity`
(`dist/ios/configure.js` passes it only for `DistributionType.DEVELOPMENT`), so the Release configuration
gets the plugin's default — the *generic* string `CODE_SIGN_IDENTITY = "iPhone Distribution"`. Xcode then
resolves that generic string against every identity in the search list, and this workstation has two
distribution identities on the same team:

| SHA-1 | Common name | Serial | Issued | In BooKoo's profile |
| --- | --- | --- | --- | --- |
| `7A0EB5C4…796A` | iPhone Distribution: Hyo Jang (PRDQGB267K) | `70A580F7…074E` | 2026-09-16 | **yes, and it is the only one** |
| `23DDDA96…730B` | Apple Distribution: Hyo Jang (PRDQGB267K) | `19F65871…092C` | 2026-08-01 | no |

Both live in `login.keychain-db`. Xcode maps the legacy generic name to the modern `Apple Distribution`
identity and picks `23DDDA96`, which the profile does not contain. The profile is verifiably single-cert:
`security cms -D -i <profile>` reports one entry, `70A580F7`.

**This is new behaviour on an unchanged toolchain.** Xcode 26.6 (17F113, installed 2026-07-08) built and
signed build 30 with `iPhone Distribution: Hyo Jang (PRDQGB267K)` on 2026-09-17 — confirmed by
`codesign -dvvv` on `~/Library/Developer/Xcode/Archives/2026-09-17/BooKoo 2026-09-17 03.37.48.xcarchive`.
The `Apple Distribution` certificate already existed then. What changed is the keychain around it: the
leftover `moonlit-beacon-release.keychain-db` has since left the search list (it is now just `login` +
`System`), so where there were two same-named copies there is now exactly one for Xcode to settle on.

**There is no repo-side fix.** A config plugin cannot win, because EAS rewrites `CODE_SIGN_IDENTITY` after
prebuild on every build. The resolution has to change on the machine or in EAS's credentials.

**Do not delete `23DDDA96`.** It is the team's Apple Distribution certificate and Moonlit Beacon signs with
it. Its private key exists only in this keychain — Apple can re-issue the certificate but not the key, so a
delete is unrecoverable.

Two ways out, both requiring the keychain password and therefore the owner:

1. *Permanent.* Export `23DDDA96` as a `.p12` from Keychain Access and give it to EAS
   (`eas credentials -p ios` → Build Credentials → distribution certificate). EAS regenerates the profile
   around it, both apps then share one modern certificate, and the generic name resolves to a certificate
   that is in the profile. Nothing is deleted.
2. *Quick unblock.* In Keychain Access, move the `Apple Distribution` identity out of `login` into a
   keychain that is not in the default search list, build BooKoo, and move it back for Moonlit Beacon.

Diagnose a recurrence with `security find-identity -v -p codesigning` (more than one distribution identity
for the team is the smell) against the single certificate inside
`security cms -D -i ~/Library/MobileDevice/Provisioning\ Profiles/<uuid>.mobileprovision`.

## 16. Android 1.0.4 went to production at 100% (2026-09-22)

§8-13 says "staged/phased rollout with crash/support/migration stop rules", and `eas.json`'s submit profile
pins the track to `internal` so a CLI submit can never reach the public. Both still stand as the default.

For 1.0.4 the owner chose a **full 100% rollout** instead, and the promotion was done by hand in the Console:
internal → Promote release → Production, rollout 100%, then Publishing overview → Submit for review.
`eas submit` uploaded the bundle; it did not publish it.

What that trades away, so the next release makes the choice deliberately rather than by habit:

- **The release note is frozen.** §10 exists because Android 1.0.3's note could not be edited at 100%. The
  five-language note in `store-assets/metadata/*.json` → `google.releaseNotes` is now that release's note
  for good.
- **There is no dial to turn down.** A staged rollout can be halted or held; a full one can only be replaced
  by a newer version, which costs another versionCode, another build and another review.

The risk was judged low because the 1.0.4 binary differs from 1.0.3 only in German, Indonesian and Chinese
strings — `b5d216b..main` touches no other user-visible code, and everything else in 1.0.4 already reached
users as EAS Updates on runtimeVersion 1.0.3.

Rollout state and review progress: Play Console → Publishing overview → Submission activity.

## 17. §15 update — the conflicting certificate is revoked, and how 1.0.4 was archived anyway (2026-09-22)

Two things §15 did not know.

**The `Apple Distribution` certificate is dead.** `eas credentials` refused to upload its `.p12`:
"Provided Distribution Certificate is no longer valid on Apple's server." The account's certificate list
holds only three `iOS Distribution` certificates (`71BB1BD2…`, `70A580F7…`, `2001D770…`) — serial
`19F65871…` is not among them. So Xcode is resolving the generic `"iPhone Distribution"` to a certificate
Apple revoked, in preference to the valid one the profile actually contains. Removing it from
`login.keychain-db` costs nothing: it cannot sign anything Apple will accept, for BooKoo or for any other
app on the team. **That is still the fix**, and it still needs the keychain password, so it stays with the
owner.

**What shipped 1.0.4 without it.** EAS prepares the project and then hands a generic identity to Xcode, so
the archive is the only broken step. Splitting it works:

```bash
EAS_LOCAL_BUILD_SKIP_CLEANUP=1 \
EAS_LOCAL_BUILD_SKIP_NATIVE_BUILD=1 \
EAS_LOCAL_BUILD_WORKINGDIR=<dir> \
  eas build --platform ios --profile production --local --non-interactive
```

`skipNativeBuild` short-circuits only `RUN_FASTLANE` (`@expo/build-tools/dist/ios/fastlane.js`), so
credentials, prebuild, pod install and `CONFIGURE_XCODE_PROJECT` all run. In `<dir>/build/ios` the app
target's Release config then carries `CODE_SIGN_IDENTITY = "iPhone Distribution"`; replacing that one value
with the certificate's SHA-1 (`7A0EB5C4…`) and running `xcodebuild archive` + `-exportArchive` produces the
same binary EAS would have. Verified: `SigningIdentity = iPhone Distribution: Hyo Jang (PRDQGB267K)`, the
same identity that signed the shipped 1.0.3 build 30.

Use this only when the keychain cannot be touched. It is a bypass of the sanctioned pipeline, it re-runs
nothing EAS would have run afterwards, and it leaves the underlying conflict in place for the next release.

## 18. Resolved — the revoked certificate was removed (2026-09-22)

The owner deleted `Apple Distribution: Hyo Jang (PRDQGB267K)` (`23DDDA96…`, serial `19F65871…`) from
`login.keychain-db`. `security find-identity -v -p codesigning` now reports exactly one distribution
identity, `7A0EB5C4…` — the certificate BooKoo's provisioning profile contains — and
`security find-certificate -c "Apple Distribution: Hyo Jang"` returns nothing.

So `eas build --platform ios --profile production --local` should now archive without help: the generic
`CODE_SIGN_IDENTITY = "iPhone Distribution"` that EAS writes has only one certificate left to resolve to.
**The §17 split-build is no longer needed** — use it only if this recurs.

§15's instruction to preserve that certificate was wrong and §17 corrected it; kept here so the sequence
reads in order rather than rewriting history.

What would bring it back: regenerating an Apple Distribution certificate in EAS or Xcode while the profile
still embeds the legacy one. If a future build fails the same way, compare
`security find-identity -v -p codesigning` against the single certificate inside
`security cms -D -i ~/Library/MobileDevice/Provisioning\ Profiles/<uuid>.mobileprovision` before anything
else.

## 19. §17's split-build shipped a binary that crashed on launch — do not use it as written (2026-09-23)

App Review rejected 1.0.4 build 35 under **2.1.0 App Completeness — "The app crashed on launch"**, an
automated rejection nineteen minutes after submission. Build 35 was the §17 split-build. Its signature,
version, build number and translated strings all checked out; what it did not have was its production
configuration.

**Why it crashed.** `EXPO_PUBLIC_*` values are inlined into the JS bundle by Metro at bundling time. In a
normal `eas build`, EAS loads the `production` EAS environment and the bundle is produced inside that
environment. In §17, EAS stopped before the native build, and `xcodebuild archive` then ran the "Bundle
React Native code and images" phase **in an ordinary shell with none of those variables set** — the local
`.env.production` is empty on purpose (`.easignore` strips every real `.env*`). So
`process.env.EXPO_PUBLIC_CONVEX_URL` became `undefined`, and `src/features/auth/client.ts` throws at module
load when it is missing. A throw during startup is a crash on launch.

The check that would have caught it is one line: the bundle must contain the production Convex host. Build
35 was checked for translation strings, which come from JSON and are present regardless of environment, and
not for anything that comes from the environment.

**Rules that follow:**

1. Ship only binaries built by `eas build` end to end. §17 is withdrawn; with the revoked certificate gone
   (§18) it is also unnecessary.
2. Before submitting any store binary, confirm the bundle carries the production environment — the
   production `*.convex.cloud` host (not the `dev:` deployment in `.env.local`) and the platform's
   RevenueCat key prefix (`appl_` on iOS, `goog_` on Android). Unzip the artifact and search
   `main.jsbundle` (iOS) or `base/assets/index.android.bundle` (Android).
3. If a native build ever has to be finished outside EAS again, export the `production` EAS environment into
   the shell first (`eas env:pull --environment production`) and prove rule 2 on the result.

The Android 1.0.4 bundle (versionCode 29, built by `eas build`) was checked against rule 2 and carries the
production host and the `goog_` key.
