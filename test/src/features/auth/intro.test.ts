import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {
  authIntroStartsOnSignIn,
  markAuthIntroFinished,
  nextAuthIntroStep,
  resetAuthIntroFinishedForTests,
} from '../../../../src/features/auth/intro';

describe('auth intro handoff', () => {
  afterEach(() => {
    resetAuthIntroFinishedForTests();
  });

  it('unmounts the tutorial before mounting sign-in on the same native screen', () => {
    expect(nextAuthIntroStep('tutorial')).toBe('handoff');
    expect(nextAuthIntroStep('handoff')).toBe('sign-in');
    expect(nextAuthIntroStep('sign-in')).toBe('sign-in');
  });

  it('remembers Get started for a later remount in the same JS session', () => {
    expect(authIntroStartsOnSignIn()).toBe(false);
    markAuthIntroFinished();
    expect(authIntroStartsOnSignIn()).toBe(true);
    resetAuthIntroFinishedForTests();
    expect(authIntroStartsOnSignIn()).toBe(false);
  });

  it('does not native-stack replace the tutorial onto /sign-in', () => {
    const intro = readFileSync(
      resolve(process.cwd(), 'src/features/auth/intro.tsx'),
      'utf8',
    );
    const index = readFileSync(
      resolve(process.cwd(), 'app/(auth)/index.tsx'),
      'utf8',
    );
    expect(index).toContain('AuthIntroScreen');
    expect(index).not.toContain('TutorialScreen as default');
    expect(intro).toContain('collapsable={false}');
    expect(intro).toContain('requestAnimationFrame');
    expect(intro).toContain('<SignInScreen />');
    expect(intro).not.toContain('router.replace');
    expect(intro).not.toContain('useRouter');
    expect(intro).not.toContain('InteractionManager');
  });
});
