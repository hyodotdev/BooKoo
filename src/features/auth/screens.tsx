import type {ReactElement} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BackHandler, Linking, Platform, View} from 'react-native';
import {Redirect, useRouter} from 'expo-router';
import {useAuthActions} from '@convex-dev/auth/react';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Icon, Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {EMAIL_OTP_PROVIDER_IDS} from '@shared/authPolicy';
import {normalizeEmail} from '@shared/email';
import {
  DISPLAY_NAME_MAX_LENGTH,
  generatedDisplayName,
  validateDisplayName,
} from '@shared/profile';
import {validateHandle} from '@shared/username';
import {useLocale} from '~/hooks/useLocale';
import {useDebouncedValue} from '~/hooks/useDebouncedValue';
import {getLocale, t} from '~/utils/i18n';
import {leaveCurrentScreen} from '~/utils/navigation';
import {
  isSocialSignInAvailable,
  useSocialSignIn,
  type SocialProvider,
} from './social';
import {useSession} from './session';
import {MAIN_SIGN_IN_METHODS, SECONDARY_SIGN_IN_METHODS} from './signInMethods';
import {useSessionSignOut} from './signOut';
import {onboardingRouteFor} from './onboardingNavigation';
import {BookooRecoveryScreen} from '~/components/uis/BookooRecoveryScreen';
import {PUBLIC_URLS} from '@shared/legal';
import {
  AuthButton,
  AuthField,
  AuthNotice,
  AuthScreen,
  BrandAuthScreen,
  LoginFormScreen,
  OnboardingBlockingModal,
  BrandMainSignInButton,
  BrandSecondarySignInButton,
  SocialSessionProgress,
  authStyles,
  useAuthPalette,
} from './ui';

function useLeaveIncompleteOnboarding(): () => void {
  const {signOut} = useSessionSignOut();
  return useCallback(() => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    void signOut();
  }, [signOut]);
}

function socialBrandName(provider: SocialProvider): string {
  switch (provider) {
    case 'apple':
      return 'Apple';
    case 'google':
      return 'Google';
    case 'kakao':
      return 'Kakao';
    case 'naver':
      return 'Naver';
  }
}

export function ReadyScreen(): ReactElement {
  const {signOut} = useSessionSignOut();
  return (
    <AuthScreen title="BooKoo" subtitle={t('intro.tagline')}>
      <View style={authStyles.actions}>
        <AuthNotice>{t('ledger.empty')}</AuthNotice>
        <AuthButton
          label={t('auth.logout')}
          onPress={() => void signOut()}
          secondary
        />
      </View>
    </AuthScreen>
  );
}

export function LegacyHelpScreen(): ReactElement {
  const router = useRouter();
  const palette = useAuthPalette();
  return (
    <AuthScreen
      backLabel={t('a11y.back')}
      onBack={() => router.replace('/sign-in')}
      subtitle={t('auth.signInHelpBody')}
      title={t('auth.forgotPassword')}
    >
      <View
        style={[
          authStyles.helpPanel,
          {backgroundColor: palette.surface, borderColor: palette.border},
        ]}
      >
        <View
          style={[authStyles.helpIcon, {backgroundColor: palette.background}]}
        >
          <Icon color={palette.accent} name="Key" size={23} />
        </View>
        <Typography.Body3 style={{color: palette.muted}}>
          {t('auth.signInHelpPrivacy')}
        </Typography.Body3>
      </View>
      <View style={authStyles.actions}>
        <AuthButton
          label={t('auth.backToSignIn')}
          onPress={() => router.replace('/sign-in')}
        />
        <AuthButton
          label={t('release.support')}
          onPress={() => void Linking.openURL(PUBLIC_URLS.support)}
          secondary
        />
      </View>
    </AuthScreen>
  );
}

export function SignInCodeScreen({
  email,
  provider,
}: {
  email: string;
  provider: string;
}): ReactElement {
  const router = useRouter();
  const {signIn} = useAuthActions();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);

  const confirm = async (): Promise<void> => {
    if (
      checking ||
      !/^\d{8}$/.test(code) ||
      email.length === 0 ||
      provider.length === 0
    ) {
      setError(true);
      return;
    }
    setChecking(true);
    setError(false);
    try {
      const result = await signIn(provider, {email, code});
      if (!result.signingIn) {
        setError(true);
        setChecking(false);
      }
    } catch {
      setError(true);
      setChecking(false);
    }
  };

  return (
    <LoginFormScreen
      onBack={() => void leaveCurrentScreen(router, '/sign-in-email')}
      subtitle={t('auth.otpSent', {email})}
      title={t('auth.login')}
    >
      <AuthField
        accessibilityLabel={t('auth.otpLabel')}
        autoComplete="one-time-code"
        autoFocus
        blurOnSubmit
        keyboardType="number-pad"
        maxLength={8}
        onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
        onSubmitEditing={() => void confirm()}
        placeholder={t('auth.otpPlaceholder')}
        returnKeyType="go"
        textContentType="oneTimeCode"
        testID="auth-otp-input"
        value={code}
      />
      <AuthButton
        borderRadius={8}
        disabled={code.length !== 8}
        label={t('auth.login')}
        loading={checking}
        onPress={() => void confirm()}
      />
      {error ? <AuthNotice danger>{t('auth.otpInvalid')}</AuthNotice> : null}
    </LoginFormScreen>
  );
}

export function EmailLoginScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const {signIn} = useAuthActions();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const normalized = normalizeEmail(email);

  const sendCode = async (): Promise<void> => {
    if (sending) return;
    if (normalized === undefined) {
      setError(true);
      return;
    }
    const locale = getLocale();
    const provider = EMAIL_OTP_PROVIDER_IDS[locale];
    setSending(true);
    setError(false);
    try {
      const result = await signIn(provider, {email: normalized});
      if (!result.signingIn)
        router.navigate({
          pathname: '/sign-in-code',
          params: {email: normalized, provider},
        });
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  const submit = (): void => {
    void sendCode();
  };

  return (
    <LoginFormScreen
      onBack={() => void leaveCurrentScreen(router, '/sign-in')}
      title={t('auth.login')}
    >
      <AuthField
        accessibilityLabel={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        autoFocus
        blurOnSubmit
        endElement={
          normalized === undefined ? undefined : (
            <Icon color={theme.role.primary} name="Check" size={18} />
          )
        }
        enablesReturnKeyAutomatically
        keyboardType="email-address"
        onChangeText={(value) => {
          setEmail(value);
          setError(false);
        }}
        onSubmitEditing={submit}
        placeholder={t('auth.emailPlaceholder')}
        returnKeyType="go"
        testID="auth-email-input"
        textContentType="emailAddress"
        value={email}
      />
      <AuthButton
        borderRadius={8}
        label={t('auth.sendOtp')}
        loading={sending}
        onPress={submit}
      />
      {error ? <AuthNotice danger>{t('error.generic')}</AuthNotice> : null}
    </LoginFormScreen>
  );
}

export function SignInScreen(): ReactElement {
  const router = useRouter();
  const social = useSocialSignIn();
  const busy = social.busyProvider !== null;
  const progressLabel = t('auth.signingInWith', {
    provider:
      social.busyProvider === null ? '' : socialBrandName(social.busyProvider),
  });

  return (
    <>
      <BrandAuthScreen line={t('intro.signInSupporting')} showPolicy>
        <View style={authStyles.mainSignInActions}>
          {MAIN_SIGN_IN_METHODS.map((provider) => (
            <BrandMainSignInButton
              key={provider}
              disabled={
                busy ||
                (provider !== 'email' && !isSocialSignInAvailable(provider))
              }
              label={
                provider === 'email'
                  ? t('auth.continueWithEmail')
                  : provider === 'apple'
                    ? t('auth.continueWithApple')
                    : t('auth.continueWithGoogle')
              }
              loading={
                provider === 'email' ? false : social.busyProvider === provider
              }
              onPress={() => {
                if (provider === 'email') router.navigate('/sign-in-email');
                else void social.start(provider);
              }}
              provider={provider}
            />
          ))}
        </View>
        <View style={authStyles.secondarySignInActions}>
          {SECONDARY_SIGN_IN_METHODS.map((provider) => (
            <BrandSecondarySignInButton
              key={provider}
              disabled={busy || !isSocialSignInAvailable(provider)}
              label={socialBrandName(provider)}
              loading={social.busyProvider === provider}
              onPress={() => void social.start(provider)}
              provider={provider}
            />
          ))}
        </View>
        {busy ? <AuthNotice brand>{progressLabel}</AuthNotice> : null}
        {social.error !== null ? (
          <AuthNotice brand danger>
            {t('error.generic')}
          </AuthNotice>
        ) : null}
      </BrandAuthScreen>
      <SocialSessionProgress
        label={progressLabel}
        visible={social.phase === 'session'}
      />
    </>
  );
}

export const HANDLE_ONBOARDING_DEBOUNCE_MS = 800;

/** A public ID is user-chosen; closing this blocking step leaves the session. */
export function HandleScreen(): ReactElement {
  const leave = useLeaveIncompleteOnboarding();
  const {theme} = useCPK();
  const {locale, defaultCurrency} = useLocale();
  const [handle, setHandle] = useState('');
  const debouncedHandle = useDebouncedValue(
    handle,
    HANDLE_ONBOARDING_DEBOUNCE_MS,
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
  const availability = useQuery(
    api.user.queries.checkHandleAvailability,
    !settled || !debouncedValid.ok ? 'skip' : {handle: debouncedHandle, now},
  );
  const claim = useMutation(api.user.mutations.claimHandle);
  const available = availability?.status === 'AVAILABLE';
  const invalid = settled && handle.length > 0 && !debouncedValid.ok;
  const unavailable =
    settled &&
    handle.length > 0 &&
    debouncedValid.ok &&
    (availability?.status === 'TAKEN' ||
      availability?.status === 'RESERVED' ||
      availability?.status === 'COOLDOWN' ||
      availability?.status === 'INVALID');

  const submit = async (): Promise<void> => {
    if (saving || !valid.ok || !settled || !available) return;
    setSaving(true);
    setFailed(false);
    try {
      await claim({
        handle,
        locale,
        preferredCurrency: defaultCurrency,
      });
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <OnboardingBlockingModal
      action={
        <AuthButton
          borderRadius={8}
          disabled={!valid.ok || !settled || !available}
          label={t('auth.claimUsername')}
          loading={saving}
          onPress={() => void submit()}
        />
      }
      onClose={leave}
      subtitle={t('auth.usernameDescription')}
      title={t('auth.usernameHeading')}
    >
      <AuthField
        accessibilityLabel={t('auth.usernameTitle')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        enablesReturnKeyAutomatically
        maxLength={20}
        onChangeText={(value) => {
          setHandle(value);
          setFailed(false);
        }}
        onSubmitEditing={() => void submit()}
        placeholder={t('auth.usernamePlaceholder')}
        returnKeyType="go"
        testID="auth-handle-input"
        value={handle}
      />
      {available ? (
        <AuthNotice align="start">
          {t('auth.usernameAvailable', {username: handle})}
        </AuthNotice>
      ) : invalid ? (
        <AuthNotice align="start" danger>
          {t('auth.usernameInvalid')}
        </AuthNotice>
      ) : unavailable ? (
        <AuthNotice align="start" danger>
          {t('auth.usernameTaken')}
        </AuthNotice>
      ) : null}
      {failed ? (
        <Typography.Body3 style={{color: theme.text.validation}}>
          {t('error.handle.taken')}
        </Typography.Body3>
      ) : null}
    </OnboardingBlockingModal>
  );
}

export function FinishIdentityProfile(): ReactElement | null {
  const {onboardingStep, user} = useSession();
  const leave = useLeaveIncompleteOnboarding();
  const complete = useMutation(api.user.mutations.completeProfileStep);
  const {locale, defaultCurrency} = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pending = useRef(false);
  const userId = user?.userId;
  const name =
    user === null
      ? ''
      : user.displayName.trim() || generatedDisplayName(String(user.userId));
  useEffect(() => {
    if (
      onboardingStep !== 'profile' ||
      userId === undefined ||
      name.length === 0
    )
      return;
    let active = true;
    pending.current = true;
    void complete({
      displayName: name,
      locale,
      preferredCurrency: defaultCurrency,
    })
      .then(() => {
        if (active) setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (!active) return;
        pending.current = false;
        setRetrying(false);
      });
    return () => {
      active = false;
    };
  }, [
    attempt,
    complete,
    defaultCurrency,
    locale,
    name,
    onboardingStep,
    userId,
  ]);

  if (onboardingStep !== 'profile' || !failed) return null;
  return (
    <OnboardingBlockingModal
      action={
        <AuthButton
          borderRadius={8}
          label={t('common.tryAgain')}
          loading={retrying}
          onPress={() => {
            if (pending.current) return;
            pending.current = true;
            setRetrying(true);
            setAttempt((value) => value + 1);
          }}
        />
      }
      onClose={leave}
      title={t('error.generic')}
    />
  );
}

export function OnboardingIndexScreen(): ReactElement | null {
  const {onboardingStep} = useSession();
  if (onboardingStep === null) return null;
  const route = onboardingRouteFor(onboardingStep);
  return <Redirect href={route ?? '/'} />;
}

export function LegacyClaimScreen(): ReactElement {
  const router = useRouter();
  const palette = useAuthPalette();
  const candidates = useQuery(api.legacy.queries.myLegacyCandidates);
  const claim = useMutation(api.legacy.mutations.claimLegacyAccount);
  const skip = useMutation(api.legacy.mutations.skipLegacyClaim);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (mode: 'claim' | 'skip'): Promise<void> => {
    if (saving || candidates === undefined) return;
    setSaving(true);
    setFailed(false);
    try {
      if (mode === 'claim')
        await claim({legacyUserIds: candidates.map((item) => item.id)});
      else await skip({});
      router.replace('/');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthScreen title={t('auth.login')} subtitle={t('error.legacy.ambiguous')}>
      {candidates?.map((candidate) => (
        <View
          key={candidate.id}
          style={[
            authStyles.card,
            {backgroundColor: palette.surface, borderColor: palette.border},
          ]}
        >
          <Typography.Body2
            $fontWeight="bold"
            style={[authStyles.label, {color: palette.text}]}
          >
            {candidate.displayName ?? t('auth.noName')}
          </Typography.Body2>
          <Typography.Body3 style={{color: palette.muted}}>
            {candidate.createdMonth} · {candidate.providers.join(', ')} ·{' '}
            {candidate.ledgerCount}
          </Typography.Body3>
        </View>
      ))}
      <AuthButton
        disabled={candidates === undefined || candidates.length === 0}
        label={t('common.yes')}
        loading={saving}
        onPress={() => void run('claim')}
      />
      <AuthButton
        label={t('common.no')}
        onPress={() => void run('skip')}
        secondary
      />
      {failed ? <AuthNotice danger>{t('error.generic')}</AuthNotice> : null}
    </AuthScreen>
  );
}

export function ProfileScreen(): ReactElement {
  const leave = useLeaveIncompleteOnboarding();
  const {locale, defaultCurrency} = useLocale();
  const complete = useMutation(api.user.mutations.completeProfileStep);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const checkedName = validateDisplayName(displayName);

  const submit = async (): Promise<void> => {
    if (saving || !checkedName.ok) return;
    setSaving(true);
    setFailed(false);
    try {
      await complete({
        displayName: checkedName.value,
        locale,
        preferredCurrency: defaultCurrency,
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingBlockingModal
      action={
        <AuthButton
          borderRadius={8}
          disabled={!checkedName.ok}
          label={t('common.done')}
          loading={saving}
          onPress={() => void submit()}
        />
      }
      onClose={leave}
      title={t('auth.displayNameHeading')}
    >
      <AuthField
        accessibilityLabel={t('auth.displayName')}
        autoFocus
        enablesReturnKeyAutomatically
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        onChangeText={setDisplayName}
        onSubmitEditing={() => void submit()}
        placeholder={t('auth.displayNamePlaceholder')}
        returnKeyType="go"
        testID="profile-display-name"
        value={displayName}
      />
      {!checkedName.ok && displayName.length > 0 ? (
        <AuthNotice align="start" danger>
          {t('settings.displayNameRule', {count: DISPLAY_NAME_MAX_LENGTH})}
        </AuthNotice>
      ) : null}
      {failed ? (
        <AuthNotice align="start" danger>
          {t('error.generic')}
        </AuthNotice>
      ) : null}
    </OnboardingBlockingModal>
  );
}

export function DeletedScreen(): ReactElement {
  const {signOut} = useSessionSignOut();
  const cancelDeletion = useMutation(api.user.mutations.cancelAccountDeletion);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const restore = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await cancelDeletion({});
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookooRecoveryScreen
      body={
        failed
          ? `${t('release.deleteAccountExplanation')} ${t('error.generic')}`
          : t('release.deleteAccountExplanation')
      }
      code={t('settings.account')}
      icon="ClockCounterClockwise"
      primaryAction={{
        label: t('settings.cancelAccountDeletion'),
        loading: saving,
        onPress: () => void restore(),
      }}
      secondaryAction={{
        disabled: saving,
        label: t('auth.logout'),
        onPress: () => void signOut(),
      }}
      testID="account-deletion-pending"
      title={t('error.account.deleted')}
    />
  );
}

export function SuspendedScreen(): ReactElement {
  const {signOut} = useSessionSignOut();
  return (
    <BookooRecoveryScreen
      body={t('settings.suspendedAccountBody')}
      code={t('settings.account')}
      icon="ShieldWarning"
      primaryAction={{
        label: t('release.support'),
        onPress: () => void Linking.openURL(PUBLIC_URLS.support),
      }}
      secondaryAction={{
        label: t('auth.logout'),
        onPress: () => void signOut(),
      }}
      testID="account-suspended"
      title={t('error.account.suspended')}
      tone="danger"
    />
  );
}
