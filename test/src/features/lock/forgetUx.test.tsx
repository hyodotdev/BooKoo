import 'react-native';

import type {ReactElement} from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LockScreen} from '../../../../src/features/lock/screens';
import {useAppLock} from '../../../../src/features/lock/provider';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

/**
 * Offline, `signOut` neither resolves nor rejects — the installed
 * `@convex-dev/auth` pends its socket calls until reconnect. Tapping
 * "Forgot PIN" therefore used to wedge the button with no explanation, and
 * before that it reported a PIN mismatch for a PIN the user never typed.
 */

jest.mock('../../../../src/features/lock/provider', () => ({
  useAppLock: jest.fn(),
}));

const forget = jest.fn();
const base = {
  locked: true,
  lockedUntil: null,
  forget,
  unlockWithPin: jest.fn(async () => false),
  unlockWithBiometrics: jest.fn(async () => false),
};

const wrap = (node: ReactElement): ReactElement => (
  <SafeAreaProvider
    initialMetrics={{
      frame: {x: 0, y: 0, width: 390, height: 844},
      insets: {top: 0, left: 0, right: 0, bottom: 0},
    }}
  >
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      {node}
    </CpkProvider>
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  setActiveLocale('en');
  jest.mocked(useAppLock).mockReturnValue(
    base as unknown as ReturnType<typeof useAppLock>,
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('tapping Forgot PIN', () => {
  it('reports a connection problem when the sign-out never lands', async () => {
    forget.mockReturnValue(new Promise<void>(() => undefined));

    const screen = render(wrap(<LockScreen />));
    fireEvent.press(screen.getByText('Forgot PIN? Sign out and reset'));

    // Still waiting: no error yet.
    expect(screen.queryByTestId('lock-forget-error')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    const error = await waitFor(() =>
      screen.getByTestId('lock-forget-error'),
    );
    // Not the PIN-mismatch copy — the user never typed a PIN here.
    expect(error).toHaveTextContent('Check your connection and try again.');
  });

  it('starts one attempt no matter how often it is tapped', async () => {
    forget.mockReturnValue(new Promise<void>(() => undefined));

    const screen = render(wrap(<LockScreen />));
    const button = screen.getByText('Forgot PIN? Sign out and reset');
    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    expect(forget).toHaveBeenCalledTimes(1);
  });
});

describe('the lock screen layout', () => {
  it('scrolls above the keyboard so the escape hatch is reachable', () => {
    // Found on device, not by these tests: the PIN field autofocuses, an iOS
    // number pad has no Done key, and a fixed centred frame hid "Forgot PIN"
    // behind the keyboard with no way to scroll. A user who had forgotten
    // their PIN could not leave the app. `fireEvent.press` finds a button by
    // text whether or not a keyboard covers it, so only a guard on the
    // structure keeps this from coming back.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../../../src/features/lock/screens.tsx'),
      'utf8',
    ) as string;

    expect(source).toContain('KeyboardAwareScrollView');
    expect(source).toContain("keyboardShouldPersistTaps=\"handled\"");
    // A fixed `flex: 1` frame is what trapped the button below the fold.
    expect(source).not.toMatch(/frame: \{flex: 1/);
  });
});
