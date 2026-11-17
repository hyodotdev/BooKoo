import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {StyleSheet, TextInput} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  amountMinorToInput,
  ENTRY_BOTTOM_ACTION_KEYBOARD_OFFSET,
  ENTRY_TYPE_TAB_GAP,
  ENTRY_TYPE_TAB_STEP,
  ENTRY_TYPE_TAB_WIDTH,
  entryTypeProgressForDrag,
  entryTypeForHorizontalSwipe,
  EntryAmountField,
  EntryTypeTabs,
  parseEntryAmount,
  sanitizeEntryAmountInput,
} from '../../../../src/features/ledger/screens/entryEditor';
import {
  categoryPickerColumnsForWidth,
  categoryPickerRows,
} from '../../../../src/features/ledger/screens/entryCategoryPicker';
import type {CategoryRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {BOOKOO_PALETTE} from '../../../../src/theme/bookooPalette';
import {EXACT_HIT_SLOP} from '../../../../src/theme/layout';
import {resetIntlCapsCache} from '../../../../shared/currency';

describe('entry form presentation', () => {
  it.each([
    ['EXPENSE', 4200, true],
    ['EXPENSE', -4200, false],
    ['INCOME', 4200, false],
    ['INCOME', -4200, true],
  ] as const)(
    'shows one cash-flow sign for %s %i',
    (type, amountMinor, negative) => {
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 390, height: 844},
            insets: {top: 0, left: 0, right: 0, bottom: 0},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: 'light'}}
          >
            <EntryAmountField
              accentColor="#08745E"
              amountMinor={amountMinor}
              onChangeText={jest.fn()}
              type={type}
              value="4200"
            />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(screen.queryByText('−') !== null).toBe(negative);
      expect(screen.UNSAFE_getByType(TextInput).props.value).toBe('4200');
    },
  );
  it('reserves room above the keyboard for the sticky save action', () => {
    expect(ENTRY_BOTTOM_ACTION_KEYBOARD_OFFSET).toBeGreaterThanOrEqual(52);
  });

  it('uses the quiet disabled token for an empty amount prompt', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 59, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryAmountField
            accentColor="#08745E"
            amountMinor={0}
            onChangeText={jest.fn()}
            type="EXPENSE"
            value=""
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.UNSAFE_getByType(TextInput).props.placeholderTextColor).toBe(
      theme.light.text.placeholder,
    );
    // Explicit edge slots override the primitive's size-dependent padding.
    // The native placeholder needs the same line box as entered numerals.
    expect(
      StyleSheet.flatten(screen.UNSAFE_getByType(TextInput).props.style),
    ).toMatchObject({
      lineHeight: 36,
      minHeight: 60,
      paddingTop: 0,
      paddingBottom: 0,
    });
  });

  it('uses the expense accent after zero is explicitly entered', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 59, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryAmountField
            accentColor="#08745E"
            amountMinor={0}
            onChangeText={jest.fn()}
            type="EXPENSE"
            value="0"
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(
      StyleSheet.flatten(screen.UNSAFE_getByType(TextInput).props.style).color,
    ).toBe(BOOKOO_PALETTE.main);
  });

  it('uses compact underline tabs with one movable indicator', () => {
    const onChange = jest.fn();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryTypeTabs
            accentColor="#08745E"
            onChange={onChange}
            value="INCOME"
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('entry-type-indicator')).toHaveStyle({
      backgroundColor: '#08745E',
      height: 3,
      width: 64,
    });
    expect(screen.getAllByRole('tab').map((tab) => tab.props.testID)).toEqual([
      'entry-type-EXPENSE',
      'entry-type-INCOME',
    ]);
    expect(screen.getByTestId('entry-type-INCOME')).toHaveStyle({
      minHeight: 44,
      width: ENTRY_TYPE_TAB_WIDTH,
    });
    expect(screen.getByTestId('entry-type-EXPENSE')).toHaveStyle({
      minHeight: 44,
      width: ENTRY_TYPE_TAB_WIDTH,
    });
    expect(ENTRY_TYPE_TAB_STEP).toBe(ENTRY_TYPE_TAB_WIDTH + ENTRY_TYPE_TAB_GAP);
    // The label and narrower underline share each 88pt target's center.
    expect(ENTRY_TYPE_TAB_STEP).toBe(88);
    expect(screen.getByTestId('entry-type-tabs')).toHaveStyle({
      gap: 0,
    });
    expect(screen.getByTestId('entry-type-EXPENSE')).toHaveStyle({
      paddingHorizontal: 8,
      alignItems: 'center',
    });
    expect(screen.getByTestId('entry-type-indicator')).toHaveStyle({
      left: 12,
      transform: [{translateX: 88}],
    });
    expect(screen.getByTestId('entry-type-INCOME').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );
    expect(screen.getByTestId('entry-type-EXPENSE').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );

    fireEvent.press(screen.getByTestId('entry-type-EXPENSE'));
    expect(onChange).toHaveBeenCalledWith('EXPENSE');
  });

  it('converts typed major units to exact minor units', () => {
    expect(parseEntryAmount('12.34', 'USD', 'en')).toBe(1234);
    expect(parseEntryAmount('12,34', 'USD', 'ko')).toBe(1234);
    expect(parseEntryAmount('12,345', 'KRW', 'en')).toBe(12345);
    expect(amountMinorToInput(1234, 'USD')).toBe('12.34');
    expect(amountMinorToInput(-1234, 'KRW')).toBe('1234');
    expect(sanitizeEntryAmountInput('1,000a', 'KRW', 'en')).toBe('1000');
    expect(sanitizeEntryAmountInput('12.345x', 'USD', 'en')).toBe('12.34');
    expect(sanitizeEntryAmountInput('１２,３４', 'USD', 'ko')).toBe('12.34');
  });

  it('sanitizes decimal input when formatToParts is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Intl.NumberFormat.prototype,
      'formatToParts',
    );

    try {
      Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', {
        configurable: true,
        value: undefined,
      });
      resetIntlCapsCache();

      expect(sanitizeEntryAmountInput('12,3x', 'USD', 'de')).toBe('12,3');
    } finally {
      if (descriptor !== undefined)
        Object.defineProperty(
          Intl.NumberFormat.prototype,
          'formatToParts',
          descriptor,
        );
      resetIntlCapsCache();
    }
  });

  it.each([
    ['1,000.25', 'USD', 'en', '1000.25', 100025],
    ['1.000,25', 'EUR', 'de', '1000,25', 100025],
    ['1,000', 'USD', 'en', '1000', 100000],
    ['1.000', 'EUR', 'de', '1000', 100000],
    ['1,234,567.89', 'USD', 'en', '1234567.89', 123456789],
    ['12.3', 'KRW', 'en', '12', 12],
    ['0.', 'USD', 'en', '0.', 0],
  ] as const)(
    'preserves the value of pasted %s',
    (raw, currency, locale, text, minor) => {
      const sanitized = sanitizeEntryAmountInput(raw, currency, locale);
      expect(sanitized).toBe(text);
      expect(parseEntryAmount(sanitized, currency, locale)).toBe(minor);
    },
  );

  it('changes entry type only for an intentional horizontal swipe', () => {
    expect(entryTypeForHorizontalSwipe(-80, 0)).toBe('INCOME');
    expect(entryTypeForHorizontalSwipe(80, 0)).toBe('EXPENSE');
    expect(entryTypeForHorizontalSwipe(12, -700)).toBe('INCOME');
    expect(entryTypeForHorizontalSwipe(-12, 700)).toBe('EXPENSE');
    expect(entryTypeForHorizontalSwipe(30, 0)).toBeNull();
  });

  it('tracks the swipe continuously and clamps the tab indicator', () => {
    expect(entryTypeProgressForDrag(0, -ENTRY_TYPE_TAB_STEP / 2)).toBe(0.5);
    expect(entryTypeProgressForDrag(1, ENTRY_TYPE_TAB_STEP / 2)).toBe(0.5);
    expect(entryTypeProgressForDrag(0, ENTRY_TYPE_TAB_STEP)).toBe(0);
    expect(entryTypeProgressForDrag(1, -ENTRY_TYPE_TAB_STEP)).toBe(1);
  });

  it('keeps category cells readable across phone and tablet widths', () => {
    expect(categoryPickerColumnsForWidth(320)).toBe(3);
    expect(categoryPickerColumnsForWidth(390)).toBe(4);
    expect(categoryPickerColumnsForWidth(744)).toBe(5);
    expect(categoryPickerColumnsForWidth(1024)).toBe(6);
  });

  it('puts the Add action in the first category-sheet grid cell', () => {
    const cafe = {key: 'cafe'} as CategoryRow;
    const rows = categoryPickerRows([cafe]);

    expect(rows[0]).toEqual({kind: 'ADD'});
    expect(rows[1]).toEqual({category: cafe, kind: 'CATEGORY'});
  });
});
