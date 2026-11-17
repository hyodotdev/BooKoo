import type {ReactElement} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {NoLedgerEmptyCanvas} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';
import {BOOKOO_PALETTE} from '../../../../src/theme/bookooPalette';
import {
  LEDGER_ACCENTS,
  brandLedgerSurface,
} from '../../../../src/theme/ledgerAccent';

const renderInTheme = (
  ui: ReactElement,
  themeType: 'light' | 'dark' = 'light',
): ReturnType<typeof render> =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: themeType}}
      >
        {ui}
      </CpkProvider>
    </SafeAreaProvider>,
  );

describe('no-ledger empty canvas', () => {
  it('matches the Legacy Main empty ledger: sad-face mark, copy, solid add', () => {
    const onAdd = jest.fn();
    const onOpenDrawer = jest.fn();
    const screen = renderInTheme(
      <NoLedgerEmptyCanvas onAdd={onAdd} onOpenDrawer={onOpenDrawer} />,
    );

    expect(screen.getByTestId('no-ledger-empty')).toBeTruthy();
    expect(screen.getByTestId('no-ledger-mark')).toBeTruthy();
    expect(
      screen.getByText('There is no ledger yet.\nPlease add one.'),
    ).toBeTruthy();
    expect(screen.getByTestId('no-ledger-add')).toHaveStyle({marginTop: 24});
    expect(screen.getByTestId('button-container')).not.toHaveStyle({
      marginTop: 24,
    });
    fireEvent.press(screen.getByTestId('no-ledger-add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('ledger-header-menu'));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ledger-header-menu')).toHaveStyle({
      borderRadius: 28,
      height: 56,
      overflow: 'hidden',
      width: 56,
    });
    expect(screen.getByTestId('no-ledger-header')).toHaveStyle({
      backgroundColor: brandLedgerSurface('light').background,
    });
    expect(screen.getByTestId('button-container')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.light.base,
      minWidth: 160,
    });
    expect(screen.getByText('Add ledger')).toHaveStyle({
      color: BOOKOO_PALETTE.white,
    });
  });

  it('keeps the original TEAL for empty chrome in dark mode', () => {
    const screen = renderInTheme(
      <NoLedgerEmptyCanvas onAdd={jest.fn()} onOpenDrawer={jest.fn()} />,
      'dark',
    );

    expect(screen.getByTestId('no-ledger-header')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.dark.base,
    });
    expect(screen.getByTestId('button-container')).toHaveStyle({
      backgroundColor: LEDGER_ACCENTS.TEAL.dark.base,
      minWidth: 160,
    });
    expect(screen.getByText('Add ledger')).toHaveStyle({
      color: BOOKOO_PALETTE.white,
    });
    expect(LEDGER_ACCENTS.TEAL.dark.base).toBe(LEDGER_ACCENTS.TEAL.light.base);
  });
});
