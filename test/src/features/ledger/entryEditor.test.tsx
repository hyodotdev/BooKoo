import 'react-native';
import {BackHandler, Keyboard, Platform} from 'react-native';

import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import {getFunctionName} from 'convex/server';
import {useMutation, useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import * as Crypto from 'expo-crypto';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerItemFormScreen} from '../../../../src/features/ledger/screens/entryEditor';
import {
  pickItemPhotos,
  uploadItemPhoto,
} from '../../../../src/features/media/itemPhotoUpload';
import {
  isReceiptOcrAvailable,
  readReceipt,
} from '../../../../src/features/media/receiptOcr';
import {useEntryPickerStore} from '../../../../src/features/ledger/entryPickerStore';
import type {ItemRow, LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {getLocale, setActiveLocale} from '../../../../src/utils/i18n';

let mockConnected = true;

jest.mock('../../../../src/features/media/itemPhotoUpload', () => ({
  pickItemPhotos: jest.fn(),
  uploadItemPhoto: jest.fn(),
}));

jest.mock('../../../../src/features/media/receiptOcr', () => ({
  isReceiptOcrAvailable: jest.fn(() => false),
  readReceipt: jest.fn(),
}));

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({user: {userId: 'user-owner'}}),
}));
jest.mock('../../../../src/features/runtime/connectivity', () => ({
  useConnectivity: () => ({connected: mockConnected, showOffline: false}),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<
    typeof import('react-native-gesture-handler')
  >('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: ({children}: {children: React.ReactNode}) =>
      React.createElement(React.Fragment, null, children),
  };
});

function createMutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

const ledger = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'PINK',
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
  title: 'Private QA ledger',
  updatedAt: 1,
  weekStartsOn: 0,
} as LedgerRow;

const item = {
  amountMinor: 4200,
  authorId: 'user-owner',
  baseAmountMinor: 4200,
  baseCurrency: 'KRW',
  categoryKey: 'cafe',
  commentCount: 0,
  coverPhotoId: null,
  createdAt: 1,
  currency: 'KRW',
  dayKey: 20260830,
  deletedAt: null,
  id: 'item-test',
  ledgerId: 'ledger-test',
  memo: 'Synthetic cafe entry',
  monthKey: 202608,
  needsReview: false,
  occurredAt: Date.UTC(2026, 7, 30, 3),
  occurredOffsetMinutes: 540,
  paidByUserId: null,
  photoCount: 0,
  place: null,
  type: 'EXPENSE',
  updatedAt: 1,
  updatedByUserId: null,
} as ItemRow;

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
};

function renderForm(editing: boolean, fromInvite = false) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 59, left: 0, right: 0, bottom: 34},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <LedgerItemFormScreen
          fromInvite={fromInvite}
          item={editing ? item : undefined}
          ledger={ledger}
        />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger item editor actions', () => {
  const softDelete = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(router.canGoBack).mockReturnValue(false);
    mockConnected = true;
    jest.mocked(isReceiptOcrAvailable).mockReturnValue(false);
    useEntryPickerStore.getState().clearCategorySelection();
    useEntryPickerStore.getState().clearPlaceSelection();
    jest.mocked(useQuery).mockImplementation((query, _args?: unknown) => {
      switch (getFunctionName(query)) {
        case 'photos/queries:listByItem':
          return [];
        case 'categories/queries:list':
          return [category];
        case 'items/queries:getMineByRoute':
          return {...item, id: 'created-item', amountMinor: 6800};
        default:
          return undefined;
      }
    });
    const noop = createMutationMock(() => Promise.resolve());
    const deleteMutation = createMutationMock(softDelete);
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'items/mutations:softDelete'
          ? deleteMutation
          : noop,
      );
  });

  it('keeps an offline edit on screen with an explicit retry action', async () => {
    mockConnected = false;
    const screen = renderForm(true);

    fireEvent.press(screen.getByText('Done'));

    expect(
      await screen.findByText('Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('reuses the request id for an unchanged ambiguous edit retry', async () => {
    const update = jest
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({itemId: item.id, status: 'UPDATED'});
    const updateMutation = createMutationMock(update);
    const noop = createMutationMock(() => Promise.resolve());
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'items/mutations:update'
          ? updateMutation
          : noop,
      );
    const screen = renderForm(true);

    fireEvent.press(screen.getByText('Done'));
    expect(await screen.findByText('Try again')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const first = update.mock.calls[0]?.[0] as {clientRequestId: string};
    const second = update.mock.calls[1]?.[0] as {clientRequestId: string};
    expect(second.clientRequestId).toBe(first.clientRequestId);
  });

  it.each([false, true])(
    'creates an online entry and returns to the ledger (invite: %s)',
    async (fromInvite) => {
      const create = jest
        .fn()
        .mockResolvedValue({itemId: 'created-item', status: 'CREATED'});
      const createMutation = createMutationMock(create);
      const noop = createMutationMock(() => Promise.resolve());
      jest
        .mocked(useMutation)
        .mockImplementation((mutation) =>
          getFunctionName(mutation) === 'items/mutations:create'
            ? createMutation
            : noop,
        );
      jest.mocked(router.canGoBack).mockReturnValue(fromInvite);
      const screen = renderForm(false, fromInvite);

      act(() =>
        useEntryPickerStore.getState().selectCategory({
          categoryKey: category.key,
          ledgerId: ledger.id,
        }),
      );
      fireEvent.changeText(screen.getByTestId('entry-amount-input'), '6800');
      fireEvent.press(screen.getByText('Done'));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 6800,
          categoryKey: category.key,
          clientRequestId: expect.any(String),
          ledgerId: ledger.id,
        }),
      );
      await waitFor(() =>
        expect(
          fromInvite ? router.dismissTo : router.replace,
        ).toHaveBeenCalledWith('/(app)/(tabs)/(root)'),
      );
      expect(router.back).not.toHaveBeenCalled();
    },
  );

  it('closes an invite-launched editor to the ledger instead of an earlier invite', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);
    const screen = renderForm(false, true);

    fireEvent.press(screen.getByTestId('entry-route-back'));

    expect(router.dismissTo).toHaveBeenCalledWith('/(app)/(tabs)/(root)');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('returns to the ledger on Android system back from an invite-launched editor', () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const remove = jest.fn();
    const add = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({remove});
    try {
      renderForm(false, true);
      const focus = jest.mocked(useFocusEffect).mock.lastCall?.[0];
      const cleanup = focus?.();
      expect(add).toHaveBeenCalledWith(
        'hardwareBackPress',
        expect.any(Function),
      );
      expect(
        add.mock.lastCall?.[1]({type: 'hardwareBackPress', timeStamp: 0}),
      ).toBe(true);
      expect(router.dismissTo).toHaveBeenCalledWith('/(app)/(tabs)/(root)');
      expect(router.back).not.toHaveBeenCalled();
      cleanup?.();
      expect(remove).toHaveBeenCalled();
    } finally {
      add.mockRestore();
      os.restore();
    }
  });

  it('uses a new request id after an ambiguous edit draft changes', async () => {
    jest
      .spyOn(Crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const update = jest
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({itemId: item.id, status: 'UPDATED'});
    const updateMutation = createMutationMock(update);
    const noop = createMutationMock(() => Promise.resolve());
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'items/mutations:update'
          ? updateMutation
          : noop,
      );
    const screen = renderForm(true);

    fireEvent.press(screen.getByText('Done'));
    expect(await screen.findByText('Try again')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Memo'), 'Changed draft');
    fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const first = update.mock.calls[0]?.[0] as {clientRequestId: string};
    const second = update.mock.calls[1]?.[0] as {clientRequestId: string};
    expect(second.clientRequestId).not.toBe(first.clientRequestId);
  });

  it('updates the saved entry instead of duplicating it after photo failure', async () => {
    const create = jest.fn().mockResolvedValue({itemId: 'created-item'});
    const update = jest
      .fn()
      .mockResolvedValue({itemId: 'created-item', status: 'UPDATED'});
    jest.mocked(pickItemPhotos).mockResolvedValue([
      {
        key: 'photo-one',
        uri: 'file:///synthetic.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
      },
    ]);
    jest
      .mocked(uploadItemPhoto)
      .mockRejectedValueOnce(new Error('upload connection lost'))
      .mockResolvedValue(undefined);
    jest.mocked(useMutation).mockImplementation((mutation) => {
      if (getFunctionName(mutation) === 'items/mutations:create')
        return createMutationMock(create);
      if (getFunctionName(mutation) === 'items/mutations:update')
        return createMutationMock(update);
      return createMutationMock(() => Promise.resolve());
    });
    const screen = renderForm(false);
    act(() =>
      useEntryPickerStore
        .getState()
        .selectCategory({categoryKey: category.key, ledgerId: ledger.id}),
    );
    fireEvent.changeText(screen.getByTestId('entry-amount-input'), '6800');
    fireEvent.press(screen.getByTestId('entry-add-photo'));
    await screen.findByTestId('entry-pending-photo-photo-one');
    fireEvent.press(screen.getByText('Done'));
    await screen.findByText('Try again');
    fireEvent.changeText(screen.getByTestId('entry-amount-input'), '6900');
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(uploadItemPhoto).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({itemId: 'created-item', amountMinor: 6900}),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)'),
    );
  });

  it('applies OCR only after confirmation and leaves saving to the user', async () => {
    jest.mocked(isReceiptOcrAvailable).mockReturnValue(true);
    jest.mocked(pickItemPhotos).mockResolvedValue([
      {
        key: 'receipt-one',
        uri: 'file:///synthetic.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
      },
    ]);
    jest.mocked(readReceipt).mockResolvedValue({
      amountMinor: 18500,
      dayKey: 20261009,
      currencyMismatch: false,
    });
    const create = jest.fn().mockResolvedValue({itemId: 'created-item'});
    jest
      .mocked(useMutation)
      .mockImplementation(() => createMutationMock(create));
    const screen = renderForm(false);
    fireEvent.changeText(screen.getByTestId('entry-amount-input'), '4200');
    fireEvent.press(screen.getByTestId('entry-scan-receipt'));
    await screen.findByText('Review receipt');
    expect(screen.getByTestId('entry-amount-input').props.value).toBe('4200');
    expect(screen.queryByTestId('entry-pending-photo-receipt-one')).toBeNull();
    fireEvent.press(screen.getByLabelText('Apply to draft'));
    await waitFor(() =>
      expect(screen.getByTestId('entry-amount-input').props.value).toBe(
        '18500',
      ),
    );
    expect(screen.getByTestId('entry-pending-photo-receipt-one')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(uploadItemPhoto).not.toHaveBeenCalled();
  });

  it('keeps an existing entry receipt pending until Done', async () => {
    jest.mocked(isReceiptOcrAvailable).mockReturnValue(true);
    jest.mocked(pickItemPhotos).mockResolvedValue([
      {
        key: 'receipt-one',
        uri: 'file:///synthetic.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
      },
    ]);
    jest.mocked(readReceipt).mockResolvedValue({
      amountMinor: 18500,
      dayKey: 20261009,
      currencyMismatch: false,
    });
    const create = jest.fn().mockResolvedValue({itemId: 'created-item'});
    jest
      .mocked(useMutation)
      .mockImplementation(() => createMutationMock(create));
    const screen = renderForm(true);
    fireEvent.changeText(screen.getByTestId('entry-amount-input'), '4200');
    fireEvent.press(screen.getByTestId('entry-scan-receipt'));
    await screen.findByText('Review receipt');
    expect(screen.getByTestId('entry-amount-input').props.value).toBe('4200');
    expect(screen.queryByTestId('entry-pending-photo-receipt-one')).toBeNull();
    fireEvent.press(screen.getByLabelText('Apply to draft'));
    await waitFor(() =>
      expect(screen.getByTestId('entry-amount-input').props.value).toBe(
        '18500',
      ),
    );
    expect(screen.getByTestId('entry-pending-photo-receipt-one')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(uploadItemPhoto).not.toHaveBeenCalled();
  });

  it('preserves the draft when OCR confirmation is cancelled', async () => {
    jest.mocked(isReceiptOcrAvailable).mockReturnValue(true);
    jest.mocked(pickItemPhotos).mockResolvedValue([
      {
        key: 'receipt-one',
        uri: 'file:///synthetic.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
      },
    ]);
    jest.mocked(readReceipt).mockResolvedValue({
      amountMinor: 18500,
      dayKey: 20261009,
      currencyMismatch: false,
    });
    const screen = renderForm(true);
    fireEvent.press(screen.getByTestId('entry-scan-receipt'));
    await screen.findByText('Review receipt');
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.getByTestId('entry-amount-input').props.value).toBe('4200');
    expect(uploadItemPhoto).not.toHaveBeenCalled();
  });

  it('shows recognition failure in the global snackbar without changing the draft or Done', async () => {
    jest.mocked(isReceiptOcrAvailable).mockReturnValue(true);
    jest.mocked(pickItemPhotos).mockResolvedValue([
      {
        key: 'receipt-one',
        uri: 'file:///synthetic.jpg',
        width: 100,
        height: 100,
        mimeType: 'image/jpeg',
      },
    ]);
    jest.mocked(readReceipt).mockRejectedValue(new Error('recognition failed'));
    const screen = renderForm(true);
    fireEvent.press(screen.getByTestId('entry-scan-receipt'));
    const snackbar = await screen.findByTestId('snackbar-container');
    expect(
      within(snackbar).getByText(
        'Could not read this receipt. Try a clearer photo.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('entry-amount-input').props.value).toBe('4200');
    expect(screen.getByTestId('entry-save').props.accessibilityLabel).toBe(
      'Done',
    );
    expect(screen.queryByTestId('entry-pending-photo-receipt-one')).toBeNull();
    expect(
      screen.getByTestId('entry-scan-receipt').props.accessibilityState
        ?.disabled,
    ).not.toBe(true);
    expect(uploadItemPhoto).not.toHaveBeenCalled();
  });

  it.each([
    [
      false,
      'No amount or date found. Enter them manually or choose another photo.',
    ],
    [true, 'The receipt currency differs from KRW. Enter the amount manually.'],
  ] as const)(
    'shows an unusable OCR result as a snackbar (currency mismatch: %s)',
    async (currencyMismatch, message) => {
      jest.mocked(isReceiptOcrAvailable).mockReturnValue(true);
      jest.mocked(pickItemPhotos).mockResolvedValue([
        {
          key: 'receipt-empty',
          uri: 'file:///synthetic.jpg',
          width: 100,
          height: 100,
          mimeType: 'image/jpeg',
        },
      ]);
      jest.mocked(readReceipt).mockResolvedValue({
        amountMinor: null,
        dayKey: null,
        currencyMismatch,
      });
      const screen = renderForm(true);
      fireEvent.press(screen.getByTestId('entry-scan-receipt'));
      const snackbar = await screen.findByTestId('snackbar-container');
      expect(within(snackbar).getByText(message)).toBeTruthy();
      expect(screen.getByTestId('entry-amount-input').props.value).toBe('4200');
      expect(screen.getByTestId('entry-save').props.accessibilityLabel).toBe(
        'Done',
      );
      expect(screen.queryByText('Review receipt')).toBeNull();
      expect(uploadItemPhoto).not.toHaveBeenCalled();
    },
  );

  it('keeps delete out of the add form', () => {
    const screen = renderForm(false);

    expect(screen.queryByTestId('entry-delete')).toBeNull();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByLabelText('Add category')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('closes the amount keypad before opening the date panel', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const screen = renderForm(true);

    // The keypad stayed up and hid the panel's time row and Done.
    fireEvent.press(screen.getByTestId('entry-date-picker'));
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('uses consistent disclosure cues and a bounded date panel', () => {
    const screen = renderForm(true);

    expect(
      screen.getByTestId('entry-category-picker').props.accessibilityState,
    ).toEqual({expanded: false});
    expect(
      screen.getByTestId('entry-date-picker').props.accessibilityState,
    ).toEqual({expanded: false});
    expect(
      screen.getByTestId('entry-location-picker').props.accessibilityState,
    ).toEqual({expanded: false});

    fireEvent.press(screen.getByTestId('entry-date-picker'));

    expect(
      screen.getByTestId('entry-date-picker').props.accessibilityState,
    ).toEqual({expanded: true});
    expect(screen.getByTestId('entry-date-picker-panel')).toHaveStyle({
      borderRadius: 14,
      borderWidth: 1,
      overflow: 'hidden',
    });
    // The iOS compact pickers follow the app language, not the device's.
    expect(screen.getByTestId('entry-date-value').props.locale).toBe(
      getLocale(),
    );
    expect(screen.getByTestId('entry-time-value').props.locale).toBe(
      getLocale(),
    );

    // A language change while the editor stays mounted reaches the pickers.
    try {
      act(() => setActiveLocale('ko'));
      expect(screen.getByTestId('entry-date-value').props.locale).toBe('ko');
    } finally {
      act(() => setActiveLocale('en'));
    }
  });

  // The native Android dialog read the device language ("Sun, Nov 1 /
  // CANCEL / OK" over an Indonesian app) and could not change the time.
  it('edits the Android date and time in the app language', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const update = jest
      .fn()
      .mockResolvedValue({itemId: item.id, status: 'UPDATED'});
    const updateMutation = createMutationMock(update);
    const noop = createMutationMock(() => Promise.resolve());
    jest
      .mocked(useMutation)
      .mockImplementation((mutation) =>
        getFunctionName(mutation) === 'items/mutations:update'
          ? updateMutation
          : noop,
      );

    try {
      act(() => setActiveLocale('id'));
      const screen = renderForm(true);

      fireEvent.press(screen.getByTestId('entry-date-picker'));
      const panel = screen.getByTestId('entry-date-picker-panel');
      expect(within(panel).getByText('Tanggal')).toBeTruthy();
      expect(within(panel).getByText('Waktu')).toBeTruthy();
      expect(within(panel).getByText('30 Agt 2026')).toBeTruthy();
      // Indonesian writes a 24-hour time with a dot: 12.00.
      expect(screen.getByLabelText('Jam').props.value).toBe('12');
      expect(screen.getByLabelText('Menit').props.value).toBe('00');
      expect(within(panel).getByText('.')).toBeTruthy();
      expect(screen.queryByTestId('entry-time-value-pm')).toBeNull();

      fireEvent(screen.getByLabelText('Jam'), 'focus');
      fireEvent.changeText(screen.getByLabelText('Jam'), '2');
      fireEvent.changeText(screen.getByLabelText('Jam'), '21');
      fireEvent(screen.getByLabelText('Menit'), 'focus');
      fireEvent.changeText(screen.getByLabelText('Menit'), '45');

      fireEvent.press(screen.getByTestId('entry-date-value'));
      expect(await screen.findByText('Pilih tanggal')).toBeTruthy();
      // It opens on the entry's own day, not on today.
      expect(
        screen.getByTestId('calendar-day-2026-08-30').props.accessibilityState,
      ).toMatchObject({selected: true});
      expect(
        screen.getByTestId('calendar-day-2026-08-24').props.accessibilityState,
      ).toMatchObject({selected: false});
      // The calendar names its days in Indonesian too.
      expect(
        screen.getByTestId('calendar-day-2026-08-24').props.accessibilityLabel,
      ).toMatch(/^Senin, 24 Agustus 2026/);
      fireEvent.press(screen.getByTestId('calendar-day-2026-08-24'));
      await waitFor(() =>
        expect(screen.queryByText('Pilih tanggal')).toBeNull(),
      );
      expect(within(panel).getByText('24 Agt 2026')).toBeTruthy();

      fireEvent.press(screen.getByTestId('entry-save'));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      // 21:45 on August 24 in the ledger's Asia/Seoul zone.
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({occurredAt: Date.UTC(2026, 7, 24, 12, 45)}),
      );
    } finally {
      act(() => setActiveLocale('en'));
      os.restore();
    }
  });

  it('switches the Android time between AM and PM in a 12-hour language', () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');

    try {
      act(() => setActiveLocale('ko'));
      const screen = renderForm(true);

      fireEvent.press(screen.getByTestId('entry-date-picker'));
      expect(screen.getByLabelText('시').props.value).toBe('12');
      expect(
        screen.getByTestId('entry-time-value-pm').props.accessibilityState,
      ).toEqual({checked: true, disabled: false});

      fireEvent.press(screen.getByTestId('entry-time-value-am'));

      // Noon becomes midnight; the summary row writes it as 00:00.
      expect(screen.getByLabelText('시').props.value).toBe('12');
      expect(
        screen.getByTestId('entry-time-value-am').props.accessibilityState,
      ).toEqual({checked: true, disabled: false});
      expect(screen.getByTestId('entry-date-picker')).toHaveTextContent(
        /· 00:00/,
      );
    } finally {
      act(() => setActiveLocale('en'));
      os.restore();
    }
  });

  it('renders memo as a full-width multiline box without an underline', () => {
    const screen = renderForm(true);

    expect(screen.getByTestId('entry-memo-box')).toHaveStyle({
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 150,
    });
    expect(screen.getByLabelText('Memo')).toHaveStyle({
      alignSelf: 'stretch',
      minHeight: 96,
      padding: 0,
    });
  });

  it('confirms deletion inside the update form before leaving', async () => {
    const screen = renderForm(true);

    expect(screen.getByLabelText('Cafe')).toBeTruthy();
    expect(screen.getByTestId('entry-delete')).toHaveStyle({
      borderRadius: 24,
      height: 48,
      width: 48,
    });
    fireEvent.press(screen.getByTestId('entry-delete'));
    expect(softDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Are you sure you want to delete?')).toBeTruthy();

    const deleteLabels = screen.getAllByLabelText('Delete');
    fireEvent.press(deleteLabels[deleteLabels.length - 1]);

    await waitFor(() =>
      expect(softDelete).toHaveBeenCalledWith({itemId: item.id}),
    );
    expect(router.replace).toHaveBeenCalledWith(
      '/(app)/(tabs)/(root)/timeline',
    );
  });
});
