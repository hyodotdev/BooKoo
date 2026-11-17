/** @jest-environment jsdom */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {URL, URLSearchParams} from 'node:url';
import {runInNewContext} from 'node:vm';

import storeLocales from '../../store-assets/store-locales.json';

const origin = 'https://bookoo.hyo.dev';
// Independent URL/language/search-term expectations, not renderer output.
const pages = [
  ['/', 'ko', '가계부'],
  ['/en', 'en', 'Expense Tracker'],
  ['/ja', 'ja', '家計簿'],
  ['/zh-Hans', 'zh-Hans', '记账'],
  ['/zh-Hant', 'zh-Hant', '記帳'],
  ['/id', 'id', 'Buku Kas'],
  ['/de', 'de', 'Kassenbuch'],
  ['/es', 'es', 'gastos'],
  ['/fr', 'fr', 'comptes'],
  ['/it', 'it', 'spese'],
  ['/nl', 'nl', 'kasboek'],
  ['/pt', 'pt', 'contas'],
  ['/vi', 'vi', 'thu chi'],
] as const;

const htmlAt = (path: string): string =>
  readFileSync(
    join(process.cwd(), 'public', path.slice(1), 'index.html'),
    'utf8',
  );

describe('multilingual search discovery', () => {
  test('covers every canonical store-copy language', () => {
    expect(pages).toHaveLength(Object.keys(storeLocales).length);
  });

  test.each(pages)(
    '%s is localized without running JavaScript',
    (path, lang, term) => {
      const html = htmlAt(path);
      const body = html.split('<body')[1].split('<script')[0];
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(`<link rel="canonical" href="${origin}${path}">`);
      expect(html.match(/<title>[^<]+<\/title>/)?.[0]).toContain(term);
      const heading = html
        .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
        .replace(/<[^>]*>/g, '');
      expect(heading?.trim().length).toBeGreaterThan(5);
      expect(body.toLowerCase()).toContain(term.toLowerCase());
      expect(body).toContain('https://apps.apple.com/app/id6805969489');
      expect(body).toContain(
        'https://play.google.com/store/apps/details?id=dev.hyo.bookoo',
      );
      expect(html).not.toContain('content="noindex');
      for (const [alternatePath, alternateLang] of pages) {
        expect(html).toContain(
          `hreflang="${alternateLang}" href="${origin}${alternatePath}"`,
        );
        expect(body).toContain(
          `href="${alternatePath}" lang="${alternateLang}"`,
        );
      }
      const schema = JSON.parse(
        html.match(
          /<script type="application\/ld\+json">(.+)<\/script>/,
        )?.[1] ?? '{}',
      ) as {
        '@graph': {
          '@type': string;
          mainEntity?: {name: string; acceptedAnswer: {text: string}}[];
        }[];
      };
      const faq = schema['@graph'].find((node) => node['@type'] === 'FAQPage');
      expect(faq?.mainEntity).toHaveLength(3);
      // Decode HTML text for a visible-answer/structured-answer consistency check.
      const visibleText = body
        .replace(/<[^>]*>/g, '')
        .replaceAll('&amp;', '&')
        .replaceAll('&#039;', "'")
        .replaceAll('&quot;', '"');
      for (const answer of faq?.mainEntity ?? []) {
        expect(visibleText).toContain(answer.name);
        expect(visibleText).toContain(answer.acceptedAnswer.text);
      }
      expect(html).not.toContain('aggregateRating');
    },
  );

  test.each(['/en', '/ja', '/zh-Hans', '/id'])(
    '%s legal pages have initial translated content and their own canonical',
    (prefix) => {
      for (const route of [
        '/legal/privacy',
        '/legal/terms',
        '/support',
        '/account-deletion',
        '/privacy-choices',
        '/legal/versions',
      ]) {
        const path = prefix + route;
        const html = htmlAt(path);
        expect(html).toContain(`<html lang="${prefix.slice(1)}">`);
        expect(html).toContain(`rel="canonical" href="${origin}${path}"`);
        expect(html).not.toContain('<h1>개인정보처리방침</h1>');
      }
    },
  );

  test('lists only real canonical pages, with reciprocal language alternatives', () => {
    const xml = readFileSync(
      join(process.cwd(), 'public', 'sitemap.xml'),
      'utf8',
    );
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(urls).toHaveLength(43);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url).not.toContain('?');
      expect(url).not.toContain('/invite');
      expect(htmlAt(new URL(url).pathname)).toContain(
        `rel="canonical" href="${url}"`,
      );
    }
    expect(htmlAt('/invite')).toContain(
      'name="robots" content="noindex,follow"',
    );
  });

  const homeScript = readFileSync(
    join(process.cwd(), 'public', 'assets', 'home.js'),
    'utf8',
  );
  const runHome = ({
    search = '',
    languages = ['ko-KR'],
    locale = 'ko',
    stored = null,
    userAgent = 'Mozilla/5.0',
  }: {
    search?: string;
    languages?: string[];
    locale?: string;
    stored?: string | null;
    userAgent?: string;
  }): {replace: jest.Mock; setItem: jest.Mock} => {
    const replace = jest.fn();
    const setItem = jest.fn();
    runInNewContext(homeScript, {
      URLSearchParams,
      document: {body: {dataset: {locale}}, addEventListener: jest.fn()},
      navigator: {languages, userAgent},
      window: {
        location: {search, hash: '#download', replace},
        localStorage: {getItem: () => stored, setItem},
      },
    });
    return {replace, setItem};
  };

  test('keeps explicit legacy language links safe', () => {
    for (const search of ['?lang=https://example.com', '?lang=__proto__'])
      expect(runHome({search}).replace).not.toHaveBeenCalled();
    const explicit = runHome({search: '?lang=zh-Hant', languages: ['en-US']});
    expect(explicit.replace).toHaveBeenCalledWith('/zh-Hant#download');
    expect(explicit.setItem).toHaveBeenCalledWith('bookoo.lang', 'zh-Hant');
  });

  test.each([
    [['en-US'], '/en#download'],
    [['ja-JP', 'en'], '/ja#download'],
    [['zh-TW'], '/zh-Hant#download'],
    [['zh-CN'], '/zh-Hans#download'],
    [['fr-CA'], '/fr#download'],
    [['xx', 'de-DE'], '/de#download'],
  ])('the default home page routes browser %j to %s', (languages, path) => {
    expect(runHome({languages}).replace).toHaveBeenCalledWith(path);
  });

  test('the default home page stays Korean when it should', () => {
    expect(runHome({languages: ['ko-KR', 'en']}).replace).not.toHaveBeenCalled();
    expect(runHome({languages: ['xx']}).replace).not.toHaveBeenCalled();
    expect(
      runHome({languages: ['en-US'], stored: 'ko'}).replace,
    ).not.toHaveBeenCalled();
    expect(
      runHome({languages: ['en-US'], userAgent: 'Googlebot/2.1'}).replace,
    ).not.toHaveBeenCalled();
    expect(
      runHome({languages: ['ja-JP'], locale: 'en'}).replace,
    ).not.toHaveBeenCalled();
  });

  test('a remembered choice wins over the browser language', () => {
    expect(
      runHome({languages: ['en-US'], stored: 'ja'}).replace,
    ).toHaveBeenCalledWith('/ja#download');
  });

  test.each([
    ['/support', ['en-US'], null, '/en/support'],
    ['/legal/privacy', ['ja-JP'], null, '/ja/legal/privacy'],
    ['/account-deletion', ['zh-TW'], null, '/zh-Hans/account-deletion'],
    ['/support', ['en-US'], 'id', '/id/support'],
  ])(
    'the default %s page routes browser %j (remembered %s) to %s',
    (pathname, languages, stored, target) => {
      document.open();
      document.write(htmlAt(pathname));
      document.close();
      const replace = jest.fn();
      runInNewContext(
        readFileSync(join(process.cwd(), 'public/assets/site.js'), 'utf8'),
        {
          URLSearchParams,
          document,
          navigator: {languages, userAgent: 'Mozilla/5.0'},
          window: {
            location: {search: '', hash: '', pathname, replace},
            localStorage: {getItem: () => stored, setItem: jest.fn()},
          },
        },
      );
      expect(replace).toHaveBeenCalledWith(target);
    },
  );

  test.each([
    ['/support', ['ko-KR'], null, 'Mozilla/5.0'],
    ['/support', ['en-US'], 'ko', 'Mozilla/5.0'],
    ['/support', ['en-US'], null, 'Googlebot/2.1'],
    ['/en/support', ['ja-JP'], null, 'Mozilla/5.0'],
  ])(
    '%s stays put for browser %j, remembered %s, agent %s',
    (pathname, languages, stored, userAgent) => {
      document.open();
      document.write(htmlAt(pathname));
      document.close();
      const replace = jest.fn();
      runInNewContext(
        readFileSync(join(process.cwd(), 'public/assets/site.js'), 'utf8'),
        {
          URLSearchParams,
          document,
          navigator: {languages, userAgent},
          window: {
            location: {search: '', hash: '', pathname, replace},
            localStorage: {getItem: () => stored, setItem: jest.fn()},
          },
        },
      );
      expect(replace).not.toHaveBeenCalled();
    },
  );

  test.each(['/ja', '/zh-Hans', '/id'])(
    '%s privacy links retain the selected language before and after JavaScript',
    (prefix) => {
      document.open();
      document.write(htmlAt(prefix + '/legal/privacy'));
      document.close();
      const checkLinks = (): void => {
        const links = [...document.querySelectorAll('#page-sections a')].map(
          (node) => node.getAttribute('href'),
        );
        expect(links).toContain(prefix + '/privacy-choices');
        expect(links).toContain(prefix + '/account-deletion');
        expect(links).not.toContain('/privacy-choices');
      };
      checkLinks();
      const context = {
        URLSearchParams,
        document,
        navigator: {languages: ['en-US']},
        window: {
          location: {search: '', hash: '', pathname: prefix + '/legal/privacy'},
        },
      };
      runInNewContext(
        readFileSync(join(process.cwd(), 'public/assets/content.js'), 'utf8'),
        context,
      );
      runInNewContext(
        readFileSync(join(process.cwd(), 'public/assets/site.js'), 'utf8'),
        context,
      );
      checkLinks();
      expect(document.documentElement.lang).toBe(prefix.slice(1));
    },
  );

  test.each([
    ['en-US', 'en', ''],
    ['ja-JP', 'ja', ''],
    ['zh-TW', 'zh-Hans', ''],
    ['id-ID', 'id', ''],
    ['ja-JP', 'en', '?lang=en'],
  ])('invitation browser %s resolves to %s', (language, lang, search) => {
    document.open();
    document.write(htmlAt('/invite'));
    document.close();
    const context = {
      URLSearchParams,
      document,
      navigator: {languages: [language]},
      window: {
        location: {search, hash: '', pathname: '/invite/ABCDEF'},
      },
    };
    runInNewContext(
      readFileSync(join(process.cwd(), 'public/assets/content.js'), 'utf8'),
      context,
    );
    runInNewContext(
      readFileSync(join(process.cwd(), 'public/assets/site.js'), 'utf8'),
      context,
    );
    expect(document.documentElement.lang).toBe(lang);
    expect(document.querySelector('#invite-code')?.textContent).toBe('ABCDEF');
    expect(document.querySelector('#open-in-app')?.getAttribute('href')).toBe(
      'bookoo://invite/ABCDEF',
    );
  });
});
