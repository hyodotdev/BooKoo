import type {ImageSourcePropType} from 'react-native';

import {
  LEDGER_COLOR_KEYS,
  type LedgerColorKey,
} from './ledgerAccent';

export const LEDGER_ICONS: Readonly<
  Record<LedgerColorKey, ImageSourcePropType>
> = {
  PINK: require('../../assets/ledgers/ic_red.png'),
  ORANGE: require('../../assets/ledgers/ic_orange.png'),
  YELLOW: require('../../assets/ledgers/ic_yellow.png'),
  TEAL: require('../../assets/ledgers/ic_green.png'),
  BLUE: require('../../assets/ledgers/ic_blue.png'),
  PURPLE: require('../../assets/ledgers/ic_purple.png'),
};

const ledgerColorSet: ReadonlySet<string> = new Set(LEDGER_COLOR_KEYS);

export const ledgerIconSource = (colorKey: string): ImageSourcePropType =>
  LEDGER_ICONS[
    ledgerColorSet.has(colorKey) ? (colorKey as LedgerColorKey) : 'TEAL'
  ];
