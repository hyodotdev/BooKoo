import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {BookooSegmentedControl} from '../../../../src/components/uis/BookooSegmentedControl';
import {theme} from '../../../../src/theme';

describe('BookooSegmentedControl', () => {
  it('keeps a compact visual rail with accessible tab targets', () => {
    const onValueChange = jest.fn();
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
          <BookooSegmentedControl
            onValueChange={onValueChange}
            selectedValue="ALL"
            values={[
              {text: 'All', value: 'ALL'},
              {text: 'CONSUME', value: 'EXPENSE'},
              {text: 'INCOME', value: 'INCOME'},
            ]}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    const all = screen.getByRole('tab', {name: 'All'});
    expect(all).toHaveProp('accessibilityState', {selected: true});
    expect(screen.getByTestId('bookoo-segmented-control')).toHaveStyle({
      borderRadius: 22,
      height: 44,
    });
    expect(all).toHaveStyle({minHeight: 44});
    expect(screen.getByTestId('bookoo-segment-ALL')).toHaveStyle({
      borderRadius: 18,
      height: 36,
    });

    fireEvent.press(screen.getByRole('tab', {name: 'CONSUME'}));

    expect(onValueChange).toHaveBeenCalledWith('EXPENSE');
  });
});
