import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import {AppState} from 'react-native';

import {useSubscription} from '~/features/subscription/provider';
import {diagnostic} from '~/features/diagnostics/ring';
import {isAdRuntimeConfigured} from './config';
import {googleConsentModule, initializeAdRuntime} from './native';

interface AdRuntimeState {
  readonly ready: boolean;
  readonly privacyOptionsRequired: boolean;
  readonly showPrivacyOptions: () => Promise<void>;
  readonly viewerHasPro: boolean;
  readonly viewerSubscriptionLoading: boolean;
}

const INERT_STATE: AdRuntimeState = {
  ready: false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => undefined,
  viewerHasPro: false,
  viewerSubscriptionLoading: true,
};

const AdRuntimeContext = createContext<AdRuntimeState>(INERT_STATE);

/**
 * Consent-first ad lifecycle. Failures always degrade to no ads, never to a
 * broken ledger or a consent bypass.
 */
export function AdRuntimeProvider({children}: PropsWithChildren): ReactElement {
  const subscription = useSubscription();
  const [initialized, setInitialized] = useState(false);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (
      !subscription.isStatusAvailable ||
      subscription.isLoading ||
      subscription.isActive ||
      !isAdRuntimeConfigured()
    )
      return;

    const ads = googleConsentModule();
    if (ads === null) return;

    const current = ++generation.current;
    let busy = false;
    let retryOnForeground = false;
    const start = async (): Promise<void> => {
      if (busy || generation.current !== current) return;
      busy = true;
      retryOnForeground = false;
      try {
        const consent = await ads.AdsConsent.gatherConsent();
        if (generation.current !== current) return;
        setPrivacyOptionsRequired(
          consent.privacyOptionsRequirementStatus ===
            ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
        );
        if (!consent.canRequestAds) return;
        await initializeAdRuntime();
        if (generation.current === current) setInitialized(true);
      } catch {
        if (generation.current === current) {
          diagnostic({kind: 'ADS', outcome: 'START_FAILED', code: null});
          setInitialized(false);
          retryOnForeground = true;
        }
      } finally {
        busy = false;
      }
    };
    void start();
    const listener = AppState.addEventListener('change', (state) => {
      // A transient consent/network/init error must not disable ads for the
      // whole session. Retry once per foreground, never loop a consent form.
      if (state === 'active' && retryOnForeground) void start();
    });

    return () => {
      generation.current += 1;
      listener.remove();
    };
  }, [
    subscription.isActive,
    subscription.isLoading,
    subscription.isStatusAvailable,
  ]);

  const showPrivacyOptions = useCallback(async (): Promise<void> => {
    const ads = googleConsentModule();
    if (ads === null) return;

    // Tear down the current creative/refresh loop while consent can change.
    const current = ++generation.current;
    setInitialized(false);
    try {
      const consent = await ads.AdsConsent.showPrivacyOptionsForm();
      if (generation.current !== current) return;
      setPrivacyOptionsRequired(
        consent.privacyOptionsRequirementStatus ===
          ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      );
      if (!consent.canRequestAds) {
        setInitialized(false);
        return;
      }
      await initializeAdRuntime();
      if (generation.current === current) setInitialized(true);
    } catch {
      // Fail closed; the user can retry without losing any ledger data.
    }
  }, []);

  const value = useMemo<AdRuntimeState>(
    () => ({
      ready:
        initialized &&
        !subscription.isActive &&
        !subscription.isLoading &&
        subscription.isStatusAvailable &&
        isAdRuntimeConfigured(),
      privacyOptionsRequired,
      showPrivacyOptions,
      viewerHasPro: subscription.isActive,
      viewerSubscriptionLoading:
        subscription.isLoading || !subscription.isStatusAvailable,
    }),
    [
      privacyOptionsRequired,
      initialized,
      showPrivacyOptions,
      subscription.isActive,
      subscription.isLoading,
      subscription.isStatusAvailable,
    ],
  );

  return (
    <AdRuntimeContext.Provider value={value}>
      {children}
    </AdRuntimeContext.Provider>
  );
}

export function useAdRuntime(): AdRuntimeState {
  return useContext(AdRuntimeContext);
}
