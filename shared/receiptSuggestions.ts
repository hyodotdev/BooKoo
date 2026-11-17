import {currencyChrome, exponentOf, isSupportedCurrency} from './currency';
import {isValidDayKey, makeDayKey, type DayKey} from './date';
import {isValidAmountMinor, parseMoneyInput} from './money';

export interface ReceiptSuggestions {
  readonly amountMinor: number | null;
  readonly currencyMismatch: boolean;
  readonly dayKey: DayKey | null;
}

const TOTAL =
  /(?:\b(?:grand\s+total|amount\s+due|total|gesamt|summe|totaal|totale|montant|montante|ttc)\b|합계|총액|결제\s*금액|合計|支払金額|总计|合计|总额)/iu;
const NOT_TOTAL =
  /(?:\b(?:sub\s*total|subtotal|tax|vat|iva|ht|change|cash|tendered|discount|tip)\b|小計|소계|부가세|거스름|优惠|折扣)/iu;
const MONEY = /[-−]?\d(?:[\d.,'\u00a0\u202f ]*\d)?/gu;
const CURRENCY_HINTS: readonly [RegExp, string][] = [
  [/\bUSD\b/iu, 'USD'],
  [/\bEUR\b|€/iu, 'EUR'],
  [/\bGBP\b|£/iu, 'GBP'],
  [/\bKRW\b|₩|\d[\d,. ]*원(?:\s|$)/iu, 'KRW'],
  [/\bJPY\b|円/iu, 'JPY'],
  [/\bCNY\b|人民币/iu, 'CNY'],
  [/\bIDR\b|\bRp\.?\s*\d/iu, 'IDR'],
];

function receiptAmount(token: string, currency: string): number | null {
  if (/[-−]/u.test(token)) return null;
  const compact = token.replace(/[\s']/gu, '');
  const last = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf(','));
  const tail = last < 0 ? 0 : compact.length - last - 1;
  const groupOnly = tail === 3 && exponentOf(currency) !== 3;
  const locale =
    last >= 0 && compact[last] === ','
      ? groupOnly
        ? 'en'
        : 'de'
      : groupOnly
        ? 'de'
        : 'en';
  const parsed = parseMoneyInput(compact, currency, locale);
  return parsed.ok &&
    !parsed.rounded &&
    parsed.minor > 0 &&
    isValidAmountMinor(parsed.minor)
    ? parsed.minor
    : null;
}

function receiptDay(line: string, locale: string): DayKey | null {
  if (/expiry|expires|valid\s+until|유효|期限/iu.test(line)) return null;
  const yearFirst =
    /\b(20\d{2})\s*[-/.年년]\s*(\d{1,2})\s*[-/.月월]\s*(\d{1,2})(?:日|일)?\b/u.exec(
      line,
    );
  const yearLast = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/u.exec(line);
  let year: number;
  let month: number;
  let day: number;
  if (yearFirst !== null) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = Number(yearFirst[3]);
  } else if (yearLast !== null) {
    year = Number(yearLast[3]);
    const first = Number(yearLast[1]);
    const second = Number(yearLast[2]);
    const monthFirst =
      first <= 12 && (second > 12 || locale === 'en' || locale === 'en-US');
    month = monthFirst ? first : second;
    day = monthFirst ? second : first;
  } else return null;
  const result = makeDayKey(year, month, day);
  return isValidDayKey(result) ? result : null;
}

/** Conservative draft candidates. Multiple different totals/dates stay manual. */
export function receiptSuggestions(
  input: readonly string[],
  currency: string,
  locale: string,
): ReceiptSuggestions {
  const lines = input
    .slice(0, 300)
    .flatMap((block) => block.slice(0, 4000).normalize('NFKC').split(/\r?\n/u));
  const text = lines.join('\n');
  const printedCodes = text.match(/\b[A-Z]{3}\b/gu) ?? [];
  const currencyMismatch =
    printedCodes.some((code) => isSupportedCurrency(code) && code !== currency) ||
    CURRENCY_HINTS.some(
      ([pattern, code]) => code !== currency && pattern.test(text),
    ) ||
    (text.includes('$') &&
      !currencyChrome('en', currency).symbol.includes('$')) ||
    (text.includes('¥') && currency !== 'JPY' && currency !== 'CNY');
  const amounts = new Set<number>();
  const days = new Set<DayKey>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const day = receiptDay(line, locale);
    if (day !== null) days.add(day);
    if (currencyMismatch || !TOTAL.test(line) || NOT_TOTAL.test(line)) continue;
    let tokens = line.match(MONEY) ?? [];
    if (
      tokens.length === 0 &&
      index + 1 < lines.length &&
      !NOT_TOTAL.test(lines[index + 1])
    )
      tokens = lines[index + 1].match(MONEY) ?? [];
    // A total containing quantity/date/card digits is ambiguous; never pick the largest number.
    if (tokens.length !== 1) continue;
    const amount = receiptAmount(tokens[0], currency);
    if (amount !== null) amounts.add(amount);
  }
  return {
    amountMinor: amounts.size === 1 ? [...amounts][0] : null,
    currencyMismatch,
    dayKey: days.size === 1 ? [...days][0] : null,
  };
}
