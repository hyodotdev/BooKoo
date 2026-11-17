import {act, render, screen} from '@testing-library/react-native';
import {Text} from 'react-native';
import {
  ConnectivityProvider,
  useConnectivity,
} from '../../../../src/features/runtime/connectivity';

let mockConnectionState = {
  connectionCount: 1,
  isWebSocketConnected: true,
};

jest.mock('convex/react', () => ({
  useConvexConnectionState: () => mockConnectionState,
}));

function ConnectivityProbe() {
  const {connected, showOffline} = useConnectivity();
  return (
    <Text testID="connectivity-state">
      {connected ? 'connected' : showOffline ? 'offline-visible' : 'offline-wait'}
    </Text>
  );
}

describe('ConnectivityProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockConnectionState = {
      connectionCount: 1,
      isWebSocketConnected: true,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delays the offline state and hides stale epochs after reconnecting', () => {
    const view = render(
      <ConnectivityProvider>
        <ConnectivityProbe />
      </ConnectivityProvider>,
    );

    expect(screen.getByTestId('connectivity-state')).toHaveTextContent(
      'connected',
    );

    mockConnectionState = {
      connectionCount: 1,
      isWebSocketConnected: false,
    };
    view.rerender(
      <ConnectivityProvider>
        <ConnectivityProbe />
      </ConnectivityProvider>,
    );
    expect(screen.getByTestId('connectivity-state')).toHaveTextContent(
      'offline-wait',
    );

    act(() => jest.advanceTimersByTime(3_000));
    expect(screen.getByTestId('connectivity-state')).toHaveTextContent(
      'offline-visible',
    );

    mockConnectionState = {
      connectionCount: 2,
      isWebSocketConnected: true,
    };
    view.rerender(
      <ConnectivityProvider>
        <ConnectivityProbe />
      </ConnectivityProvider>,
    );
    expect(screen.getByTestId('connectivity-state')).toHaveTextContent(
      'connected',
    );

    mockConnectionState = {
      connectionCount: 2,
      isWebSocketConnected: false,
    };
    view.rerender(
      <ConnectivityProvider>
        <ConnectivityProbe />
      </ConnectivityProvider>,
    );
    expect(screen.getByTestId('connectivity-state')).toHaveTextContent(
      'offline-wait',
    );
  });
});
