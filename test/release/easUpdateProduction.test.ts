import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const read = (...parts: string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

describe('production EAS Update contract', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };
  const script = read('scripts', 'eas-update-production.zsh');
  const easConfig = read('eas.json');
  const appConfig = read('app.config.ts');

  it('exposes guarded all-platform and platform-specific commands', () => {
    expect(packageJson.scripts['eas:prod:updates']).toBe(
      'scripts/eas-update-production.zsh all',
    );
    expect(packageJson.scripts['eas:prod:updates:ios']).toBe(
      'scripts/eas-update-production.zsh ios',
    );
    expect(packageJson.scripts['eas:prod:updates:android']).toBe(
      'scripts/eas-update-production.zsh android',
    );
  });

  it('publishes only to the production channel and environment', () => {
    expect(script).toContain('bunx eas-cli@23.0.0 update');
    expect(script).toContain('--channel production');
    expect(script).toContain('--environment production');
    expect(script).not.toContain('--branch production');
    expect(script).not.toMatch(/eas-cli@23\.0\.0 build/);
    expect(easConfig).toContain('"production"');
    expect(easConfig).toContain('"channel": "production"');
  });

  it('requires an explicit compatibility decision and release message', () => {
    expect(script).toContain('EAS_UPDATE_CONFIRM_COMPATIBLE');
    expect(script).toContain('EAS_UPDATE_MESSAGE');
    expect(script).toContain('JavaScript/assets-only');
  });

  it('requires a clean checkout at the exact latest main commit', () => {
    expect(script).toContain('git branch --show-current');
    expect(script).toContain('git status --porcelain');
    expect(script).toContain('git fetch --quiet origin main');
    expect(script).toContain('git rev-parse origin/main');
    expect(script).toContain('if [[ "$local_head" != "$remote_head" ]]');
    expect(script).toContain('gh run list');
    expect(script).toContain('--event push');
    expect(script).toContain('${local_head}:completed:success');
    expect(script).not.toContain('$local_head:completed:success');
    expect(script).toContain('EAS_UPDATE_DRY_RUN');
  });

  it('defaults to the CI gate, and a local mode runs the same commands CI runs', () => {
    const ci = read('.github', 'workflows', 'ci.yml');

    expect(script).toContain('verify_mode="${EAS_UPDATE_VERIFY:-ci}"');
    expect(script).toContain('if [[ "$verify_mode" == "ci" ]]');
    expect(script).toContain('elif [[ "$verify_mode" == "local" ]]');
    expect(script).toContain('EAS_UPDATE_VERIFY must be ci (default) or local');
    // The local branch is only as good as its match with CI's `check` job.
    for (const command of ['bun lint:all', 'bun typecheck', 'bun run test']) {
      expect(script).toContain(command);
      expect(ci).toContain(command);
    }
  });

  it('keeps production binaries on the shared EAS update endpoint', () => {
    expect(appConfig).toContain('url: `https://u.expo.dev/${EAS_PROJECT_ID}`');
  });
});
