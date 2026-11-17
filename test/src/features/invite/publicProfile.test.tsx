import 'react-native';

import {render} from '@testing-library/react-native';
import {useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  InvitePreviewScreen,
  PublicProfileScreen,
} from '../../../../src/features/invite/screens';
import {theme} from '../../../../src/theme';

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    stage: 'ready',
    user: {userId: 'user-self'},
  }),
}));

describe('public profile self guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects the signed-in user to My Profile before block/report render', () => {
    jest.mocked(useQuery).mockReturnValue({
      avatar: null,
      displayName: 'Self',
      handle: 'self',
      userId: 'user-self',
    } as never);

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
          <PublicProfileScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(router.replace).toHaveBeenCalledWith('/profile/me');
    expect(screen.queryByText('Block')).toBeNull();
    expect(screen.queryByText('Report')).toBeNull();
  });

  it('keeps a long display name whole at the largest text size', () => {
    // Uncapped, "Christopher Montgomery-Alexander" broke inside words.
    jest.mocked(useQuery).mockReturnValue({
      avatar: null,
      displayName: 'Christopher Montgomery-Alexander',
      handle: 'chris',
      userId: 'user-other',
    } as never);

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
          <PublicProfileScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Christopher Montgomery-Alexander')).toHaveProp(
      'maxFontSizeMultiplier',
      1.35,
    );
  });

  it('keeps the invited ledger title whole at the largest text size', () => {
    // Same 44pt mark beside a heading as the invite admin hero.
    jest.mocked(useQuery).mockReturnValue({
      alreadyMember: false,
      expiresAt: null,
      inviter: {avatarUrl: null, displayName: 'Mina', handle: 'mina'},
      ledger: {
        colorKey: 'TEAL',
        description: '',
        memberCount: 2,
        title: 'Weekend Climbing Club',
      },
      requiresApproval: false,
      role: 'MEMBER',
      status: 'OK',
    } as never);

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
          <InvitePreviewScreen />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Weekend Climbing Club')).toHaveProp(
      'maxFontSizeMultiplier',
      1.35,
    );
  });
});
