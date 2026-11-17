import type {ReactElement} from 'react';
import {StyleSheet} from 'react-native';
import {act, fireEvent, render, within} from '@testing-library/react-native';
import type {ReactTestInstance} from 'react-test-renderer';
import {CpkProvider} from 'cpk-ui';

import {
  useBookooAlertDialog,
  type BookooAlertDialogOptions,
} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {theme} from '~/theme';
import {setActiveLocale} from '~/utils/i18n';
import {TestSafeAreaProvider} from '../../testUtils';

function Harness({options}: {options: BookooAlertDialogOptions}): ReactElement {
  const dialog = useBookooAlertDialog();
  return <BookooButton onPress={() => dialog.confirm(options)} text="Open" />;
}

describe('shared BooKoo confirmation dialogs', () => {
  beforeEach(() => {
    setActiveLocale('en');
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it.each([
    ['light', 'primary'],
    ['light', 'warning'],
    ['dark', 'primary'],
    ['dark', 'danger'],
  ] as const)(
    'paints the %s %s dialog icon with the badge\u2019s paired text token',
    (appearance, tone) => {
      const screen = render(
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: appearance}}
        >
          <Harness
            options={{
              body: 'body',
              confirmText: 'Confirm',
              icon: 'UserMinus',
              onConfirm: jest.fn(),
              title: 'Title',
              tone,
            }}
          />
        </CpkProvider>,
        {wrapper: TestSafeAreaProvider},
      );

      fireEvent.press(screen.getByText('Open'));
      const badge = screen.getByTestId('bookoo-dialog-icon');
      const {backgroundColor} = StyleSheet.flatten(badge.props.style);
      const paired = theme[appearance].button[tone];
      const glyph = badge.children.find(
        (child): child is ReactTestInstance => typeof child !== 'string',
      );
      // Most BooKoo tones pair a light badge with a DARK text token (dark
      // primary is #34E0B7 on #292767), so a hardcoded white glyph is
      // invisible on them. Never unpair the badge from its text token.
      expect(backgroundColor).toBe(paired.bg);
      expect(glyph?.props.color).toBe(paired.text);
    },
  );

  it.each(['light', 'dark'] as const)(
    'keeps an intrinsic, wrapping title inside the %s card',
    (appearance) => {
      const onConfirm = jest.fn();
      const title = 'Remove this member from the shared ledger?';
      const screen = render(
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: appearance}}
        >
          <Harness
            options={{
              body: 'Their entries stay in this ledger.',
              confirmText: 'Remove member',
              icon: 'UserMinus',
              onConfirm,
              title,
              tone: 'danger',
            }}
          />
        </CpkProvider>,
        {wrapper: TestSafeAreaProvider},
      );

      fireEvent.press(screen.getByText('Open'));
      const heading = screen.getByTestId('bookoo-dialog-header');
      const headingStyle = StyleSheet.flatten(heading.props.style);
      // The cpk-ui title slot is a column with intrinsic height. A flex:1
      // child has a zero basis there, collapsing native title/icon layout.
      expect(headingStyle.flex).toBeUndefined();
      expect(headingStyle.flexShrink).toBe(0);
      expect(headingStyle.gap).toBe(20);
      expect(
        StyleSheet.flatten(screen.getByLabelText(title).props.style),
      ).toMatchObject({
        paddingTop: 28,
        paddingBottom: 28,
        paddingLeft: 28,
        paddingRight: 28,
        flexBasis: 'auto',
        maxWidth: 360,
      });
      expect(
        within(heading).getByText(title).props.numberOfLines,
      ).toBe(2);
      expect(
        screen.getByText('Their entries stay in this ledger.'),
      ).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Remove member')).toBeTruthy();
      expect(
        screen.getByText('Remove member').props.numberOfLines,
      ).toBeUndefined();
      expect(
        StyleSheet.flatten(
          screen.getByRole('button', {name: 'Remove member'}).props.style,
        ),
      ).toMatchObject({flex: 0, flexBasis: 'auto'});

      fireEvent.press(screen.getByTestId('alert-dialog-backdrop'));
      expect(screen.getByText(title)).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText('Cancel'));
      expect(screen.queryByText(title)).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it('runs the action only after explicit confirmation and closes the card', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <Harness
          options={{
            body: 'Sign out on this device?',
            confirmText: 'Logout',
            icon: 'SignOut',
            onConfirm,
            title: 'Logout',
            tone: 'danger',
          }}
        />
      </CpkProvider>,
      {wrapper: TestSafeAreaProvider},
    );
    fireEvent.press(screen.getByText('Open'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Logout'}));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sign out on this device?')).toBeNull();
  });
});
