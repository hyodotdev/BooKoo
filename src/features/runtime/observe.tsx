import {useEffect} from 'react';
import Constants from 'expo-constants';
import {requireOptionalNativeModule} from 'expo';

import type {SessionStage} from '~/features/auth/session';

/**
 * EAS Observe is intentionally limited to anonymous performance telemetry.
 * Product events, user attributes and router parameters are not enabled: route
 * parameters can contain ledger, item, invitation and account identifiers.
 *
 * Debug builds never dispatch. A deterministic per-installation sample keeps
 * the production signal useful without collecting every installation.
 *
 * Native Observe depends on ExpoAppMetrics. When that module is absent (stale
 * binary, mid-install), skip configure/markInteractive instead of crashing boot.
 */
export const OBSERVE_SAMPLE_RATE = 0.25;
type ObserveEnvironment = 'development' | 'preview' | 'production';

const configuredStage: unknown = Constants.expoConfig?.extra?.stage;
export const OBSERVE_ENVIRONMENT: ObserveEnvironment =
  configuredStage === 'preview' || configuredStage === 'production'
    ? configuredStage
    : 'development';

type ObserveApi = {
  configure: (options: Record<string, unknown>) => void;
  markInteractive: () => void;
};

function loadObserve(): ObserveApi | null {
  if (requireOptionalNativeModule('ExpoAppMetrics') == null) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-observe') as typeof import('expo-observe')).Observe;
  } catch {
    return null;
  }
}

const Observe = loadObserve();
if (Observe) {
  Observe.configure({
    dispatchingEnabled: OBSERVE_ENVIRONMENT !== 'development',
    dispatchInDebug: false,
    environment: OBSERVE_ENVIRONMENT,
    integrations: {},
    sampleRate: OBSERVE_SAMPLE_RATE,
  });
}

const isInteractiveStage = (stage: SessionStage): boolean =>
  stage !== 'loading' && stage !== 'profile-missing';

/** Marks TTI after authentication and the initial profile mirror have settled. */
export function useObserveReadiness(stage: SessionStage): void {
  useEffect(() => {
    if (Observe && isInteractiveStage(stage)) Observe.markInteractive();
  }, [stage]);
}
