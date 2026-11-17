import type {ReactElement} from 'react';
import {Stack} from 'expo-router';
import {useCPK} from 'cpk-ui';

import {
  ENTRY_CATEGORY_CREATE_SHEET_OPTIONS,
  ENTRY_CATEGORY_SHEET_OPTIONS,
} from '~/features/ledger/entryCategoryNavigation';
import {useLocale} from '~/hooks/useLocale';
import {t} from '~/utils/i18n';

// The index only redirects into the tabs, and both sit under the same loading
// surface, so the hop between them must not animate: a slide there read as one
// loading screen replacing another.
export const APP_INDEX_OPTIONS = {
  animation: 'none',
  headerShown: false,
} as const;
export const APP_TABS_OPTIONS = {
  animation: 'none',
  headerShown: false,
} as const;
export const APP_STACK_BACK_OPTIONS = {
  headerBackButtonDisplayMode: 'minimal',
} as const;
export const ENTRY_PAGE_OPTIONS = {
  animation: 'slide_from_right',
  headerShown: false,
  presentation: 'card',
} as const;
export const LEDGER_NEW_OPTIONS = {
  animation: 'slide_from_right',
  headerShown: false,
  presentation: 'card',
} as const;
export default function AppLayout(): ReactElement {
  const {theme} = useCPK();
  useLocale();
  return (
    <Stack
      screenOptions={{
        ...APP_STACK_BACK_OPTIONS,
        contentStyle: {backgroundColor: theme.bg.paper},
        headerBackTitle: t('a11y.back'),
        headerStyle: {backgroundColor: theme.bg.basic},
        headerTintColor: theme.text.basic,
        headerTitleStyle: {color: theme.text.basic, fontWeight: 'bold'},
      }}
    >
      <Stack.Screen
        dangerouslySingular
        name="index"
        options={APP_INDEX_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="(tabs)"
        options={APP_TABS_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/[itemId]/index"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="ledger/[ledgerId]"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/new"
        options={ENTRY_PAGE_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/[itemId]/edit"
        options={ENTRY_PAGE_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/category/index"
        options={ENTRY_CATEGORY_SHEET_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/category/new"
        options={ENTRY_CATEGORY_CREATE_SHEET_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="entry/location"
        options={ENTRY_PAGE_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="ledgers/index"
        options={{title: t('screen.allLedgers')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="ledgers/new"
        options={LEDGER_NEW_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="notifications"
        options={{title: t('settings.notifications')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="invites/index"
        options={{title: t('member.receivedInvites')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="invites/[inviteId]"
        options={{title: t('common.invite')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="profile/me"
        options={{title: t('settings.profileSection')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="profile/handle"
        options={{presentation: 'modal', title: t('auth.usernameHeading')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="profile/edit"
        options={{presentation: 'modal', title: t('settings.profileEdit')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="search"
        options={{title: t('common.searchPlaceholder')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/index"
        options={{title: t('settings.appSettings')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/about"
        options={{title: t('screen.about')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/account"
        options={{title: t('settings.account')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/announcements"
        options={{title: t('settings.announcements')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/appearance"
        options={{title: t('settings.theme')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/default-currency"
        options={{title: t('settings.currency')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/diagnostics"
        options={{title: t('release.diagnostics')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/faq"
        options={{title: t('settings.faq')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/language"
        options={{title: t('settings.language')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/legal/[document]"
        options={{title: t('settings.legalSection')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/lock"
        options={{title: t('settings.lock')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/notifications"
        options={{title: t('settings.notifications')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/ops"
        options={{title: t('release.operations')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings/privacy"
        options={{title: t('release.privacyTitle')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="pro"
        options={{title: t('subscription.proTitle')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="stats/category/[categoryKey]"
        options={{title: t('tabs.graph')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="photo/[itemId]"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'fade',
        }}
      />
      <Stack.Screen
        dangerouslySingular
        name="place/view"
        options={{presentation: 'modal', title: t('release.place')}}
      />
    </Stack>
  );
}
