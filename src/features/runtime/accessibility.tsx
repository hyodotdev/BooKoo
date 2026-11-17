import type {PropsWithChildren, ReactElement} from 'react';
import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

interface AccessibilityPreferences {
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly screenReaderEnabled: boolean;
}

const Context = createContext<AccessibilityPreferences>({
  highContrast: false,
  reduceMotion: false,
  screenReaderEnabled: false,
});

export function AccessibilityPreferencesProvider({
  children,
}: PropsWithChildren): ReactElement {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [highTextContrast, setHighTextContrast] = useState(false);
  const [darkerSystemColors, setDarkerSystemColors] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduceMotion(value);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setScreenReaderEnabled(value);
    });
    void AccessibilityInfo.isHighTextContrastEnabled().then((value) => {
      if (active) setHighTextContrast(value);
    });
    void AccessibilityInfo.isDarkerSystemColorsEnabled().then((value) => {
      if (active) setDarkerSystemColors(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const reader = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReaderEnabled,
    );
    const contrast = AccessibilityInfo.addEventListener(
      'highTextContrastChanged',
      setHighTextContrast,
    );
    const darker = AccessibilityInfo.addEventListener(
      'darkerSystemColorsChanged',
      setDarkerSystemColors,
    );
    return () => {
      active = false;
      motion.remove();
      reader.remove();
      contrast.remove();
      darker.remove();
    };
  }, []);
  const value = useMemo(
    () => ({highContrast: highTextContrast || darkerSystemColors, reduceMotion, screenReaderEnabled}),
    [darkerSystemColors, highTextContrast, reduceMotion, screenReaderEnabled],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAccessibilityPreferences = (): AccessibilityPreferences =>
  useContext(Context);
