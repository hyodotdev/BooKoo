import 'react-native';

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('locale subscription', () => {
  it('keeps the root navigator and settings list subscribed so copy updates without remounting the session', () => {
    const root = readFileSync(
      resolve(process.cwd(), 'app/_layout.tsx'),
      'utf8',
    );
    const settings = readFileSync(
      resolve(process.cwd(), 'src/features/settings/appSettings.tsx'),
      'utf8',
    );
    const appLayout = readFileSync(
      resolve(process.cwd(), 'app/(app)/_layout.tsx'),
      'utf8',
    );
    expect(root).toContain('useLocale()');
    expect(settings).toContain('useLocale()');
    expect(appLayout).toContain('useLocale()');
    expect(root).not.toContain('key={locale}');
  });

  it.each([
    'app/(app)/(tabs)/_layout.tsx',
    'app/(app)/(tabs)/(root)/_layout.tsx',
  ])(
    'subscribes the retained navigation boundary %s without remounting',
    (path) => {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(source).toContain('useLocale()');
      expect(source).not.toContain('key={locale}');
    },
  );
});
