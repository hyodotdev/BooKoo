import 'react-native';

import type {ReactNode} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  AppSettingsScreen,
  createAppSettingsSections,
  type AppSettingsSection,
} from '../../../../src/features/settings/appSettings';
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
      ListHeaderComponent,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      ListEmptyComponent?: ReactNode;
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
      ),
  };
});

const openNotice = jest.fn();
const sections: readonly AppSettingsSection[] = [
  {
    key: 'settings',
    title: 'Settings',
    rows: [
      {
        key: 'notifications',
        label: 'Notifications',
        icon: 'Bell',
        onPress: jest.fn(),
      },
      {
        key: 'lock',
        label: 'App lock',
        icon: 'Lock',
        onPress: jest.fn(),
      },
    ],
  },
  {
    key: 'information',
    title: 'Information',
    rows: [
      {
        key: 'notice',
        label: 'Announcements',
        icon: 'Newspaper',
        onPress: openNotice,
      },
      {
        key: 'faq',
        label: 'FAQ',
        icon: 'Question',
        onPress: jest.fn(),
      },
    ],
  },
];

describe('app settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('keeps the settings order on one virtualized section list', () => {
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
          <AppSettingsScreen sections={sections} />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('app-settings-sections')).toBeTruthy();
    expect(screen.queryByText('App settings')).toBeNull();
    expect(
      screen.getAllByRole('button').map((row) => row.props.accessibilityLabel),
    ).toEqual(['Notifications', 'App lock', 'Announcements', 'FAQ']);
    expect(screen.queryByText('Version 1.0.0')).toBeNull();

    fireEvent.press(screen.getByLabelText('Announcements'));
    expect(openNotice).toHaveBeenCalledTimes(1);
  });

  it('makes every app preference and support detail reachable', () => {
    const navigate = jest.fn();
    const routeSections = createAppSettingsSections({
      navigate,
    });
    const rows = routeSections.flatMap((section) => section.rows);

    expect(rows.map((row) => row.key)).toEqual([
      'appearance',
      'notifications',
      'lock',
      'language',
      'currency',
      'account',
      'announcements',
      'faq',
      'support',
      'privacy',
      'about',
    ]);

    rows.find((row) => row.key === 'account')?.onPress();
    rows.find((row) => row.key === 'support')?.onPress();
    rows.find((row) => row.key === 'privacy')?.onPress();
    rows.find((row) => row.key === 'about')?.onPress();
    expect(navigate).toHaveBeenCalledWith('/settings/account');
    expect(navigate).toHaveBeenCalledWith('/settings/legal/support');
    expect(navigate).toHaveBeenCalledWith('/settings/privacy');
    expect(navigate).toHaveBeenCalledWith('/settings/about');
  });
});
