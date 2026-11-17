import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sha256 as nobleSha256} from '@noble/hashes/sha2.js';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils.js';

import {
  canonicalDocumentText,
  PUBLIC_LOCALES,
  PUBLIC_ROUTE_PATHS,
  PUBLIC_SITE_COPY,
  type PublicLocale,
  type PublicPage,
  type PublicRoute,
} from './public-site/content';
import {
  APP_STORE_URL,
  DISCOVERY_COPY,
  DISCOVERY_LOCALES,
  discoveryPage,
  discoveryPath,
  PLAY_STORE_URL,
  SITE_ORIGIN,
  type DiscoveryLocale,
} from './public-site/discovery';

import {CAPTURE_LOCALE, PRESENTATION} from './public-site/presentation';

const ROOT = process.cwd();
const PUBLIC_ROOT = join(ROOT, 'public');
const checkOnly = process.argv.includes('--check');
const APPLE_APP_ID = 'PRDQGB267K.dev.hyo.bookoo';
const ANDROID_PACKAGE = 'dev.hyo.bookoo';
const ANDROID_CERTIFICATE_FINGERPRINTS = [
  // Local debug identity used for emulator and connected-device verification.
  '1D:EC:04:47:8F:4C:4F:8D:8A:4A:9D:60:0A:DE:3C:73:12:69:F9:3A:D6:F9:9B:1B:21:6B:D8:89:A2:6B:98:E7',
  // EAS local release/upload identity. Add Google Play's separate app-signing
  // identity separately because Play re-signs the artifact it distributes.
  'A1:86:1E:6C:45:25:63:64:F5:27:1D:7A:A9:76:95:9D:77:70:40:F2:3C:AD:14:39:55:16:A6:8A:B9:A4:B1:01',
  // Google Play App Signing identity shown by Play Console for dev.hyo.bookoo.
  'C0:EB:CC:84:8F:67:89:B5:B1:E2:2F:42:38:BC:7A:EB:BA:6B:77:DD:75:CE:63:81:4B:BA:79:B8:51:11:49:AA',
] as const;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const hrefFor = (value: string): string => {
  if (value.startsWith('https://') || value.startsWith('/')) return value;
  return '#';
};

const listItem = (value: string, locale: PublicLocale): string => {
  const route = (Object.keys(PUBLIC_ROUTE_PATHS) as PublicRoute[]).find(
    (key) => PUBLIC_ROUTE_PATHS[key] === value,
  );
  const href =
    route === undefined ? hrefFor(value) : localizedPath(route, locale);
  return href === '#'
    ? `<li>${escapeHtml(value)}</li>`
    : `<li><a href="${escapeHtml(href)}">${escapeHtml(value)}</a></li>`;
};

const renderPage = (page: PublicPage, locale: PublicLocale = 'ko'): string =>
  page.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2>` +
        section.paragraphs
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join('') +
        (section.bullets === undefined
          ? ''
          : `<ul>${section.bullets.map((value) => listItem(value, locale)).join('')}</ul>`) +
        '</section>',
    )
    .join('');

const routeOutput = (route: PublicRoute): string => {
  const path = PUBLIC_ROUTE_PATHS[route];
  if (path === '/') return 'index.html';
  return join(path.slice(1), 'index.html');
};

const navRoutes = [
  'home',
  'privacy',
  'terms',
  'choices',
  'deletion',
  'support',
] as const;

const localizedPath = (route: PublicRoute, locale: PublicLocale): string => {
  const path = PUBLIC_ROUTE_PATHS[route];
  if (locale === 'ko' || route === 'invite') return path;
  return '/' + DISCOVERY_COPY[locale].lang + (path === '/' ? '' : path);
};

const alternateLinks = (
  paths: readonly {lang: string; path: string}[],
): string =>
  paths
    .map(
      ({lang, path}) =>
        `<link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}${path}">`,
    )
    .join('\n  ');

const homepageAlternates = DISCOVERY_LOCALES.map((locale) => ({
  lang: DISCOVERY_COPY[locale].lang,
  path: discoveryPath(locale),
}));
const legalAlternates = (route: PublicRoute): {lang: string; path: string}[] =>
  PUBLIC_LOCALES.map((locale) => ({
    lang: DISCOVERY_COPY[locale].lang,
    path: localizedPath(route, locale),
  }));

const globe =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const apple =
  '<svg viewBox="0 0 24 28" fill="currentColor" aria-hidden="true"><path d="M17.8 14.7c0-3 2.5-4.5 2.6-4.6-1.4-2.1-3.6-2.4-4.4-2.4-1.8-.2-3.6 1.1-4.5 1.1s-2.3-1.1-3.8-1c-2 0-3.8 1.2-4.8 2.9-2 3.5-.5 8.8 1.4 11.6.9 1.4 2 2.9 3.5 2.9s2-1 3.9-1 2.4 1 4 1 2.5-1.4 3.4-2.8c1.1-1.6 1.6-3.2 1.7-3.3-.1 0-3-1.1-3-4.4zM14.9 5.9c.8-1 1.4-2.4 1.2-3.9-1.2.1-2.7.8-3.6 1.8-.8.9-1.5 2.3-1.3 3.7 1.4.1 2.8-.7 3.7-1.6z"/></svg>';
const play =
  '<svg viewBox="0 0 26 28" aria-hidden="true"><path fill="#5bc9f4" d="M2 1.5 15 14 2 26.5z"/><path fill="#8cda84" d="m2 1.5 16.5 9.2L15 14z"/><path fill="#ffda64" d="m18.5 10.7 5.3 2.9c.4.2.4.6 0 .8l-5.3 2.9L15 14z"/><path fill="#fa7778" d="m2 26.5 16.5-9.2L15 14z"/></svg>';
const storeLinks = (locale: DiscoveryLocale): string => {
  const label = escapeHtml(DISCOVERY_COPY[locale].downloadLabel);
  return `<div class="store-links"><a class="store-link" href="${APP_STORE_URL}" aria-label="${label} — App Store">${apple}<span><small>${label}</small><strong>App Store</strong></span></a><a class="store-link" href="${PLAY_STORE_URL}" aria-label="${label} — Google Play">${play}<span><small>${label}</small><strong>Google Play</strong></span></a></div>`;
};
const appScreen = (
  locale: DiscoveryLocale,
  kind: 'calendar' | 'timeline' | 'stats' | 'comments',
  secondary = false,
): string => {
  const eager = kind === 'calendar';
  return `<div class="phone${secondary ? ' secondary' : ''}"><div class="screen-crop ${kind}"><img src="/assets/screens/${CAPTURE_LOCALE[locale]}-${kind}.png" alt="${escapeHtml(PRESENTATION[locale].screenLabel)} — ${escapeHtml(kind === 'stats' ? PRESENTATION[locale].calendarTitle.replaceAll('\n', ' ') : kind === 'comments' ? PRESENTATION[locale].togetherTitle.replaceAll('\n', ' ') : DISCOVERY_COPY[locale].featureTitle)}" width="1080" height="${kind === 'stats' ? 2424 : 2640}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div></div>`;
};
const lines = (value: string): string =>
  escapeHtml(value).replaceAll('\n', '<br>');

const homeHtmlFor = (locale: DiscoveryLocale): string => {
  const copy = DISCOVERY_COPY[locale];
  const page = discoveryPage(locale);
  const design = PRESENTATION[locale];
  const canonical = SITE_ORIGIN + discoveryPath(locale);
  const legalLocale = PUBLIC_LOCALES.find((value) => value === locale) ?? 'en';
  const faq = page.sections.slice(1).map((section) => ({
    '@type': 'Question',
    name: section.heading,
    acceptedAnswer: {'@type': 'Answer', text: section.paragraphs.join(' ')},
  }));
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': SITE_ORIGIN + '/#website',
        name: 'BooKoo',
        alternateName: '부쿠',
        url: SITE_ORIGIN,
        inLanguage: DISCOVERY_LOCALES.map(
          (value) => DISCOVERY_COPY[value].lang,
        ),
      },
      {
        '@type': 'SoftwareApplication',
        '@id': canonical + '#app',
        name: 'BooKoo',
        alternateName: '부쿠',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Android, iOS',
        description: copy.summary,
        url: canonical,
        inLanguage: copy.lang,
        downloadUrl: [APP_STORE_URL, PLAY_STORE_URL],
        image: SITE_ORIGIN + '/assets/icon.png',
        publisher: {
          '@type': 'Organization',
          name: 'hyo.dev',
          url: 'https://hyo.dev',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': canonical + '#questions',
        url: canonical,
        inLanguage: copy.lang,
        mainEntity: faq,
      },
    ],
  }).replaceAll('<', '\\u003c');
  const languages = DISCOVERY_LOCALES.map(
    (value) =>
      `<a href="${discoveryPath(value)}" lang="${DISCOVERY_COPY[value].lang}" hreflang="${DISCOVERY_COPY[value].lang}" data-lang-link="${value}"${value === locale ? ' aria-current="true"' : ''}>${escapeHtml(DISCOVERY_COPY[value].languageName)}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="${copy.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#1DD3A9">
  <meta name="description" content="${escapeHtml(copy.summary)}">
  <link rel="canonical" href="${canonical}">
  ${alternateLinks(homepageAlternates)}
  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/">
  <meta property="og:title" content="${escapeHtml(copy.title)}">
  <meta property="og:description" content="${escapeHtml(copy.summary)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/icon.png">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${schema}</script>
  <title>${escapeHtml(copy.title)}</title>
  <link rel="icon" href="/assets/favicon.png">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body data-route="home" data-locale="${locale}">
  <a class="skip" href="#content">${escapeHtml(copy.skipLabel)}</a>
  <header><a class="brand" href="${discoveryPath(locale)}" aria-label="BooKoo"><img src="/assets/wordmark.png" alt="BooKoo" width="200" height="61"></a><nav aria-label="BooKoo"><a class="support-nav" href="${localizedPath('support', legalLocale)}">${escapeHtml(copy.supportLabel)}</a><a class="language-jump" href="#languages" aria-label="${escapeHtml(copy.languageLabel)} — ${escapeHtml(copy.languageName)}">${globe}<span class="language-name">${escapeHtml(copy.languageName)}</span></a><a class="nav-download" href="#download">${escapeHtml(copy.downloadLabel)}<span aria-hidden="true">↗</span></a></nav></header>
  <main id="content">
    <section class="home-hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">${locale === 'ko' ? 'BooKoo · 부쿠' : 'BooKoo'}</p><h1 id="hero-title">${design.headline.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</h1><p class="hero-intro">${escapeHtml(design.intro)}</p>${storeLinks(locale)}</div><div class="hero-art"><div class="art-rule"><span>BooKoo / 01</span><span>iOS &amp; ANDROID</span></div>${appScreen(locale, 'calendar')}${appScreen(locale, 'timeline', true)}<div class="art-caption"><span>${escapeHtml(design.screenLabel)}</span><span>01 — 02</span></div></div></section>
    <section class="intro-band wrap"><div class="section-kicker"><span>01 /</span> ${escapeHtml(design.storyLabel)}</div><div><h2>${escapeHtml(copy.featureTitle)}</h2><p>${escapeHtml(copy.featureText)}</p></div></section>
    <section class="product-story wrap"><div class="story-art">${appScreen(locale, 'stats')}</div><div class="story-copy"><div class="section-kicker"><span>02 /</span> BooKoo</div><h2>${lines(design.calendarTitle)}</h2><p>${escapeHtml(design.calendarText)}</p></div></section>
    <div class="story-dark"><section class="product-story wrap"><div class="story-art">${appScreen(locale, 'comments')}</div><div class="story-copy"><div class="section-kicker"><span>03 /</span> BooKoo</div><h2>${lines(design.togetherTitle)}</h2><p>${escapeHtml(design.togetherText)}</p></div></section></div>
    <section id="questions" class="faq-section wrap"><div><p class="section-kicker"><span>04 /</span> FAQ</p><h2>${escapeHtml(design.questionsLabel)}</h2></div><div class="faq-list">${page.sections
      .slice(1)
      .map(
        (section, index) =>
          `<details${index === 0 ? ' open' : ''}><summary>${escapeHtml(section.heading)}</summary>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</details>`,
      )
      .join('')}</div></section>
    <section class="closing" id="download" aria-label="${escapeHtml(copy.downloadLabel)}"><div class="wrap"><h2>${lines(design.closing)}</h2>${storeLinks(locale)}</div></section>
    <section class="languages wrap" id="languages" aria-labelledby="language-title"><h2 id="language-title">${escapeHtml(copy.languageLabel)}</h2><div>${languages}</div></section>
    <aside class="controlling home-notice">${escapeHtml(copy.legalNotice)}</aside>
  </main>
  <footer><span>© 2026 BooKoo · hyo.dev</span><div class="footer-links"><a href="${localizedPath('privacy', legalLocale)}">${escapeHtml(copy.privacyLabel)}</a><a href="${localizedPath('terms', legalLocale)}">${escapeHtml(copy.termsLabel)}</a><a href="https://github.com/hyodotdev/BooKoo">GitHub</a><a href="mailto:hyo@hyo.dev">hyo@hyo.dev</a></div></footer>
  <script src="/assets/home.js" defer></script>
</body>
</html>
`;
};

const htmlFor = (route: PublicRoute, locale: PublicLocale = 'ko'): string => {
  if (route === 'home') return homeHtmlFor(locale);
  const copy = PUBLIC_SITE_COPY[locale];
  const page: PublicPage = copy.pages[route];
  const canonical = SITE_ORIGIN + localizedPath(route, locale);
  const action =
    page.action === undefined
      ? ''
      : `<p class="action"><a href="${escapeHtml(page.action.href)}">${escapeHtml(page.action.label)}</a></p>`;
  const inviteCode =
    route === 'invite'
      ? `<p class="invite-code"><strong>${escapeHtml(copy.inviteCodeLabel)}:</strong> <span id="invite-code">—</span></p><p class="action"><a id="open-in-app" href="bookoo://invite">${escapeHtml(copy.inviteOpenLabel)}</a></p>`
      : '';
  const navigation = navRoutes
    .map(
      (key) =>
        `<a href="${localizedPath(key, locale)}"${key === route ? ' aria-current="page"' : ''}>${escapeHtml(copy.navigation[key])}</a>`,
    )
    .join('');
  const languages = PUBLIC_LOCALES.map(
    (value) =>
      `<a href="${route === 'invite' ? '/invite?lang=' + value : localizedPath(route, value)}" data-lang-link="${value}" lang="${DISCOVERY_COPY[value].lang}"${value === locale ? ' aria-current="true"' : ''}>${escapeHtml(PUBLIC_SITE_COPY[value].languageName)}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="${DISCOVERY_COPY[locale].lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#1DD3A9">
  <meta name="description" content="${escapeHtml(page.summary)}">
  <link rel="canonical" href="${canonical}">
  ${route === 'invite' ? '<meta name="robots" content="noindex,follow">' : alternateLinks(legalAlternates(route)) + `\n  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${PUBLIC_ROUTE_PATHS[route]}">`}
  <meta property="og:title" content="${escapeHtml(page.title)} · BooKoo">
  <meta property="og:description" content="${escapeHtml(page.summary)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <title>${escapeHtml(page.title)} · BooKoo</title>
  <link rel="icon" href="/assets/favicon.png">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body data-route="${route}" data-locale="${locale}">
  <a class="skip" href="#content">${escapeHtml(DISCOVERY_COPY[locale].skipLabel)}</a>
  <header>
    <a class="brand" href="${discoveryPath(locale)}"><img src="/assets/wordmark.png" alt="BooKoo" width="200" height="61"><span><small>${escapeHtml(copy.tagline)}</small></span></a>
    <nav aria-label="BooKoo">${navigation}</nav>
  </header>
  <main id="content">
    <div class="hero"><p class="eyebrow">${escapeHtml(copy.appName)}</p><h1>${escapeHtml(page.title)}</h1><p class="summary">${escapeHtml(page.summary)}</p><p class="effective">${escapeHtml(copy.effectiveLabel)}: ${escapeHtml(copy.effectiveDate)}</p></div>
    ${inviteCode}<div id="page-sections">${renderPage(page, locale)}</div>${action}
    <aside class="controlling" id="controlling-notice">${escapeHtml(copy.controllingNotice)}</aside>
    <section class="languages" aria-labelledby="language-title"><h2 id="language-title">${escapeHtml(copy.languageLabel)}</h2><div>${languages}</div></section>
  </main>
  <footer><span>© 2026 hyo.dev</span><a href="${localizedPath('versions', locale)}">${escapeHtml(copy.pages.versions.title)}</a><a href="https://github.com/hyodotdev/BooKoo">GitHub</a><a href="mailto:hyo@hyo.dev">hyo@hyo.dev</a></footer>
  <script src="/assets/content.js" defer></script><script src="/assets/site.js" defer></script>
</body>
</html>
`.replaceAll(/^[ \t]+$/gm, '');
};

const css = readFileSync(join(ROOT, 'scripts/public-site/site.css'), 'utf8');

const browserScript = `(() => {
  const supported = ${JSON.stringify(PUBLIC_LOCALES)};
  const paths = ${JSON.stringify(Object.fromEntries(PUBLIC_LOCALES.map((locale) => [locale, Object.fromEntries(Object.keys(PUBLIC_ROUTE_PATHS).map((route) => [route, localizedPath(route as PublicRoute, locale)]))])))};
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('lang');
  const route = document.body.dataset.route;
  const remember = (value) => { try { window.localStorage.setItem('bookoo.lang', value); } catch (error) {} };
  const stored = (() => { try { return window.localStorage.getItem('bookoo.lang'); } catch (error) { return null; } })();
  document.addEventListener('click', (event) => { const link = event.target && event.target.closest ? event.target.closest('[data-lang-link]') : null; if (link) remember(link.dataset.langLink); });
  const browser = (navigator.languages || [navigator.language || 'ko']).map((value) => value.toLowerCase().split('-')[0]);
  if (route !== 'invite') {
    if (supported.includes(requested)) { remember(requested); window.location.replace(paths[requested][route] + window.location.hash); return; }
    const bot = /bot|crawl|spider|slurp|preview|scrap|lighthouse/i.test(navigator.userAgent || '');
    const preferred = supported.includes(stored) ? stored : browser.find((value) => supported.includes(value));
    if (!bot && document.body.dataset.locale === 'ko' && preferred && preferred !== 'ko') window.location.replace(paths[preferred][route] + window.location.hash);
    return;
  }
  const locale = supported.includes(requested) ? requested : (browser.find((value) => supported.includes(value)) || 'ko');
  const localizedPath = (key) => paths[locale][key];
  const copy = window.__BOOKOO_COPY__[locale];
  const page = copy.pages[route];
  const esc = (value) => { const span = document.createElement('span'); span.textContent = value; return span.innerHTML; };
  const link = (value) => value.startsWith('https://') || value.startsWith('/') ? '<a href="' + esc(value) + '">' + esc(value) + '</a>' : esc(value);
  const sections = page.sections.map((section) => '<section><h2>' + esc(section.heading) + '</h2>' + section.paragraphs.map((p) => '<p>' + esc(p) + '</p>').join('') + (section.bullets ? '<ul>' + section.bullets.map((item) => '<li>' + link(item) + '</li>').join('') + '</ul>' : '') + '</section>').join('');
  document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : locale;
  document.title = page.title + ' · BooKoo';
  document.querySelector('meta[name=description]').content = page.summary;
  document.querySelector('h1').textContent = page.title;
  document.querySelector('.summary').textContent = page.summary;
  document.querySelector('.effective').textContent = copy.effectiveLabel + ': ' + copy.effectiveDate;
  document.querySelector('.brand small').textContent = copy.tagline;
  document.querySelector('#page-sections').innerHTML = sections;
  document.querySelector('#controlling-notice').textContent = copy.controllingNotice;
  document.querySelector('#language-title').textContent = copy.languageLabel;
  const action = document.querySelector('.action a');
  if (action && page.action) { action.textContent = page.action.label; action.href = page.action.href; }
  const navKeys = ${JSON.stringify(navRoutes)};
  document.querySelectorAll('nav a').forEach((node, index) => { const key = navKeys[index]; node.textContent = copy.navigation[key]; node.href = localizedPath(key); });
  document.querySelectorAll('[data-lang-link]').forEach((node) => { node.setAttribute('aria-current', node.dataset.langLink === locale ? 'true' : 'false'); });
  const invite = document.querySelector('#invite-code');
  if (invite) { const prefix = document.querySelector('.invite-code strong'); const parts = window.location.pathname.split('/').filter(Boolean); const code = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : ''; prefix.textContent = copy.inviteCodeLabel + ':'; invite.textContent = code || '—'; const openInApp = document.querySelector('#open-in-app'); if (openInApp) { openInApp.textContent = copy.inviteOpenLabel; openInApp.href = code ? 'bookoo://invite/' + encodeURIComponent(code) : 'bookoo://invite/code'; } }
})();
`;

const homeScript = `(() => {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const paths = ${JSON.stringify(Object.fromEntries(DISCOVERY_LOCALES.map((locale) => [locale, discoveryPath(locale)])))};
  const remember = (value) => { try { window.localStorage.setItem('bookoo.lang', value); } catch (error) {} };
  const stored = (() => { try { return window.localStorage.getItem('bookoo.lang'); } catch (error) { return null; } })();
  document.addEventListener('click', (event) => { const link = event.target && event.target.closest ? event.target.closest('[data-lang-link]') : null; if (link) remember(link.dataset.langLink); });
  if (requested && Object.hasOwn(paths, requested)) { remember(requested); window.location.replace(paths[requested] + window.location.hash); return; }
  if (document.body.dataset.locale !== 'ko' || /bot|crawl|spider|slurp|preview|scrap|lighthouse/i.test(navigator.userAgent || '')) return;
  const pick = (tag) => { const value = String(tag).toLowerCase(); if (value.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(value) ? 'zh-Hant' : 'zh'; const primary = value.split('-')[0]; return Object.hasOwn(paths, primary) ? primary : undefined; };
  const preferred = stored && Object.hasOwn(paths, stored) ? stored : (navigator.languages || [navigator.language || 'ko']).map(pick).find(Boolean);
  if (preferred && preferred !== 'ko') window.location.replace(paths[preferred] + window.location.hash);
})();\n`;

const contentScript =
  `window.__BOOKOO_COPY__=${JSON.stringify(PUBLIC_SITE_COPY).replaceAll('<', '\\u003c')};\n` +
  `window.__BOOKOO_PATHS__=${JSON.stringify(PUBLIC_ROUTE_PATHS)};\n`;

const sitemapPages = [
  ...homepageAlternates.map(({path}) => ({
    path,
    alternates: homepageAlternates,
    fallback: '/',
  })),
  ...Object.keys(PUBLIC_ROUTE_PATHS)
    .filter((route) => route !== 'home' && route !== 'invite')
    .flatMap((route) =>
      legalAlternates(route as PublicRoute).map(({path}) => ({
        path,
        alternates: legalAlternates(route as PublicRoute),
        fallback: PUBLIC_ROUTE_PATHS[route as PublicRoute],
      })),
    ),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapPages.map(({path, alternates, fallback}) => `  <url><loc>${SITE_ORIGIN}${path}</loc>${alternates.map((alternate) => `<xhtml:link rel="alternate" hreflang="${alternate.lang}" href="${SITE_ORIGIN}${alternate.path}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${fallback}"/></url>`).join('\n')}
</urlset>
`;

const appleAppSiteAssociation = `${JSON.stringify(
  {
    applinks: {
      details: [
        {
          appIDs: [APPLE_APP_ID],
          components: [
            {
              '/': '/invite/*',
              comment: 'Open BooKoo ledger invitations in the installed app.',
            },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

const androidAssetLinks = `${JSON.stringify(
  [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_CERTIFICATE_FINGERPRINTS,
      },
    },
  ],
  null,
  2,
)}\n`;

const sha256 = (value: string): string =>
  bytesToHex(nobleSha256(utf8ToBytes(value)));

const artifacts = new Map<string, string>([
  ...Object.keys(PUBLIC_ROUTE_PATHS).map(
    (route) =>
      [
        routeOutput(route as PublicRoute),
        htmlFor(route as PublicRoute),
      ] as const,
  ),
  ...DISCOVERY_LOCALES.filter((locale) => locale !== 'ko').map(
    (locale) =>
      [
        join(discoveryPath(locale).slice(1), 'index.html'),
        homeHtmlFor(locale),
      ] as const,
  ),
  ...PUBLIC_LOCALES.filter((locale) => locale !== 'ko').flatMap((locale) =>
    Object.keys(PUBLIC_ROUTE_PATHS)
      .filter((route) => route !== 'home' && route !== 'invite')
      .map(
        (route) =>
          [
            join(
              localizedPath(route as PublicRoute, locale).slice(1),
              'index.html',
            ),
            htmlFor(route as PublicRoute, locale),
          ] as const,
      ),
  ),
  [
    '404.html',
    homeHtmlFor('ko').replace(
      '<meta name="description"',
      '<meta name="robots" content="noindex,follow">\n  <meta name="description"',
    ),
  ],
  ['assets/home.js', homeScript],
  ['assets/site.css', css],
  ['assets/site.js', browserScript],
  ['assets/content.js', contentScript],
  [
    'robots.txt',
    'User-agent: *\nAllow: /\nSitemap: https://bookoo.hyo.dev/sitemap.xml\n',
  ],
  ['sitemap.xml', sitemap],
  ['.well-known/apple-app-site-association', appleAppSiteAssociation],
  ['.well-known/assetlinks.json', androidAssetLinks],
  [
    'legal/hashes.json',
    `${JSON.stringify(
      {
        version: PUBLIC_SITE_COPY.ko.effectiveDate,
        termsSha256: sha256(canonicalDocumentText('ko', 'terms')),
        privacySha256: sha256(canonicalDocumentText('ko', 'privacy')),
      },
      null,
      2,
    )}\n`,
  ],
]);

const mismatches: string[] = [];
// One generated, dependency-free Vercel function; shared normalization stays
// authoritative and is bundled into the deploy root rather than copied by hand.
const countryApi = spawnSync(
  'bun',
  [
    'build',
    'scripts/public-site/country-api.ts',
    '--target=node',
    '--format=esm',
  ],
  {cwd: ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024},
);
if (countryApi.status !== 0 || countryApi.stdout.length === 0)
  throw new Error('Country API generation failed');
artifacts.set('api/activity-country.mjs', countryApi.stdout);
for (const [relativePath, contents] of artifacts) {
  const absolutePath = join(PUBLIC_ROOT, relativePath);
  if (checkOnly) {
    if (
      !existsSync(absolutePath) ||
      readFileSync(absolutePath, 'utf8') !== contents
    )
      mismatches.push(relativePath);
    continue;
  }
  mkdirSync(dirname(absolutePath), {recursive: true});
  writeFileSync(absolutePath, contents);
}

const assetCopies = [
  ['assets/favicon.png', 'assets/favicon.png'],
  ['assets/icon.png', 'assets/icon.png'],
  ['assets/brand/logo@3x.png', 'assets/wordmark.png'],
  [
    'scripts/public-site/fonts/PretendardVariable.woff2',
    'assets/fonts/PretendardVariable.woff2',
  ],
  ['scripts/public-site/fonts/OFL.txt', 'assets/fonts/OFL.txt'],
  ...['ko-KR', 'en-US', 'ja', 'zh-CN', 'id'].flatMap((locale) =>
    ['calendar', 'timeline', 'stats', 'comments'].map((kind) => [
      `store-assets/marketing/2026-10-09-v1.1.0/sources/${locale}-${kind}.png`,
      `assets/screens/${locale}-${kind}.png`,
    ]),
  ),
];
for (const [source, destination] of assetCopies) {
  const target = join(PUBLIC_ROOT, destination);
  if (checkOnly) {
    if (
      !existsSync(target) ||
      !readFileSync(join(ROOT, source)).equals(readFileSync(target))
    )
      mismatches.push(destination);
  } else {
    mkdirSync(dirname(target), {recursive: true});
    copyFileSync(join(ROOT, source), target);
  }
}
if (mismatches.length > 0)
  throw new Error(
    `public site is not generated from source:\n- ${mismatches.join('\n- ')}`,
  );
process.stdout.write(
  `${checkOnly ? 'verified' : 'generated'} ${artifacts.size} public site files and ${assetCopies.length} source assets\n`,
);
