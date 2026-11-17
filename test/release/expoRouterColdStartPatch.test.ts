import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const read = (...parts: readonly string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

describe('Expo Router Android cold-start patch', () => {
  const patch = read('patches', 'expo-router+57.0.29.patch');
  const installedNavigationContainer = read(
    'node_modules',
    'expo-router',
    'build',
    'fork',
    'NavigationContainer.js',
  );

  it('defers the initial-link state update until the container mounts', () => {
    for (const contract of [
      'hasMountedRef',
      'pendingUnhandledLinkRef',
      'setUnhandledLinkAfterMount',
      '}, setUnhandledLinkAfterMount);',
    ]) {
      expect(patch).toContain(contract);
      expect(installedNavigationContainer).toContain(contract);
    }
  });

  it('preserves the square native drawer edge', () => {
    expect(patch).toContain('+const DRAWER_BORDER_RADIUS = 0;');
  });
});
