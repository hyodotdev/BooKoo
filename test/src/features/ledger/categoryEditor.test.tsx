import {act, fireEvent, render, within} from '@testing-library/react-native';
import {useMutation, useQuery} from 'convex/react';
import {getFunctionName} from 'convex/server';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {CategoryEditorScreen} from '~/features/ledger/screens/categoryEditor';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

const save = Object.assign(jest.fn<Promise<unknown>, [unknown?]>(), {
  withOptimisticUpdate: jest.fn(),
});
const category = {
  key: 'meal',
  label: 'Shared dinner',
  source: 'CUSTOM',
  iconKey: 'ForkKnife',
  colorToken: 'category.teal',
  archived: false,
  reassigning: false,
};
function mount({
  editing = false,
  role = 'OWNER',
  kind = 'EXPENSE',
  preset = false,
}: {
  editing?: boolean;
  role?: string;
  kind?: 'EXPENSE' | 'INCOME';
  preset?: boolean;
} = {}) {
  jest.mocked(useQuery).mockImplementation((...args) =>
    getFunctionName(args[0]).includes('getMineByRoute')
      ? {id: 'ledger-test', role, maintenanceLock: 'NONE'}
      : [
          {
            ...category,
            ...(preset
              ? {source: 'PRESET', label: null, i18nKey: 'category.meal'}
              : {}),
          },
        ],
  );
  return render(
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      <CategoryEditorScreen
        categoryKey={editing ? 'meal' : undefined}
        kind={kind}
        ledgerId="ledger-test"
      />
    </CpkProvider>,
    {wrapper: TestSafeAreaProvider},
  );
}
describe('category identity forms', () => {
  beforeEach(() => {
    setActiveLocale('en');
    save.mockReset().mockResolvedValue({key: 'new-key'});
    jest.mocked(useMutation).mockReturnValue(save);
    jest.mocked(router.canGoBack).mockReturnValue(true);
    jest.mocked(router.back).mockClear();
  });
  it.each(['EXPENSE', 'INCOME'] as const)(
    'saves name, color and icon together without changing %s',
    async (kind) => {
      const screen = mount({kind});
      expect(screen.getByTestId('category-keyboard-viewport')).toHaveProp(
        'behavior',
        'height',
      );
      expect(screen.getByTestId('category-form-scroll')).toHaveProp(
        'keyboardShouldPersistTaps',
        'handled',
      );
      fireEvent.changeText(
        screen.getByTestId('category-form-name'),
        'Week end\nFood',
      );
      expect(screen.getByTestId('category-form-name')).toHaveProp(
        'value',
        'WeekendFood',
      );
      fireEvent.press(screen.getByTestId('category-color-category.purple'));
      fireEvent.changeText(
        screen.getByTestId('category-icon-search'),
        'coffee',
      );
      expect(screen.queryByTestId('category-icon-ForkKnife')).toBeNull();
      fireEvent.press(screen.getByTestId('category-icon-Coffee'));
      expect(screen.getByTestId('category-icon-Coffee')).toHaveProp(
        'accessibilityState',
        {checked: true, disabled: false},
      );
      await act(async () =>
        fireEvent.press(screen.getByTestId('category-form-save')),
      );
      expect(save).toHaveBeenCalledWith({
        ledgerId: 'ledger-test',
        kind,
        label: 'WeekendFood',
        iconKey: 'Coffee',
        colorToken: 'category.purple',
      });
      expect(router.back).toHaveBeenCalledTimes(1);
      // Navigation owns successful teardown: no idle/pressable frame is
      // scheduled while the native screen is being removed.
      expect(screen.getByTestId('category-form-save')).toBeDisabled();
    },
  );
  it('lets icon names wrap to a second line instead of ellipsizing', () => {
    const screen = mount();
    // Five 60pt cells on a phone cut "Phone & internet" to "Phone &...".
    const cell = screen.getByTestId('category-icon-DeviceMobile');
    expect(within(cell).getByText('Phone & internet')).toHaveProp(
      'numberOfLines',
      2,
    );
    // Uncapped, the largest text split "Meal" into "Me" / "al" in a 60pt cell.
    expect(within(cell).getByText('Phone & internet')).toHaveProp(
      'maxFontSizeMultiplier',
      1.25,
    );
  });

  it('sizes icon cells from the measured row so words stay whole', () => {
    // Fixed 60pt cells wrapped "Maintenance fee" as "Maintenan / ce fee".
    const screen = mount();
    fireEvent(screen.getByTestId('category-form-fields'), 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 354, height: 900}},
    });
    expect(screen.getByTestId('category-icon-DeviceMobile')).toHaveStyle({
      width: 82,
    });
  });

  it('preserves an existing spaced label when only its identity changes', async () => {
    const screen = mount({editing: true});
    fireEvent.press(screen.getByTestId('category-icon-Coffee'));
    await act(async () =>
      fireEvent.press(screen.getByTestId('category-form-save')),
    );
    expect(save).toHaveBeenCalledWith({
      ledgerId: 'ledger-test',
      key: 'meal',
      label: 'Shared dinner',
      iconKey: 'Coffee',
      colorToken: 'category.teal',
    });
  });
  it('keeps a preset localized when no custom name was entered', async () => {
    const screen = mount({editing: true, preset: true});
    fireEvent.press(screen.getByTestId('category-color-category.pink'));
    await act(async () =>
      fireEvent.press(screen.getByTestId('category-form-save')),
    );
    expect(save).toHaveBeenCalledWith({
      ledgerId: 'ledger-test',
      key: 'meal',
      iconKey: 'ForkKnife',
      colorToken: 'category.pink',
    });
  });
  it('retains all selections after failure and retries without leaving early', async () => {
    save.mockRejectedValueOnce(new Error('offline'));
    const screen = mount();
    fireEvent.changeText(screen.getByTestId('category-form-name'), 'Coffee');
    fireEvent.press(screen.getByTestId('category-icon-Coffee'));
    await act(async () =>
      fireEvent.press(screen.getByTestId('category-form-save')),
    );
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('category-form-name')).toHaveProp(
      'value',
      'Coffee',
    );
    await act(async () =>
      fireEvent.press(screen.getByTestId('category-form-save')),
    );
    expect(save).toHaveBeenCalledTimes(2);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  it.each([
    {role: 'VIEWER', editing: false},
    {role: 'MEMBER', editing: true},
  ])('denies unauthorized category writes for $role', (options) => {
    const screen = mount(options);
    expect(screen.queryByTestId('category-form-save')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('allows members to create but does not write merely by choosing an icon', () => {
    const screen = mount({role: 'MEMBER'});
    fireEvent.press(screen.getByTestId('category-icon-Coffee'));
    expect(save).not.toHaveBeenCalled();
  });
});
