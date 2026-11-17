import type {ReactElement} from 'react';
import {useEffect, useRef} from 'react';
import {StyleSheet} from 'react-native';
import {Stack, useLocalSearchParams, usePathname, useRouter} from 'expo-router';
import {useQuery} from 'convex-helpers/react/cache';
import {CustomPressable, Icon, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {
  ENTRY_CATEGORY_CREATE_SHEET_OPTIONS,
  ENTRY_CATEGORY_SHEET_OPTIONS,
} from '~/features/ledger/entryCategoryNavigation';
import type {LedgerRow} from '~/features/ledger/types';
import {AppScreen, ScreenSkeleton} from '~/features/ledger/ui';
import {t} from '~/utils/i18n';

const ADMIN_ROUTES = new Set(['audit', 'invites', 'requests', 'timezone']);
const OWNER_ROUTES = new Set(['currency', 'danger']);

export function canOpenLedgerRoute(
  pathname: string,
  role: LedgerRow['role'],
): boolean {
  const leaf = pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (OWNER_ROUTES.has(leaf)) return role === 'OWNER';
  if (ADMIN_ROUTES.has(leaf)) return role === 'OWNER' || role === 'ADMIN';
  return true;
}

export function LedgerAdminBackButton(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();

  const goBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };

  return (
    <CustomPressable
      accessibilityLabel={t('a11y.back')}
      accessibilityRole="button"
      hitSlop={8}
      onPress={goBack}
      style={styles.backButton}
      testID="ledger-admin-back"
    >
      <Icon color={theme.text.basic} name="CaretLeft" size={24} />
    </CustomPressable>
  );
}

export default function LedgerAdminLayout(): ReactElement {
  const {ledgerId: ledgerIdParam} = useLocalSearchParams<{
    ledgerId?: string | string[];
  }>();
  const ledgerId = Array.isArray(ledgerIdParam)
    ? (ledgerIdParam[0] ?? '')
    : (ledgerIdParam ?? '');
  const pathname = usePathname();
  const router = useRouter();
  const {theme} = useCPK();
  const handledRoute = useRef<string | null>(null);
  const ledger = useQuery(
    api.ledgers.queries.getMineByRoute,
    ledgerId.length === 0 ? 'skip' : {ledgerId},
  );
  const routeKey = `${ledgerId}:${pathname}`;
  const denied =
    ledgerId.length === 0 ||
    ledger === null ||
    (ledger !== undefined && !canOpenLedgerRoute(pathname, ledger.role));

  useEffect(() => {
    if (!denied || handledRoute.current === routeKey) return;
    handledRoute.current = routeKey;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)');
  }, [denied, routeKey, router]);

  useEffect(() => {
    if (!denied) handledRoute.current = null;
  }, [denied]);

  // Never mount a nested screen until membership and route-level privileges
  // are confirmed. Several nested queries are intentionally admin-only; if a
  // stale deep link mounts them first, Convex correctly rejects the request
  // but the rejection would otherwise escape into the global error boundary.
  if (ledger === undefined || denied)
    return (
      <AppScreen>
        <ScreenSkeleton rows={1} />
      </AppScreen>
    );

  return (
    <Stack
      screenOptions={{
        contentStyle: {backgroundColor: theme.bg.paper},
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: t('a11y.back'),
        headerLeft: () => <LedgerAdminBackButton />,
        headerStyle: {backgroundColor: theme.bg.basic},
        headerTintColor: theme.text.basic,
        headerTitleStyle: {color: theme.text.basic, fontWeight: 'bold'},
      }}
    >
      <Stack.Screen
        dangerouslySingular
        name="index"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/new"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/location"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/category/index"
        options={ENTRY_CATEGORY_SHEET_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/category/new"
        options={ENTRY_CATEGORY_CREATE_SHEET_OPTIONS}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/[itemId]/index"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="item/[itemId]/edit"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="settings"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        dangerouslySingular
        name="details"
        options={{headerShown: false}}
      />
      <Stack.Screen
        dangerouslySingular
        name="members"
        options={{title: t('settings.members')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="photos"
        options={{title: t('settings.ledgerPhotos')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="invites"
        options={{title: t('settings.inviteLinks')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="categories"
        options={{title: t('settings.ledgerCategories')}}
      />
      <Stack.Screen
        dangerouslySingular={(_name, params) =>
          `category-new:${params?.kind ?? 'EXPENSE'}`
        }
        name="categories/new"
        options={{title: t('category.add')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="categories/[categoryKey]"
        options={{title: t('common.category')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="timezone"
        options={{title: t('settings.timezone')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="requests"
        options={{title: t('settings.joinRequests')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="audit"
        options={{title: t('release.audit')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="currency"
        options={{title: t('settings.currency')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="deleted"
        options={{title: t('screen.deletedEntries')}}
      />
      <Stack.Screen
        dangerouslySingular
        name="danger"
        options={{title: t('settings.dangerZone')}}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
});
