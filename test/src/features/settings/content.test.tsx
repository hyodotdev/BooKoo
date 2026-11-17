import type {ReactNode} from 'react';
import {
  act,
  cleanupAsync,
  fireEvent,
  render,
} from '@testing-library/react-native';
import {StyleSheet, View} from 'react-native';
import {usePaginatedQuery} from 'convex/react';
import {Accordion, CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ContentScreen} from '~/features/release/screens';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';

const mockLoadMore = jest.fn();
let mockOnEndReached: (() => void) | undefined;

jest.mock('~/features/auth/session', () => ({
  useSession: () => ({user: {locale: 'en'}}),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      onEndReached,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      onEndReached?: () => void;
      renderItem: (info: {item: unknown}) => ReactNode;
      testID?: string;
    }) => {
      mockOnEndReached = onEndReached;
      return React.createElement(
        View,
        {testID},
        data.map((item, index) =>
          React.createElement(View, {key: index}, renderItem({item})),
        ),
      );
    },
  };
});

const QUESTION =
  'What is the difference between a personal ledger and a shared ledger?';
const ANSWER = 'A shared ledger lets invited members record entries together.';

function contentTree(kind: 'FAQ' | 'NOTICE') {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 47, left: 0, right: 0, bottom: 34},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <ContentScreen kind={kind} />
      </CpkProvider>
    </SafeAreaProvider>
  );
}

function renderContent(kind: 'FAQ' | 'NOTICE') {
  return render(contentTree(kind));
}

describe('content list copy and reading', () => {
  beforeEach(() => {
    jest.useFakeTimers({doNotFake: ['queueMicrotask']});
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(usePaginatedQuery).mockReturnValue({
      results: [
        {
          id: 'content-fixture',
          key: 'fixture',
          title: QUESTION,
          body: ANSWER,
          pinned: false,
        },
      ],
      status: 'CanLoadMore',
      isLoading: false,
      loadMore: mockLoadMore,
    });
  });

  afterEach(async () => {
    await cleanupAsync();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it.each(['FAQ', 'NOTICE'] as const)(
    'lets %s titles wrap without repeating the route title',
    (kind) => {
      const screen = renderContent(kind);
      expect(screen.getByText(QUESTION).props.numberOfLines).toBe(2);
      expect(
        screen.queryByText(kind === 'FAQ' ? 'FAQ' : 'Announcements'),
      ).toBeNull();
      mockOnEndReached?.();
      expect(mockLoadMore).toHaveBeenCalledWith(50);
    },
  );

  it.each(['FAQ', 'NOTICE'] as const)(
    'uses an animated, full-width cpk-ui accordion for %s',
    async (kind) => {
      const screen = renderContent(kind);
      const accordion = screen.UNSAFE_getByType(Accordion);
      expect(accordion.props.shouldAnimate).toBe(true);
      expect(StyleSheet.flatten(accordion.props.style).width).toBe('100%');
      const columns = screen
        .UNSAFE_getAllByType(View)
        .map((view) => StyleSheet.flatten(view.props.style));
      expect(
        columns.some(
          (style) =>
            style?.width === '100%' &&
            style?.borderLeftWidth !== undefined &&
            style?.maxWidth === undefined,
        ),
      ).toBe(true);
      expect(screen.queryByText(ANSWER)).toBeNull();
      fireEvent.press(screen.getByRole('button', {name: QUESTION}));
      await act(async () => {
        jest.runAllTimers();
      });
      expect(
        screen.getByRole('button', {name: QUESTION}).props.accessibilityState
          .expanded,
      ).toBe(true);
      expect(screen.getByText(ANSWER)).toBeTruthy();
      fireEvent.press(screen.getByRole('button', {name: QUESTION}));
      await act(async () => {
        jest.runAllTimers();
      });
      expect(
        screen.getByRole('button', {name: QUESTION}).props.accessibilityState
          .expanded,
      ).toBe(false);
      expect(screen.queryByText(ANSWER)).toBeNull();
    },
  );

  it('does not load more after the last page', () => {
    jest.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: 'Exhausted',
      isLoading: false,
      loadMore: mockLoadMore,
    });
    renderContent('FAQ');
    mockOnEndReached?.();
    expect(mockLoadMore).not.toHaveBeenCalled();
  });

  it.each(['FAQ', 'NOTICE'] as const)(
    'advances a filtered empty first %s page without a scroll event',
    (kind) => {
      jest.mocked(usePaginatedQuery).mockReturnValue({
        results: [],
        status: 'CanLoadMore',
        isLoading: false,
        loadMore: mockLoadMore,
      });
      renderContent(kind);
      expect(mockLoadMore).toHaveBeenCalledTimes(1);
      expect(mockLoadMore).toHaveBeenCalledWith(50);
    },
  );

  it('continues a requested invisible page, then stops when visible rows arrive', () => {
    // Keep the visible count unchanged while the server skips expired content.
    const visible = [
      {id: 'first', key: 'first', title: QUESTION, body: ANSWER},
    ];
    const setPage = (
      status: 'CanLoadMore' | 'LoadingMore',
      results = visible,
    ) =>
      jest.mocked(usePaginatedQuery).mockReturnValue({
        results,
        ...(status === 'LoadingMore'
          ? {status: 'LoadingMore', isLoading: true}
          : {status: 'CanLoadMore', isLoading: false}),
        loadMore: mockLoadMore,
      });
    setPage('CanLoadMore');
    const screen = renderContent('FAQ');
    act(() => mockOnEndReached?.());
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
    setPage('LoadingMore');
    screen.rerender(contentTree('FAQ'));
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
    setPage('CanLoadMore');
    screen.rerender(contentTree('FAQ'));
    expect(mockLoadMore).toHaveBeenCalledTimes(2);
    setPage('LoadingMore');
    screen.rerender(contentTree('FAQ'));
    setPage('CanLoadMore', [
      ...visible,
      {...visible[0], id: 'second', key: 'second'},
    ]);
    screen.rerender(contentTree('FAQ'));
    expect(mockLoadMore).toHaveBeenCalledTimes(2);
  });
});
