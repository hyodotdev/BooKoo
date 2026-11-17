import 'react-native';

import type {ReactNode} from 'react';
import {render, within} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AccountScreen} from '../../../../src/features/settings/screens';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      ListEmptyComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: unknown}) => ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        View,
        {testID},
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement(View, {key: index}, renderItem({item})),
            ),
        ListFooterComponent,
      ),
  };
});

jest.mock('../../../../src/components/uis/BookooButton', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {Pressable, Text} =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    BookooButton: ({
      color = 'primary',
      disabled = false,
      loading = false,
      onPress,
      style,
      text,
      type = 'solid',
    }: {
      color?: string;
      disabled?: boolean;
      loading?: boolean;
      onPress?: () => void;
      style?: object;
      text?: ReactNode;
      type?: string;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityLabel: typeof text === 'string' ? text : undefined,
          accessibilityRole: 'button',
          accessibilityState: {disabled: disabled || loading},
          disabled: disabled || loading,
          onPress,
          style,
          testID: `bookoo-button-${type}-${color}`,
        },
        React.createElement(Text, null, text),
      ),
  };
});

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    user: {
      handle: 'bookoo_qa',
    },
  }),
}));

jest.mock('../../../../src/features/auth/signOut', () => ({
  useSessionSignOut: () => ({
    leaving: false,
    signOut: jest.fn(() => Promise.resolve()),
  }),
}));

describe('account settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest
      .mocked(useQuery)
      .mockReturnValueOnce([{label: 'hyo@example.com', method: 'Google'}])
      .mockReturnValueOnce([
        {email: 'hyo@example.com', id: 'email-id', isPrimary: true},
      ]);
  });

  it('pins distinct sign-out and leave actions without section labels', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 744, height: 1133},
          insets: {top: 24, left: 0, right: 0, bottom: 20},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <AccountScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Sign-in methods')).toBeTruthy();
    expect(screen.queryByText('Account')).toBeNull();
    expect(screen.getAllByText('Leave BooKoo')).toHaveLength(1);

    const list = within(screen.getByTestId('account-sections'));
    const sticky = within(screen.getByTestId('settings-list-keyboard-sticky'));
    expect(list.getByTestId('bookoo-button-outlined-primary')).toBeTruthy();
    expect(list.getByLabelText('Logout')).toBeEnabled();
    // Tablet: Logout shares the centered card column instead of the full width.
    expect(
      screen.getByTestId('account-sign-out').parent?.parent?.props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({maxWidth: 680})]));
    expect(sticky.queryByTestId('bookoo-button-outlined-primary')).toBeNull();
    expect(sticky.getByTestId('bookoo-button-text-danger')).toBeTruthy();
    expect(sticky.getByLabelText('Leave BooKoo')).toBeEnabled();
    expect(screen.getByLabelText('Leave BooKoo').props.style).toMatchObject({
      alignSelf: 'center',
    });
  });
});
