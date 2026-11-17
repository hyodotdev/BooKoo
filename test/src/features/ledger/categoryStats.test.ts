import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import id from '../../../../assets/langs/id.json';
import zh from '../../../../assets/langs/zh.json';
import {categoryTrendMagnitude} from '../../../../src/features/ledger/screens/categoryStats';

describe('category stats trend', () => {
  const row = {expenseMinor: -1234, incomeMinor: 5000};

  it('plots the category amount for its own entry kind', () => {
    expect(categoryTrendMagnitude(row, 'EXPENSE')).toBe(1234);
    expect(categoryTrendMagnitude(row, 'INCOME')).toBe(5000);
  });

  it('falls back to the non-zero magnitude while category metadata loads', () => {
    expect(categoryTrendMagnitude(row)).toBe(5000);
  });

  // An empty month read "None" ("Tidak" = "No" in Indonesian, 任何 = "any"
  // in Chinese) under the month heading.
  it('says the month has no entries, like the stats tab', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/ledger/screens/categoryStats.tsx'),
      'utf8',
    );
    expect(source).toContain("title={t('screen.noStats')}");
    expect(source).not.toContain("title={t('common.none')}");
    expect(id.common.none).toBe('Tidak ada');
    expect(zh.common.none).toBe('无');
  });
});
