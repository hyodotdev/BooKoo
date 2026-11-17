import 'react-native';

import type {ReactNode} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LockSettingsScreen} from '../../../../src/features/lock/settings';
import {useAppLock} from '../../../../src/features/lock/provider';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      ListEmptyComponent,
      ListHeaderComponent,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      ListEmptyComponent?: ReactNode;
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: unknown}) => ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        View,
        {testID},
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement(View, {key: index}, renderItem({item})),
            ),
      ),
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../../../src/features/lock/provider', () => ({
  useAppLock: jest.fn(),
}));

const mockUseAppLock = jest.mocked(useAppLock);

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <LockSettingsScreen />
      </CpkProvider>
    </SafeAreaProvider>,
  );

const lockState = (overrides: Partial<ReturnType<typeof useAppLock>> = {}) => ({
  autoLockAfterMs: 60_000,
  biometricsEnabled: false,
  configure: jest.fn(() => Promise.resolve()),
  disable: jest.fn(() => Promise.resolve()),
  enabled: false,
  forget: jest.fn(() => Promise.resolve()),
  hasPin: false,
  locked: false,
  lockedUntil: null,
  lockNow: jest.fn(),
  ready: true,
  unlockWithBiometrics: jest.fn(() => Promise.resolve(false)),
  unlockWithPin: jest.fn(() => Promise.resolve(false)),
  ...overrides,
});

describe('app lock settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('moves from PIN creation to a matching confirmation before enabling', async () => {
    const configure = jest.fn(() => Promise.resolve());
    mockUseAppLock.mockReturnValue(lockState({configure}));
    const screen = renderScreen();

    expect(screen.queryByLabelText('Enter it once more')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Create your PIN'), '123456');

    await waitFor(() =>
      expect(screen.getByLabelText('Enter it once more')).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Create your PIN')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Enter it once more'), '123456');

    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        autoLockAfterMs: 60_000,
        biometricsEnabled: false,
        pin: '123456',
      }),
    );
  });

  it('keeps the existing PIN when the auto-lock timing changes', async () => {
    const configure = jest.fn(() => Promise.resolve());
    mockUseAppLock.mockReturnValue(
      lockState({configure, enabled: true, hasPin: true}),
    );
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Auto-lock'));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByLabelText('1 min').props.accessibilityRole).toBe(
      'radio',
    );
    expect(screen.getByLabelText('1 min').props.accessibilityState).toEqual(
      expect.objectContaining({checked: true}),
    );
    expect(screen.getByLabelText('5 min').props.accessibilityState).toEqual(
      expect.objectContaining({checked: false}),
    );
    fireEvent.press(screen.getByText('5 min'));

    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        autoLockAfterMs: 300_000,
        biometricsEnabled: false,
      }),
    );
  });
});
