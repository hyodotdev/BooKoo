import type {ReactElement} from 'react';
import {useEffect, useMemo, useState} from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {useQuery} from 'convex-helpers/react/cache';
import * as Application from 'expo-application';
import * as Patch from '@codemagic/react-native-patch';
import {Button, Typography, useCPK} from 'cpk-ui';
import {usePathname} from 'expo-router';

import {api} from '@convex/_generated/api';
import {diagnostic} from '~/features/diagnostics/ring';
import {t} from '~/utils/i18n';
import {Storage, storage} from '~/utils/storage';
import {compareSemver} from './boot';
import {otaUpdatesEnabled, patchColdStartDeps} from './coldStartUpdate';

const OTA_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SOFT_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_PATHS = new Set([
  '/',
  '/timeline',
  '/stats',
  '/me',
  '/notifications',
]);

interface SoftDismissal {
  readonly version: string;
  readonly dismissedAt: number;
}

const readDismissal = (): SoftDismissal | null => {
  const raw = storage.getString(Storage.SoftUpdateDismissal);
  if (raw === undefined) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      typeof value.version === 'string' &&
      'dismissedAt' in value &&
      typeof value.dismissedAt === 'number'
    )
      return {version: value.version, dismissedAt: value.dismissedAt};
  } catch {
    storage.delete(Storage.SoftUpdateDismissal);
  }
  return null;
};

export function SoftUpdateSheet(): ReactElement | null {
  const {theme} = useCPK();
  const config = useQuery(api.app.queries.config);
  const pathname = usePathname();
  const [mountedAt] = useState(() => Date.now());
  const [otaReady, setOtaReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const latest =
    config === undefined || config === null
      ? null
      : platform === 'ios'
        ? config.latestIosVersion
        : config.latestAndroidVersion;
  const storeUrl =
    config === undefined || config === null
      ? null
      : platform === 'ios'
        ? config.iosStoreUrl
        : config.androidStoreUrl;
  const softAvailable = useMemo(() => {
    if (latest === null || Application.nativeApplicationVersion === null)
      return false;
    if (compareSemver(Application.nativeApplicationVersion, latest) !== -1)
      return false;
    const dismissal = readDismissal();
    return !(
      dismissal?.version === latest &&
      mountedAt - dismissal.dismissedAt < SOFT_DISMISSAL_MS
    );
  }, [latest, mountedAt]);

  useEffect(() => {
    if (!otaUpdatesEnabled) return;
    let active = true;
    let checking = false;
    const check = (): void => {
      const now = Date.now();
      const last = storage.getNumber(Storage.LastOtaCheckAt) ?? 0;
      if (checking || now - last < OTA_CHECK_INTERVAL_MS) return;
      checking = true;
      storage.set(Storage.LastOtaCheckAt, now);
      const ota = patchColdStartDeps();
      void ota
        .checkForUpdate()
        .then(async (result) => {
          if (!active || !result.isAvailable) return;
          await ota.fetchUpdate();
          if (active) setOtaReady(true);
        })
        .catch(() => {
          diagnostic({kind: 'UPDATE', outcome: 'CHECK_FAILED'});
        })
        .finally(() => {
          checking = false;
        });
    };
    check();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      foreground.remove();
    };
  }, []);

  const safe = SAFE_PATHS.has(pathname) && !hidden;
  if (!safe || (!otaReady && !softAvailable)) return null;
  const isOta = otaReady;
  return (
    <Modal animationType="fade" transparent visible>
      <View style={[styles.backdrop, {backgroundColor: theme.bg.scrim}]}>
        <View style={[styles.card, {backgroundColor: theme.bg.paper}]}>
          <Typography.Heading3 $fontWeight="bold">
            {isOta ? t('release.updateReady') : t('release.updateTitle')}
          </Typography.Heading3>
          <Typography.Body3 style={{color: theme.text.label}}>
            {isOta ? t('release.updateReadyBody') : t('release.updateBody')}
          </Typography.Body3>
          <Button
            onPress={() => {
              if (isOta) void Patch.restartApp();
              else if (storeUrl !== null) void Linking.openURL(storeUrl);
            }}
            text={isOta ? t('release.applyUpdate') : t('release.openStore')}
          />
          <Button
            onPress={() => {
              if (!isOta && latest !== null)
                storage.set(
                  Storage.SoftUpdateDismissal,
                  JSON.stringify({version: latest, dismissedAt: Date.now()}),
                );
              setHidden(true);
            }}
            text={t('release.later')}
            type="text"
          />
        </View>
      </View>
    </Modal>
  );
}

export const softUpdateInternals = {
  otaCheckIntervalMs: OTA_CHECK_INTERVAL_MS,
  readDismissal,
  softDismissalMs: SOFT_DISMISSAL_MS,
} as const;

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {borderRadius: 4, gap: 16, maxWidth: 480, padding: 24, width: '100%'},
});
