import {dark, light} from '../../src/theme';
import {BOOKOO_PALETTE} from '../../src/theme/bookooPalette';
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_TOKENS,
  STATS_SERIES_PALETTE,
  statsSeriesColor,
} from '../../src/theme/chartPalette';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
  brandLedgerSurface,
  ledgerAccentSurface,
} from '../../src/theme/ledgerAccent';

const MINIMUM_TEXT_CONTRAST = 4.5;

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (channels === undefined || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex colour, received ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('BooKoo theme contrast', () => {
  it('keeps the Legacy visual identity tokens', () => {
    expect(light.bg.basic).toBe('#FFFFFF');
    expect(light.bg.paper).toBe('#F9FBFD');
    expect(light.text.basic).toBe('#414D6B');
    expect(light.text.contrast).toBe('#FFFFFF');
    expect(light.role.primary).toBe('#1DD3A9');
    expect(light.role.border).toBe('#DDE2EC');
    expect(LEDGER_ACCENTS.PINK.light.base).toBe('#FF728D');
    expect(LEDGER_ACCENTS.ORANGE.light.base).toBe('#F6A623');
    expect(LEDGER_ACCENTS.YELLOW.light.base).toBe('#C09A00');
    expect(LEDGER_ACCENTS.TEAL.light.base).toBe('#1DD3A9');
    expect(LEDGER_ACCENTS.BLUE.light.base).toBe('#679EFF');
    expect(LEDGER_ACCENTS.PURPLE.light.base).toBe('#B669F9');
  });

  it('matches the public BooKooOpen source palette', () => {
    expect(BOOKOO_PALETTE).toEqual({
      apple: '#000000',
      blue: '#679EFF',
      brandNavy: '#253250',
      carnation: '#FF728D',
      cloudyBlue: '#AFC2DB',
      dusk: '#414D6B',
      google: '#E04238',
      green: '#24CD97',
      lightGray: '#DDE2EC',
      main: '#1DD3A9',
      mediumGray: '#869AB7',
      orange: '#F6A623',
      paleGrey: '#DDE2EC',
      purple: '#B669F9',
      red: '#E6677E',
      white: '#FFFFFF',
      whiteGray: '#F9FBFD',
      yellow: '#EED100',
    });
  });

  it('uses the Legacy ranked Stats palette after the ledger colour', () => {
    expect(STATS_SERIES_PALETTE.light).toEqual([
      BOOKOO_PALETTE.cloudyBlue,
      BOOKOO_PALETTE.carnation,
      BOOKOO_PALETTE.orange,
      BOOKOO_PALETTE.yellow,
      BOOKOO_PALETTE.main,
      BOOKOO_PALETTE.blue,
      BOOKOO_PALETTE.purple,
    ]);
    expect(STATS_SERIES_PALETTE.dark).toEqual([
      '#AAB7CE',
      '#FF8FA8',
      '#F39B50',
      '#F2D14B',
      '#45E0B4',
      '#7FB0FF',
      '#C79BFF',
    ]);
    expect(new Set(STATS_SERIES_PALETTE.light).size).toBe(7);
    expect(new Set(STATS_SERIES_PALETTE.dark).size).toBe(7);
    expect(statsSeriesColor(0, 'light', '#123456')).toBe('#123456');
    expect(statsSeriesColor(1, 'light', '#123456')).toBe(
      BOOKOO_PALETTE.cloudyBlue,
    );
    expect(statsSeriesColor(8, 'light', '#123456')).toBe(
      BOOKOO_PALETTE.cloudyBlue,
    );
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s theme keeps informational text at AA contrast', (_, mode) => {
    const pairs = [
      [mode.text.basic, mode.bg.basic],
      [mode.text.basic, mode.bg.paper],
      [mode.text.label, mode.bg.basic],
      [mode.text.placeholder, mode.bg.basic],
      [mode.text.validation, mode.bg.basic],
      [mode.text.income, mode.bg.basic],
      [mode.text.income, mode.bg.paper],
      [mode.text.expense, mode.bg.basic],
      [mode.text.expense, mode.bg.paper],
      [mode.text.weekend, mode.bg.basic],
    ];

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
        MINIMUM_TEXT_CONTRAST,
      );
    }
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '%s theme keeps non-Legacy-primary button labels at AA contrast',
    (modeName, mode) => {
      const enabledButtons =
        modeName === 'light'
          ? [
              mode.button.secondary,
              mode.button.success,
              mode.button.warning,
              mode.button.danger,
              mode.button.info,
              mode.button.light,
            ]
          : [
              mode.button.primary,
              mode.button.secondary,
              mode.button.success,
              mode.button.warning,
              mode.button.danger,
              mode.button.info,
              mode.button.light,
            ];

      for (const button of enabledButtons) {
        expect(contrastRatio(button.text, button.bg)).toBeGreaterThanOrEqual(
          MINIMUM_TEXT_CONTRAST,
        );
      }
    },
  );

  it('uses the Legacy inverse label on light primary fills', () => {
    expect(light.button.primary).toEqual({
      bg: BOOKOO_PALETTE.main,
      text: BOOKOO_PALETTE.white,
    });
  });

  it('keeps accent text readable and filled labels white in both modes', () => {
    for (const key of LEDGER_COLOR_KEYS) {
      for (const [modeName, background, paper] of [
        ['light', light.bg.basic, light.bg.paper],
        ['dark', dark.bg.basic, dark.bg.paper],
      ] as const) {
        const accent = LEDGER_ACCENTS[key][modeName];
        // Product choice: white on the original swatches is not an AA claim.
        expect(accent.on).toBe(BOOKOO_PALETTE.white);
        expect(contrastRatio(accent.text, background)).toBeGreaterThanOrEqual(
          MINIMUM_TEXT_CONTRAST,
        );
        expect(contrastRatio(accent.text, paper)).toBeGreaterThanOrEqual(
          MINIMUM_TEXT_CONTRAST,
        );
      }
    }
  });

  it('keeps brand mint chrome on the original swatch in both modes', () => {
    expect(brandLedgerSurface('light').background).toBe(
      LEDGER_ACCENTS.TEAL.light.base,
    );
    expect(brandLedgerSurface('dark').background).toBe(
      LEDGER_ACCENTS.TEAL.dark.base,
    );
    expect(brandLedgerSurface('dark').background).toBe(
      brandLedgerSurface('light').background,
    );
  });

  it('uses one ledger identity swatch across appearances', () => {
    for (const key of LEDGER_COLOR_KEYS) {
      const lightAccent = LEDGER_ACCENTS[key].light;
      const darkAccent = LEDGER_ACCENTS[key].dark;

      expect(darkAccent.base).toBe(lightAccent.base);
      expect(darkAccent.on).toBe(lightAccent.on);
    }
  });

  it('keeps filled ledger surfaces on the Legacy swatches', () => {
    for (const key of LEDGER_COLOR_KEYS) {
      const lightSurface = ledgerAccentSurface(
        LEDGER_ACCENTS[key].light,
        'light',
      );
      const darkSurface = ledgerAccentSurface(LEDGER_ACCENTS[key].dark, 'dark');

      expect(lightSurface.background).toBe(LEDGER_ACCENTS[key].light.base);
      expect(darkSurface.background).toBe(lightSurface.background);
      expect(lightSurface.foreground).toBe(BOOKOO_PALETTE.white);
      expect(darkSurface.foreground).toBe(BOOKOO_PALETTE.white);
    }
  });

  it('keeps all category swatches distinguishable from their canvas', () => {
    for (const token of CATEGORY_COLOR_TOKENS) {
      expect(
        contrastRatio(CATEGORY_COLORS[token].light, light.bg.basic),
      ).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
      expect(
        contrastRatio(CATEGORY_COLORS[token].dark, dark.bg.basic),
      ).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
    }
  });
});
