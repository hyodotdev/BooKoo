import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const layout = readFileSync(join(process.cwd(), 'app', '_layout.tsx'), 'utf8');

describe('root layout', () => {
  it('hands every navigator the app background through the navigation theme', () => {
    // Without it, a native stack shows React Navigation's light gray for a
    // frame or two while one screen replaces another (the boot loader to the
    // tabs), in dark mode too. The tests for the theme itself live next to it.
    expect(layout).toContain(
      "import {AppNavigationTheme} from '../src/theme/navigationTheme'",
    );
    expect(layout).toContain(
      '<AppNavigationTheme background={paperBackground}>',
    );
  });
});
