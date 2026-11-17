import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {
  TUTORIAL_ARTWORK_MAX_WIDTH,
  TUTORIAL_ARTWORK_MIN_WIDTH,
  TUTORIAL_CONTENT_BOTTOM_PADDING,
  TUTORIAL_CONTENT_TOP_PADDING,
  nextTutorialIndex,
  tutorialArtworkWidthForViewport,
} from '../../../../src/features/auth/tutorial';

describe('tutorial responsive layout', () => {
  it('lifts artwork slightly above the footer without pinning it to the top', () => {
    expect(TUTORIAL_CONTENT_BOTTOM_PADDING).toBeGreaterThan(
      TUTORIAL_CONTENT_TOP_PADDING,
    );
    expect(
      TUTORIAL_CONTENT_BOTTOM_PADDING - TUTORIAL_CONTENT_TOP_PADDING,
    ).toBeLessThan(80);
  });

  it('shows status-bar glyphs on the navy canvas', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/auth/tutorial.tsx'),
      'utf8',
    );
    expect(source).toContain('barStyle="light-content"');
    expect(source).toContain('hidden={false}');
    expect(source).not.toContain('<StatusBar hidden');
  });

  it('uses a padded text Button for Next and Get started', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/auth/tutorial.tsx'),
      'utf8',
    );
    expect(source).toContain('type="text"');
    expect(source).toContain('testID="tutorial-next"');
    expect(source).toContain('paddingLeft: 16');
    expect(source).toContain('paddingTop: 8');
    expect(source).not.toContain('CustomPressable');
    expect(source).not.toContain('BookooButton');
    expect(source).toContain('onFinished');
    expect(source).not.toContain('router.replace');
    expect(source).not.toContain('InteractionManager');
    expect(source).not.toContain('useRouter');
  });

  it('keeps the artwork readable on phones without overwhelming tablets', () => {
    expect(tutorialArtworkWidthForViewport(320)).toBe(
      TUTORIAL_ARTWORK_MIN_WIDTH,
    );
    expect(tutorialArtworkWidthForViewport(390)).toBe(203);
    expect(tutorialArtworkWidthForViewport(1194)).toBe(
      TUTORIAL_ARTWORK_MAX_WIDTH,
    );
  });

  it('advances the controlled index and stops at the final slide', () => {
    expect(nextTutorialIndex(0, 3)).toBe(1);
    expect(nextTutorialIndex(1, 3)).toBe(2);
    expect(nextTutorialIndex(2, 3)).toBeNull();
  });

  it('drives the shared indicator from continuous native scroll progress', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/auth/tutorial.tsx'),
      'utf8',
    );
    expect(source).toContain('<PageIndicator');
    expect(source).toContain('testID="tutorial-dot-indicator"');
    expect(source).toContain('progress.set(event.contentOffset.x / width)');
    expect(source).toContain('onScroll={onScroll}');
    expect(source).toContain('reducedMotion={reducedMotion}');
    expect(source).not.toContain('withTiming');
  });
});
