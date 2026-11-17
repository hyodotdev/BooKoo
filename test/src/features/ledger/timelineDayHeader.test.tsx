import {act, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {TimelineDayHeader} from '../../../../src/features/ledger/screens/timeline';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

describe('timeline date hierarchy', () => {
  afterEach(() => act(() => setActiveLocale('en')));

  it.each(['light', 'dark'] as const)(
    'keeps %s dates quiet, spaced and opaque when pinned',
    (mode) => {
      setActiveLocale('en');
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 390, height: 844},
            insets: {top: 0, left: 0, right: 0, bottom: 0},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: mode}}
          >
            <TimelineDayHeader
              backgroundColor={theme[mode].bg.basic}
              currency="USD"
              dayKey={20260906}
              netMinor={35400}
            />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByTestId('timeline-day-20260906')).toHaveStyle({
        backgroundColor: theme[mode].bg.basic,
        borderBottomWidth: 0,
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 16,
      });
      expect(screen.getByText('September 6th, 2026')).toHaveStyle({
        color: theme[mode].text.placeholder,
        flex: 1,
        fontWeight: '400',
      });
      expect(screen.getByText('$354.00')).toHaveStyle({
        color: theme[mode].text.placeholder,
      });
      act(() => setActiveLocale('ko'));
      expect(screen.queryByText('September 6th, 2026')).toBeNull();
      expect(screen.getByTestId('timeline-day-20260906')).toBeTruthy();
    },
  );
});
