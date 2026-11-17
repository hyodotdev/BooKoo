import 'react-native';

import type {ReactNode} from 'react';
import {Alert} from 'react-native';
import {act, render, fireEvent, waitFor} from '@testing-library/react-native';
import {useMutation, usePaginatedQuery} from 'convex/react';
import {getFunctionName} from 'convex/server';
import {CpkProvider} from 'cpk-ui';
import {Directory, File} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {api} from '@convex/_generated/api';
import {PrivacyScreen} from '../../../../src/features/release/screens';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';
import * as i18n from '../../../../src/utils/i18n';

let mockOnEndReached: (() => void) | undefined;

jest.mock('@convex-dev/auth/react', () => ({
  useAuthToken: () => 'export-token',
}));
jest.mock('../../../../src/features/ads/provider', () => ({
  useAdRuntime: () => ({
    privacyOptionsRequired: false,
    showPrivacyOptions: jest.fn(),
  }),
}));
jest.mock('../../../../src/features/auth/currentUser', () => ({
  useCurrentUser: () => ({countryAnalyticsEnabled: false}),
}));
jest.mock('expo-file-system', () => {
  class MockFile {
    static downloadFileAsync = jest.fn();
    copy = jest.fn(() => Promise.resolve());
    delete = jest.fn();
    uri = 'file:///cache/bookoo-export.zip';
  }
  class MockDirectory {
    static pickDirectoryAsync = jest.fn();
    name = 'BooKoo Exports';
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {cache: 'file:///cache'},
  };
});
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({
      data,
      ListHeaderComponent,
      onEndReached,
      renderItem,
      testID,
    }: {
      data: readonly unknown[];
      ListHeaderComponent?: ReactNode;
      onEndReached?: () => void;
      renderItem: (info: {item: unknown}) => ReactNode;
      testID?: string;
    }) => {
      mockOnEndReached = onEndReached;
      return React.createElement(
        View,
        {testID},
        ListHeaderComponent,
        data.map((item, index) =>
          React.createElement(View, {key: index}, renderItem({item})),
        ),
      );
    },
  };
});

const READY_EXPORT = {
  completedAt: 2,
  expiresAt: 99,
  failedCode: null,
  id: 'export-ready',
  kind: 'PERSONAL',
  requestedAt: 1,
  state: 'READY',
};
const EXPORT_FILE = {
  byteSize: 1024,
  exportId: 'export-ready',
  fileName: 'bookoo-private-export.zip',
  id: 'file-ready',
  storageId: 'storage-export',
};

function page(results: unknown[]): ReturnType<typeof usePaginatedQuery> {
  return {
    isLoading: false,
    loadMore: jest.fn((_count: number) => undefined),
    results,
    status: 'Exhausted' as const,
  } as ReturnType<typeof usePaginatedQuery>;
}

function mutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

function renderPrivacyScreen() {
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
        <PrivacyScreen />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('privacy export download', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useMutation)
      .mockReturnValue(mutationMock(() => Promise.resolve()));
    mockOnEndReached = undefined;
    setActiveLocale('en');
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL = 'https://example.convex.site';
    jest.mocked(usePaginatedQuery).mockImplementation((reference) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.exports.queries.listMine))
        return page([READY_EXPORT]);
      if (name === getFunctionName(api.exports.queries.files))
        return page([EXPORT_FILE]);
      return page([]);
    });
    jest
      .mocked(File.downloadFileAsync)
      .mockResolvedValue(new File('file:///cache/bookoo-private-export.zip'));
    jest
      .mocked(Directory.pickDirectoryAsync)
      .mockResolvedValue(new Directory('file:///chosen') as never);
    jest.spyOn(Alert, 'alert');
  });

  it('offers an explicit folder picker and tells the user where the file went', async () => {
    const screen = renderPrivacyScreen();

    fireEvent.press(
      screen.getByRole('button', {
        name: 'bookoo-private-export.zip · 1024',
      }),
    );

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Choose where to save',
        expect.stringContaining('bookoo-private-export.zip'),
        expect.any(Array),
      ),
    );
    const readyAlert = jest
      .mocked(Alert.alert)
      .mock.calls.find(([title]) => title === 'Choose where to save');
    const saveToFolder = readyAlert?.[2]?.[0];
    expect(saveToFolder?.text).toBe('Choose folder');
    saveToFolder?.onPress?.();

    await waitFor(() => {
      expect(Directory.pickDirectoryAsync).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        expect.stringContaining('BooKoo Exports'),
        [{text: 'OK'}],
      );
    });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('keeps initial and continuation pages within each server limit', () => {
    const exportLoadMore = jest.fn();
    const fileLoadMore = jest.fn();
    const blockLoadMore = jest.fn();
    jest.mocked(usePaginatedQuery).mockImplementation((reference) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.exports.queries.listMine))
        return {
          ...page([READY_EXPORT]),
          loadMore: exportLoadMore,
          status: 'CanLoadMore',
        } as ReturnType<typeof usePaginatedQuery>;
      if (name === getFunctionName(api.exports.queries.files))
        return {
          ...page([EXPORT_FILE]),
          loadMore: fileLoadMore,
          status: 'CanLoadMore',
        } as ReturnType<typeof usePaginatedQuery>;
      return {
        ...page([]),
        loadMore: blockLoadMore,
        status: 'CanLoadMore',
      } as ReturnType<typeof usePaginatedQuery>;
    });

    renderPrivacyScreen();
    const calls = jest.mocked(usePaginatedQuery).mock.calls;
    const initialSize = (functionName: string): number | undefined =>
      calls.find(
        ([reference]) => getFunctionName(reference) === functionName,
      )?.[2]?.initialNumItems;

    expect(initialSize(getFunctionName(api.exports.queries.listMine))).toBe(20);
    expect(initialSize(getFunctionName(api.exports.queries.files))).toBe(30);
    expect(initialSize(getFunctionName(api.blocks.queries.listMine))).toBe(30);

    expect(mockOnEndReached).toBeDefined();
    mockOnEndReached?.();
    expect(exportLoadMore).toHaveBeenCalledWith(20);
    expect(fileLoadMore).toHaveBeenCalledWith(30);
    expect(blockLoadMore).toHaveBeenCalledWith(30);
  });

  it('does not repaint an unchanged export row when another row downloads', async () => {
    const formatDate = jest.spyOn(i18n, 'formatDate');
    const screen = renderPrivacyScreen();
    const initialCalls = formatDate.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);
    fireEvent.press(
      screen.getByRole('button', {name: 'bookoo-private-export.zip · 1024'}),
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(formatDate).toHaveBeenCalledTimes(initialCalls);
    await act(async () => setActiveLocale('ko'));
    expect(formatDate.mock.calls.length).toBeGreaterThan(initialCalls);
    formatDate.mockRestore();
  });

  it('shows a retryable error when requesting an export is rejected', async () => {
    const request = jest
      .fn()
      .mockRejectedValue(new Error('Export already active'));
    jest.mocked(useMutation).mockReturnValue(mutationMock(request));
    const screen = renderPrivacyScreen();
    fireEvent.press(
      screen.getByRole('button', {name: i18n.t('release.exportMine')}),
    );
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        i18n.t('common.warning'),
        i18n.t('error.generic'),
        [{text: i18n.t('common.ok')}],
      ),
    );
    expect(
      screen.getByRole('button', {name: i18n.t('release.exportMine')}),
    ).toBeEnabled();
  });
});

it('requests an optional country choice only on explicit press with the displayed notice', async () => {
  const {LEGAL_DOCUMENT_VERSION, PRIVACY_DOCUMENT_SHA256} = jest.requireActual<
    typeof import('../../../../shared/legal')
  >('../../../../shared/legal');
  const update = jest.fn(async () => undefined);
  jest.mocked(useMutation).mockReturnValue(mutationMock(update));
  const screen = renderPrivacyScreen();
  expect(update).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Country usage statistics'));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      enabled: true,
      documentVersion: LEGAL_DOCUMENT_VERSION,
      documentSha256: PRIVACY_DOCUMENT_SHA256,
    }),
  );
});
