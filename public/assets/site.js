(() => {
  const supported = ["ko","en","ja","zh","id"];
  const paths = {"ko":{"home":"/","privacy":"/legal/privacy","terms":"/legal/terms","versions":"/legal/versions","choices":"/privacy-choices","deletion":"/account-deletion","support":"/support","invite":"/invite"},"en":{"home":"/en","privacy":"/en/legal/privacy","terms":"/en/legal/terms","versions":"/en/legal/versions","choices":"/en/privacy-choices","deletion":"/en/account-deletion","support":"/en/support","invite":"/invite"},"ja":{"home":"/ja","privacy":"/ja/legal/privacy","terms":"/ja/legal/terms","versions":"/ja/legal/versions","choices":"/ja/privacy-choices","deletion":"/ja/account-deletion","support":"/ja/support","invite":"/invite"},"zh":{"home":"/zh-Hans","privacy":"/zh-Hans/legal/privacy","terms":"/zh-Hans/legal/terms","versions":"/zh-Hans/legal/versions","choices":"/zh-Hans/privacy-choices","deletion":"/zh-Hans/account-deletion","support":"/zh-Hans/support","invite":"/invite"},"id":{"home":"/id","privacy":"/id/legal/privacy","terms":"/id/legal/terms","versions":"/id/legal/versions","choices":"/id/privacy-choices","deletion":"/id/account-deletion","support":"/id/support","invite":"/invite"}};
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
  const navKeys = ["home","privacy","terms","choices","deletion","support"];
  document.querySelectorAll('nav a').forEach((node, index) => { const key = navKeys[index]; node.textContent = copy.navigation[key]; node.href = localizedPath(key); });
  document.querySelectorAll('[data-lang-link]').forEach((node) => { node.setAttribute('aria-current', node.dataset.langLink === locale ? 'true' : 'false'); });
  const invite = document.querySelector('#invite-code');
  if (invite) { const prefix = document.querySelector('.invite-code strong'); const parts = window.location.pathname.split('/').filter(Boolean); const code = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : ''; prefix.textContent = copy.inviteCodeLabel + ':'; invite.textContent = code || '—'; const openInApp = document.querySelector('#open-in-app'); if (openInApp) { openInApp.textContent = copy.inviteOpenLabel; openInApp.href = code ? 'bookoo://invite/' + encodeURIComponent(code) : 'bookoo://invite/code'; } }
})();
