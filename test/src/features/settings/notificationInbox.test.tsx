import type {ReactNode} from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {router} from 'expo-router';
import {usePaginatedQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {NotificationInboxScreen} from '~/features/release/screens';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View: MockView} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      ListHeaderComponent,
      renderItem,
    }: {
      data: readonly unknown[];
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: unknown}) => ReactNode;
    }) =>
      React.createElement(
        MockView,
        null,
        ListHeaderComponent,
        data.map((item, index) =>
          React.createElement(MockView, {key: index}, renderItem({item})),
        ),
      ),
  };
});

const row = {
  id: 'notification-1',
  kind: 'COMMENT_ADDED',
  titleKey: 'push.commentAdded.title',
  bodyKey: 'push.commentAdded.body',
  params: {},
  fallbackTitle: 'New comment',
  fallbackBody: 'A new comment was added to an entry.',
  route: null,
  ledgerId: null,
  itemId: null,
  readAt: null,
  createdAt: Date.now() - 5 * 60_000,
};

function renderInbox(): ReturnType<typeof render> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 47, left: 0, right: 0, bottom: 34},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <NotificationInboxScreen />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('notification inbox rows', () => {
  beforeEach(() => setActiveLocale('en'));

  it('shows the body and age of each notification, not only its title', () => {
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [row, {...row, id: 'notification-2', readAt: Date.now()}],
      status: 'Exhausted',
    });
    const screen = renderInbox();

    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
    expect(
      screen.getAllByText('A new comment was added to an entry.'),
    ).toHaveLength(2);
    expect(screen.getAllByText('5 minutes ago')).toHaveLength(2);
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(1);
    expect(screen.queryByText(/●/)).toBeNull();
  });

  it.each([
    [
      'an addressed invitation',
      {inviteId: 'invite-id'},
      {
        pathname: '/invites/[inviteId]',
        params: {inviteId: 'invite-id'},
      },
    ],
    ['an older invitation', {}, '/invites'],
  ])(
    'opens %s without passing a code to navigation',
    (_label, params, route) => {
      jest.mocked(router.navigate).mockClear();
      jest.mocked(usePaginatedQuery).mockReturnValue({
        isLoading: false,
        loadMore: jest.fn(),
        results: [
          {...row, kind: 'LEDGER_INVITE', params, route: '/invite/old-code'},
        ],
        status: 'Exhausted',
      });
      fireEvent.press(renderInbox().getByTestId('notification-row'));
      expect(router.navigate).toHaveBeenCalledWith(route);
    },
  );
});
