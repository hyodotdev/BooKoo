import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  MeMobile,
  type MeSection,
} from '../../../../src/features/ledger/screens/me';
import {theme} from '../../../../src/theme';

const openAbout = jest.fn();
const sections: readonly MeSection[] = [
  {
    key: 'profile',
    title: 'Profile',
    rows: [
      {
        key: 'display-name',
        label: 'Display name',
        detail: 'BooKoo QA',
        icon: 'User',
        onPress: jest.fn(),
      },
    ],
  },
  {
    key: 'account',
    title: 'Account',
    rows: [
      {
        key: 'about',
        label: 'About BooKoo',
        icon: 'Info',
        onPress: openAbout,
      },
    ],
  },
];

describe('settings screen', () => {
  beforeEach(() => openAbout.mockClear());

  it('scrolls the profile and every settings section as one surface', () => {
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
          <MeMobile
            displayName="BooKoo QA"
            emailVerified
            handle="user26"
            sections={sections}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('settings-scroll')).toBeTruthy();
    expect(screen.getByTestId('settings-scroll')).toHaveStyle({flex: 1});
    expect(
      screen.getByTestId('settings-scroll').props.contentContainerStyle,
    ).toEqual(expect.objectContaining({flexGrow: 1, paddingBottom: 32}));
    expect(screen.getByTestId('settings-profile')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();

    fireEvent.press(screen.getByText('About BooKoo'));
    expect(openAbout).toHaveBeenCalledTimes(1);
  });
});
