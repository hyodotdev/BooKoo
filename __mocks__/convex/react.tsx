/**
 * Manual mock for `convex/react`.
 *
 * Wired up in two places on purpose:
 *  - `jest.config.ts` → `moduleNameMapper['^convex/react$']` (deterministic
 *    resolution, and the fix for the recipe's `.ts` vs `.tsx` bug)
 *  - `test/testSetup.ts` → `jest.mock('convex/react', …)` delegates here so
 *    there is a single source of truth for the mock surface.
 *
 * Keep this in sync with the Convex hooks the app actually uses. Paginated
 * lists are a project rule (`usePaginatedQuery` + FlashList), so the paginated
 * shape is mocked here rather than left to individual tests.
 */
import type {ReactNode} from 'react';

export class ConvexReactClient {
  constructor(
    public url: string,
    public options?: {unsavedChangesWarning?: boolean},
  ) {}

  setAuth = jest.fn();
  clearAuth = jest.fn();
  close = jest.fn(() => Promise.resolve());
}

export function ConvexProvider({children}: {children?: ReactNode}): ReactNode {
  return children ?? null;
}

export function ConvexProviderWithAuth({
  children,
}: {
  children?: ReactNode;
}): ReactNode {
  return children ?? null;
}

export function Authenticated({children}: {children?: ReactNode}): ReactNode {
  return children ?? null;
}

export function Unauthenticated(_: {children?: ReactNode}): ReactNode {
  return null;
}

export function AuthLoading(_: {children?: ReactNode}): ReactNode {
  return null;
}

export const useConvex = jest.fn(() => new ConvexReactClient('http://mock'));
export const useConvexAuth = jest.fn(() => ({
  isLoading: false,
  isAuthenticated: false,
}));
export const useConvexConnectionState = jest.fn(() => ({
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasInflightRequests: false,
}));

export const useQuery = jest.fn((): undefined => undefined);
export const useMutation = jest.fn(() => jest.fn(() => Promise.resolve()));
export const useAction = jest.fn(() => jest.fn(() => Promise.resolve()));

export const usePaginatedQuery = jest.fn(() => ({
  results: [] as unknown[],
  status: 'Exhausted' as const,
  isLoading: false,
  loadMore: jest.fn(),
}));
