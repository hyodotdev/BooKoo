import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider, Icon} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useWindowDimensions} from 'react-native';
import {useTabletLayout} from '../../../../src/hooks/useTabletLayout';

import {CalendarDayEmptyState} from '../../../../src/features/ledger/screens/calendar';
import {theme} from '../../../../src/theme';
import {t} from '../../../../src/utils/i18n';

jest.mock('../../../../src/hooks/useTabletLayout', () => ({
  useTabletLayout: jest.fn(() => false),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 390, height: 844, fontScale: 1, scale: 2})),
}));

describe('CalendarDayEmptyState', () => {
  afterEach(() => {
    jest.mocked(useTabletLayout).mockReturnValue(false);
  });

  it.each([
    ['light', 1280, 800, true],
    ['dark', 1280, 800, true],
    ['light', 800, 1280, false],
    ['dark', 800, 800, false],
  ] as const)(
    'keeps %s %sx%s appropriate to its pane',
    (mode, width, height, expanded) => {
      jest.mocked(useTabletLayout).mockReturnValue(true);
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({width, height, fontScale: 1, scale: 1});
      const onAdd = jest.fn();
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width, height},
            insets: {top: 0, left: 0, right: 0, bottom: 0},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: mode}}
          >
            <CalendarDayEmptyState onAdd={onAdd} />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(Boolean(screen.queryByTestId('entry-invitation'))).toBe(expanded);
      expect(
        screen.getAllByRole('button', {name: t('a11y.addEntry')}),
      ).toHaveLength(1);
      if (expanded) {
        expect(screen.getByText(t('ledgerItem.entryInvitation'))).toBeTruthy();
        expect(screen.queryByText(t('ledgerItem.empty'))).toBeNull();
        expect(screen.getByTestId('calendar-empty-add')).toHaveStyle({
          borderRadius: 24,
        });
        const plus = screen
          .getByTestId('entry-invitation-add-icon')
          .findByType(Icon);
        expect(plus.props.color).toBe('#FFFFFF');
        expect(plus.props.style).toBeUndefined();
        expect(screen.getByTestId('entry-invitation-add-icon')).toHaveStyle({
          backgroundColor: 'transparent',
        });
      }
      fireEvent.press(screen.getByTestId('calendar-empty-add'));
      expect(onAdd).toHaveBeenCalledTimes(1);
    },
  );

  it('shows only one centered next action', () => {
    const onAdd = jest.fn();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <CalendarDayEmptyState onAdd={onAdd} />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.queryByText('September 2nd, 2026')).toBeNull();
    expect(screen.getByTestId('calendar-day-empty-state')).toHaveStyle({
      alignItems: 'center',
      width: '100%',
    });
    expect(screen.getByTestId('calendar-empty-add')).toHaveStyle({
      alignSelf: 'center',
    });
    expect(screen.getByTestId('calendar-empty-add')).toHaveProp(
      'accessibilityRole',
      'button',
    );
    fireEvent.press(screen.getByText(t('a11y.addEntry')));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
