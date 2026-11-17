# BooKoo — boot, native/OTA update gate, and provider tree

Status: **normative D6 contract** (2026-08-24). This document resolves G35 and G45. It replaces every
partial provider tree in `auth-onboarding.md` and `client-ia.md`.

## 1. One provider tree

```text
GestureHandlerRootView
└─ RootProvider / CpkProvider
   └─ cpk ThemeProvider → SafeAreaProvider → AppProvider
      └─ RootErrorBoundary
         └─ KeyboardProvider
            └─ ActionSheetProvider
               └─ ConvexAuthProvider
                  └─ SessionCacheBoundary key={sessionEpoch}
                     └─ ConvexQueryCacheProvider expiration={300_000} maxIdleEntries={250}
                        └─ LocaleProvider
                           └─ AccessibilityPreferencesProvider
                              └─ ConnectivityProvider
                                 ├─ LegacySensitiveStorageCleanup (non-blocking side effect)
                                 └─ BootGate
                                    └─ AppLockProvider
                                       └─ AuthGate
                                          ├─ signed-out/onboarding/suspended/deletion routes
                                          └─ ready
                                             └─ LedgerAccentProvider
                                                └─ NotificationProvider
                                                   └─ AppNavigator + global overlays
```

`RootProvider` already owns `SafeAreaProvider`; no second instance is allowed. The root error fallback
depends only on React Native primitives and static locale fallbacks. `ConvexQueryCacheProvider` must be
inside `ConvexAuthProvider`; `SessionCacheBoundary` remounts it before sign-out and on every newly settled
session so one account's memory cache cannot survive into another.

`LocaleProvider` can paint the non-sensitive MMKV locale immediately, then mirrors the authenticated
profile preference when available. `AccessibilityPreferencesProvider` owns Reduce Motion/screen-reader/
contrast preference subscriptions from `accessibility.md`. `ConnectivityProvider` is the only reader of
`useConvexConnectionState` and publishes connection/reconnect state. The legacy encrypted-cache cleanup
runs as a non-blocking side effect, never gates rendering, and never contacts the server.

`BootGate` is outside app lock and auth routes because maintenance/native compatibility applies before
sign-in and reveals no private data. Ledger accent and notification registration mount only in the
authenticated `ready` branch; no push token is registered for suspended, deleting,
onboarding, signed-out, or locked sessions. Global switcher/sheets/snackbars live inside the ready branch;
the privacy cover and root fallback remain outside it.

The only supported sign-out path clears account image and in-memory query caches, removes the push token
best-effort while still authenticated, calls Convex sign-out, then clears session hints. An account
switch uses the same sequence. There is no pending-write disclosure because no durable queue exists.

## 2. BootGate inputs

`app.config` is a public, one-document query that projects only:

- platform minimum native build and latest marketing version;
- validated HTTPS store URL;
- maintenance boolean and optional localized message key.

It never projects `updatedByUserId`. The native marketing/build versions come from the direct
`expo-application` dependency:

```ts
Application.nativeApplicationVersion; // CFBundleShortVersionString / versionName
Application.nativeBuildVersion; // CFBundleVersion / versionCode, returned as string
```

`nativeBuildVersion` must parse as a positive base-10 safe integer. `latest*Version` is strict
`major.minor.patch` SemVer with no locale comparison. The ADMIN config mutation rejects an invalid URL,
version, minimum below zero, a latest version below the current release record, or a platform store URL
whose host is not the canonical Apple/Google store host. Production null/malformed native values fail the
release test and create a local `BOOT_CONFIG_INVALID` diagnostic; runtime fails open rather than bricking
an installed app.

`expo-application@~57.0.2` must be a direct dependency before BootGate implementation; relying on its
transitive presence through Auth/Notifications is forbidden.

## 3. Ordered gate state machine

BootGate starts `RESOLVING_CONFIG` while the native splash/safe skeleton follows the existing auth hint.
A live result is handled in this priority order:

1. **Maintenance.** Render a static, accessible maintenance screen with the translated
   `maintenanceMessageKey`, Retry, Status/Support, Terms, and Privacy. No auth or ledger route mounts and
   no private mutation starts. The message key must exist in all five catalogs before the config mutation accepts it.
2. **Hard native update.** When the current platform build is below `minSupported*Build`, render a
   non-dismissible screen with current/latest version, Open store, Support, Terms, and Privacy. A failed
   store open stays on the screen and exposes Copy link. OTA cannot satisfy a native-build minimum.
3. **Normal app.** Continue to AppLock/AuthGate. OTA and soft-version work are non-blocking overlays owned
   by this same state machine.

If no **live** config arrives within 1,500 ms, BootGate fails open to AppLock/AuthGate and the normal
offline chip. A cached config may prefill copy but may never enforce maintenance or a hard update; stale
blocking state could brick every user during a Convex outage. A later live result may enter maintenance or
hard-update only after closing private modals and covering app content. An already-running financial
mutation is allowed to finish; no new one starts.

## 4. OTA and soft store updates

Expo Updates keeps its default release-build launch check. BootGate does not duplicate that request while
`useUpdates().isStartupProcedureRunning` or `isChecking` is true. After normal app entry, it may check once
on foreground when `Updates.isEnabled`, at least 24 hours have elapsed since the device's last check, and
the build is not development/Expo Go. It never polls.

When a compatible OTA is available, download it. Reload immediately only after explicit user acceptance
and when there is no component draft, photo upload, destructive confirmation, or active export download.
Otherwise show “업데이트 준비됨” and apply on the next cold start. Update check,
download, or emergency-launch failure is scrubbed and non-blocking; the embedded/current bundle remains.

After OTA handling, compare `nativeApplicationVersion` with `latest*Version`. A lower version shows a
dismissible soft-update sheet at most once per exact `(platform, latestVersion)` every seven days. The
dismissal is a non-sensitive ordinary-MMKV key. A new latest version resets the cadence. Soft update never
appears over maintenance/hard update, app lock, onboarding, suspended/deletion, a financial form, or an
active write or destructive confirmation.

## 5. Visual and accessibility contract

Maintenance and hard-update screens use static assets bundled in the native binary, safe-area layout,
localized fallback copy, dark/light support, dynamic type/reflow, one initial header focus, and platform
44×44/48×48 minimum controls. Status is never color-only. Store/support actions have explicit accessible
names and failure announcements. No full-screen spinner remains beyond the 1,500 ms config window.

## 6. Acceptance

- Provider tests assert the exact order, one SafeArea provider, session-epoch cache remount, signed-out
  query skips, non-blocking legacy cleanup, and that notification providers mount only for `ready`.
- Boot tests cover both platforms at min−1/min/min+1; malformed/null build; maintenance priority; missing
  message key; invalid store URL; config success/error/timeout/late arrival; and account/app-lock stages.
- OTA tests cover disabled/dev mode, no update, download failure, emergency launch, safe immediate reload,
  dirty-form/upload deferral, next-cold-start apply, and no frequent polling.
- Soft update tests prove strict SemVer comparison and the exact-version seven-day dismissal key.
- Release tests prove `expo-application` is direct, the store URLs return HTTPS, and a production build
  reports the same native values as the submitted store binary.

## 7. Primary references checked 2026-08-24

- Expo [Application](https://docs.expo.dev/versions/latest/sdk/application/) and
  [app-version management](https://docs.expo.dev/build-reference/app-versions/) recommend native runtime
  values rather than manifest values.
- Expo [Updates](https://docs.expo.dev/versions/latest/sdk/updates/) documents default launch checks and
  the check → fetch → reload sequence; the APIs reject in development and should not be polled.
