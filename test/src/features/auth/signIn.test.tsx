import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {brandAuthSheetSpacerHeight} from '../../../../src/features/auth/brandAuthLayout';

describe('sign-in composition', () => {
  it('wires Martie-style tappable legal links on the intro dock', () => {
    const chrome = readFileSync(
      resolve(process.cwd(), 'src/features/auth/ui.tsx'),
      'utf8',
    );
    expect(chrome).toContain('testID={`auth-policy-${document}`}');
    expect(chrome).toContain('accessibilityRole="link"');
    expect(chrome).toContain('publicLegalUrl(document, locale)');
  });

  it('keeps the signed-out intro on the brand wordmark and one line', () => {
    const screens = readFileSync(
      resolve(process.cwd(), 'src/features/auth/screens.tsx'),
      'utf8',
    );
    const signIn = screens.slice(
      screens.indexOf('export function SignInScreen'),
      screens.indexOf('export function HandleScreen'),
    );
    const chrome = readFileSync(
      resolve(process.cwd(), 'src/features/auth/ui.tsx'),
      'utf8',
    );
    expect(signIn).toContain("t('intro.signInSupporting')");
    expect(signIn).toContain("router.navigate('/sign-in-email')");
    expect(signIn).not.toContain('emailExpanded');
    expect(signIn).not.toContain('forgotPassword');
    expect(signIn).not.toContain('legacy-help');
    expect(chrome).toContain('assets/brand/logo.png');
    expect(chrome).toContain('assets/brand/google-g.png');
    expect(chrome).toContain('assets/brand/apple-logo.png');
    expect(chrome).toContain('assets/brand/kakao-talk.png');
    expect(chrome).toContain('assets/brand/naver-n.png');
    expect(chrome).not.toContain('kakao-talk-round.png');
    expect(chrome).not.toContain('naver-n-round.png');
    expect(chrome).not.toContain('AppleLogoFill');
    expect(chrome).toContain('continueRow');
    expect(chrome).not.toContain('ChatCircleDotsFill');
    expect(chrome).not.toContain('secondarySignInLabel');
    expect(chrome).not.toContain('startElement');
    expect(chrome).toContain('GOOGLE_BUTTON_STROKE');
    expect(chrome).toContain(
      '<Typography.Body1 $fontWeight="bold" style={styles.brandLine}>',
    );
    expect(chrome).toContain('lineHeight: 26');
    expect(chrome).toContain('maxWidth: 400');
    expect(chrome).toContain('marginTop: 36');
    expect(chrome).toContain('paddingHorizontal: 24');
    expect(chrome).not.toContain('Wallet');
    expect(chrome).not.toContain('LinearGradient');
    expect(chrome).toContain('borderColor: BOOKOO_PALETTE.cloudyBlue');
    expect(chrome).toContain('testID="auth-back"');
    expect(chrome).toContain('paddingTop: 28');
    expect(chrome).toContain('borderTopLeftRadius: 32');
    expect(chrome).toContain('borderTopRightRadius: 32');
    expect(chrome).toContain('EnvelopeSimpleFill" size={24}');
    expect(chrome).toContain('appleMark: {height: 30, width: 24}');
    expect(chrome).toContain('googleMark: {height: 24, width: 24}');
    expect(chrome).toContain('KAKAO_BUTTON_YELLOW');
    expect(chrome).toContain('NAVER_BUTTON_GREEN');
    expect(chrome).toContain('secondaryBrandLogo: {height: 24, width: 24}');
    expect(chrome).toContain('borderRadius: 24');
    expect(chrome).toContain("overflow: 'hidden'");
    expect(chrome).toContain('<Typography.Body2');
    expect(chrome).toContain('color: BOOKOO_PALETTE.lightGray');
    expect(chrome).not.toContain('Typography.Body4');
    expect(chrome).toContain('testID="auth-brand-scroll"');
    expect(chrome).toContain('brandAuthSheetSpacerHeight');
    expect(chrome).toContain('brandTitleOverlay');
    expect(chrome).toContain("position: 'absolute'");
    expect(chrome).toContain('pointerEvents="none"');
    expect(chrome).toContain('function LoginFormScreen');
    expect(chrome).toContain('cursorColor: caretColor');
    expect(screens).toContain('returnKeyType="go"');
    expect(screens).toContain("placeholder={t('auth.emailPlaceholder')}");
    expect(screens).toContain("subtitle={t('auth.otpSent', {email})}");
    expect(screens).toContain("placeholder={t('auth.otpPlaceholder')}");
    expect(screens).not.toContain("placeholder={t('auth.otpSent'");
    expect(screens).toContain('onSubmitEditing={submit}');
    expect(chrome).toContain('LOGIN_DOCK_BACKGROUND');
    expect(chrome).toContain('bounces={false}');
    expect(chrome).not.toContain('loginDockFill');
    const brand = chrome.slice(
      chrome.indexOf('export function BrandAuthScreen'),
      chrome.indexOf('export function BrandPolicyNotice'),
    );
    expect(brand).toContain('paddingTop: insets.top');
    expect(brand).not.toContain('edges=');
  });

  it('requires a chosen public ID while generating only a missing name', () => {
    const screens = readFileSync(
      resolve(process.cwd(), 'src/features/auth/screens.tsx'),
      'utf8',
    );
    const handle = screens.slice(
      screens.indexOf('export function HandleScreen'),
      screens.indexOf('export function FinishIdentityProfile'),
    );
    expect(handle).toContain('api.user.mutations.claimHandle');
    expect(handle).not.toContain('claimGeneratedIdentity');
    expect(handle).toContain('<OnboardingBlockingModal');
    expect(handle).toContain('auth-handle-input');
    expect(handle).toContain('HANDLE_ONBOARDING_DEBOUNCE_MS');
    expect(screens).toContain('export function FinishIdentityProfile');
    expect(screens).toContain('generatedDisplayName(String(user.userId))');
    const rootLayout = readFileSync(
      resolve(process.cwd(), 'app/_layout.tsx'),
      'utf8',
    );
    expect(rootLayout).toContain('sessionRendersSignedInShell');
    expect(rootLayout).toContain('<HandleScreen />');
    expect(rootLayout).toContain('<FinishIdentityProfile />');
    expect(rootLayout).not.toContain('<ProfileScreen />');
  });

  it('keeps the login sheet on the bottom and lifts it when the canvas is short', () => {
    expect(
      brandAuthSheetSpacerHeight({
        dockHeight: 400,
        minTitleSpace: 180,
        viewportHeight: 1000,
      }),
    ).toBe(600);
    expect(
      brandAuthSheetSpacerHeight({
        dockHeight: 420,
        minTitleSpace: 180,
        viewportHeight: 360,
      }),
    ).toBe(180);
    expect(
      brandAuthSheetSpacerHeight({
        dockHeight: 0,
        minTitleSpace: 180,
        viewportHeight: 800,
      }),
    ).toBe(180);
  });
});
