import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {Platform, StyleSheet, type AppStateStatus} from 'react-native';
import {useQuery} from 'convex/react';

import type {Id} from '@convex/_generated/dataModel';
import {
  FreeBannerAd,
  FreeTabBannerFooter,
} from '../../../../src/features/ads/banner';
import {useAdRuntime} from '../../../../src/features/ads/provider';
import {useLedgerStore} from '../../../../src/features/ledger/store';
import {
  clearDiagnostics,
  diagnosticSnapshot,
} from '~/features/diagnostics/ring';

const mockLoad = jest.fn();
let mockConnected = true;
let mockInternetReachable: boolean | null = true;
const mockDestroy = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockRemove = jest.fn();
let mockAppStateChange: ((state: AppStateStatus) => void) | undefined;
const mockAdaptiveSize = jest.fn(async (width?: number) => ({
  width: width ?? 390,
  height: 50,
}));

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    currentState: 'active',
    addEventListener: (
      _event: string,
      listener: (state: AppStateStatus) => void,
    ) => {
      mockAppStateChange = listener;
      return {remove: mockRemove};
    },
  },
}));
jest.mock('~/features/ads/config', () => ({
  bannerUnitId: () => 'bookoo-banner',
  adAppKey: () => 'bookoo-app',
  isAdDebugEnabled: () => true,
}));
jest.mock('unity-levelplay-mediation', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LevelPlayAdSize: {
      BANNER: {width: 320, height: 50},
      createAdaptiveAdSize: (width?: number) => mockAdaptiveSize(width),
    },
    LevelPlayBannerAdView: React.forwardRef(function MockBannerAd(
      props: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        loadAd: mockLoad,
        destroy: mockDestroy,
        pauseAutoRefresh: mockPause,
        resumeAutoRefresh: mockResume,
      }));
      return React.createElement(ReactNative.View, {
        ...props,
        testID: 'mock-banner-ad',
      });
    }),
  };
});
jest.mock('../../../../src/features/ads/provider', () => ({
  useAdRuntime: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({
    isConnected: mockConnected,
    isInternetReachable: mockInternetReachable,
  }),
}));
jest.mock('cpk-ui', () => ({
  useCPK: () => ({theme: {bg: {chrome: 'footer-background'}}}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 24, left: 0, right: 0}),
}));

const mockUseQuery = jest.mocked(useQuery);
const mockUseAdRuntime = jest.mocked(useAdRuntime);
const ledgerId = 'ledger-1' as Id<'ledgers'>;

function measure(
  screen: ReturnType<typeof render>,
  width: number,
  height = 0,
): void {
  fireEvent(screen.getByTestId('free-tier-banner-slot'), 'layout', {
    nativeEvent: {layout: {width, height, x: 0, y: 0}},
  });
}
async function mount(width = 500): Promise<ReturnType<typeof render>> {
  const screen = render(<FreeBannerAd ledgerId={ledgerId} />);
  measure(screen, width);
  await waitFor(() =>
    expect(screen.getByTestId('mock-banner-ad')).toBeTruthy(),
  );
  fireEvent(screen.getByTestId('mock-banner-ad'), 'layout');
  return screen;
}

describe('FreeBannerAd with LevelPlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoad.mockReset();
    mockConnected = true;
    mockInternetReachable = true;
    clearDiagnostics();
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
    useLedgerStore.setState({activeLedgerId: ledgerId});
    mockAdaptiveSize.mockImplementation(async (width?: number) => ({
      width: width ?? 390,
      height: 50,
    }));
    mockUseAdRuntime.mockReturnValue({
      ready: true,
      privacyOptionsRequired: false,
      showPrivacyOptions: async () => undefined,
      viewerHasPro: false,
      viewerSubscriptionLoading: false,
    });
    mockUseQuery.mockReturnValue({
      status: 'NONE',
      viewerIsOwner: true,
      grandfathered: false,
      freeMemberLimit: 8,
      freeSharedLedgerLimit: 1,
      memberCount: 1,
    } as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits for native layout and ignores later layout passes', async () => {
    const screen = render(<FreeBannerAd ledgerId={ledgerId} />);
    measure(screen, 500);
    await waitFor(() =>
      expect(screen.getByTestId('mock-banner-ad')).toBeTruthy(),
    );
    expect(mockLoad).not.toHaveBeenCalled();
    const banner = screen.getByTestId('mock-banner-ad');
    fireEvent(banner, 'layout');
    fireEvent(banner, 'layout');
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('recovers a load that never returns a native callback', async () => {
    const screen = await mount();
    act(() => jest.advanceTimersByTime(60_000));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(3_000));
    expect(mockLoad).toHaveBeenCalledTimes(2);
    screen.unmount();
    act(() => jest.runOnlyPendingTimers());
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate an in-flight load after a quick background return', async () => {
    await mount();
    act(() => mockAppStateChange?.('background'));
    act(() => mockAppStateChange?.('active'));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('waits for connectivity before its first load and requests once on reconnection', async () => {
    mockConnected = false;
    const screen = await mount();
    expect(mockLoad).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(90_000));
    expect(mockLoad).not.toHaveBeenCalled();
    mockConnected = true;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('waits when a connected network has no internet access', async () => {
    mockInternetReachable = false;
    const screen = await mount();
    expect(mockLoad).not.toHaveBeenCalled();
    mockInternetReachable = true;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('allows the SDK to load while internet reachability is still unknown', async () => {
    mockInternetReachable = null;
    await mount();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('cancels failed-load retries offline and recovers immediately when connected', async () => {
    const screen = await mount();
    const banner = screen.getByTestId('mock-banner-ad');
    act(() => banner.props.listener.onAdLoadFailed({errorCode: 509}));
    mockConnected = false;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    act(() => jest.advanceTimersByTime(90_000));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    mockConnected = true;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(screen.getByTestId('mock-banner-ad')).toBe(banner);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('pauses refresh offline while retaining an already displayed creative', async () => {
    const screen = await mount();
    const banner = screen.getByTestId('mock-banner-ad');
    act(() => banner.props.listener.onAdDisplayed({adSize: {height: 50}}));
    mockConnected = false;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(50);
    mockConnected = true;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('waits for foreground before retrying a background network recovery', async () => {
    const screen = await mount();
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdLoadFailed({
        errorCode: 509,
      }),
    );
    mockConnected = false;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    act(() => mockAppStateChange?.('background'));
    mockConnected = true;
    screen.rerender(<FreeBannerAd ledgerId={ledgerId} />);
    expect(mockResume).not.toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    act(() => mockAppStateChange?.('active'));
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('recovers from a synchronous native load failure with capped backoff', async () => {
    mockLoad.mockImplementation(() => {
      throw new Error('native command unavailable');
    });
    const screen = await mount();
    for (const delay of [3_000, 6_000, 12_000, 24_000, 30_000, 30_000]) {
      const previous = mockLoad.mock.calls.length;
      act(() => jest.advanceTimersByTime(delay - 1));
      expect(mockLoad).toHaveBeenCalledTimes(previous);
      act(() => jest.advanceTimersByTime(1));
      expect(mockLoad).toHaveBeenCalledTimes(previous + 1);
    }
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(0);
    screen.unmount();
    act(() => jest.runOnlyPendingTimers());
    expect(mockLoad).toHaveBeenCalledTimes(7);
  });

  it('keeps a loaded but non-displayed creative collapsed', async () => {
    const screen = await mount();
    const container = screen.getByTestId('free-tier-banner-ad');
    const banner = screen.getByTestId('mock-banner-ad');
    expect(StyleSheet.flatten(container.props.style)).toMatchObject({
      height: 0,
      opacity: 0,
    });
    expect(container.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(banner.props.style)).toEqual({
      width: 390,
      height: 50,
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    act(() =>
      banner.props.listener.onAdLoaded({adSize: {height: 50, width: 390}}),
    );
    expect(StyleSheet.flatten(container.props.style)).toMatchObject({
      height: 0,
      opacity: 0,
    });
    expect(container.props.pointerEvents).toBe('none');
  });

  it('reveals only a displayed creative at its reported height', async () => {
    const screen = await mount();
    const container = screen.getByTestId('free-tier-banner-ad');
    const banner = screen.getByTestId('mock-banner-ad');
    act(() =>
      banner.props.listener.onAdLoaded({adSize: {height: 50, width: 390}}),
    );
    act(() =>
      banner.props.listener.onAdDisplayed({adSize: {height: 50, width: 390}}),
    );
    expect(StyleSheet.flatten(container.props.style)).toMatchObject({
      height: 50,
      opacity: 1,
    });
    expect(container.props.pointerEvents).toBe('auto');
    expect(banner.props.adUnitId).toBe('bookoo-banner');
  });

  it('retries load failures without unmounting the native creative', async () => {
    const screen = await mount();
    const banner = screen.getByTestId('mock-banner-ad');
    act(() => {
      banner.props.listener.onAdLoadFailed({errorCode: 509});
      jest.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('mock-banner-ad')).toBe(banner);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('records only failure phase and numeric code in bounded local diagnostics', async () => {
    const screen = await mount();
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdLoadFailed({
        errorCode: 606,
        errorMessage: 'private provider response',
        adUnitId: 'private unit',
      }),
    );
    expect(diagnosticSnapshot().map((row) => row.event)).toEqual([
      {kind: 'ADS', outcome: 'LOAD_REQUESTED', code: null},
      {kind: 'ADS', outcome: 'LOAD_FAILED', code: 606},
    ]);
  });

  it('collapses a display failure and retries it', async () => {
    const screen = await mount();
    const banner = screen.getByTestId('mock-banner-ad');
    act(() =>
      banner.props.listener.onAdLoaded({adSize: {height: 50, width: 390}}),
    );
    act(() =>
      banner.props.listener.onAdDisplayed({adSize: {height: 50, width: 390}}),
    );
    act(() => banner.props.listener.onAdDisplayFailed({}, {errorCode: 1}));
    expect(screen.getByTestId('free-tier-banner-ad').props.pointerEvents).toBe(
      'none',
    );
    act(() => jest.advanceTimersByTime(3_000));
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it.each(['ios', 'android'] as const)(
    'keeps the %s footer collapsed through load, failure and retry until display',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      const screen = render(<FreeTabBannerFooter />);
      measure(screen, 500);
      await waitFor(() =>
        expect(screen.getByTestId('mock-banner-ad')).toBeTruthy(),
      );
      fireEvent(screen.getByTestId('mock-banner-ad'), 'layout');
      const container = screen.getByTestId('free-tier-banner-ad');
      const native = screen.getByTestId('mock-banner-ad');
      const safeArea = screen.getByTestId('tab-banner-safe-area');
      act(() => native.props.listener.onAdLoaded({adSize: {height: 50}}));
      expect(StyleSheet.flatten(container.props.style).height).toBe(0);
      expect(screen.getAllByTestId('tab-banner-safe-area')).toHaveLength(1);
      expect(safeArea.props.style.height).toBe(24);
      act(() => native.props.listener.onAdLoadFailed({errorCode: 509}));
      act(() => jest.advanceTimersByTime(3_000));
      act(() => native.props.listener.onAdLoaded({adSize: {height: 50}}));
      expect(StyleSheet.flatten(container.props.style).height).toBe(0);
      expect(screen.getByTestId('mock-banner-ad')).toBe(native);
      act(() => native.props.listener.onAdDisplayed({adSize: {height: 60.5}}));
      expect(StyleSheet.flatten(container.props.style).height).toBe(61);
      expect(container.props.pointerEvents).toBe('auto');
      act(() => native.props.listener.onAdDisplayFailed({}, {errorCode: 1}));
      expect(StyleSheet.flatten(container.props.style).height).toBe(0);
      expect(safeArea.props.style.height).toBe(24);
    },
  );

  it('retains the displayed creative while an automatic refresh is loading', async () => {
    const screen = await mount();
    const native = screen.getByTestId('mock-banner-ad');
    act(() => native.props.listener.onAdDisplayed({adSize: {height: 50}}));
    act(() => native.props.listener.onAdLoaded({adSize: {height: 90}}));
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(50);
    act(() => native.props.listener.onAdDisplayed({adSize: {height: 90}}));
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(90);
  });

  it('cancels a pending retry when the SDK recovers display', async () => {
    const screen = await mount();
    const native = screen.getByTestId('mock-banner-ad');
    act(() => native.props.listener.onAdDisplayFailed({}, {errorCode: 1}));
    act(() => native.props.listener.onAdDisplayed({adSize: {height: 50}}));
    act(() => jest.advanceTimersByTime(30_000));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(50);
  });

  it('uses the resolved native size when display info omits the ad size', async () => {
    const screen = await mount();
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdDisplayed({
        adSize: null,
      }),
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(50);
  });

  it('does not attach impression or revenue tracking', async () => {
    const screen = await mount();
    expect(
      screen.getByTestId('mock-banner-ad').props.impressionDataListener,
    ).toBeUndefined();
  });

  it('preserves a fitting Android creative and replaces only an oversized one', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const screen = await mount(500.75);
    expect(mockAdaptiveSize).toHaveBeenLastCalledWith(500);
    const original = screen.getByTestId('mock-banner-ad');
    measure(screen, 500.75, 50);
    expect(screen.getByTestId('mock-banner-ad')).toBe(original);
    measure(screen, 800);
    expect(screen.getByTestId('mock-banner-ad')).toBe(original);
    expect(mockAdaptiveSize).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    measure(screen, 400);
    await waitFor(() => expect(mockAdaptiveSize).toHaveBeenLastCalledWith(400));
    await waitFor(() =>
      expect(screen.getByTestId('mock-banner-ad')).not.toBe(original),
    );
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('never sends explicit adaptive width across the incompatible iOS bridge', async () => {
    const screen = await mount(1024);
    expect(mockAdaptiveSize).toHaveBeenCalledWith(undefined);
    measure(screen, 768);
    expect(mockAdaptiveSize).toHaveBeenCalledTimes(1);
    measure(screen, 360);
    await waitFor(() => expect(mockAdaptiveSize).toHaveBeenCalledTimes(2));
    expect(
      mockAdaptiveSize.mock.calls.every(([width]) => width === undefined),
    ).toBe(true);
  });

  it('fits a split-view iOS slot instead of clipping an oversized native banner', async () => {
    mockAdaptiveSize.mockResolvedValue({width: 1024, height: 90});
    const screen = await mount(500);
    expect(screen.getByTestId('mock-banner-ad').props.adSize).toEqual({
      width: 320,
      height: 50,
    });
  });

  it('does not request an ad when the slot cannot fit a standard banner', () => {
    const screen = render(<FreeBannerAd ledgerId={ledgerId} />);
    measure(screen, 250);
    expect(mockAdaptiveSize).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('pauses refresh and cancels retries in background, then recovers on return', async () => {
    const screen = await mount();
    act(() =>
      screen
        .getByTestId('mock-banner-ad')
        .props.listener.onAdLoadFailed({errorCode: 509}),
    );
    act(() => mockAppStateChange?.('background'));
    act(() => jest.advanceTimersByTime(30_000));
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    act(() => mockAppStateChange?.('active'));
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('reloads a loaded but non-displayed creative when returning to foreground', async () => {
    const screen = await mount();
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdLoaded({
        adSize: {height: 50},
      }),
    );
    act(() => mockAppStateChange?.('background'));
    act(() => mockAppStateChange?.('active'));
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(0);
  });

  it('resumes a displayed creative without reloading it on foreground return', async () => {
    const screen = await mount();
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdDisplayed({
        adSize: {height: 50},
      }),
    );
    act(() => mockAppStateChange?.('background'));
    act(() => mockAppStateChange?.('active'));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(screen.getByTestId('free-tier-banner-ad').props.style)
        .height,
    ).toBe(50);
  });

  it('destroys native state and rejects late callbacks after unmount', async () => {
    const screen = await mount();
    const listener = screen.getByTestId('mock-banner-ad').props.listener;
    screen.unmount();
    act(() => listener.onAdLoadFailed({errorCode: 509}));
    act(() => listener.onAdLoaded({adSize: {height: 50}}));
    act(() => listener.onAdDisplayed({adSize: {height: 50}}));
    act(() => jest.runOnlyPendingTimers());
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('keeps ledger lifecycle usable if the optional native ad view is stale', async () => {
    const screen = await mount();
    mockPause.mockImplementationOnce(() => {
      throw new Error('native view already removed');
    });
    mockResume.mockImplementationOnce(() => {
      throw new Error('native view already removed');
    });
    mockDestroy.mockImplementationOnce(() => {
      throw new Error('native view already removed');
    });
    expect(() => act(() => mockAppStateChange?.('background'))).not.toThrow();
    expect(() => act(() => mockAppStateChange?.('active'))).not.toThrow();
    expect(() => screen.unmount()).not.toThrow();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does not request ads for a Pro viewer', () => {
    mockUseAdRuntime.mockReturnValue({
      ready: true,
      privacyOptionsRequired: false,
      showPrivacyOptions: async () => undefined,
      viewerHasPro: true,
      viewerSubscriptionLoading: false,
    });
    const screen = render(<FreeBannerAd ledgerId={ledgerId} />);
    expect(screen.queryByTestId('free-tier-banner-slot')).toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('removes the displayed ad when Pro is verified and retains only the safe area', async () => {
    const screen = render(<FreeTabBannerFooter />);
    measure(screen, 500);
    await waitFor(() =>
      expect(screen.getByTestId('mock-banner-ad')).toBeTruthy(),
    );
    fireEvent(screen.getByTestId('mock-banner-ad'), 'layout');
    act(() =>
      screen.getByTestId('mock-banner-ad').props.listener.onAdDisplayed({
        adSize: {height: 50},
      }),
    );
    mockUseAdRuntime.mockReturnValue({
      ...mockUseAdRuntime(),
      viewerHasPro: true,
    });
    screen.rerender(<FreeTabBannerFooter />);
    expect(screen.queryByTestId('free-tier-banner-ad')).toBeNull();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('tab-banner-safe-area')).toHaveLength(1);
    expect(screen.getByTestId('tab-banner-safe-area').props.style.height).toBe(
      24,
    );
  });

  it('keeps only the device safe area when no ledger is selected', () => {
    useLedgerStore.setState({activeLedgerId: null});
    const screen = render(<FreeTabBannerFooter />);
    expect(screen.queryByTestId('free-tier-banner-slot')).toBeNull();
    expect(screen.getByTestId('tab-banner-safe-area').props.style.height).toBe(
      24,
    );
  });
});
