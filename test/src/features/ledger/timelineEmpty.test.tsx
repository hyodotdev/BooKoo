import {act, fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useWindowDimensions} from 'react-native';
import {useTabletLayout} from '../../../../src/hooks/useTabletLayout';

import {TimelineEmptyState} from '../../../../src/features/ledger/screens/timeline';
import {EntryRow} from '../../../../src/features/ledger/ui';
import type {ItemRow} from '../../../../src/features/ledger/types';
import type {Id} from '../../../../convex/_generated/dataModel';
import {theme} from '../../../../src/theme';
import {BOOKOO_PALETTE} from '../../../../src/theme/bookooPalette';
import {setActiveLocale} from '../../../../src/utils/i18n';

jest.mock('../../../../src/hooks/useTabletLayout', () => ({
  useTabletLayout: jest.fn(() => false),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 390, height: 844, fontScale: 1, scale: 2})),
}));

describe('empty timeline', () => {
  afterEach(() => jest.mocked(useTabletLayout).mockReturnValue(false));

  it.each(['light', 'dark'] as const)(
    'invites an entry in a landscape %s tablet',
    (themeType) => {
      setActiveLocale('en');
      jest.mocked(useTabletLayout).mockReturnValue(true);
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({width: 1280, height: 800, fontScale: 1, scale: 1});
      const onAdd = jest.fn();
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 1280, height: 800},
            insets: {top: 0, left: 0, right: 0, bottom: 0},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: themeType}}
          >
            <TimelineEmptyState onAdd={onAdd} />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByTestId('entry-invitation')).toBeTruthy();
      expect(screen.getByText('Every entry counts.')).toBeTruthy();
      expect(screen.queryByText('No entries yet.')).toBeNull();
      expect(screen.getAllByRole('button', {name: 'Add entry'})).toHaveLength(
        1,
      );
      fireEvent.press(screen.getByTestId('timeline-empty-add'));
      expect(onAdd).toHaveBeenCalledTimes(1);
    },
  );
  it('reformats a memoized entry without new server data or a remount', () => {
    setActiveLocale('ko');
    const item: ItemRow = {
      amountMinor: 6855,
      authorId: 'locale-user' as Id<'users'>,
      baseAmountMinor: 6855,
      baseCurrency: 'USD',
      categoryKey: 'stuffs',
      commentCount: 0,
      coverPhotoId: null,
      createdAt: 1,
      currency: 'USD',
      dayKey: 20260906,
      deletedAt: null,
      id: 'locale-item' as Id<'ledgerItems'>,
      ledgerId: 'locale-ledger' as Id<'ledgers'>,
      memo: 'Weekly groceries',
      monthKey: 202609,
      needsReview: false,
      occurredAt: Date.UTC(2026, 8, 6),
      occurredOffsetMinutes: 0,
      paidByUserId: null,
      photoCount: 0,
      place: null,
      type: 'EXPENSE',
      updatedAt: 1,
      updatedByUserId: null,
    };
    const onPress = jest.fn();
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
          <EntryRow item={item} onPress={onPress} />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    expect(
      screen.getByRole('button', {name: '지출, -US$68.55, stuffs, Weekly groceries'}),
    ).toBeTruthy();
    act(() => setActiveLocale('en'));
    fireEvent.press(
      screen.getByRole('button', {name: 'expense, -$68.55, stuffs, Weekly groceries'}),
    );
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('updates an already mounted state when the app language changes', () => {
    setActiveLocale('ko');
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
          <TimelineEmptyState onAdd={jest.fn()} />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('No entries yet.')).toBeNull();
    act(() => setActiveLocale('en'));
    expect(screen.getByText('No entries yet.')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Add entry'})).toBeTruthy();
  });

  it.each(['light', 'dark'] as const)(
    'centers one concise add-entry action in %s',
    (themeType) => {
      setActiveLocale('en');
      const onAdd = jest.fn();
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 390, height: 844},
            insets: {top: 0, left: 0, right: 0, bottom: 0},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: themeType}}
          >
            <TimelineEmptyState onAdd={onAdd} />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByTestId('timeline-empty')).toHaveStyle({
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
      });
      expect(screen.getAllByText('No entries yet.')).toHaveLength(1);
      expect(screen.getByText('Add entry')).toHaveStyle({
        color: BOOKOO_PALETTE.white,
      });
      fireEvent.press(screen.getByRole('button', {name: 'Add entry'}));
      expect(onAdd).toHaveBeenCalledTimes(1);
    },
  );
});
