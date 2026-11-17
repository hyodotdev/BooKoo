import type {ReactElement} from 'react';
import {useCallback, useMemo, useState} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {FlashList} from '@shopify/flash-list';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Stack, usePathname, useRouter} from 'expo-router';
import {CustomPressable, Icon, Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {
  CATEGORY_COLOR_TOKENS,
  isValidCategoryName,
  CUSTOM_ICON_POOL,
  type CategoryColorToken,
} from '@shared/categories';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {CATEGORY_COLORS} from '~/theme/chartPalette';
import {EXACT_HIT_SLOP} from '~/theme/layout';
import {ledgerAccentSurface} from '~/theme/ledgerAccent';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {t} from '~/utils/i18n';
import {categoryDisplayName} from '../categories';
import {CategoryFormFields, type CategoryDraft} from '../CategoryFormFields';
import {useEntryPickerStore} from '../entryPickerStore';
import type {CategoryRow} from '../types';
import {AppScreen, ScreenSkeleton, ScreenState, safeIconName} from '../ui';

type EntryType = 'EXPENSE' | 'INCOME';
export type CategoryPickerRow =
  | {readonly kind: 'ADD'}
  | {readonly category: CategoryRow; readonly kind: 'CATEGORY'};

export const categoryPickerRows = (
  categories: readonly CategoryRow[],
): readonly CategoryPickerRow[] => [
  {kind: 'ADD'},
  ...categories.map((category) => ({category, kind: 'CATEGORY' as const})),
];

export const categoryPickerColumnsForWidth = (width: number): number => {
  if (width >= 900) return 6;
  if (width >= 600) return 5;
  if (width < 360) return 3;
  return 4;
};

function PickerHeader({
  onClose,
  testID,
  title,
}: {
  onClose: () => void;
  testID: string;
  title: string;
}) {
  const {theme} = useCPK();
  return (
    <View style={[styles.header, {borderBottomColor: theme.role.divider}]}>
      <Typography.Heading3
        $fontWeight="bold"
        numberOfLines={1}
        style={[styles.headerTitle, {color: theme.text.basic}]}
      >
        {title}
      </Typography.Heading3>
      <CustomPressable
        accessibilityLabel={t('common.cancel')}
        accessibilityRole="button"
        hitSlop={EXACT_HIT_SLOP}
        onPress={onClose}
        style={styles.headerAction}
        testID={testID}
      >
        <Icon color={theme.text.basic} name="X" size={22} />
      </CustomPressable>
    </View>
  );
}

export function EntryCategoryPickerScreen({
  kind,
  ledgerId,
  selectedKey,
}: {
  kind: EntryType;
  ledgerId: string;
  selectedKey: string;
}): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const {width: windowWidth} = useWindowDimensions();
  // An iPad form sheet is far narrower than the window: size the grid from
  // the sheet itself, or six columns squeeze the labels into ellipses.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const {theme, themeType} = useCPK();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const categories = useQuery(
    api.categories.queries.list,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
  );
  const selectCategory = useEntryPickerStore((state) => state.selectCategory);
  const rows = useMemo(
    () =>
      (categories ?? []).filter(
        (category) =>
          category.kind === kind && !category.hidden && !category.archived,
      ),
    [categories, kind],
  );
  const pickerRows = useMemo<readonly CategoryPickerRow[]>(
    () => categoryPickerRows(rows),
    [rows],
  );
  // The sheet keeps its close button: a bare link left a full-height sheet
  // with no visible way out.
  if (ledger === null)
    return (
      <AppScreen insetTop={Platform.OS !== 'android'}>
        <PickerHeader
          onClose={() => router.back()}
          testID="entry-category-close"
          title={t('common.category')}
        />
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  // A missing ledger skips the category query, which stays undefined forever.
  // Resolve that terminal state before testing the dependent query's loading.
  if (ledger === undefined || categories === undefined)
    return (
      <AppScreen insetTop={Platform.OS !== 'android'}>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const columnCount = categoryPickerColumnsForWidth(gridWidth ?? windowWidth);
  const choose = (category: CategoryRow): void => {
    selectCategory({categoryKey: category.key, ledgerId: ledger.id});
    router.back();
  };
  return (
    <AppScreen
      backgroundColor={theme.bg.basic}
      insetTop={Platform.OS !== 'android'}
    >
      <PickerHeader
        onClose={() => router.back()}
        testID="entry-category-close"
        title={t('common.category')}
      />
      <FlashList
        key={columnCount}
        onLayout={(event) =>
          setGridWidth(Math.round(event.nativeEvent.layout.width))
        }
        contentContainerStyle={styles.listContent}
        data={pickerRows}
        keyExtractor={(row) =>
          row.kind === 'ADD' ? 'add-category' : row.category.key
        }
        numColumns={columnCount}
        renderItem={({item: row}) => {
          if (row.kind === 'ADD')
            return (
              <CustomPressable
                accessibilityLabel={t('category.add')}
                accessibilityRole="button"
                hitSlop={EXACT_HIT_SLOP}
                onPress={() => {
                  const params = {kind, ledgerId: ledger.id};
                  if (pathname.startsWith('/ledger/')) {
                    router.navigate({
                      pathname: '/ledger/[ledgerId]/item/category/new',
                      params,
                    });
                    return;
                  }
                  router.navigate({pathname: '/entry/category/new', params});
                }}
                style={styles.categoryCell}
                testID="entry-create-category"
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: theme.bg.paper,
                      borderColor: theme.role.border,
                      borderStyle: 'dashed',
                    },
                  ]}
                >
                  <Icon color={theme.text.label} name="Plus" size={24} />
                </View>
                <Typography.Body4
                  maxFontSizeMultiplier={1.25}
                  numberOfLines={1}
                  style={{color: theme.text.label}}
                >
                  {t('common.add')}
                </Typography.Body4>
              </CustomPressable>
            );
          const category = row.category;
          const selected = selectedKey === category.key;
          const token = category.colorToken as CategoryColorToken;
          const color = CATEGORY_COLORS[token]?.[mode] ?? theme.role.primary;
          return (
            <CustomPressable
              accessibilityLabel={categoryDisplayName(category)}
              accessibilityRole="button"
              accessibilityState={{selected}}
              onPress={() => choose(category)}
              style={styles.categoryCell}
            >
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: selected ? color : theme.bg.paper,
                    borderColor: color,
                  },
                ]}
              >
                <Icon
                  color={selected ? theme.text.contrast : color}
                  name={safeIconName(category.iconKey)}
                  size={24}
                />
              </View>
              <Typography.Body4
                $fontWeight={selected ? 'bold' : 'normal'}
                maxFontSizeMultiplier={1.25}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.categoryLabel,
                  {color: selected ? color : theme.text.label},
                ]}
              >
                {categoryDisplayName(category)}
              </Typography.Body4>
            </CustomPressable>
          );
        }}
        style={styles.list}
      />
    </AppScreen>
  );
}

export function EntryCategoryCreateScreen({
  kind,
  ledgerId,
}: {
  kind: EntryType;
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const activeAccent = useLedgerAccent();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const createCategory = useMutation(api.categories.mutations.create);
  const selectCategory = useEntryPickerStore((state) => state.selectCategory);
  const [label, setLabel] = useState('');
  const [colorToken, setColorToken] = useState<CategoryColorToken>(
    CATEGORY_COLOR_TOKENS[0],
  );
  const [iconKey, setIconKey] = useState(CUSTOM_ICON_POOL.food[0] ?? 'Tag');
  // Stable identity keeps CategoryFormFields' memoized icon cells from
  // re-rendering the whole catalog on every keystroke in the name field.
  const applyDraft = useCallback((draft: CategoryDraft): void => {
    setLabel(draft.label);
    setColorToken(draft.colorToken);
    setIconKey(draft.iconKey);
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(96);
  if (ledger === undefined)
    return (
      <AppScreen insetTop={Platform.OS !== 'android'}>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (ledger === null)
    return (
      <AppScreen insetTop={Platform.OS !== 'android'}>
        <PickerHeader
          onClose={() => router.back()}
          testID="entry-category-create-close"
          title={t('category.add')}
        />
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const canSave = isValidCategoryName(label) && !saving;
  const actionBackground = ledgerAccentSurface(activeAccent, mode).background;
  const saveAction = (
    <BookooBottomAction
      accent={activeAccent}
      disabled={!canSave}
      helperText={error ?? undefined}
      helperTone="error"
      loading={saving}
      onPress={() => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        void createCategory({
          colorToken,
          iconKey,
          kind,
          label,
          ledgerId: ledger.id,
        })
          .then(({key}) => {
            selectCategory({categoryKey: key, ledgerId: ledger.id});
            router.dismiss(2);
          })
          .catch(() => {
            setError(t('category.addErrorBody'));
            setSaving(false);
          });
      }}
      text={t('screen.save')}
    />
  );
  return (
    <AppScreen
      backgroundColor={theme.bg.basic}
      bottomInsetColor={actionBackground}
      insetTop={Platform.OS !== 'android'}
    >
      {Platform.OS === 'android' ? (
        <Stack.Screen
          options={{
            // Native sheet footer follows detents and IME translation. A JS
            // footer either gets covered or double-counts the keyboard height.
            unstable_sheetFooter: () => (
              <View
                onLayout={({nativeEvent}) =>
                  setFooterHeight(Math.ceil(nativeEvent.layout.height))
                }
              >
                {saveAction}
              </View>
            ),
          }}
        />
      ) : null}
      <KeyboardAvoidingView
        automaticOffset
        behavior="height"
        // Android owns sheet/IME positioning through its native footer.
        enabled={Platform.OS !== 'android'}
        style={styles.flex}
      >
        <PickerHeader
          onClose={() => router.back()}
          testID="entry-category-create-close"
          title={t('category.add')}
        />
        <ScrollView
          contentContainerStyle={[
            styles.creator,
            Platform.OS === 'android' && {paddingBottom: footerHeight + 24},
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
        >
          <CategoryFormFields
            disabled={saving}
            nameTestID="entry-category-create-name"
            onChange={applyDraft}
            value={{label, colorToken, iconKey}}
          />
        </ScrollView>
        {Platform.OS === 'android' ? null : saveAction}
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  categoryCell: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    minHeight: 104,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  categoryLabel: {textAlign: 'center'},
  colorButton: {
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 2,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  colorDot: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  colorGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  creator: {
    alignSelf: 'center',
    gap: 20,
    maxWidth: 680,
    padding: 24,
    paddingBottom: 48,
    width: '100%',
  },
  flex: {flex: 1},
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  headerAction: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerTitle: {flex: 1},
  iconChoice: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconCircle: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  iconGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  iconSection: {gap: 10},
  list: {alignSelf: 'center', flex: 1, maxWidth: 960, width: '100%'},
  listContent: {paddingBottom: 32, paddingHorizontal: 12, paddingTop: 16},
});
