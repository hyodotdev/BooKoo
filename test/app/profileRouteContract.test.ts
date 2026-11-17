import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(__dirname, '../..');

describe('profile route ownership', () => {
  it('keeps onboarding Profile and My Profile on distinct URLs', () => {
    expect(existsSync(resolve(root, 'app/(onboarding)/profile.tsx'))).toBe(
      true,
    );
    expect(existsSync(resolve(root, 'app/(app)/profile/me.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'app/(app)/profile/index.tsx'))).toBe(
      false,
    );

    const drawer = readFileSync(
      resolve(root, 'src/features/ledger/drawer.tsx'),
      'utf8',
    );
    const auth = readFileSync(
      resolve(root, 'src/features/auth/screens.tsx'),
      'utf8',
    );
    expect(drawer).toContain("router.navigate('/profile/me')");
    expect(auth).not.toContain("router.replace('/profile')");
    expect(auth).toContain('<OnboardingBlockingModal');
  });
});
