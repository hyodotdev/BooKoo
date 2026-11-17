import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  AlertDialog,
  Button,
  CustomPressable,
  EditText,
  editTextInputMetrics,
  Icon,
  LoadingIndicator,
  Typography,
  useCPK,
} from 'cpk-ui';

import {publicLegalUrl} from '@shared/legal';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {getLocale, t} from '~/utils/i18n';
import {
  brandAuthSheetSpacerHeight,
  shouldShowAuthArtwork,
} from './brandAuthLayout';
import type {SocialProvider} from './social';

const LEGACY_DARK = BOOKOO_PALETTE.dusk;
const LEGACY_MUTED = BOOKOO_PALETTE.cloudyBlue;
const AUTH_BRAND_NAVY = BOOKOO_PALETTE.brandNavy;
const GOOGLE_BUTTON_STROKE = '#747775';
const KAKAO_BUTTON_YELLOW = '#FEE500';
const NAVER_BUTTON_GREEN = '#03C75A';
const CONTINUE_BUTTON_RADIUS = 26;
const LOGIN_DOCK_BACKGROUND = '#141D30';

/** cpk-ui EditText medium/large line boxes. Auth fields reserve two scaled lines. */
export const AUTH_FIELD_METRICS = {
  medium: editTextInputMetrics({fontSize: 16, padding: 10}),
  large: editTextInputMetrics({fontSize: 18, padding: 12}),
} as const;

export function authFieldInputMinHeight(
  size: keyof typeof AUTH_FIELD_METRICS,
  fontScale = PixelRatio.getFontScale(),
  lines = 2,
): number {
  const metrics = AUTH_FIELD_METRICS[size];
  return (
    Math.round(metrics.lineHeight * Math.max(fontScale, 1)) * lines +
    metrics.paddingTop +
    metrics.paddingBottom
  );
}

function authFieldInputStyle(
  size: keyof typeof AUTH_FIELD_METRICS,
  extra?: TextStyle,
): TextStyle {
  const metrics = AUTH_FIELD_METRICS[size];
  return {
    includeFontPadding: false,
    lineHeight: metrics.lineHeight,
    minHeight: authFieldInputMinHeight(size),
    overflow: 'visible',
    paddingBottom: metrics.paddingBottom,
    paddingTop: metrics.paddingTop,
    ...extra,
  };
}

type MainSignInMethod = 'email' | Extract<SocialProvider, 'apple' | 'google'>;
type SecondarySignInMethod = Extract<SocialProvider, 'kakao' | 'naver'>;

export function useAuthPalette() {
  const {theme} = useCPK();
  return {
    background: theme.bg.basic,
    surface: theme.bg.basic,
    text: theme.text.basic,
    muted: theme.text.label,
    border: theme.role.border,
    accent: theme.role.primary,
    danger: theme.role.danger,
  };
}

function AuthArtwork({visible}: {visible: boolean}): ReactElement {
  return (
    <View
      pointerEvents="none"
      style={[styles.authArtwork, !visible && styles.hiddenArtwork]}
      testID="auth-artwork"
    >
      <View style={styles.authArtworkImage}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={require('../../../assets/brand/shared-ledger-artwork.webp')}
          style={styles.authArtworkFill}
        />
      </View>
    </View>
  );
}

/**
 * Keeps the field's action in view with the keyboard up, not only the field:
 * 24pt breathing room + the 20pt form gap + the 56pt button. With 24 alone a
 * 731dp Android phone hid the code screen's Login under the keyboard.
 */
export const LOGIN_FORM_KEYBOARD_OFFSET = 24 + 20 + 56;

export function LoginFormScreen({
  children,
  onBack,
  subtitle,
  title,
}: PropsWithChildren<{
  onBack?: () => void;
  subtitle?: string;
  title: string;
}>): ReactElement {
  const {theme} = useCPK();
  const dimensions = useWindowDimensions();
  const artworkVisible = shouldShowAuthArtwork(dimensions);
  const formScroll = useRef<KeyboardAwareScrollViewRef>(null);
  const keepInputVisible = useCallback((): void => {
    formScroll.current?.assureFocusedInputVisible();
  }, []);
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[
        styles.flex,
        artworkVisible && styles.authColumns,
        {
          backgroundColor: artworkVisible ? AUTH_BRAND_NAVY : theme.bg.basic,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'padding' : undefined}
        style={[styles.flex, {backgroundColor: theme.bg.basic}]}
      >
        <KeyboardAwareScrollView
          bottomOffset={LOGIN_FORM_KEYBOARD_OFFSET}
          mode={Platform.OS === 'ios' ? 'layout' : 'insets'}
          onLayout={keepInputVisible}
          ref={formScroll}
          style={styles.flex}
          contentContainerStyle={[
            styles.loginForm,
            artworkVisible && styles.loginFormWide,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {onBack === undefined ? null : (
            <CustomPressable
              accessibilityLabel={t('a11y.back')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onBack}
              style={styles.backButton}
              testID="auth-back"
            >
              <Icon color={theme.text.basic} name="CaretLeft" size={25} />
            </CustomPressable>
          )}
          <Typography.Heading2
            accessibilityRole="header"
            $fontWeight="bold"
            style={[styles.loginTitle, {color: theme.text.basic}]}
          >
            {title}
          </Typography.Heading2>
          {subtitle === undefined ? null : (
            <Typography.Body2
              style={[styles.loginSubtitle, {color: theme.text.label}]}
            >
              {subtitle}
            </Typography.Body2>
          )}
          {children}
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
      <AuthArtwork visible={artworkVisible} />
    </SafeAreaView>
  );
}

export const IDENTITY_DIALOG_DISMISS_GRACE_MS = 800;

export function shouldIgnoreIdentityDialogDismiss(
  openedAt: number,
  now: number,
): boolean {
  return now - openedAt < IDENTITY_DIALOG_DISMISS_GRACE_MS;
}

export function OnboardingBlockingModal({
  action,
  children,
  onClose,
  subtitle,
  title,
}: PropsWithChildren<{
  action?: ReactElement;
  onClose: () => void;
  subtitle?: string;
  title: string;
}>): ReactElement {
  const {theme} = useCPK();
  const openedAtRef = useRef<number | null>(null);
  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);
  const dismiss = useCallback(() => {
    const openedAt = openedAtRef.current;
    if (
      openedAt === null ||
      shouldIgnoreIdentityDialogDismiss(openedAt, Date.now())
    )
      return;
    onClose();
  }, [onClose]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        dismiss();
        return true;
      },
    );
    return () => subscription.remove();
  }, [dismiss]);
  return (
    <AlertDialog
      renderActions={action === undefined ? undefined : () => [action]}
      renderBody={() => (
        <View style={styles.onboardingBody} testID="onboarding-blocking-modal">
          {subtitle === undefined ? null : (
            <Typography.Body2 style={{color: theme.text.label}}>
              {subtitle}
            </Typography.Body2>
          )}
          {children}
        </View>
      )}
      closeOnTouchOutside={false}
      onClose={dismiss}
      showCloseButton
      size="large"
      title={title}
      visible
    />
  );
}

export function AuthScreen({
  title,
  subtitle,
  children,
  onBack,
  backLabel = 'Back',
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}>): ReactElement {
  const palette = useAuthPalette();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, {backgroundColor: palette.background}]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
        >
          {onBack === undefined ? null : (
            <CustomPressable
              accessibilityLabel={backLabel}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onBack}
              style={styles.backButton}
            >
              <Icon color={palette.text} name="CaretLeft" size={25} />
            </CustomPressable>
          )}
          <View style={styles.heading}>
            <Typography.Heading2
              accessibilityRole="header"
              $fontWeight="bold"
              style={{color: palette.text}}
            >
              {title}
            </Typography.Heading2>
            {subtitle === undefined ? null : (
              <Typography.Body2
                style={[styles.authSubtitle, {color: palette.muted}]}
              >
                {subtitle}
              </Typography.Body2>
            )}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function BrandAuthScreen({
  children,
  compact = false,
  line,
  onBack,
  showPolicy = false,
}: PropsWithChildren<{
  compact?: boolean;
  line?: string;
  onBack?: () => void;
  showPolicy?: boolean;
}>): ReactElement {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const {height: windowHeight} = dimensions;
  const artworkVisible = shouldShowAuthArtwork(dimensions);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const [titleHeight, setTitleHeight] = useState(0);
  const canvasHeight = viewportHeight || windowHeight;
  const titleSpace = titleHeight || (compact ? 96 : 200);
  const spacerHeight = artworkVisible
    ? Math.max(0, (canvasHeight - dockHeight - titleSpace) / 2) + titleSpace
    : brandAuthSheetSpacerHeight({
        dockHeight,
        minTitleSpace: titleSpace,
        viewportHeight: canvasHeight,
      });
  const onViewportLayout = (event: LayoutChangeEvent): void => {
    setViewportHeight(event.nativeEvent.layout.height);
  };
  const onDockLayout = (event: LayoutChangeEvent): void => {
    setDockHeight(event.nativeEvent.layout.height);
  };
  const onTitleLayout = (event: LayoutChangeEvent): void => {
    setTitleHeight(event.nativeEvent.layout.height);
  };

  return (
    <View
      style={[
        styles.brandSafeArea,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {onBack === undefined ? (
          <View style={styles.brandHeaderSpacer} />
        ) : (
          <View style={styles.brandHeader}>
            <CustomPressable
              accessibilityLabel={t('a11y.back')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onBack}
              style={styles.brandBackButton}
              testID="auth-back"
            >
              <Icon color={BOOKOO_PALETTE.white} name="CaretLeft" size={26} />
            </CustomPressable>
          </View>
        )}
        <View style={[styles.flex, artworkVisible && styles.authColumns]}>
          <View onLayout={onViewportLayout} style={styles.flex}>
            <View
              pointerEvents="none"
              style={[
                styles.brandTitleOverlay,
                {
                  height: artworkVisible ? titleSpace : spacerHeight,
                  top: artworkVisible ? spacerHeight - titleSpace : 0,
                },
              ]}
            >
              <View
                onLayout={onTitleLayout}
                style={[styles.brandHero, compact && styles.brandHeroCompact]}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityLabel="BooKoo"
                  accessibilityRole="header"
                  resizeMode="contain"
                  source={require('../../../assets/brand/logo.png')}
                  style={styles.brandLogo}
                />
                {compact || line === undefined ? null : (
                  <Typography.Body1 $fontWeight="bold" style={styles.brandLine}>
                    {line}
                  </Typography.Body1>
                )}
              </View>
            </View>
            <ScrollView
              alwaysBounceVertical={false}
              bounces={false}
              contentContainerStyle={styles.brandSheetContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
              style={styles.brandSheetScroll}
              testID="auth-brand-scroll"
            >
              <View style={{height: spacerHeight}} />
              <View
                onLayout={onDockLayout}
                style={[
                  styles.loginDock,
                  artworkVisible && styles.loginDockWide,
                  {paddingBottom: Math.max(16, insets.bottom + 8)},
                ]}
              >
                <View style={styles.loginDockInner}>
                  {children}
                  {showPolicy ? <BrandPolicyNotice /> : null}
                </View>
              </View>
            </ScrollView>
          </View>
          <AuthArtwork visible={artworkVisible} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function BrandPolicyNotice(): ReactElement {
  const notice = t('intro.agreementNotice', {
    terms: `**${t('intro.terms')}**`,
    privacy: `**${t('intro.privacy')}**`,
  });
  const terms = t('intro.terms');
  const privacy = t('intro.privacy');
  const locale = getLocale();
  return (
    <Typography.Body2 style={styles.policyCopy} testID="auth-policy-notice">
      {notice.split('**').map((part, index) => {
        if (part !== terms && part !== privacy) {
          return part;
        }
        const document = part === terms ? 'terms' : 'privacy';
        return (
          <Typography.Body2
            accessibilityLabel={part}
            accessibilityRole="link"
            key={`${document}-${String(index)}`}
            onPress={() => {
              void Linking.openURL(publicLegalUrl(document, locale));
            }}
            style={styles.policyLink}
            testID={`auth-policy-${document}`}
          >
            {part}
          </Typography.Body2>
        );
      })}
    </Typography.Body2>
  );
}

export function AuthField({
  brand = false,
  endElement,
  ...props
}: TextInputProps & {
  brand?: boolean;
  endElement?: ReactElement;
}): ReactElement {
  const {theme} = useCPK();
  const {
    accessibilityLabel,
    autoCapitalize,
    autoComplete,
    maxLength,
    onChangeText,
    onSubmitEditing,
    placeholder,
    secureTextEntry,
    testID,
    value,
    style: _style,
    ...textInputProps
  } = props;
  const caretColor = brand ? BOOKOO_PALETTE.white : theme.text.basic;
  const size = brand ? 'large' : 'medium';
  const inputStyle = authFieldInputStyle(
    size,
    brand ? styles.brandFieldInput : undefined,
  );
  return (
    <EditText
      accessibilityLabel={accessibilityLabel}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      decoration={brand ? 'boxed' : 'underline'}
      endElement={endElement}
      hideCounter
      label={accessibilityLabel}
      maxLength={maxLength}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      placeholder={placeholder}
      secureTextEntry={secureTextEntry}
      size={size}
      style={brand ? styles.brandField : undefined}
      styles={{
        container: brand
          ? styles.brandFieldContainer
          : styles.formFieldContainer,
        input: inputStyle,
        inputContainer: styles.formFieldInputContainer,
        label: brand ? styles.brandFieldLabel : styles.formFieldLabel,
        labelContainer: styles.formFieldLabelContainer,
      }}
      testID={testID}
      textInputProps={{
        ...textInputProps,
        cursorColor: caretColor,
        selectionColor: caretColor,
      }}
      value={value}
    />
  );
}

/**
 * Android clipped the scaled label at the largest system text size (R86), so
 * it keeps the field-height floor there, centered. iOS lets cpk-ui's button
 * center its natural line box; a floor there pins the label to the top.
 */
export function authButtonLabelStyle(fontScale: number): TextStyle {
  return Platform.OS === 'android'
    ? {
        minHeight: authFieldInputMinHeight('medium', fontScale, 1),
        textAlignVertical: 'center',
      }
    : {};
}

export function AuthButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  secondary = false,
  borderRadius = 16,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  borderRadius?: number;
  /** Layout from the parent, e.g. cpk-ui AlertDialog's `flex: 1` action slot. */
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  const {theme} = useCPK();
  const {fontScale} = useWindowDimensions();
  return (
    <StableButtonLoadingFrame
      backgroundColor={secondary ? theme.bg.basic : theme.role.primary}
      borderRadius={borderRadius}
      indicatorColor={secondary ? theme.role.primary : theme.text.contrast}
      label={label}
      loading={loading}
      style={style}
    >
      <Button
        accessibilityLabel={label}
        borderRadius={borderRadius}
        color="primary"
        disabled={disabled || loading}
        onPress={onPress}
        size="large"
        styles={{
          text: [styles.buttonLabel, authButtonLabelStyle(fontScale)],
        }}
        text={label}
        type={secondary ? 'outlined' : 'solid'}
      />
    </StableButtonLoadingFrame>
  );
}

function StableButtonLoadingFrame({
  backgroundColor,
  borderRadius,
  children,
  indicatorColor,
  label,
  loading,
  style,
}: PropsWithChildren<{
  backgroundColor: string;
  borderRadius: number;
  indicatorColor: string;
  label: string;
  loading: boolean;
  style?: StyleProp<ViewStyle>;
}>): ReactElement {
  return (
    <View
      accessibilityLabel={loading ? label : undefined}
      accessibilityRole={loading ? 'button' : undefined}
      accessibilityState={loading ? {busy: true, disabled: true} : undefined}
      accessible={loading}
      collapsable={false}
      style={[styles.stableButtonFrame, style]}
    >
      <View
        accessibilityElementsHidden={loading}
        collapsable={false}
        importantForAccessibility={loading ? 'no-hide-descendants' : 'auto'}
        style={styles.stableButtonContent}
      >
        {children}
      </View>
      <View
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.stableButtonLoading,
          {backgroundColor, borderRadius, opacity: loading ? 1 : 0},
        ]}
      >
        <ActivityIndicator
          animating={loading}
          color={indicatorColor}
          size="small"
        />
      </View>
    </View>
  );
}

export function BrandActionButton({
  disabled = false,
  label,
  loading = false,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <StableButtonLoadingFrame
      backgroundColor={theme.role.primary}
      borderRadius={16}
      indicatorColor={theme.text.contrast}
      label={label}
      loading={loading}
    >
      <Button
        accessibilityLabel={label}
        borderRadius={16}
        color="primary"
        disabled={disabled || loading}
        onPress={onPress}
        size="large"
        style={styles.brandAction}
        text={label}
      />
    </StableButtonLoadingFrame>
  );
}

function signInMark(
  provider: MainSignInMethod | SecondarySignInMethod,
): ReactElement {
  switch (provider) {
    case 'email':
      return <Icon color={LEGACY_DARK} name="EnvelopeSimpleFill" size={24} />;
    case 'apple':
      return (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={require('../../../assets/brand/apple-logo.png')}
          style={styles.appleMark}
        />
      );
    case 'google':
      return (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={require('../../../assets/brand/google-g.png')}
          style={styles.googleMark}
        />
      );
    case 'kakao':
      return (
        <View style={[styles.secondaryBrandMark, styles.kakaoMark]}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../../assets/brand/kakao-talk.png')}
            style={styles.secondaryBrandLogo}
          />
        </View>
      );
    case 'naver':
      return (
        <View style={[styles.secondaryBrandMark, styles.naverMark]}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../../assets/brand/naver-n.png')}
            style={styles.secondaryBrandLogo}
          />
        </View>
      );
  }
}

export function BrandMainSignInButton({
  disabled,
  label,
  loading,
  onPress,
  provider,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
  provider: MainSignInMethod;
}): ReactElement {
  const idle = !(disabled || loading);
  return (
    <StableButtonLoadingFrame
      backgroundColor={BOOKOO_PALETTE.white}
      borderRadius={CONTINUE_BUTTON_RADIUS}
      indicatorColor={LEGACY_DARK}
      label={label}
      loading={loading}
    >
      <CustomPressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{busy: loading, disabled: !idle}}
        disabled={!idle}
        onPress={onPress}
        style={[
          styles.mainSignInPressable,
          provider === 'google'
            ? styles.googleSignInButtonContainer
            : styles.appleSignInButtonContainer,
          !idle && styles.mainSignInButtonDisabled,
        ]}
        testID={`auth-continue-${provider}`}
      >
        <View style={styles.continueRow}>
          {signInMark(provider)}
          <Typography.Body1
            $fontWeight="bold"
            style={[
              styles.mainSignInButtonText,
              !idle && styles.mainSignInButtonDisabledText,
            ]}
          >
            {label}
          </Typography.Body1>
        </View>
      </CustomPressable>
    </StableButtonLoadingFrame>
  );
}

export function BrandSecondarySignInButton({
  disabled,
  label,
  loading,
  onPress,
  provider,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
  provider: SecondarySignInMethod;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{busy: loading, disabled: disabled || loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.secondarySignInButton,
        provider === 'kakao' ? styles.kakaoMark : styles.naverMark,
      ]}
      testID={`auth-continue-${provider}`}
    >
      <View
        collapsable={false}
        style={[
          disabled && !loading && styles.secondarySignInIconDisabled,
          loading && styles.hiddenProviderMark,
        ]}
      >
        {signInMark(provider)}
      </View>
      <View
        collapsable={false}
        pointerEvents="none"
        style={[styles.stableButtonLoading, {opacity: loading ? 1 : 0}]}
      >
        <ActivityIndicator
          animating={loading}
          color={provider === 'kakao' ? LEGACY_DARK : BOOKOO_PALETTE.white}
          size="small"
          testID={`auth-${provider}-spinner`}
        />
      </View>
    </CustomPressable>
  );
}

/** Auth-owned session exchange feedback, after the native provider returns. */
export function SocialSessionProgress({
  label,
  visible,
}: {
  readonly label: string;
  readonly visible: boolean;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <AlertDialog
      backdropOpacity={0.45}
      closeOnTouchOutside={false}
      renderHeader={() => null}
      showCloseButton={false}
      styles={{
        container: styles.socialProgressCard,
        bodyContainer: {marginTop: 0, marginBottom: 0},
      }}
      title={label}
      visible={visible}
      body={
        <View
          accessible
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityState={{busy: true}}
          style={styles.socialProgressContent}
          testID="auth-session-progress"
        >
          <LoadingIndicator color={theme.role.primary} size="large" />
          <Typography.Body2 style={styles.socialProgressLabel}>
            {label}
          </Typography.Body2>
        </View>
      }
    />
  );
}

export function BrandLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.brandLink}
    >
      <Typography.Body3 style={styles.brandLinkText}>{label}</Typography.Body3>
    </CustomPressable>
  );
}

export function AuthNotice({
  children,
  danger = false,
  brand = false,
  align = 'center',
}: {
  children: ReactNode;
  danger?: boolean;
  brand?: boolean;
  /** `start` follows a left-aligned dialog body instead of a centered form. */
  align?: 'center' | 'start';
}): ReactElement {
  const palette = useAuthPalette();
  return (
    <Typography.Body3
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        align === 'start' && styles.noticeStart,
        {
          color: brand
            ? danger
              ? '#FF9AAF'
              : LEGACY_MUTED
            : danger
              ? palette.danger
              : palette.muted,
        },
      ]}
    >
      {children}
    </Typography.Body3>
  );
}

export const authStyles = StyleSheet.create({
  actions: {gap: 10},
  card: {borderRadius: 4, borderWidth: 1, gap: 12, padding: 16},
  helpIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  helpPanel: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 18,
  },
  mainSignInActions: {gap: 12},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  suggestionChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {fontSize: 14, fontWeight: '700'},
  secondarySignInActions: {
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  authColumns: {flexDirection: 'row'},
  authArtwork: {
    alignItems: 'center',
    backgroundColor: AUTH_BRAND_NAVY,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    padding: 24,
  },
  authArtworkImage: {aspectRatio: 1, maxWidth: 520, width: '100%'},
  authArtworkFill: {height: '100%', width: '100%'},
  hiddenArtwork: {display: 'none'},
  authSubtitle: {lineHeight: 23, maxWidth: 520},
  backButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginLeft: -10,
    width: 44,
  },
  flex: {flex: 1},
  brandAction: {minHeight: 56},
  buttonLabel: {fontWeight: 'bold'},
  brandBackButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  brandField: {backgroundColor: BOOKOO_PALETTE.white},
  brandFieldContainer: {
    backgroundColor: BOOKOO_PALETTE.white,
    borderColor: BOOKOO_PALETTE.cloudyBlue,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 54,
    overflow: 'visible',
  },
  brandFieldInput: {color: LEGACY_DARK},
  brandFieldLabel: {color: BOOKOO_PALETTE.lightGray, flexShrink: 1},
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  brandHeaderSpacer: {height: 12},
  brandTitleOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  brandHero: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  brandHeroCompact: {paddingBottom: 16, paddingTop: 8},
  brandSheetContent: {flexGrow: 1},
  brandSheetScroll: {elevation: 2, flex: 1, zIndex: 1},
  brandLine: {
    color: BOOKOO_PALETTE.lightGray,
    lineHeight: 26,
    fontSize: 16,
    marginTop: 36,
    maxWidth: 400,
    paddingHorizontal: 24,
    textAlign: 'center',
  },

  brandLink: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  brandLinkText: {
    color: BOOKOO_PALETTE.main,
    textDecorationLine: 'underline',
  },
  brandLogo: {height: 60, width: 200},
  brandSafeArea: {backgroundColor: AUTH_BRAND_NAVY, flex: 1},
  continueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  appleMark: {height: 30, width: 24},
  googleMark: {height: 24, width: 24},
  secondaryBrandMark: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  secondaryBrandLogo: {height: 24, width: 24},
  kakaoMark: {backgroundColor: KAKAO_BUTTON_YELLOW},
  naverMark: {backgroundColor: NAVER_BUTTON_GREEN},
  loginDock: {
    alignSelf: 'stretch',
    backgroundColor: LOGIN_DOCK_BACKGROUND,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    flexShrink: 0,
    overflow: 'hidden',
    paddingTop: 28,
    width: '100%',
  },
  loginDockInner: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 400,
    paddingHorizontal: 24,
    width: '100%',
  },
  loginDockWide: {backgroundColor: AUTH_BRAND_NAVY},
  loginFormWide: {flexGrow: 1, justifyContent: 'center'},
  policyCopy: {
    color: BOOKOO_PALETTE.lightGray,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 4,
    textAlign: 'center',
  },
  policyLink: {
    color: BOOKOO_PALETTE.white,
    fontSize: 13,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  formFieldContainer: {borderRadius: 0, overflow: 'visible'},
  formFieldInputContainer: {alignItems: 'center', overflow: 'visible'},
  formFieldLabel: {flexShrink: 1},
  formFieldLabelContainer: {alignItems: 'flex-start', flexWrap: 'wrap'},
  appleSignInButtonContainer: {
    borderColor: 'rgba(60,60,60,0.45)',
  },
  googleSignInButtonContainer: {
    borderColor: GOOGLE_BUTTON_STROKE,
  },
  mainSignInPressable: {
    alignItems: 'center',
    backgroundColor: BOOKOO_PALETTE.white,
    borderRadius: CONTINUE_BUTTON_RADIUS,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 8,
    width: '100%',
  },
  mainSignInButtonDisabled: {
    backgroundColor: BOOKOO_PALETTE.white,
    borderColor: 'rgba(116,119,117,0.22)',
    opacity: 0.55,
  },
  mainSignInButtonDisabledText: {color: BOOKOO_PALETTE.mediumGray},
  mainSignInButtonText: {
    color: BOOKOO_PALETTE.apple,
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
    textAlign: 'center',
  },

  stableButtonContent: {alignSelf: 'stretch'},
  hiddenProviderMark: {opacity: 0},
  socialProgressCard: {borderRadius: 24, maxWidth: 320},
  socialProgressContent: {alignItems: 'center', gap: 16, paddingVertical: 8},
  socialProgressLabel: {textAlign: 'center'},
  stableButtonFrame: {alignSelf: 'stretch', position: 'relative'},
  stableButtonLoading: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  screen: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: 20,
    maxWidth: 640,
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 16,
    width: '100%',
  },
  heading: {gap: 8, marginBottom: 8},
  loginForm: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: 20,
    maxWidth: 640,
    paddingBottom: 40,
    paddingHorizontal: 28,
    paddingTop: 8,
    width: '100%',
  },
  loginSubtitle: {flexShrink: 1, lineHeight: 22, marginBottom: 4},
  loginTitle: {marginBottom: 12, marginTop: 20},
  onboardingBody: {gap: 16},
  notice: {lineHeight: 20, textAlign: 'center'},
  noticeStart: {textAlign: 'left'},
  secondarySignInButton: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  secondarySignInIconDisabled: {opacity: 0.35},
});
