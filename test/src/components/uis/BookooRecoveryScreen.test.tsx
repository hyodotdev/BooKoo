import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {BookooRecoveryScreen} from '../../../../src/components/uis/BookooRecoveryScreen';
import {theme} from '../../../../src/theme';
import {LEDGER_ACCENTS} from '../../../../src/theme/ledgerAccent';

describe('BookooRecoveryScreen', () => {
  it('uses the empty-ledger canvas: mint header, white mark, outlined action', () => {
    const onPress = jest.fn();
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
          <BookooRecoveryScreen
            body="Try that again in a moment."
            code="BooKoo"
            icon="WarningCircle"
            primaryAction={{label: 'Try again', onPress}}
            testID="recovery"
            title="Something went wrong."
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('recovery-mark')).toHaveStyle({
      borderRadius: 40,
      height: 80,
      width: 80,
    });
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Try again')).toHaveStyle({
      borderRadius: 32,
      minHeight: 56,
    });
    // A fixed 56pt pill cut "Return home" in half at the largest text size.
    expect(
      StyleSheet.flatten(screen.getByLabelText('Try again').props.style).height,
    ).toBeUndefined();
    expect(screen.getByTestId('recovery-header')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.light.base,
    });
  });

  it('keeps the original TEAL in dark mode', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'dark'}}
        >
          <BookooRecoveryScreen
            body="Try that again in a moment."
            code="BooKoo"
            icon="WarningCircle"
            primaryAction={{label: 'Try again', onPress: jest.fn()}}
            testID="recovery"
            title="Something went wrong."
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('recovery-header')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.dark.base,
    });
    expect(screen.getByLabelText('Try again')).toHaveStyle({
      borderColor: LEDGER_ACCENTS.TEAL.dark.base,
    });
    expect(screen.getByText('Try again')).toHaveStyle({
      color: LEDGER_ACCENTS.TEAL.dark.base,
    });
  });
});
