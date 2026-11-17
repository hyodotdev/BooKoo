import 'react-native';

import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  BookooButton,
  type BookooButtonProps,
} from '../../../../src/components/uis/BookooButton';
import {dark, light, theme} from '../../../../src/theme';
import {BOOKOO_PALETTE} from '../../../../src/theme/bookooPalette';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
} from '../../../../src/theme/ledgerAccent';

function renderButton(
  mode: 'light' | 'dark',
  props: Partial<BookooButtonProps> = {},
): ReturnType<typeof render> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider themeConfig={{customTheme: theme, initialThemeType: mode}}>
        <BookooButton
          accent={LEDGER_ACCENTS.YELLOW[mode]}
          onPress={jest.fn()}
          text="Add entry"
          type="outlined"
          {...props}
        />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('BookooButton ledger outline', () => {
  it.each(LEDGER_COLOR_KEYS)(
    'uses a white label on the dark %s fill',
    (key) => {
      const screen = renderButton('dark', {
        accent: LEDGER_ACCENTS[key].dark,
        type: 'solid',
      });
      expect(screen.getByText('Add entry')).toHaveStyle({
        color: BOOKOO_PALETTE.white,
      });
      expect(screen.getByTestId('button-container')).toHaveStyle({
        backgroundColor: LEDGER_ACCENTS[key].dark.base,
      });
    },
  );

  it.each(['light', 'dark'] as const)(
    'colours every outline edge with the ledger accent in %s mode',
    (mode) => {
      const accent = LEDGER_ACCENTS.YELLOW[mode];
      const screen = renderButton(mode);

      expect(screen.getByTestId('button-container')).toHaveStyle({
        borderTopColor: accent.text,
        borderBottomColor: accent.text,
        borderLeftColor: accent.text,
        borderRightColor: accent.text,
      });
    },
  );

  it.each(['light', 'dark'] as const)(
    'preserves cpk-ui disabled borders in %s mode',
    (mode) => {
      const screen = renderButton(mode, {disabled: true});
      const border = (mode === 'dark' ? dark : light).bg.disabled;
      expect(screen.getByLabelText('Add entry')).toBeDisabled();
      expect(screen.getByTestId('button-container')).toHaveStyle({
        borderTopColor: border,
        borderBottomColor: border,
        borderLeftColor: border,
        borderRightColor: border,
      });
    },
  );

  it.each(['light', 'dark'] as const)(
    'preserves semantic danger borders in %s mode',
    (mode) => {
      const screen = renderButton(mode, {color: 'danger'});
      const border = (mode === 'dark' ? dark : light).button.danger.bg;
      expect(screen.getByTestId('button-container')).toHaveStyle({
        borderTopColor: border,
        borderBottomColor: border,
        borderLeftColor: border,
        borderRightColor: border,
      });
    },
  );
});
