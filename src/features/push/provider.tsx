import type {PropsWithChildren, ReactElement} from 'react';
import {useCallback, useEffect, useState} from 'react';
import {Platform} from 'react-native';
import {useMutation} from 'convex/react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {appVersion} from '../../../config';
import {useLocale} from '~/hooks/useLocale';
import {Storage, storage} from '~/utils/storage';
import {
  parsePushRouteData,
  shouldPresentForeground,
  type PushRouteData,
} from './routeForNotification';

const CHANNELS = [
  {id: 'ledger-activity', importance: Notifications.AndroidImportance.DEFAULT},
  {id: 'ledger-social', importance: Notifications.AndroidImportance.HIGH},
  {id: 'ledger-governance', importance: Notifications.AndroidImportance.HIGH},
] as const;

const expoProjectId = (): string | null =>
  Constants.easConfig?.projectId ??
  (typeof Constants.expoConfig?.extra?.eas?.projectId === 'string'
    ? Constants.expoConfig.extra.eas.projectId
    : null);

export async function currentExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (
    permission.status !== Notifications.PermissionStatus.GRANTED &&
    permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    return null;
  const projectId = expoProjectId();
  if (projectId === null) return null;
  return (await Notifications.getExpoPushTokenAsync({projectId})).data;
}

void Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = parsePushRouteData(notification.request.content.data);
    const present = shouldPresentForeground(
      data,
      storage.getString(Storage.ActiveLedgerId),
    );
    return {
      shouldPlaySound: present,
      shouldSetBadge: false,
      shouldShowBanner: present,
      shouldShowList: present,
    };
  },
});

const handleResponse = (
  router: ReturnType<typeof useRouter>,
  response: Notifications.NotificationResponse,
): void => {
  const data = parsePushRouteData(response.notification.request.content.data);
  if (data === null) return;
  navigateToNotification(router, data);
};

export const navigateToNotification = (
  router: ReturnType<typeof useRouter>,
  data: PushRouteData,
): void => {
  if (data.ledgerId !== undefined)
    storage.set(Storage.ActiveLedgerId, data.ledgerId);
  if (
    (data.kind === 'ITEM_ADDED' || data.kind === 'COMMENT_ADDED') &&
    data.itemId !== undefined
  ) {
    router.navigate({pathname: '/entry/[itemId]', params: {itemId: data.itemId}});
    return;
  }
  if (data.kind === 'LEDGER_INVITE') {
    router.navigate('/notifications');
    return;
  }
  if (data.kind === 'JOIN_REQUESTED' && data.ledgerId !== undefined) {
    router.navigate({
      pathname: '/ledger/[ledgerId]/requests',
      params: {ledgerId: data.ledgerId},
    });
    return;
  }
  if (
    (data.kind === 'MEMBER_JOINED' ||
      data.kind === 'MEMBER_LEFT' ||
      data.kind === 'MEMBER_REMOVED') &&
    data.ledgerId !== undefined
  ) {
    router.navigate({
      pathname: '/ledger/[ledgerId]/members',
      params: {ledgerId: data.ledgerId},
    });
    return;
  }
  if (
    (data.kind === 'JOIN_APPROVED' ||
      data.kind === 'ROLE_CHANGED' ||
      data.kind === 'OWNERSHIP_TRANSFERRED') &&
    data.ledgerId !== undefined
  ) {
    router.navigate({
      pathname: '/ledger/[ledgerId]',
      params: {ledgerId: data.ledgerId},
    });
    return;
  }
  if (data.kind === 'JOIN_REJECTED') return;
  // The '/' shim replaces into tabs and can duplicate an existing shell.
  if (data.kind === 'LEDGER_ARCHIVED')
    router.navigate('/(app)/(tabs)/(root)');
  else if (data.kind === 'LEGACY_CLAIMED') router.navigate('/settings/account');
  else if (data.kind === 'ANNOUNCEMENT')
    router.navigate('/settings/announcements');
  else router.navigate('/notifications');
};

export function NotificationProvider({children}: PropsWithChildren): ReactElement {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'android')
      for (const channel of CHANNELS)
        void Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.id,
          importance: channel.importance,
        });
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => handleResponse(router, response),
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response === null) return;
      handleResponse(router, response);
      void Notifications.clearLastNotificationResponseAsync();
    });
    return () => subscription.remove();
  }, [router]);
  return <>{children}</>;
}

export function usePushRegistration(): {
  readonly enabling: boolean;
  readonly enabled: boolean;
  readonly enable: () => Promise<boolean>;
} {
  const {locale} = useLocale();
  const register = useMutation(api.notifications.mutations.registerToken);
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const enable = useCallback(async (): Promise<boolean> => {
    if (!Device.isDevice || enabling) return false;
    setEnabling(true);
    try {
      if (Platform.OS === 'android')
        for (const channel of CHANNELS)
          await Notifications.setNotificationChannelAsync(channel.id, {
            name: channel.id,
            importance: channel.importance,
          });
      const permission = await Notifications.requestPermissionsAsync();
      if (
        permission.status !== Notifications.PermissionStatus.GRANTED &&
        permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
      )
        return false;
      const projectId = expoProjectId();
      if (projectId === null) return false;
      const result = await Notifications.getExpoPushTokenAsync({projectId});
      await register({
        token: result.data,
        platform:
          Platform.OS === 'ios'
            ? 'ios'
            : Platform.OS === 'android'
              ? 'android'
              : 'web',
        locale,
        appVersion,
        deviceName: Device.deviceName ?? undefined,
      });
      setEnabled(true);
      return true;
    } finally {
      setEnabling(false);
    }
  }, [enabling, locale, register]);
  return {enabling, enabled, enable};
}

export const pushChannels = CHANNELS;
