import type {
  ColorIconSelectColor,
  ColorIconSelectIcon,
} from '~/components/uis/ColorIconSelect';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {i18n, t} from '~/utils/i18n';
import {
  LEDGER_ICON_CATALOG,
  type LedgerIconGroup,
} from '@shared/ledgerIcons';

const groupTitle = (group: LedgerIconGroup): string => {
  switch (group) {
    case 'expense':
      return t('icon.expense');
    case 'income':
      return t('icon.income');
    case 'other':
      return t('icon.groupOther');
  }
};

export const ledgerColorSelectItems = (
  mode: 'dark' | 'light',
): readonly ColorIconSelectColor<LedgerColorKey>[] =>
  LEDGER_COLOR_KEYS.map((key) => ({
    accessibilityLabel: key,
    color: LEDGER_ACCENTS[key][mode].base,
    value: key,
  }));

export const ledgerIconSelectItems = (): readonly ColorIconSelectIcon[] =>
  LEDGER_ICON_CATALOG.map((entry) => ({
    group: groupTitle(entry.group),
    label: i18n.t<string>(entry.i18nKey),
    value: entry.icon,
  }));
