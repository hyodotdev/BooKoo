import type {ReactElement} from 'react';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {StyleSheet} from 'react-native';

import {BookooSegmentedControl} from '~/components/uis/BookooSegmentedControl';
import {LedgerForm} from '~/features/ledger/ledgerForm';
import {SettingsRow} from '~/features/settings/ui';
import {TimelineDayHeader} from '~/features/ledger/screens/timeline';
import {EntryRow} from '~/features/ledger/ui';
import type {ItemRow} from '~/features/ledger/types';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

// At the largest iOS text size the audit found segment labels cut in half,
// a day total broken across lines ("-$9,864,19 / 7.54"), entry titles
// squeezed to one letter by their amount, and "Base currencyKRW".
const wrap = (ui: ReactElement) =>
  render(
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      {ui}
    </CpkProvider>,
    {wrapper: TestSafeAreaProvider},
  );

const item = {
  amountMinor: -987654321,
  authorId: 'user-owner',
  baseAmountMinor: -987654321,
  baseCurrency: 'USD',
  categoryKey: 'electronic',
  commentCount: 0,
  coverPhotoId: null,
  createdAt: Date.UTC(2026, 10, 1, 1),
  currency: 'USD',
  dayKey: 20261101,
  deletedAt: null,
  id: 'item-big',
  ledgerId: 'ledger-test',
  memo: 'Dinner after the long multi-pitch day',
  monthKey: 202611,
  needsReview: false,
  occurredAt: Date.UTC(2026, 10, 1, 1),
  occurredOffsetMinutes: 0,
  paidByUserId: null,
  photoCount: 0,
  place: null,
  type: 'EXPENSE',
  updatedAt: Date.UTC(2026, 10, 1, 1),
  updatedByUserId: null,
} as NonNullable<ItemRow>;

describe('largest text sizes', () => {
  beforeEach(() => setActiveLocale('en'));

  it('caps segment labels like other compact controls', () => {
    const screen = wrap(
      <BookooSegmentedControl
        onValueChange={jest.fn()}
        selectedValue="ALL"
        values={[
          {text: 'All', value: 'ALL'},
          {text: 'Expense', value: 'EXPENSE'},
        ]}
      />,
    );
    expect(screen.getByText('Expense').props.maxFontSizeMultiplier).toBe(1.25);
  });

  it('keeps a day total on one line', () => {
    const screen = wrap(
      <TimelineDayHeader
        backgroundColor={theme.light.bg.basic}
        currency="USD"
        dayKey={20261101}
        netMinor={-986419754}
      />,
    );
    expect(screen.getByText('-$9,864,197.54').props.numberOfLines).toBe(1);
  });

  it('leaves the entry title room beside a long amount', () => {
    const screen = wrap(<EntryRow item={item} onPress={jest.fn()} />);
    const amount = screen.getByText(/9,876,543\.21/);
    expect(amount.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(amount.props.style).maxWidth).toBe('50%');
  });

  it('lets a settings row title wrap instead of "Export ledg..."', () => {
    const screen = wrap(
      <SettingsRow
        icon="FileXls"
        onPress={jest.fn()}
        title="Export ledger data"
      />,
    );
    expect(screen.getByText('Export ledger data').props.numberOfLines).toBe(2);
  });

  it('separates the base-currency label from its value', () => {
    const screen = wrap(<LedgerForm onSubmit={async () => undefined} />);
    const row = screen.getByTestId('ledger-form-currency');
    expect(StyleSheet.flatten(row.props.style).gap).toBe(16);
    // Squeezed beside "KRW | ₩", the label read "Base / curre"; the value
    // now wraps under it, kept to the trailing edge.
    expect(StyleSheet.flatten(row.props.style).flexWrap).toBe('wrap');
    expect(screen.getByTestId('ledger-form-currency-value')).toHaveStyle({
      marginLeft: 'auto',
    });
  });

  it('keeps a one-word settings title whole instead of "Announceme / nts"', () => {
    const screen = wrap(
      <SettingsRow
        icon="Megaphone"
        onPress={jest.fn()}
        title="Announcements"
      />,
    );
    expect(screen.getByText('Announcements')).toHaveProp(
      'adjustsFontSizeToFit',
      true,
    );
    expect(screen.getByText('Announcements')).toHaveProp('numberOfLines', 1);
  });
});
