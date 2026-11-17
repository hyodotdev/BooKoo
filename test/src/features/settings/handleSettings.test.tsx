import 'react-native';

import {act, fireEvent, render} from '@testing-library/react-native';
import {useMutation, useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  HANDLE_AVAILABILITY_DEBOUNCE_MS,
  HandleSettingsScreen,
} from '../../../../src/features/settings/screens';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';
import {leaveCurrentScreen} from '../../../../src/utils/navigation';

jest.mock('../../../../src/utils/navigation', () => ({
  leaveCurrentScreen: jest.fn(() => Promise.resolve()),
}));

let mockHandle = 'bookoo_qa';
jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    user: {
      handle: mockHandle,
    },
  }),
}));

function mutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

const metrics = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 47, left: 0, right: 0, bottom: 34},
};

describe('handle settings', () => {
  const changeHandle = jest.fn(() => Promise.resolve(null));

  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useQuery).mockReturnValue({status: 'AVAILABLE'});
    jest.mocked(useMutation).mockReturnValue(mutationMock(changeHandle));
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
    mockHandle = 'bookoo_qa';
  });

  it('keeps Update disabled when the ID is empty in every build', () => {
    const screen = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <HandleSettingsScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('ID'), '');
    expect(screen.getByLabelText('Update')).toBeDisabled();
    fireEvent.press(screen.getByLabelText('Update'));
    expect(leaveCurrentScreen).not.toHaveBeenCalled();
    expect(changeHandle).not.toHaveBeenCalled();
  });

  it('does not call your own unchanged ID available', () => {
    mockHandle = 'mina_park';
    jest.useFakeTimers();
    const screen = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <HandleSettingsScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    act(() => {
      jest.advanceTimersByTime(HANDLE_AVAILABILITY_DEBOUNCE_MS);
    });
    expect(screen.getByLabelText('ID').props.value).toBe('mina_park');
    expect(screen.queryByText('This ID is available.')).toBeNull();
    expect(screen.queryByText('This ID is not available.')).toBeNull();
  });

  it('hides ID availability while typing and shows it after debounce', () => {
    jest.useFakeTimers();
    const screen = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <HandleSettingsScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('ID'), 'alice');
    expect(screen.queryByText('This ID is available.')).toBeNull();
    expect(screen.queryByText('This ID is not available.')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(HANDLE_AVAILABILITY_DEBOUNCE_MS - 1);
    });
    expect(screen.queryByText('This ID is available.')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('This ID is available.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('ID'), '');
    expect(screen.queryByText('This ID is available.')).toBeNull();
    expect(screen.queryByText('This ID is not available.')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(HANDLE_AVAILABILITY_DEBOUNCE_MS);
    });
    expect(screen.getByText('This ID is not available.')).toBeTruthy();
  });
});
