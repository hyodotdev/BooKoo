# Native appearance adapter

This Android-only local Expo module extends the app's saved theme to native
activities that do not use AppCompat, including RevenueCat's Compose Paywall.
It contains no UI, purchase logic, credentials or global device settings.

React Native 0.86.3's `Appearance.setColorScheme` changes AppCompat's default,
but RevenueCat Android 10.19.1 launches a separate `ComponentActivity`.
On Android 12+ we additionally call `UiModeManager.setApplicationNightMode`.
`MODE_NIGHT_AUTO` clears the package night qualifier for System: see
[Android's implementation](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/services/core/java/com/android/server/UiModeManagerService.java)
and [the platform guide](https://developer.android.com/develop/ui/views/theming/darktheme).
Never substitute the system-wide `setNightMode` method.

Expo autolinks this directory from `modules/`. Native changes require a local
Android rebuild, not an OTA-only update. iOS/web keep React Native's existing
appearance API. Android API 24–30 retains AppCompat's existing behavior; native
Paywall theme parity on those versions still requires separate device evidence.

Verification: `nativeAppearance.test.ts`, provider appearance tests, native
build, and physical Dark → Paywall → Light/System replay with inspected
screenshots. A mocked call alone is not a native visual PASS.
