import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from 'expo-router/build/react-navigation/bottom-tabs';

const INDICATOR_MAX_WIDTH = 56;
const INDICATOR_HORIZONTAL_GUTTER = 16;
const INDICATOR_MOTION_MS = 250;
const INDICATOR_EASING = Easing.bezier(0.77, 0, 0.175, 1);

export function getBottomTabIndicatorGeometry({
  barWidth,
  selectedIndex,
  visibleTabCount,
}: {
  readonly barWidth: number;
  readonly selectedIndex: number;
  readonly visibleTabCount: number;
}): {readonly translateX: number; readonly width: number} {
  'worklet';

  if (barWidth <= 0 || visibleTabCount <= 0) return {translateX: 0, width: 0};

  const slotWidth = barWidth / visibleTabCount;
  const width = Math.min(
    INDICATOR_MAX_WIDTH,
    Math.max(0, slotWidth - INDICATOR_HORIZONTAL_GUTTER),
  );

  return {
    translateX: selectedIndex * slotWidth + (slotWidth - width) / 2,
    width,
  };
}

export function LedgerTabBar({
  accentColor,
  backgroundColor,
  hidden,
  side,
  ...props
}: BottomTabBarProps & {
  readonly accentColor: string;
  readonly backgroundColor: string;
  readonly hidden: boolean;
  readonly side: boolean;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  const barWidth = useSharedValue(0);
  const hiddenRouteKeys = new Set(
    props.state.routes.flatMap((route) => {
      const itemStyle = StyleSheet.flatten(
        props.descriptors[route.key]?.options.tabBarItemStyle,
      );
      return itemStyle?.display === 'none' ? [route.key] : [];
    }),
  );
  const visibleRouteKeys = props.state.routes.flatMap((route) =>
    hiddenRouteKeys.has(route.key) ? [] : [route.key],
  );
  const selectedRouteKey = props.state.routes[props.state.index]?.key;
  const selectedIndex = Math.max(
    0,
    visibleRouteKeys.indexOf(selectedRouteKey ?? ''),
  );
  const indicatorPosition = useSharedValue(selectedIndex);

  useEffect(() => {
    indicatorPosition.set(
      reduceMotion
        ? selectedIndex
        : withTiming(selectedIndex, {
            duration: INDICATOR_MOTION_MS,
            easing: INDICATOR_EASING,
          }),
    );
  }, [indicatorPosition, reduceMotion, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    const geometry = getBottomTabIndicatorGeometry({
      barWidth: barWidth.get(),
      selectedIndex: indicatorPosition.get(),
      visibleTabCount: visibleRouteKeys.length,
    });

    return {
      opacity: geometry.width === 0 ? 0 : 1,
      transform: [{translateX: geometry.translateX}],
      width: geometry.width,
    };
  });

  if (side || hidden) return <BottomTabBar {...props} />;

  const onLayout = (event: LayoutChangeEvent): void => {
    barWidth.set(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.bottomBar, {backgroundColor}]}
      testID="ledger-tab-bar"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {backgroundColor: accentColor},
          indicatorStyle,
        ]}
        testID="ledger-tab-indicator"
      />
      <BottomTabBar {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'relative',
  },
  indicator: {
    borderCurve: 'continuous',
    borderRadius: 16,
    height: 32,
    left: 0,
    position: 'absolute',
    top: 5,
  },
});
