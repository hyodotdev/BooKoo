import 'react-native';

import type {ReactNode} from 'react';
import {fireEvent, render, within} from '@testing-library/react-native';
import {CpkProvider, Icon} from 'cpk-ui';
import {useMutation, usePaginatedQuery, useQuery} from 'convex/react';
import {router} from 'expo-router';
import {Dimensions} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerMembersScreen} from '../../../../src/features/ledger/screens/memberManagement';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('convex/react', () => ({
  useMutation: jest.fn(),
  usePaginatedQuery: jest.fn(),
  useQuery: jest.fn(),
}));
jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: {userId: 'user-owner'}}),
}));
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
    }: {
      data: readonly {userId: string}[];
      ListEmptyComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: {userId: string}}) => ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item) =>
              React.createElement(View, {key: item.userId}, renderItem({item})),
            ),
        ListFooterComponent,
      ),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  const methods = {close: jest.fn(), openLeft: jest.fn(), openRight: jest.fn()};
  return {
    __esModule: true,
    default: ({
      children,
      renderLeftActions,
      renderRightActions,
    }: {
      children: ReactNode;
      renderLeftActions?: (...args: unknown[]) => ReactNode;
      renderRightActions?: (...args: unknown[]) => ReactNode;
    }) => {
      const progress = {value: 1};
      return React.createElement(
        View,
        null,
        children,
        renderLeftActions?.(progress, progress, methods),
        renderRightActions?.(progress, progress, methods),
      );
    },
  };
});

const ledger: LedgerRow = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: '',
  emoji: null,
  iconKey: null,
  id: 'ledger-test' as LedgerRow['id'],
  invitePolicy: 'MANAGERS_ONLY',
  itemWritePolicy: 'ANY_MEMBER',
  lastOpenedAt: null,
  lastReadAt: null,
  maintenanceLock: 'NONE',
  memberCount: 2,
  muted: false,
  notifyComment: true,
  notifyNewItem: true,
  ownerId: 'user-owner' as LedgerRow['ownerId'],
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Household',
  updatedAt: 1,
  weekStartsOn: 0,
};

const members = [
  {
    avatarThumbUrl: null,
    blockedRelationship: false,
    displayName: 'Owner',
    handle: 'owner',
    isPlaceholder: false,
    joinedAt: 1,
    role: 'OWNER' as const,
    userId: 'user-owner',
  },
  {
    avatarThumbUrl: null,
    blockedRelationship: false,
    displayName: 'Member',
    handle: 'member',
    isPlaceholder: false,
    joinedAt: 2,
    role: 'MEMBER' as const,
    userId: 'user-member',
  },
];

describe('member management screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useQuery).mockReturnValue(ledger);
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: members,
      status: 'Exhausted',
    });
    jest
      .mocked(useMutation)
      .mockReturnValue(
        Object.assign(jest.fn(), {withOptimisticUpdate: jest.fn()}),
      );
  });

  it('shows paginated roster actions and a themed confirmation', () => {
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
          <LedgerMembersScreen ledgerId="ledger-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Household')).toHaveProp('numberOfLines', 2);
    expect(screen.getByText('Household')).toHaveProp('ellipsizeMode', 'tail');
    expect(screen.getByTestId('member-name-user-owner')).toHaveProp(
      'numberOfLines',
      2,
    );
    expect(screen.getByTestId('member-name-user-owner')).toHaveProp(
      'ellipsizeMode',
      'tail',
    );
    expect(usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      {ledgerId: ledger.id},
      {initialNumItems: 30},
    );
    expect(
      screen.getByText('Swipe a member right for roles or left to remove.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Transfer ownership')).toBeTruthy();
    expect(screen.getByLabelText('Make admin')).toBeTruthy();
    expect(screen.getByLabelText('Delete member')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Transfer ownership'));

    expect(
      screen.getByText(
        'Make Member the owner? You will become an administrator.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('Transfer ownership').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', {name: 'Transfer'})).toBeTruthy();
  });

  it('wraps Invite below the title instead of splitting words at large text', () => {
    // The largest iOS text squeezed the copy to its 120pt floor beside
    // Invite: "Wee / ke..." over "2 / membe / rs".
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({width: 390, height: 844, scale: 3, fontScale: 2.35});
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
          <LedgerMembersScreen ledgerId="ledger-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('member-header-copy')).toHaveStyle({
      minWidth: 282,
    });
    expect(screen.getByText('Household')).toHaveProp(
      'maxFontSizeMultiplier',
      1.35,
    );
    jest.restoreAllMocks();
  });

  it('opens the invite flow from the member header', () => {
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
          <LedgerMembersScreen ledgerId="ledger-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    const inviteIcon = within(
      screen.getByTestId('member-invite-icon-wrap'),
    ).UNSAFE_getByType(Icon);
    expect(inviteIcon.props.color).toBe(theme.light.button.primary.text);
    expect(screen.getByTestId('member-invite-icon-wrap')).toHaveStyle({
      backgroundColor: 'transparent',
    });
    expect(screen.getByTestId('member-name-user-owner')).toHaveStyle({
      flexShrink: 1,
      minWidth: 0,
    });

    fireEvent.press(screen.getByText('Invite'));

    expect(router.navigate).toHaveBeenCalledWith('/ledger/ledger-test/invites');
  });
});
