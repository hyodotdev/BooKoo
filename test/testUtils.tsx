import type {ReactElement, ReactNode} from 'react';
import type {RenderOptions, RenderResult} from '@testing-library/react-native';
import {render} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ConvexProvider, ConvexReactClient} from 'convex/react';

// NOTE: BooKoo keeps its providers under `src/components/providers`
// (Martie uses `src/providers`). Keep this path in sync with
// `src/components/providers/index.tsx`.
import RootProvider from '../src/components/providers';

export type AppThemeType = 'light' | 'dark';

/**
 * `convex/react` is mocked (see `__mocks__/convex/react.tsx`), so this client
 * never opens a socket — it exists only so components that call `useConvex()`
 * find a provider above them.
 */
export const createMockConvexClient = (): ConvexReactClient =>
  new ConvexReactClient('https://mock.convex.cloud', {
    unsavedChangesWarning: false,
  });

type ProvidersProps = {
  children?: ReactNode;
  themeType?: AppThemeType;
  convexClient?: ConvexReactClient;
};

/**
 * Every provider a BooKoo screen expects at runtime: cpk-ui's theme/asset
 * context, the Convex client, and safe-area metrics.
 */
export function AllProviders({
  children,
  themeType,
  convexClient,
}: ProvidersProps): ReactElement {
  const client = convexClient ?? createMockConvexClient();

  return (
    <ConvexProvider client={client}>
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <RootProvider initialThemeType={themeType}>
          <>{children}</>
        </RootProvider>
      </SafeAreaProvider>
    </ConvexProvider>
  );
}

/**
 * Wrap a node in the full provider tree without rendering it.
 * Kept for tests that want to assert on the element before rendering.
 */
export const createTestElement = (
  child: ReactElement,
  themeType?: AppThemeType,
  convexClient?: ConvexReactClient,
): ReactElement => (
  <AllProviders convexClient={convexClient} themeType={themeType}>
    {child}
  </AllProviders>
);

export type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  themeType?: AppThemeType;
  convexClient?: ConvexReactClient;
};

/**
 * Preferred entry point for component tests.
 *
 * @example
 * const {getByText} = renderWithProviders(<LedgerScreen />);
 */
export const renderWithProviders = (
  ui: ReactElement,
  {themeType, convexClient, ...options}: RenderWithProvidersOptions = {},
): RenderResult =>
  render(ui, {
    ...options,
    wrapper: ({children}: {children?: ReactNode}) => (
      <AllProviders convexClient={convexClient} themeType={themeType}>
        {children}
      </AllProviders>
    ),
  });

/**
 * Props stub for screen components. Deliberately typed `Record<string, unknown>`
 * rather than `any` — `@typescript-eslint/no-explicit-any` is an error here.
 */
export const createTestProps = (
  obj?: Record<string, unknown>,
): Record<string, unknown> => ({
  navigation: {
    navigate: jest.fn(),
    goBack: jest.fn(),
  },
  ...obj,
});

export type MockNavigation = Record<string, jest.Mock>;

/**
 * Navigation stub for mocking `useNavigation`. Each method can be overridden
 * per test case.
 *
 * @example
 * const mockNavigation = createMockNavigation();
 * mockNavigation.setParams.mockImplementation(() => {});
 */
export function createMockNavigation(): MockNavigation {
  return {
    getId: jest.fn(),
    addListener: jest.fn(),
    canGoBack: jest.fn(),
    getParent: jest.fn(),
    getState: jest.fn(),
    dispatch: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(),
    navigate: jest.fn(),
    removeListener: jest.fn(),
    reset: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn(),
    pop: jest.fn(),
    popToTop: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  };
}

export function TestSafeAreaProvider({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 0, height: 0},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}
