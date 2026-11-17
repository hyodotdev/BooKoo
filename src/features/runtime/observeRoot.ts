import type {ComponentType} from 'react';
import {requireOptionalNativeModule} from 'expo';

/**
 * Wrap the root layout with EAS Observe when ExpoAppMetrics is linked.
 * A mismatched or half-installed native binary must not block boot with a
 * redbox on `import {ObserveRoot} from 'expo-observe'`.
 */
export function wrapWithObserveRoot<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
): ComponentType<P> {
  if (requireOptionalNativeModule('ExpoAppMetrics') == null) {
    return Component;
  }
  try {
    // Deferred so a missing native module cannot fail the route module graph.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {ObserveRoot} = require('expo-observe') as typeof import('expo-observe');
    return ObserveRoot.wrap(Component);
  } catch {
    return Component;
  }
}
