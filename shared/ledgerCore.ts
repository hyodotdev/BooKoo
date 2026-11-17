import {isSupportedCurrency, normalizeCurrencyCode} from './currency';
import {isValidAmountMinor} from './money';

export const CLIENT_REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isClientRequestId = (value: string): boolean =>
  CLIENT_REQUEST_ID_RE.test(value);

export const normalizeNewCurrency = (value: string): string | null => {
  const currency = normalizeCurrencyCode(value);
  return isSupportedCurrency(currency) ? currency : null;
};

export const isValidItemMoney = (
  amountMinor: number,
  currency: string,
  baseCurrency: string,
): boolean =>
  isValidAmountMinor(amountMinor) &&
  normalizeNewCurrency(currency) === currency &&
  currency === baseCurrency;

export const isValidLedgerTitle = (title: string): boolean =>
  title.trim().length > 0;

export const isValidWeekStartsOn = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 6;

export const isValidPeriodStartDay = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= 28;

export interface RollupValue {
  readonly expenseMinor: number;
  readonly incomeMinor: number;
  readonly itemCount: number;
}

export const ZERO_ROLLUP: RollupValue = {
  expenseMinor: 0,
  incomeMinor: 0,
  itemCount: 0,
};

export const addRollup = (
  left: RollupValue,
  right: RollupValue,
): RollupValue => ({
  expenseMinor: left.expenseMinor + right.expenseMinor,
  incomeMinor: left.incomeMinor + right.incomeMinor,
  itemCount: left.itemCount + right.itemCount,
});

export const isSafeRollup = (value: RollupValue): boolean =>
  Number.isSafeInteger(value.expenseMinor) &&
  Number.isSafeInteger(value.incomeMinor) &&
  Number.isSafeInteger(value.itemCount) &&
  value.itemCount >= 0;

export const rollupTransition = (
  oldIdentity: string | null,
  newIdentity: string | null,
): readonly (1 | -1)[] => {
  if (oldIdentity === null) return newIdentity === null ? [] : [1];
  if (newIdentity === null) return [-1];
  return oldIdentity === newIdentity ? [] : [-1, 1];
};

export interface ItemRollupIdentityInput {
  readonly ledgerId: string;
  readonly authorId: string;
  readonly type: string;
  readonly baseAmountMinor: number;
  readonly dayKey: number;
  readonly monthKey: number;
  readonly categoryKey: string;
}

export const itemRollupIdentities = (
  item: ItemRollupIdentityInput,
): {readonly day: string; readonly month: string; readonly categoryMonth: string} => {
  const common = [
    item.ledgerId,
    item.authorId,
    item.type,
    item.baseAmountMinor,
  ];
  return {
    day: [...common, item.dayKey].join('|'),
    month: [...common, item.monthKey].join('|'),
    categoryMonth: [...common, item.monthKey, item.categoryKey].join('|'),
  };
};
