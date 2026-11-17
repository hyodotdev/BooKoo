import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {Animated, Easing, StyleSheet, View, type ViewStyle} from 'react-native';
import {Icon, LoadingIndicator, Typography, useCPK} from 'cpk-ui';

import {useAccessibilityPreferences} from '~/features/runtime/accessibility';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {t} from '~/utils/i18n';

export type BookooLoadingVariant = 'inline' | 'section' | 'screen';

const ORBIT_DURATION_MS = 1_350;
// CoinVerticalFill draws a solid face on its left and a thin striped rim on its
// right. Centered by its box, the coin reads as sitting left of the disc, so it
// is shifted right by this fraction of its size to sit centered to the eye.
const COIN_OPTICAL_SHIFT = 0.065;

/** Where in one orbit the loader is at `nowMs`, from 0 (inclusive) to 1. */
export function orbitPhaseAt(nowMs: number): number {
  return (nowMs % ORBIT_DURATION_MS) / ORBIT_DURATION_MS;
}

/**
 * A quiet, logo-free loading language for boot, route and inline waits.
 * cpk-ui owns the loading primitive; BooKoo supplies a lightweight finance
 * motion through its supported custom element API.
 */
export function BookooLoading({
  testID = 'bookoo-loading',
  variant = 'section',
}: {
  readonly testID?: string;
  readonly variant?: BookooLoadingVariant;
}): ReactElement {
  const {theme} = useCPK();
  const accent = useLedgerAccent();
  const {reduceMotion} = useAccessibilityPreferences();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(0);
      return;
    }
    // Start at the wall-clock phase, so a loading surface that replaces another
    // (root, then redirect, then tab shell) keeps orbiting where the last one
    // was instead of snapping back to the top.
    const phase = orbitPhaseAt(Date.now());
    progress.setValue(phase);
    let loop: Animated.CompositeAnimation | null = null;
    const lead = Animated.timing(progress, {
      duration: ORBIT_DURATION_MS * (1 - phase),
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: true,
    });
    lead.start(({finished}) => {
      if (!finished) return;
      progress.setValue(0);
      loop = Animated.loop(
        Animated.timing(progress, {
          duration: ORBIT_DURATION_MS,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      lead.stop();
      loop?.stop();
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [progress, reduceMotion]);

  const orbitStyle = {
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };
  const coinStyle = reduceMotion
    ? {opacity: 1, transform: [{scale: 1}]}
    : {
        opacity: progress.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [0.84, 0.96, 0.84, 0.72, 0.84],
        }),
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [1, 1.035, 1, 0.965, 1],
            }),
          },
        ],
      };
  const variantStyle: ViewStyle =
    variant === 'screen'
      ? styles.screen
      : variant === 'inline'
        ? styles.inline
        : styles.section;
  const compact = variant === 'inline';
  const indicatorSize = compact ? 36 : 52;
  const iconSize = compact ? 17 : 23;

  const indicator = (
    <LoadingIndicator
      accessibilityLabel={t('common.loading')}
      customElement={
        <View
          style={{height: indicatorSize, width: indicatorSize}}
          testID={`${testID}-motion`}
        >
          <Animated.View
            style={[
              styles.orbit,
              {
                borderColor: theme.role.divider,
                height: indicatorSize,
                width: indicatorSize,
              },
              orbitStyle,
            ]}
          >
            <View style={[styles.orbitDot, {backgroundColor: accent.base}]} />
            <View
              style={[
                styles.orbitDot,
                styles.orbitDotOpposite,
                {backgroundColor: accent.base},
              ]}
            />
          </Animated.View>
          <Animated.View
            style={[styles.coin, {backgroundColor: theme.bg.paper}, coinStyle]}
          >
            <View
              style={{transform: [{translateX: iconSize * COIN_OPTICAL_SHIFT}]}}
              testID={`${testID}-coin`}
            >
              <Icon
                color={accent.text}
                name="CoinVerticalFill"
                size={iconSize}
              />
            </View>
          </Animated.View>
        </View>
      }
      testID={`${testID}-indicator`}
    />
  );

  if (variant === 'screen')
    return (
      <View
        accessibilityLabel={t('common.loading')}
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityState={{busy: true}}
        style={[styles.root, styles.screen]}
        testID={testID}
      >
        {indicator}
        <Typography.Body3 style={{color: theme.text.label}}>
          {t('common.loading')}
        </Typography.Body3>
      </View>
    );

  return (
    <View
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityState={{busy: true}}
      style={[styles.root, variantStyle]}
      testID={testID}
    >
      {indicator}
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    alignItems: 'center',
    borderRadius: 999,
    bottom: 6,
    justifyContent: 'center',
    left: 6,
    position: 'absolute',
    right: 6,
    top: 6,
  },
  inline: {minHeight: 52, paddingHorizontal: 12, paddingVertical: 8},
  orbit: {
    borderRadius: 999,
    borderWidth: 1.5,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  orbitDot: {
    borderRadius: 999,
    height: 7,
    position: 'absolute',
    right: 2,
    top: 2,
    width: 7,
  },
  orbitDotOpposite: {bottom: 2, left: 2, right: undefined, top: undefined},
  root: {alignItems: 'center', justifyContent: 'center'},
  screen: {
    flex: 1,
    gap: 12,
    padding: 24,
  },
  section: {minHeight: 180, padding: 24},
});
