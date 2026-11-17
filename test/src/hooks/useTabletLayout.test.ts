import {
  shouldConstrainRootContent,
  shouldUseTabletLayout,
  TABLET_LAYOUT_MIN_DIMENSION,
} from '../../../src/hooks/useTabletLayout';

describe('tablet layout classification', () => {
  it('keeps a wide phone in the phone layout', () => {
    expect(
      shouldUseTabletLayout({
        minDimension: 432,
      }),
    ).toBe(false);
  });

  it('uses the tablet layout on an iPad mini below the CPK breakpoint', () => {
    expect(
      shouldUseTabletLayout({
        minDimension: 744,
      }),
    ).toBe(true);
  });

  it('uses the tablet layout for a 600dp Android portrait window', () => {
    expect(
      shouldUseTabletLayout({
        minDimension: TABLET_LAYOUT_MIN_DIMENSION,
      }),
    ).toBe(true);
  });

  it('returns to compact layout in a narrow tablet split-screen window', () => {
    expect(shouldUseTabletLayout({minDimension: 599})).toBe(false);
    expect(shouldUseTabletLayout({minDimension: 600})).toBe(true);
  });
});

describe('root content width', () => {
  it('keeps the centered phone width in portrait', () => {
    expect(
      shouldConstrainRootContent({
        height: 956,
        tabletLayout: false,
        width: 440,
      }),
    ).toBe(true);
  });

  it('fills the window on a phone in landscape', () => {
    expect(
      shouldConstrainRootContent({
        height: 440,
        tabletLayout: false,
        width: 956,
      }),
    ).toBe(false);
  });

  it('fills the window for tablet layouts in every orientation', () => {
    expect(
      shouldConstrainRootContent({
        height: 1366,
        tabletLayout: true,
        width: 1024,
      }),
    ).toBe(false);
  });
});
