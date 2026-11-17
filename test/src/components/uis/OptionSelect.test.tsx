import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {OptionSelectScreen} from '../../../../src/components/uis/OptionSelect';
import {theme} from '../../../../src/theme';

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      testID,
    }: {
      data: readonly {value: string}[];
      renderItem: (info: {item: {value: string}}) => import('react').ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        View,
        {testID},
        data.map((item) =>
          React.createElement(View, {key: item.value}, renderItem({item})),
        ),
      ),
  };
});

const options = [
  {label: 'KRW | ₩', value: 'KRW'},
  {label: 'USD | $', value: 'USD'},
] as const;

describe('OptionSelectScreen', () => {
  it('applies the draft selection and can close without applying', () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <OptionSelectScreen
            applyLabel="Apply"
            onApply={onApply}
            onClose={onClose}
            options={options}
            title="Select currency"
            value="KRW"
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Select currency')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByLabelText('KRW | ₩').props.accessibilityRole).toBe(
      'radio',
    );
    expect(
      screen.getByLabelText('KRW | ₩').props.accessibilityState,
    ).toEqual(expect.objectContaining({checked: true}));
    expect(
      screen.getByLabelText('USD | $').props.accessibilityState,
    ).toEqual(expect.objectContaining({checked: false}));
    fireEvent.press(screen.getByTestId('option-select-USD'));
    fireEvent.press(screen.getByTestId('option-select-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('option-select-USD'));
    fireEvent.press(screen.getByTestId('option-select-apply'));
    expect(onApply).toHaveBeenCalledWith('USD');
  });

  it('filters options by the search query', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <OptionSelectScreen
            applyLabel="Apply"
            onApply={jest.fn()}
            onClose={jest.fn()}
            options={options}
            searchPlaceholder="Search currency"
            title="Select currency"
            value="KRW"
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.changeText(screen.getByTestId('option-select-search'), 'usd');
    expect(screen.queryByTestId('option-select-KRW')).toBeNull();
    expect(screen.getByTestId('option-select-USD')).toBeTruthy();
  });
});
