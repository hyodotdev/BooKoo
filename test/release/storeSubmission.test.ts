import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {version} from '../../package.json';

const root = process.cwd();
const read = (...parts: readonly string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

describe('App Store submission contract', () => {
  const uploader = read('scripts', 'upload-app-store-screenshots.mjs');
  const storeConfig = read('store.config.js');

  it('targets the same version as the app binary', () => {
    const configuration = jest.requireActual<{apple: {version: string}}>(
      '../../store.config.js',
    );
    expect(configuration.apple.version).toBe(version);
  });

  it('uploads every configured locale from the marketing screenshot tree', () => {
    const gallery = JSON.parse(
      read('store-assets', 'apple-gallery-config.json'),
    ) as {
      locales: Record<string, {directory: string}>;
      families: {directory: string}[];
    };
    expect(Object.keys(gallery.locales)[0]).toBe('en-US');
    expect(
      Object.fromEntries(
        Object.entries(gallery.locales).map(([locale, configuration]) => [
          locale,
          configuration.directory,
        ]),
      ),
    ).toEqual({
      'de-DE': 'de-DE',
      'en-US': 'en-US',
      'es-ES': 'es-ES',
      'fr-FR': 'fr-FR',
      id: 'id',
      it: 'it-IT',
      ja: 'ja',
      ko: 'ko',
      'zh-Hans': 'zh-Hans',
    });
    expect(gallery.families.map(({directory}) => directory)).toEqual(
      expect.arrayContaining([
        'apple-iphone-6.9',
        'apple-iphone-6.5',
        'apple-ipad-13',
      ]),
    );
    expect(uploader).toContain('store-assets/apple-gallery-config.json');
    expect(uploader).toContain("'marketing'");
    expect(uploader).not.toContain("'store-assets/1.0.0/en/iphone-6.9'");
  });

  it('keeps dry run as the default and removes stale images only on apply', () => {
    expect(uploader).toContain("process.argv.includes('--apply')");
    expect(uploader).toContain('if (!apply) continue');
    expect(uploader.indexOf('if (!apply) continue')).toBeLessThan(
      uploader.indexOf('await deleteScreenshot(screenshot.id)'),
    );
    expect(
      uploader.indexOf('await deleteScreenshot(screenshot.id)'),
    ).toBeLessThan(
      uploader.indexOf('await uploadScreenshot(set.id, filePath)'),
    );
  });

  it('reuses the verified gallery independently of the store version', () => {
    const gallery = JSON.parse(
      read('store-assets', 'apple-gallery-config.json'),
    ) as {
      sourceVersion: string;
      locales: Record<string, {directory: string}>;
      families: {directory: string}[];
    };
    expect(gallery.sourceVersion).not.toBe(version);
    expect(gallery.sourceVersion).toBe('1.1.0');
    for (const {directory: locale} of Object.values(gallery.locales)) {
      for (const {directory: family} of gallery.families) {
        const manifest = JSON.parse(
          read(
            'store-assets',
            'marketing',
            gallery.sourceVersion,
            locale,
            family,
            'gallery-manifest.json',
          ),
        ) as {version: string; panels: unknown[]};
        expect(manifest.version).toBe(gallery.sourceVersion);
        expect(manifest.panels).toHaveLength(8);
      }
    }
  });

  it('publishes privacy choices separately from account deletion', () => {
    expect(storeConfig).toContain(
      'privacyChoicesUrl: metadata.urls.privacyChoices',
    );
    expect(storeConfig).not.toContain(
      'privacyChoicesUrl: metadata.urls.accountDeletion',
    );

    for (const locale of [
      'de',
      'en',
      'es',
      'fr',
      'id',
      'it',
      'ja',
      'ko',
      'nl',
      'pt',
      'vi',
      'zh',
      'zh-Hant',
    ]) {
      const metadata = JSON.parse(
        read('store-assets', 'metadata', `${locale}.json`),
      ) as {
        urls: {privacyChoices: string; accountDeletion: string};
      };
      expect(metadata.urls.privacyChoices).toContain('/privacy-choices?lang=');
      expect(metadata.urls.privacyChoices).not.toBe(
        metadata.urls.accountDeletion,
      );
    }
  });

  it('keeps the approved launch on automatic App Store release', () => {
    expect(storeConfig).toContain('automaticRelease: true');
    expect(storeConfig).not.toContain('automaticRelease: false');
  });
});
