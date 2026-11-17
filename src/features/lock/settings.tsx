import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {Icon, LoadingIndicator, Typography, useCPK} from 'cpk-ui';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {
  SettingsBottomAction,
  SettingsPage,
  SettingsRow,
  SettingsSectionList,
  SettingsToggleRow,
} from '~/features/settings/ui';
import {t} from '~/utils/i18n';
import {useAppLock} from './provider';

const AUTO_LOCK_OPTIONS = [0, 60_000, 300_000, 900_000, 3_600_000] as const;

type LockView = 'confirm' | 'manage' | 'pin' | 'timing';

const autoLockLabel = (milliseconds: number): string => {
  switch (milliseconds) {
    case 0:
      return t('lock.autoLockImmediately');
    case 60_000:
      return t('lock.autoLockOneMinute');
    case 300_000:
      return t('lock.autoLockFiveMinutes');
    case 900_000:
      return t('lock.autoLockFifteenMinutes');
    default:
      return t('lock.autoLockOneHour');
  }
};

function PinEntry({
  error,
  label,
  loading,
  onChange,
  step,
  value,
}: {
  readonly error?: string;
  readonly label: string;
  readonly loading: boolean;
  readonly onChange: (value: string) => void;
  readonly step: 1 | 2;
  readonly value: string;
}): ReactElement {
  const {theme} = useCPK();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(180)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={styles.pinStage}
    >
      <View style={styles.progressRow}>
        {[1, 2].map((item) => (
          <View
            key={item}
            style={[
              styles.progress,
              {
                backgroundColor:
                  item <= step ? theme.role.primary : theme.bg.disabled,
              },
            ]}
          />
        ))}
      </View>
      <View style={[styles.pinIcon, {backgroundColor: theme.role.underlay}]}>
        <Icon color={theme.role.primary} name="Password" size={30} />
      </View>
      <View style={styles.pinCopy}>
        <Typography.Heading2 $fontWeight="bold" style={styles.center}>
          {label}
        </Typography.Heading2>
        <Typography.Body3 style={[styles.center, {color: theme.text.label}]}>
          {step === 1 ? t('lock.pinEntryBody') : t('lock.pinConfirmBody')}
        </Typography.Body3>
      </View>
      <View style={styles.pinInputStack}>
        {loading ? (
          <View style={styles.pinLoading}>
            <LoadingIndicator color={theme.role.primary} size="medium" />
          </View>
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.pinRow}
          >
            {Array.from({length: 6}, (_, index) => (
              <View
                key={index}
                style={[
                  styles.pinDot,
                  {
                    backgroundColor:
                      index < value.length
                        ? theme.role.primary
                        : theme.bg.disabled,
                  },
                ]}
              />
            ))}
          </View>
        )}
        <TextInput
          accessibilityLabel={label}
          accessibilityValue={{text: `${value.length}/6`}}
          autoFocus
          caretHidden
          editable={!loading}
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(next) => onChange(next.replace(/\D/g, ''))}
          secureTextEntry
          selectionColor="transparent"
          style={styles.hiddenInput}
          textContentType="none"
          value={value}
        />
      </View>
      {error === undefined ? (
        <Typography.Body4 style={{color: theme.text.placeholder}}>
          {t('lock.pinPrivacyHint')}
        </Typography.Body4>
      ) : (
        <Typography.Body3
          accessibilityLiveRegion="polite"
          style={[styles.center, {color: theme.text.validation}]}
        >
          {error}
        </Typography.Body3>
      )}
    </Animated.View>
  );
}

export function LockSettingsScreen(): ReactElement {
  const lock = useAppLock();
  const {snackbar} = useCPK();
  const dialog = useBookooAlertDialog();
  const [view, setView] = useState<LockView>(() =>
    lock.enabled ? 'manage' : 'pin',
  );
  const [configuredLocally, setConfiguredLocally] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [biometricsEnabled, setBiometricsEnabled] = useState(
    lock.biometricsEnabled,
  );
  const [biometricsAvailable, setBiometricsAvailable] = useState<
    boolean | null
  >(null);
  const [autoLockAfterMs, setAutoLockAfterMs] = useState(lock.autoLockAfterMs);
  const [saving, setSaving] = useState(false);
  const [savingOption, setSavingOption] = useState<'biometrics' | 'timing'>();
  const enabled = lock.enabled || configuredLocally;

  useEffect(() => {
    let active = true;
    void Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hasHardware, isEnrolled]) => {
      if (!active) return;
      const available = hasHardware && isEnrolled;
      setBiometricsAvailable(available);
      if (!available) setBiometricsEnabled(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const completePin = (confirmedPin: string): void => {
    if (saving) return;
    setSaving(true);
    setPinError(undefined);
    void lock
      .configure({pin: confirmedPin, autoLockAfterMs, biometricsEnabled})
      .then(() => {
        setConfiguredLocally(true);
        setPin('');
        setConfirmation('');
        setView('manage');
        snackbar.open({color: 'success', text: t('lock.ready')});
      })
      .catch(() => {
        setConfirmation('');
        setPinError(t('lock.setErrorTitle'));
      })
      .finally(() => setSaving(false));
  };

  const changePin = (next: string): void => {
    setPin(next);
    if (next.length !== 6) return;
    setConfirmation('');
    setPinError(undefined);
    setView('confirm');
  };

  const changeConfirmation = (next: string): void => {
    setConfirmation(next);
    if (next.length !== 6) return;
    if (next !== pin) {
      setConfirmation('');
      setPinError(t('lock.pinMismatch'));
      return;
    }
    completePin(next);
  };

  const updateOptions = async ({
    autoLock,
    biometrics,
  }: {
    readonly autoLock?: number;
    readonly biometrics?: boolean;
  }): Promise<void> => {
    if (saving) return;
    const nextAutoLock = autoLock ?? autoLockAfterMs;
    const nextBiometrics = biometrics ?? biometricsEnabled;
    setAutoLockAfterMs(nextAutoLock);
    setBiometricsEnabled(nextBiometrics);
    setSaving(true);
    setSavingOption(autoLock === undefined ? 'biometrics' : 'timing');
    try {
      await lock.configure({
        autoLockAfterMs: nextAutoLock,
        biometricsEnabled: nextBiometrics,
      });
      snackbar.open({color: 'success', text: t('common.success')});
    } catch {
      setAutoLockAfterMs(lock.autoLockAfterMs);
      setBiometricsEnabled(lock.biometricsEnabled);
      snackbar.open({color: 'danger', text: t('error.generic')});
    } finally {
      setSaving(false);
      setSavingOption(undefined);
    }
  };

  const startPinSetup = (): void => {
    setPin('');
    setConfirmation('');
    setPinError(undefined);
    setView('pin');
  };

  const confirmDisable = (): void => {
    dialog.confirm({
      body: t('lock.disableBody'),
      confirmText: t('release.disableLock'),
      icon: 'LockKeyOpen',
      onConfirm: () => {
        setSaving(true);
        void lock
          .disable()
          .then(() => {
            setConfiguredLocally(false);
            setPin('');
            setConfirmation('');
            setView('pin');
          })
          .catch(() =>
            snackbar.open({color: 'danger', text: t('error.generic')}),
          )
          .finally(() => setSaving(false));
      },
      title: t('release.disableLock'),
      tone: 'danger',
    });
  };

  if (view === 'pin' || view === 'confirm')
    return (
      <SettingsPage
        footer={
          enabled ? (
            <SettingsBottomAction
              disabled={saving}
              onPress={() => setView('manage')}
              text={t('common.cancel')}
            />
          ) : undefined
        }
      >
        <PinEntry
          error={pinError}
          key={view}
          label={
            view === 'pin' ? t('lock.createPin') : t('lock.confirmPinTitle')
          }
          loading={saving}
          onChange={view === 'pin' ? changePin : changeConfirmation}
          step={view === 'pin' ? 1 : 2}
          value={view === 'pin' ? pin : confirmation}
        />
      </SettingsPage>
    );

  if (view === 'timing')
    return (
      <SettingsSectionList
        keyExtractor={(milliseconds) => String(milliseconds)}
        renderItem={(milliseconds) => (
          <SettingsRow
            accessibilityRole="radio"
            disabled={saving}
            loading={
              savingOption === 'timing' && autoLockAfterMs === milliseconds
            }
            onPress={() => {
              void updateOptions({autoLock: milliseconds}).then(() =>
                setView('manage'),
              );
            }}
            selected={autoLockAfterMs === milliseconds}
            title={autoLockLabel(milliseconds)}
          />
        )}
        sections={[
          {
            data: AUTO_LOCK_OPTIONS,
            key: 'timing',
            rowsWithoutIcons: true,
            title: t('lock.autoLock'),
          },
        ]}
        testID="lock-timing-sections"
      />
    );

  type LockSettingRow =
    | {
        readonly detail?: string;
        readonly disabled?: boolean;
        readonly icon: 'Lock' | 'LockOpen' | 'Password' | 'Timer';
        readonly key: string;
        readonly kind: 'action';
        readonly onPress: () => void;
        readonly title: string;
      }
    | {
        readonly detail?: string;
        readonly disabled: boolean;
        readonly icon: 'Fingerprint';
        readonly key: string;
        readonly kind: 'toggle';
        readonly loading: boolean;
        readonly onChange: (value: boolean) => void;
        readonly title: string;
        readonly value: boolean;
      };
  const sections: readonly {
    readonly data: readonly LockSettingRow[];
    readonly key: string;
    readonly title: string;
  }[] = [
    {
      data: [
        {
          icon: 'Password',
          key: 'pin',
          kind: 'action',
          onPress: startPinSetup,
          title: t('lock.changePin'),
        },
        {
          detail:
            biometricsAvailable === false
              ? t('lock.biometricNotEnrolled')
              : undefined,
          disabled: biometricsAvailable !== true || saving,
          icon: 'Fingerprint',
          key: 'biometrics',
          kind: 'toggle',
          loading: savingOption === 'biometrics',
          onChange: (value) => void updateOptions({biometrics: value}),
          title: t('lock.setBiometric'),
          value: biometricsEnabled,
        },
        {
          detail: autoLockLabel(autoLockAfterMs),
          disabled: saving,
          icon: 'Timer',
          key: 'timing',
          kind: 'action',
          onPress: () => setView('timing'),
          title: t('lock.autoLock'),
        },
      ],
      key: 'security',
      title: t('lock.securitySection'),
    },
    {
      data: [
        {
          icon: 'Lock',
          key: 'lock-now',
          kind: 'action',
          onPress: lock.lockNow,
          title: t('lock.lockNow'),
        },
        {
          disabled: saving,
          icon: 'LockOpen',
          key: 'disable',
          kind: 'action',
          onPress: confirmDisable,
          title: t('release.disableLock'),
        },
      ],
      key: 'actions',
      title: t('lock.actionsSection'),
    },
  ];

  return (
    <SettingsSectionList<LockSettingRow>
      keyExtractor={(row) => row.key}
      renderItem={(row) =>
        row.kind === 'toggle' ? (
          <SettingsToggleRow
            detail={row.detail}
            disabled={row.disabled}
            icon={row.icon}
            loading={row.loading}
            onChange={row.onChange}
            title={row.title}
            value={row.value}
          />
        ) : (
          <SettingsRow
            danger={row.key === 'disable'}
            detail={row.detail}
            disabled={row.disabled}
            icon={row.icon}
            onPress={row.onPress}
            title={row.title}
          />
        )
      }
      sections={sections}
      testID="lock-settings-sections"
    />
  );
}

const styles = StyleSheet.create({
  center: {textAlign: 'center'},
  hiddenInput: {
    backgroundColor: 'transparent',
    bottom: 0,
    color: 'transparent',
    left: 0,
    padding: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pinCopy: {alignItems: 'center', gap: 8},
  pinDot: {borderRadius: 999, height: 16, width: 16},
  pinIcon: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 30,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  pinInputStack: {paddingVertical: 18, position: 'relative', width: '100%'},
  pinLoading: {alignItems: 'center', height: 16, justifyContent: 'center'},
  pinRow: {flexDirection: 'row', gap: 18, justifyContent: 'center'},
  pinStage: {
    alignItems: 'center',
    gap: 22,
    minHeight: 460,
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  progress: {borderRadius: 999, flex: 1, height: 4},
  progressRow: {flexDirection: 'row', gap: 8, width: '100%'},
});
