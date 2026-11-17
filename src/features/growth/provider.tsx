import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {useGlobalSearchParams, useSegments} from 'expo-router';
import {LayersProvider, useLayers} from '@layers/expo';

import {handleErrorConsole} from '~/utils/error';
import {layersAppId, layersEnvironment} from './config';
import {bindGrowthTracker} from './events';

/**
 * The expo-router pathname the SDK is allowed to see: the route **pattern**.
 *
 * `@layers/expo`'s `routeProperties` sets `path: pathname` on every
 * auto-captured screen view, and its own comment states that "`path` always
 * carries the resolved pathname". Handing over the real `usePathname` therefore
 * sends `/ledger/<id>` and `/invite/<token>` on every navigation.
 * `trackRouteParams={false}` does not prevent it — that flag only suppresses
 * the separate `param_*` properties.
 *
 * `useSegments()` returns the pattern segments (`['(app)','(tabs)','ledger',
 * '[id]']`), so rebuilding the path from them keeps both the screen name and
 * `path` to a bounded set of strings that name a screen and identify nobody.
 */
function usePatternPath(): string {
  // An empty segment list joins to '', so this is '/' at the root without a
  // special case — which is also the only shape expo-router's types allow.
  return `/${useSegments().join('/')}`;
}

/**
 * Drop the Google Advertising ID the SDK collects on its own.
 *
 * `initializeDeviceInfo()` calls `getGoogleAdvertisingId()` unconditionally on
 * Android and writes the result onto the device context as `idfa`, including
 * when the device has Limit Ad Tracking on — it keeps the id and only marks
 * `attStatus: 'denied'`. `requestTracking={false}` does not cover this; it only
 * suppresses the iOS ATT prompt.
 *
 * BooKoo does not want an advertising id for attribution, and reading one
 * before AdMob's UMP consent flow has run — which is what happens, because
 * Layers initialises far above `src/features/ads/provider.tsx` — would make the
 * consent gate the rest of the app honours meaningless.
 *
 * This is mitigation, not prevention: the id is read during init, so an event
 * flushed before this effect runs can still carry it. A complete fix needs the
 * SDK to offer a switch. Recorded in `docs/release/SHIPATON_2026.md`.
 */
function AdvertisingIdScrub(): null {
  const {sdk} = useLayers();

  useEffect(() => {
    if (sdk === null) return;

    try {
      sdk.setDeviceInfo({idfa: undefined});
    } catch (error) {
      handleErrorConsole(error);
    }
  }, [sdk]);

  return null;
}

/**
 * Give `./events` a way to reach the SDK, and take it back on unmount.
 */
function GrowthEventsBridge(): null {
  const {sdk} = useLayers();

  useEffect(() => {
    if (sdk === null) return;
    bindGrowthTracker((event, properties) => sdk.track(event, properties));

    return () => bindGrowthTracker(null);
  }, [sdk]);

  return null;
}

/**
 * Mount Layers for builds that were given an app id.
 *
 * Renders `children` untouched when none was configured, so a missing id costs
 * nothing but the measurement. That is true of the JavaScript only: the native
 * modules are autolinked into every binary regardless, which is why the SDK
 * cannot arrive as an OTA.
 *
 * Deliberate non-defaults, each one load-bearing:
 *
 * - `expoRouter.usePathname` is `usePatternPath`, so no resolved id reaches the
 *   `path` property. See that function.
 * - `autoTrackDeepLinks: false` — the SDK's listener fires `deep_link_opened`
 *   with `url`, `host`, `path` and every query parameter flattened into top
 *   level properties. BooKoo's App Link is `https://bookoo.hyo.dev/invite/
 *   <token>`, and that token is the capability to join a shared ledger.
 *   `enableDeepLinks={false}` turns off the provider's second, expo-linking
 *   listener for the same reason.
 * - `autoTrackExceptions: false` — the default installs a global error handler
 *   and ships `$exception` with message and stack to Layers. Uncaught errors
 *   here quote ledger ids and handles.
 * - `requestTracking={false}` — ATT is never prompted, and
 *   `expo-tracking-transparency` is not installed.
 *
 * This must render inside the expo-router tree: above it the router hooks
 * report `/` until the router mounts, and that would be recorded as a screen.
 * `app/_layout.tsx` is the root layout, so it is.
 */
export function GrowthAnalyticsProvider({
  children,
}: {
  children: ReactElement;
}): ReactElement {
  const appId = layersAppId();

  if (appId === null) return children;

  return (
    <LayersProvider
      config={{
        appId,
        environment: layersEnvironment(),
        autoTrackDeepLinks: false,
        autoTrackExceptions: false,
      }}
      expoRouter={{
        usePathname: usePatternPath,
        useGlobalSearchParams,
        useSegments,
      }}
      requestTracking={false}
      enableDeepLinks={false}
      trackRouteParams={false}
      onError={handleErrorConsole}
    >
      <AdvertisingIdScrub />
      <GrowthEventsBridge />
      {children}
    </LayersProvider>
  );
}
