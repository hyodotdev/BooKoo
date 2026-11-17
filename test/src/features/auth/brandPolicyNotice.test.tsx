import {fireEvent, render} from '@testing-library/react-native';
import {Linking, StyleSheet} from 'react-native';
import {CpkProvider} from 'cpk-ui';
import {AuthField, BrandPolicyNotice} from '~/features/auth/ui';
import {theme} from '~/theme';
import {setActiveLocale, t} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../../testUtils';

describe('inline sign-in policy sentence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setActiveLocale('en');
  });

  it.each(['en', 'ko'] as const)(
    'keeps %s copy and both links inside one text flow',
    (locale) => {
      setActiveLocale(locale);
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      open.mockClear();
      const screen = render(
        <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
          <BrandPolicyNotice />
        </CpkProvider>,
        {wrapper: TestSafeAreaProvider},
      );
      const sentence = screen.getByTestId('auth-policy-notice');
      expect(sentence).toHaveTextContent(
        t('intro.agreementNotice', {
          terms: t('intro.terms'),
          privacy: t('intro.privacy'),
        }),
      );
      expect(StyleSheet.flatten(sentence.props.style).textAlign).toBe('center');
      expect(StyleSheet.flatten(sentence.props.style).flexWrap).toBeUndefined();
      for (const document of ['terms', 'privacy'] as const) {
        const link = sentence.findByProps({testID: `auth-policy-${document}`});
        expect(link.props.accessibilityRole).toBe('link');
        fireEvent.press(screen.getByTestId(`auth-policy-${document}`));
        expect(open).toHaveBeenLastCalledWith(
          expect.stringContaining(document),
        );
      }
      expect(open).toHaveBeenCalledTimes(2);
    },
  );
});

describe('email example placeholder', () => {
  it('shows the example without prefilling a value and removes it while typing', () => {
    const change = jest.fn();
    const field = (value: string) => (
      <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
        <AuthField
          accessibilityLabel="Email"
          onChangeText={change}
          placeholder={t('auth.emailPlaceholder')}
          testID="email-placeholder"
          value={value}
        />
      </CpkProvider>
    );
    const screen = render(field(''), {wrapper: TestSafeAreaProvider});
    const input = screen.getByPlaceholderText('hello@gmail.com');
    expect(input.props.value).toBe('');
    fireEvent.changeText(input, 'a');
    expect(change).toHaveBeenCalledWith('a');
    screen.rerender(field('a'));
    expect(screen.getByTestId('email-placeholder').props.value).toBe('a');
  });
});
