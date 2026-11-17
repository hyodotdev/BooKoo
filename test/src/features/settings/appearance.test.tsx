import 'react-native';

import type {ReactNode} from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AppearanceScreen} from '../../../../src/features/settings/screens';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';
import {Storage, storage} from '../../../../src/utils/storage';

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

describe('appearance settings', () => {
  beforeEach(() => {
    setActiveLocale('en');
    storage.delete(Storage.ThemeType);
  });

  it('uses exclusive cpk-ui radios instead of a check or caret', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <AppearanceScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    const system = screen.getByLabelText('System');
    const light = screen.getByLabelText('Light');
    const dark = screen.getByLabelText('Dark');
    expect(system.props.accessibilityRole).toBe('radio');
    expect(light.props.accessibilityRole).toBe('radio');
    expect(dark.props.accessibilityRole).toBe('radio');
    expect(system.props.accessibilityState).toEqual(
      expect.objectContaining({checked: true}),
    );
    expect(light.props.accessibilityState).toEqual(
      expect.objectContaining({checked: false}),
    );

    act(() => {
      fireEvent.press(dark);
    });
    expect(screen.getByLabelText('System').props.accessibilityState).toEqual(
      expect.objectContaining({checked: false}),
    );
    expect(screen.getByLabelText('Dark').props.accessibilityState).toEqual(
      expect.objectContaining({checked: true}),
    );

    act(() => {
      screen.unmount();
    });
  });
});
