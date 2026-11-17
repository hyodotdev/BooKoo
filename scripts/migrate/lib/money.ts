import {exponentOf, scaleOf as sharedScaleOf} from '../../../shared/currency';
import {roundHalfAwayFromZero} from '../../../shared/money';

export const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

export type LegacyCurrencyEvidence =
  'KRW' | 'JPY' | 'USD' | 'EUR' | 'CNY' | 'IDR' | 'OTHER' | 'UNKNOWN';

export const scaleOf = (currency: string): number => sharedScaleOf(currency);

export const toMinor = (major: number, currency: string): number => {
  if (!Number.isFinite(major)) throw new Error('amount is not finite');
  const minor = roundHalfAwayFromZero(major * scaleOf(currency));
  if (!Number.isSafeInteger(minor) || minor === 0)
    throw new Error('amount cannot be represented safely');
  return minor;
};

const AFFIX_TO_EVIDENCE: Readonly<Record<string, LegacyCurrencyEvidence>> = {
  '₩': 'KRW',
  원: 'KRW',
  KRW: 'KRW',
  $: 'USD',
  USD: 'USD',
  '¥': 'JPY',
  '￥': 'JPY',
  円: 'JPY',
  JPY: 'JPY',
  '€': 'EUR',
  EUR: 'EUR',
  CNY: 'CNY',
  RMB: 'CNY',
  元: 'CNY',
  IDR: 'IDR',
  Rp: 'IDR',
  IND: 'IDR',
};

export function parseAmountEvidence(value: unknown): LegacyCurrencyEvidence {
  if (typeof value !== 'string' || value.trim() === '') return 'UNKNOWN';
  const affix = value.replace(/[\d\s.,+\-\u00a0\u202f]/gu, '');
  if (affix === '') return 'UNKNOWN';
  return (
    AFFIX_TO_EVIDENCE[affix] ??
    AFFIX_TO_EVIDENCE[affix.toUpperCase()] ??
    'OTHER'
  );
}

export const decimalPlaces = (currency: string): number => exponentOf(currency);

export type MoneyAnomaly =
  'ZERO_AMOUNT' | 'AMOUNT_SIGN_CATEGORY_MISMATCH' | 'LOSSY_AMOUNT_CONVERSION';

export function toMoney(
  realAmount: unknown,
  legacyCategoryKind: 0 | 1 | undefined,
  currency: string,
): {
  type: 'EXPENSE' | 'INCOME';
  amountMinor: number;
  anomalies: MoneyAnomaly[];
} {
  if (typeof realAmount !== 'number' || !Number.isFinite(realAmount))
    throw new Error('realAmount must be finite');
  const anomalies: MoneyAnomaly[] = [];
  const type =
    realAmount < 0
      ? 'EXPENSE'
      : realAmount > 0
        ? 'INCOME'
        : legacyCategoryKind === 1
          ? 'INCOME'
          : 'EXPENSE';
  if (realAmount === 0) anomalies.push('ZERO_AMOUNT');
  const implied =
    legacyCategoryKind === 1
      ? 'INCOME'
      : legacyCategoryKind === 0
        ? 'EXPENSE'
        : undefined;
  if (implied !== undefined && implied !== type)
    anomalies.push('AMOUNT_SIGN_CATEGORY_MISMATCH');
  const scaled = Math.abs(realAmount) * scaleOf(currency);
  const amountMinor = roundHalfAwayFromZero(scaled);
  if (Math.abs(scaled - amountMinor) > 1e-9)
    anomalies.push('LOSSY_AMOUNT_CONVERSION');
  if (!Number.isSafeInteger(amountMinor) || amountMinor === 0)
    throw new Error('amount cannot be represented safely');
  return {type, amountMinor, anomalies};
}
