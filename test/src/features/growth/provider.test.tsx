import type {ReactElement, ReactNode} from 'react';
import {Text} from 'react-native';
import {render} from '@testing-library/react-native';

import {GrowthAnalyticsProvider} from '~/features/growth/provider';
import {layersAppId} from '~/features/growth/config';
import {trackPaywallShown} from '~/features/growth/events';

interface CapturedProps {
  config: Record<string, unknown>;
  expoRouter?: {usePathname: () => string};
  requestTracking?: boolean;
  enableDeepLinks?: boolean;
  trackRouteParams?: boolean;
}

let captured: CapturedProps | null = null;

const mockSdk = {setDeviceInfo: jest.fn(), track: jest.fn()};

jest.mock('@layers/expo', () => ({
  __esModule: true,
  LayersProvider: ({
    children,
    ...props
  }: CapturedProps & {children: ReactNode}) => {
    captured = props;
    return children;
  },
  useLayers: () => ({isReady: true, sdk: mockSdk}),
}));

jest.mock('~/features/growth/config', () => ({
  __esModule: true,
  layersAppId: jest.fn((): string | null => 'app_test'),
  layersEnvironment: (): string => 'production',
  isGrowthAnalyticsConfigured: (): boolean => true,
}));

const appId = layersAppId as jest.MockedFunction<typeof layersAppId>;

const mount = (): ReactElement => (
  <GrowthAnalyticsProvider>
    <Text>ledger</Text>
  </GrowthAnalyticsProvider>
);

describe('GrowthAnalyticsProvider', () => {
  afterEach(() => {
    captured = null;
    mockSdk.track.mockClear();
    appId.mockReturnValue('app_test');
  });

  it('routes funnel events to the SDK only while Layers is mounted', () => {
    const {unmount} = render(mount());
    trackPaywallShown('member_limit');
    expect(mockSdk.track).toHaveBeenCalledWith('paywall_show', {
      placement: 'member_limit',
    });

    unmount();
    mockSdk.track.mockClear();
    trackPaywallShown('member_limit');
    expect(mockSdk.track).not.toHaveBeenCalled();
  });

  it('renders children without mounting Layers when no app id is configured', () => {
    appId.mockReturnValue(null);
    const {getByText} = render(mount());
    expect(getByText('ledger')).toBeTruthy();
    expect(captured).toBeNull();
  });

  it('never lets a deep link reach Layers', () => {
    // BooKoo's App Link is https://bookoo.hyo.dev/invite/<token>, and that
    // token is the capability to join a shared ledger. The SDK's
    // deep_link_opened event carries `url` and every query param verbatim.
    render(mount());
    expect(captured?.config.autoTrackDeepLinks).toBe(false);
    expect(captured?.enableDeepLinks).toBe(false);
  });

  it('never ships uncaught error text to a third party', () => {
    render(mount());
    expect(captured?.config.autoTrackExceptions).toBe(false);
  });

  it('never prompts for tracking and never sends route params', () => {
    render(mount());
    expect(captured?.requestTracking).toBe(false);
    expect(captured?.trackRouteParams).toBe(false);
  });

  it('hands the SDK the route pattern, not the resolved path', () => {
    // The SDK sets `path: usePathname()` on every auto screen view, so the
    // real hook would send /ledger/<id> and /invite/<token>.
    render(mount());
    const usePathname = captured?.expoRouter?.usePathname;
    if (usePathname === undefined)
      throw new Error('expoRouter.usePathname was not passed to the SDK');

    let seen = 'unset';
    const Probe = (): ReactElement => {
      seen = usePathname();
      return <Text>probe</Text>;
    };
    render(<Probe />);

    // testSetup mocks useSegments() to [], so this is the root pattern.
    expect(seen).toBe('/');
  });
});
