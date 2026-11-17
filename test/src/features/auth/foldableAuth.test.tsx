import {useState} from 'react';
import * as ReactNative from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';

import {shouldShowAuthArtwork} from '~/features/auth/brandAuthLayout';
import {
  AuthField,
  LOGIN_FORM_KEYBOARD_OFFSET,
  LoginFormScreen,
} from '~/features/auth/ui';
import {theme} from '~/theme';
import {TestSafeAreaProvider} from '../../../testUtils';

describe('foldable authentication layout', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [466, 678, 1, false],
    [678, 466, 1, false],
    [669, 951, 1, true],
    [951, 669, 1, true],
    [402, 874, 1, false],
    [874, 402, 1, false],
    [1032, 1376, 1, true],
    [669, 951, 1.5, false],
    [1032, 1376, 1.5, true],
  ])(
    'selects artwork for %sx%s at font scale %s',
    (width, height, fontScale, expected) => {
      expect(shouldShowAuthArtwork({width, height, fontScale})).toBe(expected);
    },
  );

  it('preserves the typed email while closing and reopening the window', () => {
    const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions');
    dimensions.mockReturnValue({
      width: 669,
      height: 951,
      scale: 3,
      fontScale: 1,
    });
    function DraftForm() {
      const [email, setEmail] = useState('');
      return (
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <LoginFormScreen title="Login">
            <AuthField
              accessibilityLabel="Email"
              onChangeText={setEmail}
              testID="foldable-email"
              value={email}
            />
          </LoginFormScreen>
        </CpkProvider>
      );
    }
    const screen = render(<DraftForm />, {wrapper: TestSafeAreaProvider});
    fireEvent.changeText(
      screen.getByTestId('foldable-email'),
      'draft@example.test',
    );
    for (const [width, height] of [
      [466, 678],
      [678, 466],
      [951, 669],
      [669, 951],
    ]) {
      dimensions.mockReturnValue({width, height, scale: 3, fontScale: 1});
      screen.rerender(<DraftForm />);
      expect(screen.getByTestId('foldable-email').props.value).toBe(
        'draft@example.test',
      );
      expect(screen.getAllByTestId('foldable-email')).toHaveLength(1);
    }
  });
});

describe('login form keyboard offset', () => {
  it('keeps the field and the action below it above the keyboard', () => {
    const screen = render(
      <CpkProvider themeConfig={{customTheme: theme, initialThemeType: 'light'}}>
        <LoginFormScreen title="Login">
          <AuthField accessibilityLabel="Code" placeholder="8-digit code" />
        </LoginFormScreen>
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );
    // A 24pt offset showed only the field on a Pixel 2; Login sat under the
    // keyboard. The offset now spans the 20pt gap and the 56pt button too.
    const scroll = screen.UNSAFE_root.findAll(
      (node) => typeof node.props.bottomOffset === 'number',
    )[0];
    expect(scroll?.props.bottomOffset).toBe(LOGIN_FORM_KEYBOARD_OFFSET);
    expect(LOGIN_FORM_KEYBOARD_OFFSET).toBeGreaterThanOrEqual(24 + 20 + 56);
  });
});
