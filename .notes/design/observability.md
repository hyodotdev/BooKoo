# BooKoo — privacy-safe observability and release evidence

Status: **normative D6 contract, revised 2026-09-01**. This document resolves G34 and supersedes the
earlier launch assumption that no automatic client performance telemetry is uploaded.

## 1. Launch decision

The launch build contains **no Sentry, general product analytics, session replay, or custom client event
stream**. It uses `expo-observe` only for sampled, anonymous performance and native-crash diagnostics on a deterministic 25%
of release installations. Debug builds do not dispatch. The integration records launch/bundle/render/
interactive timing, frame and memory conditions, low-power/thermal state, network type and bounded launch-
request aggregates, app/build/update version, country, OS/model and language. EAS Observe hosts the data in
the United States and retains metric data for at least 90 days.

The Expo Router integration is deliberately disabled. No route, URL, query parameter, ledger/item/invite
identifier, account id, user attribute, custom `logEvent`, global attribute, or app-reported JavaScript
error is sent. The released SDK 57 package installs automatic JavaScript error capture on import but does
not yet expose the documented `errorHandlingEnabled` control; BooKoo therefore carries a minimal
`patch-package` overlay that removes that import-time handler. The same overlay strips Android throwable
messages, Android OS exit descriptions, and iOS MetricKit exception-reason strings before persistence.
Sampled native crash reports may still contain numeric exception/signal/status values, app version and a
symbolicated native/JVM call-stack tree. Delete the patch as soon as a compatible stable package provides
and is configured with equivalent official controls. Store declarations include the remaining performance,
crash and other diagnostic data produced by the native library.

Google Mobile Ads/UMP and RevenueCat Ads retain the separate limited technical/ad processing declared in
`privacy-and-compliance.md`; they never receive ledger content or account profiles.

EAS Observe aggregate performance, App Store Connect/Xcode crash reports, Google Play Android vitals,
Convex's first-party deployment health/function metrics, deterministic tests, explicit user-submitted
diagnostics, and aggregate RevenueCat ad/subscription reports are the launch evidence sources.

This remains a data-minimizing operating model: Observe is performance monitoring, not product analytics,
and is never joined to BooKoo account or ledger identity. `@sentry/react-native` remains deferred and no
product analytics provider is selected.

## 2. Closed diagnostic vocabulary

Production code may call only a typed `diagnostic(event)` API. It accepts no arbitrary object, string,
exception, route URL, query args, or mutation args. The initial event union is:

```ts
type DiagnosticEvent =
  | {
      kind: 'APP_START';
      durationBucket: '<450' | '450_900' | '901_1500' | '>1500';
      hadHint: boolean;
    }
  | {
      kind: 'BOUNDARY';
      surface: 'ROOT' | 'TAB' | 'DETAIL';
      code: string;
      release: string;
    }
  | {kind: 'WIRE_UNKNOWN'; operation: string; release: string}
  | {
      kind: 'UPDATE';
      outcome: 'CHECK_FAILED' | 'DOWNLOAD_FAILED' | 'EMERGENCY_LAUNCH';
    }
  | {kind: 'INTL_CAPS'; mask: number}
  | {kind: 'MISSING_TRANSLATION'; keyHash: string; locale: string};
```

`operation`, `code`, and `locale` are members of closed compile-time allowlists; `keyHash` is a one-way
hash of a catalog key, never rendered text. Values are held in a 200-entry in-memory ring and disappear
with the process. Development prints the same scrubbed shape. Production never automatically uploads or
persists it.

Advertising has a separate closed vocabulary: mediator AdMob, format banner, the fixed
monthly_summary_banner placement, app-scoped ad-unit id, random impression id, lifecycle outcome,
currency, integer revenue micros, and provider precision. No route, account/user id, ledger id/title,
amount, memo, category, receipt, place, or free-form error is included. Development test ads do not report
revenue.

Forbidden in every app-authored diagnostic, log, event, attribute and free-form crash field: user/document/provider ids, email, phone, handle, display name, ledger/category
title, memo, amount, currency pair/rate, place, comment/report/support text, photo/storage/export URL or
id, invite/OTP code, token/header/cookie, stack arguments/local paths, navigation query, free-form
exception message, and full device identity. The disclosed native crash payload may retain numeric OS
codes and symbolic code frames, but no exception message or runtime argument. Request ids may be shown transiently to the user for a
support case but are not combined with app content in a client log.

The Settings > Help > Diagnostics screen previews the exact allowlisted rows, app version/build,
platform/OS major, Expo update id prefix, and feature-state booleans. Export or copy is a deliberate user
action with a confirmation that the payload will leave the device. No local server-data cache or outbox
exists to include. Support records the user-provided bundle as Customer Support data under the D4
retention rule.

## 3. Server and store operations

Convex already records execution outcome, duration, request id, mutation retry count, and health insights
including write conflicts. Server `console.*` calls use a separate typed allowlist and never interpolate
arguments or domain documents. Expected `appError` payload params stay within `shared/appErrors.ts`'s
safe scalar allowlist. Production responders use Dashboard Health, Functions, Logs, Scheduler, and usage
limits; no paid Convex log stream or exception integration is assumed.

The release owner captures dated, aggregate evidence at each staged rollout checkpoint:

| Signal               | Source                                                   | Stop rule                                                                                  |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| item mutation OCC    | Convex Health write-conflict insight + Functions latency | any sustained `items.create` conflict insight or retry-shaped p95/p99 regression           |
| server failures      | Convex Health/Functions                                  | unexplained user-action failure rate >1% for 15 min                                        |
| scheduler            | Convex Health                                            | lag >5 min or any required job failed twice                                                |
| function latency     | Convex Functions p95/p99                                 | named query/mutation exceeds its release budget twice                                      |
| iOS crashes          | App Store Connect/Xcode organizer                        | new reproducible launch/data-loss crash or staged crash-rate regression                    |
| Android crashes/ANRs | Play Console Android vitals                              | new launch/data-loss cluster, bad-behavior threshold, or material staged regression        |
| support              | support queue                                            | any credible financial corruption, cross-account disclosure, or repeated lost-write report |

The old exact “>0.5% in a rolling hour” threshold is retired at launch because Convex exposes per-mutation
retry counts through log streams, while D6 installs no approved Convex log destination. EAS Observe does
not carry server mutation retries. A future approved server stream reinstates an exact threshold; until
then no one may invent the percentage from commit counts.
“No data” never means zero incidents. During internal/closed testing, the owner archives the matching
Health/Functions window and inspects every failure. During rollout, daily console screenshots/exports are stored as
non-PII release evidence under `.local/release-evidence/` and are never committed.

## 4. Performance evidence

The existing p50 ≤450 ms / p95 ≤900 ms warm-start budget remains a **release-device benchmark**. The
performance harness runs at least 20 cold starts per supported reference device, with warm auth, cached
data, and a production-mode bundle. A release fails if its local sample p95 exceeds 900 ms or regresses by
more than 15% from the accepted baseline. A separate no-cache/poor-network scenario must render an honest
skeleton and remain usable, but does not share the warm-start threshold.

Observe supplies a sampled real-device distribution for launch, bundle load, first render and app-level
TTI, tied to build/update markers. Its 25% deterministic installation sample is never extrapolated to all
users. The dashboard is a regression signal, not evidence about user behavior, revenue, ledger activity or
feature adoption. The root marker fires only after authentication and the initial profile mirror settle;
the router integration remains off because route parameters can contain private identifiers.

`INTL_CAPS`, missing translations, and `PERFORMANCE_TRACE` therefore feed development, tests, the local
ring, and a user-initiated diagnostic only. They are never Sentry breadcrumbs or analytics events.

## 5. Incident handling

Severity is based on harm, not event volume:

- **SEV-0:** cross-account data exposure, token/secret leak, or financial corruption — stop rollout,
  enable maintenance when safe, preserve scrubbed evidence, rotate/revoke as applicable, and begin legal
  incident assessment immediately.
- **SEV-1:** lost durable write, auth outage, launch crash, broken deletion/export/private-media control —
  stop rollout and assign an owner immediately.
- **SEV-2:** localized feature failure or performance regression with a safe workaround — pause promotion
  until fixed or explicitly accepted.

Every incident record contains release/build, first/last seen, safe event code, affected surface, aggregate
count, owner, mitigation, verification, and decision. It contains no financial/user content. The release
runbook names the primary and backup on-call owner before P1 can close.

## 6. Future SDK adoption gate

Sentry, product analytics, a custom Observe event stream, route telemetry, or a Convex log stream may be
proposed only in a separate privacy/release change that:

1. names the operational question that store/Convex evidence cannot answer;
2. selects a processor and documents DPA, subprocessors, countries, retention, deletion, access, and cost;
3. supplies before-send/scrub tests that inject every forbidden field class;
4. defines sampling, release identity, environments, access control, alert ownership, and deletion;
5. updates the privacy notice, PIPA overseas-transfer basis, App Privacy/Data safety answers, and user
   controls before the package ships.

An analytics opt-out flag is not added speculatively: Observe is limited to sampled technical performance
and does not measure product behavior.

## 7. Acceptance

- A source test bans Sentry/product-analytics imports and direct production `console.*` outside the typed
  server logger and development-only client adapter.
- Observe tests require debug dispatch off, a 25% deterministic installation sample, no router integration,
  no custom event/user/global attributes, no automatic JavaScript error handler, and no free-form native
  crash reason/message in the applied package.
- Diagnostic tests inject ids, emails, amounts, memos, URLs, tokens, stack paths, and invite codes and
  prove no forbidden value survives.
- Release evidence includes the device performance sample, Convex health/limits review, Apple/Google
  quality review, alert/stop-rule rehearsal, and named incident owners.
- App Privacy/Data safety and the public notice disclose sampled, unlinked performance and native-crash
  diagnostic data, anonymous installation/session identity, United States processing and the minimum
  90-day metric retention.

## 8. Primary references checked 2026-09-01

- Expo [Introducing Observe](https://expo.dev/blog/introducing-observe),
  [setup](https://docs.expo.dev/eas/observe/get-started/),
  [configuration](https://docs.expo.dev/eas/observe/configuration/) and
  [error reporting](https://docs.expo.dev/eas/observe/errors/).

- Convex [Health](https://docs.convex.dev/dashboard/deployments/health),
  [Functions metrics](https://docs.convex.dev/dashboard/deployments/functions), and
  [Logs](https://docs.convex.dev/dashboard/deployments/logs). Convex documents `mutation_retry_count` in
  [Log Streams](https://docs.convex.dev/production/integrations/log-streams), which currently requires a
  paid plan and an external destination; it is not assumed at launch.
- Apple [App Crashes report](https://developer.apple.com/documentation/analytics-reports/app-crashes) and
  [App Store Connect Analytics](https://developer.apple.com/help/app-store-connect-analytics/).
- Google Play [Android vitals](https://support.google.com/googleplay/android-developer/answer/9844486)
  and [Crashes and ANRs](https://support.google.com/googleplay/android-developer/answer/9859174).
