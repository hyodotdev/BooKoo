import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {MyProfileScreen} from '../../../../src/features/settings/myProfile';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    user: {
      avatar: null,
      bio: 'Shared budgeting, kept calm.',
      displayName: 'BooKoo QA',
      handle: 'bookoo_qa',
    },
  }),
}));

describe('my profile screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('uses self-management actions without public block or report controls', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 34},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <MyProfileScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('my-profile-screen')).toBeTruthy();
    expect(screen.getAllByText('BooKoo QA')).not.toHaveLength(0);
    expect(screen.getAllByText('@bookoo_qa')).not.toHaveLength(0);
    expect(screen.queryByText('Block')).toBeNull();
    expect(screen.queryByText('Report')).toBeNull();

    fireEvent.press(screen.getByRole('button', {name: 'Edit profile'}));
    expect(router.navigate).toHaveBeenCalledWith('/profile/edit');

    fireEvent.press(screen.getByRole('button', {name: 'ID'}));
    expect(router.navigate).toHaveBeenCalledWith('/profile/handle');
  });
});
