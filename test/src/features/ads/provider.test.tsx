import {useEffect} from 'react';
import {act, render, waitFor} from '@testing-library/react-native';
import {AppState, Text, type AppStateStatus} from 'react-native';

import {AdRuntimeProvider, useAdRuntime} from '~/features/ads/provider';

let mockSubscription = {
  isActive: false,
  isLoading: false,
  isStatusAvailable: true,
};
const mockGatherConsent = jest.fn(async () => ({canRequestAds: true}));
const mockInitialize = jest.fn(async (): Promise<void> => undefined);
const mockPrivacyOptions = jest.fn(async () => ({canRequestAds: true}));
jest.mock('~/features/subscription/provider', () => ({
  useSubscription: () => mockSubscription,
}));
jest.mock('~/features/ads/config', () => ({isAdRuntimeConfigured: () => true}));
jest.mock('~/features/ads/native', () => ({
  initializeAdRuntime: () => mockInitialize(),
  googleConsentModule: () => ({
    AdsConsent: {
      gatherConsent: mockGatherConsent,
      showPrivacyOptionsForm: mockPrivacyOptions,
    },
    AdsConsentPrivacyOptionsRequirementStatus: {REQUIRED: 'REQUIRED'},
  }),
}));

let showPrivacyOptions: () => Promise<void>;
let foreground: ((state: AppStateStatus) => void) | undefined;
function Probe(): React.ReactElement {
  const runtime = useAdRuntime();
  const {ready, viewerSubscriptionLoading} = runtime;
  useEffect(() => {
    showPrivacyOptions = runtime.showPrivacyOptions;
  }, [runtime.showPrivacyOptions]);
  return (
    <Text testID="ads-state">{`${ready}:${viewerSubscriptionLoading}`}</Text>
  );
}

describe('Pro ad suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockReset().mockResolvedValue(undefined);
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        foreground = listener;
        return {remove: jest.fn()};
      });
    mockGatherConsent.mockResolvedValue({canRequestAds: true});
    mockPrivacyOptions.mockResolvedValue({canRequestAds: true});
    mockSubscription = {
      isActive: false,
      isLoading: false,
      isStatusAvailable: true,
    };
  });
  afterEach(() => jest.restoreAllMocks());

  it('retries a transient SDK initialization failure on foreground', async () => {
    mockInitialize.mockRejectedValueOnce(
      new Error('temporary network failure'),
    );
    const screen = render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('ads-state').props.children).toBe('false:false');
    await act(async () => foreground?.('active'));
    expect(mockInitialize).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('ads-state').props.children).toBe('true:false');
  });

  it('does not re-open consent or initialize after request permission is denied', async () => {
    mockGatherConsent.mockResolvedValue({canRequestAds: false});
    render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() => expect(mockGatherConsent).toHaveBeenCalledTimes(1));
    await act(async () => foreground?.('active'));
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('rejects an old init success after the privacy form revokes requests', async () => {
    let finish: (() => void) | undefined;
    mockInitialize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));
    mockPrivacyOptions.mockResolvedValue({canRequestAds: false});
    await act(async () => showPrivacyOptions());
    await act(async () => finish?.());
    expect(screen.getByTestId('ads-state').props.children).toBe('false:false');
  });
  it('does not initialize LevelPlay when UMP does not allow ads', async () => {
    mockGatherConsent.mockResolvedValue({canRequestAds: false});
    const screen = render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() => expect(mockGatherConsent).toHaveBeenCalledTimes(1));
    expect(mockInitialize).not.toHaveBeenCalled();
    expect(screen.getByTestId('ads-state').props.children).toBe('false:false');
  });
  it('initializes only after UMP and never passes canRequestAds as consent', async () => {
    render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));
    expect(mockInitialize.mock.calls[0]).toEqual([]);
    expect(mockGatherConsent.mock.invocationCallOrder[0]).toBeLessThan(
      mockInitialize.mock.invocationCallOrder[0],
    );
  });
  it('tears down ad readiness when the privacy form revokes request permission', async () => {
    const screen = render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('ads-state').props.children).toBe('true:false'),
    );
    mockPrivacyOptions.mockResolvedValue({canRequestAds: false});
    await act(async () => showPrivacyOptions());
    expect(screen.getByTestId('ads-state').props.children).toBe('false:false');
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });
  it.each([
    {isActive: true, isLoading: false, isStatusAvailable: true},
    {isActive: false, isLoading: true, isStatusAvailable: false},
    {isActive: false, isLoading: false, isStatusAvailable: false},
  ])('does not start ads for paid or unresolved status: %j', (status) => {
    mockSubscription = status;
    render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    expect(mockGatherConsent).not.toHaveBeenCalled();
    expect(mockInitialize).not.toHaveBeenCalled();
  });
  it('hides previously initialized ads when subscription verification fails', async () => {
    const screen = render(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('ads-state').props.children).toBe('true:false'),
    );
    mockSubscription = {
      isActive: false,
      isLoading: false,
      isStatusAvailable: false,
    };
    screen.rerender(
      <AdRuntimeProvider>
        <Probe />
      </AdRuntimeProvider>,
    );
    expect(screen.getByTestId('ads-state').props.children).toBe('false:true');
  });
});
