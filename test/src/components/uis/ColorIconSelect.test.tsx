import 'react-native';

import {fireEvent, render, within} from '@testing-library/react-native';
import {CpkProvider, EditText} from 'cpk-ui';
import {Dimensions} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ColorIconSelectScreen} from '../../../../src/components/uis/ColorIconSelect';
import {theme} from '../../../../src/theme';

const colors = [
  {accessibilityLabel: 'TEAL', color: '#1DD3A8', value: 'TEAL'},
  {accessibilityLabel: 'PINK', color: '#FF728D', value: 'PINK'},
] as const;

const icons = [
  {group: 'Expense', label: 'Meal', value: 'ForkKnife'},
  {group: 'Expense', label: 'Cafe', value: 'Coffee'},
  {group: 'Other', label: 'Star', value: 'Star'},
] as const;

describe('ColorIconSelectScreen', () => {
  it('applies the draft colour and icon and can close without applying', () => {
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
          <ColorIconSelectScreen
            applyLabel="Apply"
            colors={colors}
            icons={icons}
            onApply={onApply}
            onClose={onClose}
            searchPlaceholder="Search Icon"
            title="Select Color and Icon"
            value={{color: 'TEAL', icon: 'ForkKnife'}}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Select Color and Icon')).toBeTruthy();
    expect(screen.getByTestId('color-icon-select-search-frame')).toHaveStyle({
      marginHorizontal: 24,
    });
    expect(screen.UNSAFE_getByType(EditText).props.style).toBeUndefined();
    expect(screen.UNSAFE_getByType(EditText).props.styles.container).toEqual({
      borderRadius: 16,
    });
    expect(screen.getByTestId('color-icon-select-icon-ForkKnife')).toHaveStyle({
      borderRadius: 12,
      justifyContent: 'center',
      paddingVertical: 8,
    });
    fireEvent.press(screen.getByTestId('color-icon-select-color-PINK'));
    fireEvent.press(screen.getByTestId('color-icon-select-icon-Star'));
    fireEvent.press(screen.getByTestId('color-icon-select-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('color-icon-select-color-PINK'));
    fireEvent.press(screen.getByTestId('color-icon-select-icon-Star'));
    fireEvent.press(screen.getByTestId('color-icon-select-apply'));
    expect(onApply).toHaveBeenCalledWith({color: 'PINK', icon: 'Star'});
  });

  it('sizes icon cells from its sheet, not the wider window', () => {
    // iPad landscape: a 700pt page sheet in a 1133pt window.
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({width: 1133, height: 744, scale: 2, fontScale: 1});
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 1133, height: 744},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <ColorIconSelectScreen
            applyLabel="Apply"
            colors={colors}
            icons={icons}
            onApply={jest.fn()}
            onClose={jest.fn()}
            searchPlaceholder="Search Icon"
            title="Select Color and Icon"
            value={{color: 'TEAL', icon: 'ForkKnife'}}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    fireEvent(screen.getByTestId('color-icon-select-screen'), 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 700, height: 700}},
    });

    // Eight 74pt columns across 700 - 2 * 24 padding - 7 * 8 gaps; the
    // 1133pt window alone would give thirteen 76pt columns.
    expect(screen.getByTestId('color-icon-select-icon-ForkKnife')).toHaveStyle({
      width: 74,
    });
    jest.restoreAllMocks();
  });

  it('gives icon names room for whole words on a phone', () => {
    // Six 51pt columns on an iPhone cut "Maintenance fee" to "Main...".
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
          <ColorIconSelectScreen
            applyLabel="Apply"
            colors={colors}
            icons={icons}
            onApply={jest.fn()}
            onClose={jest.fn()}
            searchPlaceholder="Search Icon"
            title="Select Color and Icon"
            value={{color: 'TEAL', icon: 'ForkKnife'}}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    fireEvent(screen.getByTestId('color-icon-select-screen'), 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 390, height: 844}},
    });

    // Four 79pt columns across 390 - 2 * 24 padding - 3 * 8 gaps.
    const cell = screen.getByTestId('color-icon-select-icon-ForkKnife');
    expect(cell).toHaveStyle({width: 79});
    // "Meal" is one word: it stays whole on one line, shrinking if needed.
    expect(within(cell).getByText(icons[0].label)).toHaveProp(
      'adjustsFontSizeToFit',
      true,
    );
    expect(within(cell).getByText(icons[0].label)).toHaveProp(
      'maxFontSizeMultiplier',
      1.25,
    );
  });

  it('filters icons by the search query', () => {
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
          <ColorIconSelectScreen
            applyLabel="Apply"
            colors={colors}
            icons={icons}
            onApply={jest.fn()}
            onClose={jest.fn()}
            searchPlaceholder="Search Icon"
            title="Select Color and Icon"
            value={{color: 'TEAL', icon: 'ForkKnife'}}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    fireEvent.changeText(
      screen.getByTestId('color-icon-select-search'),
      'star',
    );
    expect(screen.queryByTestId('color-icon-select-icon-ForkKnife')).toBeNull();
    expect(screen.getByTestId('color-icon-select-icon-Star')).toBeTruthy();
  });
});

describe('ColorIconSelect modal chrome', () => {
  it('pins the close control to the trailing edge for sheet presentation', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(
        process.cwd(),
        'src/components/uis/ColorIconSelect.tsx',
      ),
      'utf8',
    );
    expect(source).toContain("justifyContent: 'flex-end'");
  });
});
