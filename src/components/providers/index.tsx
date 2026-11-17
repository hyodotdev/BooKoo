import type {ReactElement} from 'react';
import {useEffect} from 'react';
import ErrorBoundary from 'react-native-error-boundary';
import {ActionSheetProvider} from '@expo/react-native-action-sheet';
import {CpkProvider, useCPK} from 'cpk-ui';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {ConvexAuthProvider, useConvexAuth} from '@convex-dev/auth/react';
import {ConvexQueryCacheProvider} from 'convex-helpers/react/cache';
import {useQuery} from 'convex/react';

import {theme} from '../../theme';
import {handleErrorConsole} from '../../utils/error';
import {api} from '@convex/_generated/api';
import {convexClient, secureAuthStorage} from '../../features/auth/client';
import {LocaleProvider} from '../../features/runtime/localeProvider';
import {AccessibilityPreferencesProvider} from '../../features/runtime/accessibility';
import {ConnectivityProvider} from '../../features/runtime/connectivity';
import {LegacySensitiveStorageCleanup} from '../../features/runtime/legacySensitiveStorageCleanup';
import {setNativeColorScheme} from '../../features/runtime/nativeAppearance';
import {BootGate} from '../../features/runtime/boot';
import {useColdStartUpdate} from '../../features/runtime/coldStartUpdate';
import {AppLockProvider} from '../../features/lock/provider';
import {SubscriptionProvider} from '../../features/subscription/provider';
import {GrowthAnalyticsProvider} from '../../features/growth/provider';
import {AppErrorFallback} from './AppErrorFallback';

export function CpkReadySplashBoundary({
  children,
}: {
  children: ReactElement;
}): ReactElement {
  // CpkProvider mounts its children only after its bundled fonts are ready.
  // Keep this boundary outside every auth/storage provider so their recovery
  // screens can never remain hidden behind the native splash.
  const updating = useColdStartUpdate();

  useEffect(() => {
    // Codemagic Patch never waits for an update before launching the bundle,
    // so without this gate a staged update first appears on the NEXT launch. Hold the splash across the bounded check instead; the timeout in
    // `coldStartUpdate` is what keeps a flaky network from hiding the recovery
    // screens below this boundary.
    if (!updating) void SplashScreen.hideAsync();
  }, [updating]);
  return children;
}

interface Props {
  initialThemeType?: 'light' | 'dark';
  children: ReactElement;
}

export function NativeRootBackground({
  children,
  nativeThemeType,
}: {
  children: ReactElement;
  nativeThemeType?: 'light' | 'dark';
}): ReactElement {
  const {theme: activeTheme} = useCPK();

  useEffect(() => {
    // Native Paywalls, pickers and alerts do not inherit CPK's React theme.
    // Reset the app-only override when the saved preference is System.
    void setNativeColorScheme(nativeThemeType).catch(handleErrorConsole);
  }, [nativeThemeType]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(activeTheme.bg.basic);
  }, [activeTheme.bg.basic]);

  return children;
}

function SessionCacheBoundary({
  children,
}: {
  children: ReactElement;
}): ReactElement {
  const {isAuthenticated} = useConvexAuth();
  const user = useQuery(
    api.user.queries.currentUser,
    isAuthenticated ? {} : 'skip',
  );
  // Keyed so one person's cached ledger data can never be read by the next
  // person on the device: the provider remounts, and the cache goes with it.
  //
  // Authenticated-but-unresolved deliberately keeps the signed-out key rather
  // than taking a 'settling' key of its own. That tier cost a second full
  // remount, and it landed exactly while the profile query was in flight —
  // signed-out -> settling -> userB instead of signed-out -> userB. Throwing
  // away an in-flight Convex subscription is not free: the client does not
  // re-invoke `onUpdate` for a query it is already subscribed to until the
  // result changes, so a re-subscribe during the socket pause for a new auth
  // token can sit at `undefined` indefinitely — which is the signed-out ->
  // sign-in-as-someone-else hang. Nothing leaks by holding this key: logout
  // already remounted and emptied it, and the real user key takes over the
  // moment the profile resolves.
  const sessionKey =
    isAuthenticated && user !== undefined && user !== null
      ? String(user.userId)
      : 'signed-out';
  return (
    <ConvexQueryCacheProvider
      key={sessionKey}
      expiration={300_000}
      maxIdleEntries={250}
    >
      <LocaleProvider>
        <AccessibilityPreferencesProvider>
          <ConnectivityProvider>
            <LegacySensitiveStorageCleanup />
            <BootGate>
              <AppLockProvider>
                <SubscriptionProvider>{children}</SubscriptionProvider>
              </AppLockProvider>
            </BootGate>
          </ConnectivityProvider>
        </AccessibilityPreferencesProvider>
      </LocaleProvider>
    </ConvexQueryCacheProvider>
  );
}

function RootProvider({initialThemeType, children}: Props): ReactElement {
  return (
    <CpkProvider
      themeConfig={{
        initialThemeType: initialThemeType ?? undefined,
        customTheme: theme,
      }}
    >
      <NativeRootBackground nativeThemeType={initialThemeType}>
        <CpkReadySplashBoundary>
          <ErrorBoundary
            FallbackComponent={AppErrorFallback}
            onError={handleErrorConsole}
          >
            <KeyboardProvider>
              <ActionSheetProvider>
                {/* Above Convex on purpose: attribution and screen views must
                    cover the signed-out funnel — install, onboarding, sign-in —
                    which is where every growth experiment is actually lost. */}
                <GrowthAnalyticsProvider>
                  <ConvexAuthProvider
                    client={convexClient}
                    storage={secureAuthStorage}
                  >
                    <SessionCacheBoundary>{children}</SessionCacheBoundary>
                  </ConvexAuthProvider>
                </GrowthAnalyticsProvider>
              </ActionSheetProvider>
            </KeyboardProvider>
          </ErrorBoundary>
        </CpkReadySplashBoundary>
      </NativeRootBackground>
    </CpkProvider>
  );
}

export default RootProvider;
