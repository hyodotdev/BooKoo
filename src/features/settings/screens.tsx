import type {ReactElement} from 'react';
import {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Image} from 'expo-image';
import {useRouter} from 'expo-router';
import {
  Card,
  EditText,
  Icon,
  SelectionFeedback,
  Typography,
  useCPK,
  type IconName,
} from 'cpk-ui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {api} from '@convex/_generated/api';
import {appVersion} from '../../../config';
import type {SupportedLocale} from '@shared/locales';
import {validateHandle} from '@shared/username';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {useDebouncedValue} from '~/hooks/useDebouncedValue';
import {useLocale} from '~/hooks/useLocale';
import {useSession} from '~/features/auth/session';
import {AppScreen, ScreenSkeleton, ScreenState} from '~/features/ledger/ui';
import {showNotice} from '~/utils/alert';
import {t} from '~/utils/i18n';
import {afterNavigationSettles, leaveCurrentScreen} from '~/utils/navigation';
import {useSessionSignOut} from '~/features/auth/signOut';
import {releaseSocialSessions} from '~/features/auth/social';
import {
  Storage,
  THEME_PREFERENCES,
  storage,
  type ThemePreference,
} from '~/utils/storage';
import {
  SettingsActionRow,
  SettingsBottomAction,
  SettingsHero,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsSectionList,
  type SettingsListSection,
} from './ui';

export function AppearanceScreen(): ReactElement {
  const {changeThemeType, theme} = useCPK();
  const saved = storage.getString(Storage.ThemeType);
  const selected: ThemePreference =
    saved === 'light' || saved === 'dark' ? saved : 'system';
  const setPreference = (preference: ThemePreference): void => {
    storage.set(Storage.ThemeType, preference);
    changeThemeType(preference === 'system' ? undefined : preference);
  };
  return (
    <SettingsSectionList
      header={
        <Card
          backgroundColor={theme.bg.basic}
          borderRadius={24}
          elevation={0}
          padding={24}
          styles={{content: styles.appearanceIdentity}}
        >
          <View style={styles.appearanceCopy}>
            <Typography.Heading3 $fontWeight="bold">BooKoo</Typography.Heading3>
            <Typography.Body3 style={{color: theme.text.label}}>
              {selected === 'system'
                ? t('settings.themeSystem')
                : selected === 'dark'
                  ? t('settings.themeDark')
                  : t('settings.themeLight')}
            </Typography.Body3>
          </View>
          <SelectionFeedback selection={selected}>
            <Icon
              name={
                selected === 'system'
                  ? 'DeviceMobile'
                  : selected === 'dark'
                    ? 'Moon'
                    : 'Sun'
              }
              color={theme.role.primary}
              size={36}
            />
          </SelectionFeedback>
        </Card>
      }
      keyExtractor={(preference) => preference}
      renderItem={(preference) => (
        <SettingsRow
          accessibilityRole="radio"
          icon={
            preference === 'system'
              ? 'DeviceMobile'
              : preference === 'dark'
                ? 'Moon'
                : 'Sun'
          }
          onPress={() => setPreference(preference)}
          selected={selected === preference}
          title={
            preference === 'system'
              ? t('settings.themeSystem')
              : preference === 'dark'
                ? t('settings.themeDark')
                : t('settings.themeLight')
          }
        />
      )}
      sections={[
        {
          data: THEME_PREFERENCES,
          key: 'theme',
          title: t('settings.themeChoose'),
        },
      ]}
      testID="appearance-sections"
    />
  );
}

export function LanguageScreen(): ReactElement {
  const router = useRouter();
  const localeState = useLocale();
  const update = useMutation(api.user.mutations.setLocale);
  const [selected, setSelected] = useState(localeState.locale);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  type LanguageRow =
    | {readonly key: SupportedLocale; readonly kind: 'locale'}
    | {readonly key: 'device'; readonly kind: 'device'};
  const sections: readonly SettingsListSection<LanguageRow>[] = [
    {
      data: localeState.supportedLocales.map((locale) => ({
        key: locale,
        kind: 'locale' as const,
      })),
      key: 'languages',
      rowsWithoutIcons: true,
      title: t('settings.language'),
    },
    {
      data: [{key: 'device', kind: 'device'}],
      key: 'device',
    },
  ];
  return (
    <SettingsSectionList
      footer={
        <SettingsBottomAction
          helperText={failed ? t('error.generic') : undefined}
          helperTone="error"
          loading={saving}
          onPress={() => {
            if (saving) return;
            setSaving(true);
            setFailed(false);
            void update({locale: selected})
              .then(() => leaveCurrentScreen(router))
              .then(() => {
                afterNavigationSettles(() => {
                  localeState.setLocale(selected);
                });
              })
              .catch(() => {
                setFailed(true);
                setSaving(false);
              });
          }}
          text={t('screen.save')}
        />
      }
      keyExtractor={(row) => `${row.kind}:${row.key}`}
      renderItem={(row) =>
        row.kind === 'locale' ? (
          <SettingsRow
            accessibilityRole="radio"
            onPress={() => setSelected(row.key)}
            selected={selected === row.key}
            title={localeState.localeLabels[row.key]}
          />
        ) : (
          <SettingsRow
            icon="DeviceMobile"
            onPress={() => {
              void leaveCurrentScreen(router).then(() => {
                afterNavigationSettles(() => {
                  localeState.resetToDeviceLocale();
                });
              });
            }}
            title={t('screen.followDevice')}
          />
        )
      }
      sections={sections}
      testID="language-sections"
    />
  );
}

export function AccountScreen(): ReactElement {
  const dialog = useBookooAlertDialog();
  const router = useRouter();
  const sessionExit = useSessionSignOut();
  const {user} = useSession();
  const {theme} = useCPK();
  const {bottom} = useSafeAreaInsets();
  const accounts = useQuery(api.user.queries.linkedAccounts);
  const emails = useQuery(api.user.queries.myEmails);
  const requestDeletion = useMutation(
    api.user.mutations.requestAccountDeletion,
  );
  const [deleteStep, setDeleteStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const leave = (): void => {
    void sessionExit.signOut();
  };
  const confirmSignOut = (): void => {
    dialog.confirm({
      body: t('release.signOutConfirm'),
      confirmText: t('auth.logout'),
      icon: 'SignOut',
      onConfirm: leave,
      title: t('auth.logout'),
      tone: 'danger',
    });
  };
  const deleteAccount = async (): Promise<void> => {
    if (user === null) return;
    await requestDeletion({});
    await Promise.allSettled([
      Image.clearMemoryCache(),
      Image.clearDiskCache(),
      releaseSocialSessions('unlink'),
    ]);
  };
  if (accounts === undefined || emails === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={5} />
      </AppScreen>
    );
  if (deleteStep)
    return (
      <SettingsPage
        footer={
          <SettingsBottomAction
            color="danger"
            loading={deleting}
            onPress={() => {
              setDeleting(true);
              void deleteAccount()
                .catch(() =>
                  showNotice(t('common.warning'), t('error.generic')),
                )
                .finally(() => setDeleting(false));
            }}
            text={t('settings.deleteAccountStart')}
          />
        }
      >
        <SettingsHero
          body={t('settings.deleteAccountBody')}
          icon="UserMinus"
          showTitle
          title={t('settings.deleteAccount')}
        />
        <SettingsSection>
          <SettingsRow
            icon="Question"
            onPress={() => router.navigate('/settings/legal/deletion')}
            title={t('release.accountDeletionHelp')}
          />
        </SettingsSection>
        <SettingsSection>
          <SettingsActionRow
            disabled={deleting}
            onPress={() => setDeleteStep(false)}
            title={t('common.cancel')}
            tone="primary"
          />
        </SettingsSection>
      </SettingsPage>
    );

  type AccountRow = {
    readonly detail?: string;
    readonly icon: IconName;
    readonly key: string;
    readonly primary: boolean;
    readonly title: string;
  };
  const identities: readonly AccountRow[] = [
    ...accounts
      .filter((account) => account.method.toLowerCase() !== 'email')
      .map((account) => ({
        detail: account.label ?? undefined,
        icon: 'ShieldCheck' as const,
        key: `method:${account.method}`,
        primary: true,
        title: account.method,
      })),
    ...emails.map((email) => ({
      detail: email.isPrimary ? t('settings.primaryEmail') : undefined,
      icon: 'Envelope' as const,
      key: `email:${email.id}`,
      primary: email.isPrimary,
      title: email.email,
    })),
  ];
  const sections: readonly SettingsListSection<AccountRow>[] = [
    {
      data: identities,
      key: 'methods',
      title: t('settings.signInMethods'),
    },
  ];

  return (
    <SettingsSectionList<AccountRow>
      footer={
        <View
          style={[
            styles.accountLeaveAction,
            {
              backgroundColor: theme.bg.paper,
              paddingBottom: Math.max(16, bottom + 12),
            },
          ]}
          testID="account-leave-footer"
        >
          <BookooButton
            borderRadius={16}
            color="danger"
            disabled={sessionExit.leaving}
            onPress={() => setDeleteStep(true)}
            size="large"
            style={styles.accountLeaveButton}
            text={t('settings.deleteAccount')}
            type="text"
          />
        </View>
      }
      keyExtractor={(row) => row.key}
      listFooter={
        <View style={styles.accountSignOut} testID="account-sign-out">
          <BookooButton
            borderRadius={16}
            loading={sessionExit.leaving}
            onPress={confirmSignOut}
            size="large"
            text={t('auth.logout')}
            type="outlined"
          />
        </View>
      }
      renderItem={(row) => (
        <SettingsRow
          detail={row.detail}
          icon={row.icon}
          title={row.title}
          trailing={
            row.primary ? (
              <Icon
                color={theme.role.success}
                name="CheckCircleFill"
                size={22}
              />
            ) : undefined
          }
        />
      )}
      sections={sections}
      testID="account-sections"
    />
  );
}

export function AboutScreen(): ReactElement {
  const {theme} = useCPK();

  return (
    <SettingsSectionList<never>
      header={
        <View style={styles.aboutHeader}>
          <Image
            contentFit="contain"
            source={require('../../../assets/icon.png')}
            style={styles.aboutLogo}
          />
          <Typography.Body3 style={{color: theme.text.placeholder}}>
            {t('common.version')} {appVersion}
          </Typography.Body3>
        </View>
      }
      keyExtractor={(row) => row}
      renderItem={(row) => row}
      sections={[]}
      testID="about-sections"
    />
  );
}

export const HANDLE_AVAILABILITY_DEBOUNCE_MS = 800;

export function HandleSettingsScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const {user} = useSession();
  const [handle, setHandle] = useState(user?.handle ?? '');
  const debouncedHandle = useDebouncedValue(
    handle,
    HANDLE_AVAILABILITY_DEBOUNCE_MS,
  );
  const settled = handle === debouncedHandle;
  const [now] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid = useMemo(() => validateHandle(handle), [handle]);
  const debouncedValid = useMemo(
    () => validateHandle(debouncedHandle),
    [debouncedHandle],
  );
  const isCurrentHandle =
    debouncedValid.ok && debouncedValid.key === user?.handle;
  const availability = useQuery(
    api.user.queries.checkHandleAvailability,
    !settled || !debouncedValid.ok || isCurrentHandle
      ? 'skip'
      : {handle: debouncedHandle, now},
  );
  const change = useMutation(api.user.mutations.changeHandle);
  const helper = ((): 'available' | 'taken' | null => {
    if (!settled) return null;
    if (
      !debouncedValid.ok ||
      availability?.status === 'TAKEN' ||
      availability?.status === 'RESERVED' ||
      availability?.status === 'COOLDOWN' ||
      availability?.status === 'INVALID'
    )
      return 'taken';
    // Your own unchanged ID is not "available"; it simply needs no notice.
    if (isCurrentHandle) return null;
    if (availability?.status === 'AVAILABLE') return 'available';
    return null;
  })();
  if (user === null)
    return (
      <AppScreen>
        <ScreenState icon="User" title={t('error.notFound')} />
      </AppScreen>
    );
  return (
    <SettingsPage
      footer={
        <SettingsBottomAction
          disabled={
            handle.trim().length === 0 ||
            !settled ||
            !valid.ok ||
            handle === user.handle ||
            availability?.status === 'TAKEN' ||
            availability?.status === 'RESERVED' ||
            availability?.status === 'COOLDOWN'
          }
          helperText={failed ? t('error.generic') : undefined}
          helperTone="error"
          loading={saving}
          onPress={() => {
            if (saving) return;
            void (async () => {
              if (!valid.ok) return;
              setSaving(true);
              setFailed(false);
              try {
                await change({handle});
                await leaveCurrentScreen(router);
              } catch {
                setFailed(true);
                setSaving(false);
              }
            })();
          }}
          text={t('common.update')}
        />
      }
    >
      <SettingsSection>
        <View style={styles.formContent}>
          <EditText
            autoCapitalize="none"
            decoration="boxed"
            hideCounter
            label={t('auth.usernameTitle')}
            maxLength={20}
            onChangeText={setHandle}
            value={handle}
          />
          {helper === 'taken' ? (
            <Typography.Body3 style={{color: theme.text.validation}}>
              {t('auth.usernameTaken')}
            </Typography.Body3>
          ) : helper === 'available' ? (
            <Typography.Body3 style={{color: theme.role.success}}>
              {t('auth.usernameAvailable')}
            </Typography.Body3>
          ) : null}
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  accountLeaveAction: {
    alignSelf: 'center',
    maxWidth: 712,
    paddingHorizontal: 16,
    paddingTop: 8,
    width: '100%',
  },
  accountLeaveButton: {alignSelf: 'center'},
  accountSignOut: {paddingTop: 16},
  aboutHeader: {alignItems: 'center', gap: 12, paddingVertical: 32},
  aboutLogo: {borderRadius: 24, height: 96, width: 96},
  formContent: {gap: 10, padding: 14},
  appearanceIdentity: {alignItems: 'center', flexDirection: 'row', gap: 20},
  appearanceCopy: {flex: 1, gap: 8},
});
