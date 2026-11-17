import type {ReactElement, ReactNode} from 'react';
import {render} from '@testing-library/react-native';
import {useMutation} from 'convex/react';
import {CpkProvider, Typography} from 'cpk-ui';

import {DefaultCurrencyScreen} from '~/features/release/screens';
import {SettingsSectionList} from '~/features/settings/ui';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
    }: {
      data: readonly unknown[];
      renderItem: (info: {item: unknown}) => ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        data.map((item, index) =>
          React.createElement(View, {key: index}, renderItem({item})),
        ),
      ),
  };
});
jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: {preferredCurrency: 'USD', userId: 'user-1'}}),
}));

// Icon-less lists (language, currency, auto-lock timing) started every
// divider 44pt to the right of the text it separates.
describe('settings dividers', () => {
  const wrap = (ui: ReactElement) =>
    render(
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        {ui}
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );

  beforeEach(() => {
    setActiveLocale('en');
    jest
      .mocked(useMutation)
      .mockReturnValue(
        Object.assign(jest.fn(), {withOptimisticUpdate: jest.fn()}) as never,
      );
  });

  it('starts under the row text, section by section', () => {
    const screen = wrap(
      <SettingsSectionList<string>
        keyExtractor={(row) => row}
        renderItem={(row) => <Typography.Body2>{row}</Typography.Body2>}
        sections={[
          {data: ['English', '한국어'], key: 'plain', rowsWithoutIcons: true},
          {data: ['Theme', 'Language'], key: 'icons'},
        ]}
      />,
    );
    const dividers = screen.getAllByTestId('settings-divider');
    expect(dividers).toHaveLength(2);
    expect(dividers[0]).toHaveStyle({marginLeft: 14});
    expect(dividers[1]).toHaveStyle({marginLeft: 58});
  });

  it('lines up the default-currency dividers with the currency codes', () => {
    const screen = wrap(<DefaultCurrencyScreen />);
    const dividers = screen.getAllByTestId('settings-divider');
    expect(dividers.length).toBeGreaterThan(0);
    for (const divider of dividers)
      expect(divider).toHaveStyle({marginLeft: 14});
  });
});
