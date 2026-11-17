import 'react-native';

import type {ReactElement} from 'react';
import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {BookooLoading} from '../../../../src/components/uis/BookooLoading';
import {theme} from '../../../../src/theme';
import {t} from '../../../../src/utils/i18n';

const renderLoading = (
  child: ReactElement,
  themeType: 'light' | 'dark' = 'light',
) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: themeType}}
      >
        {child}
      </CpkProvider>
    </SafeAreaProvider>,
  );

describe('BookooLoading', () => {
  it('centers one accent-aware loading message on screen', () => {
    const screen = renderLoading(
      <BookooLoading testID="loading" variant="screen" />,
    );

    expect(screen.getByTestId('loading')).toHaveProp('accessibilityState', {
      busy: true,
    });
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    expect(screen.getByTestId('loading-motion')).toBeTruthy();
    expect(screen.getByTestId('loading')).toHaveStyle({
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    });
    expect(screen.getByText(t('common.loading'))).toBeTruthy();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('keeps pagination loading compact in dark mode', () => {
    const screen = renderLoading(
      <BookooLoading testID="loading" variant="inline" />,
      'dark',
    );

    expect(screen.getByTestId('loading-motion')).toHaveStyle({
      height: 36,
      width: 36,
    });
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('nudges the left-heavy coin right so it reads as centered in the disc', () => {
    const translateXOf = (style: StyleProp<ViewStyle>): number => {
      const {transform} = StyleSheet.flatten(style);
      if (!Array.isArray(transform)) return 0;
      for (const entry of transform)
        if ('translateX' in entry && typeof entry.translateX === 'number')
          return entry.translateX;
      return 0;
    };
    const screenShift = translateXOf(
      renderLoading(<BookooLoading testID="screen" variant="screen" />)
        .getByTestId('screen-coin').props.style,
    );
    const inlineShift = translateXOf(
      renderLoading(<BookooLoading testID="inline" variant="inline" />)
        .getByTestId('inline-coin').props.style,
    );

    // An optical nudge, not a layout offset: under a tenth of the 23pt glyph,
    // and smaller again for the 17pt inline glyph.
    expect(screenShift).toBeGreaterThan(0);
    expect(screenShift).toBeLessThan(2.3);
    expect(inlineShift).toBeGreaterThan(0);
    expect(inlineShift).toBeLessThan(screenShift);
  });
});
