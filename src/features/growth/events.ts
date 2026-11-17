import type {PaywallPlacement} from '@shared/entitlements';
import {handleErrorConsole} from '~/utils/error';

/**
 * Optional paywall exposure hook. RootProvider includes GrowthAnalyticsProvider;
 * a configured Layers app id mounts its SDK and binds this tracker. Without an
 * app id these calls are no-ops. The SDK's route tracking is documented there.
 *
 * The RevenueCat conversion bridge and its start_trial/subscribe funnel are
 * retired. This hook cannot measure purchase conversion; approved IAPKit/store
 * aggregates are the operational source when available. Do not infer zero
 * conversions from absent events or silently enable new analytics.
 *
 * An explicitly bound tracker receives only a closed placement identifier;
 * no purchase, receipt, account or ledger data is passed to it.
 */

type EventProperties = Record<string, string | number>;
type Tracker = (event: string, properties: EventProperties) => void;

let tracker: Tracker | null = null;

export function bindGrowthTracker(next: Tracker | null): void {
  tracker = next;
}

function send(event: string, properties: EventProperties): void {
  if (tracker === null) return;
  try {
    tracker(event, properties);
  } catch (error) {
    handleErrorConsole(error);
  }
}

export function trackPaywallShown(placement: PaywallPlacement): void {
  send('paywall_show', {placement});
}
