import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const read = (...parts: string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

describe('production OTA release contract', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  const script = read('scripts', 'ota-release.zsh');

  it('exposes guarded all-platform and platform-specific commands', () => {
    expect(packageJson.scripts['ota:release']).toBe(
      'scripts/ota-release.zsh all',
    );
    expect(packageJson.scripts['ota:release:ios']).toBe(
      'scripts/ota-release.zsh ios',
    );
    expect(packageJson.scripts['ota:release:android']).toBe(
      'scripts/ota-release.zsh android',
    );
  });

  it('publishes through Codemagic Patch to the Production deployment only', () => {
    expect(packageJson.dependencies['expo-updates']).toBeUndefined();
    expect(script).toContain('@codemagic/patch-cli@0.10.0 release-react');
    expect(script).toContain('--server-url https://ota.codemagicpatch.dev');
    expect(script).toContain('--deployment Production');
    expect(script).toContain('--target-binary-version "$version"');
    expect(script).toContain('BooKoo-iOS');
    expect(script).toContain('BooKoo-Android');
    expect(script).not.toContain('eas-cli@23.0.0 update');
  });

  it('builds the bundle with the production EAS environment', () => {
    expect(script).toContain('eas-cli@23.0.0 env:exec production');
    expect(script).toContain('BOOKOO_APP_VARIANT=production');
    expect(script).toContain('EXPO_NO_DOTENV=1');
  });

  it('requires an explicit compatibility decision and release message', () => {
    expect(script).toContain('OTA_CONFIRM_COMPATIBLE');
    expect(script).toContain('OTA_MESSAGE');
    expect(script).toContain('JavaScript/assets-only');
  });

  it('requires a clean checkout at the exact latest main commit', () => {
    expect(script).toContain('git branch --show-current');
    expect(script).toContain('git status --porcelain');
    expect(script).toContain(
      'main_ref=+refs/heads/main:refs/remotes/origin/main',
    );
    expect(script).toContain(
      'git fetch --quiet --unshallow origin "$main_ref"',
    );
    expect(script).toContain('git rev-parse origin/main');
    expect(script).toContain('if [[ "$local_head" != "$remote_head" ]]');
    expect(script).toContain('gh run list');
    expect(script).toContain('--event push');
    expect(script).toContain('${local_head}:completed:success');
    expect(script).toContain('OTA_DRY_RUN');
  });

  it('accepts a Codemagic tag build on main and runs the CI checks there', () => {
    expect(script).toContain('if [[ -n "${CM_BUILD_ID:-}" ]]; then');
    expect(script).toContain(
      'git merge-base --is-ancestor "$local_head" origin/main',
    );
    expect(script).toContain('verify_mode=local');
  });

  it('regenerates the native projects before every release so Patch can fingerprint them', () => {
    expect(script).toContain(
      'prebuild=(bunx expo prebuild --no-install --clean --platform "$target")',
    );
    expect(script).toContain(
      '"$production_env ${(j: :)${(@q)prebuild}} && $production_env ${(j: :)${(@q)release}}"',
    );
    expect(script.indexOf('prebuild=(')).toBeLessThan(
      script.indexOf('release=('),
    );
  });

  it('builds everything on a dry run and skips only the upload', () => {
    expect(script).toContain(
      '[[ "${OTA_DRY_RUN:-}" == "1" ]] && dry_run=(--dry-run)',
    );
    expect(script).not.toContain('exit 0');
  });

  it('defaults to the CI gate, and a local mode runs the same commands CI runs', () => {
    const ci = read('.github', 'workflows', 'ci.yml');

    expect(script).toContain('verify_mode="${OTA_VERIFY:-ci}"');
    expect(script).toContain('if [[ "$verify_mode" == "ci" ]]');
    expect(script).toContain('elif [[ "$verify_mode" == "local" ]]');
    expect(script).toContain('OTA_VERIFY must be ci (default) or local');
    for (const command of ['bun lint:all', 'bun typecheck', 'bun run test']) {
      expect(script).toContain(command);
      expect(ci).toContain(command);
    }
  });
});

describe('Release dispatch workflow', () => {
  const workflow = read('.github', 'workflows', 'release.yml');
  const codemagic = read('codemagic.yaml');

  it('tags only a main commit whose CI passed', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('--workflow CI');
    expect(workflow).toContain('completed:success');
  });

  it('creates exactly the tags Codemagic triggers on', () => {
    for (const kind of ['- ota', '- ota-dry', '- store']) {
      expect(workflow).toContain(kind);
    }
    expect(workflow).toContain('tag="v$version"');
    expect(workflow).toContain('prefix="$KIND-$version-"');
    expect(workflow).toContain('git tag -a "$tag" -m "$MESSAGE"');
    expect(codemagic).toContain("pattern: 'v*'");
    expect(codemagic).toContain("pattern: 'ota-*'");
    expect(codemagic).toContain('ota-dry-*) export OTA_DRY_RUN=1');
  });
});
