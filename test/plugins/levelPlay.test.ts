/** @jest-environment node */
import {createRequire} from 'node:module';

const loadPlugin = createRequire(__filename);
const {configureLevelPlayGradle}: {
  configureLevelPlayGradle: (source: string) => string;
} = loadPlugin('../../plugins/withLevelPlay');

describe('LevelPlay native configuration', () => {
  it('preserves existing dependencies and stays idempotent across prebuilds', () => {
    const original = "dependencies {\n    implementation 'existing:module:1'\n}";
    const configured = configureLevelPlayGradle(original);
    expect(configured).toContain("implementation 'existing:module:1'");
    expect(configureLevelPlayGradle(configured)).toBe(configured);
  });

  it('excludes optional Ad Quality even when the adapter was already configured', () => {
    const existing =
      "dependencies {\n    implementation 'com.unity3d.ads-mediation:unityads-adapter:5.15.0'\n}";
    const configured = configureLevelPlayGradle(existing);
    expect(configured).toContain('configurations.configureEach');
    expect(configured).toContain("module: 'adquality-sdk'");
    expect(configured.match(/implementation /g)).toHaveLength(1);
  });

  it('rejects a changed native template instead of silently omitting the adapter', () => {
    expect(() => configureLevelPlayGradle('android {}')).toThrow(
      'dependencies block not found',
    );
  });
});
