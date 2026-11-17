import type {PropsWithChildren, ReactElement} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from 'convex-helpers/react/cache';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import {Button, Icon, Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {PUBLIC_URLS} from '@shared/legal';
import {t} from '~/utils/i18n';
import {Storage, storage} from '~/utils/storage';
import {diagnostic} from '~/features/diagnostics/ring';
import {BookooButton} from '~/components/uis/BookooButton';
import {RouteLoadingScreen} from '~/features/runtime/routeLoading';
import {statusBarStyleForTheme} from '~/theme/statusBar';

export interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
}

export function parseSemver(value: string): ParsedSemver | null {
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/,
  );
  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  )
    return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a === null || b === null) return null;
  for (const field of ['major', 'minor', 'patch'] as const) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function shouldRequireNativeUpdate(input: {
  readonly platform: 'ios' | 'android';
  readonly nativeBuildVersion: string | null;
  readonly minSupportedIosBuild: number;
  readonly minSupportedAndroidBuild: number;
}): boolean {
  if (
    input.nativeBuildVersion === null ||
    !/^\d+$/.test(input.nativeBuildVersion)
  )
    return false;
  const build = Number(input.nativeBuildVersion);
  if (!Number.isSafeInteger(build) || build < 1) return false;
  return (
    build <
    (input.platform === 'ios'
      ? input.minSupportedIosBuild
      : input.minSupportedAndroidBuild)
  );
}

const maintenanceBody = (messageKey: string | null): string => {
  switch (messageKey) {
    case null:
    case 'maintenance.default':
    default:
      return t('release.maintenanceBody');
  }
};

function GateScreen({
  icon,
  title,
  body,
  primaryLabel,
  primaryUrl,
}: {
  icon: 'Wrench' | 'Download';
  title: string;
  body: string;
  primaryLabel?: string;
  primaryUrl?: string;
}): ReactElement {
  const {theme, themeType} = useCPK();
  const {width} = useWindowDimensions();
  const wide = width >= 768;
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.root, {backgroundColor: theme.bg.paper}]}>
      <StatusBar
        backgroundColor={theme.bg.paper}
        barStyle={statusBarStyleForTheme(themeType)}
        hidden={false}
      />
      <SafeAreaView
        edges={['top', 'left', 'right', 'bottom']}
        style={styles.root}
      >
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={[styles.content, wide && styles.contentWide]}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel="BooKoo"
              resizeMode="contain"
              source={require('../../../assets/brand/logo.png')}
              style={[styles.logo, {tintColor: theme.role.primary}]}
            />
            <View
              accessibilityLiveRegion="polite"
              style={[styles.gateRow, wide && styles.gateRowWide]}
            >
              <View style={styles.visualColumn}>
                <View
                  style={[
                    styles.iconWell,
                    {backgroundColor: theme.role.underlay},
                  ]}
                >
                  <Icon color={theme.role.primary} name={icon} size={28} />
                </View>
                <View accessibilityElementsHidden style={styles.ledgerLines}>
                  <View
                    style={[
                      styles.ledgerLineLong,
                      {backgroundColor: theme.role.primary},
                    ]}
                  />
                  <View
                    style={[
                      styles.ledgerLineMedium,
                      {backgroundColor: theme.role.divider},
                    ]}
                  />
                  <View
                    style={[
                      styles.ledgerLineShort,
                      {backgroundColor: theme.role.divider},
                    ]}
                  />
                </View>
              </View>
              <View style={styles.mainColumn}>
                <View style={styles.copy}>
                  <Typography.Heading2
                    $fontWeight="bold"
                    accessibilityRole="header"
                  >
                    {title}
                  </Typography.Heading2>
                  <Typography.Body2
                    style={[styles.body, {color: theme.text.label}]}
                  >
                    {body}
                  </Typography.Body2>
                </View>
                <View style={styles.actions}>
                  {primaryLabel === undefined ||
                  primaryUrl === undefined ? null : (
                    <BookooButton
                      onPress={() => {
                        setFailed(false);
                        void Linking.openURL(primaryUrl).catch(() =>
                          setFailed(true),
                        );
                      }}
                      size="large"
                      text={primaryLabel}
                    />
                  )}
                  <BookooButton
                    onPress={() => void Linking.openURL(PUBLIC_URLS.support)}
                    text={t('release.support')}
                    type={primaryLabel === undefined ? 'solid' : 'outlined'}
                  />
                  {failed ? (
                    <View
                      style={[
                        styles.failure,
                        {backgroundColor: theme.bg.highlight},
                      ]}
                    >
                      <Typography.Body3
                        accessibilityLiveRegion="polite"
                        style={{color: theme.text.validation}}
                      >
                        {t('release.openLinkFailed')}
                      </Typography.Body3>
                      {primaryUrl === undefined ? null : (
                        <Button
                          onPress={() =>
                            void Clipboard.setStringAsync(primaryUrl)
                          }
                          size="small"
                          text={t('release.copyLink')}
                          type="text"
                        />
                      )}
                    </View>
                  ) : null}
                </View>
                <View style={styles.links}>
                  <Button
                    onPress={() => void Linking.openURL(PUBLIC_URLS.terms)}
                    size="small"
                    text={t('intro.terms')}
                    type="text"
                  />
                  <Button
                    onPress={() => void Linking.openURL(PUBLIC_URLS.privacy)}
                    size="small"
                    text={t('intro.privacy')}
                    type="text"
                  />
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}


/** True while Convex app config is still settling and we must not paint a blank root. */
export function bootWaitsWithBrandedLoading(
  config: unknown,
  timedOut: boolean,
): boolean {
  return config === undefined && !timedOut;
}

export function BootGate({children}: PropsWithChildren): ReactElement | null {
  const config = useQuery(api.app.queries.config);
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const recordedStart = useRef(false);
  const recordedInvalidConfig = useRef(false);
  useEffect(() => {
    if (config !== undefined) return;
    const timer = setTimeout(() => setTimedOut(true), 1_500);
    return () => clearTimeout(timer);
  }, [config]);
  useEffect(() => {
    if ((config === undefined && !timedOut) || recordedStart.current) return;
    recordedStart.current = true;
    const duration = Date.now() - startedAt;
    diagnostic({
      kind: 'APP_START',
      durationBucket:
        duration < 450
          ? '<450'
          : duration <= 900
            ? '450_900'
            : duration <= 1500
              ? '901_1500'
              : '>1500',
      hadHint: storage.getString(Storage.SessionHint) !== undefined,
    });
  }, [config, startedAt, timedOut]);
  useEffect(() => {
    if (
      config === undefined ||
      config === null ||
      recordedInvalidConfig.current
    )
      return;
    const nativeBuild = Application.nativeBuildVersion;
    const build = nativeBuild === null ? NaN : Number(nativeBuild);
    const version = Application.nativeApplicationVersion;
    if (
      !Number.isSafeInteger(build) ||
      build < 1 ||
      version === null ||
      parseSemver(version) === null ||
      (config.maintenanceMessageKey !== null &&
        config.maintenanceMessageKey !== 'maintenance.default')
    ) {
      recordedInvalidConfig.current = true;
      diagnostic({
        kind: 'BOUNDARY',
        surface: 'ROOT',
        code: 'BOOT_CONFIG_INVALID',
        release: 'local',
      });
    }
  }, [config]);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const hardUpdate = useMemo(
    () =>
      config !== undefined &&
      config !== null &&
      shouldRequireNativeUpdate({
        platform,
        nativeBuildVersion: Application.nativeBuildVersion,
        minSupportedIosBuild: config.minSupportedIosBuild,
        minSupportedAndroidBuild: config.minSupportedAndroidBuild,
      }),
    [config, platform],
  );
  // Native splash may already be gone; keep a branded wait instead of a blank frame.
  if (bootWaitsWithBrandedLoading(config, timedOut))
    return <RouteLoadingScreen />;
  if (config !== undefined && config !== null && config.maintenanceMode)
    return (
      <GateScreen
        body={maintenanceBody(config.maintenanceMessageKey)}
        icon="Wrench"
        title={t('release.maintenanceTitle')}
      />
    );
  if (config !== undefined && config !== null && hardUpdate) {
    const storeUrl =
      platform === 'ios' ? config.iosStoreUrl : config.androidStoreUrl;
    return (
      <GateScreen
        body={t('release.hardUpdateBody', {
          current: Application.nativeApplicationVersion ?? t('common.unknown'),
          latest:
            platform === 'ios'
              ? config.latestIosVersion
              : config.latestAndroidVersion,
        })}
        icon="Download"
        primaryLabel={t('release.openStore')}
        primaryUrl={storeUrl}
        title={t('release.updateTitle')}
      />
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  actions: {gap: 10, maxWidth: 400, width: '100%'},
  body: {lineHeight: 25, maxWidth: 560},
  content: {
    alignSelf: 'center',
    gap: 34,
    maxWidth: 720,
    paddingBottom: 36,
    paddingHorizontal: 24,
    width: '100%',
  },
  contentWide: {maxWidth: 1040, paddingHorizontal: 40},
  copy: {gap: 10},
  failure: {borderRadius: 14, gap: 4, padding: 12},
  gateRow: {gap: 28},
  gateRowWide: {alignItems: 'flex-start', flexDirection: 'row', gap: 56},
  iconWell: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  ledgerLineLong: {borderRadius: 2, height: 3, width: 138},
  ledgerLineMedium: {borderRadius: 2, height: 3, width: 108},
  ledgerLines: {gap: 12},
  ledgerLineShort: {borderRadius: 2, height: 3, width: 122},
  links: {alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap'},
  logo: {height: 28, width: 96},
  mainColumn: {flex: 1, gap: 22, maxWidth: 620},
  root: {flex: 1},
  scrollContent: {flexGrow: 1, paddingTop: 8},
  visualColumn: {gap: 28, minWidth: 190, paddingTop: 4},
});
