import type {ReactElement} from 'react';
import {useLocale} from '~/hooks/useLocale';
import {memo, useCallback, useMemo, useRef, useState} from 'react';
import {Alert, ScrollView, StyleSheet, View, Modal} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Image} from 'expo-image';
import {
  Accordion,
  CustomPressable,
  EditText,
  Icon,
  ReorderableList,
  SelectionFeedback,
  Typography,
  useCPK,
  type IconName,
  type ReorderableListItem,
} from 'cpk-ui';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {SelectionRadio} from '~/components/uis/SelectionRadio';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {BookooSegmentedControl} from '~/components/uis/BookooSegmentedControl';
import {SUPPORTED_CURRENCIES, currencySymbolFallback} from '@shared/currency';
import {CATEGORY_COLOR_TOKENS} from '@shared/categories';
import {CATEGORY_COLORS} from '~/theme/chartPalette';
import {FALLBACK_LEDGER_ICON, randomLedgerIcon} from '@shared/ledgerIcons';
import {ColorIconSelectScreen} from '~/components/uis/ColorIconSelect';
import {
  CIRCULAR_ICON_TARGET,
  DETAIL_CONTENT_TOP,
  circularIconRipple,
} from '~/theme/layout';
import {ledgerColorSelectItems, ledgerIconSelectItems} from '../ledgerIdentity';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
  ledgerAccentSurface,
  type LedgerColorKey,
} from '~/theme/ledgerAccent';
import {formatAmount, t, tCount} from '~/utils/i18n';
import {categoryDisplayName, mergeCategoryOrder} from '../categories';
import {
  AppScreen,
  FormFrame,
  LedgerHeader,
  LedgerMark,
  ScreenSkeleton,
  ScreenState,
  safeIconName,
  statusBarStyleForTheme,
} from '../ui';
import type {CategoryRow, LedgerRow} from '../types';
import {ReportControl} from '~/features/release/ReportControl';
import {
  SettingsRow as SettingsMenuRow,
  SettingsSectionList,
  type SettingsListSection,
} from '~/features/settings/ui';

function useRouteLedger(ledgerId: string): LedgerRow | null | undefined {
  return useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
}

function LedgerRouteGate({
  ledger,
  children,
}: {
  ledger: LedgerRow | null | undefined;
  children: (ledger: LedgerRow) => ReactElement;
}): ReactElement {
  if (ledger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  return children(ledger);
}

function SettingsHeader({
  color,
  onBack,
  title,
}: {
  color: string;
  onBack: () => void;
  title: string;
}): ReactElement {
  return (
    <View style={styles.settingsHeader}>
      <CustomPressable
        accessibilityLabel={t('a11y.back')}
        accessibilityRole="button"
        onPress={onBack}
        style={styles.settingsHeaderButton}
      >
        <Icon color={color} name="CaretLeft" size={24} />
      </CustomPressable>
      <Typography.Heading4
        $fontWeight="bold"
        numberOfLines={1}
        style={[styles.settingsHeaderTitle, {color}]}
      >
        {title}
      </Typography.Heading4>
      <View style={styles.settingsHeaderButton} />
    </View>
  );
}

type LedgerSettingsMenuRow = {
  readonly key: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
};

type LedgerSettingsScreenProps =
  | {
      readonly initialLedger?: LedgerRow;
      readonly ledgerId: string;
      readonly onOpenDrawer: () => void;
      readonly presentation: 'tab';
    }
  | {
      readonly initialLedger?: LedgerRow;
      readonly ledgerId: string;
      readonly onOpenDrawer?: never;
      readonly presentation?: 'stack';
    };

export function LedgerSettingsScreen(
  props: LedgerSettingsScreenProps,
): ReactElement {
  useLocale();
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const routeLedger = useRouteLedger(props.ledgerId);
  const ledger = routeLedger === undefined ? props.initialLedger : routeLedger;
  const requestExport = useMutation(api.exports.mutations.requestLedger);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [reporting, setReporting] = useState(false);

  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };

  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        const canAdmin = ready.role === 'OWNER' || ready.role === 'ADMIN';
        const isOwner = ready.role === 'OWNER';
        const mode = themeType === 'dark' ? 'dark' : 'light';
        const accent = LEDGER_ACCENTS[ready.colorKey as LedgerColorKey][mode];
        const surface = ledgerAccentSurface(accent, mode);
        const currencyDetail = `${ready.baseCurrency} | ${currencySymbolFallback(
          ready.baseCurrency,
        )}`;
        const exportData = async (): Promise<void> => {
          if (!canAdmin || exporting) return;
          setExporting(true);
          setExportFailed(false);
          try {
            await requestExport({ledgerId: ready.id});
            Alert.alert(
              t('settings.exportQueuedTitle'),
              t('settings.exportQueuedBody'),
              [
                {text: t('common.ok')},
                {
                  text: t('settings.viewExports'),
                  onPress: () => router.navigate('/settings/privacy'),
                },
              ],
            );
          } catch {
            setExportFailed(true);
          } finally {
            setExporting(false);
          }
        };
        const preferenceRows: readonly LedgerSettingsMenuRow[] = [
          {
            key: 'pro',
            label: t('subscription.proTitle'),
            icon: 'Sparkle' as const,
            onPress: () => router.navigate('/pro'),
          },
          {
            key: 'currency',
            label: t('settings.currency'),
            detail: currencyDetail,
            icon: 'CurrencyCircleDollar' as const,
            disabled: !isOwner,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/currency` as const),
          },
          {
            key: 'timezone',
            label: t('settings.timezone'),
            detail: ready.timeZone,
            icon: 'Clock' as const,
            disabled: !canAdmin,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/timezone` as const),
          },
        ];
        const managementRows: readonly LedgerSettingsMenuRow[] = [
          {
            key: 'details',
            label: t('settings.ledgerDetails'),
            icon: 'PencilSimple' as const,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/details` as const),
          },
          {
            key: 'members',
            label: t('settings.members'),
            icon: 'Users' as const,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/members` as const),
          },
          {
            key: 'invites',
            label: t('settings.inviteLinks'),
            icon: 'Link' as const,
            disabled: !canAdmin,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/invites` as const),
          },
          {
            key: 'categories',
            label: t('settings.ledgerCategories'),
            icon: 'Tag' as const,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/categories` as const),
          },
          {
            key: 'photos',
            label: t('settings.ledgerPhotos'),
            icon: 'Image' as const,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/photos` as const),
          },
        ];
        const advancedRows: readonly LedgerSettingsMenuRow[] = [
          {
            key: 'export',
            label: t('release.exportLedger'),
            detail: exporting
              ? t('common.loading')
              : exportFailed
                ? t('common.failed')
                : undefined,
            icon: 'FileXls' as const,
            disabled: !canAdmin || exporting,
            onPress: () => void exportData(),
          },
          {
            key: 'deleted',
            label: t('screen.deletedEntries'),
            icon: 'Trash' as const,
            onPress: () =>
              router.navigate(`/ledger/${ready.id}/deleted` as const),
          },
          ...(canAdmin
            ? [
                {
                  key: 'requests',
                  label: t('settings.joinRequests'),
                  icon: 'UserPlus' as const,
                  onPress: () =>
                    router.navigate(`/ledger/${ready.id}/requests` as const),
                },
                {
                  key: 'audit',
                  label: t('release.audit'),
                  icon: 'ListChecks' as const,
                  onPress: () =>
                    router.navigate(`/ledger/${ready.id}/audit` as const),
                },
              ]
            : []),
          ...(isOwner
            ? [
                {
                  key: 'danger',
                  label: t('settings.dangerZone'),
                  icon: 'Warning' as const,
                  onPress: () =>
                    router.navigate(`/ledger/${ready.id}/danger` as const),
                },
              ]
            : []),
        ];
        const sections: readonly SettingsListSection<LedgerSettingsMenuRow>[] =
          props.presentation === 'tab'
            ? [
                {
                  data: managementRows,
                  key: 'ledger',
                  title: t('settings.ledgersSection'),
                },
                {
                  data: preferenceRows,
                  key: 'preferences',
                  title: t('settings.preferencesSection'),
                },
                {
                  data: [
                    {
                      key: 'manage',
                      label: t('settings.advancedSection'),
                      icon: 'SlidersHorizontal',
                      onPress: () =>
                        router.navigate(
                          `/ledger/${ready.id}/settings` as const,
                        ),
                    },
                  ],
                  key: 'advanced',
                },
              ]
            : [
                {
                  // Report is a row like its neighbours, not a bare text
                  // button floating at the bottom of the card.
                  data: [
                    ...advancedRows,
                    {
                      key: 'report',
                      label: t('release.report'),
                      icon: 'Flag',
                      onPress: () => setReporting(true),
                    },
                  ],
                  key: 'advanced',
                },
              ];

        return (
          <AppScreen
            backgroundColor={theme.bg.paper}
            statusBarBackgroundColor={surface.background}
            statusBarStyle={statusBarStyleForTheme(themeType)}
          >
            <View style={{backgroundColor: surface.background}}>
              {props.presentation === 'tab' ? (
                <LedgerHeader
                  ledger={ready}
                  onOpenDrawer={props.onOpenDrawer}
                />
              ) : (
                <SettingsHeader
                  color={surface.foreground}
                  onBack={goBack}
                  title={t('settings.advancedSection')}
                />
              )}
            </View>
            <SettingsSectionList<LedgerSettingsMenuRow>
              keyExtractor={(row) => row.key}
              renderItem={(row) => (
                <SettingsMenuRow
                  detail={row.detail}
                  disabled={row.disabled}
                  icon={row.icon}
                  iconColor={accent.text}
                  iconSurface={accent.subtle}
                  onPress={row.onPress}
                  testID={`ledger-settings-row-${row.key}`}
                  title={row.label}
                />
              )}
              sections={sections}
              testID="ledger-settings-list"
            />
            <ReportControl
              onVisibleChange={setReporting}
              showTrigger={false}
              subject={{kind: 'LEDGER', ledgerId: ready.id}}
              visible={reporting}
            />
          </AppScreen>
        );
      }}
    </LedgerRouteGate>
  );
}

export function LedgerDetailsScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const ledger = useRouteLedger(ledgerId);
  const roster = usePaginatedQuery(
    api.ledgers.queries.rosterPaginated,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    // Bounded preview only: four avatars plus an aggregate +N chip. The full
    // roster remains paginated on the dedicated members screen.
    {initialNumItems: 6},
  );
  const update = useMutation(api.ledgers.mutations.update);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [colorKey, setColorKey] = useState<
    (typeof LEDGER_COLOR_KEYS)[number] | null
  >(null);
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [selectingIcon, setSelectingIcon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };

  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        const canAdmin = ready.role === 'OWNER' || ready.role === 'ADMIN';
        const mode = themeType === 'dark' ? 'dark' : 'light';
        const selectedColorKey: LedgerColorKey =
          LEDGER_COLOR_KEYS.find(
            (key) => key === (colorKey ?? ready.colorKey),
          ) ?? 'TEAL';
        const accent = LEDGER_ACCENTS[selectedColorKey][mode];
        const actionAccent = LEDGER_ACCENTS[selectedColorKey][mode];
        const surface = ledgerAccentSurface(accent, mode);
        const resolvedTitle = title ?? ready.title;
        const resolvedDescription = description ?? ready.description;
        const resolvedIconKey = iconKey ?? ready.iconKey;
        const invalid = resolvedTitle.trim().length === 0;
        const save = async (): Promise<void> => {
          if (!canAdmin || saving) return;
          setSaving(true);
          setFailed(false);
          try {
            await update({
              ledgerId: ready.id,
              title: resolvedTitle,
              description: resolvedDescription,
              colorKey: selectedColorKey,
              ...(resolvedIconKey === null ? {} : {iconKey: resolvedIconKey}),
            });
            // Do not enqueue another local render in the same microtask as the
            // native stack pop. On Android Fabric that update could race the
            // outgoing screen detach and re-parent an EditText native view,
            // leaving the activity on a blank surface after a successful save.
            goBack();
          } catch {
            setFailed(true);
            setSaving(false);
          }
        };

        return (
          <>
          <AppScreen
            backgroundColor={theme.bg.paper}
            statusBarBackgroundColor={surface.background}
            statusBarStyle={statusBarStyleForTheme(themeType)}
          >
            <View style={{backgroundColor: surface.background}}>
              <SettingsHeader
                color={surface.foreground}
                onBack={goBack}
                title={t('settings.ledgerDetails')}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.settingsDetailsContent}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              style={styles.flex}
            >
              <View
                style={[
                  styles.settingsDetailsCard,
                  {
                    backgroundColor: theme.bg.basic,
                    borderColor: theme.role.border,
                  },
                ]}
              >
                <CustomPressable
                  accessibilityLabel={t('settings.members')}
                  accessibilityRole="button"
                  onPress={() =>
                    router.navigate(`/ledger/${ready.id}/members` as const)
                  }
                  style={[
                    styles.memberPreview,
                    {borderBottomColor: theme.role.divider},
                  ]}
                >
                  <View style={styles.memberPreviewCopy}>
                    <Typography.Body2 $fontWeight="bold">
                      {t('settings.members')}
                    </Typography.Body2>
                    <Typography.Body4 style={{color: theme.text.label}}>
                      {tCount('ledger.memberCount', ready.memberCount)}
                    </Typography.Body4>
                  </View>
                  <View style={styles.memberStack}>
                    {roster.results.slice(0, 4).map((member, index) => (
                      <View
                        key={member.userId}
                        style={[
                          styles.memberStackAvatar,
                          {
                            backgroundColor: theme.role.underlay,
                            borderColor: theme.bg.basic,
                            marginLeft: index === 0 ? 0 : -10,
                            zIndex: 4 - index,
                          },
                        ]}
                      >
                        {member.avatarThumbUrl === null ? (
                          <Icon
                            color={theme.role.primary}
                            name="User"
                            size={18}
                          />
                        ) : (
                          <Image
                            accessibilityLabel={
                              member.displayName || t('auth.noName')
                            }
                            contentFit="cover"
                            source={member.avatarThumbUrl}
                            style={styles.memberStackImage}
                          />
                        )}
                        {member.role === 'OWNER' ? (
                          <View
                            style={[
                              styles.memberStackCrown,
                              {backgroundColor: theme.button.warning.bg},
                            ]}
                          >
                            <Icon
                              color={theme.button.warning.text}
                              name="CrownFill"
                              size={8}
                            />
                          </View>
                        ) : null}
                      </View>
                    ))}
                    {ready.memberCount > 4 ? (
                      <View
                        style={[
                          styles.memberStackMore,
                          {
                            backgroundColor: surface.background,
                            borderColor: theme.bg.basic,
                          },
                        ]}
                      >
                        <Typography.Body4
                          $fontWeight="bold"
                          style={{color: surface.foreground}}
                        >
                          +{ready.memberCount - 4}
                        </Typography.Body4>
                      </View>
                    ) : null}
                    <Icon
                      color={theme.text.placeholder}
                      name="CaretRight"
                      size={18}
                    />
                  </View>
                </CustomPressable>
                <EditText
                  decoration="underline"
                  editable={canAdmin}
                  hideCounter
                  label={t('ledger.titleLabel')}
                  maxLength={80}
                  onChangeText={setTitle}
                  value={resolvedTitle}
                />
                <EditText
                  decoration="underline"
                  editable={canAdmin}
                  hideCounter
                  label={t('ledger.descriptionPlaceholder')}
                  maxLength={300}
                  multiline
                  onChangeText={setDescription}
                  styles={{input: styles.settingsDescriptionInput}}
                  value={resolvedDescription}
                />
                <View style={styles.settingsColorRow}>
                  <Typography.Body2
                    $fontWeight="bold"
                    style={{color: theme.text.basic}}
                  >
                    {t('common.color')}
                  </Typography.Body2>
                  <View style={styles.settingsColorChoices}>
                    {LEDGER_COLOR_KEYS.map((key) => (
                      <CustomPressable
                        accessibilityLabel={key}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: selectedColorKey === key,
                        }}
                        disabled={!canAdmin}
                        key={key}
                        onPress={() => {
                          if (key === selectedColorKey) return;
                          setColorKey(key);
                          setIconKey((current) =>
                            randomLedgerIcon(current ?? ready.iconKey),
                          );
                        }}
                        style={styles.settingsColorButton}
                      >
                        <SelectionFeedback
                          active={selectedColorKey === key}
                          selection={selectedColorKey}
                          style={[
                            styles.settingsColorSwatch,
                            {
                              backgroundColor: LEDGER_ACCENTS[key][mode].base,
                              borderColor:
                                selectedColorKey === key
                                  ? theme.text.basic
                                  : theme.role.border,
                            },
                          ]}
                        >
                          {selectedColorKey === key ? (
                            <Icon
                              color={LEDGER_ACCENTS[key][mode].on}
                              name="CheckBold"
                              size={14}
                            />
                          ) : null}
                        </SelectionFeedback>
                      </CustomPressable>
                    ))}
                  </View>
                </View>
                <View style={styles.settingsColorRow}>
                  <Typography.Body2
                    $fontWeight="bold"
                    style={{color: theme.text.basic}}
                  >
                    {t('common.icon')}
                  </Typography.Body2>
                  <View style={styles.settingsIconValue}>
                    <CustomPressable
                      accessibilityLabel={t('a11y.shuffleIcon')}
                      accessibilityRole="button"
                      android_ripple={circularIconRipple(theme.role.underlay)}
                      disabled={!canAdmin}
                      onPress={() =>
                        setIconKey((current) =>
                          randomLedgerIcon(current ?? ready.iconKey),
                        )
                      }
                      style={styles.settingsShuffle}
                      testID="ledger-details-shuffle"
                    >
                      <Icon
                        color={theme.text.basic}
                        name="ArrowsClockwise"
                        size={20}
                      />
                    </CustomPressable>
                    <CustomPressable
                      accessibilityLabel={t('icon.selectTitle')}
                      accessibilityRole="button"
                      disabled={!canAdmin}
                      onPress={() => setSelectingIcon(true)}
                      style={styles.settingsIconOpen}
                      testID="ledger-details-icon"
                    >
                      <SelectionFeedback
                        selection={`${selectedColorKey}:${resolvedIconKey}`}
                      >
                        <LedgerMark
                          colorKey={selectedColorKey}
                          iconKey={resolvedIconKey}
                          size={36}
                        />
                      </SelectionFeedback>
                      <Icon
                        color={theme.text.placeholder}
                        name="CaretRight"
                        size={18}
                      />
                    </CustomPressable>
                  </View>
                </View>
                {failed ? (
                  <Typography.Body3 style={{color: theme.text.validation}}>
                    {t('error.generic')}
                  </Typography.Body3>
                ) : null}
                {canAdmin ? (
                  <BookooButton
                    accent={actionAccent}
                    disabled={invalid}
                    loading={saving}
                    onPress={() => void save()}
                    text={t('common.update')}
                    testID="ledger-details-update"
                  />
                ) : (
                  <Typography.Body3 style={{color: theme.text.label}}>
                    {t('error.ledger.forbidden')}
                  </Typography.Body3>
                )}
              </View>
            </ScrollView>
          </AppScreen>
        <Modal
          animationType="slide"
          onRequestClose={() => setSelectingIcon(false)}
          presentationStyle="pageSheet"
          visible={selectingIcon}
        >
          <ColorIconSelectScreen
            applyLabel={t('common.apply')}
            colors={ledgerColorSelectItems(mode)}
            icons={ledgerIconSelectItems()}
            onApply={(next) => {
              setColorKey(next.color);
              setIconKey(next.icon);
              setSelectingIcon(false);
            }}
            onClose={() => setSelectingIcon(false)}
            searchPlaceholder={t('icon.searchPlaceholder')}
            title={t('icon.selectTitle')}
            value={{
              color: selectedColorKey,
              icon: resolvedIconKey ?? FALLBACK_LEDGER_ICON,
            }}
          />
        </Modal>
        </>
        );
      }}
    </LedgerRouteGate>
  );
}

export function LedgerCategoriesScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const {theme} = useCPK();
  const router = useRouter();
  const ledger = useRouteLedger(ledgerId);
  const categories = useQuery(
    api.categories.queries.list,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
  );
  const reorder = useMutation(
    api.categories.mutations.reorder,
  ).withOptimisticUpdate((store, args) => {
    const rows = store.getQuery(api.categories.queries.list, {
      ledgerId: args.ledgerId,
    });
    if (!rows) return;
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const ordered = args.orderedKeys.flatMap((key) => {
      const row = byKey.get(key);
      return row ? [row] : [];
    });
    if (ordered.length === rows.length)
      store.setQuery(
        api.categories.queries.list,
        {ledgerId: args.ledgerId},
        ordered,
      );
  });
  const archive = useMutation(api.categories.mutations.archive);
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [reordering, setReordering] = useState(false);
  const reorderPending = useRef(false);
  const canAdmin =
    ledger != null &&
    (ledger.role === 'OWNER' || ledger.role === 'ADMIN') &&
    ledger.maintenanceLock === 'NONE';
  // Categories are deliberately bounded server-side to MAX_CATEGORIES_PER_LEDGER (120).
  const visibleCategories = useMemo(
    () =>
      categories?.filter(
        (category) =>
          category.kind === kind && !category.archived && !category.hidden,
      ),
    [categories, kind],
  );
  const editCategory = useCallback(
    (category: CategoryRow): void => {
      if (!canAdmin || !ledger) return;
      router.navigate({
        pathname: '/ledger/[ledgerId]/categories/[categoryKey]',
        params: {ledgerId: ledger.id, categoryKey: category.key},
      });
    },
    [canAdmin, ledger, router],
  );
  const archiveCategory = useCallback(
    async (category: CategoryRow): Promise<void> => {
      if (ledger === undefined || ledger === null) return;
      await archive({ledgerId: ledger.id, key: category.key});
    },
    [archive, ledger],
  );
  const reorderCategories = useCallback(
    (ordered: CategoryRow[]): void => {
      if (
        !canAdmin ||
        !ledger ||
        !categories ||
        !visibleCategories ||
        reorderPending.current
      )
        return;
      const orderedKeys = mergeCategoryOrder(
        categories,
        visibleCategories,
        ordered,
      );
      if (!orderedKeys) return;
      reorderPending.current = true;
      setReordering(true);
      setFailed(false);
      void reorder({ledgerId: ledger.id, orderedKeys})
        .catch(() => setFailed(true))
        .finally(() => {
          reorderPending.current = false;
          setReordering(false);
        });
    },
    [canAdmin, categories, ledger, reorder, visibleCategories],
  );
  const renderCategory = useCallback(
    ({item, dragHandle}: ReorderableListItem<CategoryRow>) => (
      <CategoryAdminRow
        canAdmin={canAdmin}
        category={item}
        dragHandle={dragHandle}
        expanded={expandedCategoryKey === item.key}
        onArchive={archiveCategory}
        onExpandedChange={setExpandedCategoryKey}
        onEdit={editCategory}
      />
    ),
    [canAdmin, expandedCategoryKey, archiveCategory, editCategory],
  );
  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        const canCreate =
          ready.role !== 'VIEWER' && ready.maintenanceLock === 'NONE';
        return (
          <AppScreen>
            <View style={styles.categoryCreator}>
              <BookooSegmentedControl
                onValueChange={(value) => {
                  if (
                    !reorderPending.current &&
                    (value === 'EXPENSE' || value === 'INCOME')
                  ) {
                    setExpandedCategoryKey(null);
                    setKind(value);
                  }
                }}
                selectedValue={kind}
                values={[
                  {text: t('ledgerItem.expense'), value: 'EXPENSE'},
                  {text: t('ledgerItem.income'), value: 'INCOME'},
                ]}
              />
              {canCreate ? (
                <BookooButton
                  onPress={() =>
                    router.navigate({
                      pathname: '/ledger/[ledgerId]/categories/new',
                      params: {ledgerId: ready.id, kind},
                    })
                  }
                  testID="category-create"
                  text={t('category.add')}
                />
              ) : null}
              {failed ? (
                <Typography.Body3 style={{color: theme.text.validation}}>
                  {t('error.generic')}
                </Typography.Body3>
              ) : null}
            </View>
            {visibleCategories === undefined ? (
              <ScreenSkeleton rows={6} />
            ) : (
              <ReorderableList
                data={visibleCategories}
                disabled={!canAdmin || reordering}
                extraData={expandedCategoryKey}
                keyExtractor={categoryKey}
                getItemLabel={categoryDisplayName}
                onReorder={reorderCategories}
                renderItem={renderCategory}
                testID="category-order"
              />
            )}
          </AppScreen>
        );
      }}
    </LedgerRouteGate>
  );
}

const categoryKey = (category: CategoryRow): string => category.key;

const CategoryAdminRow = memo(function CategoryAdminRow({
  canAdmin,
  category,
  dragHandle,
  expanded,
  onArchive,
  onExpandedChange,
  onEdit,
}: {
  canAdmin: boolean;
  category: CategoryRow;
  dragHandle: ReactElement | null;
  expanded: boolean;
  onArchive: (category: CategoryRow) => Promise<void>;
  onExpandedChange: (categoryKey: string | null) => void;
  onEdit: (category: CategoryRow) => void;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const dialog = useBookooAlertDialog();
  const colorToken =
    CATEGORY_COLOR_TOKENS.find((token) => token === category.colorToken) ??
    'category.teal';
  const categoryColor =
    CATEGORY_COLORS[colorToken][themeType === 'dark' ? 'dark' : 'light'];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useCallback((operation: Promise<void>) => {
    setBusy(true);
    setFailed(false);
    void operation.catch(() => setFailed(true)).finally(() => setBusy(false));
  }, []);
  return (
    <Accordion
      data={[{title: category, items: canAdmin ? [category] : []}]}
      expandedIndexes={canAdmin && expanded ? [0] : []}
      onExpandedChange={(_, open) =>
        onExpandedChange(open ? category.key : null)
      }
      styles={{
        container: [
          styles.categoryRow,
          {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
        ],
        itemContainer: {padding: 0, backgroundColor: 'transparent'},
      }}
      renderHeader={({expanded: open, toggle}) => (
        <View style={styles.categorySummary}>
          <CustomPressable
            accessibilityLabel={`${t('common.edit')}: ${categoryDisplayName(category)}`}
            accessibilityRole="button"
            disabled={!canAdmin || busy}
            onPress={() => onEdit(category)}
            style={[
              styles.categoryIcon,
              {backgroundColor: theme.role.underlay},
            ]}
            testID={`category-admin-${category.key}-icon`}
          >
            <Icon
              color={categoryColor}
              name={safeIconName(category.iconKey)}
              size={22}
            />
          </CustomPressable>
          <View style={styles.flex}>
            <Typography.Body2
              $fontWeight="bold"
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={categoryDisplayName(category)}
            >
              {categoryDisplayName(category)}
            </Typography.Body2>
          </View>
          {canAdmin ? (
            <CustomPressable
              accessibilityLabel={t('common.more')}
              accessibilityRole="button"
              accessibilityState={{expanded: open}}
              onPress={toggle}
              style={styles.categoryMoreButton}
              testID={`category-admin-${category.key}-more`}
            >
              <Icon color={theme.text.label} name="DotsThree" size={22} />
            </CustomPressable>
          ) : null}
          {dragHandle}
        </View>
      )}
      renderItem={() => (
        <View
          style={[styles.categoryEditor, {borderTopColor: theme.role.divider}]}
          testID={`category-admin-${category.key}-editor`}
        >
          <View style={styles.categoryActions}>
            <BookooButton
              disabled={busy}
              onPress={() => onEdit(category)}
              size="small"
              text={t('common.edit')}
              type="text"
            />
            <BookooButton
              color="danger"
              disabled={busy}
              onPress={() =>
                dialog.confirm({
                  body: categoryDisplayName(category),
                  confirmText: t('screen.archiveCategory'),
                  icon: 'ArchiveBox',
                  onConfirm: () => run(onArchive(category)),
                  title: t('screen.archiveCategory'),
                  tone: 'danger',
                })
              }
              size="small"
              text={t('screen.archiveCategory')}
              type="text"
            />
          </View>
          {failed ? (
            <Typography.Body4 style={{color: theme.text.validation}}>
              {t('error.generic')}
            </Typography.Body4>
          ) : null}
        </View>
      )}
    />
  );
});

export function LedgerCurrencyScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const ledger = useRouteLedger(ledgerId);
  const update = useMutation(api.ledgers.mutations.update);
  const confirm = useMutation(api.ledgers.mutations.confirmCurrency);
  const [currency, setCurrency] = useState<string | null>(null);
  const [currencyQuery, setCurrencyQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };
  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        const selected = currency ?? ready.baseCurrency;
        const currencyNeedle = currencyQuery.trim().toUpperCase();
        const currencyCodes =
          currencyNeedle.length === 0
            ? SUPPORTED_CURRENCIES
            : SUPPORTED_CURRENCIES.filter(
                (code) =>
                  code.includes(currencyNeedle) ||
                  currencySymbolFallback(code)
                    .toUpperCase()
                    .includes(currencyNeedle),
              );
        const actionAccent =
          LEDGER_ACCENTS[ready.colorKey as LedgerColorKey][
            themeType === 'dark' ? 'dark' : 'light'
          ];
        const actionBackground = ledgerAccentSurface(
          actionAccent,
          themeType === 'dark' ? 'dark' : 'light',
        ).background;
        if (ready.role !== 'OWNER')
          return (
            <AppScreen>
              <ScreenState
                icon="ShieldWarning"
                title={t('error.ledger.forbidden')}
              />
            </AppScreen>
          );
        return (
          <AppScreen bottomInsetColor={actionBackground}>
            <FlashList
              contentContainerStyle={styles.currencyListContent}
              contentInsetAdjustmentBehavior="automatic"
              data={currencyCodes}
              keyExtractor={(code) => code}
              ListHeaderComponent={
                <View style={styles.currencyListHeader}>
                  <Typography.Heading1
                    $fontWeight="bold"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={[styles.currencyPreview, {color: actionAccent.text}]}
                    testID="ledger-currency-preview"
                  >
                    {formatAmount({
                      amountMinor: 12345,
                      currency: selected,
                    })}
                  </Typography.Heading1>
                  <EditText
                    decoration="underline"
                    hideCounter
                    onChangeText={setCurrencyQuery}
                    placeholder={t('money.searchCurrency')}
                    placeholderColor={theme.text.placeholder}
                    testID="ledger-currency-search"
                    value={currencyQuery}
                  />
                </View>
              }
              renderItem={({item: code}) => {
                const checked = selected === code;
                return (
                  <CustomPressable
                    accessibilityLabel={`${code}, ${currencySymbolFallback(code)}`}
                    accessibilityRole="radio"
                    accessibilityState={{checked}}
                    onPress={() => setCurrency(code)}
                    style={[
                      styles.currencyListRow,
                      {
                        backgroundColor: theme.bg.basic,
                        borderBottomColor: theme.role.divider,
                      },
                    ]}
                  >
                    <Typography.Body2
                      $fontWeight={checked ? 'bold' : 'normal'}
                      style={{
                        color: checked ? actionAccent.text : theme.text.basic,
                      }}
                    >
                      {`${code} | ${currencySymbolFallback(code)}`}
                    </Typography.Body2>
                    <SelectionRadio selected={checked} />
                  </CustomPressable>
                );
              }}
            />
            <BookooBottomAction
              accent={actionAccent}
              helperText={failed ? t('error.generic') : undefined}
              helperTone="error"
              loading={saving}
              onPress={() => {
                setSaving(true);
                setFailed(false);
                const operation = ready.currencyIsAssumed
                  ? confirm({ledgerId: ready.id, baseCurrency: selected})
                  : update({ledgerId: ready.id, baseCurrency: selected});
                void operation
                  .then(goBack)
                  .catch(() => setFailed(true))
                  .finally(() => setSaving(false));
              }}
              text={t('screen.save')}
            />
          </AppScreen>
        );
      }}
    </LedgerRouteGate>
  );
}

export function LedgerTimezoneScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const ledger = useRouteLedger(ledgerId);
  const change = useMutation(api.ledgers.mutations.setTimeZone);
  const [zone, setZone] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };
  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        const actionAccent =
          LEDGER_ACCENTS[ready.colorKey as LedgerColorKey][
            themeType === 'dark' ? 'dark' : 'light'
          ];
        const actionBackground = ledgerAccentSurface(
          actionAccent,
          themeType === 'dark' ? 'dark' : 'light',
        ).background;
        if (ready.role !== 'OWNER' && ready.role !== 'ADMIN')
          return (
            <AppScreen>
              <ScreenState
                icon="ShieldWarning"
                title={t('error.ledger.forbidden')}
              />
            </AppScreen>
          );
        return (
          <AppScreen bottomInsetColor={actionBackground}>
            <KeyboardAvoidingView
              automaticOffset
              behavior="height"
              style={styles.flex}
            >
              <ScrollView
                contentContainerStyle={styles.timezoneContent}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                style={styles.flex}
              >
                <FormFrame>
                  {ready.maintenanceLock === 'NONE' ? null : (
                    <Typography.Body3>
                      {t('error.ledger.maintenance')}
                    </Typography.Body3>
                  )}
                  <EditText
                    autoCapitalize="none"
                    decoration="boxed"
                    hideCounter
                    label={t('settings.timezone')}
                    onChangeText={setZone}
                    value={zone ?? ready.timeZone}
                  />
                  {/* Labelled like the fields around it; bare day names said
                      nothing about what they set. */}
                  <View style={styles.weekStartField}>
                    <Typography.Heading5
                      style={[
                        styles.weekStartLabel,
                        {color: theme.text.placeholder},
                      ]}
                    >
                      {t('settings.weekStart')}
                    </Typography.Heading5>
                    <BookooSegmentedControl
                      onValueChange={(value) => {
                        if (typeof value === 'number') setWeekStart(value);
                      }}
                      selectedValue={weekStart ?? ready.weekStartsOn}
                      values={[
                        {text: t('settings.sunday'), value: 0},
                        {text: t('settings.monday'), value: 1},
                        {text: t('settings.saturday'), value: 6},
                      ]}
                    />
                  </View>
                  <EditText
                    decoration="boxed"
                    hideCounter
                    label={t('settings.periodStartDay')}
                    maxLength={2}
                    onChangeText={setPeriodStart}
                    textInputProps={{keyboardType: 'number-pad'}}
                    value={periodStart ?? String(ready.periodStartDay)}
                  />
                </FormFrame>
              </ScrollView>
              <BookooBottomAction
                accent={actionAccent}
                disabled={ready.maintenanceLock !== 'NONE'}
                helperText={failed ? t('error.generic') : undefined}
                helperTone="error"
                loading={saving}
                onPress={() => {
                  setSaving(true);
                  setFailed(false);
                  void change({
                    ledgerId: ready.id,
                    timeZone: zone ?? ready.timeZone,
                    weekStartsOn: weekStart ?? ready.weekStartsOn,
                    periodStartDay: Number(periodStart ?? ready.periodStartDay),
                  })
                    .then(goBack)
                    .catch(() => setFailed(true))
                    .finally(() => setSaving(false));
                }}
                text={t('common.update')}
              />
            </KeyboardAvoidingView>
          </AppScreen>
        );
      }}
    </LedgerRouteGate>
  );
}

export function LedgerDangerScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const dialog = useBookooAlertDialog();
  const router = useRouter();
  const ledger = useRouteLedger(ledgerId);
  const archive = useMutation(api.ledgers.mutations.archive);
  const unarchive = useMutation(api.ledgers.mutations.unarchive);
  const scheduleDelete = useMutation(api.ledgers.mutations.scheduleDelete);
  return (
    <LedgerRouteGate ledger={ledger}>
      {(ready) => {
        if (ready.role !== 'OWNER')
          return (
            <AppScreen>
              <ScreenState
                icon="ShieldWarning"
                title={t('error.ledger.forbidden')}
              />
            </AppScreen>
          );
        return (
          <AppScreen>
            <FormFrame>
              {/* Explain the two actions before anyone presses one, and say
                  when the ledger is already archived. */}
              <ScreenState
                body={
                  ready.archivedAt === null
                    ? t('ledger.dangerHint')
                    : t('error.ledger.archived')
                }
                compact
                icon={ready.archivedAt === null ? 'Warning' : 'Archive'}
                title={
                  ready.archivedAt === null
                    ? t('common.warning')
                    : t('screen.archived')
                }
              />
              <BookooButton
                color="warning"
                onPress={() =>
                  void (ready.archivedAt === null
                    ? archive({ledgerId: ready.id})
                    : unarchive({ledgerId: ready.id}))
                }
                text={
                  ready.archivedAt === null
                    ? t('screen.archiveLedger')
                    : t('screen.restoreLedger')
                }
                type="outlined"
              />
              <BookooButton
                color="danger"
                onPress={() =>
                  dialog.confirm({
                    body: t('common.deleteConfirm'),
                    confirmText: t('common.delete'),
                    icon: 'TrashSimple',
                    onConfirm: () =>
                      void scheduleDelete({ledgerId: ready.id}).then(() =>
                        router.replace('/ledgers'),
                      ),
                    title: t('common.delete'),
                    tone: 'danger',
                  })
                }
                text={t('common.delete')}
                type="outlined"
              />
            </FormFrame>
          </AppScreen>
        );
      }}
    </LedgerRouteGate>
  );
}

const styles = StyleSheet.create({
  categoryCreator: {gap: 12, padding: 14, paddingTop: DETAIL_CONTENT_TOP},
  categoryActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  categoryEditor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginTop: 2,
    padding: 14,
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  categoryMoreButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  categoryRow: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    marginHorizontal: 14,
    overflow: 'hidden',
  },
  categorySummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 80,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 12,
  },
  currencyListContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  currencyListHeader: {
    gap: 14,
    paddingBottom: 16,
    paddingTop: DETAIL_CONTENT_TOP,
  },
  currencyPreview: {paddingVertical: 12, textAlign: 'center'},
  currencyListRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 4,
  },
  flex: {flex: 1, minWidth: 0},
  memberPreview: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 72,
    paddingBottom: 18,
  },
  memberPreviewCopy: {flex: 1, gap: 3},
  memberStack: {alignItems: 'center', flexDirection: 'row'},
  memberStackAvatar: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 2,
    height: 42,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    width: 42,
  },
  memberStackCrown: {
    alignItems: 'center',
    borderRadius: 7,
    bottom: -1,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 14,
  },
  memberStackImage: {borderRadius: 19, height: 38, width: 38},
  memberStackMore: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 2,
    height: 42,
    justifyContent: 'center',
    marginLeft: -10,
    width: 42,
  },
  settingsColorButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  settingsColorChoices: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  settingsColorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 64,
  },
  settingsColorSwatch: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  settingsIconOpen: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  settingsIconValue: {alignItems: 'center', flexDirection: 'row', gap: 4},
  settingsShuffle: {
    ...CIRCULAR_ICON_TARGET,
    height: 44,
    width: 44,
  },
  settingsDescriptionInput: {
    minHeight: 88,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  settingsDetailsCard: {
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 20,
    padding: 20,
  },
  settingsDetailsContent: {
    alignSelf: 'center',
    maxWidth: 720,
    padding: 16,
    paddingTop: DETAIL_CONTENT_TOP,
    paddingBottom: 40,
    width: '100%',
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
  },
  settingsHeaderButton: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  timezoneContent: {paddingBottom: 24},
  weekStartField: {gap: 14},
  weekStartLabel: {fontSize: 16},
  settingsHeaderTitle: {flex: 1, textAlign: 'center'},
});
