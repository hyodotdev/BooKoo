import type {ReactNode} from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {useMutation, useQuery} from 'convex/react';
import {getFunctionName} from 'convex/server';
import {router} from 'expo-router';
import {LedgerCategoriesScreen} from '~/features/ledger/screens/ledgerAdmin';
import type {CategoryRow} from '~/features/ledger/types';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

jest.mock('cpk-ui', () => {
  const actual = jest.requireActual<typeof import('cpk-ui')>('cpk-ui');
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    ReorderableList: ({
      data,
      disabled,
      onReorder,
      renderItem,
    }: {
      data: CategoryRow[];
      disabled: boolean;
      onReorder: (data: CategoryRow[]) => void;
      renderItem: (info: {
        item: CategoryRow;
        index: number;
        dragHandle: ReactNode;
      }) => ReactNode;
    }) =>
      React.createElement(
        View,
        {testID: 'category-order', ...{onReorder, disabled, data}},
        data.map((item, index) =>
          React.createElement(
            View,
            {key: item.key},
            renderItem({
              item,
              index,
              dragHandle: disabled
                ? null
                : React.createElement(View, {testID: `handle-${item.key}`}),
            }),
          ),
        ),
      ),
  };
});

const category = (
  key: string,
  kind: CategoryRow['kind'] = 'EXPENSE',
): CategoryRow => ({
  key,
  kind,
  source: 'CUSTOM',
  label: key,
  i18nKey: null,
  iconKey: 'Tag',
  colorToken: 'TEAL',
  sortOrder: 10,
  archived: false,
  hidden: false,
  reassigning: false,
});
const rows = [
  category('Meal'),
  category('Cafe'),
  category('Salary', 'INCOME'),
  // `archive` writes hiddenAt (not archivedAt) for presets and for categories
  // that still carry entries, so management must treat hidden as archived.
  {...category('Retired'), hidden: true},
];
const mutation = Object.assign(jest.fn<Promise<void>, [unknown?]>(), {
  withOptimisticUpdate: jest.fn(),
});

function mount(role: 'OWNER' | 'VIEWER' = 'OWNER') {
  jest
    .mocked(useQuery)
    .mockImplementation((...args) =>
      getFunctionName(args[0]).includes('getMineByRoute')
        ? {id: 'ledger-test', role, maintenanceLock: 'NONE'}
        : rows,
    );
  return render(
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      <LedgerCategoriesScreen ledgerId="ledger-test" />
    </CpkProvider>,
    {wrapper: TestSafeAreaProvider},
  );
}

describe('category management composition', () => {
  beforeEach(() => {
    setActiveLocale('en');
    mutation.mockReset().mockResolvedValue(undefined);
    mutation.withOptimisticUpdate.mockReturnValue(mutation);
    jest.mocked(useMutation).mockReturnValue(mutation);
  });
  it('keeps only Edit/Archive in row actions and category names on one line', () => {
    const screen = mount();
    fireEvent.press(screen.getByTestId('category-admin-Meal-more'));
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    for (const label of [
      'Hide',
      'Move up',
      'Move down',
      'Archive category',
      'Update',
    ])
      expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText('Meal')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText('Meal')).toHaveProp('ellipsizeMode', 'tail');
  });
  it('controls disclosure without duplicating editors or exposing closed actions', () => {
    const screen = mount();
    const more = screen.getByTestId('category-admin-Meal-more');
    expect(more.props.accessibilityState.expanded).toBe(false);
    fireEvent.press(more);
    expect(screen.getAllByText('Edit')).toHaveLength(1);
    expect(screen.getByTestId('category-admin-Meal-editor')).toBeTruthy();
    fireEvent.press(more);
    expect(screen.queryByText('Edit')).toBeNull();
    fireEvent.press(more);
    expect(screen.getByTestId('category-admin-Meal-editor')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-admin-Cafe-more'));
    expect(screen.getAllByText('Edit')).toHaveLength(1);
    expect(
      screen.getByTestId('category-admin-Meal-more').props.accessibilityState
        .expanded,
    ).toBe(false);
  });
  it('opens keyboard-safe identity forms for creation and editing', () => {
    const screen = mount();
    fireEvent.press(screen.getByTestId('category-create'));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledger/[ledgerId]/categories/new',
      params: {ledgerId: 'ledger-test', kind: 'EXPENSE'},
    });
    fireEvent.press(screen.getByTestId('category-admin-Meal-icon'));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledger/[ledgerId]/categories/[categoryKey]',
      params: {ledgerId: 'ledger-test', categoryKey: 'Meal'},
    });
    fireEvent.press(screen.getByTestId('category-admin-Meal-more'));
    fireEvent.press(screen.getByText('Edit'));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledger/[ledgerId]/categories/[categoryKey]',
      params: {ledgerId: 'ledger-test', categoryKey: 'Meal'},
    });
    fireEvent.press(screen.getByText('Income'));
    fireEvent.press(screen.getByTestId('category-create'));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: '/ledger/[ledgerId]/categories/new',
      params: {ledgerId: 'ledger-test', kind: 'INCOME'},
    });
    expect(mutation).not.toHaveBeenCalled();
  });
  it('submits the full, kind-preserving order and ignores duplicate submissions', async () => {
    const screen = mount();
    await act(async () => {
      fireEvent(screen.getByTestId('category-order'), 'reorder', [
        rows[1],
        rows[0],
      ]);
      fireEvent(screen.getByTestId('category-order'), 'reorder', [
        rows[1],
        rows[0],
      ]);
    });
    expect(mutation).toHaveBeenCalledTimes(1);
    // Hidden and other-kind rows are not rendered, but reordering the visible
    // ones must never drop them from the persisted order.
    expect(mutation).toHaveBeenCalledWith({
      ledgerId: 'ledger-test',
      orderedKeys: ['Cafe', 'Meal', 'Salary', 'Retired'],
    });
  });
  it('drops archived rows from management, matching the entry pickers', () => {
    const screen = mount();
    expect(screen.getByText('Meal')).toBeTruthy();
    // R53 removed Hide from this screen; a row the pickers already refuse to
    // show must not keep rendering here as a normal, editable category.
    expect(screen.queryByText('Retired')).toBeNull();
    expect(screen.queryByTestId('category-admin-Retired-more')).toBeNull();
    expect(screen.getByTestId('category-order').props.data).toEqual(
      rows.slice(0, 2),
    );
  });
  it('keeps viewer filtering without exposing write controls', () => {
    const screen = mount('VIEWER');
    expect(screen.getByTestId('category-order')).toHaveProp('disabled', true);
    expect(screen.queryByTestId('category-create')).toBeNull();
    expect(screen.queryByTestId('handle-Meal')).toBeNull();
    fireEvent.press(screen.getByText('Income'));
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.queryByText('Meal')).toBeNull();
  });
  it('exposes retryable failure and unlocks controls after a failed save', async () => {
    mutation.mockRejectedValueOnce(new Error('offline'));
    const screen = mount();
    await act(async () =>
      fireEvent(screen.getByTestId('category-order'), 'reorder', [
        rows[1],
        rows[0],
      ]),
    );
    expect(screen.getByTestId('category-order')).toHaveProp('disabled', false);
    expect(screen.getByTestId('category-order').props.data).toEqual(
      rows.slice(0, 2),
    );
  });
});
