import type {ReactElement} from 'react';

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => null),
}));

describe('wrapWithObserveRoot', () => {
  it('returns the component unchanged when ExpoAppMetrics is missing', () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {requireOptionalNativeModule} = require('expo') as {
      requireOptionalNativeModule: jest.Mock;
    };
    requireOptionalNativeModule.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {wrapWithObserveRoot} = require('~/features/runtime/observeRoot') as typeof import('~/features/runtime/observeRoot');
    const Root = (): ReactElement | null => null;
    expect(wrapWithObserveRoot(Root)).toBe(Root);
  });
});
