import 'react-native';

import type {ReactNode} from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {useMutation} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LanguageScreen} from '../../../../src/features/settings/screens';
import {useLocale} from '../../../../src/hooks/useLocale';
import {theme} from '../../../../src/theme';
import {
  DATE_FNS_LOCALES,
  LOCALE_LABELS,
  setActiveLocale,
} from '../../../../src/utils/i18n';
import {
  afterNavigationSettles,
  leaveCurrentScreen,
} from '../../../../src/utils/navigation';

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

jest.mock('../../../../src/hooks/useLocale', () => ({
  useLocale: jest.fn(),
}));

jest.mock('../../../../src/utils/navigation', () => ({
  afterNavigationSettles: jest.fn((work: () => void) => work()),
  leaveCurrentScreen: jest.fn(() => Promise.resolve()),
}));

function mutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

describe('language settings', () => {
  const setLocale = jest.fn();
  const resetToDeviceLocale = jest.fn();
  const updateLocale = jest.fn(() => Promise.resolve(null));

  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useMutation).mockReturnValue(mutationMock(updateLocale));
    jest.mocked(useLocale).mockReturnValue({
      dateFnsLocale: DATE_FNS_LOCALES.en,
      defaultCurrency: 'USD',
      isFollowingDevice: false,
      locale: 'en',
      localeLabels: LOCALE_LABELS,
      resetToDeviceLocale,
      setLocale,
      supportedLocales: ['en', 'ko'],
      timezone: 'UTC',
      uses24HourClock: true,
      weekStartsOn: 0,
    });
  });

  const renderScreen = () =>
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
          <LanguageScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

  // The icon-less language rows started their dividers at the icon-row
  // inset, 44pt right of the language names.
  it('starts the language dividers under the language names', () => {
    const screen = renderScreen();
    const dividers = screen.getAllByTestId('settings-divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0]).toHaveStyle({marginLeft: 14});
  });

  it('uses exclusive cpk-ui radios instead of checkboxes', () => {
    const screen = renderScreen();

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    const english = screen.getByLabelText('English');
    const korean = screen.getByLabelText('한국어');
    expect(english.props.accessibilityRole).toBe('radio');
    expect(korean.props.accessibilityRole).toBe('radio');
    expect(english.props.accessibilityState).toEqual(
      expect.objectContaining({checked: true, disabled: false}),
    );
    expect(korean.props.accessibilityState).toEqual(
      expect.objectContaining({checked: false, disabled: false}),
    );

    fireEvent.press(korean);
    expect(screen.getByLabelText('English').props.accessibilityState).toEqual(
      expect.objectContaining({checked: false, disabled: false}),
    );
    expect(screen.getByLabelText('한국어').props.accessibilityState).toEqual(
      expect.objectContaining({checked: true, disabled: false}),
    );
  });

  it('applies the locale only after a successful save has left the screen', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('한국어'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save'));
    });

    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith({locale: 'ko'}),
    );
    expect(leaveCurrentScreen).toHaveBeenCalledTimes(1);
    expect(afterNavigationSettles).toHaveBeenCalledTimes(1);
    expect(setLocale).toHaveBeenCalledWith('ko');
    expect(setLocale.mock.invocationCallOrder[0]).toBeGreaterThan(
      jest.mocked(leaveCurrentScreen).mock.invocationCallOrder[0] ?? 0,
    );
  });
});
