import {readFileSync} from 'node:fs';
import {dirname, extname, join} from 'node:path';

describe('EAS source archive privacy', () => {
  const rules = readFileSync(join(process.cwd(), '.easignore'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  it('excludes local credentials and signing material explicitly', () => {
    // EAS replaces .gitignore with this file; Git exclusions alone do not apply.
    for (const rule of [
      '/credentials.json',
      '/credentials/',
      '*.p12',
      '*.p8',
      '*.mobileprovision',
      '*.keystore',
      '*.jks',
    ]) {
      expect(rules).toContain(rule);
    }
  });

  it('excludes private data and env files without re-including credentials', () => {
    expect(rules).toContain('.local/');
    expect(rules).toContain('.env*');
    expect(rules.filter(rule => rule.startsWith('!'))).toEqual([
      '!default.pbxuser',
      '!default.mode1v3',
      '!default.mode2v3',
      '!default.perspectivev3',
      '!.yarn/releases',
      '!.env.example',
      '!convex/_generated',
      '!/store-assets/store-locales.json',
      '!/scripts/public-site',
      '!/scripts/public-site/content.ts',
      '!/scripts/public-site/discovery.ts',
    ]);
  });

  it('ships every module the native legal screens import from the public site', () => {
    // A missing import here only fails Metro inside `eas build`; OTA bundles
    // read the working tree and never notice.
    const shipped = new Set<string>();
    const visit = (file: string): void => {
      if (shipped.has(file)) return;
      shipped.add(file);
      if (!file.endsWith('.ts')) return;
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      for (const [, specifier] of source.matchAll(
        /^(?:import|export) (?!type )(?:[^;]*?from )?["'](\.[^"']+)["'];/gms,
      )) {
        const resolved = join(dirname(file), specifier);
        visit(extname(resolved) ? resolved : `${resolved}.ts`);
      }
    };
    visit('scripts/public-site/content.ts');
    for (const file of shipped) expect(rules).toContain(`!/${file}`);
  });
});
