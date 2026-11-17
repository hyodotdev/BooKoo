import {SYSTEM_CATEGORIES} from '../../../shared/categories';
import en from '../../../assets/langs/en.json';
import id from '../../../assets/langs/id.json';
import ja from '../../../assets/langs/ja.json';
import ko from '../../../assets/langs/ko.json';
import zh from '../../../assets/langs/zh.json';
import {stableHash8} from './hash';

export const PRESET_BY_LEGACY_ICON_ID = new Map<
  number,
  (typeof SYSTEM_CATEGORIES)[number]
>(SYSTEM_CATEGORIES.map((category) => [category.legacyIconId, category]));

const catalogs = [
  en.category,
  ko.category,
  ja.category,
  zh.category,
  id.category,
];
export const LEGACY_LABELS = new Map<number, Set<string>>(
  SYSTEM_CATEGORIES.map((category) => [
    category.legacyIconId,
    new Set(
      catalogs.map((catalog) =>
        String(catalog[category.key as keyof typeof catalog] ?? '')
          .normalize('NFKC')
          .trim()
          .toLocaleLowerCase(),
      ),
    ),
  ]),
);

export interface ClassifiedCategory {
  key: string;
  source: 'PRESET' | 'CUSTOM';
  kind: 'EXPENSE' | 'INCOME';
  iconKey: string;
  colorToken: string;
  sortOrder: number;
  legacyIconId?: number;
  label?: string;
}

export function classifyTriple(
  iconId: number | undefined,
  label: string | undefined,
  type: 'EXPENSE' | 'INCOME',
): ClassifiedCategory {
  const preset =
    iconId === undefined ? undefined : PRESET_BY_LEGACY_ICON_ID.get(iconId);
  const normalizedLabel = label?.normalize('NFKC').trim().toLocaleLowerCase();
  const knownLabel =
    normalizedLabel === undefined ||
    normalizedLabel === '' ||
    LEGACY_LABELS.get(iconId ?? -1)?.has(normalizedLabel) === true;
  if (preset !== undefined && knownLabel) {
    return {
      key: preset.key,
      source: 'PRESET',
      kind: preset.kind,
      iconKey: preset.icon,
      colorToken: preset.colorToken,
      sortOrder: preset.sortOrder,
      legacyIconId: preset.legacyIconId,
    };
  }
  const displayLabel = label?.trim() || 'Uncategorized';
  return {
    key: `c_${stableHash8(`${iconId ?? 'x'}|${displayLabel}`)}`,
    source: 'CUSTOM',
    kind: preset?.kind ?? type,
    iconKey: preset?.icon ?? 'Question',
    colorToken: preset?.colorToken ?? 'category.grey',
    sortOrder: type === 'EXPENSE' ? 900 : 1900,
    legacyIconId: iconId,
    label: displayLabel,
  };
}
