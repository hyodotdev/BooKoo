import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils.js';

import {
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_DOCUMENT_SHA256,
  PUBLIC_URLS,
  TERMS_DOCUMENT_SHA256,
} from '@shared/legal';
import {
  canonicalDocumentText,
  PUBLIC_LOCALES,
  PUBLIC_ROUTE_PATHS,
  PUBLIC_SITE_COPY,
} from '../../scripts/public-site/content';

const digest = (value: string): string =>
  bytesToHex(sha256(utf8ToBytes(value)));

describe('generated public release site', () => {
  test('pins the reviewed Korean policy and terms copy', () => {
    expect(LEGAL_DOCUMENT_VERSION).toBe(PUBLIC_SITE_COPY.ko.effectiveDate);
    expect(PRIVACY_DOCUMENT_SHA256).toBe(
      digest(canonicalDocumentText('ko', 'privacy')),
    );
    expect(TERMS_DOCUMENT_SHA256).toBe(
      digest(canonicalDocumentText('ko', 'terms')),
    );
  });

  test.each(PUBLIC_LOCALES)('%s has every complete public route', (locale) => {
    const copy = PUBLIC_SITE_COPY[locale];
    expect(Object.keys(copy.pages).sort()).toEqual(
      Object.keys(PUBLIC_ROUTE_PATHS).sort(),
    );
    expect(copy.pages.privacy.sections.length).toBeGreaterThanOrEqual(10);
    expect(copy.pages.terms.sections.length).toBeGreaterThanOrEqual(10);
    for (const page of Object.values(copy.pages)) {
      expect(page.title.trim()).not.toBe('');
      expect(page.summary.trim()).not.toBe('');
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  test('maps every canonical public URL to a generated page', () => {
    const urlPaths = new Set(
      Object.values(PUBLIC_URLS).map((url) => new URL(url).pathname),
    );
    expect(urlPaths).toEqual(
      new Set([
        PUBLIC_ROUTE_PATHS.privacy,
        PUBLIC_ROUTE_PATHS.terms,
        PUBLIC_ROUTE_PATHS.choices,
        PUBLIC_ROUTE_PATHS.deletion,
        PUBLIC_ROUTE_PATHS.support,
      ]),
    );
    for (const path of urlPaths) {
      const html = readFileSync(
        join(process.cwd(), 'public', path.slice(1), 'index.html'),
        'utf8',
      );
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('data-route=');
    }
  });

  test('offers a prominent external account-deletion request', () => {
    for (const locale of PUBLIC_LOCALES) {
      const page = PUBLIC_SITE_COPY[locale].pages.deletion;
      expect(page.action?.href).toMatch(/^mailto:hyo@hyo\.dev/);
      expect(page.sections.length).toBeGreaterThanOrEqual(4);
    }
  });

  test('serves the signed native invite-link associations', () => {
    const apple = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'public',
          '.well-known',
          'apple-app-site-association',
        ),
        'utf8',
      ),
    ) as {
      applinks: {details: {appIDs: string[]; components: unknown[]}[]};
    };
    expect(apple.applinks.details).toEqual([
      expect.objectContaining({
        appIDs: ['PRDQGB267K.dev.hyo.bookoo'],
        components: [expect.objectContaining({'/': '/invite/*'})],
      }),
    ]);

    const android = JSON.parse(
      readFileSync(
        join(process.cwd(), 'public', '.well-known', 'assetlinks.json'),
        'utf8',
      ),
    ) as {
      target: {
        package_name: string;
        sha256_cert_fingerprints: string[];
      };
    }[];
    expect(android).toHaveLength(1);
    expect(android[0]?.target.package_name).toBe('dev.hyo.bookoo');
    expect(android[0]?.target.sha256_cert_fingerprints).toEqual([
      '1D:EC:04:47:8F:4C:4F:8D:8A:4A:9D:60:0A:DE:3C:73:12:69:F9:3A:D6:F9:9B:1B:21:6B:D8:89:A2:6B:98:E7',
      'A1:86:1E:6C:45:25:63:64:F5:27:1D:7A:A9:76:95:9D:77:70:40:F2:3C:AD:14:39:55:16:A6:8A:B9:A4:B1:01',
      'C0:EB:CC:84:8F:67:89:B5:B1:E2:2F:42:38:BC:7A:EB:BA:6B:77:DD:75:CE:63:81:4B:BA:79:B8:51:11:49:AA',
    ]);
    for (const fingerprint of android[0]?.target.sha256_cert_fingerprints ?? [])
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  test('keeps a custom-scheme fallback on the invite landing page', () => {
    const invite = readFileSync(
      join(process.cwd(), 'public', 'invite', 'index.html'),
      'utf8',
    );
    expect(invite).toContain('id="open-in-app"');
    expect(invite).toContain('href="bookoo://invite"');

    const siteScript = readFileSync(
      join(process.cwd(), 'public', 'assets', 'site.js'),
      'utf8',
    );
    expect(siteScript).toContain(
      "'bookoo://invite/' + encodeURIComponent(code)",
    );
  });
});
