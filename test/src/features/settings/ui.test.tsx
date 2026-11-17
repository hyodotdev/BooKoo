import 'react-native';

import {render} from '@testing-library/react-native';
import {StyleSheet, View} from 'react-native';
import {CpkProvider} from 'cpk-ui';
import {useKeyboardState} from 'react-native-keyboard-controller';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  SettingsBottomAction,
  SettingsPage,
} from '../../../../src/features/settings/ui';
import {theme} from '../../../../src/theme';
import {LEDGER_ACCENTS} from '../../../../src/theme/ledgerAccent';

describe('settings bottom action', () => {
  afterEach(() => {
    (useKeyboardState as jest.Mock).mockReturnValue(false);
  });

  it('covers the bottom safe area and exposes an accessible loading state', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <SettingsPage
            footer={
              <SettingsBottomAction loading onPress={jest.fn()} text="Save" />
            }
          >
            <></>
          </SettingsPage>
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('settings-keyboard-sticky')).toBeTruthy();
    const saveButton = screen.getByRole('button', {name: 'Save'});
    expect(saveButton.props.accessibilityState).toEqual(
      expect.objectContaining({busy: true, disabled: true}),
    );
    expect(
      screen
        .UNSAFE_getAllByType(View)
        .some(
          (view) =>
            StyleSheet.flatten(view.props.style)?.backgroundColor ===
            LEDGER_ACCENTS.TEAL.light.base,
        ),
    ).toBe(true);
    expect(screen.getByTestId('loading-view')).toHaveStyle({
      paddingBottom: 45,
    });
  });

  it('removes the bottom safe-area inset while the keyboard is visible', () => {
    (useKeyboardState as jest.Mock).mockReturnValue(true);
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <SettingsBottomAction loading onPress={jest.fn()} text="Send" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('loading-view')).toHaveStyle({
      paddingBottom: 16,
    });
  });
});
