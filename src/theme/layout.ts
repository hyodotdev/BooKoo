export const MOBILE_TAB_BAR_BASE_HEIGHT = 64;

/** Breathing room below detail-page chrome; separate from window safe area. */
export const DETAIL_CONTENT_TOP = 20;

/** cpk-ui falls back to its default slop for numeric zero, so use a truthy zero inset. */
export const EXACT_HIT_SLOP = {bottom: 0, left: 0, right: 0, top: 0} as const;

export const CIRCULAR_ICON_SIZE = 56;

/** 56pt circular icon target so CustomPressable underlay/ripple is a circle. */
export const CIRCULAR_ICON_TARGET = {
  alignItems: 'center',
  borderRadius: CIRCULAR_ICON_SIZE / 2,
  height: CIRCULAR_ICON_SIZE,
  justifyContent: 'center',
  overflow: 'hidden',
  width: CIRCULAR_ICON_SIZE,
} as const;

export function circularIconRipple(color: string): {
  readonly borderless: false;
  readonly color: string;
  readonly radius: number;
} {
  return {
    borderless: false,
    color,
    radius: CIRCULAR_ICON_SIZE / 2,
  };
}
