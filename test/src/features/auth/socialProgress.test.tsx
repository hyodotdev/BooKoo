import type {ReactElement} from 'react';
import {Modal} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  act,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import * as AppleAuthentication from 'expo-apple-authentication';

import {useSocialSignIn} from '../../../../src/features/auth/social';
import {SignInScreen} from '../../../../src/features/auth/screens';
import {
  BrandSecondarySignInButton,
  SocialSessionProgress,
} from '../../../../src/features/auth/ui';
import {theme} from '../../../../src/theme';

const mockSignIn = jest.fn();
jest.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({signIn: mockSignIn}),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

const credential: AppleAuthentication.AppleAuthenticationCredential = {
  user: 'synthetic-provider-user',
  email: null,
  fullName: null,
  identityToken: 'test-identity-token',
  authorizationCode: null,
  realUserStatus: 0,
  state: null,
};

function themed(ui: ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, bottom: 0, left: 0, right: 0},
      }}
    >
      <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'dark'}}>
        {ui}
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('social sign-in progress', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    jest.mocked(AppleAuthentication.signInAsync).mockReset();
  });

  it('locks synchronously, identifies the provider, and stays busy through session exchange', async () => {
    const provider =
      deferred<AppleAuthentication.AppleAuthenticationCredential>();
    const session = deferred<{signingIn: boolean}>();
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockReturnValueOnce(provider.promise);
    mockSignIn.mockReturnValueOnce(session.promise);
    const {result} = renderHook(() => useSocialSignIn());
    let attempt!: Promise<void>;
    act(() => {
      attempt = result.current.start('apple');
      void result.current.start('google');
    });
    expect(result.current.busyProvider).toBe('apple');
    expect(result.current.phase).toBe('provider');
    expect(mockSignIn).not.toHaveBeenCalled();
    await act(async () => {
      provider.resolve(credential);
    });
    expect(result.current.phase).toBe('session');
    expect(result.current.busyProvider).toBe('apple');
    await act(async () => {
      await result.current.start('naver');
    });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    await act(async () => {
      session.resolve({signingIn: true});
      await attempt;
    });
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.phase).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('cancels without an error and releases the lock for a fresh attempt', async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce({code: 'ERR_REQUEST_CANCELED'})
      .mockResolvedValueOnce(credential);
    mockSignIn.mockResolvedValue({signingIn: true});
    const {result} = renderHook(() => useSocialSignIn());
    await act(async () => {
      await result.current.start('apple');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBeNull();
    await act(async () => {
      await result.current.start('apple');
    });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(result.current.busyProvider).toBeNull();
  });

  it.each(['rejection', 'missing-session'])(
    'recovers from a session %s and permits retry',
    async (failure) => {
      jest
        .mocked(AppleAuthentication.signInAsync)
        .mockResolvedValue(credential);
      if (failure === 'rejection')
        mockSignIn.mockRejectedValueOnce(new Error('Network unavailable'));
      else mockSignIn.mockResolvedValueOnce({signingIn: false});
      mockSignIn.mockResolvedValueOnce({signingIn: true});
      const {result} = renderHook(() => useSocialSignIn());
      await act(async () => {
        await result.current.start('apple');
      });
      expect(result.current.error).toBe('error');
      expect(result.current.busyProvider).toBeNull();
      expect(result.current.phase).toBeNull();
      await act(async () => {
        await result.current.start('apple');
      });
      expect(result.current.error).toBeNull();
      expect(mockSignIn).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['kakao', 'naver'] as const)(
    'replaces the %s mark with a visible spinner and blocks presses',
    (provider) => {
      const onPress = jest.fn();
      const screen = themed(
        <BrandSecondarySignInButton
          disabled
          loading
          label={provider}
          onPress={onPress}
          provider={provider}
        />,
      );
      expect(
        screen.getByTestId(`auth-${provider}-spinner`).props.animating,
      ).toBe(true);
      expect(
        screen.getByTestId(`auth-continue-${provider}`).props
          .accessibilityState,
      ).toEqual({busy: true, disabled: true});
      fireEvent.press(screen.getByTestId(`auth-continue-${provider}`));
      expect(onPress).not.toHaveBeenCalled();
    },
  );

  it('disables every sign-in method during a provider request and restores them on cancellation', async () => {
    const provider =
      deferred<AppleAuthentication.AppleAuthenticationCredential>();
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockReturnValueOnce(provider.promise);
    const screen = themed(<SignInScreen />);
    fireEvent.press(screen.getByTestId('auth-continue-apple'));
    for (const method of ['email', 'google', 'kakao', 'naver']) {
      expect(screen.getByTestId(`auth-continue-${method}`)).toBeDisabled();
    }
    expect(screen.getByText('Signing in with Apple…')).toBeTruthy();
    expect(screen.queryByTestId('auth-session-progress')).toBeNull();
    await act(async () => {
      provider.reject(new Error('Sign-in cancelled'));
    });
    expect(screen.getByTestId('auth-continue-email')).toBeEnabled();
    expect(screen.queryByText('Signing in with Apple…')).toBeNull();
  });

  it('keeps session progress visible when the backdrop or Android back requests dismissal', () => {
    const screen = themed(
      <SocialSessionProgress label="Signing in with Kakao…" visible />,
    );
    expect(
      screen.getByTestId('auth-session-progress').props.accessibilityState,
    ).toEqual({busy: true});
    fireEvent.press(screen.getByTestId('alert-dialog-backdrop'));
    const modal = screen
      .UNSAFE_getAllByType(Modal)
      .find((node) => node.props.visible);
    expect(modal).toBeDefined();
    fireEvent(modal!, 'requestClose');
    expect(screen.getByTestId('auth-session-progress')).toBeTruthy();
    expect(screen.queryByLabelText('Close dialog')).toBeNull();
  });
});
