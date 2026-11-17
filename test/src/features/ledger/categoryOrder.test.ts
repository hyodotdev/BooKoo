import {mergeCategoryOrder} from '~/features/ledger/categories';
import type {CategoryRow} from '~/features/ledger/types';

const row = (
  key: string,
  kind: CategoryRow['kind'] = 'EXPENSE',
  archived = false,
): CategoryRow => ({
  key,
  kind,
  archived,
  source: 'CUSTOM',
  iconKey: 'Tag',
  colorToken: 'TEAL',
  label: key,
  i18nKey: null,
  sortOrder: 10,
  hidden: false,
  reassigning: false,
});
describe('category drag order', () => {
  const meal = row('meal');
  const cafe = row('cafe');
  const archived = row('old', 'EXPENSE', true);
  const income = row('salary', 'INCOME');
  const all = [meal, archived, cafe, income];
  it('changes only the visible permutation while retaining archived and other-kind keys', () => {
    expect(mergeCategoryOrder(all, [meal, cafe], [cafe, meal])).toEqual([
      'cafe',
      'old',
      'meal',
      'salary',
    ]);
    expect(all.map((item) => item.key)).toEqual([
      'meal',
      'old',
      'cafe',
      'salary',
    ]);
  });
  it('does not persist a no-op', () => {
    expect(mergeCategoryOrder(all, [meal, cafe], [meal, cafe])).toBeNull();
  });
  it.each([[meal], [meal, meal], [income, meal]])(
    'rejects an incomplete, duplicated or foreign permutation',
    (...ordered) => {
      expect(mergeCategoryOrder(all, [meal, cafe], ordered)).toBeNull();
    },
  );
});
