import {useWindowDimensions} from 'react-native';

export const TABLET_LAYOUT_MIN_DIMENSION = 600;

export function shouldConstrainRootContent({
  height,
  tabletLayout,
  width,
}: {
  height: number;
  tabletLayout: boolean;
  width: number;
}): boolean {
  return !tabletLayout && width <= height;
}

export function shouldUseTabletLayout({
  minDimension,
}: {
  minDimension: number;
}): boolean {
  // Window size, not a device/desktop breakpoint: 600dp Android portrait
  // tablets and resized tablet windows must not fall into the 500pt phone root.
  return minDimension >= TABLET_LAYOUT_MIN_DIMENSION;
}

export function useTabletLayout(): boolean {
  const {height, width} = useWindowDimensions();

  return shouldUseTabletLayout({
    minDimension: Math.min(width, height),
  });
}
