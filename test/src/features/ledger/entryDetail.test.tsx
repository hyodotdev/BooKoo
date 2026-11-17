import 'react-native';

import type {ReactNode} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {useMutation, usePaginatedQuery, useQuery} from 'convex/react';
import {getFunctionName, type FunctionReturnType} from 'convex/server';
import {CpkProvider} from 'cpk-ui';
import {router} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {api} from '@convex/_generated/api';
import {LedgerItemDetailScreen} from '../../../../src/features/ledger/screens/entryDetail';
import {EntryRow, entryRowPropsEqual} from '../../../../src/features/ledger/ui';
import {theme} from '../../../../src/theme';
import {formatDate, setActiveLocale} from '../../../../src/utils/i18n';

function createMutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

let mockConnected = true;
const mockShowActionSheetWithOptions = jest.fn();

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: {userId: 'user-owner'}}),
}));
jest.mock('../../../../src/features/runtime/connectivity', () => ({
  useConnectivity: () => ({connected: mockConnected, showOffline: false}),
}));
jest.mock('../../../../src/features/release/ReportControl', () => ({
  ReportControl: () => null,
}));
jest.mock('@expo/react-native-action-sheet', () => ({
  ActionSheetProvider: ({children}: {children: ReactNode}) => children,
  useActionSheet: () => ({
    showActionSheetWithOptions: mockShowActionSheetWithOptions,
  }),
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
      data: readonly {id: string}[];
      ListEmptyComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
      ListHeaderComponent?: ReactNode;
      renderItem: (info: {item: {id: string}}) => ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        ListHeaderComponent,
        data.length === 0 ? ListEmptyComponent : null,
        data.map((item) =>
          React.createElement(View, {key: item.id}, renderItem({item})),
        ),
        ListFooterComponent,
      ),
  };
});

type Item = NonNullable<
  FunctionReturnType<typeof api.items.queries.getMineByRoute>
>;
type Ledger = FunctionReturnType<typeof api.ledgers.queries.get>;
type Category = FunctionReturnType<typeof api.categories.queries.list>[number];
type Comment = FunctionReturnType<
  typeof api.comments.queries.list
>['page'][number];

const item = {
  amountMinor: -4200,
  authorId: 'user-owner',
  baseAmountMinor: -4200,
  baseCurrency: 'KRW',
  categoryKey: 'cafe',
  commentCount: 1,
  coverPhotoId: null,
  createdAt: Date.UTC(2026, 7, 27, 1),
  currency: 'KRW',
  dayKey: 20260827,
  deletedAt: null,
  id: 'item-test',
  ledgerId: 'ledger-test',
  memo: 'Invitee coffee QA',
  monthKey: 202608,
  needsReview: false,
  occurredAt: Date.UTC(2026, 7, 27, 1),
  occurredOffsetMinutes: 540,
  paidByUserId: null,
  photoCount: 0,
  place: null,
  type: 'EXPENSE',
  updatedAt: Date.UTC(2026, 7, 27, 1),
  updatedByUserId: null,
} as Item;

const ledger = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: '',
  emoji: null,
  iconKey: null,
  id: 'ledger-test',
  invitePolicy: 'MANAGERS_ONLY',
  itemWritePolicy: 'ANY_MEMBER',
  lastOpenedAt: null,
  lastReadAt: null,
  maintenanceLock: 'NONE',
  memberCount: 2,
  muted: false,
  notifyComment: true,
  notifyNewItem: true,
  ownerId: 'user-owner',
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Shared QA ledger',
  updatedAt: 1,
  weekStartsOn: 0,
} as Ledger;

const category = {
  archived: false,
  colorToken: 'brown',
  hidden: false,
  iconKey: 'Coffee',
  i18nKey: null,
  key: 'cafe',
  kind: 'EXPENSE',
  label: 'Cafe',
  reassigning: false,
  sortOrder: 0,
  source: 'PRESET',
} as Category;

const comment = {
  author: {
    avatarThumbUrl: null,
    deleted: false,
    displayName: 'Invitee QA',
    handle: 'invitee-qa',
  },
  authorId: 'user-invitee',
  attachmentPhotoIds: [],
  blockedRelationship: false,
  body: 'The shared entry is visible.',
  createdAt: Date.UTC(2026, 7, 27, 2),
  editedAt: null,
  id: 'comment-test',
  itemId: 'item-test',
  updatedAt: Date.UTC(2026, 7, 27, 2),
} as unknown as Comment;

function renderScreen(embedded = false, ledgerId?: string) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <LedgerItemDetailScreen
          embedded={embedded}
          itemId="item-test"
          ledgerId={ledgerId}
        />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('entry detail comments', () => {
  const createComment = jest.fn(() =>
    Promise.resolve({commentId: 'comment-created'}),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnected = true;
    setActiveLocale('en');
    let queryCall = 0;
    const queryResults = [item, ledger, [category], []] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(
        () => queryResults[queryCall++ % queryResults.length],
      );
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [comment],
      status: 'Exhausted',
    });
    const noopMutation = createMutationMock(() => Promise.resolve());
    const createCommentMutation = createMutationMock(createComment);
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'comments/mutations:create'
          ? createCommentMutation
          : noopMutation,
      );
  });

  it('writes entry and comment times in the app language clock', () => {
    const screen = renderScreen();

    // The editor said "5:26 AM" while this detail said "05:26" for one entry.
    expect(screen.getAllByText(/ · \d{1,2}:\d{2} (AM|PM)$/)).toHaveLength(2);
    expect(screen.queryByText(/ · \d{2}:\d{2}$/)).toBeNull();
  });

  it('constrains metadata text to the remaining row width in split detail', () => {
    const screen = renderScreen(true);
    expect(screen.getByText('Cafe')).toHaveStyle({flex: 1});
    expect(
      screen.getByText(formatDate(item.occurredAt, 'PPP · p')),
    ).toHaveStyle({flex: 1});
  });

  it.each([
    ['EXPENSE', 4200, '-₩4,200'],
    ['EXPENSE', -4200, '₩4,200'],
    ['INCOME', 4200, '₩4,200'],
    ['INCOME', -4200, '-₩4,200'],
  ] as const)(
    'shows %s %i with its cash-flow sign',
    (type, amountMinor, expected) => {
      let queryCall = 0;
      const results = [
        {...item, type, amountMinor},
        ledger,
        [category],
        [],
      ] as const;
      jest
        .mocked(useQuery)
        .mockImplementation(() => results[queryCall++ % results.length]);
      const screen = renderScreen();
      expect(screen.getByText(expected)).toBeTruthy();
    },
  );

  it('shows comment identity, time, body, and a composer', () => {
    const screen = renderScreen();

    expect(screen.getByText('1 comment')).toBeTruthy();
    expect(screen.getByText('Invitee QA')).toBeTruthy();
    expect(screen.getByText('The shared entry is visible.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Write a comment...')).toBeTruthy();
    expect(screen.getByLabelText('Send')).toHaveStyle({
      borderRadius: 22,
      height: 44,
      width: 44,
    });
    expect(screen.getByTestId('ledger-item-comment-input-wrap')).toHaveStyle({
      flex: 1,
      minWidth: 0,
    });
    expect(screen.getByTestId('ledger-item-comment-field')).toHaveStyle({
      alignItems: 'center',
      borderRadius: 28,
      borderWidth: 1,
      minHeight: 56,
    });
    expect(
      screen.getByTestId('ledger-item-comment-keyboard-area'),
    ).toBeTruthy();
    expect(screen.getByTestId('ledger-item-comment-composer')).toHaveStyle({
      paddingBottom: 8,
    });
  });

  it('keeps long comments, memos and full addresses readable', () => {
    const body =
      'First comment paragraph.\nSecond paragraph.\nThird paragraph must remain visible.';
    const memo =
      'Shared purchase notes.\nEveryone paid their share.\nKeep the receipt until next month.';
    const label =
      'A long venue address, building and floor details that must remain readable in the entry detail';
    let queryCall = 0;
    const results = [
      {...item, memo, place: {label, lat: 37.5, lng: 127}},
      ledger,
      [category],
      [],
    ] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(() => results[queryCall++ % results.length]);
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [{...comment, body}],
      status: 'Exhausted',
    });
    const screen = renderScreen();
    for (const text of [body, memo, label]) {
      expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
    }
    expect(screen.getByText(comment.author.displayName).props).toMatchObject({
      numberOfLines: 1,
      ellipsizeMode: 'tail',
      accessibilityLabel: comment.author.displayName,
    });
  });

  it.each([false, true])(
    'reserves keyboard space using the actual scene position (embedded=%s)',
    (embedded) => {
      const screen = renderScreen(embedded);
      const keyboardArea = screen.getByTestId(
        'ledger-item-comment-keyboard-area',
      );
      expect(keyboardArea.props).toMatchObject({
        automaticOffset: true,
        behavior: 'padding',
      });
      expect(
        screen.queryByTestId('ledger-item-comment-keyboard-sticky'),
      ).toBeNull();
    },
  );

  it.each([
    ['EXPENSE', 4200, '-₩4,200'],
    ['EXPENSE', -4200, '+₩4,200'],
    ['INCOME', 4200, '+₩4,200'],
    ['INCOME', -4200, '-₩4,200'],
  ] as const)(
    'renders one sign in the list for %s %i',
    (type, amountMinor, expected) => {
      const onPress = jest.fn();
      const row = {...item, type, amountMinor};
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
            <EntryRow item={row} category={category} onPress={onPress} />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByText(expected)).toBeTruthy();
      const button = screen.getByRole('button');
      expect(button.props.accessibilityLabel).toContain(expected);
      fireEvent.press(button);
      expect(onPress).toHaveBeenCalledWith(row);
    },
  );

  it('distinguishes equal amounts by memo and announces the visible category', () => {
    setActiveLocale('en');
    const onPress = jest.fn();
    const allowance = {
      ...category,
      i18nKey: 'category.walletMoney',
      key: 'walletMoney',
      kind: 'INCOME' as const,
      label: null,
    };
    const first = {
      ...item,
      amountMinor: 100,
      categoryKey: 'walletMoney',
      currency: 'USD',
      memo: 'QA allowance first',
      type: 'INCOME' as const,
    };
    const second = {...first, memo: 'QA allowance second'};
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
          <>
            <EntryRow item={first} category={allowance} onPress={onPress} />
            <EntryRow item={second} category={allowance} onPress={onPress} />
          </>
        </CpkProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'income, +$1.00, Allowance, QA allowance second',
      }),
    );
    expect(
      screen.getByRole('button', {
        name: 'income, +$1.00, Allowance, QA allowance first',
      }),
    ).toBeTruthy();
    expect(onPress).toHaveBeenCalledWith(second);
  });

  it('dates rows in lists that have no day headers', () => {
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
          <>
            <EntryRow item={item} category={category} onPress={jest.fn()} />
            <EntryRow
              dated
              item={{...item, id: 'item-dated' as typeof item.id}}
              category={category}
              onPress={jest.fn()}
            />
          </>
        </CpkProvider>
      </SafeAreaProvider>,
    );
    // Stats drill-down, search and Recently deleted showed only the memo, so
    // "Meal · Pizza" rows gave no hint of when they happened.
    expect(screen.getByText('Invitee coffee QA')).toBeTruthy();
    expect(
      screen.getByText(/^[A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} (AM|PM) · Invitee coffee QA$/),
    ).toBeTruthy();
  });

  it('keeps an empty comment thread contextual and actionable', () => {
    let queryCall = 0;
    const queryResults = [
      {...item, commentCount: 0},
      ledger,
      [category],
      [],
    ] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(
        () => queryResults[queryCall++ % queryResults.length],
      );
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [],
      status: 'Exhausted',
    });

    const screen = renderScreen();

    // One sentence says the thread is empty; the header only names it.
    expect(screen.getByText('Comments')).toBeTruthy();
    expect(screen.queryByText('No comments')).toBeNull();
    expect(screen.getByText('No comments yet. Write one below.')).toBeTruthy();
    expect(screen.getByTestId('ledger-item-comments-empty')).toHaveStyle({
      justifyContent: 'center',
      minHeight: 76,
    });
  });

  it('shows regional progress before deciding a comment thread is empty', () => {
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: true,
      loadMore: jest.fn(),
      results: [],
      status: 'LoadingFirstPage',
    });

    const screen = renderScreen();

    expect(screen.getByTestId('ledger-item-comments-loading')).toBeTruthy();
    expect(screen.queryByTestId('ledger-item-comments-empty')).toBeNull();
  });

  it('renders the complete detail inline without route chrome on tablets', () => {
    const screen = renderScreen(true);

    expect(screen.getByTestId('entry-detail-embedded')).toBeTruthy();
    expect(screen.getByText('Invitee coffee QA')).toBeTruthy();
    expect(screen.getByText('1 comment')).toBeTruthy();
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.queryByTestId('ledger-item-deleted-notice')).toBeNull();
  });

  it('does not invite a comment on a deleted entry that has no composer', () => {
    const deleted = {
      ...item,
      commentCount: 0,
      deletedAt: Date.UTC(2026, 7, 28),
    } as Item;
    let queryCall = 0;
    const queryResults = [deleted, ledger, [category], []] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(
        () => queryResults[queryCall++ % queryResults.length],
      );
    jest.mocked(usePaginatedQuery).mockReturnValue({
      isLoading: false,
      loadMore: jest.fn(),
      results: [],
      status: 'Exhausted',
    });

    const screen = renderScreen(true);

    expect(screen.queryByTestId('ledger-item-comment-field')).toBeNull();
    expect(screen.queryByText('No comments yet. Write one below.')).toBeNull();
    expect(screen.getByText('No comments yet.')).toBeTruthy();
  });

  it('marks a deleted entry and restores it without the overflow menu', async () => {
    const restore = jest.fn(() => Promise.resolve(null));
    const deleted = {...item, deletedAt: Date.UTC(2026, 7, 28)} as Item;
    let queryCall = 0;
    const queryResults = [deleted, ledger, [category], []] as const;
    jest
      .mocked(useQuery)
      .mockImplementation(
        () => queryResults[queryCall++ % queryResults.length],
      );
    const restoreMutation = createMutationMock(restore);
    const noopMutation = createMutationMock(() => Promise.resolve());
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'items/mutations:restore'
          ? restoreMutation
          : noopMutation,
      );
    const screen = renderScreen(true);

    expect(screen.getByTestId('ledger-item-deleted-notice')).toBeTruthy();
    expect(
      screen.getByText(
        'Deleted entries can be opened and restored during the recovery period.',
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Restore entry'));
    await waitFor(() =>
      expect(restore).toHaveBeenCalledWith({itemId: item.id}),
    );
  });

  it('anchors the entry and comment menus to the pressed button on iPad', () => {
    const screen = renderScreen(true);

    fireEvent.press(screen.getByTestId('ledger-item-more'), {
      nativeEvent: {target: 4242},
    });
    fireEvent.press(screen.getAllByLabelText('More').at(-1)!, {
      nativeEvent: {target: 5151},
    });

    expect(mockShowActionSheetWithOptions.mock.calls[0]?.[0]).toMatchObject({
      anchor: 4242,
    });
    expect(mockShowActionSheetWithOptions.mock.calls[1]?.[0]).toMatchObject({
      anchor: 5151,
    });
  });

  it('keeps the Android action sheet above the navigation bar', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 411, height: 731},
          insets: {top: 24, left: 0, right: 0, bottom: 48},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'dark'}}
        >
          <LedgerItemDetailScreen itemId="item-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    // On a Pixel 2 the sheet's Cancel row sat on the back/home buttons.
    fireEvent.press(screen.getByTestId('ledger-item-more'));
    expect(mockShowActionSheetWithOptions.mock.calls[0]?.[0]).toMatchObject({
      containerStyle: {paddingBottom: 48},
      textStyle: {color: expect.any(String)},
    });
  });

  it('uses the quiet legacy detail hierarchy and sends editing to the ledger route', () => {
    const screen = renderScreen();

    expect(screen.getByTestId('ledger-item-metadata')).toHaveStyle({
      gap: 2,
      paddingBottom: 26,
    });
    expect(screen.getByTestId('ledger-item-category')).toHaveStyle({
      minHeight: 48,
      paddingVertical: 9,
    });
    expect(screen.getByTestId('ledger-item-date')).toHaveStyle({
      minHeight: 48,
      paddingVertical: 9,
    });
    expect(screen.getByTestId('ledger-item-memo')).toBeTruthy();
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.queryByLabelText('Delete')).toBeNull();

    fireEvent.press(screen.getByTestId('ledger-item-more'));
    const selectItemAction = mockShowActionSheetWithOptions.mock.calls[0]?.[1];
    expect(selectItemAction).toEqual(expect.any(Function));
    selectItemAction?.(0);
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/ledger/[ledgerId]/item/[itemId]/edit',
      params: {itemId: item.id, ledgerId: item.ledgerId},
    });
  });

  it('returns a protected canonical route without flashing an error', async () => {
    jest.mocked(useQuery).mockReturnValue(null);
    jest.mocked(router.canGoBack).mockReturnValue(true);

    const screen = renderScreen(false, 'ledger-foreign');

    expect(screen.getByTestId('bookoo-loading')).toBeTruthy();
    expect(screen.queryByText('Item not found')).toBeNull();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows a contextual empty detail in a tablet pane after access is revoked', () => {
    jest.mocked(useQuery).mockReturnValue(null);

    const screen = renderScreen(true, 'ledger-foreign');

    expect(screen.getByTestId('entry-detail-embedded')).toBeTruthy();
    expect(screen.getByText('This entry no longer exists.')).toBeTruthy();
    expect(screen.queryByTestId('bookoo-loading')).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('creates a comment directly through the server mutation', async () => {
    const screen = renderScreen();
    const input = screen.getByPlaceholderText('Write a comment...');

    fireEvent.changeText(input, 'Owner reply from dual simulator QA');
    expect(screen.getByLabelText('Send')).toBeEnabled();
    fireEvent.press(screen.getByLabelText('Send'));

    await waitFor(() => {
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Owner reply from dual simulator QA',
          itemId: item.id,
        }),
      );
    });
  });

  it('reuses the request id for an unchanged ambiguous comment retry', async () => {
    const ambiguousCreate = jest
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({commentId: 'comment-created'});
    const createMutation = createMutationMock(ambiguousCreate);
    const noopMutation = createMutationMock(() => Promise.resolve());
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'comments/mutations:create'
          ? createMutation
          : noopMutation,
      );
    const screen = renderScreen();
    const input = screen.getByPlaceholderText('Write a comment...');

    fireEvent.changeText(input, 'Retry the same reply');
    fireEvent.press(screen.getByLabelText('Send'));
    expect(await screen.findByText('Try again')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(ambiguousCreate).toHaveBeenCalledTimes(2));
    const first = ambiguousCreate.mock.calls[0]?.[0] as {
      clientRequestId: string;
    };
    const second = ambiguousCreate.mock.calls[1]?.[0] as {
      clientRequestId: string;
    };
    expect(second.clientRequestId).toBe(first.clientRequestId);
  });

  it('keeps an offline comment in the composer and offers retry', async () => {
    mockConnected = false;
    const screen = renderScreen();
    const input = screen.getByPlaceholderText('Write a comment...');

    fireEvent.changeText(input, 'Keep this draft visible');
    fireEvent.press(screen.getByLabelText('Send'));

    expect(
      await screen.findByText('Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('Write a comment...').props.value).toBe(
      'Keep this draft visible',
    );
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expect(createComment).not.toHaveBeenCalled();
  });
});

describe('reactive entry row equivalence', () => {
  const onPress = jest.fn();
  it('reuses freshly serialized identical row/category DTOs', () => {
    const props = {item, category, onPress};
    expect(
      entryRowPropsEqual(props, {
        ...props,
        item: {...item},
        category: {...category},
      }),
    ).toBe(true);
  });
  it.each([
    {memo: 'changed without a clock tick'},
    {amountMinor: 123},
    {currency: 'USD'},
    {commentCount: 2},
    {photoCount: 3},
    {needsReview: true},
  ])(
    'keeps a real data change live even at the same updatedAt: %j',
    (change) => {
      const props = {item, category, onPress};
      expect(
        entryRowPropsEqual(props, {...props, item: {...item, ...change}}),
      ).toBe(false);
    },
  );
  it('preserves flat place changes without treating identical serialized places as new data', () => {
    const place = {label: 'Synthetic place', lat: 0, lng: 0};
    const props = {item: {...item, place}, category, onPress};
    expect(
      entryRowPropsEqual(props, {
        ...props,
        item: {...props.item, place: {...place}},
      }),
    ).toBe(true);
    expect(
      entryRowPropsEqual(props, {
        ...props,
        item: {...props.item, place: {...place, lng: 1}},
      }),
    ).toBe(false);
  });
  it('does not retain an old press handler or category label', () => {
    const props = {item, category, onPress};
    expect(entryRowPropsEqual(props, {...props, onPress: jest.fn()})).toBe(
      false,
    );
    expect(
      entryRowPropsEqual(props, {
        ...props,
        category: {...category, label: 'New label'},
      }),
    ).toBe(false);
  });
});
