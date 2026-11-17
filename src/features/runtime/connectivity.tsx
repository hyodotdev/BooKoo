import type {PropsWithChildren, ReactElement} from 'react';
import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {useConvexConnectionState} from 'convex/react';

interface ConnectivityState {
  readonly connected: boolean;
  readonly showOffline: boolean;
}

const Context = createContext<ConnectivityState>({
  connected: true,
  showOffline: false,
});

export function ConnectivityProvider({children}: PropsWithChildren): ReactElement {
  const state = useConvexConnectionState();
  // Simulator E2E can inject a deterministic network loss without changing
  // production behavior or persisting a hidden product setting.
  const forceOffline =
    __DEV__ && process.env.EXPO_PUBLIC_E2E_FORCE_OFFLINE === '1';
  const connected = !forceOffline && state.isWebSocketConnected;
  const connectionEpoch = state.connectionCount;
  const [visibleEpoch, setVisibleEpoch] = useState<number | null>(null);
  useEffect(() => {
    if (connected) return;
    const timer = setTimeout(() => setVisibleEpoch(connectionEpoch), 3_000);
    return () => clearTimeout(timer);
  }, [connected, connectionEpoch]);
  const value = useMemo(
    () => ({
      connected,
      showOffline: !connected && visibleEpoch === connectionEpoch,
    }),
    [connected, connectionEpoch, visibleEpoch],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useConnectivity = (): ConnectivityState => useContext(Context);
