import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {AppState, Platform, StyleSheet, View} from 'react-native';
import {useQuery} from 'convex-helpers/react/cache';
import ErrorBoundary from 'react-native-error-boundary';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNetInfo} from '@react-native-community/netinfo';
import {useCPK} from 'cpk-ui';
import type {
  LevelPlayAdSize,
  LevelPlayBannerAdViewMethods,
  LevelPlayBannerAdViewListener,
} from 'unity-levelplay-mediation';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {isEntitlementActive} from '@shared/entitlements';
import {shouldShowFreeAd} from '@shared/ads';
import {useLedgerStore} from '~/features/ledger/store';
import {diagnostic} from '~/features/diagnostics/ring';
import {bannerUnitId} from './config';
import {levelPlayModule, type LevelPlayModule} from './native';
import {useAdRuntime} from './provider';
const RETRY_DELAY_MS = 3_000;
const MAX_RETRY_DELAY_MS = 30_000;
const LOAD_TIMEOUT_MS = 60_000;

interface BannerSlot {
  readonly height: number;
  readonly displayed: boolean;
}

const HIDDEN_BANNER: BannerSlot = {height: 0, displayed: false};

function controlBanner(
  banner: LevelPlayBannerAdViewMethods | null,
  action: 'pauseAutoRefresh' | 'resumeAutoRefresh' | 'destroy',
): void {
  try {
    banner?.[action]();
  } catch {
    // Optional native ad commands must never interrupt the ledger lifecycle.
  }
}

function AvailableNativeBanner({
  sdk,
  unitId,
  adSize,
}: {
  readonly sdk: LevelPlayModule;
  readonly unitId: string;
  readonly adSize: LevelPlayAdSize;
}): ReactElement {
  const [banner, setBanner] = useState<BannerSlot>(HIDDEN_BANNER);
  const bannerRef = useRef<LevelPlayBannerAdViewMethods>(null);
  const {isConnected, isInternetReachable} = useNetInfo();
  // Convex connection state is not internet reachability. Only a known
  // network outage pauses ads; an unresolved native network check does not.
  const connected = isConnected !== false && isInternetReachable !== false;
  const online = useRef(connected);
  const retryCount = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const nativeReady = useRef(false);
  const loading = useRef(false);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayed = useRef(false);
  const appState = useRef(AppState.currentState ?? 'active');

  const loadAd = useCallback((retry: () => void): boolean => {
    if (
      !mounted.current ||
      !nativeReady.current ||
      loading.current ||
      !online.current ||
      appState.current !== 'active'
    )
      return true;
    if (bannerRef.current === null) return false;
    loading.current = true;
    diagnostic({kind: 'ADS', outcome: 'LOAD_REQUESTED', code: null});
    displayed.current = false;
    setBanner(HIDDEN_BANNER);
    loadTimeout.current = setTimeout(() => {
      loadTimeout.current = null;
      loading.current = false;
      diagnostic({kind: 'ADS', outcome: 'LOAD_FAILED', code: null});
      retry();
    }, LOAD_TIMEOUT_MS);
    try {
      bannerRef.current.loadAd();
      return true;
    } catch {
      if (loadTimeout.current !== null) clearTimeout(loadTimeout.current);
      loadTimeout.current = null;
      loading.current = false;
      diagnostic({kind: 'ADS', outcome: 'LOAD_FAILED', code: null});
      return false;
    }
  }, []);

  const retryLoadAd = useCallback(
    function scheduleRetry(): void {
      if (
        !mounted.current ||
        !online.current ||
        retryTimeout.current !== null ||
        appState.current !== 'active'
      )
        return;
      const delay = Math.min(
        RETRY_DELAY_MS * 2 ** retryCount.current,
        MAX_RETRY_DELAY_MS,
      );
      retryTimeout.current = setTimeout(() => {
        retryTimeout.current = null;
        retryCount.current += 1;
        if (!loadAd(scheduleRetry)) scheduleRetry();
      }, delay);
    },
    [loadAd],
  );

  const listener = useMemo<LevelPlayBannerAdViewListener>(() => {
    const resetRetry = (): void => {
      if (!mounted.current) return;
      loading.current = false;
      if (loadTimeout.current !== null) clearTimeout(loadTimeout.current);
      loadTimeout.current = null;
      if (retryTimeout.current !== null) clearTimeout(retryTimeout.current);
      retryTimeout.current = null;
      retryCount.current = 0;
    };
    const failed = (): void => {
      if (!mounted.current) return;
      loading.current = false;
      if (loadTimeout.current !== null) clearTimeout(loadTimeout.current);
      loadTimeout.current = null;
      displayed.current = false;
      setBanner(HIDDEN_BANNER);
      retryLoadAd();
    };
    return {
      // Loading is not evidence that the creative is displayed. Keep the
      // native view mounted at its real size, but reserve no layout height
      // until the SDK confirms display.
      onAdLoaded: () => {
        if (!mounted.current) return;
        diagnostic({kind: 'ADS', outcome: 'LOADED', code: null});
        resetRetry();
      },
      onAdDisplayed: (info) => {
        if (!mounted.current) return;
        diagnostic({kind: 'ADS', outcome: 'DISPLAYED', code: null});
        resetRetry();
        displayed.current = true;
        setBanner({
          height: Math.ceil(info.adSize?.height ?? adSize.height),
          displayed: true,
        });
      },
      onAdLoadFailed: (error) => {
        if (!mounted.current) return;
        diagnostic({
          kind: 'ADS',
          outcome: 'LOAD_FAILED',
          code: error.errorCode,
        });
        failed();
      },
      onAdDisplayFailed: (_info, error) => {
        if (!mounted.current) return;
        diagnostic({
          kind: 'ADS',
          outcome: 'DISPLAY_FAILED',
          code: error.errorCode,
        });
        failed();
      },
    };
  }, [adSize.height, retryLoadAd]);

  useEffect(() => {
    mounted.current = true;
    const nativeBanner = bannerRef.current;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returning = appState.current !== 'active' && nextState === 'active';
      appState.current = nextState;
      if (returning) {
        if (!online.current) return;
        controlBanner(nativeBanner, 'resumeAutoRefresh');
        if (!displayed.current && !loadAd(retryLoadAd)) retryLoadAd();
      } else if (nextState !== 'active') {
        controlBanner(nativeBanner, 'pauseAutoRefresh');
        if (retryTimeout.current !== null) clearTimeout(retryTimeout.current);
        retryTimeout.current = null;
      }
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      if (retryTimeout.current !== null) clearTimeout(retryTimeout.current);
      if (loadTimeout.current !== null) clearTimeout(loadTimeout.current);
      controlBanner(nativeBanner, 'destroy');
    };
  }, [loadAd, retryLoadAd]);

  useEffect(() => {
    const wasConnected = online.current;
    online.current = connected;
    if (!connected) {
      controlBanner(bannerRef.current, 'pauseAutoRefresh');
      if (retryTimeout.current !== null) clearTimeout(retryTimeout.current);
      retryTimeout.current = null;
      return;
    }
    if (!wasConnected && appState.current === 'active') {
      controlBanner(bannerRef.current, 'resumeAutoRefresh');
      if (!displayed.current && !loadAd(retryLoadAd)) retryLoadAd();
    }
  }, [connected, loadAd, retryLoadAd]);

  const {LevelPlayBannerAdView} = sdk;
  return (
    <View
      pointerEvents={banner.displayed ? 'auto' : 'none'}
      style={[
        styles.container,
        banner.displayed
          ? [styles.displayed, {height: banner.height}]
          : styles.unloaded,
      ]}
      testID="free-tier-banner-ad"
    >
      <LevelPlayBannerAdView
        ref={bannerRef}
        adUnitId={unitId}
        adSize={adSize}
        placementName={null}
        listener={listener}
        onLayout={() => {
          // Native creation parameters must be applied before its first load.
          // Further layout passes (including display) must not request again.
          if (nativeReady.current) return;
          nativeReady.current = true;
          if (!loadAd(retryLoadAd)) retryLoadAd();
        }}
        style={{width: adSize.width, height: adSize.height}}
      />
    </View>
  );
}

function NativeBanner({
  unitId,
}: {
  readonly unitId: string;
}): ReactElement | null {
  const [slotWidth, setSlotWidth] = useState(0);
  const [adSize, setAdSize] = useState<LevelPlayAdSize | null>(null);
  const sdk = levelPlayModule();

  useEffect(() => {
    if (sdk === null || slotWidth < sdk.LevelPlayAdSize.BANNER.width) return;
    // A fitting creative survives rotation/split-view changes. Recreating it
    // for every width measurement discards filled inventory unnecessarily.
    if (adSize !== null && adSize.width <= slotWidth) return;
    let cancelled = false;
    // SDK 9.3.0's explicit-width iOS bridge can crash. Its default adaptive
    // size is safe; use the standard banner if it exceeds a split-view slot.
    const resolveSize =
      Platform.OS === 'ios'
        ? sdk.LevelPlayAdSize.createAdaptiveAdSize()
        : sdk.LevelPlayAdSize.createAdaptiveAdSize(slotWidth);
    const applySize = (candidate: LevelPlayAdSize | null): void => {
      if (cancelled) return;
      const size =
        candidate !== null && candidate.width <= slotWidth
          ? candidate
          : sdk.LevelPlayAdSize.BANNER;
      setAdSize(size);
    };
    void resolveSize.then(applySize).catch(() => applySize(null));
    return () => {
      cancelled = true;
    };
  }, [adSize, sdk, slotWidth]);

  if (sdk === null) return null;
  return (
    <View
      onLayout={({nativeEvent}) =>
        setSlotWidth(Math.max(0, Math.floor(nativeEvent.layout.width)))
      }
      style={styles.footer}
      testID="free-tier-banner-slot"
    >
      {adSize !== null &&
      adSize.width <= slotWidth &&
      slotWidth >= sdk.LevelPlayAdSize.BANNER.width ? (
        <AvailableNativeBanner
          key={`${adSize.width}:${adSize.height}`}
          sdk={sdk}
          adSize={adSize}
          unitId={unitId}
        />
      ) : null}
    </View>
  );
}

function BannerInner({
  ledgerId,
}: {
  readonly ledgerId: Id<'ledgers'>;
}): ReactElement | null {
  const runtime = useAdRuntime();
  const entitlement = useQuery(api.subscriptions.queries.forLedger, {ledgerId});
  const [now] = useState(Date.now);
  const unitId = bannerUnitId();
  const ledgerPro =
    entitlement === undefined
      ? undefined
      : isEntitlementActive(entitlement, now);
  const visible = shouldShowFreeAd({
    adsReady: runtime.ready,
    ledgerPro,
    viewerPro: runtime.viewerHasPro,
    viewerSubscriptionLoading: runtime.viewerSubscriptionLoading,
  });

  if (!visible || unitId === null) return null;

  return <NativeBanner key={ledgerId} unitId={unitId} />;
}

export function FreeBannerAd({
  ledgerId,
}: {
  readonly ledgerId: Id<'ledgers'>;
}): ReactElement {
  return (
    <ErrorBoundary FallbackComponent={() => null}>
      <BannerInner ledgerId={ledgerId} />
    </ErrorBoundary>
  );
}

/**
 * Martie-compatible tab footer: the banner sits after the navigator, while
 * this footer alone owns the bottom safe area. Non-displayed and Pro banners
 * leave no empty ad slot.
 */
export function FreeTabBannerFooter({
  hidden = false,
}: {
  readonly hidden?: boolean;
}): ReactElement {
  const {bottom} = useSafeAreaInsets();
  const {theme} = useCPK();
  const activeLedgerId = useLedgerStore((state) => state.activeLedgerId);
  if (hidden) return <View testID="free-tier-tab-banner-footer" />;

  return (
    <View
      style={[styles.footer, {backgroundColor: theme.bg.chrome}]}
      testID="free-tier-tab-banner-footer"
    >
      {activeLedgerId === null ? null : (
        <FreeBannerAd ledgerId={activeLedgerId as Id<'ledgers'>} />
      )}
      <View style={{height: bottom}} testID="tab-banner-safe-area" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  footer: {width: '100%'},
  displayed: {opacity: 1},
  unloaded: {height: 0, opacity: 0},
});
