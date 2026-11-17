import {
  shouldUseTabletLayout,
  TABLET_LAYOUT_MIN_DIMENSION,
} from '~/hooks/useTabletLayout';

/**
 * Reserve enough navy above the login sheet that the dock sits on the bottom
 * when it fits, and still leaves a title band when the sheet is taller than
 * the viewport so scrolling can lift the sheet like a bottom sheet.
 */
export function brandAuthSheetSpacerHeight({
  dockHeight,
  minTitleSpace,
  viewportHeight,
}: {
  dockHeight: number;
  minTitleSpace: number;
  viewportHeight: number;
}): number {
  if (viewportHeight <= 0 || dockHeight <= 0) return minTitleSpace;
  return Math.max(minTitleSpace, viewportHeight - dockHeight);
}
/** Keep one sign-in form mounted as a foldable window changes size. */
export function shouldShowAuthArtwork({
  fontScale,
  height,
  width,
}: {
  fontScale: number;
  height: number;
  width: number;
}): boolean {
  return (
    shouldUseTabletLayout({minDimension: Math.min(width, height)}) &&
    width >= TABLET_LAYOUT_MIN_DIMENSION * Math.max(1, fontScale)
  );
}
