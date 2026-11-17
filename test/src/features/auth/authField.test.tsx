import {PixelRatio, StyleSheet} from 'react-native';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';

import {
  AUTH_FIELD_METRICS,
  AuthField,
  authFieldInputMinHeight,
} from '~/features/auth/ui';
import {SignInCodeScreen} from '~/features/auth/screens';
import {theme} from '~/theme';
import {setActiveLocale, t} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

const LOCALES = ['ko', 'en', 'ja', 'zh', 'id'] as const;

function renderField({
  accessibilityLabel,
  placeholder,
  testID,
}: {
  accessibilityLabel: string;
  placeholder: string;
  testID: string;
}) {
  return render(
    <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
      <AuthField
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        testID={testID}
        value=""
      />
    </CpkProvider>,
    {wrapper: TestSafeAreaProvider},
  );
}

function inputLineBox(testID: string, screen: ReturnType<typeof render>) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe('auth field line box', () => {
  afterEach(() => {
    setActiveLocale('en');
    jest.restoreAllMocks();
  });

  it.each(LOCALES)(
    'keeps the %s email placeholder inside a two-line box',
    (locale) => {
      setActiveLocale(locale);
      const placeholder = t('auth.emailPlaceholder');
      const screen = renderField({
        accessibilityLabel: t('auth.email'),
        placeholder,
        testID: 'auth-email-input',
      });
      const input = screen.getByTestId('auth-email-input');
      const style = inputLineBox('auth-email-input', screen);
      const metrics = AUTH_FIELD_METRICS.medium;

      expect(input.props.placeholder).toBe(placeholder);
      expect(input.props.value).toBe('');
      expect(style.includeFontPadding).toBe(false);
      expect(style.overflow).toBe('visible');
      expect(style.paddingTop).toBe(metrics.paddingTop);
      expect(style.paddingBottom).toBe(metrics.paddingBottom);
      expect(style.lineHeight).toBe(metrics.lineHeight);
      expect(style.minHeight).toBe(authFieldInputMinHeight('medium'));
      expect(style.minHeight).toBeGreaterThanOrEqual(
        metrics.lineHeight * 2 + metrics.paddingTop + metrics.paddingBottom,
      );
    },
  );

  it.each(LOCALES)(
    'keeps the %s OTP placeholder inside the same unclipped box',
    (locale) => {
      setActiveLocale(locale);
      const placeholder = t('auth.otpPlaceholder');
      const screen = renderField({
        accessibilityLabel: placeholder,
        placeholder,
        testID: 'auth-otp-input',
      });
      const style = inputLineBox('auth-otp-input', screen);

      expect(screen.getByTestId('auth-otp-input').props.placeholder).toBe(
        placeholder,
      );
      expect(style.minHeight).toBe(authFieldInputMinHeight('medium'));
      expect(style.includeFontPadding).toBe(false);
      expect(style.overflow).toBe('visible');
    },
  );

  it('grows with the system font scale instead of clipping the second line', () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    const screen = renderField({
      accessibilityLabel: t('auth.email'),
      placeholder: t('auth.emailPlaceholder'),
      testID: 'auth-email-input',
    });
    const style = inputLineBox('auth-email-input', screen);
    const expected = authFieldInputMinHeight('medium', 2, 2);

    expect(style.minHeight).toBe(expected);
    expect(expected).toBeGreaterThan(authFieldInputMinHeight('medium', 1, 2));
  });
});

describe('sign-in code screen', () => {
  it.each(LOCALES)(
    'labels the %s code field apart from its placeholder hint',
    (locale) => {
      setActiveLocale(locale);
      const screen = render(
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <SignInCodeScreen email="qa@example.test" provider="bookoo-otp" />
        </CpkProvider>,
        {wrapper: TestSafeAreaProvider},
      );
      const input = screen.getByTestId('auth-otp-input');

      expect(input.props.placeholder).toBe(t('auth.otpPlaceholder'));
      expect(screen.getByText(t('auth.otpLabel'))).toBeTruthy();
      expect(t('auth.otpLabel')).not.toBe(t('auth.otpPlaceholder'));
    },
  );
});
