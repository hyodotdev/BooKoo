import type {ReactElement} from 'react';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {useAuthToken} from '@convex-dev/auth/react';
import type {FunctionReturnType} from 'convex/server';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import {Directory, File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {Image} from 'expo-image';
import {
  Accordion,
  Button,
  CustomPressable,
  EditText,
  Icon,
  Typography,
  type IconName,
  useCPK,
} from 'cpk-ui';
import {useRouter} from 'expo-router';
import {SelectionRadio} from '~/components/uis/SelectionRadio';
import {BookooLoading} from '~/components/uis/BookooLoading';
import {leaveCurrentScreen} from '~/utils/navigation';
import {FlashList} from '@shopify/flash-list';

import {api} from '@convex/_generated/api';
import {appVersion} from '../../../config';
import {currencyInfo, SUPPORTED_CURRENCIES} from '@shared/currency';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  validateDisplayName,
} from '@shared/profile';
import {useSession} from '~/features/auth/session';
import {CountryAnalyticsChoice} from '~/features/growth/CountryAnalyticsChoice';
import {usePushRegistration} from '~/features/push/provider';
import {
  AppScreen,
  FormFrame,
  ScreenSkeleton,
  ScreenState,
} from '~/features/ledger/ui';
import {showNotice} from '~/utils/alert';
import {formatAmount, formatDate, formatTimeAgo, t} from '~/utils/i18n';
import {diagnosticSnapshot} from '~/features/diagnostics/ring';
import {renderInboxNotification} from '@shared/push';
import {navigateToNotification} from '~/features/push/provider';
import {useLocale} from '~/hooks/useLocale';
import {useAdRuntime} from '~/features/ads/provider';
import {uploadFile} from '~/features/media/upload';
import {
  hasCameraAccess,
  hasPhotoPickerAccess,
} from '~/features/media/photoPickerPermission';
import {
  SettingsDivider,
  SettingsBottomAction,
  SettingsHero,
  SettingsListFrame,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsSectionList,
  SettingsStatus,
  SettingsToggleRow,
} from '~/features/settings/ui';

type PrivacyExportRow = FunctionReturnType<
  typeof api.exports.queries.listMine
>['page'][number];
type PrivacyFileRow = FunctionReturnType<
  typeof api.exports.queries.files
>['page'][number];
type PrivacyBlockRow = FunctionReturnType<
  typeof api.blocks.queries.listMine
>['page'][number];
type PrivacyRow =
  | {readonly kind: 'country-analytics'}
  | {
      readonly icon: IconName;
      readonly key: string;
      readonly kind: 'action';
      readonly loading?: boolean;
      readonly onPress: () => void;
      readonly title: string;
    }
  | {readonly kind: 'export'; readonly dataExport: PrivacyExportRow}
  | {readonly kind: 'file'; readonly file: PrivacyFileRow}
  | {readonly kind: 'blocked-empty'}
  | {readonly kind: 'block'; readonly block: PrivacyBlockRow};
type NotificationRow = FunctionReturnType<
  typeof api.notifications.queries.list
>['page'][number];
type NotificationLocale = Parameters<typeof renderInboxNotification>[0];
type ReportRow = FunctionReturnType<
  typeof api.reports.queries.open
>['page'][number];
type ContentRow = FunctionReturnType<
  typeof api.content.queries.list
>['page'][number];
type ReportResolution =
  | 'NO_ACTION'
  | 'COMMENT_REMOVED'
  | 'ITEM_CONTENT_REDACTED'
  | 'MEMBER_REMOVED'
  | 'ACCOUNT_SUSPENDED';

// Section composition recreates wrappers, not the underlying Convex documents.
// Compare those documents so a download's busy state only repaints its own row.
function samePrivacyRow(left: PrivacyRow, right: PrivacyRow): boolean {
  if (left === right) return true;
  if (left.kind === 'export' && right.kind === 'export')
    return left.dataExport === right.dataExport;
  if (left.kind === 'file' && right.kind === 'file')
    return left.file === right.file;
  if (left.kind === 'block' && right.kind === 'block')
    return left.block === right.block;
  return left.kind === 'blocked-empty' && right.kind === 'blocked-empty';
}

const PrivacyListRow = memo(
  function PrivacyListRow({
    busy,
    onDownload,
    onRemoveExport,
    onUnblock,
    row,
  }: {
    readonly busy: boolean;
    readonly onDownload: (file: PrivacyFileRow) => void;
    readonly onRemoveExport: (exportId: PrivacyExportRow['id']) => void;
    readonly onUnblock: (userId: PrivacyBlockRow['userId']) => void;
    readonly row: PrivacyRow;
  }): ReactElement {
    const {theme} = useCPK();
    useLocale();
    if (row.kind === 'country-analytics') return <CountryAnalyticsChoice />;
    if (row.kind === 'action')
      return (
        <SettingsRow
          disabled={row.loading}
          icon={row.icon}
          loading={row.loading}
          onPress={row.onPress}
          title={row.title}
        />
      );
    if (row.kind === 'export') {
      const {dataExport} = row;
      return (
        <View style={[styles.card, {borderColor: theme.role.border}]}>
          <Typography.Body2 $fontWeight="bold">
            {dataExport.kind} · {dataExport.state}
          </Typography.Body2>
          <Typography.Body4>
            {formatDate(dataExport.requestedAt, 'PPP p')}
          </Typography.Body4>
          {dataExport.state === 'FAILED' ? (
            <Typography.Body4>{dataExport.failedCode}</Typography.Body4>
          ) : null}
          <Button
            color="danger"
            loading={busy}
            onPress={() => onRemoveExport(dataExport.id)}
            size="small"
            text={t('common.delete')}
            type="text"
          />
        </View>
      );
    }
    if (row.kind === 'file')
      return (
        <Button
          loading={busy}
          onPress={() => onDownload(row.file)}
          text={`${row.file.fileName} · ${row.file.byteSize}`}
          type="outlined"
        />
      );
    if (row.kind === 'blocked-empty')
      return <SettingsRow title={t('release.noBlockedAccounts')} />;
    return (
      <View style={styles.row}>
        <Typography.Body2 style={styles.flex}>
          {row.block.handle === null
            ? row.block.displayName || t('release.deletedUser')
            : `@${row.block.handle}`}
        </Typography.Body2>
        <Button
          loading={busy}
          onPress={() => onUnblock(row.block.userId)}
          size="small"
          text={t('release.unblock')}
          type="outlined"
        />
      </View>
    );
  },
  (previous, next) =>
    previous.busy === next.busy &&
    previous.onDownload === next.onDownload &&
    previous.onRemoveExport === next.onRemoveExport &&
    previous.onUnblock === next.onUnblock &&
    samePrivacyRow(previous.row, next.row),
);

const NotificationInboxRow = memo(function NotificationInboxRow({
  item,
  locale,
  onOpen,
}: {
  readonly item: NotificationRow;
  readonly locale: NotificationLocale;
  readonly onOpen: (item: NotificationRow) => void;
}): ReactElement {
  const {theme} = useCPK();
  const copy = renderInboxNotification(locale, item.kind);
  const unread = item.readAt === null;
  // A text Button draws one line, so the body and any time were never shown.
  return (
    <CustomPressable
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={styles.notificationRow}
      testID="notification-row"
    >
      <View
        style={[
          styles.notificationDot,
          unread && {backgroundColor: theme.role.primary},
        ]}
        testID={unread ? 'notification-unread' : undefined}
      />
      <View style={styles.notificationCopy}>
        <Typography.Body2
          $fontWeight={unread ? 'bold' : 'normal'}
          style={{color: theme.text.basic}}
        >
          {copy.title}
        </Typography.Body2>
        <Typography.Body3 style={{color: theme.text.label}}>
          {copy.body}
        </Typography.Body3>
        <Typography.Body4 style={{color: theme.text.placeholder}}>
          {formatTimeAgo(item.createdAt, locale)}
        </Typography.Body4>
      </View>
    </CustomPressable>
  );
});

const OpsReportRow = memo(function OpsReportRow({
  onAcknowledge,
  onResolve,
  report,
}: {
  readonly onAcknowledge: (reportId: ReportRow['id']) => void;
  readonly onResolve: (
    reportId: ReportRow['id'],
    resolution: ReportResolution,
  ) => void;
  readonly report: ReportRow;
}): ReactElement {
  return (
    <View style={styles.card}>
      <Typography.Body2>
        {report.reason} · {JSON.stringify(report.subject)}
      </Typography.Body2>
      {report.note === null ? null : (
        <Typography.Body3>{report.note}</Typography.Body3>
      )}
      {report.status === 'OPEN' ? (
        <Button
          onPress={() => onAcknowledge(report.id)}
          text={t('release.acknowledge')}
        />
      ) : (
        <View style={styles.linkRow}>
          <Button
            onPress={() => onResolve(report.id, 'NO_ACTION')}
            text={t('release.dismissReport')}
            type="outlined"
          />
          {report.subject.kind === 'COMMENT' ? (
            <Button
              color="danger"
              onPress={() => onResolve(report.id, 'COMMENT_REMOVED')}
              text={t('release.removeComment')}
              type="outlined"
            />
          ) : null}
          {report.subject.kind === 'ITEM' ? (
            <Button
              color="danger"
              onPress={() => onResolve(report.id, 'ITEM_CONTENT_REDACTED')}
              text={t('release.redactItem')}
              type="outlined"
            />
          ) : null}
          {report.subject.kind === 'USER' && report.contextLedgerId !== null ? (
            <Button
              color="danger"
              onPress={() => onResolve(report.id, 'MEMBER_REMOVED')}
              text={t('release.removeMember')}
              type="outlined"
            />
          ) : null}
          {report.subject.kind === 'USER' ? (
            <Button
              color="danger"
              onPress={() => onResolve(report.id, 'ACCOUNT_SUSPENDED')}
              text={t('release.suspendAccount')}
              type="outlined"
            />
          ) : null}
        </View>
      )}
    </View>
  );
});

export function PrivacyScreen(): ReactElement {
  const router = useRouter();
  const ads = useAdRuntime();
  const token = useAuthToken();
  const requestPersonal = useMutation(api.exports.mutations.requestPersonal);
  const removeExport = useMutation(api.exports.mutations.deleteExport);
  const unblock = useMutation(api.blocks.mutations.remove);
  const [requesting, setRequesting] = useState(false);
  const [busyRow, setBusyRow] = useState<string>();
  const [privacyOptionsBusy, setPrivacyOptionsBusy] = useState(false);
  const exportsPage = usePaginatedQuery(
    api.exports.queries.listMine,
    {},
    {initialNumItems: 20},
  );
  const blocks = usePaginatedQuery(
    api.blocks.queries.listMine,
    {},
    {initialNumItems: 30},
  );
  const ready = exportsPage.results.find((row) => row.state === 'READY');
  const files = usePaginatedQuery(
    api.exports.queries.files,
    ready === undefined ? 'skip' : {exportId: ready.id},
    {initialNumItems: 30},
  );
  const download = useCallback(
    (file: PrivacyFileRow): void => {
      if (
        token === null ||
        process.env.EXPO_PUBLIC_CONVEX_SITE_URL === undefined
      )
        return;
      setBusyRow(`file:${file.id}`);
      const destination = new File(Paths.cache, file.fileName);
      void File.downloadFileAsync(
        `${process.env.EXPO_PUBLIC_CONVEX_SITE_URL}/exports/file/${file.id}`,
        destination,
        {headers: {Authorization: `Bearer ${token}`}, idempotent: true},
      )
        .then(async (downloaded) => {
          const removeCacheFile = (): void => {
            try {
              downloaded.delete();
            } catch {
              // A share target or idempotent replacement may own it already.
            }
          };
          Alert.alert(
            t('settings.exportReadyTitle'),
            t('settings.exportReadyBody', {fileName: file.fileName}),
            [
              {
                text: t('settings.saveToFolder'),
                onPress: () => {
                  void Directory.pickDirectoryAsync()
                    .then(async (directory) => {
                      const destination = new File(directory, file.fileName);
                      await downloaded.copy(destination, {overwrite: true});
                      showNotice(
                        t('common.success'),
                        t('settings.exportSavedToFolder', {
                          folder: directory.name,
                        }),
                      );
                    })
                    .catch(() =>
                      showNotice(t('common.warning'), t('error.generic')),
                    )
                    .finally(removeCacheFile);
                },
              },
              {
                text: t('settings.shareExport'),
                onPress: () => {
                  void Sharing.isAvailableAsync()
                    .then(async (available) => {
                      if (!available) throw new Error('Sharing unavailable');
                      await Sharing.shareAsync(downloaded.uri);
                      showNotice(
                        t('common.success'),
                        t('settings.exportSharedLocationHint'),
                      );
                    })
                    .catch(() =>
                      showNotice(t('common.warning'), t('error.generic')),
                    )
                    .finally(removeCacheFile);
                },
              },
              {
                style: 'cancel',
                text: t('common.cancel'),
                onPress: removeCacheFile,
              },
            ],
          );
        })
        .catch(() => showNotice(t('common.warning'), t('error.generic')))
        .finally(() => setBusyRow(undefined));
    },
    [token],
  );
  const removeExportById = useCallback(
    (exportId: PrivacyExportRow['id']): void => {
      setBusyRow(`export:${exportId}`);
      void removeExport({exportId})
        .catch(() => showNotice(t('common.warning'), t('error.generic')))
        .finally(() => setBusyRow(undefined));
    },
    [removeExport],
  );
  const unblockUser = useCallback(
    (userId: PrivacyBlockRow['userId']): void => {
      setBusyRow(`block:${userId}`);
      void unblock({userId})
        .catch(() => showNotice(t('common.warning'), t('error.generic')))
        .finally(() => setBusyRow(undefined));
    },
    [unblock],
  );
  const renderPrivacyRow = useCallback(
    (item: PrivacyRow) => (
      <PrivacyListRow
        busy={
          item.kind === 'export'
            ? busyRow === `export:${item.dataExport.id}`
            : item.kind === 'file'
              ? busyRow === `file:${item.file.id}`
              : item.kind === 'block'
                ? busyRow === `block:${item.block.userId}`
                : false
        }
        onDownload={download}
        onRemoveExport={removeExportById}
        onUnblock={unblockUser}
        row={item}
      />
    ),
    [busyRow, download, removeExportById, unblockUser],
  );
  if (
    exportsPage.status === 'LoadingFirstPage' ||
    blocks.status === 'LoadingFirstPage' ||
    (ready !== undefined && files.status === 'LoadingFirstPage')
  )
    return (
      <SettingsListFrame>
        <ScreenSkeleton rows={6} />
      </SettingsListFrame>
    );
  const privacyChoices: readonly PrivacyRow[] = [
    {kind: 'country-analytics'},
    {
      icon: 'FileText',
      key: 'privacy',
      kind: 'action',
      onPress: () => router.navigate('/settings/legal/privacy'),
      title: t('intro.privacy'),
    },
    {
      icon: 'SlidersHorizontal',
      key: 'choices',
      kind: 'action',
      onPress: () => router.navigate('/settings/legal/choices'),
      title: t('release.privacyChoices'),
    },
    ...(ads.privacyOptionsRequired
      ? [
          {
            icon: 'MegaphoneSimple' as const,
            key: 'ad-choices',
            kind: 'action' as const,
            loading: privacyOptionsBusy,
            onPress: () => {
              setPrivacyOptionsBusy(true);
              void ads
                .showPrivacyOptions()
                .finally(() => setPrivacyOptionsBusy(false));
            },
            title: t('release.adPrivacyChoices'),
          },
        ]
      : []),
  ];
  const dataRows: readonly PrivacyRow[] = [
    {
      icon: 'DownloadSimple',
      key: 'request-export',
      kind: 'action',
      loading: requesting,
      onPress: () => {
        setRequesting(true);
        void requestPersonal({})
          .catch(() => showNotice(t('common.warning'), t('error.generic')))
          .finally(() => setRequesting(false));
      },
      title: t('release.exportMine'),
    },
    ...exportsPage.results.map((dataExport) => ({
      dataExport,
      kind: 'export' as const,
    })),
    ...files.results.map((file) => ({file, kind: 'file' as const})),
  ];
  const blockedRows: readonly PrivacyRow[] =
    blocks.results.length === 0
      ? [{kind: 'blocked-empty'}]
      : blocks.results.map((block) => ({block, kind: 'block'}));
  return (
    <SettingsSectionList<PrivacyRow>
      keyExtractor={(row) => {
        if (row.kind === 'action') return row.key;
        if (row.kind === 'export') return `export:${row.dataExport.id}`;
        if (row.kind === 'file') return `file:${row.file.id}`;
        if (row.kind === 'block') return `block:${row.block.userId}`;
        return row.kind;
      }}
      onEndReached={() => {
        if (exportsPage.status === 'CanLoadMore') exportsPage.loadMore(20);
        if (files.status === 'CanLoadMore') files.loadMore(30);
        if (blocks.status === 'CanLoadMore') blocks.loadMore(30);
      }}
      renderItem={renderPrivacyRow}
      sections={[
        {
          data: privacyChoices,
          key: 'privacy',
          title: t('settings.privacyChoicesSection'),
        },
        {
          data: dataRows,
          key: 'data',
          title: t('settings.yourDataSection'),
        },
        {
          data: blockedRows,
          key: 'blocked',
          title: t('release.blockedAccounts'),
        },
      ]}
      testID="privacy-sections"
    />
  );
}

type NotificationPreferenceKey =
  'notifyComments' | 'notifyInvites' | 'notifyLedgerActivity' | 'pushEnabled';

type NotificationSettingRow =
  | {
      readonly kind: 'toggle';
      readonly key: NotificationPreferenceKey;
      readonly icon: IconName;
      readonly title: string;
      readonly value: boolean;
    }
  | {
      readonly kind: 'action';
      readonly key: string;
      readonly icon: IconName;
      readonly loading?: boolean;
      readonly onPress: () => void;
      readonly title: string;
    };

export function NotificationSettingsScreen(): ReactElement {
  const {user} = useSession();
  const update = useMutation(api.user.mutations.updateNotificationPreferences);
  const push = usePushRegistration();
  const [saving, setSaving] = useState<NotificationPreferenceKey>();
  if (user === null)
    return (
      <SettingsListFrame>
        <ScreenSkeleton rows={5} />
      </SettingsListFrame>
    );
  const saveToggle = async (
    key: NotificationPreferenceKey,
    value: boolean,
  ): Promise<void> => {
    setSaving(key);
    try {
      await update({
        pushEnabled: key === 'pushEnabled' ? value : user.pushEnabled,
        notifyLedgerActivity:
          key === 'notifyLedgerActivity' ? value : user.notifyLedgerActivity,
        notifyComments: key === 'notifyComments' ? value : user.notifyComments,
        notifyInvites: key === 'notifyInvites' ? value : user.notifyInvites,
        ...(user.quietHoursStartMinute === null ||
        user.quietHoursEndMinute === null
          ? {}
          : {
              quietHoursStartMinute: user.quietHoursStartMinute,
              quietHoursEndMinute: user.quietHoursEndMinute,
            }),
      });
    } catch {
      showNotice(t('common.error'), t('error.generic'));
    } finally {
      setSaving(undefined);
    }
  };
  const sections: readonly {
    readonly key: string;
    readonly title?: string;
    readonly data: readonly NotificationSettingRow[];
  }[] = [
    {
      key: 'master',
      data: [
        {
          kind: 'toggle',
          key: 'pushEnabled',
          icon: 'Bell',
          title: t('settings.notificationsMaster'),
          value: user.pushEnabled,
        },
      ],
    },
    {
      key: 'events',
      title: t('settings.notifyMeAbout'),
      data: [
        {
          kind: 'toggle',
          key: 'notifyLedgerActivity',
          icon: 'Receipt',
          title: t('release.ledgerActivity'),
          value: user.notifyLedgerActivity,
        },
        {
          kind: 'toggle',
          key: 'notifyComments',
          icon: 'ChatCircleText',
          title: t('release.comments'),
          value: user.notifyComments,
        },
        {
          kind: 'toggle',
          key: 'notifyInvites',
          icon: 'UserPlus',
          title: t('release.invites'),
          value: user.notifyInvites,
        },
      ],
    },
    {
      key: 'device',
      title: t('settings.devicePermission'),
      data: [
        {
          kind: 'action',
          key: 'enable',
          icon: 'DeviceMobile',
          loading: push.enabling,
          onPress: () => void push.enable(),
          title: t('release.enableSystemNotifications'),
        },
        {
          kind: 'action',
          key: 'system-settings',
          icon: 'Gear',
          onPress: () => void Linking.openSettings(),
          title: t('permission.openSettings'),
        },
      ],
    },
  ];

  return (
    <SettingsSectionList
      keyExtractor={(row) => row.key}
      renderItem={(row) =>
        row.kind === 'toggle' ? (
          <SettingsToggleRow
            disabled={
              saving !== undefined ||
              (row.key !== 'pushEnabled' && !user.pushEnabled)
            }
            icon={row.icon}
            loading={saving === row.key}
            onChange={(value) => void saveToggle(row.key, value)}
            title={row.title}
            value={row.value}
          />
        ) : (
          <SettingsRow
            disabled={row.loading}
            icon={row.icon}
            loading={row.loading}
            onPress={row.onPress}
            title={row.title}
          />
        )
      }
      sections={sections}
      testID="notification-settings-sections"
    />
  );
}

export function DefaultCurrencyScreen(): ReactElement {
  const {user} = useSession();
  const update = useMutation(api.user.mutations.updateProfile);
  const router = useRouter();
  const [currency, setCurrency] = useState(user?.preferredCurrency ?? 'KRW');
  const [saving, setSaving] = useState(false);
  if (user === null)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  return (
    <SettingsSectionList
      footer={
        <SettingsBottomAction
          disabled={currency === user.preferredCurrency}
          loading={saving}
          onPress={() => {
            setSaving(true);
            void update({
              displayName: user.displayName,
              bio: user.bio,
              preferredCurrency: currency,
            })
              .then(() => leaveCurrentScreen(router))
              .catch(() => {
                showNotice(t('common.warning'), t('error.generic'));
                setSaving(false);
              });
          }}
          text={t('screen.save')}
        />
      }
      header={
        <View style={styles.currencyAmount}>
          <Typography.Title
            $fontWeight="bold"
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            testID="default-currency-preview"
          >
            {formatAmount({amountMinor: 12345, currency})}
          </Typography.Title>
        </View>
      }
      keyExtractor={(code) => code}
      renderItem={(code) => {
        const info = currencyInfo(code);
        return (
          <SettingsRow
            accessibilityRole="radio"
            onPress={() => setCurrency(code)}
            selected={currency === code}
            title={`${info?.symbol ?? code}  ${code}`}
            trailing={<SelectionRadio selected={currency === code} />}
          />
        );
      }}
      sections={[
        {
          data: SUPPORTED_CURRENCIES,
          key: 'currencies',
          rowsWithoutIcons: true,
          title: t('settings.allCurrencies'),
        },
      ]}
      testID="default-currency-sections"
    />
  );
}

export function ProfileEditScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const {user} = useSession();
  const update = useMutation(api.user.mutations.updateProfile);
  const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
  const claimUpload = useMutation(api.files.mutations.claimUpload);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUri, setAvatarUri] = useState(user?.avatar ?? null);
  const [avatarStorageId, setAvatarStorageId] =
    useState<Parameters<typeof update>[0]['avatarStorageId']>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (user === null)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  const checkedName = validateDisplayName(displayName);
  const pickAvatar = async (source: 'camera' | 'gallery'): Promise<void> => {
    if (avatarBusy || saving) return;
    setAvatarBusy(true);
    setFailed(false);
    try {
      const permitted =
        source === 'camera'
          ? await hasCameraAccess()
          : await hasPhotoPickerAccess();
      if (!permitted) throw new Error('Permission denied');
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.92,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [1, 1],
              mediaTypes: ['images'],
              quality: 0.92,
            });
      if (result.canceled) return;
      const prepared = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{resize: {height: 512, width: 512}}],
        {compress: 0.84, format: ImageManipulator.SaveFormat.JPEG},
      );
      const uploadUrl = await generateUploadUrl({purpose: 'AVATAR'});
      const storageId = await uploadFile(uploadUrl, prepared.uri, 'image/jpeg');
      await claimUpload({purpose: 'AVATAR', storageId, variant: 'AVATAR'});
      setAvatarUri(prepared.uri);
      setAvatarStorageId(storageId);
    } catch {
      setFailed(true);
    } finally {
      setAvatarBusy(false);
    }
  };
  return (
    <SettingsPage
      footer={
        <SettingsBottomAction
          disabled={!checkedName.ok || avatarBusy}
          helperText={
            failed
              ? t('error.generic')
              : checkedName.ok
                ? undefined
                : t('settings.displayNameRule', {
                    count: DISPLAY_NAME_MAX_LENGTH,
                  })
          }
          helperTone="error"
          loading={saving}
          onPress={() => {
            setSaving(true);
            setFailed(false);
            void update({
              displayName: checkedName.ok ? checkedName.value : displayName,
              bio: bio.trim(),
              preferredCurrency: user.preferredCurrency,
              ...(avatarStorageId === undefined ? {} : {avatarStorageId}),
            })
              .then(() => leaveCurrentScreen(router))
              .catch(() => {
                setFailed(true);
                setSaving(false);
              });
          }}
          text={t('screen.save')}
        />
      }
    >
      <SettingsSection>
        <View style={styles.profileForm}>
          <View style={styles.profileAvatarButton}>
            <CustomPressable
              accessibilityLabel={t('settings.changeProfilePhoto')}
              accessibilityRole="button"
              disabled={avatarBusy || saving}
              onPress={() => void pickAvatar('gallery')}
              style={[
                styles.profileAvatar,
                {backgroundColor: theme.role.underlay},
              ]}
              testID="profile-avatar-picker"
            >
              {avatarUri === null ? (
                <Icon color={theme.role.primary} name="User" size={42} />
              ) : (
                <Image source={avatarUri} style={styles.profileAvatarImage} />
              )}
            </CustomPressable>
            <CustomPressable
              accessibilityLabel={t('settings.takeProfilePhoto')}
              accessibilityRole="button"
              disabled={avatarBusy || saving}
              onPress={() => void pickAvatar('camera')}
              style={[
                styles.profileAvatarBadge,
                {backgroundColor: theme.role.primary},
              ]}
              testID="profile-avatar-camera"
            >
              {avatarBusy ? (
                <ActivityIndicator color={theme.text.contrast} size="small" />
              ) : (
                <Icon color={theme.text.contrast} name="Camera" size={18} />
              )}
            </CustomPressable>
          </View>
          <EditText
            decoration="boxed"
            label={t('auth.displayName')}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChangeText={setDisplayName}
            value={displayName}
          />
          <EditText
            decoration="boxed"
            label={t('auth.statusMessage')}
            maxLength={PROFILE_BIO_MAX_LENGTH}
            multiline
            onChangeText={setBio}
            value={bio}
          />
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const ContentAccordionRow = memo(function ContentAccordionRow({
  row,
}: {
  readonly row: ContentRow;
}): ReactElement {
  const {theme} = useCPK();
  const data = useMemo(
    () => [{title: row.title, items: [row.body]}],
    [row.title, row.body],
  );
  const accordionStyles = useMemo(
    () => ({
      titleContainer: [styles.contentTitle, {backgroundColor: theme.bg.basic}],
      titleText: styles.contentTitleText,
      itemText: styles.contentAnswer,
    }),
    [theme.bg.basic],
  );
  const renderTitle = useCallback(
    (title: string) => (
      <Typography.Body2 numberOfLines={2} style={styles.contentTitleText}>
        {title}
      </Typography.Body2>
    ),
    [],
  );
  const renderAnswer = useCallback(
    (body: string) => (
      <Typography.Body3 selectable style={styles.contentAnswer}>
        {body}
      </Typography.Body3>
    ),
    [],
  );
  return (
    <Accordion
      data={data}
      renderItem={renderAnswer}
      renderTitle={renderTitle}
      shouldAnimate
      style={styles.contentAccordion}
      styles={accordionStyles}
    />
  );
});

const contentKey = (row: ContentRow): string => String(row.id);
const renderContentAccordion = (row: ContentRow): ReactElement => (
  <ContentAccordionRow key={row.id} row={row} />
);

export function ContentScreen({kind}: {kind: 'NOTICE' | 'FAQ'}): ReactElement {
  const {locale} = useSession().user ?? {locale: 'ko' as const};
  const [now] = useState(() => Date.now());
  const rows = usePaginatedQuery(
    api.content.queries.list,
    {kind, locale, now},
    {initialNumItems: 30},
  );
  const {loadMore, results, status} = rows;
  const countBeforeLoad = useRef<number | null>(null);
  const loadNextVisiblePage = useCallback((): void => {
    if (status !== 'CanLoadMore' || countBeforeLoad.current !== null) return;
    countBeforeLoad.current = results.length;
    loadMore(50);
  }, [loadMore, results.length, status]);
  useEffect(() => {
    if (status === 'LoadingFirstPage' || status === 'Exhausted') {
      countBeforeLoad.current = null;
      return;
    }
    if (status !== 'CanLoadMore') return;
    if (countBeforeLoad.current === null) {
      if (results.length === 0) loadNextVisiblePage();
      return;
    }
    if (results.length !== countBeforeLoad.current) {
      countBeforeLoad.current = null;
      return;
    }
    // Visibility is filtered after the indexed page scan. Advance only a
    // requested page with no visible additions; do not prefetch the list.
    loadMore(50);
  }, [loadMore, loadNextVisiblePage, results.length, status]);
  if (
    status === 'LoadingFirstPage' ||
    (results.length === 0 && status !== 'Exhausted')
  )
    return (
      <SettingsListFrame>
        <ScreenSkeleton rows={6} />
      </SettingsListFrame>
    );
  const faq = kind === 'FAQ';
  return (
    <SettingsSectionList<ContentRow>
      fullWidth
      empty={
        <View style={styles.contentEmpty}>
          <SettingsStatus
            icon={faq ? 'BookOpenText' : 'BellSimpleSlash'}
            title={
              faq
                ? t('settings.faqEmptyTitle')
                : t('settings.announcementsEmptyTitle')
            }
          />
        </View>
      }
      keyExtractor={contentKey}
      listFooter={
        status === 'LoadingMore' ? (
          <BookooLoading variant="inline" />
        ) : undefined
      }
      onEndReached={loadNextVisiblePage}
      renderItem={renderContentAccordion}
      sections={[
        {
          data: rows.results,
          key: kind,
        },
      ]}
      testID={faq ? 'faq-sections' : 'announcement-sections'}
    />
  );
}

export function NotificationInboxScreen(): ReactElement {
  const router = useRouter();
  const {locale} = useLocale();
  const rows = usePaginatedQuery(
    api.notifications.queries.list,
    {},
    {initialNumItems: 20},
  );
  const markRead = useMutation(api.notifications.mutations.markRead);
  const markAll = useMutation(api.notifications.mutations.markAllRead);
  const openNotification = useCallback(
    (item: NotificationRow): void => {
      void markRead({notificationId: item.id});
      if (item.kind === 'LEDGER_INVITE') {
        const inviteId = item.params.inviteId;
        if (typeof inviteId === 'string' && inviteId.length > 0) {
          router.navigate({
            pathname: '/invites/[inviteId]',
            params: {inviteId},
          });
        } else {
          router.navigate('/invites');
        }
        return;
      }
      navigateToNotification(router, {
        kind: item.kind,
        ...(item.ledgerId === null ? {} : {ledgerId: String(item.ledgerId)}),
        ...(item.itemId === null ? {} : {itemId: String(item.itemId)}),
      });
    },
    [markRead, router],
  );
  const renderItem = useCallback(
    ({item}: {item: NotificationRow}) => (
      <NotificationInboxRow
        item={item}
        locale={locale}
        onOpen={openNotification}
      />
    ),
    [locale, openNotification],
  );
  if (rows.status === 'LoadingFirstPage')
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={rows.results}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.inboxActions}>
            <Button
              onPress={() => router.navigate('/invites')}
              testID="notification-received-invites"
              text={t('member.receivedInvites')}
              type="outlined"
            />
            <Button
              onPress={() => void markAll({})}
              text={t('release.markAllRead')}
              type="outlined"
            />
          </View>
        }
        ListEmptyComponent={
          <ScreenState compact title={t('release.noContent')} />
        }
        onEndReached={() => {
          if (rows.status === 'CanLoadMore') rows.loadMore(20);
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderItem}
      />
    </AppScreen>
  );
}

export function OpsScreen(): ReactElement {
  const {user} = useSession();
  const config = useQuery(api.app.queries.config);
  const updateConfig = useMutation(api.app.mutations.upsertConfig);
  const reports = usePaginatedQuery(
    api.reports.queries.open,
    user?.appRole === 'ADMIN' ? {} : 'skip',
    {initialNumItems: 30},
  );
  const reviewingReports = usePaginatedQuery(
    api.reports.queries.reviewing,
    user?.appRole === 'ADMIN' ? {} : 'skip',
    {initialNumItems: 30},
  );
  const acknowledge = useMutation(api.reports.mutations.acknowledge);
  const resolve = useMutation(api.reports.mutations.resolve);
  const queue = useMemo(
    () => [...reports.results, ...reviewingReports.results],
    [reports.results, reviewingReports.results],
  );
  const acknowledgeReport = useCallback(
    (reportId: ReportRow['id']): void => {
      void acknowledge({reportId});
    },
    [acknowledge],
  );
  const resolveReport = useCallback(
    (reportId: ReportRow['id'], resolution: ReportResolution): void => {
      void resolve({reportId, resolution});
    },
    [resolve],
  );
  const renderReport = useCallback(
    ({item}: {item: ReportRow}) => (
      <OpsReportRow
        onAcknowledge={acknowledgeReport}
        onResolve={resolveReport}
        report={item}
      />
    ),
    [acknowledgeReport, resolveReport],
  );
  if (user?.appRole !== 'ADMIN')
    return (
      <SettingsPage>
        <SettingsHero
          body={t('settings.operationsDescription')}
          icon="ShieldWarning"
          title={t('release.operations')}
        />
        <SettingsSection>
          <SettingsStatus
            body={t('settings.operationsDeniedBody')}
            icon="LockKey"
            title={t('settings.operationsDeniedTitle')}
          />
        </SettingsSection>
      </SettingsPage>
    );
  if (config === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  if (
    reports.status === 'LoadingFirstPage' ||
    reviewingReports.status === 'LoadingFirstPage'
  )
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={queue}
        keyExtractor={(report) => String(report.id)}
        ListHeaderComponent={
          <FormFrame>
            <Typography.Heading3 $fontWeight="bold">
              {t('release.operations')}
            </Typography.Heading3>
            {config === null ? (
              <Typography.Body3>{t('release.configMissing')}</Typography.Body3>
            ) : (
              <Button
                onPress={() =>
                  void updateConfig({
                    ...config,
                    maintenanceMode: !config.maintenanceMode,
                    maintenanceMessageKey:
                      config.maintenanceMessageKey ?? undefined,
                  })
                }
                text={`${config.maintenanceMode ? '✓' : '○'} ${t('release.maintenanceTitle')}`}
                type="outlined"
              />
            )}
          </FormFrame>
        }
        ListEmptyComponent={
          <ScreenState compact title={t('release.noContent')} />
        }
        onEndReached={() => {
          if (reports.status === 'CanLoadMore') reports.loadMore(30);
          if (reviewingReports.status === 'CanLoadMore')
            reviewingReports.loadMore(30);
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderReport}
      />
    </AppScreen>
  );
}

export function DiagnosticsScreen(): ReactElement {
  const {theme} = useCPK();
  const [rows, setRows] = useState(() => diagnosticSnapshot());
  const bundle = {
    schemaVersion: 1,
    appVersion,
    build: Constants.nativeBuildVersion ?? 'unknown',
    platform: Platform.OS,
    osMajor: String(Platform.Version).split('.')[0] ?? 'unknown',
    updateIdPrefix: Updates.updateId?.slice(0, 8) ?? null,
    updatesEnabled: Updates.isEnabled,
    rows,
  } as const;
  return (
    <SettingsPage>
      <SettingsHero
        body={t('settings.diagnosticsPageDescription')}
        icon="Stethoscope"
        title={t('release.diagnostics')}
      />
      <SettingsSection>
        <SettingsStatus
          body={t('release.diagnosticsBody')}
          icon="ShieldCheck"
          title={t('settings.diagnosticsPrivateTitle')}
          tone="success"
        />
      </SettingsSection>
      <SettingsSection title={t('settings.diagnosticsActions')}>
        <SettingsRow
          icon="ArrowClockwise"
          onPress={() => setRows(diagnosticSnapshot())}
          title={t('settings.diagnosticsRefresh')}
        />
        <SettingsDivider />
        <SettingsRow
          detail={t('settings.diagnosticsCopyDescription')}
          icon="Copy"
          onPress={() =>
            Alert.alert(
              t('release.copyDiagnostics'),
              t('release.copyDiagnosticsWarning'),
              [
                {style: 'cancel', text: t('common.cancel')},
                {
                  text: t('release.copyDiagnostics'),
                  onPress: () =>
                    void Clipboard.setStringAsync(
                      JSON.stringify(bundle, null, 2),
                    ),
                },
              ],
            )
          }
          title={t('release.copyDiagnostics')}
        />
      </SettingsSection>
      <View style={styles.diagnosticHeading}>
        <Typography.Heading4 $fontWeight="bold">
          {t('settings.recentDiagnostics')}
        </Typography.Heading4>
        <Typography.Body4 style={{color: theme.text.placeholder}}>
          {rows.length}
        </Typography.Body4>
      </View>
      {rows.length === 0 ? (
        <SettingsSection>
          <SettingsStatus
            body={t('settings.diagnosticsEmptyBody')}
            icon="CheckCircle"
            title={t('settings.diagnosticsEmptyTitle')}
            tone="success"
          />
        </SettingsSection>
      ) : (
        rows.slice(0, 12).map((row, index) => (
          <View
            key={`${row.at}-${index}`}
            style={[
              styles.diagnosticCard,
              {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
            ]}
          >
            <View style={styles.diagnosticMeta}>
              <View
                style={[
                  styles.diagnosticDot,
                  {backgroundColor: theme.role.success},
                ]}
              />
              <Typography.Body4 style={{color: theme.text.label}}>
                {formatDate(row.at, 'PPP p')}
              </Typography.Body4>
            </View>
            <Typography.Body3>{JSON.stringify(row.event)}</Typography.Body3>
          </View>
        ))
      )}
      {rows.length <= 12 ? null : (
        <Typography.Body4
          style={[styles.diagnosticLimit, {color: theme.text.placeholder}]}
        >
          {t('settings.diagnosticsLatestOnly', {count: 12})}
        </Typography.Body4>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  inboxActions: {gap: 8},
  card: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 12,
  },
  currencyAmount: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 132,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  diagnosticCard: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 9,
    padding: 14,
  },
  diagnosticDot: {borderRadius: 999, height: 8, width: 8},
  diagnosticHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  diagnosticLimit: {paddingHorizontal: 10, textAlign: 'center'},
  diagnosticMeta: {alignItems: 'center', flexDirection: 'row', gap: 7},
  contentEmpty: {paddingTop: 16},
  contentAccordion: {alignSelf: 'stretch', width: '100%'},
  contentTitle: {
    height: 'auto',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  contentTitleText: {flex: 1, flexShrink: 1, lineHeight: 24},
  contentAnswer: {flexShrink: 1, lineHeight: 24, width: '100%'},
  flex: {flex: 1},
  linkRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  listContent: {padding: 16},
  notificationCopy: {flex: 1, gap: 2},
  notificationDot: {borderRadius: 4, height: 8, marginTop: 7, width: 8},
  notificationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
  },
  profileForm: {gap: 14, padding: 14},
  profileAvatar: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    position: 'relative',
    width: 100,
  },
  profileAvatarBadge: {
    alignItems: 'center',
    borderRadius: 18,
    bottom: 0,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 36,
  },
  profileAvatarButton: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 100,
    justifyContent: 'center',
    marginVertical: 4,
    position: 'relative',
    width: 100,
  },
  profileAvatarImage: {borderRadius: 50, height: 100, width: 100},
  row: {alignItems: 'center', flexDirection: 'row', gap: 8},
  settingsListHeader: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 680,
    paddingHorizontal: 16,
    paddingTop: 12,
    width: '100%',
  },
});
