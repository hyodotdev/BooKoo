import {BOOKOO_PALETTE} from './theme/bookooPalette';

export interface AppThemeColors {
  bg: {
    basic: string;
    paper: string;
    disabled: string;
    sheet: string;
    scrim: string;
    chrome: string;
    skeleton: string;
    highlight: string;
  };
  role: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    accent: string;
    link: string;
    border: string;
    underlay: string;
    underlayContrast: string;
    divider: string;
    income: string;
    expense: string;
    chartGrid: string;
    focus: string;
  };
  text: {
    basic: string;
    label: string;
    placeholder: string;
    disabled: string;
    validation: string;
    contrast: string;
    income: string;
    expense: string;
    weekend: string;
  };
  button: {
    primary: ButtonColors;
    secondary: ButtonColors;
    success: ButtonColors;
    warning: ButtonColors;
    danger: ButtonColors;
    info: ButtonColors;
    light: ButtonColors;
    disabled: ButtonColors;
  };
}

interface ButtonColors {
  bg: string;
  text: string;
}

export const light = {
  bg: {
    basic: BOOKOO_PALETTE.white,
    paper: BOOKOO_PALETTE.whiteGray,
    disabled: BOOKOO_PALETTE.paleGrey,
    sheet: BOOKOO_PALETTE.white,
    scrim: 'rgba(41,39,103,0.42)',
    chrome: '#FFFFFF',
    skeleton: BOOKOO_PALETTE.paleGrey,
    highlight: '#EEFBF8',
  },
  role: {
    primary: BOOKOO_PALETTE.main,
    secondary: BOOKOO_PALETTE.blue,
    success: BOOKOO_PALETTE.main,
    warning: BOOKOO_PALETTE.orange,
    danger: BOOKOO_PALETTE.carnation,
    info: BOOKOO_PALETTE.blue,
    accent: BOOKOO_PALETTE.main,
    link: '#08745E',
    border: BOOKOO_PALETTE.paleGrey,
    underlay: 'rgba(29,211,168,0.10)',
    underlayContrast: 'rgba(0,0,0,0.80)',
    divider: BOOKOO_PALETTE.paleGrey,
    income: '#08745E',
    expense: '#B92F49',
    chartGrid: BOOKOO_PALETTE.paleGrey,
    focus: BOOKOO_PALETTE.main,
  },
  text: {
    basic: BOOKOO_PALETTE.dusk,
    label: '#5F6C87',
    placeholder: '#65748F',
    disabled: '#A0A7B8',
    validation: '#B92F49',
    contrast: BOOKOO_PALETTE.white,
    income: '#08745E',
    expense: '#B92F49',
    weekend: '#B92F49',
  },
  button: {
    primary: {bg: BOOKOO_PALETTE.main, text: BOOKOO_PALETTE.white},
    secondary: {bg: BOOKOO_PALETTE.dusk, text: BOOKOO_PALETTE.white},
    success: {bg: BOOKOO_PALETTE.main, text: '#292767'},
    warning: {bg: BOOKOO_PALETTE.orange, text: '#292767'},
    danger: {bg: BOOKOO_PALETTE.carnation, text: '#292767'},
    info: {bg: BOOKOO_PALETTE.blue, text: '#292767'},
    light: {bg: BOOKOO_PALETTE.whiteGray, text: BOOKOO_PALETTE.dusk},
    disabled: {bg: '#DDE2EC', text: '#65748F'},
  },
} satisfies AppThemeColors;

export const dark = {
  bg: {
    basic: '#263149',
    paper: '#202A40',
    disabled: '#414D6B',
    sheet: '#2E3952',
    scrim: 'rgba(0,0,0,0.60)',
    chrome: '#414D6B',
    skeleton: '#414D6B',
    highlight: '#203D3A',
  },
  role: {
    primary: '#34E0B7',
    secondary: '#7FB0FF',
    success: '#4ADE80',
    warning: '#F5C451',
    danger: '#FF7A85',
    info: '#7FB0FF',
    accent: '#34E0B7',
    link: '#7FB0FF',
    border: '#2A3245',
    underlay: 'rgba(52,224,183,0.14)',
    underlayContrast: 'rgba(255,255,255,0.80)',
    divider: '#212938',
    income: '#4ADE80',
    expense: '#FF7A85',
    chartGrid: '#252E40',
    focus: '#34E0B7',
  },
  text: {
    basic: '#F2F5FA',
    label: '#B9C2D4',
    placeholder: '#919CB2',
    disabled: '#5C687D',
    validation: '#FF7A85',
    contrast: '#292767',
    income: '#4ADE80',
    expense: '#FF7A85',
    weekend: '#FF7A85',
  },
  button: {
    primary: {bg: '#34E0B7', text: '#292767'},
    secondary: {bg: '#2A3245', text: '#F2F5FA'},
    success: {bg: '#4ADE80', text: '#06230F'},
    warning: {bg: '#F5C451', text: '#2B1D00'},
    danger: {bg: '#FF7A85', text: '#2A0509'},
    info: {bg: '#7FB0FF', text: '#04122B'},
    light: {bg: '#414D6B', text: '#F2F5FA'},
    disabled: {bg: '#343F58', text: '#8793AA'},
  },
} satisfies AppThemeColors;

export const theme = {light, dark};
