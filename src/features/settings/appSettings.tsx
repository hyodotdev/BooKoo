import type {ReactElement} from 'react';
import {useRouter} from 'expo-router';
import type {IconName} from 'cpk-ui';

import {useLocale} from '~/hooks/useLocale';
import {t} from '~/utils/i18n';
import {SettingsRow, SettingsSectionList} from './ui';

export interface AppSettingsRow {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

export interface AppSettingsSection {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly AppSettingsRow[];
}

export interface AppSettingsScreenProps {
  readonly sections: readonly AppSettingsSection[];
}

type AppSettingsPath =
  | '/settings/account'
  | '/settings/announcements'
  | '/settings/about'
  | '/settings/appearance'
  | '/settings/default-currency'
  | '/settings/faq'
  | '/settings/language'
  | '/settings/legal/support'
  | '/settings/lock'
  | '/settings/notifications'
  | '/settings/privacy';

export function createAppSettingsSections({
  navigate,
}: {
  readonly navigate: (path: AppSettingsPath) => void;
}): readonly AppSettingsSection[] {
  return [
    {
      key: 'preferences',
      title: t('settings.preferencesSection'),
      rows: [
        {
          key: 'appearance',
          label: t('settings.theme'),
          icon: 'PaintBrush',
          onPress: () => navigate('/settings/appearance'),
        },
        {
          key: 'notifications',
          label: t('settings.notifications'),
          icon: 'Bell',
          onPress: () => navigate('/settings/notifications'),
        },
        {
          key: 'lock',
          label: t('settings.lock'),
          icon: 'Lock',
          onPress: () => navigate('/settings/lock'),
        },
        {
          key: 'language',
          label: t('settings.language'),
          icon: 'Translate',
          onPress: () => navigate('/settings/language'),
        },
        {
          key: 'currency',
          label: t('settings.currency'),
          icon: 'CurrencyCircleDollar',
          onPress: () => navigate('/settings/default-currency'),
        },
      ],
    },
    {
      key: 'account',
      title: t('settings.account'),
      rows: [
        {
          key: 'account',
          label: t('settings.account'),
          icon: 'UserGear',
          onPress: () => navigate('/settings/account'),
        },
      ],
    },
    {
      key: 'information',
      title: t('ledgerItem.information'),
      rows: [
        {
          key: 'announcements',
          label: t('settings.announcements'),
          icon: 'Newspaper',
          onPress: () => navigate('/settings/announcements'),
        },
        {
          key: 'faq',
          label: t('settings.faq'),
          icon: 'Question',
          onPress: () => navigate('/settings/faq'),
        },
        {
          key: 'support',
          label: t('release.support'),
          icon: 'ChatCircleText',
          onPress: () => navigate('/settings/legal/support'),
        },
        {
          key: 'privacy',
          label: t('release.privacyTitle'),
          icon: 'ShieldCheck',
          onPress: () => navigate('/settings/privacy'),
        },
        {
          key: 'about',
          label: t('screen.about'),
          icon: 'Info',
          onPress: () => navigate('/settings/about'),
        },
      ],
    },
  ];
}

export function AppSettingsScreen({
  sections,
}: AppSettingsScreenProps): ReactElement {
  return (
    <SettingsSectionList
      keyExtractor={(row) => row.key}
      renderItem={(row) => (
        <SettingsRow
          accessibilityLabel={row.label}
          disabled={row.disabled}
          icon={row.icon}
          onPress={row.onPress}
          title={row.label}
        />
      )}
      sections={sections.map((section) => ({
        data: section.rows,
        key: section.key,
        title: section.title,
      }))}
      testID="app-settings-sections"
    />
  );
}

export function AppSettingsRoute(): ReactElement {
  useLocale();
  const router = useRouter();
  const sections = createAppSettingsSections({
    navigate: (path) => router.navigate(path),
  });

  return <AppSettingsScreen sections={sections} />;
}
