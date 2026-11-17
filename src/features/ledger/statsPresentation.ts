/**
 * A category's share of the total, 0–1, unrounded. Rounding to a whole
 * percent first made every label read "79.0%" and small shares "0.0%".
 */
export const statsShare = (amount: number, total: number): number =>
  total <= 0 ? 0 : Math.min(1, Math.max(0, amount / total));

export type StatsPresentationMode = 'ALL' | 'EXPENSE' | 'INCOME';

export interface StatsPresentationRollup {
  readonly expenseMinor: number;
  readonly incomeMinor: number;
}

/** Positive chart weight; refunds still keep their category visible. */
export const statsMagnitude = (
  row: StatsPresentationRollup,
  mode: StatsPresentationMode,
): number => {
  if (mode === 'ALL')
    return Math.abs(row.incomeMinor) + Math.abs(row.expenseMinor);

  return Math.abs(mode === 'EXPENSE' ? row.expenseMinor : row.incomeMinor);
};

/** Signed contribution shown beside a category in the selected view. */
export const statsSignedAmount = (
  row: StatsPresentationRollup,
  mode: StatsPresentationMode,
): number => {
  if (mode === 'ALL') return row.incomeMinor - row.expenseMinor;
  if (mode === 'INCOME') return row.incomeMinor;
  return -row.expenseMinor;
};

/** Signed summary shown in the donut centre. */
export const statsCenterAmount = ({
  expenseMinor,
  incomeMinor,
  netMinor,
  mode,
}: StatsPresentationRollup & {
  readonly netMinor: number;
  readonly mode: StatsPresentationMode;
}): number => {
  if (mode === 'ALL') return netMinor;
  if (mode === 'INCOME') return incomeMinor;
  return -expenseMinor;
};
