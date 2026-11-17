import type {ReactElement} from 'react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import * as Crypto from 'expo-crypto';
import {Image} from 'expo-image';
import {useFocusEffect, usePathname, useRouter} from 'expo-router';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {
  CustomPressable,
  EditText,
  Icon,
  TimePicker,
  Typography,
  useCPK,
} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {MAX_ITEM_PHOTOS} from '@shared/ledgerLimits';
import {exponentOf, localeSeparators} from '@shared/currency';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {
  dayKeyParts,
  makeDayKey,
  toDayKey,
  wallClockToEpochMs,
  zonedFields,
  type WeekDay,
} from '@shared/date';
import {entryCashFlowMinor, parseMoneyInput} from '@shared/money';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {useLocale} from '~/hooks/useLocale';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {BookooButton} from '~/components/uis/BookooButton';
import {useSession} from '~/features/auth/session';
import {PrivateImage} from '~/features/media/PrivateImage';
import {
  pickItemPhotos,
  uploadItemPhoto,
  type PendingItemPhoto,
} from '~/features/media/itemPhotoUpload';
import {isReceiptOcrAvailable, readReceipt} from '~/features/media/receiptOcr';
import {useConnectivity} from '~/features/runtime/connectivity';
import {
  LEDGER_ACCENTS,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {CATEGORY_COLORS, type CategoryColorToken} from '~/theme/chartPalette';
import {EXACT_HIT_SLOP} from '~/theme/layout';
import {formatAmount, formatDate, getLocale, t} from '~/utils/i18n';
import {dismissKeyboardForNavigation} from '~/utils/navigation';
import {categoryDisplayName} from '../categories';
import {useEntryPickerStore, type EntryPlace} from '../entryPickerStore';
import {canCreateEntry, canEditEntry} from '../permissions';
import type {ItemRow, LedgerRow} from '../types';
import {AppScreen, ScreenSkeleton, ScreenState, safeIconName} from '../ui';
import {useCalendarDatePickerDialog} from './calendar';

const EntryLocationPickerScreen = lazy(async () => {
  const picker = await import('./entryLocationPicker');
  return {default: picker.EntryLocationPickerScreen};
});

export type EntryType = 'EXPENSE' | 'INCOME';

export const ENTRY_TYPE_TAB_WIDTH = 88;
export const ENTRY_TYPE_TAB_GAP = 0;
export const ENTRY_TYPE_TAB_STEP = ENTRY_TYPE_TAB_WIDTH + ENTRY_TYPE_TAB_GAP;
const ENTRY_TYPE_INDICATOR_WIDTH = 64;
const ENTRY_TYPE_MOTION_MS = 160;
export const ENTRY_BOTTOM_ACTION_KEYBOARD_OFFSET = 84;

const entryTypeProgress = (type: EntryType): number => {
  'worklet';
  return type === 'EXPENSE' ? 0 : 1;
};

export const entryTypeProgressForDrag = (
  startProgress: number,
  translationX: number,
): number => {
  'worklet';
  const nextProgress = startProgress - translationX / ENTRY_TYPE_TAB_STEP;
  return Math.min(1, Math.max(0, nextProgress));
};

const animateEntryTypeProgress = (
  progress: SharedValue<number>,
  type: EntryType,
): void => {
  'worklet';
  progress.set(
    withTiming(entryTypeProgress(type), {
      duration: ENTRY_TYPE_MOTION_MS,
      easing: Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    }),
  );
};

export const amountMinorToInput = (
  amountMinor: number,
  currency: string,
): string => {
  if (amountMinor === 0) return '';
  const exponent = exponentOf(currency);
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, '0');
  if (exponent === 0) return digits;
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
};

export const sanitizeEntryAmountInput = (
  value: string,
  currency: string,
  locale = getLocale(),
): string => {
  const exponent = exponentOf(currency);
  const {decimal, group} = localeSeparators(locale);
  const numeric = value.normalize('NFKC').replace(/[^0-9.,]/g, '');
  const dot = numeric.lastIndexOf('.');
  const comma = numeric.lastIndexOf(',');
  let decimalAt = Math.max(dot, comma);
  if (decimalAt >= 0 && (dot < 0 || comma < 0)) {
    // Match the shared money parser's pasted grouping disambiguation. Treating
    // the first comma as decimal turned 1,000.25 USD into 1.00 USD.
    const tail = numeric.length - decimalAt - 1;
    if (tail === 3 && (numeric[decimalAt] === group || exponent === 0))
      decimalAt = -1;
  }
  const whole = (decimalAt < 0 ? numeric : numeric.slice(0, decimalAt))
    .replace(/\D/g, '')
    .slice(0, 16);
  if (decimalAt < 0 || exponent === 0) return whole;
  const fraction = numeric.slice(decimalAt + 1).slice(0, exponent);
  return whole + decimal + fraction;
};

export const parseEntryAmount = (
  value: string,
  currency: string,
  locale = getLocale(),
): number => {
  const parsed = parseMoneyInput(value, currency, locale);
  return parsed.ok ? Math.abs(parsed.minor) : 0;
};

export {dismissKeyboardForNavigation};

export const entryTypeForHorizontalSwipe = (
  translationX: number,
  velocityX: number,
): EntryType | null => {
  'worklet';
  const movement = Math.abs(velocityX) > 450 ? velocityX : translationX;
  if (Math.abs(movement) < 48) return null;
  return movement < 0 ? 'INCOME' : 'EXPENSE';
};

export function LedgerItemFormScreen({
  dayKey,
  fromInvite = false,
  item,
  ledger,
}: {
  dayKey?: number;
  fromInvite?: boolean;
  item?: ItemRow;
  ledger: LedgerRow;
}): ReactElement {
  useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const {theme, themeType, snackbar} = useCPK();
  const {fontScale, width: windowWidth} = useWindowDimensions();
  const dialog = useBookooAlertDialog();
  const {user} = useSession();
  const connectivity = useConnectivity();
  const createItem = useMutation(api.items.mutations.create);
  const updateItem = useMutation(api.items.mutations.update);
  const softDeleteItem = useMutation(api.items.mutations.softDelete);
  const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
  const claimUpload = useMutation(api.files.mutations.claimUpload);
  const attachPhoto = useMutation(api.photos.mutations.attach);
  // Creating an entry and uploading its photos are separate server operations.
  // Once create succeeds, every retry must target that entry, even if the user
  // changes the draft after a partial upload failure.
  const [createdItemId, setCreatedItemId] = useState<Id<'ledgerItems'> | null>(
    null,
  );
  const createdItem = useQuery(
    api.items.queries.getMineByRoute,
    createdItemId === null ? 'skip' : {itemId: createdItemId},
  );
  const photoItemId = item?.id ?? createdItemId;
  const photos = useQuery(
    api.photos.queries.listByItem,
    photoItemId === null ? 'skip' : {itemId: photoItemId},
  );
  const categories = useQuery(api.categories.queries.list, {
    ledgerId: ledger.id,
  });
  const categorySelection = useEntryPickerStore(
    (state) => state.categorySelection,
  );
  const clearCategorySelection = useEntryPickerStore(
    (state) => state.clearCategorySelection,
  );
  const placeSelection = useEntryPickerStore((state) => state.placeSelection);
  const clearPlaceSelection = useEntryPickerStore(
    (state) => state.clearPlaceSelection,
  );
  const [now] = useState(Date.now);
  const initialWall = useMemo(() => {
    const nowFields = zonedFields(item?.occurredAt ?? now, ledger.timeZone);
    const requested = dayKey === undefined ? null : dayKeyParts(dayKey);
    return new Date(
      requested?.year ?? nowFields.year,
      (requested?.month ?? nowFields.month) - 1,
      requested?.day ?? nowFields.day,
      nowFields.hour,
      nowFields.minute,
      0,
      0,
    );
  }, [dayKey, item?.occurredAt, ledger.timeZone, now]);
  const [type, setType] = useState<EntryType>(
    item?.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
  );
  const typeProgress = useSharedValue(entryTypeProgress(type));
  const swipeStartProgress = useSharedValue(entryTypeProgress(type));
  const [amountText, setAmountText] = useState(() =>
    amountMinorToInput(item?.amountMinor ?? 0, ledger.baseCurrency),
  );
  const [amountMinor, setAmountMinor] = useState(
    Math.abs(item?.amountMinor ?? 0),
  );
  const preserveNegative = (item?.amountMinor ?? 0) < 0;
  const [categoryKey, setCategoryKey] = useState(item?.categoryKey ?? '');
  const [wall, setWall] = useState(initialWall);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedPicker, setExpandedPicker] = useState<
    'category' | 'date' | 'location' | null
  >(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const place: EntryPlace | null = item?.place ?? null;
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [receiptReading, setReceiptReading] = useState(false);
  const receiptReadingRef = useRef(false);
  const receiptRequestRef = useRef(0);
  const [pendingItemPhotos, setPendingItemPhotos] = useState<
    readonly PendingItemPhoto[]
  >([]);
  const saveRequestRef = useRef<{
    readonly fingerprint: string;
    readonly id: string;
  } | null>(null);
  const accent =
    LEDGER_ACCENTS[ledger.colorKey as LedgerColorKey][
      themeType === 'dark' ? 'dark' : 'light'
    ];
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const accentSurface = ledgerAccentSurface(accent, mode);
  const pickedCategoryKey =
    categorySelection?.ledgerId === ledger.id
      ? categorySelection.categoryKey
      : categoryKey;
  const pickedPlace =
    placeSelection?.ledgerId === ledger.id ? placeSelection.place : place;
  const availableCategories = useMemo(
    () =>
      (categories ?? []).filter(
        (category) =>
          category.kind === type && !category.hidden && !category.archived,
      ),
    [categories, type],
  );
  const selectedCategory = availableCategories.find(
    (category) => category.key === pickedCategoryKey,
  );
  const selectedCategoryKey = selectedCategory?.key ?? '';
  const categoryColor =
    selectedCategory !== undefined &&
    selectedCategory.colorToken in CATEGORY_COLORS
      ? CATEGORY_COLORS[selectedCategory.colorToken as CategoryColorToken][mode]
      : accent.text;
  const canWrite =
    item === undefined
      ? canCreateEntry(ledger)
      : canEditEntry(ledger, item, user?.userId);
  const receiptCanWriteRef = useRef(canWrite);
  useEffect(() => {
    receiptCanWriteRef.current = canWrite;
  }, [canWrite]);
  const leaveForm = useCallback(
    (fallback?: '/(app)/(tabs)/(root)/timeline'): void => {
      // A prior invite can still be on the back stack after signup.
      if (fromInvite) router.dismissTo('/(app)/(tabs)/(root)');
      else if (router.canGoBack()) router.back();
      else router.replace(fallback ?? '/(app)/(tabs)/(root)');
    },
    [fromInvite, router],
  );

  useFocusEffect(
    useCallback(() => {
      setExpandedPicker(null);
      if (receiptReadingRef.current) {
        receiptReadingRef.current = false;
        setPhotoUploading(false);
        setReceiptReading(false);
      }
      return () => {
        receiptRequestRef.current += 1;
      };
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      if (!fromInvite || locationPickerVisible || Platform.OS !== 'android')
        return;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!saving) leaveForm();
        return true;
      });
      return () => back.remove();
    }, [fromInvite, leaveForm, locationPickerVisible, saving]),
  );

  useEffect(
    () => () => {
      clearCategorySelection();
      clearPlaceSelection();
    },
    [clearCategorySelection, clearPlaceSelection],
  );

  const changeType = useCallback(
    (nextType: EntryType) => {
      if (nextType === type) return;
      setType(nextType);
      setCategoryKey('');
      clearCategorySelection();
    },
    [clearCategorySelection, type],
  );

  useEffect(() => {
    animateEntryTypeProgress(typeProgress, type);
  }, [type, typeProgress]);

  const swipeGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-16, 16])
      .failOffsetY([-16, 16])
      .onBegin(() => swipeStartProgress.set(typeProgress.get()))
      .onUpdate(({translationX}) => {
        typeProgress.set(
          entryTypeProgressForDrag(swipeStartProgress.get(), translationX),
        );
      })
      .onEnd(({translationX, velocityX}) => {
        const nextType =
          entryTypeForHorizontalSwipe(translationX, velocityX) ?? type;
        animateEntryTypeProgress(typeProgress, nextType);
        if (nextType !== type) scheduleOnRN(changeType, nextType);
      });
  }, [changeType, swipeStartProgress, type, typeProgress]);
  const onAmountChange = useCallback(
    (value: string) => {
      const normalized = sanitizeEntryAmountInput(value, ledger.baseCurrency);
      setAmountText(normalized);
      setAmountMinor(parseEntryAmount(normalized, ledger.baseCurrency));
    },
    [ledger.baseCurrency],
  );
  const uploadPendingItemPhotos = useCallback(
    async (
      itemId: Parameters<typeof uploadItemPhoto>[0]['itemId'],
      selected: readonly PendingItemPhoto[],
    ): Promise<void> => {
      for (const photo of selected) {
        await uploadItemPhoto({
          attach: attachPhoto,
          claim: claimUpload,
          generateUrl: generateUploadUrl,
          itemId,
          photo,
        });
        setPendingItemPhotos((current) =>
          current.filter((candidate) => candidate.key !== photo.key),
        );
      }
    },
    [attachPhoto, claimUpload, generateUploadUrl],
  );
  const addItemPhotos = useCallback(async (): Promise<void> => {
    if (
      photoUploading ||
      saving ||
      !canWrite ||
      (photoItemId !== null && photos === undefined)
    )
      return;
    const currentCount = (photos?.length ?? 0) + pendingItemPhotos.length;
    const remaining = MAX_ITEM_PHOTOS - currentCount;
    if (remaining < 1) return;
    if (photoItemId !== null && !connectivity.connected) {
      setError(t('error.network'));
      return;
    }
    setPhotoUploading(true);
    setError(null);
    try {
      const selected = await pickItemPhotos(remaining);
      if (photoItemId === null) {
        setPendingItemPhotos((current) =>
          [...current, ...selected].slice(0, MAX_ITEM_PHOTOS),
        );
      } else {
        await uploadPendingItemPhotos(photoItemId, selected);
      }
    } catch {
      setError(
        connectivity.connected ? t('error.upload.invalid') : t('error.network'),
      );
    } finally {
      setPhotoUploading(false);
    }
  }, [
    canWrite,
    connectivity.connected,
    photoItemId,
    pendingItemPhotos.length,
    photoUploading,
    photos,
    saving,
    uploadPendingItemPhotos,
  ]);
  const photoCount = (photos?.length ?? 0) + pendingItemPhotos.length;

  const scanReceipt = async (): Promise<void> => {
    if (
      photoUploading ||
      saving ||
      !canWrite ||
      photoCount >= MAX_ITEM_PHOTOS ||
      (photoItemId !== null && photos === undefined)
    )
      return;
    const request = ++receiptRequestRef.current;
    Keyboard.dismiss();
    setPhotoUploading(true);
    setReceiptReading(true);
    receiptReadingRef.current = true;
    setError(null);
    try {
      const selected = (await pickItemPhotos(1))[0];
      if (selected === undefined || receiptRequestRef.current !== request)
        return;
      const suggestion = await readReceipt(
        selected,
        ledger.baseCurrency,
        getLocale(),
      );
      if (receiptRequestRef.current !== request) return;
      if (suggestion.amountMinor === null && suggestion.dayKey === null) {
        snackbar.open({
          color: 'danger',
          text: suggestion.currencyMismatch
            ? t('receipt.currencyMismatch', {currency: ledger.baseCurrency})
            : t('receipt.notFound'),
          timer: 3500,
        });
        return;
      }
      const date =
        suggestion.dayKey === null ? null : dayKeyParts(suggestion.dayKey);
      const previewDate =
        date === null
          ? null
          : new Date(date.year, date.month - 1, date.day, 12);
      const body = [
        suggestion.amountMinor === null
          ? null
          : `${formatAmount({amountMinor: suggestion.amountMinor, currency: ledger.baseCurrency})} ${ledger.baseCurrency}`,
        previewDate === null ? null : formatDate(previewDate, 'PP'),
        suggestion.currencyMismatch
          ? t('receipt.currencyMismatch', {currency: ledger.baseCurrency})
          : null,
        t('receipt.reviewBody'),
      ]
        .filter((line) => line !== null)
        .join('\n\n');
      dialog.confirm({
        title: t('receipt.reviewTitle'),
        body,
        icon: 'Receipt',
        confirmText: t('receipt.apply'),
        onConfirm: () => {
          if (
            receiptRequestRef.current !== request ||
            !receiptCanWriteRef.current
          )
            return;
          if (suggestion.amountMinor !== null)
            onAmountChange(
              amountMinorToInput(suggestion.amountMinor, ledger.baseCurrency),
            );
          if (date !== null)
            setWall(
              (current) =>
                new Date(
                  date.year,
                  date.month - 1,
                  date.day,
                  current.getHours(),
                  current.getMinutes(),
                ),
            );
          setPendingItemPhotos((current) =>
            [...current, selected].slice(0, MAX_ITEM_PHOTOS),
          );
        },
      });
    } catch {
      if (receiptRequestRef.current === request)
        snackbar.open({
          color: 'danger',
          text: t('receipt.failed'),
          timer: 3500,
        });
    } finally {
      if (receiptRequestRef.current === request) {
        setPhotoUploading(false);
        setReceiptReading(false);
        receiptReadingRef.current = false;
      }
    }
  };

  const changeWallDate = useCallback((value: Date) => {
    setWall(
      (current) =>
        new Date(
          value.getFullYear(),
          value.getMonth(),
          value.getDate(),
          current.getHours(),
          current.getMinutes(),
          0,
          0,
        ),
    );
  }, []);
  const changeWallTime = useCallback((value: Date) => {
    setWall(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate(),
          value.getHours(),
          value.getMinutes(),
          0,
          0,
        ),
    );
  }, []);
  const openCalendarDatePicker = useCalendarDatePickerDialog();
  const openEntryDateDialog = (): void => {
    Keyboard.dismiss();
    openCalendarDatePicker({
      accentSurface,
      initialDayKey: makeDayKey(
        wall.getFullYear(),
        wall.getMonth() + 1,
        wall.getDate(),
      ),
      onSelect: (dayKey) => {
        const {year, month, day} = dayKeyParts(dayKey);
        changeWallDate(new Date(year, month - 1, day));
      },
      today: toDayKey(Date.now(), ledger.timeZone),
      weekStartsOn: ledger.weekStartsOn as WeekDay,
    });
  };
  const deleteEntry = async (): Promise<void> => {
    if (item === undefined || deleting || saving || !canWrite) return;
    if (!connectivity.connected) {
      setError(t('error.network'));
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      Keyboard.dismiss();
      await softDeleteItem({itemId: item.id});
      router.replace('/(app)/(tabs)/(root)/timeline');
    } catch {
      setError(
        connectivity.connected ? t('error.generic') : t('error.network'),
      );
      setDeleting(false);
    }
  };
  const confirmDelete = (): void => {
    if (item === undefined || deleting || saving || !canWrite) return;
    dialog.confirm({
      body: t('common.deleteConfirm'),
      confirmText: t('common.delete'),
      icon: 'Trash',
      onConfirm: () => void deleteEntry(),
      title: t('common.delete'),
      tone: 'danger',
    });
  };
  const save = async (): Promise<void> => {
    if (
      saving ||
      deleting ||
      photoUploading ||
      amountMinor === 0 ||
      selectedCategoryKey.length === 0 ||
      !canWrite
    )
      return;
    if (!connectivity.connected) {
      setError(t('error.network'));
      return;
    }
    setSaving(true);
    setError(null);
    const keyboardDismissal = dismissKeyboardForNavigation();
    let leavingScreen = false;
    try {
      const targetItem = item ?? (createdItemId === null ? null : createdItem);
      if (createdItemId !== null && targetItem == null) {
        setError(t('error.generic'));
        return;
      }
      const occurredAt = wallClockToEpochMs(
        wall.getFullYear(),
        wall.getMonth() + 1,
        wall.getDate(),
        ledger.timeZone,
        wall.getHours(),
        wall.getMinutes(),
      );
      const signedAmount = preserveNegative ? -amountMinor : amountMinor;
      if (targetItem == null) {
        const request = {
          ledgerId: ledger.id,
          type,
          amountMinor: signedAmount,
          currency: ledger.baseCurrency,
          occurredAt,
          categoryKey: selectedCategoryKey,
          memo,
          ...(pickedPlace === null ? {} : {place: pickedPlace}),
        };
        const fingerprint = `create:${JSON.stringify(request)}`;
        const clientRequestId =
          saveRequestRef.current?.fingerprint === fingerprint
            ? saveRequestRef.current.id
            : Crypto.randomUUID();
        saveRequestRef.current = {fingerprint, id: clientRequestId};
        const args = {...request, clientRequestId};
        const outcome = await createItem(args);
        setCreatedItemId(outcome.itemId);
        saveRequestRef.current = null;
        await uploadPendingItemPhotos(outcome.itemId, pendingItemPhotos);
        await keyboardDismissal;
        leavingScreen = true;
        leaveForm();
      } else {
        const request = {
          itemId: targetItem.id,
          expectedUpdatedAt: targetItem.updatedAt,
          type,
          amountMinor: signedAmount,
          currency: ledger.baseCurrency,
          occurredAt,
          categoryKey: selectedCategoryKey,
          memo,
          place: pickedPlace,
        };
        const fingerprint = `update:${JSON.stringify(request)}`;
        const clientRequestId =
          saveRequestRef.current?.fingerprint === fingerprint
            ? saveRequestRef.current.id
            : Crypto.randomUUID();
        saveRequestRef.current = {fingerprint, id: clientRequestId};
        const args = {...request, clientRequestId};
        const outcome = await updateItem(args);
        saveRequestRef.current = null;
        if (outcome.status === 'CONFLICT') {
          setError(t('screen.conflict'));
          return;
        }
        await uploadPendingItemPhotos(outcome.itemId, pendingItemPhotos);
        await keyboardDismissal;
        leavingScreen = true;
        leaveForm();
      }
    } catch {
      setError(
        connectivity.connected ? t('error.generic') : t('error.network'),
      );
    } finally {
      if (!leavingScreen) setSaving(false);
    }
  };

  if (categories === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  const saveDisabled =
    deleting ||
    photoUploading ||
    amountMinor === 0 ||
    selectedCategoryKey.length === 0 ||
    !canWrite;
  const saveBackground = saveDisabled
    ? theme.button.disabled.bg
    : theme.button.primary.bg;

  if (locationPickerVisible)
    return (
      <Suspense
        fallback={
          <AppScreen>
            <ScreenSkeleton rows={6} />
          </AppScreen>
        }
      >
        <EntryLocationPickerScreen
          address={pickedPlace?.address ?? ''}
          label={pickedPlace?.label ?? ''}
          lat={pickedPlace === null ? '' : String(pickedPlace.lat)}
          ledgerId={ledger.id}
          lng={pickedPlace === null ? '' : String(pickedPlace.lng)}
          onClose={() => {
            setLocationPickerVisible(false);
            setExpandedPicker(null);
          }}
        />
      </Suspense>
    );

  return (
    <AppScreen
      backgroundColor={theme.bg.basic}
      bottomInsetColor={saveBackground}
    >
      <View style={styles.flex}>
        <View
          style={[
            styles.routeHeader,
            {
              backgroundColor: theme.bg.basic,
              borderBottomColor: theme.role.divider,
            },
          ]}
          testID="entry-route-header"
        >
          <CustomPressable
            accessibilityLabel={t('a11y.back')}
            accessibilityRole="button"
            hitSlop={EXACT_HIT_SLOP}
            onPress={() => {
              Keyboard.dismiss();
              leaveForm('/(app)/(tabs)/(root)/timeline');
            }}
            style={styles.headerAction}
            testID="entry-route-back"
          >
            <Icon color={theme.text.basic} name="CaretLeft" size={24} />
          </CustomPressable>
          {item === undefined || !canWrite ? (
            <View style={styles.headerAction} />
          ) : (
            <CustomPressable
              accessibilityLabel={t('common.delete')}
              accessibilityRole="button"
              disabled={deleting || saving}
              hitSlop={EXACT_HIT_SLOP}
              onPress={confirmDelete}
              style={[
                styles.headerAction,
                {backgroundColor: theme.role.underlay},
                (deleting || saving) && styles.headerActionDisabled,
              ]}
              testID="entry-delete"
            >
              {deleting ? (
                <ActivityIndicator color={theme.text.expense} size="small" />
              ) : (
                <Icon color={theme.text.expense} name="Trash" size={21} />
              )}
            </CustomPressable>
          )}
        </View>
        <KeyboardAwareScrollView
          bottomOffset={ENTRY_BOTTOM_ACTION_KEYBOARD_OFFSET}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
        >
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.form}>
              {ledger.maintenanceLock === 'NONE' ? null : (
                <ScreenState
                  body={t('error.ledger.maintenance')}
                  compact
                  icon="Warning"
                  title={t('common.warning')}
                />
              )}
              {canWrite || ledger.maintenanceLock !== 'NONE' ? null : (
                <ScreenState
                  body={t('error.ledger.forbidden')}
                  compact
                  icon="Eye"
                  title={t('common.warning')}
                />
              )}
              <View style={styles.amountSection}>
                <View style={styles.entryTypeRow}>
                  <EntryTypeTabs
                    accentColor={accent.text}
                    onChange={changeType}
                    progress={typeProgress}
                    value={type}
                  />
                  {isReceiptOcrAvailable() && canWrite ? (
                    <BookooButton
                      accessibilityLabel={t('receipt.scan')}
                      accent={accent}
                      borderRadius={12}
                      disabled={
                        photoUploading ||
                        saving ||
                        photoCount >= MAX_ITEM_PHOTOS
                      }
                      hitSlop={{bottom: 5, left: 0, right: 0, top: 5}}
                      loading={receiptReading}
                      onPress={() => void scanReceipt()}
                      size="small"
                      style={styles.receiptScanAction}
                      styles={{
                        container: styles.receiptScanContainer,
                        content: styles.receiptScanContent,
                      }}
                      testID="entry-scan-receipt"
                      text={
                        <Typography.Body3
                          $fontWeight="bold"
                          numberOfLines={1}
                          style={{
                            color:
                              photoUploading ||
                              saving ||
                              photoCount >= MAX_ITEM_PHOTOS
                                ? theme.button.disabled.text
                                : accent.text,
                            flexShrink: 1,
                          }}
                        >
                          {windowWidth < 348 || fontScale > 1.3
                            ? t('receipt.scanShort')
                            : t('receipt.scan')}
                        </Typography.Body3>
                      }
                      type="outlined"
                    />
                  ) : null}
                </View>
                <EntryAmountField
                  accentColor={accent.text}
                  amountMinor={preserveNegative ? -amountMinor : amountMinor}
                  onChangeText={onAmountChange}
                  type={type}
                  value={amountText}
                />
              </View>
              <View style={styles.informationRows}>
                <CustomPressable
                  accessibilityLabel={
                    selectedCategory === undefined
                      ? t('category.add')
                      : categoryDisplayName(selectedCategory)
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: expandedPicker === 'category',
                  }}
                  hitSlop={EXACT_HIT_SLOP}
                  onPress={() => {
                    setExpandedPicker('category');
                    const params = {
                      kind: type,
                      ledgerId: ledger.id,
                      selectedKey: selectedCategoryKey,
                    };
                    if (pathname.startsWith('/ledger/')) {
                      router.navigate({
                        pathname: '/ledger/[ledgerId]/item/category',
                        params,
                      });
                      return;
                    }
                    router.navigate({pathname: '/entry/category', params});
                  }}
                  style={[
                    styles.informationRow,
                    {
                      backgroundColor: theme.bg.paper,
                      borderColor: theme.role.border,
                    },
                  ]}
                  testID="entry-category-picker"
                >
                  <Icon
                    color={
                      selectedCategory === undefined
                        ? theme.text.placeholder
                        : categoryColor
                    }
                    name={
                      selectedCategory === undefined
                        ? 'Star'
                        : safeIconName(selectedCategory.iconKey)
                    }
                    size={21}
                  />
                  <Typography.Body3
                    $fontWeight={
                      selectedCategory === undefined ? 'normal' : 'bold'
                    }
                    numberOfLines={1}
                    style={[
                      styles.informationValue,
                      {
                        color:
                          selectedCategory === undefined
                            ? theme.text.placeholder
                            : theme.text.basic,
                      },
                    ]}
                  >
                    {selectedCategory === undefined
                      ? t('common.category')
                      : categoryDisplayName(selectedCategory)}
                  </Typography.Body3>
                  <Icon
                    color={theme.text.placeholder}
                    name={
                      expandedPicker === 'category' ? 'CaretUp' : 'CaretDown'
                    }
                    size={18}
                  />
                </CustomPressable>
                <CustomPressable
                  accessibilityLabel={t('common.date')}
                  accessibilityRole="button"
                  accessibilityState={{expanded: showDatePicker}}
                  hitSlop={EXACT_HIT_SLOP}
                  onPress={() => {
                    // The amount keypad stayed up over the panel's time row
                    // and its Done; the inline panel needs the room.
                    Keyboard.dismiss();
                    setShowDatePicker((visible) => {
                      const next = !visible;
                      setExpandedPicker(next ? 'date' : null);
                      return next;
                    });
                  }}
                  style={[
                    styles.informationRow,
                    {
                      backgroundColor: theme.bg.paper,
                      borderColor: theme.role.border,
                    },
                  ]}
                  testID="entry-date-picker"
                >
                  <Icon color={accent.text} name="Calendar" size={20} />
                  <Typography.Body3
                    numberOfLines={1}
                    style={[styles.informationValue, {color: theme.text.label}]}
                  >
                    {formatDate(wall, 'PPP · p')}
                  </Typography.Body3>
                  <Icon
                    color={theme.text.placeholder}
                    name={showDatePicker ? 'CaretUp' : 'CaretDown'}
                    size={18}
                  />
                </CustomPressable>
                {showDatePicker ? (
                  <View
                    style={[
                      styles.datePickerPanel,
                      {
                        backgroundColor: theme.bg.paper,
                        borderColor: theme.role.border,
                      },
                    ]}
                    testID="entry-date-picker-panel"
                  >
                    <View style={styles.datePickerControl}>
                      <Typography.Body4 style={{color: theme.text.label}}>
                        {t('common.date')}
                      </Typography.Body4>
                      {Platform.OS === 'ios' ? (
                        <DateTimePicker
                          display="compact"
                          locale={getLocale()}
                          mode="date"
                          onValueChange={(_event, value) =>
                            changeWallDate(value)
                          }
                          testID="entry-date-value"
                          value={wall}
                        />
                      ) : (
                        // The native Android dialog reads the device language,
                        // so the date comes from the app's own calendar dialog.
                        <CustomPressable
                          accessibilityLabel={t('common.date')}
                          accessibilityRole="button"
                          accessibilityValue={{text: formatDate(wall, 'PP')}}
                          onPress={openEntryDateDialog}
                          style={[
                            styles.dateValue,
                            {
                              backgroundColor: theme.bg.basic,
                              borderColor: theme.role.border,
                            },
                          ]}
                          testID="entry-date-value"
                        >
                          <Typography.Body3
                            $fontWeight="bold"
                            style={{color: accent.text}}
                          >
                            {formatDate(wall, 'PP')}
                          </Typography.Body3>
                        </CustomPressable>
                      )}
                    </View>
                    <View
                      style={[
                        styles.datePickerDivider,
                        {backgroundColor: theme.role.divider},
                      ]}
                    />
                    <View style={styles.datePickerControl}>
                      <Typography.Body4 style={{color: theme.text.label}}>
                        {t('common.time')}
                      </Typography.Body4>
                      {Platform.OS === 'ios' ? (
                        <DateTimePicker
                          display="compact"
                          locale={getLocale()}
                          mode="time"
                          onValueChange={(_event, value) =>
                            changeWallTime(value)
                          }
                          testID="entry-time-value"
                          value={wall}
                        />
                      ) : (
                        <TimePicker
                          colors={{
                            fieldBackground: theme.bg.basic,
                            focusedFieldBorder: accent.base,
                            selectedBackground: accentSurface.background,
                            selectedText: accentSurface.foreground,
                          }}
                          labels={{
                            hour: t('common.hour'),
                            minute: t('common.minute'),
                            dayPeriod: t('common.dayPeriod'),
                          }}
                          locale={getLocale()}
                          maxFontSizeMultiplier={1.3}
                          onChange={changeWallTime}
                          testID="entry-time-value"
                          value={wall}
                        />
                      )}
                    </View>
                    <CustomPressable
                      accessibilityRole="button"
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowDatePicker(false);
                        setExpandedPicker(null);
                      }}
                      style={[
                        styles.dateDone,
                        {backgroundColor: theme.role.underlay},
                      ]}
                      testID="entry-date-done"
                    >
                      <Typography.Body4
                        $fontWeight="bold"
                        style={{color: accent.text}}
                      >
                        {t('common.done')}
                      </Typography.Body4>
                    </CustomPressable>
                  </View>
                ) : null}
                <CustomPressable
                  accessibilityLabel={t('common.location')}
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: expandedPicker === 'location',
                  }}
                  hitSlop={EXACT_HIT_SLOP}
                  onPress={() => {
                    setExpandedPicker('location');
                    setLocationPickerVisible(true);
                  }}
                  style={[
                    styles.informationRow,
                    {
                      backgroundColor: theme.bg.paper,
                      borderColor: theme.role.border,
                    },
                  ]}
                  testID="entry-location-picker"
                >
                  <Icon color={accent.text} name="MapPin" size={20} />
                  <Typography.Body3
                    numberOfLines={1}
                    style={[
                      styles.informationValue,
                      {
                        color:
                          pickedPlace === null
                            ? theme.text.placeholder
                            : theme.text.label,
                      },
                    ]}
                  >
                    {pickedPlace?.label ?? t('common.location')}
                  </Typography.Body3>
                  <Icon
                    color={theme.text.placeholder}
                    name={
                      expandedPicker === 'location' ? 'CaretUp' : 'CaretDown'
                    }
                    size={18}
                  />
                </CustomPressable>
                <View
                  style={[
                    styles.memoSection,
                    {
                      backgroundColor: theme.bg.paper,
                      borderColor: theme.role.border,
                    },
                  ]}
                  testID="entry-memo-box"
                >
                  <View style={styles.memoLabelRow}>
                    <Icon color={accent.text} name="Note" size={20} />
                    <Typography.Body4
                      $fontWeight="bold"
                      style={{color: theme.text.label}}
                    >
                      {t('common.memo')}
                    </Typography.Body4>
                  </View>
                  <TextInput
                    accessibilityLabel={t('common.memo')}
                    maxLength={500}
                    multiline
                    onChangeText={setMemo}
                    style={[styles.memoInput, {color: theme.text.basic}]}
                    textAlignVertical="top"
                    value={memo}
                  />
                </View>
              </View>
              <Typography.Body4
                $fontWeight="bold"
                style={{color: theme.text.label}}
              >
                {t('release.photos')} ({photoCount}/{MAX_ITEM_PHOTOS})
              </Typography.Body4>
              <View style={styles.photoGrid}>
                {(photos ?? []).map((photo, index) => (
                  <CustomPressable
                    accessibilityLabel={t('release.receiptPhoto')}
                    accessibilityRole="button"
                    key={photo.id}
                    onPress={() =>
                      item === undefined
                        ? undefined
                        : router.navigate({
                            pathname: '/photo/[itemId]',
                            params: {itemId: item.id, index, edit: '1'},
                          })
                    }
                    style={styles.photoTile}
                  >
                    <PrivateImage
                      accessibilityLabel={t('release.receiptPhoto')}
                      photoId={photo.id}
                      style={styles.photoFill}
                    />
                  </CustomPressable>
                ))}
                {pendingItemPhotos.map((photo) => (
                  <CustomPressable
                    accessibilityLabel={[
                      t('common.delete'),
                      t('release.receiptPhoto'),
                    ].join(' ')}
                    accessibilityRole="button"
                    key={photo.key}
                    onPress={() =>
                      setPendingItemPhotos((current) =>
                        current.filter(
                          (candidate) => candidate.key !== photo.key,
                        ),
                      )
                    }
                    style={styles.photoTile}
                    testID={'entry-pending-photo-' + photo.key}
                  >
                    <Image
                      contentFit="cover"
                      source={{uri: photo.uri}}
                      style={styles.photoFill}
                    />
                    <View style={styles.pendingPhotoRemove}>
                      <Icon color="#FFFFFF" name="X" size={13} />
                    </View>
                  </CustomPressable>
                ))}
                {photoCount >= MAX_ITEM_PHOTOS ? null : (
                  <CustomPressable
                    accessibilityLabel={t('release.addPhoto')}
                    accessibilityRole="button"
                    disabled={
                      photoUploading ||
                      saving ||
                      !canWrite ||
                      (photoItemId !== null && photos === undefined)
                    }
                    hitSlop={EXACT_HIT_SLOP}
                    onPress={() => void addItemPhotos()}
                    style={[
                      styles.photoTile,
                      styles.photoPlaceholder,
                      {
                        backgroundColor: theme.bg.paper,
                        borderColor: theme.role.border,
                      },
                    ]}
                    testID="entry-add-photo"
                  >
                    {photoUploading ? (
                      <ActivityIndicator color={accent.text} size="small" />
                    ) : (
                      <Icon color={accent.text} name="Plus" size={24} />
                    )}
                  </CustomPressable>
                )}
              </View>
              {error === null ? null : (
                <Typography.Body3
                  accessibilityLiveRegion="polite"
                  style={{color: theme.text.validation}}
                >
                  {error}
                </Typography.Body3>
              )}
            </View>
          </GestureDetector>
        </KeyboardAwareScrollView>
        <KeyboardStickyView>
          <BookooBottomAction
            disabled={saveDisabled}
            loading={saving}
            loadingColor={theme.text.placeholder}
            onPress={() => void save()}
            testID="entry-save"
            text={error === null ? t('common.done') : t('common.tryAgain')}
          />
        </KeyboardStickyView>
      </View>
    </AppScreen>
  );
}

export function EntryAmountField({
  accentColor,
  amountMinor,
  onChangeText,
  type,
  value,
}: {
  readonly accentColor: string;
  readonly amountMinor: number;
  readonly onChangeText: (value: string) => void;
  readonly type: EntryType;
  readonly value: string;
}): ReactElement {
  const {theme} = useCPK();
  const activeColor = type === 'INCOME' ? accentColor : BOOKOO_PALETTE.main;
  const textColor = value.length === 0 ? theme.text.placeholder : activeColor;

  return (
    <EditText
      accessibilityLabel={t('common.amount')}
      colors={{
        basic: 'transparent',
        focused: 'transparent',
        placeholder: theme.text.placeholder,
      }}
      decoration="underline"
      hideCounter
      maxLength={24}
      onChangeText={onChangeText}
      placeholder="0"
      placeholderColor={theme.text.placeholder}
      startElement={
        entryCashFlowMinor(type, amountMinor) < 0 ? (
          <Typography.Heading3 $fontWeight="bold" style={{color: activeColor}}>
            −
          </Typography.Heading3>
        ) : undefined
      }
      styles={{
        container: styles.amountContainer,
        input: [styles.amountInput, {color: textColor}],
        inputContainer: styles.amountInputContainer,
      }}
      testID="entry-amount-input"
      textInputProps={{
        inputMode: 'decimal',
        keyboardType: 'decimal-pad',
        returnKeyType: 'done',
      }}
      value={value}
    />
  );
}

export function EntryTypeTabs({
  accentColor,
  onChange,
  progress: progressProp,
  value,
}: {
  readonly accentColor: string;
  readonly onChange: (value: EntryType) => void;
  readonly progress?: SharedValue<number>;
  readonly value: EntryType;
}): ReactElement {
  const {theme} = useCPK();
  const internalProgress = useSharedValue(entryTypeProgress(value));
  const progress = progressProp ?? internalProgress;
  const tabs: readonly {label: string; value: EntryType}[] = [
    {label: t('ledgerItem.expense'), value: 'EXPENSE'},
    {label: t('ledgerItem.income'), value: 'INCOME'},
  ];

  useEffect(() => {
    animateEntryTypeProgress(progress, value);
  }, [progress, value]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{translateX: progress.get() * ENTRY_TYPE_TAB_STEP}],
  }));

  return (
    <View
      accessibilityRole="tablist"
      style={styles.entryTypeTabs}
      testID="entry-type-tabs"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.entryTypeIndicator,
          {backgroundColor: accentColor},
          indicatorStyle,
        ]}
        testID="entry-type-indicator"
      />
      {tabs.map((tab) => {
        const selected = value === tab.value;
        return (
          <CustomPressable
            accessibilityRole="tab"
            accessibilityState={{selected}}
            hitSlop={EXACT_HIT_SLOP}
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={styles.entryTypeTab}
            testID={`entry-type-${tab.value}`}
          >
            <Typography.Body2
              $fontWeight={selected ? 'bold' : 'normal'}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              numberOfLines={1}
              style={{color: selected ? theme.text.basic : theme.text.disabled}}
            >
              {tab.label}
            </Typography.Body2>
          </CustomPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  amountContainer: {borderBottomWidth: 0, minHeight: 74},
  amountSection: {gap: 8},
  amountInput: {
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 36,
    minHeight: 60,
    paddingBottom: 0,
    paddingTop: 0,
  },
  amountInputContainer: {borderBottomWidth: 0},
  dateDone: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderCurve: 'continuous',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
  },
  datePickerControl: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 48,
  },
  datePickerDivider: {height: StyleSheet.hairlineWidth},
  dateValue: {
    borderCurve: 'continuous',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  datePickerPanel: {
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 12,
  },
  entryTypeIndicator: {
    borderRadius: 2,
    bottom: 0,
    height: 3,
    left: (ENTRY_TYPE_TAB_WIDTH - ENTRY_TYPE_INDICATOR_WIDTH) / 2,
    position: 'absolute',
    width: ENTRY_TYPE_INDICATOR_WIDTH,
  },
  entryTypeTab: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    overflow: 'hidden',
    paddingHorizontal: 8,
    width: ENTRY_TYPE_TAB_WIDTH,
  },
  entryTypeTabs: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: ENTRY_TYPE_TAB_GAP,
    position: 'relative',
  },
  entryTypeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  receiptScanAction: {
    flexShrink: 1,
    marginLeft: 'auto',
    maxWidth: 160,
  },
  receiptScanContainer: {
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  receiptScanContent: {justifyContent: 'center', minWidth: 0},
  flex: {flex: 1},
  form: {
    alignSelf: 'center',
    gap: 20,
    maxWidth: 680,
    paddingBottom: 32,
    paddingHorizontal: 24,
    width: '100%',
  },
  headerAction: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  headerActionDisabled: {opacity: 0.45},
  informationRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 16,
  },
  informationRows: {gap: 10},
  informationValue: {flex: 1, minWidth: 0},
  memoInput: {
    alignSelf: 'stretch',
    fontSize: 16,
    lineHeight: 23,
    minHeight: 96,
    padding: 0,
  },
  memoLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  memoSection: {
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    minHeight: 150,
    padding: 16,
  },
  photoGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  pendingPhotoRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,28,45,0.82)',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
  },
  photoPlaceholder: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
  },
  photoTile: {
    borderCurve: 'continuous',
    borderRadius: 10,
    height: 72,
    overflow: 'hidden',
    width: 72,
  },
  photoFill: {height: '100%', width: '100%'},
  routeHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 8,
  },
  scroll: {flex: 1},
  scrollContent: {paddingTop: 8},
});
