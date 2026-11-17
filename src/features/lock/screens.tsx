import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import {Button, Typography, useCPK} from 'cpk-ui';

import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';

import {AppScreen} from '~/features/ledger/ui';
import {t} from '~/utils/i18n';
import {useAppLock} from './provider';

/** Offline, `signOut` pends instead of failing; this bounds the wait. */
const FORGET_TIMEOUT_MS = 15_000;

export function LockScreen(): ReactElement {
  const {theme} = useCPK();
  const lock = useAppLock();
  const {locked, unlockWithBiometrics} = lock;
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (locked) void unlockWithBiometrics();
  }, [locked, unlockWithBiometrics]);
  const unlockDigits = async (digits: string): Promise<void> => {
    if (checking || digits.length !== 6) return;
    setChecking(true);
    try {
      // The fifteenth wrong PIN signs out from in here. It reaches this catch
      // only when the sign-out rejects; offline it HANGS instead, and then
      // `checking` stays true and the field is dead until a restart. That
      // fails closed, and the lockout is persisted before the sign-out is
      // attempted, so the restart lands on a properly locked-out record.
      const ok = await lock.unlockWithPin(digits);
      setFailed(!ok);
    } catch {
      // The fifteenth attempt signs out from in here. It rejects only if the
      // sign-out itself rejects; offline it HANGS instead, and then this catch
      // never runs and `checking` stays true — the PIN field is dead until a
      // restart. That fails closed, and the lockout is already persisted by
      // then, so a restart lands on a properly locked-out record.
      setFailed(true);
    } finally {
      setPin('');
      setChecking(false);
    }
  };

  const [forgetting, setForgetting] = useState(false);
  const [forgetFailed, setForgetFailed] = useState(false);
  const forgetPin = async (): Promise<void> => {
    if (forgetting) return;
    setForgetting(true);
    setForgetFailed(false);
    try {
      // Offline, `signOut` neither resolves nor rejects — its socket calls pend
      // until the connection returns — so without a deadline the button would
      // stay wedged with no explanation. A re-tap after this rejoins the same
      // attempt rather than starting a second one, and a reconnect still
      // finishes the original correctly.
      await Promise.race([
        lock.forget(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('timeout')), FORGET_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // The session could not be ended, so the lock is deliberately still in
      // place. `error.network` says that; the PIN-mismatch copy would claim a
      // password they never typed was wrong.
      setForgetFailed(true);
    } finally {
      setForgetting(false);
    }
  };

  const unlock = (): Promise<void> => unlockDigits(pin);
  return (
    <AppScreen>
      {/*
        The PIN field autofocuses, so the number pad is up the moment this
        screen appears — and an iOS number pad has no Done key to dismiss it.
        A fixed, centred frame therefore hides everything below the biometric
        button behind the keyboard, including "Forgot PIN". On a 390pt phone
        that leaves a user who has forgotten their PIN with no way out of the
        app at all. Scrolling above the keyboard is what makes the escape
        hatch reachable.
      */}
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={styles.frame}
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
      >
        <Typography.Title $fontWeight="bold">{t('release.unlockTitle')}</Typography.Title>
        <Typography.Body3 style={{color: theme.text.label}}>
          {t('release.unlockBody')}
        </Typography.Body3>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.pinRow}
        >
          {Array.from({length: 6}, (_, index) => (
            <View
              key={index}
              style={[
                styles.pinBox,
                {
                  borderColor: theme.role.border,
                  backgroundColor: theme.bg.basic,
                },
              ]}
            >
              <Typography.Heading3>{index < pin.length ? '•' : ''}</Typography.Heading3>
            </View>
          ))}
        </View>
        <TextInput
          accessibilityLabel={t('release.pinLabel')}
          accessibilityValue={{text: `${pin.length}/6`}}
          autoFocus
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(value) => {
            const digits = value.replace(/\D/g, '');
            setPin(digits);
            if (digits.length === 6)
              setTimeout(() => void unlockDigits(digits), 0);
          }}
          secureTextEntry
          style={styles.hiddenInput}
          value={pin}
        />
        {failed ? (
          <Typography.Body3 accessibilityLiveRegion="polite" style={{color: theme.text.validation}}>
            {t('lock.authFailedBody')}
          </Typography.Body3>
        ) : null}
        {forgetFailed ? (
          <Typography.Body3
            accessibilityLiveRegion="polite"
            style={{color: theme.text.validation}}
            testID="lock-forget-error"
          >
            {t('error.network')}
          </Typography.Body3>
        ) : null}
        {lock.lockedUntil === null ? null : (
          <Typography.Body3>{t('release.lockedOut')}</Typography.Body3>
        )}
        <Button loading={checking} onPress={() => void unlock()} text={t('release.unlock')} />
        <Button onPress={() => void lock.unlockWithBiometrics()} text={t('lock.biometricTitle')} type="outlined" />
        <Button
          color="danger"
          disabled={forgetting}
          loading={forgetting}
          onPress={() => void forgetPin()}
          text={t('release.forgotPin')}
          type="text"
        />
      </KeyboardAwareScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  frame: {flexGrow: 1, gap: 12, justifyContent: 'center', padding: 24},
  hiddenInput: {height: 1, opacity: 0, position: 'absolute', width: 1},
  pinBox: {alignItems: 'center', borderRadius: 4, borderWidth: 1, height: 52, justifyContent: 'center', width: 42},
  pinRow: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
});
