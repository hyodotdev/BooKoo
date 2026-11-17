import {
  CATEGORY_COLOR_TOKENS,
  type CategoryColorToken,
} from '@shared/categories';
import {BOOKOO_PALETTE} from './bookooPalette';

export {CATEGORY_COLOR_TOKENS};
export type {CategoryColorToken};

interface CategoryColorModes {
  light: string;
  dark: string;
}

export const CATEGORY_COLORS: Record<CategoryColorToken, CategoryColorModes> = {
  'category.red': {light: '#B4232F', dark: '#FF7A85'},
  'category.brown': {light: '#7A4F2A', dark: '#C99162'},
  'category.orange': {light: '#9B4D00', dark: '#F39B50'},
  'category.purple': {light: '#7139B2', dark: '#C79BFF'},
  'category.blue': {light: '#275DCC', dark: '#7FB0FF'},
  'category.navy': {light: '#304778', dark: '#8FA6D8'},
  'category.teal': {light: '#0B7360', dark: '#45E0B4'},
  'category.green': {light: '#2F6F3E', dark: '#70D98B'},
  'category.yellow': {light: '#7A6300', dark: '#F2D14B'},
  'category.slate': {light: '#506078', dark: '#AAB7CE'},
  'category.pink': {light: '#B22D6B', dark: '#FF8FC5'},
  'category.grey': {light: '#596273', dark: '#A7B0C1'},
  'category.indigo': {light: '#513DB6', dark: '#A99BFF'},
  'category.lime': {light: '#4F7100', dark: '#A6D95B'},
  'category.sky': {light: '#17698D', dark: '#69C2E8'},
};

export type ChartThemeMode = 'light' | 'dark';

/**
 * Ranked Stats colours after the active ledger colour.
 *
 * BooKooLegacy's donut prepended the ledger colour, then cycled through this
 * public BooKoo palette. Keep this separate from stored category colours:
 * categories own picker/icon identity, while a chart needs a balanced series
 * whose adjacent slices remain distinct regardless of which categories rank.
 */
export const STATS_SERIES_PALETTE = {
  light: [
    BOOKOO_PALETTE.cloudyBlue,
    BOOKOO_PALETTE.carnation,
    BOOKOO_PALETTE.orange,
    BOOKOO_PALETTE.yellow,
    BOOKOO_PALETTE.main,
    BOOKOO_PALETTE.blue,
    BOOKOO_PALETTE.purple,
  ],
  dark: [
    '#AAB7CE',
    '#FF8FA8',
    '#F39B50',
    '#F2D14B',
    '#45E0B4',
    '#7FB0FF',
    '#C79BFF',
  ],
} as const satisfies Record<ChartThemeMode, readonly string[]>;

export function statsSeriesColor(
  index: number,
  themeMode: ChartThemeMode,
  ledgerAccent: string,
): string {
  if (index <= 0) return ledgerAccent;
  const palette = STATS_SERIES_PALETTE[themeMode];
  return palette[(index - 1) % palette.length] ?? palette[0];
}
