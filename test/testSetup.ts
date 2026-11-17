/**
 * Jest `setupFiles` — runs before the test framework is installed, once per
 * test file. Everything here is a *native-module* stand-in: BooKoo's unit tests
 * run in node, so anything that would reach across the RN bridge must be
 * replaced with a deterministic JS double.
 *
 * Rules of thumb for editing this file:
 *  - Only mock packages that are in `package.json`. A `jest.mock()` for a
 *    package that is not installed throws "Cannot find module" at setup time
 *    and takes the whole suite down. (Notably: BooKoo persists with
 *    `react-native-mmkv`, NOT `@react-native-async-storage/async-storage`.)
 *  - Prefer a package's own `/jest` entry point over a hand-written factory.
 *  - Mocks that are shared with the app's own type surface live in
 *    `<rootDir>/__mocks__/` and are delegated to from here.
 */

/**
 * Typed handle on the JS global. Avoids `any` (banned repo-wide) while still
 * letting us install the handful of globals RN/Reanimated expect to exist.
 */
const globalRef = globalThis as unknown as {
  fetch: typeof fetch;
  fetchMock: unknown;
  __reanimatedWorkletInit: () => void;
  Window?: unknown;
};

process.env.EXPO_PUBLIC_CONVEX_URL = 'https://mock.convex.cloud';
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = 'https://mock.convex.site';
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'mock-google-ios-client';
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'mock-google-web-client';
process.env.EXPO_PUBLIC_KAKAO_APP_KEY = 'mock-kakao-app-key';
process.env.EXPO_PUBLIC_NAVER_CLIENT_ID = 'mock-naver-client-id';
process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET = 'mock-naver-client-secret';

// jest-expo's Keyboard listener stub returns undefined, while RN 0.86's
// KeyboardAvoidingView always calls `.remove()` during unmount.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {Keyboard} = require('react-native') as typeof import('react-native');
Keyboard.addListener = jest.fn(() => ({
  remove: jest.fn(),
})) as unknown as typeof Keyboard.addListener;

/**
 * Minimal `fetch` double. Martie uses `jest-fetch-mock`; that package is not a
 * dependency here, and adding one just for a stub is not worth it. Tests that
 * care about a response override `global.fetch` themselves.
 */
const createFetchMock = (): typeof fetch =>
  jest.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    url: '',
    redirected: false,
    type: 'basic' as ResponseType,
    json: async () => ({}),
    text: async () => '',
  })) as unknown as typeof fetch;

globalRef.fetch = createFetchMock();
globalRef.fetchMock = globalRef.fetch;

// Reanimated v4 worklet bootstrap. Must exist before any worklet-using module
// is imported, hence `setupFiles` rather than `setupFilesAfterEnv`.
globalRef.__reanimatedWorkletInit = jest.fn();

if (!globalRef.Window) {
  Object.defineProperty(globalRef, 'Window', {
    value: window.constructor,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

// expo-router. Written out rather than auto-mocked: an auto-mock makes
// `useRouter()` return `undefined`, and every screen in this app destructures
// it (`const {push} = useRouter()`), which throws before the render is reached.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {View} = require('react-native');

  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    canDismiss: jest.fn(() => false),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    prefetch: jest.fn(),
    reload: jest.fn(),
  };

  const passthrough = (displayName: string) => {
    const Passthrough = ({
      children,
    }: {
      children?: React.ReactNode;
    }): React.ReactElement =>
      React.createElement(View, {testID: displayName}, children);

    Passthrough.displayName = displayName;

    return Passthrough;
  };

  const Screen = (): null => null;

  const Stack = Object.assign(passthrough('Stack'), {
    Screen,
    Protected: Screen,
  });
  const Tabs = Object.assign(passthrough('Tabs'), {Screen, Protected: Screen});
  const Slot = passthrough('Slot');

  return {
    __esModule: true,
    Stack,
    Tabs,
    Slot,
    Screen,
    Link: passthrough('Link'),
    Redirect: (): null => null,
    ErrorBoundary: passthrough('ErrorBoundary'),
    router,
    useRouter: (): typeof router => router,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      openDrawer: jest.fn(),
      closeDrawer: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    usePathname: jest.fn((): string => '/'),
    useSegments: (): string[] => [],
    useLocalSearchParams: (): Record<string, string> => ({}),
    useGlobalSearchParams: (): Record<string, string> => ({}),
    useFocusEffect: jest.fn(),
    useRootNavigationState: () => ({key: 'root'}),
    withLayoutContext: (component: unknown) => component,
    SplashScreen: {
      preventAutoHideAsync: jest.fn(),
      hideAsync: jest.fn(),
    },
  };
});

jest.mock('expo-router/drawer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {View} = require('react-native');
  const Screen = (): null => null;
  const Drawer = Object.assign(
    ({children, ...props}: {children?: import('react').ReactNode}) =>
      React.createElement(View, {...props, testID: 'Drawer'}, children),
    {Screen},
  );
  return {__esModule: true, Drawer, default: Drawer};
});

jest.mock('@convex-dev/auth/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    ConvexAuthProvider: ({children}: {children?: React.ReactNode}) =>
      React.createElement(React.Fragment, null, children),
    useAuthActions: () => ({
      signIn: jest.fn(() => Promise.resolve({signingIn: false})),
      signOut: jest.fn(() => Promise.resolve()),
    }),
    useConvexAuth: () => ({isLoading: false, isAuthenticated: false}),
    useAuthToken: () => null,
  };
});

/* -------------------------------------------------------------------------- */
/* Expo native modules                                                         */
/* -------------------------------------------------------------------------- */

jest.mock('expo-observe', () => ({
  Observe: {
    configure: jest.fn(),
    markInteractive: jest.fn(),
  },
  ObserveRoot: {
    wrap: (component: unknown): unknown => component,
  },
}));

jest.mock('expo-font', () => ({
  useFonts: (): [boolean, null] => [true, null],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: {DEFAULT: 3, HIGH: 4},
  IosAuthorizationStatus: {PROVISIONAL: 3},
  PermissionStatus: {GRANTED: 'granted'},
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
  getExpoPushTokenAsync: jest.fn(() =>
    Promise.resolve({data: 'ExponentPushToken[test]'}),
  ),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({status: 'denied', ios: undefined}),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({status: 'denied', ios: undefined}),
  ),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(() => Promise.resolve()),
}));

// i18n resolves the device locale at import time (`src/STRINGS.ts`), so this
// has to be stable or the suite depends on the machine's system settings.
// The shape lives in `<rootDir>/__mocks__/expo-localization.ts`.
jest.mock('expo-localization', () =>
  jest.requireActual('../__mocks__/expo-localization'),
);

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  canUseBiometricAuthentication: jest.fn(() => false),
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

// App-lock / biometrics.
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1, 2])),
  getEnrolledLevelAsync: jest.fn(() => Promise.resolve(2)),
  authenticateAsync: jest.fn(() => Promise.resolve({success: true})),
  cancelAuthenticate: jest.fn(() => Promise.resolve()),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  SecurityLevel: {NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3},
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  getRandomBytesAsync: jest.fn((length: number) =>
    Promise.resolve(new Uint8Array(length).fill(7)),
  ),
}));

/* -------------------------------------------------------------------------- */
/* Persistence — MMKV (BooKoo does not use AsyncStorage)                       */
/* -------------------------------------------------------------------------- */

jest.mock('react-native-mmkv', () => {
  class MMKV {
    private store = new Map<string, string | number | boolean | ArrayBuffer>();

    set(key: string, value: string | number | boolean | ArrayBuffer): void {
      this.store.set(key, value);
    }

    getString(key: string): string | undefined {
      const value = this.store.get(key);

      return typeof value === 'string' ? value : undefined;
    }

    getNumber(key: string): number | undefined {
      const value = this.store.get(key);

      return typeof value === 'number' ? value : undefined;
    }

    getBoolean(key: string): boolean | undefined {
      const value = this.store.get(key);

      return typeof value === 'boolean' ? value : undefined;
    }

    getBuffer(key: string): ArrayBuffer | undefined {
      const value = this.store.get(key);

      return value instanceof ArrayBuffer ? value : undefined;
    }

    contains(key: string): boolean {
      return this.store.has(key);
    }

    delete(key: string): void {
      this.store.delete(key);
    }

    getAllKeys(): string[] {
      return [...this.store.keys()];
    }

    clearAll(): void {
      this.store.clear();
    }

    recrypt(): void {}

    addOnValueChangedListener(): {remove: () => void} {
      return {remove: (): void => {}};
    }
  }

  const instance = new MMKV();

  return {
    MMKV,
    Mode: {SINGLE_PROCESS: 0, MULTI_PROCESS: 1},
    useMMKV: () => instance,
    useMMKVString: () => [undefined, jest.fn()],
    useMMKVNumber: () => [undefined, jest.fn()],
    useMMKVBoolean: () => [undefined, jest.fn()],
    useMMKVObject: () => [undefined, jest.fn()],
    useMMKVBuffer: () => [undefined, jest.fn()],
    useMMKVListener: jest.fn(),
  };
});

/* -------------------------------------------------------------------------- */
/* Social sign-in SDKs                                                         */
/* -------------------------------------------------------------------------- */

jest.mock('@react-native-google-signin/google-signin', () => {
  const userInfo = {
    type: 'success',
    data: {
      idToken: 'mock-google-id-token',
      serverAuthCode: 'mock-google-server-auth-code',
      scopes: [],
      user: {
        id: 'mock-google-id',
        email: 'mock@example.com',
        name: 'Mock User',
        givenName: 'Mock',
        familyName: 'User',
        photo: null,
      },
    },
  };

  return {
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(() => Promise.resolve(true)),
      signIn: jest.fn(() => Promise.resolve(userInfo)),
      signInSilently: jest.fn(() => Promise.resolve(userInfo)),
      signOut: jest.fn(() => Promise.resolve()),
      revokeAccess: jest.fn(() => Promise.resolve()),
      getCurrentUser: jest.fn(() => null),
      getTokens: jest.fn(() =>
        Promise.resolve({idToken: 'mock-google-id-token', accessToken: 'mock'}),
      ),
    },
    GoogleSigninButton: (): null => null,
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
    },
    isSuccessResponse: (response: {type?: string}) =>
      response?.type === 'success',
    isErrorWithCode: () => false,
  };
});

jest.mock('@react-native-seoul/kakao-login', () => ({
  login: jest.fn(() =>
    Promise.resolve({
      accessToken: 'mock-kakao-access-token',
      refreshToken: 'mock-kakao-refresh-token',
      idToken: 'mock-kakao-id-token',
      scopes: [],
    }),
  ),
  loginWithKakaoAccount: jest.fn(() =>
    Promise.resolve({accessToken: 'mock-kakao-access-token'}),
  ),
  logout: jest.fn(() => Promise.resolve('logout')),
  unlink: jest.fn(() => Promise.resolve('unlink')),
  getProfile: jest.fn(() =>
    Promise.resolve({
      id: 'mock-kakao-id',
      email: 'mock@example.com',
      nickname: 'Mock',
    }),
  ),
  getAccessToken: jest.fn(() =>
    Promise.resolve({accessToken: 'mock-kakao-access-token'}),
  ),
}));

jest.mock('@react-native-seoul/naver-login', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    login: jest.fn(() =>
      Promise.resolve({
        isSuccess: true,
        successResponse: {
          accessToken: 'mock-naver-access-token',
          refreshToken: 'mock-naver-refresh-token',
          tokenType: 'bearer',
          expiresAtUnixSecondString: '0',
        },
      }),
    ),
    logout: jest.fn(() => Promise.resolve()),
    deleteToken: jest.fn(() => Promise.resolve()),
    getProfile: jest.fn(() =>
      Promise.resolve({
        resultcode: '00',
        message: 'success',
        response: {id: 'mock-naver-id', email: 'mock@example.com'},
      }),
    ),
    getAgreement: jest.fn(() => Promise.resolve({resultcode: '00'})),
  },
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  signInAsync: jest.fn(() =>
    Promise.resolve({
      user: 'mock-apple-user',
      identityToken: 'mock-apple-identity-token',
      authorizationCode: 'mock-apple-authorization-code',
      email: 'mock@example.com',
      fullName: null,
    }),
  ),
  refreshAsync: jest.fn(() => Promise.resolve({})),
  signOutAsync: jest.fn(() => Promise.resolve({})),
  getCredentialStateAsync: jest.fn(() => Promise.resolve(1)),
  AppleAuthenticationButton: (): null => null,
  AppleAuthenticationScope: {FULL_NAME: 0, EMAIL: 1},
  AppleAuthenticationButtonType: {SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2},
  AppleAuthenticationButtonStyle: {WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2},
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
}));

/* -------------------------------------------------------------------------- */
/* Backend + misc native modules                                               */
/* -------------------------------------------------------------------------- */

// Delegates to `<rootDir>/__mocks__/convex/react.tsx` so the manual mock stays
// the single source of truth (jest.config also maps `^convex/react$` there).
jest.mock('convex/react', () =>
  // `jest.requireActual`, not `require`: `jest.config.ts` already maps
  // `^convex/react$` at this same file, so a plain `require` would re-enter
  // this very factory and blow the stack.
  jest.requireActual('../__mocks__/convex/react'),
);

// Production query hooks are intentionally routed through the session-scoped
// convex-helpers cache. Delegate them to the existing Convex test doubles so
// individual tests can keep controlling one canonical set of hooks.
jest.mock('convex-helpers/react/cache', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ConvexQueryCacheProvider: ({children}: {children: React.ReactNode}) =>
      React.createElement(React.Fragment, null, children),
    usePaginatedQuery: (...args: unknown[]) =>
      jest.requireMock('convex/react').usePaginatedQuery(...args),
    useQuery: (...args: unknown[]) =>
      jest.requireMock('convex/react').useQuery(...args),
  };
});

jest.mock('react-native-keyboard-controller', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-keyboard-controller/jest'),
);

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');
