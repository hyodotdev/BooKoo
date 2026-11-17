import {BOOKOO_PALETTE} from './bookooPalette';

export const LEDGER_COLOR_KEYS = [
  'PINK',
  'ORANGE',
  'YELLOW',
  'TEAL',
  'BLUE',
  'PURPLE',
] as const;

export type LedgerColorKey = (typeof LEDGER_COLOR_KEYS)[number];

/** Brand mint. Empty-ledger chrome and a new ledger start on this colour. */
export const BRAND_LEDGER_COLOR: LedgerColorKey = 'TEAL';

export interface AccentSet {
  base: string;
  on: string;
  text: string;
  subtle: string;
  border: string;
}

export interface AccentSurface {
  background: string;
  foreground: string;
}

/**
 * Resolve the filled surface used by BooKooLegacy's colour-ledger chrome.
 * Both appearances keep the measured Legacy swatch and white filled-surface
 * labels. Semantic and disabled controls retain their own theme tokens.
 */
export function ledgerAccentSurface(
  accent: AccentSet,
  themeType: 'light' | 'dark',
): AccentSurface {
  return themeType === 'light'
    ? {background: accent.base, foreground: BOOKOO_PALETTE.white}
    : {background: accent.base, foreground: accent.on};
}

interface AccentModes {
  light: AccentSet;
  dark: AccentSet;
}

export const LEDGER_ACCENTS: Record<LedgerColorKey, AccentModes> = {
  PINK: {
    light: {
      base: BOOKOO_PALETTE.carnation,
      on: BOOKOO_PALETTE.white,
      text: '#C42A50',
      subtle: '#FFF0F3',
      border: '#FFC5D0',
    },
    dark: {
      base: BOOKOO_PALETTE.carnation,
      on: BOOKOO_PALETTE.white,
      text: '#FF8FA8',
      subtle: '#3A1C25',
      border: '#5E2C3A',
    },
  },
  ORANGE: {
    light: {
      base: BOOKOO_PALETTE.orange,
      on: BOOKOO_PALETTE.white,
      text: '#A85A00',
      subtle: '#FFF7E9',
      border: '#FAD59A',
    },
    dark: {
      base: BOOKOO_PALETTE.orange,
      on: BOOKOO_PALETTE.white,
      text: '#F7A94A',
      subtle: '#3A2A12',
      border: '#5C4321',
    },
  },
  YELLOW: {
    light: {
      base: '#C09A00',
      on: BOOKOO_PALETTE.white,
      text: '#8A6D00',
      subtle: '#FFFBE5',
      border: '#F7E98A',
    },
    dark: {
      base: '#C09A00',
      on: BOOKOO_PALETTE.white,
      text: '#F2D14B',
      subtle: '#3A3312',
      border: '#5C5220',
    },
  },
  TEAL: {
    light: {
      base: BOOKOO_PALETTE.main,
      on: BOOKOO_PALETTE.white,
      text: '#08745E',
      subtle: '#EEFBF8',
      border: '#A8ECDD',
    },
    dark: {
      base: BOOKOO_PALETTE.main,
      on: BOOKOO_PALETTE.white,
      text: '#45E0B4',
      subtle: '#123329',
      border: '#1F5544',
    },
  },
  BLUE: {
    light: {
      base: BOOKOO_PALETTE.blue,
      on: BOOKOO_PALETTE.white,
      text: '#275DCC',
      subtle: '#EFF4FF',
      border: '#C2D6FF',
    },
    dark: {
      base: BOOKOO_PALETTE.blue,
      on: BOOKOO_PALETTE.white,
      text: '#7FB0FF',
      subtle: '#16233A',
      border: '#2C4370',
    },
  },
  PURPLE: {
    light: {
      base: BOOKOO_PALETTE.purple,
      on: BOOKOO_PALETTE.white,
      text: '#7B3FD4',
      subtle: '#F8F0FF',
      border: '#DFC2FA',
    },
    dark: {
      base: BOOKOO_PALETTE.purple,
      on: BOOKOO_PALETTE.white,
      text: '#C79BFF',
      subtle: '#2A1B3F',
      border: '#452C63',
    },
  },
};

/** Filled mint chrome for empty-ledger and recovery in the original TEAL. */
export function brandLedgerSurface(themeType: 'light' | 'dark'): AccentSurface {
  return ledgerAccentSurface(LEDGER_ACCENTS.TEAL[themeType], themeType);
}
