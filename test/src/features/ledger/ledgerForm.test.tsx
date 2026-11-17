import type {ReactElement} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerForm} from '../../../../src/features/ledger/ledgerForm';
import {theme} from '../../../../src/theme';
import {
  LEDGER_ACCENTS,
  ledgerAccentSurface,
} from '../../../../src/theme/ledgerAccent';
import {CIRCULAR_ICON_TARGET} from '../../../../src/theme/layout';
import {setActiveLocale} from '../../../../src/utils/i18n';

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

const renderInTheme = (ui: ReactElement, themeType: 'light' | 'dark') =>
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

describe.each(['light', 'dark'] as const)(
  'ledger form in %s mode',
  (themeType) => {
    beforeEach(() => setActiveLocale('en'));

    it('distinguishes empty prompts from entered text', () => {
      const screen = renderInTheme(
        <LedgerForm onSubmit={async () => undefined} />,
        themeType,
      );
      const foreground = ledgerAccentSurface(
        LEDGER_ACCENTS.TEAL[themeType],
        themeType,
      ).foreground;
      for (const label of ['Title for ledger.', 'Description (optional)']) {
        const input = screen.getByLabelText(label);
        expect(input.props.placeholderTextColor).not.toBe(foreground);
        fireEvent.changeText(input, 'Weekend plans');
        expect(input).toHaveStyle({color: foreground});
      }
    });

    it('gives every enlarged input a line box at least as tall as its font', () => {
      const screen = renderInTheme(
        <LedgerForm onSubmit={async () => undefined} />,
        themeType,
      );
      for (const label of ['Title for ledger.', 'Description (optional)']) {
        const {fontSize, lineHeight} = StyleSheet.flatten(
          screen.getByLabelText(label).props.style,
        );
        expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
      }
    });

    it('submits the selected title, description, colour, icon, and currency', async () => {
      const onSubmit = jest.fn(() => Promise.resolve());
      const onBack = jest.fn();
      const screen = renderInTheme(
        <LedgerForm onBack={onBack} onSubmit={onSubmit} />,
        themeType,
      );

      expect(screen.getByLabelText('TEAL')).toHaveProp('accessibilityState', {
        checked: true,
      });
      expect(screen.getByTestId('ledger-form-color-TEAL')).toHaveStyle({
        backgroundColor: LEDGER_ACCENTS.TEAL[themeType].base,
      });
      expect(screen.getByTestId('ledger-form-completion')).toBeTruthy();
      expect(screen.getByTestId('ledger-form-done')).toBeTruthy();
      expect(screen.getByLabelText('Back')).toHaveStyle(CIRCULAR_ICON_TARGET);

      fireEvent.changeText(
        await screen.findByLabelText('Title for ledger.'),
        'QA Household',
      );
      fireEvent.changeText(
        screen.getByLabelText('Description (optional)'),
        'Release candidate walkthrough',
      );
      fireEvent.press(screen.getByLabelText('TEAL'));
      fireEvent.press(screen.getByTestId('ledger-form-shuffle'));
      fireEvent.press(screen.getByTestId('ledger-form-icon'));
      fireEvent.press(screen.getByTestId('color-icon-select-icon-Star'));
      fireEvent.press(screen.getByTestId('color-icon-select-apply'));
      fireEvent.press(screen.getByTestId('ledger-form-currency'));
      fireEvent.press(screen.getByTestId('option-select-KRW'));
      fireEvent.press(screen.getByTestId('option-select-apply'));
      fireEvent.press(screen.getByLabelText('Done'));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          baseCurrency: 'KRW',
          colorKey: 'TEAL',
          description: 'Release candidate walkthrough',
          iconKey: 'Star',
          title: 'QA Household',
        }),
      );
    });

    it('creates a ledger with only a title and keeps blank titles disabled', async () => {
      const onSubmit = jest.fn(() => Promise.resolve());
      const screen = renderInTheme(
        <LedgerForm onSubmit={onSubmit} />,
        themeType,
      );
      const title = screen.getByLabelText('Title for ledger.');
      const done = screen.getByTestId('ledger-form-done');
      expect(done).toBeDisabled();
      fireEvent.changeText(title, '   ');
      expect(done).toBeDisabled();
      fireEvent.changeText(title, 'Title only');
      expect(done).not.toBeDisabled();
      fireEvent.press(done);
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({title: 'Title only', description: ''}),
      ));
    });

    it('allows retry after a failed save and blocks repeat taps while saving', async () => {
      const onSubmit = jest
        .fn<Promise<void>, []>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined);
      const screen = renderInTheme(
        <LedgerForm onSubmit={onSubmit} />,
        themeType,
      );
      fireEvent.changeText(
        screen.getByLabelText('Title for ledger.'),
        'Household',
      );
      fireEvent.changeText(
        screen.getByLabelText('Description (optional)'),
        'Everyday expenses',
      );
      fireEvent.press(screen.getByLabelText('Done'));
      await waitFor(() =>
        expect(screen.getByLabelText('Done')).not.toBeDisabled(),
      );
      fireEvent.press(screen.getByLabelText('Done'));
      fireEvent.press(screen.getByLabelText('Done'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(screen.getByLabelText('Done')).toBeDisabled();
    });
  },
);


describe('ledger form picker presentation', () => {
  it('opens icon and currency pickers in a bottom slide modal', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(
        process.cwd(),
        'src/features/ledger/ledgerForm.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('animationType="slide"');
    expect(source).toContain('presentationStyle="pageSheet"');
    expect(source).toContain("visible={selecting === 'icon'}");
    expect(source).toContain("visible={selecting === 'currency'}");
    expect(source).not.toMatch(/if \(selecting === 'icon'\)\s*\n\s*return/);
  });
});
