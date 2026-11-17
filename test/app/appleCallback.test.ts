import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('Apple Android callback route', () => {
  it('holds while signed out instead of returning to the intro', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/apple-callback.tsx'),
      'utf8',
    );
    expect(source).toContain('testID="apple-callback-hold"');
    expect(source).toContain('sessionShowsAppShell');
    expect(source).toContain("stage === 'onboarding'");
    expect(source).not.toContain(
      "if (stage === 'loading' || stage === 'profile-missing') return null;",
    );
  });
});
