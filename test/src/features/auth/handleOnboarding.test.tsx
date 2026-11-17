import {Platform, StyleSheet} from 'react-native';
import type {ReactTestInstance} from 'react-test-renderer';

import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  FinishIdentityProfile,
  HANDLE_ONBOARDING_DEBOUNCE_MS,
  HandleScreen,
  ProfileScreen,
} from '../../../../src/features/auth/screens';
import {
  authButtonLabelStyle,
  authFieldInputMinHeight,
} from '../../../../src/features/auth/ui';
import {useSessionSignOut} from '../../../../src/features/auth/signOut';
import {useLocale} from '../../../../src/hooks/useLocale';
import {
  DISPLAY_NAME_MAX_LENGTH,
  generatedDisplayName,
} from '../../../../shared/profile';
import {theme} from '../../../../src/theme';
import {
  DATE_FNS_LOCALES,
  LOCALE_LABELS,
  setActiveLocale,
} from '../../../../src/utils/i18n';

jest.mock('../../../../src/features/auth/signOut', () => ({
  useSessionSignOut: jest.fn(),
}));

const mockUseSession = jest.fn();

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('convex-helpers/react/cache', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../../../src/hooks/useLocale', () => ({
  useLocale: jest.fn(),
}));

function mutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

describe('handle onboarding', () => {
  const claimHandle = jest.fn(() => Promise.resolve(null));
  const signOut = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setActiveLocale('en');
    jest.mocked(useQuery).mockReturnValue({status: 'AVAILABLE'});
    jest.mocked(useMutation).mockReturnValue(mutationMock(claimHandle));
    mockUseSession.mockReturnValue({onboardingStep: 'handle', user: null});
    jest.mocked(useSessionSignOut).mockReturnValue({
      leaving: false,
      signOut,
    });
    jest.mocked(useLocale).mockReturnValue({
      dateFnsLocale: DATE_FNS_LOCALES.en,
      defaultCurrency: 'USD',
      isFollowingDevice: false,
      locale: 'en',
      localeLabels: LOCALE_LABELS,
      resetToDeviceLocale: jest.fn(),
      setLocale: jest.fn(),
      supportedLocales: ['en', 'ko'],
      timezone: 'UTC',
      uses24HourClock: true,
      weekStartsOn: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderScreen = (content = <HandleScreen />) =>
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          {content}
        </CpkProvider>
      </SafeAreaProvider>,
    );

  it('blocks the signed-in shell until the user chooses an available ID', async () => {
    const screen = renderScreen();

    expect(screen.getByTestId('onboarding-blocking-modal')).toBeTruthy();
    expect(screen.getByTestId('auth-handle-input').props.value).toBe('');
    expect(screen.getByLabelText('Set')).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('auth-handle-input'), 'mint.home');
    act(() => {
      jest.advanceTimersByTime(HANDLE_ONBOARDING_DEBOUNCE_MS);
    });

    expect(screen.getByText('This ID is available.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set'));
    });

    await waitFor(() =>
      expect(claimHandle).toHaveBeenCalledWith({
        handle: 'mint.home',
        locale: 'en',
        preferredCurrency: 'USD',
      }),
    );
  });

  it.each([
    ['ID', () => <HandleScreen />, 'Choose your ID', 'ID'],
    ['name', () => <ProfileScreen />, 'Choose your name', 'Name'],
  ] as const)(
    'titles the %s dialog apart from its field label',
    (_dialog, content, heading, label) => {
      mockUseSession.mockReturnValue({
        onboardingStep: _dialog === 'ID' ? 'handle' : 'profile',
        user: null,
      });
      const screen = renderScreen(content());

      // The title once read "ID" directly above a field labelled "ID".
      expect(screen.getAllByText(heading)).toHaveLength(1);
      expect(screen.getAllByText(label)).toHaveLength(1);
    },
  );

  it('fills the dialog action row and aligns the notice with the dialog body', () => {
    const screen = renderScreen();
    fireEvent.changeText(screen.getByTestId('auth-handle-input'), 'mint.home');
    act(() => {
      jest.advanceTimersByTime(HANDLE_ONBOARDING_DEBOUNCE_MS);
    });

    // cpk-ui AlertDialog sizes each action with `flex: 1`; the button's
    // loading frame (its nearest `position: relative` ancestor) must receive
    // it instead of shrinking to its label at the start edge. The dialog's own
    // `flex: 1` wrappers further up do not count.
    let node: ReactTestInstance | null = screen.getByLabelText('Set');
    let frame: ReactTestInstance | null = null;
    while (node !== null && frame === null) {
      if (StyleSheet.flatten(node.props.style)?.position === 'relative') {
        frame = node;
      }
      node = node.parent;
    }
    expect(StyleSheet.flatten(frame?.props.style)?.flex).toBe(1);
    expect(
      StyleSheet.flatten(screen.getByText('This ID is available.').props.style)
        .textAlign,
    ).toBe('left');
  });

  it('centers the button label without a top-pinned floor on iOS', () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      expect(authButtonLabelStyle(1)).toEqual({});

      os.replaceValue('android');
      expect(authButtonLabelStyle(2)).toEqual({
        minHeight: authFieldInputMinHeight('medium', 2, 1),
        textAlignVertical: 'center',
      });
    } finally {
      os.restore();
    }
  });

  it('aligns the profile dialog notice with the dialog body', () => {
    mockUseSession.mockReturnValue({onboardingStep: 'profile', user: null});
    const screen = renderScreen(<ProfileScreen />);
    fireEvent.changeText(
      screen.getByTestId('profile-display-name'),
      'x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
    );

    const notice = screen.getByText(
      `Leave blank for a generated name, or use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    );
    expect(StyleSheet.flatten(notice.props.style).textAlign).toBe('left');
  });

  it('repairs a blank display name without asking the user to type one', async () => {
    const completeProfile = jest.fn(() =>
      Promise.resolve({onboardingStep: 'ledger'}),
    );
    jest.mocked(useMutation).mockReturnValue(mutationMock(completeProfile));
    mockUseSession.mockReturnValue({
      onboardingStep: 'profile',
      user: {displayName: '   ', userId: 'user-generated-name'},
    });

    render(<FinishIdentityProfile />);

    await waitFor(() =>
      expect(completeProfile).toHaveBeenCalledWith({
        displayName: generatedDisplayName('user-generated-name'),
        locale: 'en',
        preferredCurrency: 'USD',
      }),
    );
  });

  it('offers an explicit retry when automatic profile completion fails', async () => {
    const completeProfile = jest
      .fn()
      .mockRejectedValueOnce(new Error('Temporary server failure'))
      .mockResolvedValueOnce({onboardingStep: 'ledger'});
    jest.mocked(useMutation).mockReturnValue(mutationMock(completeProfile));
    mockUseSession.mockReturnValue({
      onboardingStep: 'profile',
      user: {displayName: '   ', userId: 'user-generated-name'},
    });
    const screen = renderScreen(<FinishIdentityProfile />);

    await waitFor(() =>
      expect(screen.getByText('Something went wrong.')).toBeTruthy(),
    );
    expect(completeProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'));
    });

    expect(completeProfile).toHaveBeenCalledTimes(2);
    expect(completeProfile.mock.calls[1]).toEqual(completeProfile.mock.calls[0]);
    await waitFor(() =>
      expect(screen.queryByText('Something went wrong.')).toBeNull(),
    );
  });

  it('does not automatically retry on an unrelated profile refresh', async () => {
    const completeProfile = jest.fn().mockRejectedValue(new Error('Unavailable'));
    jest.mocked(useMutation).mockReturnValue(mutationMock(completeProfile));
    mockUseSession.mockImplementation(() => ({
      onboardingStep: 'profile',
      user: {displayName: 'Test name', userId: 'user-generated-name'},
    }));
    const screen = renderScreen(<FinishIdentityProfile />);
    await waitFor(() => expect(screen.getByLabelText('Try again')).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(completeProfile).toHaveBeenCalledTimes(1);
  });
});
