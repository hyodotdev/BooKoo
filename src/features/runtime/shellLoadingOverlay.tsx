import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {Animated, StyleSheet} from 'react-native';

import {useAccessibilityPreferences} from '~/features/runtime/accessibility';
import {RouteLoadingScreen} from './routeLoading';

const FADE_OUT_MS = 180;

/**
 * The one loading surface a signed-in launch shows while the tab shell
 * resolves its ledger.
 *
 * It covers the tablet side rail as well as the content. Before it existed,
 * each tab drew its own branded loader inside the content area, next to an
 * empty rail, straight after the root and redirect routes had drawn theirs. On
 * a tablet that read as one loading screen replacing another. It fades out
 * rather than cutting to the screen underneath, and not at all under reduce
 * motion.
 */
export function ShellLoadingOverlay({
  visible,
}: {
  readonly visible: boolean;
}): ReactElement | null {
  const {reduceMotion} = useAccessibilityPreferences();
  const [mounted, setMounted] = useState(visible);
  const [lastVisible, setLastVisible] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));

  // Adjust during render when `visible` flips, rather than in an effect: show
  // at once, and leave at once under reduce motion. The fade below owns the
  // animated exit.
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setMounted(true);
    else if (reduceMotion) setMounted(false);
  }

  useEffect(() => {
    if (visible) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    if (!mounted || reduceMotion) return;
    const fade = Animated.timing(opacity, {
      duration: FADE_OUT_MS,
      toValue: 0,
      useNativeDriver: true,
    });
    fade.start(({finished}) => {
      if (finished) setMounted(false);
    });
    return () => fade.stop();
  }, [mounted, opacity, reduceMotion, visible]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, {opacity}]}
      testID="shell-loading-overlay"
    >
      <RouteLoadingScreen />
    </Animated.View>
  );
}
